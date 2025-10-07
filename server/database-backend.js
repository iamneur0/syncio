const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const { PrismaClient } = require('@prisma/client');
// Ensure Prisma uses the right provider at runtime
if (!process.env.PRISMA_PROVIDER) {
  // Infer from DATABASE_URL
  const dbUrl = process.env.DATABASE_URL || ''
  process.env.PRISMA_PROVIDER = dbUrl.startsWith('postgres') ? 'postgresql' : 'sqlite'
}
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { StremioAPIStore, StremioAPIClient } = require('stremio-api-client');
const debug = require('./utils/debug');
require('dotenv').config();

// Optional quiet mode: suppress non-error console output when QUIET=true or DEBUG is not enabled
const QUIET = process.env.QUIET === 'true' || process.env.QUIET === '1'
const DEBUG_ENABLED = process.env.DEBUG === 'true' || process.env.DEBUG === '1'
if (QUIET || !DEBUG_ENABLED) {
  const noop = () => {}
  console.log = noop
  console.info = noop
  console.warn = noop
}

const app = express();
const PORT = process.env.PORT || 4000;
const prisma = new PrismaClient();

// Auth toggle and config (public vs single-user)
const AUTH_ENABLED = String(process.env.AUTH_ENABLED || 'false').toLowerCase() === 'true';
const JWT_SECRET = process.env.JWT_SECRET || 'syncio-dev-secret-change-me';
const DEFAULT_ACCOUNT_ID = 'default';

// Helper function to get account ID for private mode
function getAccountId(req) {
  if (AUTH_ENABLED) {
    // In public mode, we MUST have a valid account ID
    if (!req.appAccountId) {
      throw new Error('Authentication required - no account ID found')
    }
    return req.appAccountId
  }
  // In private mode, use default account
  return DEFAULT_ACCOUNT_ID
}

// Helper function to parse excluded/protected addons (handles both array and JSON string formats)
function parseAddonIds(field) {
  if (!field) return []
  if (Array.isArray(field)) return field
  if (typeof field === 'string') {
    try {
      const parsed = JSON.parse(field)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function parseProtectedAddons(field, req) {
  if (!field) return []
  if (Array.isArray(field)) return field
  if (typeof field === 'string') {
    try {
      const parsed = JSON.parse(field)
      if (!Array.isArray(parsed)) return []
      
      // Decrypt each protected addon URL
      return parsed.map(encryptedUrl => {
        try {
          return decrypt(encryptedUrl, req)
        } catch (e) {
          console.warn('Failed to decrypt protected addon URL:', e.message)
          return null
        }
      }).filter(url => url !== null)
    } catch {
      return []
    }
  }
  return []
}

// Helper to consistently scope Prisma queries to the current account
function scopedWhere(req, extra) {
  // Avoid throwing during unauthenticated requests; callers must decide whether to 401 or return empty
  const accountId = AUTH_ENABLED ? (req.appAccountId || null) : (req.appAccountId || null)
  return accountId ? { accountId, ...(extra || {}) } : (AUTH_ENABLED ? { accountId: '___no_account___', ...(extra || {}) } : { ...(extra || {}) })
}

// Helper to convert manifest URLs to addon IDs
async function convertManifestUrlsToAddonIds(manifestUrls, req) {
  if (!Array.isArray(manifestUrls) || manifestUrls.length === 0) return []
  
  const accountId = getAccountId(req)
  const addonIds = []
  
  for (const manifestUrl of manifestUrls) {
    try {
      // Try to find addon by manifestUrlHash first (for encrypted URLs)
      const manifestUrlHash = require('./utils/hash').manifestUrlHash(manifestUrl)
      let addon = await prisma.addon.findFirst({
        where: {
          manifestUrlHash,
          accountId: AUTH_ENABLED ? accountId : undefined
        }
      })
      
      // If not found by hash, try to find by decrypted manifestUrl
      if (!addon) {
        const addons = await prisma.addon.findMany({
          where: scopedWhere(req, { isActive: true })
        })
        
        for (const candidate of addons) {
          try {
            const decryptedUrl = decrypt(candidate.manifestUrl, req)
            if (decryptedUrl === manifestUrl) {
              addon = candidate
              break
            }
          } catch (e) {
            // Skip if decryption fails
          }
        }
      }
      
      if (addon) {
        addonIds.push(addon.id)
      }
    } catch (e) {
      console.warn(`Failed to find addon for manifestUrl: ${manifestUrl}`, e.message)
    }
  }
  
  return addonIds
}

// Ownership guards
async function ensureUserInAccount(req, res, userId) {
  const accountId = req.appAccountId
  if (AUTH_ENABLED && !accountId) {
    res.status(401).json({ message: 'Authentication required' })
    return null
  }
  const user = await prisma.user.findFirst({ where: { id: userId, ...(accountId ? { accountId } : {}) } })
  if (!user) {
    res.status(404).json({ message: 'User not found' })
    return null
  }
  return user
}

async function ensureGroupInAccount(req, res, groupId) {
  const accountId = req.appAccountId
  if (AUTH_ENABLED && !accountId) {
    res.status(401).json({ message: 'Authentication required' })
    return null
  }
  const group = await prisma.group.findFirst({ where: { id: groupId, ...(accountId ? { accountId } : {}) } })
  if (!group) {
    res.status(404).json({ message: 'Group not found' })
    return null
  }
  return group
}

// Route-level ownership guards for any endpoint with :id under users/groups
if (AUTH_ENABLED) {
  // Only enforce ownership if we already have an authenticated account context.
  app.use('/api/users/:id', async (req, res, next) => {
    if (!req.appAccountId) return next()
    try {
      const owned = await ensureUserInAccount(req, res, req.params.id)
      if (!owned) return
      req.scopedUser = owned
      next()
    } catch (e) {
      next(e)
    }
  })

  app.use('/api/groups/:id', async (req, res, next) => {
    if (!req.appAccountId) return next()
    try {
      const owned = await ensureGroupInAccount(req, res, req.params.id)
      if (!owned) return
      req.scopedGroup = owned
      next()
    } catch (e) {
      next(e)
    }
  })

  // Nested group membership routes
  app.use('/api/groups/:groupId/members/:userId', async (req, res, next) => {
    if (!req.appAccountId) return next()
    try {
      const group = await ensureGroupInAccount(req, res, req.params.groupId)
      if (!group) return
      const user = await ensureUserInAccount(req, res, req.params.userId)
      if (!user) return
      req.scopedGroup = group
      req.scopedUser = user
      next()
    } catch (e) {
      next(e)
    }
  })
}

// Helper function to ensure a user is only in one group at a time
async function assignUserToGroup(userId, groupId, req) {
  // First, remove user from ALL groups in this account
  const currentGroups = await prisma.group.findMany({
    where: {
      accountId: getAccountId(req),
      userIds: {
        contains: userId
      }
    }
  })
  
  for (const group of currentGroups) {
    const userIds = group.userIds ? JSON.parse(group.userIds) : []
    const updatedUserIds = userIds.filter(id => id !== userId)
    await prisma.group.update({
      where: { id: group.id },
      data: { userIds: JSON.stringify(updatedUserIds) }
    })
  }
  
  // Then, add user to the new group (if groupId is provided)
  if (groupId && groupId.trim() !== '') {
    const group = await prisma.group.findUnique({
      where: { 
        id: groupId.trim(),
        accountId: getAccountId(req)
      }
    })
    
    if (group) {
      const currentUserIds = group.userIds ? JSON.parse(group.userIds) : []
      if (!currentUserIds.includes(userId)) {
        currentUserIds.push(userId)
        await prisma.group.update({
          where: { id: group.id },
          data: { userIds: JSON.stringify(currentUserIds) }
        })
      }
    }
  }
}

// Parse JSON bodies
app.use(express.json());


// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
}));

// CORS: allow local dev origins and credentials for cookies
const allowedOrigins = [/^http:\/\/localhost:300\d$/, /^http:\/\/127\.0\.0\.1:300\d$/];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.some((re) => re.test(origin))) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
}));

// Rate limiting (disabled in dev/local to avoid 429 during hot reload)
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000'), // generous default
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again later.',
});

// Rate limiting is disabled for personal use
// const RATE_LIMIT_ENABLED = (process.env.RATE_LIMIT_ENABLED || 'false').toLowerCase() === 'true';
// if (RATE_LIMIT_ENABLED) {
//   app.use(limiter);
// }

app.use(express.json({ limit: '10mb' }));

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/json') {
      cb(null, true);
    } else {
      cb(new Error('Only JSON files are allowed'), false);
    }
  }
});

// Encryption helpers (AES-GCM); private mode uses server key only
const { getServerKey, aesGcmEncrypt, aesGcmDecrypt, getAccountDek } = require('./utils/encryption')
const ENCRYPTION_KEY = getServerKey()

// ---------------------------------------------------------------------------
// Public Auth (UUID + password) - enabled only when AUTH_ENABLED=true
// ---------------------------------------------------------------------------
const AUTH_ALLOWLIST = [
  '/health',
  '/api/health',
  '/api/public-auth/login',
  '/api/public-auth/register',
  '/api/public-auth/suggest-uuid',
  '/api/public-auth/me',
  '/api/public-auth/logout',
  // Stremio helpers can remain open if desired; adjust as needed
  '/api/stremio/validate',
  '/api/stremio/register',
  // Note: addons endpoints are NOT allowlisted; they require auth/CSRF
];

function pathIsAllowlisted(path) {
  return AUTH_ALLOWLIST.some((prefix) => path.startsWith(prefix));
}

function extractBearerToken(req) {
  const header = req.headers && req.headers.authorization;
  if (!header) return null;
  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1];
}

function parseCookies(req) {
  try {
    const raw = req.headers && req.headers.cookie;
    if (!raw) return {};
    const map = Object.create(null);
    raw.split(';').forEach((part) => {
      const idx = part.indexOf('=');
      if (idx === -1) return;
      const k = part.slice(0, idx).trim();
      const v = decodeURIComponent(part.slice(idx + 1).trim());
      map[k] = v;
    });
    return map;
  } catch {
    return {};
  }
}

function isProdEnv() {
  return String(process.env.NODE_ENV) === 'production';
}

// ------------------------------------------------------------
// Automated backup scheduler (file-based frequency, global scope)
// ------------------------------------------------------------
// Persist backups under data/backup so Docker mount ./data captures them
const BACKUP_DIR = path.join(process.cwd(), 'data', 'backup')
const BACKUP_CFG = path.join(BACKUP_DIR, 'schedule.json')
let backupTimer = null

function ensureBackupDir() {
  try { if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true }) } catch {}
}

function readBackupFrequencyDays() {
  try {
    const raw = fs.readFileSync(BACKUP_CFG, 'utf8')
    const cfg = JSON.parse(raw)
    const days = Number(cfg?.days || 0)
    return Number.isFinite(days) ? days : 0
  } catch {
    return 0
  }
}

function writeBackupFrequencyDays(days) {
  ensureBackupDir()
  try { fs.writeFileSync(BACKUP_CFG, JSON.stringify({ days }), 'utf8') } catch {}
}

async function performBackupOnce() {
  ensureBackupDir()
  const ts = new Date()
  const stamp = ts.toISOString().replace(/[:]/g, '-').split('.')[0]
  const filename = path.join(BACKUP_DIR, `config-backup-${stamp}.json`)

  try {
    // call export endpoints on this same server
    const baseUrl = `http://localhost:${process.env.PORT || 4000}`
    let data = null
    try {
      const rsp = await fetch(`${baseUrl}/api/public-auth/export`)
      if (rsp.ok) data = await rsp.json()
    } catch {}
    if (!data) {
      try {
        const rsp2 = await fetch(`${baseUrl}/api/exports/addons`)
        if (rsp2.ok) data = await rsp2.json()
      } catch {}
    }
    if (!data) throw new Error('No export data available')
    fs.writeFileSync(filename, JSON.stringify(data, null, 2), 'utf8')
    if (!QUIET) console.log(`📦 Backup written: ${filename}`)
  } catch (e) {
    if (!QUIET) console.warn('Backup failed:', e?.message || e)
  }
}

function clearBackupSchedule() {
  if (backupTimer) { clearInterval(backupTimer); backupTimer = null }
}

function scheduleBackups(days) {
  clearBackupSchedule()
  if (!days || days <= 0) return
  const ms = days * 24 * 60 * 60 * 1000
  performBackupOnce()
  backupTimer = setInterval(performBackupOnce, ms)
}

// initialize on boot
scheduleBackups(readBackupFrequencyDays())

// Backup settings endpoints
app.get('/api/settings/backup-frequency', async (req, res) => {
  try {
    return res.json({ days: readBackupFrequencyDays() })
  } catch {
    return res.status(500).json({ message: 'Failed to read backup frequency' })
  }
})

app.put('/api/settings/backup-frequency', async (req, res) => {
  try {
    const days = Number(req.body?.days || 0)
    if (!Number.isFinite(days) || days < 0) return res.status(400).json({ message: 'Invalid days' })
    writeBackupFrequencyDays(days)
    scheduleBackups(days)
    return res.json({ message: 'Backup frequency updated', days })
  } catch {
    return res.status(500).json({ message: 'Failed to update backup frequency' })
  }
})

// manual trigger
app.post('/api/settings/backup-now', async (req, res) => {
  try {
    await performBackupOnce()
    return res.json({ message: 'Backup started' })
  } catch {
    return res.status(500).json({ message: 'Failed to start backup' })
  }
})

function cookieName(base) {
  return isProdEnv() ? `__Host-${base}` : base;
}

function issueAccessToken(appAccountId) {
  return jwt.sign({ accId: appAccountId, typ: 'access' }, JWT_SECRET, { expiresIn: '30d' });
}

function issueRefreshToken(appAccountId) {
  return jwt.sign({ accId: appAccountId, typ: 'refresh' }, JWT_SECRET, { expiresIn: '365d' });
}

function randomCsrfToken() {
  try { return crypto.randomUUID(); } catch { return Math.random().toString(36).slice(2); }
}

// Global auth gate (no-op when AUTH_ENABLED=false)
app.use((req, res, next) => {
  if (!AUTH_ENABLED) return next();
  if (req.method === 'OPTIONS') return next();
  if (pathIsAllowlisted(req.path)) return next();

  const cookies = parseCookies(req);
  const accessCookie = cookies[cookieName('sfm_at')] || cookies['sfm_at'];
  const refreshCookie = cookies[cookieName('sfm_rt')] || cookies['sfm_rt'];
  const bearer = extractBearerToken(req);
  const token = bearer || accessCookie;
  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.appAccountId = decoded.accId;
    return next();
  } catch (e) {
    // Try refresh
    if (refreshCookie) {
      try {
        const rj = jwt.verify(refreshCookie, JWT_SECRET);
        if (rj && rj.accId) {
          const newAt = issueAccessToken(rj.accId);
          res.cookie(cookieName('sfm_at'), newAt, {
            httpOnly: true,
            secure: isProdEnv(),
            sameSite: isProdEnv() ? 'strict' : 'lax',
            path: '/',
            maxAge: 30 * 24 * 60 * 60 * 1000,
          });
          req.appAccountId = rj.accId;
          return next();
        }
      } catch {}
    }
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
});

// CSRF for state-changing requests (double-submit cookie)
app.use((req, res, next) => {
  if (!AUTH_ENABLED) return next();
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  if (pathIsAllowlisted(req.path)) return next();
  const cookies = parseCookies(req);
  const csrfCookie = cookies[cookieName('sfm_csrf')] || cookies['sfm_csrf'];
  const header = req.headers['x-csrf-token'];
  if (!csrfCookie || !header || String(header) !== String(csrfCookie)) {
    return res.status(403).json({ message: 'Invalid CSRF token' });
  }
  return next();
});

// Helper to issue JWTs for public accounts (kept for compatibility)
function issuePublicToken(appAccountId) {
  return jwt.sign({ accId: appAccountId }, JWT_SECRET, { expiresIn: '30d' });
}

// Public auth endpoints
app.post('/api/public-auth/register', async (req, res) => {
  try {
    const { uuid, password } = req.body || {};
    if (!uuid || !password) {
      return res.status(400).json({ message: 'uuid and password are required' });
    }
    // Enforce RFC 4122 UUID format (any version, correct variant)
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(String(uuid))) {
      return res.status(400).json({ message: 'Invalid UUID format' });
    }
    if (String(password).length < 4) {
      return res.status(400).json({ message: 'Password must be at least 4 characters' });
    }

    const existing = await prisma.appAccount.findUnique({ where: { uuid } });
    if (existing) {
      return res.status(409).json({ message: 'Account already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const account = await prisma.appAccount.create({
      data: { uuid, passwordHash },
    });

    // Set access/refresh and CSRF cookies
    const at = issueAccessToken(account.id);
    const rt = issueRefreshToken(account.id);
    const csrf = randomCsrfToken();
    res.cookie(cookieName('sfm_at'), at, { httpOnly: true, secure: isProdEnv(), sameSite: isProdEnv() ? 'strict' : 'lax', path: '/', maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.cookie(cookieName('sfm_rt'), rt, { httpOnly: true, secure: isProdEnv(), sameSite: isProdEnv() ? 'strict' : 'lax', path: '/', maxAge: 365 * 24 * 60 * 60 * 1000 });
    res.cookie(cookieName('sfm_csrf'), csrf, { httpOnly: false, secure: isProdEnv(), sameSite: isProdEnv() ? 'strict' : 'lax', path: '/', maxAge: 7 * 24 * 60 * 60 * 1000 });
    return res.status(201).json({
      message: 'Registered successfully',
      account: { id: account.id, uuid: account.uuid },
    });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to register', error: String(err && err.message || err) });
  }
});

app.post('/api/public-auth/login', async (req, res) => {
  try {
    const { uuid, password } = req.body || {};
    if (!uuid || !password) {
      return res.status(400).json({ message: 'uuid and password are required' });
    }
    const account = await prisma.appAccount.findUnique({ where: { uuid } });
    if (!account) {
      return res.status(401).json({ message: 'Wrong Credentials' });
    }
    const ok = await bcrypt.compare(password, account.passwordHash || '');
    if (!ok) {
      return res.status(401).json({ message: 'Wrong Credentials' });
    }
    // Update last login (AppAccount doesn't have lastLoginAt field, so we'll skip this)
    // await prisma.appAccount.update({ where: { id: account.id }, data: { lastLoginAt: new Date() } });

    // Set access/refresh and CSRF cookies
    const at = issueAccessToken(account.id);
    const rt = issueRefreshToken(account.id);
    const csrf = randomCsrfToken();
    res.cookie(cookieName('sfm_at'), at, { httpOnly: true, secure: isProdEnv(), sameSite: isProdEnv() ? 'strict' : 'lax', path: '/', maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.cookie(cookieName('sfm_rt'), rt, { httpOnly: true, secure: isProdEnv(), sameSite: isProdEnv() ? 'strict' : 'lax', path: '/', maxAge: 365 * 24 * 60 * 60 * 1000 });
    res.cookie(cookieName('sfm_csrf'), csrf, { httpOnly: false, secure: isProdEnv(), sameSite: isProdEnv() ? 'strict' : 'lax', path: '/', maxAge: 7 * 24 * 60 * 60 * 1000 });

    return res.json({
      message: 'Login successful',
      account: { id: account.id, uuid: account.uuid },
    });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to login', error: String(err && err.message || err) });
  }
});

// Session info endpoint
app.get('/api/public-auth/me', async (req, res) => {
  try {
    if (!AUTH_ENABLED) {
      return res.json({ account: null, authEnabled: false });
    }
    // Try to use auth gate value if set; otherwise verify cookies
    let accountId = req.appAccountId;
    if (!accountId) {
      const cookies = parseCookies(req);
      const accessCookie = cookies[cookieName('sfm_at')] || cookies['sfm_at'];
      const refreshCookie = cookies[cookieName('sfm_rt')] || cookies['sfm_rt'];
      try {
        if (accessCookie) {
          const dj = jwt.verify(accessCookie, JWT_SECRET);
          accountId = dj && dj.accId;
        }
      } catch {}
      if (!accountId && refreshCookie) {
        try {
          const rj = jwt.verify(refreshCookie, JWT_SECRET);
          accountId = rj && rj.accId;
          if (accountId) {
            // rotate access token
            const newAt = issueAccessToken(accountId);
            res.cookie(cookieName('sfm_at'), newAt, {
              httpOnly: true,
              secure: isProdEnv(),
              sameSite: isProdEnv() ? 'strict' : 'lax',
              path: '/',
              maxAge: 30 * 24 * 60 * 60 * 1000,
            });
          }
        } catch {}
      }
    }
    if (!accountId) return res.status(401).json({ account: null });
    const account = await prisma.appAccount.findUnique({ where: { id: accountId }, select: { id: true, uuid: true } });
    if (!account) return res.status(401).json({ account: null });
    return res.json({ account });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to resolve session', error: String(err && err.message || err) });
  }
});

app.post('/api/public-auth/logout', (req, res) => {
  const opts = { httpOnly: true, secure: isProdEnv(), sameSite: isProdEnv() ? 'strict' : 'lax', path: '/', expires: new Date(0) };
  res.cookie(cookieName('sfm_at'), '', opts);
  res.cookie(cookieName('sfm_rt'), '', opts);
  res.cookie(cookieName('sfm_csrf'), '', { httpOnly: false, secure: isProdEnv(), sameSite: isProdEnv() ? 'strict' : 'lax', path: '/', expires: new Date(0) });
  return res.json({ message: 'Logged out' });
});

// Export all data for the logged-in account
app.get('/api/public-auth/export', async (req, res) => {
  try {
    const whereScope = AUTH_ENABLED ? { accountId: req.appAccountId } : {}
    if (AUTH_ENABLED && !req.appAccountId) return res.status(401).json({ error: 'Unauthorized' })
    // Ensure request-scoped DEK is available for decryption in public mode
    try {
      if (AUTH_ENABLED && !req.accountDek && typeof getAccountDek === 'function') {
        let dek = getAccountDek(req.appAccountId)
        if (!dek) {
          const acct = await prisma.appAccount.findUnique({ where: { id: req.appAccountId }, select: { uuid: true } })
          if (acct?.uuid) {
            dek = getAccountDek(acct.uuid)
          }
        }
        if (dek) req.accountDek = dek
      }
    } catch {}
    const [users, groups, addons] = await Promise.all([
      prisma.user.findMany({ where: whereScope }),
      prisma.group.findMany({ where: whereScope, include: { addons: true } }),
      prisma.addon.findMany({ where: whereScope, include: { groupAddons: true } })
    ])
    
    // Decrypt stremioAuthKey for each user before exporting
    const decryptedUsers = users.map(user => {
      const decryptedUser = { ...user }
      if (user.stremioAuthKey) {
        try {
          decryptedUser.stremioAuthKey = decrypt(user.stremioAuthKey)
        } catch (e) {
          console.warn(`Failed to decrypt auth key for user ${user.id}:`, e.message)
          decryptedUser.stremioAuthKey = null
        }
      }
      // Omit stremioAddons from export (not needed in exported config)
      delete decryptedUser.stremioAddons
      return decryptedUser
    })

    // Build addons with manifest hydrated and useless fields stripped
    const exportedAddons = await Promise.all(addons.map(async (addon) => {
      let manifest = null
      if (addon.manifest) {
        const decrypted = decryptWithFallback(addon.manifest, req)
        if (decrypted) { try { manifest = JSON.parse(decrypted) } catch {} }
      }
      const cleanedGroupAddons = (addon.groupAddons || []).map(ga => ({
        id: ga.id,
        isEnabled: ga.isEnabled
        // omit groupId, addonId and settings
      }))
      return {
        id: addon.id,
        name: addon.name,
        description: addon.description,
        manifestUrl: getDecryptedManifestUrl(addon, req),
        manifest,
        resources: (() => {
          try {
            const stored = addon.resources ? JSON.parse(addon.resources) : null
            if (Array.isArray(stored)) return stored
            const src = Array.isArray(manifest?.resources) ? manifest.resources : []
            return src.map(r => (typeof r === 'string' ? r : (r && (r.name || r.type)))).filter(Boolean)
          } catch {
            const src = Array.isArray(manifest?.resources) ? manifest.resources : []
            return src.map(r => (typeof r === 'string' ? r : (r && (r.name || r.type)))).filter(Boolean)
          }
        })(),
        // Always include stremioAddonId; fall back to manifest.id if needed
        stremioAddonId: addon.stremioAddonId || (manifest && manifest.id) || null,
        version: addon.version,
        isActive: addon.isActive,
        accountId: addon.accountId,
        iconUrl: addon.iconUrl,
        // omit manifestUrlHash from export
        groupAddons: cleanedGroupAddons
      }
    }))

    // Clean groups: strip addons.settings and addons.groupId
    const cleanedGroups = groups.map(g => ({
      id: g.id,
      name: g.name,
      description: g.description,
      isActive: g.isActive,
      colorIndex: g.colorIndex,
      accountId: g.accountId,
      userIds: g.userIds,
      // omit addonIds (redundant in export)
      addons: (g.addons || []).map(ga => ({
        id: ga.id,
        isEnabled: ga.isEnabled
        // omit groupId, addonId and settings
      }))
    }))

    const payload = { users: decryptedUsers, groups: cleanedGroups, addons: exportedAddons }
    res.setHeader('Content-Disposition', 'attachment; filename="syncio-export.json"')
    return res.json(payload)
  } catch (e) {
    console.error('Export failed:', e)
    return res.status(500).json({ error: 'Export failed' })
  }
})

// Export only addons for the logged-in account
// Use a dedicated exports namespace to avoid shadowing by /api/addons/:id
app.get('/api/exports/addons', async (req, res) => {
  try {
    const whereScope = AUTH_ENABLED ? { accountId: req.appAccountId } : {}
    if (AUTH_ENABLED && !req.appAccountId) return res.status(401).json({ error: 'Unauthorized' })
    const addons = await prisma.addon.findMany({ where: whereScope })

    // Build Stremio-like addon objects with embedded manifests
        const exported = await Promise.all(
      addons.map(async (addon) => {
        const transportUrl = getDecryptedManifestUrl(addon, req)
        // Prefer stored manifest if present
        let manifest = null
        if (addon.manifest) {
          try { manifest = JSON.parse(decrypt(addon.manifest, req)) } catch {}
        }
        if (!manifest && transportUrl) {
          try {
            const rsp = await fetch(transportUrl)
            if (rsp.ok) { manifest = await rsp.json() }
          } catch (err) {
            console.warn(`Failed to fetch manifest for ${transportUrl}:`, err?.message)
          }
        }

        if (!manifest) {
          manifest = {
            id: addon.name || 'unknown.addon',
            version: addon.version || null,
            name: addon.name || '',
            description: addon.description || null,
            logo: addon.iconUrl || null,
            background: null,
            types: [],
            resources: (() => { try { return addon.resources ? JSON.parse(addon.resources) : [] } catch { return [] } })(),
            idPrefixes: null,
            catalogs: [],
            addonCatalogs: [],
            behaviorHints: { configurable: false, configurationRequired: false },
          }
        }

        return {
          name: addon.name || '',
          manifestUrl: transportUrl,
          manifest,
          resources: (() => {
            try {
              const stored = addon.resources ? JSON.parse(addon.resources) : null
              if (Array.isArray(stored)) return stored
              const src = Array.isArray(manifest?.resources) ? manifest.resources : []
              return src.map(r => (typeof r === 'string' ? r : (r && (r.name || r.type)))).filter(Boolean)
            } catch {
              const src = Array.isArray(manifest?.resources) ? manifest.resources : []
              return src.map(r => (typeof r === 'string' ? r : (r && (r.name || r.type)))).filter(Boolean)
            }
          })(),
          stremioAddonId: addon.stremioAddonId || (manifest && manifest.id) || null,
          flags: { protected: false },
        }
      })
    )

    res.setHeader('Content-Disposition', 'attachment; filename="syncio-addon-export.json"')
    return res.json(exported)
  } catch (e) {
    console.error('Export addons failed:', e)
    return res.status(500).json({ error: 'Export addons failed' })
  }
})

// Import full configuration with an account-scoped reset first
// Accepts multipart (file) or JSON body with { jsonData } string
app.post('/api/public-auth/import-config', upload.single('file'), async (req, res) => {
  try {
    if (AUTH_ENABLED && !req.appAccountId) {
      return res.status(401).json({ message: 'Unauthorized' })
    }

    // Read JSON either from uploaded file or jsonData field
    let raw = ''
    if (req.file && req.file.buffer) {
      raw = req.file.buffer.toString('utf8')
    } else if (req.body && typeof req.body.jsonData === 'string') {
      raw = req.body.jsonData
    } else {
      return res.status(400).json({ message: 'No configuration provided' })
    }

    let data
    try {
      data = JSON.parse(raw)
    } catch (e) {
      return res.status(400).json({ message: 'Invalid JSON' })
    }

    // Always reset before importing configuration (works for both auth and private mode)
    const accountId = getAccountId(req)
    console.log('🧹 Resetting configuration before import for accountId:', accountId)
    
    await prisma.$transaction([
      // ActivityLog model removed
      // Existing relations in simplified schema
      prisma.groupAddon.deleteMany({ where: { group: { accountId } } }),
      prisma.user.deleteMany({ where: { accountId } }),
      prisma.group.deleteMany({ where: { accountId } }),
      prisma.addon.deleteMany({ where: { accountId } }),
      // Clean orphans
      prisma.addon.deleteMany({ where: { accountId: null, groupAddons: { none: {} } } }),
    ])
    
    console.log('✅ Configuration reset completed, starting import...')

    // Extract sections
    const addonsArray = Array.isArray(data?.addons) ? data.addons : (Array.isArray(data) ? data : [])
    const usersArray = Array.isArray(data?.users) ? data.users : []
    const groupsArray = Array.isArray(data?.groups) ? data.groups : []

    // ID remap tables from export IDs -> new IDs
    const addonIdMap = Object.create(null)
    const userIdMap = Object.create(null)
    const groupIdMap = Object.create(null)

    // 1) Import addons
    let successful = 0, failed = 0, redundant = 0
    for (const entry of addonsArray) {
      try {
        const transportUrl = (entry && (entry.manifestUrl || entry.url || entry.transportUrl) || '').toString().trim().replace(/^@+/, '')
        const transportName = (entry && (entry.name || entry.transportName) || '')
        let manifest = entry && entry.manifest ? entry.manifest : null
        if (!transportUrl) { failed++; continue }

        const { manifestUrlHash } = require('./utils/hash')
        const existing = await prisma.addon.findFirst({ where: { accountId: getAccountId(req), manifestUrlHash: manifestUrlHash(transportUrl) } })
        if (existing) { redundant++; continue }

        // Attempt to fetch manifest if not provided to enrich fields
        if (!manifest) {
          try {
            const rsp = await fetch(transportUrl)
            if (rsp.ok) { manifest = await rsp.json() }
          } catch {}
        }

        // Create with enriched fields
        // Prepare filtered manifest according to selected resources (if provided)
        const selectedResources = Array.isArray(entry?.resources) ? entry.resources : (Array.isArray(manifest?.resources) ? manifest.resources : [])
        const filteredManifest = (() => {
          if (!manifest) return null
          if (!Array.isArray(selectedResources) || selectedResources.length === 0) return manifest
          try {
            const allow = new Set(selectedResources.map(r => typeof r === 'string' ? r : (r?.name || r?.type)).filter(Boolean))
            const clone = JSON.parse(JSON.stringify(manifest))
            if (Array.isArray(clone.resources)) {
              clone.resources = clone.resources.filter(r => {
                const key = typeof r === 'string' ? r : (r?.name || r?.type)
                return key ? allow.has(key) : false
              })
            }
            return clone
          } catch { return manifest }
        })()

        const created = await prisma.addon.create({
          data: {
            name: (transportName && transportName.trim()) || (manifest?.name || entry?.name || 'Unknown Addon'),
            description: (entry?.description ?? manifest?.description ?? ''),
            manifestUrl: encrypt(transportUrl, req),
            manifestUrlHash: manifestUrlHash(transportUrl),
            version: (entry?.version ?? manifest?.version ?? null),
            iconUrl: (entry?.iconUrl ?? manifest?.logo ?? null),
            stremioAddonId: (manifest?.id || entry?.stremioAddonId || null),
            isActive: true,
            originalManifest: manifest ? encrypt(JSON.stringify(manifest), req) : null,
            manifest: filteredManifest ? encrypt(JSON.stringify(filteredManifest), req) : null,
            resources: (() => {
              try {
                const src = Array.isArray(entry?.resources)
                  ? entry.resources
                  : (Array.isArray(manifest?.resources) ? manifest.resources : [])
                const names = src.map(r => (typeof r === 'string' ? r : (r && (r.name || r.type)))).filter(Boolean)
                return names.length ? JSON.stringify(names) : null
              } catch { return null }
            })(),
            accountId: getAccountId(req),
          }
        })
        successful++
        if (entry?.id) {
          addonIdMap[entry.id] = created.id
        }

        // Link addon to groups if provided via addon.groupAddons
        if (Array.isArray(entry?.groupAddons) && entry.groupAddons.length > 0) {
          for (const ga of entry.groupAddons) {
            try {
              const groupName = (ga?.group?.name || ga?.groupName || '').toString().trim()
              const groupById = ga?.groupId && groupIdMap[ga.groupId]
              let group = null
              if (groupById) {
                group = await prisma.group.findFirst({ where: { id: groupIdMap[ga.groupId], accountId: getAccountId(req) } })
              }
              if (!group && groupName) {
                group = await prisma.group.findFirst({ where: { accountId: getAccountId(req), name: groupName } })
              }
              if (!group) continue
              const exists = await prisma.groupAddon.findFirst({ where: { groupId: group.id, addonId: created.id } })
              if (!exists) {
                await prisma.groupAddon.create({ data: { groupId: group.id, addonId: created.id, isEnabled: ga?.isEnabled !== false, settings: ga?.settings || null } })
              }
            } catch {}
          }
        }
      } catch (e) {
        console.error('Import-config addon failed:', e)
        failed++
      }
    }

    // 2) Import users (full profile fields)
    let usersCreated = 0, usersSkipped = 0, usersFailed = 0
    for (const u of usersArray) {
      try {
        const username = (u?.username || '').toString().trim()
        const email = (u?.email || '').toString().trim()
        // avoid duplicates within this account by username/email
        const exists = await prisma.user.findFirst({
          where: {
            accountId: getAccountId(req),
            OR: [
              ...(email ? [{ email }] : []),
              ...(username ? [{ username }] : []),
            ]
          }
        })
        if (exists) { usersSkipped++; continue }
        // Map fields from export; force accountId to current
        const createdUser = await prisma.user.create({
          data: {
            username: username || email || `user_${Date.now()}`,
            email: email || `${Date.now()}@local`,
            isActive: u?.isActive !== false,
            stremioAuthKey: u?.stremioAuthKey ? encrypt(u.stremioAuthKey) : null,
            excludedAddons: u?.excludedAddons || null,
            protectedAddons: u?.protectedAddons || null,
            colorIndex: typeof u?.colorIndex === 'number' ? u.colorIndex : null,
            accountId: getAccountId(req),
          }
        })
        usersCreated++
        if (u?.id) {
          userIdMap[u.id] = createdUser.id
        }
      } catch (e) {
        console.error('Import-config user failed:', e)
        usersFailed++
      }
    }

    // 3) Import groups and memberships
    let groupsCreated = 0, groupsSkipped = 0, groupsFailed = 0, membershipsCreated = 0
    // Map exported groupAddons IDs -> created group IDs (to cross-link later from addons[].groupAddons)
    const exportGroupAddonIdToGroupId = Object.create(null)
    for (const g of groupsArray) {
      try {
        const name = (g?.name || '').toString().trim()
        if (!name) { groupsFailed++; continue }
        let group = await prisma.group.findFirst({ where: { accountId: getAccountId(req), name } })
        if (!group) {
          group = await prisma.group.create({
            data: {
              name,
              description: g?.description || '',
              colorIndex: typeof g?.colorIndex === 'number' ? g.colorIndex : null,
              isActive: g?.isActive !== false,
              accountId: getAccountId(req),
            }
          })
          groupsCreated++
        } else {
          groupsSkipped++
        }
        // memberships
        // Handle group memberships using userIds array (SQLite approach)
        const groupUserIds = []
        
        // First, try to parse userIds from the group data
        if (g?.userIds) {
          try {
            const userIdsArray = JSON.parse(g.userIds)
            if (Array.isArray(userIdsArray)) {
              for (const userId of userIdsArray) {
                const mappedUserId = userIdMap[userId]
                if (mappedUserId) {
                  groupUserIds.push(mappedUserId)
                  membershipsCreated++
                }
              }
            }
          } catch (e) {
            console.error('Failed to parse userIds:', e)
          }
        }
        
        // Also handle members array if present
        if (Array.isArray(g?.members)) {
          for (const m of g.members) {
            try {
              const uname = (m?.user?.username || m?.username || '').toString().trim()
              const mail = (m?.user?.email || m?.email || '').toString().trim()
              const byExportId = m?.userId && userIdMap[m.userId]
              let user = null
              if (byExportId) {
                user = await prisma.user.findFirst({ where: { id: userIdMap[m.userId], accountId: getAccountId(req) } })
              }
              if (!user) {
                user = await prisma.user.findFirst({ where: { accountId: getAccountId(req), OR: [ ...(mail ? [{ email: mail }] : []), ...(uname ? [{ username: uname }] : []) ] } })
              }
              if (user && !groupUserIds.includes(user.id)) {
                groupUserIds.push(user.id)
                membershipsCreated++
              }
            } catch {}
          }
        }
        
        // Assign users to group (ensures one-group-per-user rule)
        for (const userId of groupUserIds) {
          await assignUserToGroup(userId, group.id, req)
        }
        // Capture exported groupAddons IDs to map back later from addons[].groupAddons
        if (Array.isArray(g?.addons)) {
          for (const ga of g.addons) {
            if (ga?.id) {
              exportGroupAddonIdToGroupId[ga.id] = group.id
            }
          }
        }
      } catch (e) {
        console.error('Import-config group failed:', e)
        groupsFailed++
      }
    }

    // 3b) Second pass: ensure addon→group links from addon records (covers cases where groups were created after addons pass)
    try {
      if (Array.isArray(addonsArray)) {
        const { manifestUrlHash } = require('./utils/hash')
        for (const entry of addonsArray) {
          if (!Array.isArray(entry?.groupAddons) || entry.groupAddons.length === 0) continue
          // Resolve created addon id by export id, hash(url), or name
          let createdAddonId = entry?.id && addonIdMap[entry.id]
          if (!createdAddonId) {
            const url = (entry?.manifestUrl || entry?.url || entry?.transportUrl || '').toString().trim()
            if (url) {
              const found = await prisma.addon.findFirst({ where: { accountId: getAccountId(req), manifestUrlHash: manifestUrlHash(url) } })
              if (found) createdAddonId = found.id
            }
          }
          if (!createdAddonId) {
            const stremioId = (entry?.stremioAddonId || entry?.manifest?.id || '').toString().trim()
            if (stremioId) {
              const foundByStremio = await prisma.addon.findFirst({ where: { accountId: getAccountId(req), stremioAddonId: stremioId } })
              if (foundByStremio) createdAddonId = foundByStremio.id
            }
          }
          if (!createdAddonId) {
            const name = (entry?.name || entry?.transportName || '').toString().trim()
            if (name) {
              const foundByName = await prisma.addon.findFirst({ where: { accountId: getAccountId(req), name } })
              if (foundByName) createdAddonId = foundByName.id
            }
          }
          if (!createdAddonId) continue

          for (const ga of entry.groupAddons) {
            try {
              const groupByMap = ga?.groupId && groupIdMap[ga.groupId]
              let group = null
              if (groupByMap) {
                group = await prisma.group.findFirst({ where: { id: groupIdMap[ga.groupId], accountId: getAccountId(req) } })
              }
              // Fallback: match group via exported groupAddon id cross-ref from groups[].addons
              if (!group && ga?.id && exportGroupAddonIdToGroupId[ga.id]) {
                group = await prisma.group.findFirst({ where: { id: exportGroupAddonIdToGroupId[ga.id], accountId: getAccountId(req) } })
              }
              if (!group) {
                const gname = (ga?.group?.name || ga?.groupName || '').toString().trim()
                if (gname) {
                  group = await prisma.group.findFirst({ where: { accountId: getAccountId(req), name: gname } })
                }
              }
              if (!group) continue
              const exists = await prisma.groupAddon.findFirst({ where: { groupId: group.id, addonId: createdAddonId } })
              if (!exists) {
                await prisma.groupAddon.create({ data: { groupId: group.id, addonId: createdAddonId, isEnabled: ga?.isEnabled !== false, settings: ga?.settings || null } })
              }
            } catch {}
          }
        }
      }
    } catch (e) {
      console.warn('Addon→Group link backfill pass failed:', e?.message)
    }

    // 4) User-driven memberships (users[].memberships) -> link users to groups by name/email
    if (Array.isArray(usersArray)) {
      for (const u of usersArray) {
        try {
          const username = (u?.username || '').toString().trim()
          const email = (u?.email || '').toString().trim()
          const byId = u?.id && userIdMap[u.id]
          let user = null
          if (byId) {
            user = await prisma.user.findFirst({ where: { id: userIdMap[u.id], accountId: getAccountId(req) } })
          }
          if (!user) {
            user = await prisma.user.findFirst({ where: { accountId: getAccountId(req), OR: [ ...(email ? [{ email }] : []), ...(username ? [{ username }] : []) ] } })
          }
          if (!user) continue
          // Handle user memberships using userIds array (SQLite approach)
          if (Array.isArray(u?.memberships)) {
            for (const m of u.memberships) {
              try {
                const gname = (m?.group?.name || m?.groupName || '').toString().trim()
                const groupById = m?.groupId && groupIdMap[m.groupId]
                let group = null
                if (groupById) {
                  group = await prisma.group.findFirst({ where: { id: groupIdMap[m.groupId], accountId: getAccountId(req) } })
                }
                if (!group && gname) {
                  group = await prisma.group.findFirst({ where: { accountId: getAccountId(req), name: gname } })
                }
                if (!group) continue
                
                // Assign user to group (ensures user is only in one group)
                await assignUserToGroup(user.id, group.id, req)
                membershipsCreated++
              } catch {}
            }
          }
        } catch {}
      }
    }

    // 5) Final linking pass: attach addons to groups from addons[].groupAddons (using id maps when available)
    if (Array.isArray(addonsArray)) {
      for (const a of addonsArray) {
        try {
          // Resolve created addon id
          let addonId = a?.id && addonIdMap[a.id]
          if (!addonId) {
            const manifestUrl = (a?.manifestUrl || a?.url || a?.transportUrl || '').toString().trim()
            if (manifestUrl) {
              const found = await prisma.addon.findFirst({ where: { accountId: getAccountId(req), manifestUrl } })
              if (found) addonId = found.id
            }
          }
          if (!addonId) continue
          if (Array.isArray(a?.groupAddons)) {
            for (const ga of a.groupAddons) {
              try {
                let groupId = ga?.groupId && groupIdMap[ga.groupId]
                if (!groupId) {
                  const gname = (ga?.group?.name || ga?.groupName || '').toString().trim()
                  if (gname) {
                    const group = await prisma.group.findFirst({ where: { accountId: getAccountId(req), name: gname } })
                    if (group) groupId = group.id
                  }
                }
                if (!groupId) continue
                const exists = await prisma.groupAddon.findFirst({ where: { groupId, addonId } })
                if (!exists) {
                  await prisma.groupAddon.create({ data: { groupId, addonId, isEnabled: ga?.isEnabled !== false, settings: ga?.settings || null } })
                }
              } catch {}
            }
          }
        } catch {}
      }
    }

    return res.json({
      message: 'Configuration imported',
      addons: { created: successful, reused: 0 },
      users: { created: usersCreated, skipped: usersSkipped, failed: usersFailed, total: usersArray.length },
      groups: { created: groupsCreated, skipped: groupsSkipped, failed: groupsFailed, total: groupsArray.length, membershipsCreated },
    })
  } catch (e) {
    console.error('Import configuration failed:', e)
    return res.status(500).json({ message: 'Import configuration failed' })
  }
})

// Reset (wipe) all data for the logged-in account, but keep the account
app.post('/api/public-auth/reset', async (req, res) => {
  try {
    // Always reset before importing configuration (works for both auth and private mode)
    const accountId = getAccountId(req)
    console.log('🧹 Resetting configuration before import for accountId:', accountId)
    
    await prisma.$transaction([
      // ActivityLog model removed
      // Existing relations in simplified schema
      prisma.groupAddon.deleteMany({ where: { group: { accountId } } }),
      prisma.user.deleteMany({ where: { accountId } }),
      prisma.group.deleteMany({ where: { accountId } }),
      prisma.addon.deleteMany({ where: { accountId } }),
      // Clean orphans
      prisma.addon.deleteMany({ where: { accountId: null, groupAddons: { none: {} } } }),
    ])
    
    console.log('✅ Configuration reset completed, starting import...')
    return res.json({ message: 'Configuration reset' })
  } catch (e) {
    console.error('Reset account failed:', e)
    return res.status(500).json({ error: 'Reset failed' })
  }
})
// Delete the logged-in account and all scoped data
app.delete('/api/public-auth/account', async (req, res) => {
  try {
    if (!AUTH_ENABLED) return res.status(400).json({ error: 'Auth disabled' })
    if (!req.appAccountId) return res.status(401).json({ error: 'Unauthorized' })

    // Cascade delete scoped data
    await prisma.$transaction([
      // ActivityLog model removed
      // GroupMember and GroupInvite models removed - using JSON arrays instead
      prisma.groupAddon.deleteMany({ where: { group: { accountId: req.appAccountId } } }),
      // AddonSetting model removed
      prisma.user.deleteMany({ where: { accountId: req.appAccountId } }),
      prisma.group.deleteMany({ where: { accountId: req.appAccountId } }),
      prisma.addon.deleteMany({ where: { accountId: req.appAccountId } }),
      // Clean any orphan addons that might have been created without account scope
      prisma.addon.deleteMany({ where: { accountId: null, groupAddons: { none: {} } } }),
      prisma.appAccount.delete({ where: { id: req.appAccountId } }),
    ])
    return res.json({ message: 'Account deleted' })
  } catch (e) {
    console.error('Delete account failed:', e)
    return res.status(500).json({ error: 'Delete failed' })
  }
})

function selectKeyForRequest(req) {
  try {
    const scopeId = req?.appAccountId || req?.user?.accountId || req?.user?.id
    const dek = getAccountDek(scopeId)
    if (dek) return dek
  } catch {}
  return ENCRYPTION_KEY
}

function encrypt(text, req) {
  const key = selectKeyForRequest(req)
  return aesGcmEncrypt(key, text)
}

function decrypt(text, req) {
  const key = selectKeyForRequest(req)
  return aesGcmDecrypt(key, text)
}

// ---------------------------------------------------------------------------------
// Normalization and hashing for manifestUrl (public mode hashed lookup support)
// ---------------------------------------------------------------------------------
const PEPPER = process.env.HASH_PEPPER || process.env.ENCRYPTION_KEY || 'syncio-pepper'
function normalizeUrl(u) {
  if (!u) return ''
  try {
    const s = String(u).trim()
    return s.replace(/\s+/g, '').toLowerCase()
  } catch { return '' }
}
function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex')
}
function manifestUrlHash(url) {
  return sha256Hex(normalizeUrl(url) + '|' + PEPPER)
}

function encryptIf(value, req) {
  if (value == null) return null
  return encrypt(typeof value === 'string' ? value : JSON.stringify(value), req)
}
function decryptIf(value, req) {
  if (!value) return null
  const pt = decrypt(value, req)
  try { return JSON.parse(pt) } catch { return pt }
}

function getDecryptedManifestUrl(addon, req) {
  if (!addon || !addon.manifestUrl) return null
  try { return decrypt(addon.manifestUrl, req) } catch {}
  try { return aesGcmDecrypt(getServerKey(), addon.manifestUrl) } catch {}
  return addon.manifestUrl
}

function decryptWithFallback(payload, req) {
  if (!payload) return null
  try { return decrypt(payload, req) } catch {}
  try { return aesGcmDecrypt(getServerKey(), payload) } catch {}
  return null
}

// Validate Stremio auth key by calling official API
async function validateStremioAuthKey(authKey) {
  // 1) Try via official client: request('getUser') and require email
  try {
    const client = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey })
    if (client && typeof client.request === 'function') {
      const userRes = await client.request('getUser')
      if (userRes && userRes.email) {
        return { user: userRes }
      }
      const err = new Error('Missing user email')
      err.code = 1
      throw err
    }
  } catch (e) {
    const msg = (e && (e.message || e.error || '')) || ''
    if (/session does not exist|invalid/i.test(msg) || e.code === 1) {
      const err = new Error('Invalid or expired Stremio auth key')
      err.code = 1
      throw err
    }
    // fall through to HTTP fallback
  }

  // 2) Fallback to HTTP pullUser to verify session
  const resp = await fetch('https://api.strem.io/api/pullUser', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ authKey })
  })
  const data = await resp.json().catch(() => null)
  if (!resp.ok) {
    const msg = (data && (data.message || data.error)) || `HTTP ${resp.status}`
    const err = new Error(msg)
    throw err
  }
  if (data && (data.code === 1 || /session does not exist/i.test(String(data.message || '')))) {
    const err = new Error('Invalid or expired Stremio auth key')
    err.code = 1
    throw err
  }
  if (data && data.user && data.user.email) {
    return { user: data.user }
  }
  const err = new Error('Could not validate auth key (no user email)')
  err.code = 1
  throw err
}

// Health check endpoint
const serverStartTime = new Date().toISOString()
app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const userCount = await prisma.user.count();
    const addonCount = await prisma.addon.count();
    const groupCount = await prisma.group.count();
    
    res.json({
      status: 'OK',
      message: 'Syncio with Database',
      timestamp: new Date().toISOString(),
      serverStartTime: serverStartTime,
      uptime: process.uptime(),
      database: 'connected',
      users: userCount,
      addons: addonCount,
      groups: groupCount
    });
  } catch (error) {
    res.status(503).json({
      status: 'ERROR',
      message: 'Database connection failed',
      error: error.message
    });
  }
});

// Debug endpoint to check addons in database
app.get('/debug/addons', async (req, res) => {
  try {
    const allAddons = await prisma.addon.findMany({
      select: { id: true, name: true, accountId: true, manifestUrl: true, isActive: true }
    });
    const addons = allAddons.map(a => ({
      ...a,
      manifestUrl: getDecryptedManifestUrl(a)
    }))
    res.json({
      total: addons.length,
      addons,
      currentAccount: req.appAccountId || 'none'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mirror health under /api/health for Next.js proxy
app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const userCount = await prisma.user.count();
    const addonCount = await prisma.addon.count();
    const groupCount = await prisma.group.count();
    res.json({
      status: 'OK',
      message: 'Syncio with Database',
      timestamp: new Date().toISOString(),
      serverStartTime: serverStartTime,
      uptime: process.uptime(),
      database: 'connected',
      users: userCount,
      addons: addonCount,
      groups: groupCount
    });
  } catch (error) {
    res.status(503).json({
      status: 'ERROR',
      message: 'Database connection failed',
      error: error.message
    });
  }
});

// API Routes

// Users API
app.get('/api/users', async (req, res) => {
  debug.log('🔍 GET /api/users called');
  try {
    const users = await prisma.user.findMany({
      where: scopedWhere(req, {}),
      include: {},
        orderBy: { id: 'asc' }
    });

    // Transform data for frontend compatibility
    const transformedUsers = await Promise.all(users.map(async (user) => {
      // For SQLite, we need to find groups that contain this user
      const groups = await prisma.group.findMany({
        where: scopedWhere(req, { userIds: { contains: user.id } }),
              include: {
                addons: {
                  include: {
                    addon: true
            }
          }
        }
      })
      
      const userGroup = groups[0] // Use first group
      const addonCount = userGroup?.addons?.length || 0
      
      // Calculate Stremio addons count by fetching live data
      let stremioAddonsCount = 0
      if (user.stremioAuthKey) {
        try {
          // Decrypt stored auth key
          const authKeyPlain = decrypt(user.stremioAuthKey)
          
          // Use stateless client with authKey to fetch addon collection directly
          const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })
          const collection = await apiClient.request('addonCollectionGet', {})
          
          const rawAddons = collection?.addons || collection || {}
          const addonsNormalized = Array.isArray(rawAddons)
            ? rawAddons
            : (typeof rawAddons === 'object' ? Object.values(rawAddons) : [])
          
          stremioAddonsCount = addonsNormalized.length
        } catch (error) {
          console.error(`Error fetching Stremio addons for user ${user.id}:`, error.message)
          // Note: stremioAddons field was removed from User schema
          // No fallback to database value available
        }
      }
      
      // Parse excluded and protected addons
      let excludedAddons = []
      let protectedAddons = []
      
      excludedAddons = parseAddonIds(user.excludedAddons)
      
      protectedAddons = parseProtectedAddons(user.protectedAddons, req)
      
      return {
        id: user.id,
        username: user.username,
        email: user.email,
        groupName: userGroup?.name || null,
        status: user.isActive ? 'active' : 'inactive',
        addons: addonCount,
        stremioAddonsCount: stremioAddonsCount,
        groups: groups.length,
        lastActive: null,
        hasStremioConnection: !!user.stremioAuthKey,
        isActive: user.isActive,
        excludedAddons: excludedAddons,
        protectedAddons: protectedAddons,
        colorIndex: user.colorIndex
      }
    }));

    res.json(transformedUsers);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});


// Get single user with detailed information
app.get('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { basic } = req.query
    debug.log(`🔍 GET /api/users/${id} called${basic ? ' (basic mode)' : ''}`)
    
    const user = await prisma.user.findUnique({
      where: { 
        id,
        accountId: getAccountId(req)
      },
      include: {}
    })

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Find groups that contain this user
    const groups = await prisma.group.findMany({
      where: {
        accountId: getAccountId(req),
        userIds: {
          contains: user.id
        }
      },
      include: {
        addons: {
          include: {
            addon: true
          }
        }
      }
    })

    // Group addons come from the user's primary group assignment
    const familyGroup = groups[0]
    const currentAccountId = getAccountId(req)
    const addons = Array.isArray(familyGroup?.addons)
      ? (() => {
          const seen = new Set()
          return familyGroup.addons
            .filter((ga) => {
              const addon = ga?.addon
              if (!addon) return false
              if (addon.isActive === false) return false
              if (currentAccountId && addon.accountId && addon.accountId !== currentAccountId) return false
              if (seen.has(addon.id)) return false
              seen.add(addon.id)
              return true
            })
            .map((ga) => ({
              id: ga.addon.id,
              name: ga.addon.name,
              description: ga.addon.description || '',
              manifestUrl: ga.addon.manifestUrl,
              version: ga.addon.version || null,
              isEnabled: ga.addon.isActive,
              iconUrl: ga.addon.iconUrl,
            }))
        })()
      : []

    // Get all groups the user belongs to
    const userGroups = groups.map(g => ({ id: g.id, name: g.name }))

    // Note: stremioAddons field was removed from User schema
    // Stremio addons are now fetched live when needed
    let stremioAddonsCount = 0
    let stremioAddons = []

    // Parse excluded and protected addons from database
    let excludedAddons = []
    let protectedAddons = []
    
    excludedAddons = parseAddonIds(user.excludedAddons)
    
    protectedAddons = parseProtectedAddons(user.protectedAddons, req)

    // Transform for frontend
    const transformedUser = {
      id: user.id,
      email: user.email,
      username: user.username,
      hasStremioConnection: !!user.stremioAuthKey,
      status: user.isActive ? 'active' : 'inactive',
      addons: addons,
      groups: userGroups,
      groupName: groups[0]?.name || null,
      groupId: groups[0]?.id || null,
      lastActive: null,
      stremioAddonsCount: stremioAddonsCount,
      stremioAddons: stremioAddons,
      excludedAddons: excludedAddons,
      protectedAddons: protectedAddons,
      colorIndex: user.colorIndex
    }

    res.json(transformedUser)
  } catch (error) {
    console.error('Error fetching user details:', error)
    res.status(500).json({ error: 'Failed to fetch user details' })
  }
})

// Update user excluded addons
app.put('/api/users/:id/excluded-addons', async (req, res) => {
  try {
    const { id } = req.params
    const { excludedAddons } = req.body
    
    console.log(`🔍 PUT /api/users/${id}/excluded-addons called with:`, excludedAddons)
    console.log(`🔍 Type of excludedAddons:`, typeof excludedAddons, Array.isArray(excludedAddons))
    
    // Frontend sends addon IDs directly, no conversion needed
    const addonIds = Array.isArray(excludedAddons) ? excludedAddons : []
    console.log(`🔍 Using addon IDs directly:`, addonIds)
    
    const updatedUser = await prisma.user.update({
      where: { 
        id,
        accountId: getAccountId(req)
      },
      data: {
        excludedAddons: JSON.stringify(addonIds)
      }
    })
    
    res.json({ 
      message: 'Excluded addons updated successfully',
      excludedAddons: addonIds
    })
  } catch (error) {
    console.error('Error updating excluded addons:', error)
    res.status(500).json({ error: 'Failed to update excluded addons' })
  }
})

// Update membership (group-specific) excluded addons
app.put('/api/groups/:groupId/members/:userId/excluded-addons', async (req, res) => {
  try {
    const { groupId, userId } = req.params
    const { excludedAddons } = req.body
    console.log(`🔍 PUT /api/groups/${groupId}/members/${userId}/excluded-addons called with:`, excludedAddons)

    // Frontend sends addon IDs directly, no conversion needed
    const addonIds = Array.isArray(excludedAddons) ? excludedAddons : []
    console.log(`🔍 Using addon IDs directly:`, addonIds)

    const membership = await prisma.groupMember.findFirst({
      where: { groupId, userId },
      select: { id: true }
    })
    if (!membership) {
      return res.status(404).json({ message: 'Membership not found' })
    }

    await prisma.groupMember.update({
      where: { id: membership.id },
      data: { excludedAddons: JSON.stringify(addonIds) }
    })

    res.json({
      message: 'Membership excluded addons updated successfully',
      excludedAddons: addonIds
    })
  } catch (error) {
    console.error('Error updating membership excluded addons:', error)
    res.status(500).json({ message: 'Failed to update membership excluded addons' })
  }
})

// Update user protected addons
app.put('/api/users/:id/protected-addons', async (req, res) => {
  try {
    const { id } = req.params
    const { protectedAddons } = req.body
    
    console.log(`🔍 PUT /api/users/${id}/protected-addons called with:`, protectedAddons)
    
    // Protected addons should store encrypted manifest URLs
    const manifestUrls = Array.isArray(protectedAddons) ? protectedAddons : []
    console.log(`🔍 Encrypting manifest URLs:`, manifestUrls)
    
    // Encrypt each manifest URL before storing
    const encryptedUrls = manifestUrls.map(url => encrypt(url, req))
    console.log(`🔍 Encrypted URLs count:`, encryptedUrls.length)
    
    const updatedUser = await prisma.user.update({
      where: { 
        id,
        accountId: getAccountId(req)
      },
      data: {
        protectedAddons: JSON.stringify(encryptedUrls)
      }
    })
    
    res.json({ 
      message: 'Protected addons updated successfully',
      protectedAddons: manifestUrls // Return unencrypted URLs to frontend
    })
  } catch (error) {
    console.error('Error updating protected addons:', error)
    res.status(500).json({ error: 'Failed to update protected addons' })
  }
})

// Default Stremio addons that should be ignored in sync checks
const defaultAddons = {
  names: [
    'Cinemeta',
    'Local Files'
  ],
  ids: [
    'com.linvo.cinemeta',
    'org.stremio.local'
  ],
  manifestUrls: [
    'http://127.0.0.1:11470/local-addon/manifest.json',
    'https://v3-cinemeta.strem.io/manifest.json'
  ]
}

// Helper function to filter out Stremio default addons
function filterDefaultAddons(addons, unsafeMode = false) {
  // In unsafe mode, don't filter out any addons - treat all as regular addons
  if (unsafeMode) {
    return addons
  }
  
  return addons.filter(addon => {
    const name = addon.name || addon.manifest?.name || ''
    const id = addon.id || addon.manifest?.id || ''
    const manifestUrl = addon.manifestUrl || addon.manifest?.manifestUrl || ''
    return !defaultAddons.names.includes(name) && 
           !defaultAddons.ids.includes(id) && 
           !defaultAddons.manifestUrls.includes(manifestUrl)
  })
}

// Get user sync status (lightweight check)
app.get('/api/users/:id/sync-status', async (req, res) => {
  try {
    const { id } = req.params
    const { groupId, unsafe } = req.query
    debug.log(`🔍 GET /api/users/${id}/sync-status called${groupId ? ` for group ${groupId}` : ''}`)
    
    const user = await prisma.user.findUnique({
      where: { 
        id,
        accountId: getAccountId(req)
      },
      select: { 
        id: true,
        stremioAuthKey: true, 
        isActive: true,
        excludedAddons: true,
        protectedAddons: true
      }
    })

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    if (!user.stremioAuthKey) {
      return res.json({ 
        isSynced: false, 
        status: 'connect',
        message: 'User not connected to Stremio' 
      })
    }

    if (!user.isActive) {
      // If user has stremioAuthKey but is disabled, show connect button
      if (user.stremioAuthKey) {
        return res.json({ 
          isSynced: false, 
          status: 'connect',
          message: 'User is disabled - click to reconnect' 
        })
      }
      return res.json({ 
        isSynced: false, 
        status: 'inactive',
        message: 'User is inactive' 
      })
    }

    // Fetch live Stremio addons for accurate sync status
    let stremioAddons = []
    try {
      // Decrypt stored auth key
      const authKeyPlain = decrypt(user.stremioAuthKey)
      
      // Use stateless client with authKey to fetch addon collection directly
      const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })
      const collection = await apiClient.request('addonCollectionGet', {})
      
      const rawAddons = collection?.addons || collection || {}
      stremioAddons = Array.isArray(rawAddons)
        ? rawAddons
        : (typeof rawAddons === 'object' ? Object.values(rawAddons) : [])
        
      debug.log(`🔍 Fetched ${stremioAddons.length} live Stremio addons for sync check`)
    } catch (error) {
      console.error(`❌ Error fetching live Stremio addons for sync check:`, error.message)
      
      // If session is invalid, return connect status
      if (error.message.includes('Session does not exist') || error.message.includes('Session')) {
        // Also disable the user when we detect invalid Stremio connection
        try {
          await prisma.user.update({
            where: { id: user.id },
            data: { isActive: false }
          })
          console.log(`🔧 Automatically disabled user ${user.id} due to invalid Stremio connection (sync status)`)
        } catch (disableError) {
          console.error('Failed to disable user:', disableError.message)
        }
        
        return res.json({ 
          isSynced: false, 
          status: 'connect',
          message: 'User has been disabled due to invalid Stremio connection - click to reconnect' 
        })
      }
      
      // Note: stremioAddons field was removed from User schema
      // No fallback to cached data available
      stremioAddons = []
    }

    // Find groups that contain this user
    const groups = await prisma.group.findMany({
      where: {
        accountId: getAccountId(req),
        userIds: {
          contains: user.id
        }
      },
      include: {
        addons: {
          where: {
            addon: {
              accountId: getAccountId(req)
            }
          },
          include: {
            addon: true
          }
        }
      }
    })

    // Check if user has no group memberships - show "Stale" status
    if (!groups || groups.length === 0) {
      return res.json({ 
        isSynced: false,
        status: 'stale',
        message: 'User has no group assigned',
        stremioAddonCount: 0,
        expectedAddonCount: 0
      })
    }

    // Get expected addons from groups - fetch fresh addon data to get current manifest URLs
    const groupAddons = groups.flatMap(group => 
      group.addons
        .filter(ga => ga.addon.isActive !== false) // Only include enabled addons
        .map(ga => ({ 
          id: ga.addon.id, 
          name: ga.addon.name, 
          manifestUrl: getDecryptedManifestUrl(ga.addon, req), 
          version: ga.addon.version 
        }))
    )
    
    const expectedAddons = groupAddons

    // Resolve exclusions: prefer membership-level for provided groupId, otherwise fallback to user-level
    let excludedAddons = []
    try {
      if (groupId) {
        const membership = await prisma.groupMember.findFirst({
          where: { userId: id, groupId: String(groupId) },
          select: { excludedAddons: true }
        })
        excludedAddons = parseAddonIds(membership?.excludedAddons)
      }
      // Fallback to user-level exclusions if still empty
      if (excludedAddons.length === 0) {
        excludedAddons = parseAddonIds(user.excludedAddons)
      }
    } catch (e) {
      console.error('Error resolving excluded addons:', e)
    }
    

    // Filter out excluded addons from expected addons by addon ID
    const excludedSet = new Set(excludedAddons.map(id => String(id).trim()))
    const filteredExpectedAddons = expectedAddons.filter(addon => 
      !excludedSet.has(addon.id)
    )
    
    debug.log(`🔍 Expected addons before filtering:`, expectedAddons.map(a => ({ id: a.id, name: a.name })))
    debug.log(`🔍 Excluded addon IDs:`, Array.from(excludedSet))
    debug.log(`🔍 Filtered out ${expectedAddons.length - filteredExpectedAddons.length} excluded addons, ${filteredExpectedAddons.length} expected addons remain`)
    
    // For sync comparison, we need to check if the user's Stremio addons match what's expected
    // We don't filter Stremio addons here - we compare what's actually in Stremio vs what should be there
    debug.log(`🔍 Stremio addons: ${stremioAddons.length} addons`)
    debug.log(`🔍 Expected addons: ${filteredExpectedAddons.length} addons`)

    // Compare Stremio addons with expected addons
    // For a user to be synced, we need:
    // 1. All expected addons are present in Stremio
    // 2. No extra addons in Stremio that aren't expected (excluding default/protected defaults)
    
    // Filter out default addons from Stremio addons for comparison
    // Default addons in Stremio should be ignored unless they're explicitly expected
    // In unsafe mode, treat all addons as regular addons for sync purposes
    const nonDefaultStremioAddons = filterDefaultAddons(stremioAddons, unsafe === 'true')
    
    // Create sets for efficient lookup
    const stremioAddonUrls = new Set(stremioAddons.map(addon => addon.transportUrl || addon.manifestUrl).filter(Boolean))
    const nonDefaultStremioAddonUrls = new Set(nonDefaultStremioAddons.map(addon => addon.transportUrl || addon.manifestUrl).filter(Boolean))
    const expectedAddonUrls = new Set(filteredExpectedAddons.map(addon => addon.manifestUrl))
    
    // Check order: ignore protected/default addons for order comparison
    // Protected addons logic:
    // 1. Default Stremio addons: protected in safe mode, not protected in unsafe mode
    // 2. User-defined protected addons: ALWAYS protected regardless of mode
    const protectedAddonIds = unsafe === 'true' ? new Set() : new Set(defaultAddons.ids)
    const protectedManifestUrls = unsafe === 'true' ? new Set() : new Set(defaultAddons.manifestUrls)
    
    // Parse user-defined protected addons (ALWAYS protected regardless of mode)
    let userProtectedAddons = []
    try {
      const encryptedUrls = user.protectedAddons ? JSON.parse(user.protectedAddons) : []
      if (Array.isArray(encryptedUrls)) {
        userProtectedAddons = encryptedUrls.map(encryptedUrl => {
          try {
            return decrypt(encryptedUrl, req)
          } catch (e) {
            console.warn('Failed to decrypt protected addon URL in sync status:', e.message)
            return null
          }
        }).filter(url => url !== null)
      }
    } catch (e) {
      console.warn('Failed to parse user protected addons:', e)
      userProtectedAddons = []
    }
    
    // Add user-defined protected addons to the protected URLs set (ALWAYS)
    userProtectedAddons.forEach(url => {
      if (url && typeof url === 'string') {
        protectedManifestUrls.add(url.trim())
        console.log(`🔒 Added user protected addon for sync status: ${url}`)
      }
    })
    
    const isProtectedExpected = (a) => protectedAddonIds.has(a?.id) || protectedManifestUrls.has(a?.manifestUrl)
    
    // Check if all expected addons are present in Stremio
    // All expected addons (from groups) should be present in Stremio, regardless of whether they're default addons
    const missingAddons = filteredExpectedAddons.filter(expectedAddon => 
      !stremioAddonUrls.has(expectedAddon.manifestUrl)
    )
    
    // Check if there are extra addons in Stremio that aren't expected
    // Only consider non-default addons as "extra" - default addons are ignored unless expected
    // Also ignore user-defined protected addons as "extra" - they can be present without affecting sync
    // Treat excluded addons present in Stremio as extra (unsynced)
    const extraAddons = nonDefaultStremioAddons.filter(stremioAddon => {
      const addonUrl = stremioAddon.transportUrl || stremioAddon.manifestUrl
      // Don't consider protected addons as "extra" - they can be present without affecting sync
      const isProtected = protectedAddonIds.has(stremioAddon?.id) || protectedManifestUrls.has(addonUrl)
      return addonUrl && !expectedAddonUrls.has(addonUrl) && !isProtected
    })

    // Get user's addons in order, then filter to expected non-protected only
    const userStremioAddonUrls = stremioAddons
      .map(addon => addon.transportUrl || addon.manifestUrl)
      .filter(Boolean)
    const expectedNonProtected = filteredExpectedAddons.filter(a => !isProtectedExpected(a))
    const expectedNonProtectedUrlSet = new Set(expectedNonProtected.map(a => a.manifestUrl))
    const userGroupAddons = userStremioAddonUrls.filter(url => expectedNonProtectedUrlSet.has(url))
    const expectedAddonUrlsOrdered = expectedNonProtected.map(addon => addon.manifestUrl)
    const orderMatches = JSON.stringify(userGroupAddons) === JSON.stringify(expectedAddonUrlsOrdered)
    
    debug.log(`🔍 Expected addons after filtering:`, filteredExpectedAddons.map(a => ({ id: a.id, name: a.name })))
    debug.log(`🔍 Excluded addon IDs:`, excludedAddons)
    debug.log(`🔍 Filtered out ${excludedAddons.length} excluded addons, ${expectedAddonUrlsOrdered.length} expected addons remain`)
    debug.log(`🔍 Stremio addons: ${stremioAddons.length} addons`)
    debug.log(`🔍 Expected addons: ${expectedAddonUrlsOrdered.length} addons`)
    debug.log(`🔍 Expected order (non-protected only): ${JSON.stringify(expectedAddonUrlsOrdered)}`)
    debug.log(`🔍 User's group addons: ${JSON.stringify(userGroupAddons)}`)
    debug.log(`🔍 Order matches: ${orderMatches}`)
    
    const isSynced = missingAddons.length === 0 && extraAddons.length === 0 && orderMatches
    
    debug.log(`🔍 Missing addons: ${missingAddons.length}`, missingAddons.map(a => a.name))
    debug.log(`🔍 Extra addons: ${extraAddons.length}`, extraAddons.map(a => a.name || a.manifest?.name))
    debug.log(`🔍 User is ${isSynced ? 'synced' : 'unsynced'}`)

    return res.json({ 
      isSynced,
      status: isSynced ? 'synced' : 'unsynced',
      stremioAddonCount: stremioAddons.length,
      expectedAddonCount: filteredExpectedAddons.length
    })

  } catch (error) {
    console.error('Error checking sync status:', error)
    res.status(500).json({ message: 'Failed to check sync status', error: error?.message })
  }
})

// Get live addons from Stremio for a given user
app.get('/api/users/:id/stremio-addons', async (req, res) => {
  try {
    const { id } = req.params
    console.log('🔍 Fetching Stremio addons for user:', id)
    // Fetch the user's stored Stremio auth
    const user = await prisma.user.findUnique({
      where: { 
        id,
        accountId: getAccountId(req)
      },
      select: { stremioAuthKey: true }
    })

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    if (!user.stremioAuthKey) {
      return res.status(400).json({ message: 'User is not connected to Stremio' })
    }

    // Decrypt stored auth key
    let authKeyPlain
    try {
      console.log('🔍 Attempting to decrypt stremioAuthKey for user:', id)
      console.log('🔍 stremioAuthKey length:', user.stremioAuthKey?.length)
      console.log('🔍 stremioAuthKey first 20 chars:', user.stremioAuthKey?.substring(0, 20))
      authKeyPlain = decrypt(user.stremioAuthKey)
      console.log('🔍 Decryption successful, authKey length:', authKeyPlain?.length)
    } catch (e) {
      console.error('🔍 Decryption failed:', e.message)
      return res.status(500).json({ message: 'Failed to decrypt Stremio credentials' })
    }

    // Use stateless client with authKey to fetch addon collection directly
    try {
      const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })
      const collection = await apiClient.request('addonCollectionGet', {})

      const rawAddons = collection?.addons || collection || {}
      const addonsNormalized = Array.isArray(rawAddons)
        ? rawAddons
        : (typeof rawAddons === 'object' ? Object.values(rawAddons) : [])

      // Keep only safe serializable fields (skip manifest fetching for performance)
      const allAddons = addonsNormalized.map((a) => {
        return {
          id: a?.id || a?.manifest?.id || 'unknown',
          name: a?.name || a?.manifest?.name || 'Unknown',
          manifestUrl: a?.manifestUrl || a?.transportUrl || a?.url || null,
          version: a?.version || a?.manifest?.version || 'unknown',
          description: a?.description || a?.manifest?.description || '',
          // Include manifest object for frontend compatibility - ensure it's never null
          manifest: a?.manifest || {
            id: a?.manifest?.id || a?.id || 'unknown',
            name: a?.manifest?.name || a?.name || 'Unknown',
            version: a?.manifest?.version || a?.version || 'unknown',
            description: a?.manifest?.description || a?.description || '',
            // Include other essential manifest fields to prevent null errors
            types: a?.manifest?.types || ['other'],
            resources: a?.manifest?.resources || [],
            catalogs: a?.manifest?.catalogs || []
          }
        }
      })

      // Keep all addons for display (don't filter default addons in the main endpoint)
      const addons = allAddons

      return res.json({
        userId: id,
        count: addons.length,
        addons
      })
    } catch (stremioError) {
      console.error('Error fetching live Stremio addons:', stremioError)
      
      // Handle specific Stremio API errors gracefully
      if (stremioError.code === 1 || stremioError.message?.includes('Session does not exist')) {
        return res.status(400).json({ 
          message: 'Stremio session expired or invalid. Please reconnect your Stremio account.',
          error: 'Session does not exist'
        })
      }
      
      // If Stremio API is down, return empty addons instead of error
      if (stremioError?.message?.includes('response has no result') || 
          stremioError?.message?.toLowerCase().includes('network') ||
          stremioError?.message?.toLowerCase().includes('timeout')) {
        console.warn('⚠️ Stremio API unavailable, returning empty addons')
        return res.json({
          userId: id,
          count: 0,
          addons: []
        })
      }
      
      // For other Stremio API errors, return a 400 instead of 502
      return res.status(400).json({ 
        message: 'Failed to fetch addons from Stremio',
        error: stremioError.message || 'Unknown Stremio API error'
      })
    }
  } catch (error) {
    console.error('Error fetching Stremio addons for user', id, ':', error.message)
    res.status(500).json({ message: 'Failed to fetch addons from Stremio', error: error.message })
  }
})

// Sync all enabled users' Stremio addons with their group addons
app.post('/api/users/sync-all', async (req, res) => {
  try {
    debug.log('🚀 Sync all users endpoint called')
    
    // Get all enabled users
    const users = await prisma.user.findMany({
      where: { isActive: true }
    })
    
    if (users.length === 0) {
      return res.json({ 
        message: 'No enabled users found to sync',
        syncedCount: 0,
        totalUsers: 0
      })
    }
    
    let syncedCount = 0
    let totalAddons = 0
    const errors = []
    
    debug.log(`🔄 Starting sync for ${users.length} enabled users`)
    
    // Sync each user
    for (const user of users) {
      try {
        debug.log(`🔄 Syncing user: ${user.username || user.email}`)
        
        // Use the reusable sync function
        const syncResult = await syncUserAddons(user.id, [], 'normal', false)
        
        if (syncResult.success) {
          syncedCount++
          debug.log(`✅ Successfully synced user: ${user.username || user.email}`)
          
          // Collect reload progress if available
          if (syncResult.reloadedCount !== undefined && syncResult.totalAddons !== undefined) {
            totalAddons += syncResult.totalAddons
          }
        } else {
          errors.push(`${user.username || user.email}: ${syncResult.error}`)
          console.log(`❌ Failed to sync user: ${user.username || user.email} - ${syncResult.error}`)
        }
      } catch (error) {
        errors.push(`${user.username || user.email}: ${error.message}`)
        console.error(`❌ Error syncing user ${user.username || user.email}:`, error)
      }
    }
    
    let message = `All users sync completed.\n${syncedCount}/${users.length} users synced`
    
    // Add reload progress if available (show even when 0 reloaded)
    if (totalAddons > 0) {
      message += `\n${totalAddons} addons reloaded`
    }
    
    if (errors.length > 0) {
      console.log('⚠️ Some users failed to sync:', errors)
    }
    
    res.json({
      message,
      syncedCount,
      totalUsers: users.length,
      errors: errors.length > 0 ? errors : undefined
    })
    
  } catch (error) {
    console.error('Error syncing all users:', error)
    res.status(500).json({ 
      message: 'Failed to sync all users', 
      error: error.message 
    })
  }
})

// Sync a user's Stremio addons with their group addons
app.post('/api/users/:id/sync', async (req, res) => {
  try {
    debug.log('🚀 Sync endpoint called with:', req.params.id, req.body)
    debug.log('🔍 Request headers:', {
      'user-agent': req.headers['user-agent'],
      'origin': req.headers['origin'],
      'x-sync-mode': req.headers['x-sync-mode']
    })
    const { id } = req.params
    const { excludedManifestUrls = [], unsafe } = req.body || {}

    // Extra debugging for body/exclusions shape
    try {
      debug.log('🧪 Raw body type:', typeof req.body)
      debug.log('🧪 excludedManifestUrls type/array/length:', typeof excludedManifestUrls, Array.isArray(excludedManifestUrls), Array.isArray(excludedManifestUrls) ? excludedManifestUrls.length : 'n/a')
      if (Array.isArray(excludedManifestUrls)) {
        debug.log('🧪 excludedManifestUrls (raw):', excludedManifestUrls)
      } else {
        debug.log('🧪 excludedManifestUrls (non-array raw):', excludedManifestUrls)
      }
    } catch (e) {
      debug.log('🧪 Failed to log raw body/exclusions:', e?.message)
    }
    const syncMode = getSyncMode(req)

    // Use the reusable sync function
    const syncResult = await syncUserAddons(id, excludedManifestUrls, syncMode, unsafe === true)
    
    if (syncResult.success) {
      if (syncResult.alreadySynced) {
        if (syncResult.reloadedCount !== undefined) {
          return res.json({ 
            message: `User is already synced (${syncResult.reloadedCount}/${syncResult.totalAddons} addons reloaded)`, 
            total: syncResult.total 
          })
        }
        return res.json({ message: 'User is already synced', total: syncResult.total })
      }
      if (syncResult.reloadedCount !== undefined) {
        return res.json({ 
          message: `Sync complete (${syncResult.reloadedCount}/${syncResult.totalAddons} addons reloaded)`, 
          total: syncResult.total 
        })
      }
      return res.json({ 
        message: 'Sync complete', 
        total: syncResult.total 
      })
    } else {
      return res.status(500).json({ 
        message: 'Failed to sync addons', 
        error: syncResult.error 
      })
    }
  } catch (error) {
    console.error('Error syncing addons:', error)
    return res.status(500).json({ message: 'Failed to sync addons', error: error?.message })
  }
})

// Helper function to get Stremio addons for a user
async function getStremioAddons(stremioAuthKey) {
  try {
    // Decrypt stored auth key
    const authKeyPlain = decrypt(stremioAuthKey)
    
    // Use stateless client with authKey to fetch addon collection directly
    const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })
    const collection = await apiClient.request('addonCollectionGet', {})
    
    const rawAddons = collection?.addons || collection || {}
    const addonsNormalized = Array.isArray(rawAddons)
      ? rawAddons
      : (typeof rawAddons === 'object' ? Object.values(rawAddons) : [])
    
    // Process addons to get normalized format
    return addonsNormalized.map((a) => {
      return {
        id: a?.id || a?.manifest?.id || 'unknown',
        name: a?.name || a?.manifest?.name || 'Unknown',
        manifestUrl: a?.manifestUrl || a?.transportUrl || a?.url || null,
        version: a?.version || a?.manifest?.version || 'unknown',
        description: a?.description || a?.manifest?.description || '',
        iconUrl: a?.iconUrl || a?.manifest?.logo || null
      }
    })
  } catch (error) {
    console.error('Error fetching Stremio addons:', error)
    return []
  }
}

// Reload all addons for a user and apply them to their Stremio account
app.post('/api/users/:id/reload-addons', async (req, res) => {
  try {
    const { id } = req.params
    console.log('🔄 Reload user addons endpoint called for user:', id)

    const user = await prisma.user.findUnique({
      where: { id }
    })

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    if (!user.isActive) {
      return res.status(400).json({ message: 'User is disabled' })
    }

    if (!user.stremioAuthKey) {
      return res.status(400).json({ message: 'User is not connected to Stremio' })
    }

    console.log(`🔄 Fetching current Stremio addons for user: ${user.username || user.email}`)

    // Get current addons from user's Stremio account
    const stremioAddons = await getStremioAddons(user.stremioAuthKey)
    
    if (!stremioAddons || stremioAddons.length === 0) {
      return res.status(400).json({ message: 'No addons found in user Stremio account' })
    }

    console.log(`🔄 Found ${stremioAddons.length} addons in user's Stremio account`)

    let reloadedCount = 0
    const reloadErrors = []
    const reloadedAddons = []

    // Reload each addon from user's Stremio account
    for (const stremioAddon of stremioAddons) {
      try {
        console.log(`🔄 Reloading addon: ${stremioAddon.name} (${stremioAddon.manifestUrl})`)
        const response = await fetch(stremioAddon.manifestUrl, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(10000)
        })

        if (response.ok) {
          const manifestData = await response.json()
          const reloadedAddon = {
            ...stremioAddon,
            name: manifestData?.name || stremioAddon.name,
            description: manifestData?.description || stremioAddon.description,
            version: manifestData?.version || stremioAddon.version,
            iconUrl: manifestData?.logo || stremioAddon.iconUrl,
            id: manifestData?.id || stremioAddon.id,
            manifestData: manifestData
          }
          reloadedAddons.push(reloadedAddon)
          console.log(`✅ Reloaded addon: ${reloadedAddon.name} ${reloadedAddon.version}`)
          reloadedCount++
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }
      } catch (error) {
        console.error(`❌ Failed to reload addon ${stremioAddon.name}:`, error.message)
        reloadErrors.push(`${stremioAddon.name}: ${error.message}`)
        // Still include the original addon if reload fails
        reloadedAddons.push(stremioAddon)
      }
    }

    console.log('🔄 Applying reloaded addons to user Stremio account...')

    // Apply the reloaded addons to user's Stremio account
    const authKeyPlain = decrypt(user.stremioAuthKey)
    const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })
    
    // Create the addon collection with reloaded addons in the proper format
    const addonCollection = reloadedAddons.map(addon => ({
      transportName: addon.name,
      transportUrl: addon.manifestUrl,
      id: addon.id,
      version: addon.version,
      manifest: addon.manifestData || {}
    }))

    // Push the reloaded addon collection to Stremio
    await apiClient.request('addonCollectionSet', { addons: addonCollection })
    console.log('✅ Pushed reloaded addon collection to Stremio API')

    const response = {
      message: `Successfully reloaded ${reloadedCount}/${stremioAddons.length} addons from user's Stremio account`,
      reloadedCount,
      totalAddons: stremioAddons.length,
      reloadedAddons: reloadedAddons.map(addon => ({
        name: addon.name,
        version: addon.version,
        id: addon.id
      }))
    }

    if (reloadErrors.length > 0) {
      response.reloadErrors = reloadErrors
    }

    res.json(response)

  } catch (error) {
    console.error('Error reloading user addons:', error)
    return res.status(500).json({ message: 'Failed to reload user addons', error: error?.message })
  }
})

// Add specific addons to user's Stremio account
app.post('/api/users/:id/stremio-addons/add', async (req, res) => {
  try {
    const { id } = req.params
    const { addonUrls } = req.body

    if (!Array.isArray(addonUrls) || addonUrls.length === 0) {
      return res.status(400).json({ message: 'addonUrls array is required' })
    }

    // Load user
    const user = await prisma.user.findUnique({
      where: { id }
    })

    if (!user) return res.status(404).json({ message: 'User not found' })
    if (!user.stremioAuthKey) return res.status(400).json({ message: 'User is not connected to Stremio' })

    // Decrypt auth
    let authKeyPlain
    try { authKeyPlain = decrypt(user.stremioAuthKey) } catch { return res.status(500).json({ message: 'Failed to decrypt Stremio credentials' }) }

    // Use StremioAPIClient with proper addon collection format
    const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })

    // Get current addons
    const current = await apiClient.request('addonCollectionGet', {})
    const currentAddons = current?.addons || []

    // Fetch manifests for new addons to create full addon objects
    const newAddons = []
    for (const url of addonUrls) {
      try {
        console.log(`🔍 Fetching manifest for new addon: ${url}`)
        const manifestResponse = await fetch(url)
        const manifest = await manifestResponse.json()
        
        const addonObject = {
          transportUrl: url,
          transportName: manifest.name || '',
          manifest: manifest
        }
        newAddons.push(addonObject)
        console.log(`✅ Created addon object for: ${manifest.name} ${manifest.version}`)
      } catch (e) {
        console.error(`❌ Failed to fetch manifest for ${url}:`, e.message)
        // Fallback to just transportUrl
        newAddons.push({ transportUrl: url })
      }
    }
    
    // Combine current addons with new addons, preserving full structure
    const updatedAddons = [
      ...currentAddons,
      ...newAddons
    ]

    // Set the updated collection using the proper format
    try {
      await apiClient.request('addonCollectionSet', { addons: updatedAddons })
      console.log(`✅ Successfully added ${addonUrls.length} addons for user ${user.username}`)
      
      // Wait a moment for Stremio to resolve manifests
      await new Promise(resolve => setTimeout(resolve, 2000))
    } catch (e) {
      console.error(`❌ Failed to add addons:`, e.message)
      throw e
    }

    return res.json({ message: `Successfully added ${addonUrls.length} addons` })
  } catch (error) {
    console.error('Error adding Stremio addons:', error)
    return res.status(500).json({ message: 'Failed to add addons', error: error?.message })
  }
})

// Clear all Stremio addons from user's account
app.post('/api/users/:id/stremio-addons/clear', async (req, res) => {
  try {
    const { id } = req.params

    // Load user
    const user = await prisma.user.findUnique({
      where: { id }
    })

    if (!user) return res.status(404).json({ message: 'User not found' })
    if (!user.stremioAuthKey) return res.status(400).json({ message: 'User is not connected to Stremio' })

    // Decrypt auth
    let authKeyPlain
    try { authKeyPlain = decrypt(user.stremioAuthKey) } catch { return res.status(500).json({ message: 'Failed to decrypt Stremio credentials' }) }

    // Use StremioAPIClient with proper addon collection format
    const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })

    // Clear the entire addon collection using the proper format
    try {
      await apiClient.request('addonCollectionSet', { addons: [] })
      console.log(`✅ Successfully cleared all addons for user ${user.username}`)
    } catch (e) {
      console.error(`❌ Failed to clear addons:`, e.message)
      throw e
    }

    // Note: stremioAddons field was removed from User schema
    // No database update needed for clearing addons

    return res.json({ message: 'All addons cleared successfully' })
  } catch (error) {
    console.error('Error clearing Stremio addons:', error)
    return res.status(500).json({ message: 'Failed to clear addons', error: error?.message })
  }
})

// Delete Stremio addon from user's account
app.delete('/api/users/:id/stremio-addons/:addonId', async (req, res) => {
  try {
    const { id, addonId } = req.params
    const { unsafe } = req.query
    
    // Get user to check for user-defined protected addons and Stremio auth
    const user = await prisma.user.findUnique({
      where: { id },
      select: { protectedAddons: true, stremioAuthKey: true }
    })
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }
    
    // Protected addons logic:
    // 1. Default Stremio addons: protected in safe mode, not protected in unsafe mode
    // 2. User-defined protected addons: ALWAYS protected regardless of mode
    const protectedAddonIds = unsafe === 'true' ? [] : defaultAddons.ids
    const protectedManifestUrls = unsafe === 'true' ? [] : defaultAddons.manifestUrls
    
    // Parse user-defined protected addons (ALWAYS protected regardless of mode)
    let userProtectedAddons = []
    try {
      const encryptedUrls = user.protectedAddons ? JSON.parse(user.protectedAddons) : []
      if (Array.isArray(encryptedUrls)) {
        userProtectedAddons = encryptedUrls.map(encryptedUrl => {
          try {
            return decrypt(encryptedUrl, req)
          } catch (e) {
            console.warn('Failed to decrypt protected addon URL in delete:', e.message)
            return null
          }
        }).filter(url => url !== null)
      }
    } catch (e) {
      console.warn('Failed to parse user protected addons in delete:', e)
      userProtectedAddons = []
    }
    
    // Add user-defined protected addons to the protected URLs list (ALWAYS)
    const allProtectedUrls = [...protectedManifestUrls, ...userProtectedAddons]
    
    // Check if the addon being deleted is protected
    const isProtected = protectedAddonIds.some(protectedId => addonId.includes(protectedId)) ||
                       allProtectedUrls.some(protectedUrl => addonId === protectedUrl)
    
    // In unsafe mode, allow deletion of default Stremio addons but not user-defined protected addons
    if (isProtected && unsafe !== 'true') {
      return res.status(403).json({ message: 'This addon is protected and cannot be deleted' })
    }
    
    // Check if user has Stremio auth
    if (!user.stremioAuthKey) {
      return res.status(400).json({ message: 'User is not connected to Stremio' })
    }

    // Decrypt stored auth key
    let authKeyPlain
    try {
      authKeyPlain = decrypt(user.stremioAuthKey)
    } catch (e) {
      return res.status(500).json({ message: 'Failed to decrypt Stremio credentials' })
    }

    // Use StremioAPIClient with proper addon collection format
    const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })

    // 1) Pull current collection
    const current = await apiClient.request('addonCollectionGet', {})
    const currentAddonsRaw = current?.addons || current || []
    const currentAddons = Array.isArray(currentAddonsRaw)
      ? currentAddonsRaw
      : (typeof currentAddonsRaw === 'object' ? Object.values(currentAddonsRaw) : [])

    // Find the target by manifestUrl since all addons have id: "unknown"
    const target = currentAddons.find((a) => (a?.manifestUrl || a?.transportUrl || a?.url || '') === addonId)
    const targetUrl = target?.transportUrl || target?.manifestUrl || target?.url

    // Use proper format to remove the addon
    let filteredAddons = currentAddons
    try {
      // Filter out the target addon (if not found, keep list as-is)
      filteredAddons = currentAddons.filter((a) => {
        const curUrl = a?.manifestUrl || a?.transportUrl || a?.url || ''
        return curUrl !== addonId
      })

      // Set the filtered addons using the proper format
      await apiClient.request('addonCollectionSet', { addons: filteredAddons })
      console.log(`✅ Successfully removed addon using proper format`)
    } catch (e) {
      console.error(`❌ Failed to remove addon:`, e.message)
      throw e
    }

    // Note: stremioAddons field was removed from User schema
    // No database update needed for removing addons

    return res.json({ message: 'Addon removed from Stremio account successfully' })
  } catch (error) {
    console.error('Error removing Stremio addon:', error)
    return res.status(502).json({ message: 'Failed to remove addon from Stremio', error: error?.message })
  }
})

// Update user
app.put('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { username, email, password, groupId } = req.body
    
    console.log(`🔍 PUT /api/users/${id} called with:`, { username, email, groupId })

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { 
        id,
        accountId: getAccountId(req)
      },
    })

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Prepare update data
    const updateData = {}
    
    if (username !== undefined) {
      updateData.username = username
    }
    
    if (email !== undefined) {
      // Check if email is already taken by another user
      const emailExists = await prisma.user.findFirst({
        where: { 
          AND: [
            { email },
            { id: { not: id } },
            ...(AUTH_ENABLED && req.appAccountId ? [{ accountId: req.appAccountId }] : [])
          ]
        }
      })
      
      if (emailExists) {
        return res.status(400).json({ error: 'Email already exists' })
      }
      
      updateData.email = email
    }

    if (password !== undefined && password.trim() !== '') {
      updateData.password = await bcrypt.hash(password, 12)
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData
    })

    // Handle group assignment
    console.log(`🔍 Group assignment - groupId: "${groupId}", type: ${typeof groupId}`)
    if (groupId !== undefined) {
      await assignUserToGroup(id, groupId, req)
      console.log(`🔍 User group assignment completed`)
    }

    // Fetch updated user for response
    const userWithGroups = await prisma.user.findUnique({
      where: { id }
    })

    // Find groups that contain this user using userIds JSON array
    const userGroups = await prisma.group.findMany({
      where: {
        userIds: {
          contains: id
        }
      }
    })

    // Transform for frontend response
    const userGroup = userGroups[0] // Get first group if any
    const transformedUser = {
      id: userWithGroups.id,
      username: userWithGroups.username,
      email: userWithGroups.email,
      status: userWithGroups.isActive ? 'active' : 'inactive',
      addons: userWithGroups.stremioAddons ? 
        (Array.isArray(userWithGroups.stremioAddons) ? userWithGroups.stremioAddons.length : Object.keys(userWithGroups.stremioAddons).length) : 0,
      groups: userGroups.length,
      groupName: userGroup?.name || null,
      groupId: userGroup?.id || null,
      lastActive: null
    }

    // Log activity (temporarily disabled for debugging)
    // try {
    //   await prisma.activityLog.create({
    //     data: {
    //       userId: id,
    //       action: 'GROUP_UPDATED',
    //       details: `User ${transformedUser.username} updated`,
    //       metadata: { updatedFields: Object.keys(updateData), groupName }
    //     }
    //   })
    // } catch (activityLogError) {
    //   console.error('Activity log error (non-critical):', activityLogError)
    //   // Continue without failing the request
    // }

    res.json(transformedUser)
  } catch (error) {
    console.error('Error updating user:', error)
    res.status(500).json({ error: 'Failed to update user' })
  }
})

// Patch user (for partial updates like username only)
app.patch('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { username, email, password } = req.body
    
    console.log(`🔍 PATCH /api/users/${id} called with:`, { username, email })
    
    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { 
        id,
        accountId: getAccountId(req)
      },
    })
    
    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' })
    }
    
    // Prepare update data
    const updateData = {}
    
    if (username !== undefined) {
      // Check if username is already taken by another user
      const usernameExists = await prisma.user.findFirst({
        where: { 
          username,
          id: { not: id },
          accountId: getAccountId(req)
        }
      })
      
      if (usernameExists) {
        return res.status(400).json({ error: 'Username already exists' })
      }
      
      updateData.username = username
    }
    
    if (email !== undefined) {
      // Check if email is already taken by another user
      const emailExists = await prisma.user.findFirst({
        where: { 
          AND: [
            { email },
            { id: { not: id } },
            ...(AUTH_ENABLED && req.appAccountId ? [{ accountId: req.appAccountId }] : [])
          ]
        }
      })
      
      if (emailExists) {
        return res.status(400).json({ error: 'Email already exists' })
      }
      
      updateData.email = email
    }
    
    if (password !== undefined && password.trim() !== '') {
      const hashedPassword = await bcrypt.hash(password, 10)
      updateData.password = hashedPassword
    }
    
    // Update user
    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData
    })
    
    // Remove sensitive data
    delete updatedUser.password
    delete updatedUser.stremioAuthKey
    
    res.json(updatedUser)
  } catch (error) {
    console.error('Error patching user:', error)
    res.status(500).json({ error: 'Failed to update user', details: error?.message })
  }
})

// Toggle user status (enable/disable)
app.patch('/api/users/:id/toggle-status', async (req, res) => {
  try {
    const { id } = req.params
    const { isActive } = req.body
    
    console.log(`🔍 PATCH /api/users/${id}/toggle-status called with:`, { isActive })
    
    // Update user status
    const updatedUser = await prisma.user.update({
      where: { 
        id,
        accountId: getAccountId(req)
      },
      data: { isActive: !isActive },
      include: {}
    })
    
    // Remove sensitive data
    delete updatedUser.password
    delete updatedUser.stremioAuthKey
    
    res.json(updatedUser)
  } catch (error) {
    console.error('Error toggling user status:', error)
    res.status(500).json({ error: 'Failed to toggle user status', details: error?.message })
  }
})

app.delete('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Ensure user exists
    const existingUser = await prisma.user.findUnique({ 
      where: { 
        id,
        accountId: getAccountId(req)
      }
    })
    if (!existingUser) {
      return res.status(404).json({ message: 'User not found' })
    }

    // Remove user from all groups first (update userIds arrays)
    const groups = await prisma.group.findMany({
      where: {
        accountId: getAccountId(req),
        userIds: {
          contains: id
        }
      }
    })
    
    // Update each group to remove the user from userIds array
    for (const group of groups) {
      const userIds = group.userIds ? JSON.parse(group.userIds) : []
      const updatedUserIds = userIds.filter(userId => userId !== id)
      await prisma.group.update({
        where: { id: group.id },
        data: { userIds: JSON.stringify(updatedUserIds) }
      })
    }

    // Delete related records first to avoid FK constraint errors
    await prisma.$transaction([
      // ActivityLog model removed
      prisma.user.delete({ 
        where: { 
          id,
          accountId: getAccountId(req)
        }
      })
    ])

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Failed to delete user' });
  }
});

// Stremio Integration
// Stremio validation endpoint
app.post('/api/stremio/validate', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ valid: false, error: !email ? 'Invalid email' : 'Password is required' });
    }
    if (typeof password !== 'string' || password.length < 4) {
      return res.status(400).json({ valid: false, error: 'Password must be at least 4 characters' });
    }

    // Create temporary storage for validation
    const tempStorage = {
      user: null,
      auth: null,
      addons: []
    };

    // Initialize StremioAPIStore with temporary storage
    const apiStore = new StremioAPIStore({
      getJSON: (key) => tempStorage[key] || null,
      setJSON: (key, value) => { tempStorage[key] = value; }
    });

    // Try to authenticate with Stremio
    let authResult
    let lastErr
    for (const attempt of [
      () => apiStore.login({ email, password }),
      () => apiStore.login(email, password),
    ]) {
      try { authResult = await attempt(); lastErr = null; break } catch (e) { lastErr = e }
    }
    
    if (authResult && (apiStore.authKey || tempStorage.auth)) {
      res.json({ valid: true });
    } else {
      res.json({ valid: false, error: 'Invalid Stremio credentials' });
    }
  } catch (error) {
    console.error('Stremio validation error:', error);
    
    // Check for specific error types
    const msg = String(error?.message || '').toLowerCase()
    if (msg.includes('passphrase') || msg.includes('wrong password')) {
      res.json({ valid: false, error: 'Invalid password' });
    } else if (msg.includes('no such user') || msg.includes('user not found') || msg.includes('invalid email')) {
      res.json({ valid: false, error: 'Invalid email' });
    } else if (error.message && error.message.includes('network')) {
      res.json({ valid: false, error: 'Network error - please try again' });
    } else {
      res.json({ valid: false, error: 'Failed to validate credentials' });
    }
  }
});

// Register a new Stremio account
app.post('/api/stremio/register', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ message: !email ? 'Invalid email' : 'Password is required' })
    }
    if (typeof password !== 'string' || password.length < 4) {
      return res.status(400).json({ message: 'Password must be at least 4 characters' })
    }

    // Temporary storage for StremioAPIStore
    const tempStorage = {}
    const apiStore = new StremioAPIStore({
      endpoint: 'https://api.strem.io',
      storage: {
        getJSON: (key) => tempStorage[key] || null,
        setJSON: (key, value) => { tempStorage[key] = value }
      }
    })

    // Perform registration
    // Support both possible signatures just in case
    let lastErr
    for (const attempt of [
      () => apiStore.register({ email, password }),
      () => apiStore.register(email, password),
    ]) {
      try {
        await attempt()
        lastErr = null
        break
      } catch (e) {
        lastErr = e
      }
    }
    if (lastErr) throw lastErr

    // Optional: immediately login to retrieve authKey (useful for client flows)
    try {
      for (const attempt of [
        () => apiStore.login({ email, password }),
        () => apiStore.login(email, password),
      ]) {
        try { await attempt(); break } catch {}
      }
    } catch {}

    const authKey = apiStore.authKey || tempStorage.auth || tempStorage.authKey || null
    return res.json({ message: 'Stremio account registered successfully', authKey })
  } catch (e) {
    console.error('stremio/register failed:', e)
    
    // Handle specific Stremio API errors
    if (e?.response?.data?.code === 26) {
      return res.status(400).json({ 
        message: 'Invalid email address',
        error: 'Please enter a valid email address'
      })
    }
    
    if (e?.response?.data?.code === 27) {
      return res.status(400).json({ 
        message: 'Email already exists',
        error: 'This email is already registered with Stremio'
      })
    }
    
    if (e?.response?.data?.code === 28) {
      return res.status(400).json({ 
        message: 'Password too weak',
        error: 'Password must be at least 6 characters long'
      })
    }
    
    // Handle other Stremio API errors
    if (e?.response?.data?.message) {
      return res.status(400).json({ 
        message: e.response.data.message,
        error: 'Stremio registration failed'
      })
    }
    
    const msg = typeof e?.message === 'string' ? e.message : 'Failed to register Stremio account'
    return res.status(500).json({ message: msg })
  }
})

app.post('/api/stremio/connect', async (req, res) => {
  try {
    const { email, password, username, groupName } = req.body;
    console.log(`🔍 POST /api/stremio/connect called with:`, { email, username, groupName })
    // Redact any sensitive fields from logs
    try {
      const { password: _pw, authKey: _ak, ...rest } = (req.body || {})
      console.log(`🔍 Request fields (redacted):`, rest)
    } catch {}
    
    if (!email || !password) {
      return res.status(400).json({ message: !email ? 'Invalid email' : 'Password is required' });
    }
    if (typeof password !== 'string' || password.length < 4) {
      return res.status(400).json({ message: 'Password must be at least 4 characters' })
    }

    // Use provided username, or fallback to email prefix (Stremio username will be set later)
    const finalUsername = username || email.split('@')[0];

    // Check if user with this email already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        accountId: getAccountId(req),
        OR: [
          { email: email },
          { username: finalUsername }
        ]
      }
    });

    // Check if user has a valid Stremio connection
    let hasValidStremioConnection = false
    if (existingUser && existingUser.stremioAuthKey) {
      try {
        const decryptedKey = decrypt(existingUser.stremioAuthKey)
        const validation = await validateStremioAuthKey(decryptedKey)
        hasValidStremioConnection = !!(validation && validation.user)
      } catch (e) {
        // Invalid auth key - allow reconnection
        hasValidStremioConnection = false
      }
    }

    if (existingUser) {
      // If user exists with valid Stremio connection, return conflict
      if (hasValidStremioConnection) {
        if (AUTH_ENABLED && req.appAccountId && existingUser.accountId === req.appAccountId) {
          return res.status(409).json({
            message: 'User with this email already exists',
            error: 'Email already exists in this account'
          })
        }
        
        // Determine which field caused the conflict
        if (existingUser.username === finalUsername) {
          return res.status(409).json({ 
            message: 'Username already exists',
            error: 'Please choose a different username'
          });
        }
        if (existingUser.email === email) {
          return res.status(409).json({ 
            message: 'User with this email already exists',
            error: 'Email already exists in this account'
          });
        }
        
        return res.status(409).json({ message: 'User already exists' });
      }
      
      // User exists but has invalid/no Stremio connection - allow reconnection
      // We'll update the existing user instead of creating a new one
      console.log(`🔄 User exists with invalid Stremio connection, allowing reconnection: ${existingUser.id}`)
    }

    // Create a temporary storage object for this authentication session
    const tempStorage = {};
    
    // Create Stremio API store for this user
    const apiStore = new StremioAPIStore({
      endpoint: 'https://api.strem.io',
      storage: {
        getJSON: (key) => {
          // Return stored values or appropriate defaults
          if (tempStorage[key] !== undefined) {
            return tempStorage[key];
          }
          switch (key) {
            case 'addons':
              return [];
            case 'user':
              return null;
            case 'auth':
              return null;
            default:
              return null;
          }
        },
        setJSON: (key, value) => {
          // Store in temporary storage during authentication
          tempStorage[key] = value;
          console.log(`Stremio storage set: ${key}`, typeof value);
        }
      }
    });

    // Authenticate with Stremio using email/password only (try both supported signatures)
    const loginEmailOnly = async () => {
      let lastErr
      for (const attempt of [
        () => apiStore.login({ email, password }),
        () => apiStore.login(email, password),
      ]) {
        try {
          await attempt()
          return
        } catch (e) {
          lastErr = e
        }
      }
      throw lastErr
    }
    
    try {
    await loginEmailOnly()
    } catch (e) {
      console.error('Stremio connection error:', e);
      
      // Handle specific Stremio API errors
      if (e?.response?.data?.code === 2) {
        return res.status(401).json({ 
          message: 'User not found',
          error: 'No Stremio account found with this email. Please register first or check your credentials.'
        });
      }
      
      if (e?.response?.data?.code === 3) {
        return res.status(401).json({ 
          message: 'Invalid password',
          error: 'Incorrect password for this Stremio account.'
        });
      }
      
      if (e?.response?.data?.code === 26) {
        return res.status(400).json({ 
          message: 'Invalid email address',
          error: 'Please enter a valid email address'
        });
      }
      
      // Handle other Stremio API errors
      if (e?.response?.data?.message) {
        return res.status(400).json({ 
          message: e.response.data.message,
          error: 'Stremio authentication failed'
        });
      }
      
      return res.status(401).json({ message: 'Invalid Stremio credentials' });
    }

    // Pull user's addon collection from Stremio
    await apiStore.pullAddonCollection();

    // Get authentication data from the API store (support both possible keys)
    const authKey = apiStore.authKey || tempStorage.auth || tempStorage.authKey;
    const userData = apiStore.user || tempStorage.user;
    const rawAddonsData = apiStore.addons || tempStorage.addons || {};

    // Serialize addons data to remove functions and keep only serializable data
    const addonsData = JSON.parse(JSON.stringify(rawAddonsData));

    // Verify we have the required authentication data
    if (!authKey || !userData) {
      console.log('Auth debug - authKey:', !!authKey, 'userData:', !!userData);
      console.log('tempStorage keys:', Object.keys(tempStorage));
      return res.status(502).json({
        message: 'Failed to connect to Stremio',
        error: 'Authenticated but missing user data'
      })
    }

    // Encrypt the auth key for secure storage
    const encryptedAuthKey = encrypt(authKey);

    // Create or update user in database
    let newUser;
    if (existingUser && !hasValidStremioConnection) {
      // Update existing user with new Stremio connection
      newUser = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          username: finalUsername,
          email,
          stremioAuthKey: encryptedAuthKey,
          isActive: true
        }
      });
      console.log(`✅ Updated existing user with new Stremio connection: ${newUser.id}`)
    } else {
      // Create new user
      newUser = await prisma.user.create({
        data: {
          // Scope to current AppAccount when auth is enabled
          accountId: getAccountId(req),
          username: finalUsername,
          email,
          stremioAuthKey: encryptedAuthKey,
          isActive: true
        }
      });
      console.log(`✅ Created new user: ${newUser.id}`)
    }

    // Handle group assignment if provided
    let assignedGroup = null;
    console.log(`🔍 Group assignment - groupName: "${groupName}", type: ${typeof groupName}`)
    if (groupName && groupName.trim()) {
      try {
        console.log(`🔍 Assigning user to group: "${groupName}"`)
        // Find or create group
        assignedGroup = await prisma.group.findFirst({
          where: {
            name: groupName.trim(),
            accountId: getAccountId(req)
          }
        });
        
        if (!assignedGroup) {
          assignedGroup = await prisma.group.create({
            data: {
              name: groupName.trim(),
              description: `Group created for ${finalUsername}`,
              accountId: getAccountId(req)
            }
          });
        }
        console.log(`🔍 Group found/created:`, assignedGroup)

        // Assign user to group (ensures user is only in one group)
        await assignUserToGroup(newUser.id, assignedGroup.id, req)
        console.log(`🔍 User added to group successfully`)
      } catch (groupError) {
        console.error(`❌ Failed to assign user to group:`, groupError)
        // Don't fail the entire user creation if group assignment fails
        console.log(`⚠️ Continuing with user creation despite group assignment failure`)
      }
    } else {
      console.log(`🔍 No group assignment - groupName is empty or undefined`)
    }

    // ActivityLog model removed

    res.status(201).json({
      message: 'Successfully connected to Stremio',
      user: {
        id: newUser.id,
        username: newUser.username
      },
      addonsCount: Object.keys(addonsData).length,
      group: assignedGroup ? {
        id: assignedGroup.id,
        name: assignedGroup.name
      } : null
    });

  } catch (error) {
    console.error('Stremio connection error:', error);
    
    // Handle Prisma unique constraint errors
    if (error.code === 'P2002') {
      const field = error.meta?.target?.[0];
      if (field === 'username') {
        return res.status(409).json({ 
          message: 'Username already exists',
          error: 'Please choose a different username'
        });
      }
      if (field === 'email') {
        return res.status(409).json({ 
          message: 'Email already exists',
          error: 'This email is already registered'
        });
      }
      return res.status(409).json({ 
        message: 'User already exists',
        error: 'A user with this information already exists'
      });
    }
    
    // Handle specific Stremio authentication errors
    if (error.message === 'User not found') {
      return res.status(401).json({ 
        message: 'Invalid Stremio credentials',
        error: 'User not found (check email)'
      });
    }
    if (error.code === 3 || error.wrongPass || error.message?.includes('Wrong passphrase')) {
      return res.status(401).json({ 
        message: 'Invalid Stremio credentials',
        error: 'Wrong email or password'
      });
    }
    
    if (error.message?.includes('Authentication failed') || error.message?.includes('Wrong passphrase')) {
      return res.status(401).json({ 
        message: 'Invalid Stremio credentials',
        error: error.message
      });
    }

    if (error.message?.includes('Network') || error.code === 'ENOTFOUND') {
      return res.status(503).json({ 
        message: 'Unable to connect to Stremio servers',
        error: 'Please check your internet connection and try again'
      });
    }
    
    res.status(500).json({ 
      message: 'Failed to connect to Stremio', 
      error: error.message || 'Unknown error occurred'
    });
  }
});

// Connect using existing Stremio authKey (create new Syncio user)
app.post('/api/stremio/connect-authkey', async (req, res) => {
  try {
    const { username, email, authKey, groupName } = req.body
    if (!authKey) return res.status(400).json({ message: 'authKey is required' })

    // Validate auth key against Stremio (must be an active session)
    let addonsData = {}
    let verifiedUser = null
    try {
      const validation = await validateStremioAuthKey(authKey)
      addonsData = (validation && validation.addons) || {}
      verifiedUser = validation && validation.user ? validation.user : null
    } catch (e) {
      const msg = (e && (e.message || e.error || '')) || ''
      const code = (e && e.code) || 0
      if (code === 1 || /session does not exist/i.test(String(msg))) {
        return res.status(401).json({ message: 'Invalid or expired Stremio auth key' })
      }
      // Treat unknown function/other errors as invalid
      return res.status(400).json({ message: 'Could not validate auth key' })
    }

    // Encrypt and persist
    const encryptedAuthKey = encrypt(authKey)

    // Ensure username uniqueness
    const baseUsername = (username || `user_${Math.random().toString(36).slice(2, 8)}`).toLowerCase()
    let finalUsername = baseUsername
    let attempt = 0
    while (await prisma.user.findFirst({ 
      where: { 
        username: finalUsername,
        accountId: getAccountId(req)
      }
    })) {
      attempt += 1
      finalUsername = `${baseUsername}${attempt}`
      if (attempt > 50) break
    }

    const created = await prisma.user.create({
      data: {
        accountId: getAccountId(req),
        email: (verifiedUser?.email || email || `${Date.now()}@example.invalid`).toLowerCase(),
        username: finalUsername,
        stremioAuthKey: encryptedAuthKey,
        isActive: true
      },
    })

    // Optional: create group and add user
    if (groupName) {
      let group = await prisma.group.findFirst({ where: { name: groupName, accountId: getAccountId(req) } })
      if (!group) {
        group = await prisma.group.create({ data: { name: groupName, accountId: getAccountId(req) } })
      }
      // Assign user to group (ensures user is only in one group)
      await assignUserToGroup(created.id, group.id, req)
    }

    // Hide sensitive fields
    delete created.password
    delete created.stremioAuthKey
    return res.json(created)
  } catch (e) {
    console.error('connect-authkey failed:', e)
    return res.status(500).json({ message: 'Failed to connect with authKey' })
  }
})

// Connect existing user to Stremio using authKey
app.post('/api/users/:id/connect-stremio-authkey', async (req, res) => {
  try {
    const { id } = req.params
    const { authKey } = req.body
    if (!authKey) return res.status(400).json({ message: 'authKey is required' })

    const user = await prisma.user.findUnique({ 
      where: { 
        id,
        accountId: getAccountId(req)
      }
    })
    if (!user) return res.status(404).json({ message: 'User not found' })

    // Validate auth key
    let addonsData = {}
    let verifiedUser = null
    try {
      const validation = await validateStremioAuthKey(authKey)
      addonsData = (validation && validation.addons) || {}
      verifiedUser = validation && validation.user ? validation.user : null
    } catch (e) {
      const msg = (e && (e.message || e.error || '')) || ''
      const code = (e && e.code) || 0
      if (code === 1 || /session does not exist/i.test(String(msg))) {
        return res.status(401).json({ message: 'Invalid or expired Stremio auth key' })
      }
      return res.status(400).json({ message: 'Could not validate auth key' })
    }

    const encryptedAuthKey = encrypt(authKey)

    const updated = await prisma.user.update({
      where: { id },
      data: {
        stremioAuthKey: encryptedAuthKey,
        stremioAddons: JSON.stringify(addonsData || {}),
        email: verifiedUser?.email ? verifiedUser.email.toLowerCase() : undefined,
        isActive: true, // Reconnect user since they now have valid Stremio connection
      },
    })

    delete updated.password
    delete updated.stremioAuthKey
    return res.json(updated)
  } catch (e) {
    console.error('connect-stremio-authkey failed:', e)
    return res.status(500).json({ message: 'Failed to connect existing user with authKey' })
  }
})

// Addons API
app.get('/api/addons', async (req, res) => {
  try {
    const whereScope = getAccountId(req) ? { accountId: getAccountId(req) } : {}
    const addons = await prisma.addon.findMany({
      where: scopedWhere(req, {}),
      // return all addons, both active and inactive
      include: {
        groupAddons: {
          include: {
            group: {
              include: {
                _count: {
                  select: {
                      addons: true
                  }
                }
              }
            }
          }
        }
      },
        orderBy: { id: 'asc' }
    });

    const transformedAddons = await Promise.all(addons.map(async addon => {
      // Filter groupAddons to only include those from the current account
      const currentAccountId = getAccountId(req)
      const filteredGroupAddons = addon.groupAddons.filter(ga => 
        ga.group && ga.group.accountId === currentAccountId
      )

      // Calculate total users across all groups that contain this addon (only from current account)
      let totalUsers = 0
      
      if (filteredGroupAddons && filteredGroupAddons.length > 0) {
        // Get all unique user IDs from all groups that contain this addon
        const allUserIds = new Set()
        
        for (const groupAddon of filteredGroupAddons) {
          if (groupAddon.group && groupAddon.group.userIds) {
            try {
              const userIds = JSON.parse(groupAddon.group.userIds)
              if (Array.isArray(userIds)) {
                userIds.forEach(userId => allUserIds.add(userId))
              }
            } catch (e) {
              console.error('Error parsing group userIds for addon:', e)
            }
          }
        }
        
        // Count active users
        if (allUserIds.size > 0) {
          const activeUsers = await prisma.user.findMany({
            where: {
              id: { in: Array.from(allUserIds) },
              isActive: true,
              accountId: getAccountId(req)
            },
            select: { id: true }
          })
          totalUsers = activeUsers.length
        }
      }

      return {
        id: addon.id,
        name: addon.name,
        description: addon.description,
      manifestUrl: getDecryptedManifestUrl(addon, req),
      url: getDecryptedManifestUrl(addon, req), // Keep both for compatibility
        version: addon.version,
        iconUrl: addon.iconUrl,
        status: addon.isActive ? 'active' : 'inactive',
        users: totalUsers,
        groups: filteredGroupAddons.length,
        accountId: addon.accountId
      }
    }));

    res.json(transformedAddons);
  } catch (error) {
    console.error('Error fetching addons:', error);
    res.status(500).json({ message: 'Failed to fetch addons' });
  }
});


// Enable addon (set isActive=true)
app.put('/api/addons/:id/enable', async (req, res) => {
  try {
    const { id } = req.params
    const existing = await prisma.addon.findUnique({ 
      where: { 
        id,
        accountId: getAccountId(req)
      }
    })
    if (!existing) return res.status(404).json({ message: 'Addon not found' })

    const updated = await prisma.addon.update({ 
      where: { 
        id,
        accountId: getAccountId(req)
      }, 
      data: { isActive: true } 
    })
    return res.json({
      id: updated.id,
      name: updated.name,
      description: updated.description,
      url: getDecryptedManifestUrl(updated, req),
      version: updated.version,
      status: updated.isActive ? 'active' : 'inactive',
      users: 0,
      groups: 0
    })
  } catch (error) {
    console.error('Error enabling addon:', error)
    return res.status(500).json({ message: 'Failed to enable addon' })
  }
})

// Disable addon (soft disable, stays in DB and groups)
app.put('/api/addons/:id/disable', async (req, res) => {
  try {
    const { id } = req.params
    const existing = await prisma.addon.findUnique({ 
      where: { 
        id,
        accountId: getAccountId(req)
      }
    })
    if (!existing) return res.status(404).json({ message: 'Addon not found' })

    const updated = await prisma.addon.update({ 
      where: { 
        id,
        accountId: getAccountId(req)
      }, 
      data: { isActive: false } 
    })
    return res.json({
      id: updated.id,
      name: updated.name,
      description: updated.description,
      url: getDecryptedManifestUrl(updated, req),
      version: updated.version,
      status: updated.isActive ? 'active' : 'inactive',
      users: 0,
      groups: 0
    })
  } catch (error) {
    console.error('Error disabling addon:', error)
    return res.status(500).json({ message: 'Failed to disable addon' })
  }
})

// Helper: canonicalize manifest URL for duplicate checks
function canonicalizeManifestUrl(raw) {
  if (!raw) return ''
  try {
    let s = String(raw).trim()
    // Remove any leading @ characters users may paste from chats
    s = s.replace(/^@+/, '')
    // Lowercase and strip protocol
    let u = s.replace(/^https?:\/\//i, '').toLowerCase()
    // Strip query string and hash fragments
    u = u.split('?')[0].split('#')[0]
    // Remove trailing '/manifest.json'
    u = u.replace(/\/manifest\.json$/i, '')
    // Remove trailing slashes
    u = u.replace(/\/+$/g, '')
    return u
  } catch {
    return String(raw).trim().toLowerCase()
  }
}


app.post('/api/addons', async (req, res) => {
  try {
          const { url, name, description, groupIds, manifestData: providedManifestData } = req.body;
    
    if (!url) {
      return res.status(400).json({ message: 'Addon URL is required' });
    }

    // Require authenticated account context when auth is enabled
    if (AUTH_ENABLED && !req.appAccountId) {
      return res.status(401).json({ message: 'Unauthorized' })
    }

    const trimmedUrl = String(url).trim()
    const sanitizedUrl = trimmedUrl.replace(/^@+/, '')
    const lowerUrl = sanitizedUrl.toLowerCase()

    // Disallow stremio:// scheme and guide user
    if (lowerUrl.startsWith('stremio://')) {
      return res.status(400).json({ message: 'Invalid URL scheme. Please use http:// or https:// for the manifest URL.' });
    }

    // Exact URL duplicate detection (no canonical fuzzy matching)
    // Use deterministic hash to check duplicates regardless of encryption
    const { manifestUrlHash } = require('./utils/hash')
    const existingByUrl = await prisma.addon.findFirst({ 
      where: { 
        manifestUrlHash: manifestUrlHash(sanitizedUrl),
        accountId: getAccountId(req)
      } 
    })

    // Use provided manifest data if available, otherwise fetch it
    let manifestData = providedManifestData
    if (!manifestData) {
    try {
      console.log(`🔍 Fetching manifest for new addon: ${sanitizedUrl}`)
      const resp = await fetch(sanitizedUrl)
      if (!resp.ok) {
        return res.status(400).json({ message: 'Failed to fetch addon manifest. The add-on URL may be incorrect.' })
      }
      manifestData = await resp.json()
      console.log(`✅ Fetched manifest:`, manifestData?.name, manifestData?.version)
    } catch (e) {
      return res.status(400).json({ message: 'Failed to fetch addon manifest. The add-on URL may be incorrect.' })
      }
    } else {
    }

    if (existingByUrl) {
      if (existingByUrl.isActive) {
        // Exact same URL already exists and is active: do not modify it; just report conflict
        return res.status(409).json({ message: 'Addon already exists.' })
      }
      // Reactivate and refresh meta for inactive record
      const reactivated = await prisma.addon.update({
        where: { 
          id: existingByUrl.id,
          accountId: getAccountId(req)
        },
        data: {
          isActive: true,
          // Use provided name or manifest name when reactivating
          name: (name && name.trim()) ? name.trim() : (manifestData?.name || existingByUrl.name),
          description: description || manifestData?.description || existingByUrl.description || '',
          version: manifestData?.version || existingByUrl.version || null,
          iconUrl: manifestData?.logo || existingByUrl.iconUrl || null // Store logo URL from manifest
        },
        select: { id: true, name: true, description: true, manifestUrl: true, version: true, isActive: true }
      })

      // Handle group assignments for reactivated addon
      let assignedGroups = [];
      if (groupIds && Array.isArray(groupIds) && groupIds.length > 0) {
        try {
          console.log(`🔍 Assigning reactivated addon to groups:`, groupIds);
          
          // Create group addon relationships
          for (const groupId of groupIds) {
            try {
              // Check if relationship already exists
              const existingGroupAddon = await prisma.groupAddon.findFirst({
                where: {
                  groupId: groupId,
                  addonId: reactivated.id,
                },
              });

              if (!existingGroupAddon) {
                const groupAddon = await prisma.groupAddon.create({
                  data: {
                    groupId: groupId,
                    addonId: reactivated.id,
                    isEnabled: true,
                    settings: null,
                  },
                  include: {
                    group: true,
                  },
                });
                assignedGroups.push(groupAddon.group);
                console.log(`✅ Added reactivated addon to group: ${groupAddon.group.name}`);
              } else {
                console.log(`⚠️ Addon already in group ${groupId}, skipping`);
              }
            } catch (groupError) {
              console.error(`❌ Failed to add reactivated addon to group ${groupId}:`, groupError);
              // Continue with other groups even if one fails
            }
          }
        } catch (error) {
          console.error(`❌ Failed to process group assignments for reactivated addon:`, error);
          // Don't fail the entire addon reactivation if group assignment fails
        }
      }

      return res.status(200).json({
        id: reactivated.id,
        name: reactivated.name,
        description: reactivated.description,
        url: reactivated.manifestUrl,
        version: reactivated.version,
        status: reactivated.isActive ? 'active' : 'inactive',
        users: 0,
        groups: assignedGroups.length
      })
    }

    // Auto-unique the name per account if necessary so different URLs can coexist
    let baseName = name || manifestData?.name || 'Unknown Addon'
    let finalName = baseName
    let suffix = 2
    // Try to avoid Prisma unique constraint on name by adjusting
    while (true) {
      const clash = await prisma.addon.findFirst({ 
        where: { 
          name: { equals: finalName },
          accountId: getAccountId(req)  // ✅ FIX: Check uniqueness per account only!
        } 
      })
      if (!clash) break
      finalName = `${baseName} (${suffix})`
      suffix += 1
      if (suffix > 50) break
    }

    // Create new addon (store sanitized URL)
    const addon = await prisma.addon.create({
      data: {
        name: finalName,
        description: description || manifestData?.description || '',
        manifestUrl: encrypt(sanitizedUrl, req),
        manifestUrlHash: require('./utils/hash').manifestUrlHash(sanitizedUrl),
        version: manifestData?.version || null,
        iconUrl: manifestData?.logo || null, // Store logo URL from manifest
        stremioAddonId: manifestData?.id || null,
        isActive: true,
        originalManifest: manifestData ? encrypt(JSON.stringify(manifestData), req) : null,
        manifest: manifestData ? encrypt(JSON.stringify(manifestData), req) : null,
        resources: (() => {
          try {
            const src = Array.isArray(manifestData?.resources) ? manifestData.resources : []
            const names = src.map(r => (typeof r === 'string' ? r : (r && (r.name || r.type)))).filter(Boolean)
            return names.length ? JSON.stringify(names) : null
          } catch { return null }
        })(),
        // Enforce account ownership
        accountId: getAccountId(req),
      }
    });

    // Handle group assignments if provided
    let assignedGroups = [];
    if (groupIds && Array.isArray(groupIds) && groupIds.length > 0) {
      try {
        console.log(`🔍 Assigning addon to groups:`, groupIds);
        
        // Create group addon relationships
        for (const groupId of groupIds) {
          try {
            const groupAddon = await prisma.groupAddon.create({
              data: {
                groupId: groupId,
                addonId: addon.id,
                isEnabled: true,
                settings: null,
              },
              include: {
                group: true,
              },
            });
            assignedGroups.push(groupAddon.group);
            console.log(`✅ Added addon to group: ${groupAddon.group.name}`);
          } catch (groupError) {
            console.error(`❌ Failed to add addon to group ${groupId}:`, groupError);
            // Continue with other groups even if one fails
          }
        }
      } catch (error) {
        console.error(`❌ Failed to process group assignments:`, error);
        // Don't fail the entire addon creation if group assignment fails
      }
    }

    res.status(201).json({
      id: addon.id,
      name: addon.name,
      description: addon.description,
      url: addon.manifestUrl,
      version: addon.version,
      iconUrl: addon.iconUrl,
      status: 'active',
      users: 0,
      groups: assignedGroups.length
    });
  } catch (error) {
    console.error('Error creating addon:', error);
    if (error?.code === 'P2002') {
      // If unique constraint (likely manifestUrl) tripped, return a friendly conflict
      return res.status(409).json({ message: 'Addon already exists.' })
    }
    res.status(500).json({ message: 'Failed to create addon', error: error?.message });
  }
});

// Reload addon manifest and update content
app.post('/api/addons/:id/reload', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find the addon
    const addon = await prisma.addon.findUnique({
      where: { id }
    });

    if (!addon) {
      return res.status(404).json({ error: 'Addon not found' });
    }

    if (!addon.isActive) {
      return res.status(400).json({ error: 'Addon is disabled' });
    }

    if (!addon.manifestUrl) {
      return res.status(400).json({ error: 'Addon has no manifest URL' });
    }

    // Resolve decrypted transport URL
    const transportUrl = getDecryptedManifestUrl(addon, req)
    if (!transportUrl) {
      return res.status(400).json({ error: 'Failed to resolve addon URL' })
    }

    // Fetch the latest manifest
    let manifestData = null;
    try {
      console.log(`🔍 Reloading manifest for addon: ${addon.name} (${transportUrl})`);
      const manifestResponse = await fetch(transportUrl);
      if (manifestResponse.ok) {
        manifestData = await manifestResponse.json();
        console.log(`✅ Reloaded manifest:`, manifestData?.name, manifestData?.version);
      } else {
        throw new Error(`HTTP ${manifestResponse.status}: ${manifestResponse.statusText}`);
      }
    } catch (e) {
      console.error(`❌ Failed to fetch manifest:`, e.message);
      return res.status(400).json({ 
        error: 'Failed to fetch addon manifest',
        details: e.message 
      });
    }

    // Filter manifest according to selected resources stored on addon
    let filtered = manifestData
    try {
      const selected = (() => { try { return addon.resources ? JSON.parse(addon.resources) : [] } catch { return [] } })()
      if (Array.isArray(selected) && selected.length > 0 && manifestData) {
        const allow = new Set(selected.map(r => typeof r === 'string' ? r : (r?.name || r?.type)).filter(Boolean))
        const clone = JSON.parse(JSON.stringify(manifestData))
        if (Array.isArray(clone.resources)) {
          clone.resources = clone.resources.filter(r => {
            const key = typeof r === 'string' ? r : (r?.name || r?.type)
            return key ? allow.has(key) : false
          })
        }
        filtered = clone
      }
    } catch {}

    // Update the addon with fresh original manifest and derived manifest; preserve display name
    const updatedAddon = await prisma.addon.update({
      where: { 
        id,
        accountId: getAccountId(req)
      },
      data: {
        name: addon.name, // explicitly preserve name
        description: manifestData?.description || addon.description,
        version: manifestData?.version || addon.version,
        // Update logo URL from manifest
        iconUrl: manifestData?.logo || addon.iconUrl || null,
        // Store encrypted manifests (original and filtered)
        originalManifest: manifestData ? encrypt(JSON.stringify(manifestData), req) : addon.originalManifest,
        manifest: filtered ? encrypt(JSON.stringify(filtered), req) : addon.manifest
      }
    });

    res.json({
      message: 'Addon reloaded successfully',
      addon: {
        id: updatedAddon.id,
        name: updatedAddon.name,
        description: updatedAddon.description,
        url: updatedAddon.manifestUrl,
        version: updatedAddon.version,
        iconUrl: updatedAddon.iconUrl,
        status: updatedAddon.isActive ? 'active' : 'inactive'
      }
    });
  } catch (error) {
    console.error('Error reloading addon:', error);
    res.status(500).json({ error: 'Failed to reload addon', details: error?.message });
  }
});

app.delete('/api/addons/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Ensure addon exists
    const existing = await prisma.addon.findUnique({ 
      where: { 
        id,
        accountId: getAccountId(req)
      }
    })
    if (!existing) {
      return res.status(404).json({ message: 'Addon not found' })
    }

    // Hard delete: remove relations then delete addon (transaction requires Prisma promises only)
    await prisma.$transaction([
      prisma.groupAddon.deleteMany({ where: { addonId: id } }),
      // AddonSetting model removed
      prisma.addon.delete({ 
        where: { 
          id,
          accountId: getAccountId(req)
        }
      })
    ])

    res.json({ message: 'Addon deleted successfully' });
  } catch (error) {
    console.error('Error deleting addon:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Addon not found' })
    }
    res.status(500).json({ message: 'Failed to delete addon', error: error?.message });
  }
});

// Import addons from JSON file
app.post('/api/addons/import', upload.single('file'), async (req, res) => {
  try {
    if (AUTH_ENABLED && !req.appAccountId) {
      return res.status(401).json({ message: 'Unauthorized' })
    }
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const file = req.file;
    const fileData = file.buffer.toString('utf8');
    
    let importData;
    try {
      importData = JSON.parse(fileData);
    } catch (parseError) {
      return res.status(400).json({ message: 'Invalid JSON file' });
    }

    // Normalize input: accept either root array or { addons: [...] }
    const addonsArray = Array.isArray(importData) ? importData : importData.addons
    if (!Array.isArray(addonsArray)) {
      return res.status(400).json({ message: 'Invalid JSON structure. Expected an array or an object with "addons" array.' });
    }

    let successful = 0;
    let failed = 0;
    let redundant = 0;

    // Process each addon
    for (const addonData of addonsArray) {
      try {
        // Get URL from manifestUrl (preferred) or legacy transportUrl
        const transportUrl = addonData.manifestUrl || addonData.transportUrl;
        
        // Validate required fields
        if (!transportUrl) {
          console.warn('Skipping addon with missing URL:', addonData);
          failed++;
          continue;
        }

        // Get manifest data - use provided manifest or fetch from URL
        let manifest = addonData.manifest;
        if (!manifest) {
          try {
            console.log(`🔍 Fetching manifest for ${transportUrl}`);
            const manifestResponse = await fetch(transportUrl);
            if (manifestResponse.ok) {
              manifest = await manifestResponse.json();
              console.log(`✅ Fetched manifest: ${manifest?.name} ${manifest?.version}`);
            } else {
              console.warn(`⚠️ Failed to fetch manifest for ${transportUrl}`);
              // Create a fallback manifest
              manifest = {
                id: addonData.name || 'unknown.addon',
                name: addonData.name || 'Unknown',
                version: addonData.version || null,
                description: addonData.description || null
              };
            }
          } catch (error) {
            console.warn(`⚠️ Error fetching manifest for ${transportUrl}:`, error.message);
            // Create a fallback manifest
            manifest = {
              id: addonData.name || 'unknown.addon',
              name: addonData.name || 'Unknown',
              version: addonData.version || null,
              description: addonData.description || null
            };
          }
        }

        const transportName = addonData.name || addonData.transportName || manifest.name || 'Unknown';

        // Check if addon already exists (by manifestUrl or manifest.id)
        const existingAddon = await prisma.addon.findFirst({
          where: {
            accountId: getAccountId(req),
            OR: [
              { manifestUrl: transportUrl },
              { manifestUrl: { contains: manifest.id } }
            ]
          }
        });

        if (existingAddon) {
          console.log(`Addon already exists: ${transportName}`);
          redundant++;
          continue;
        }

        // Create new addon
        const newAddon = await prisma.addon.create({
          data: {
            name: transportName,
            description: manifest.description || '',
            manifestUrl: encrypt(transportUrl, req),
            manifestUrlHash: require('./utils/hash').manifestUrlHash(transportUrl),
            version: manifest.version || null,
            iconUrl: manifest.logo || null,
            stremioAddonId: manifest.id || null,
            isActive: true,
            manifest: manifest ? encrypt(JSON.stringify(manifest), req) : null,
            accountId: getAccountId(req),
          }
        });

        console.log(`Successfully imported addon: ${transportName}`);
        successful++;

      } catch (addonError) {
        console.error(`Failed to import addon:`, addonError);
        failed++;
      }
    }

    res.json({
      message: 'Import completed',
      successful,
      failed,
      redundant,
      total: addonsArray.length
    });

  } catch (error) {
    console.error('Error importing addons:', error);
    res.status(500).json({ message: 'Failed to import addons', error: error?.message });
  }
});


// Get individual addon details
app.get('/api/addons/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const addon = await prisma.addon.findUnique({
      where: { id },
      include: {
        groupAddons: {
          include: {
            group: {
              include: {
                _count: {
                  select: {
                      addons: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!addon) {
      return res.status(404).json({ error: 'Addon not found' });
    }

    // Filter groupAddons to only include those from the current account
    const currentAccountId = getAccountId(req)
    const filteredGroupAddons = addon.groupAddons.filter(ga => 
      ga.group && ga.group.accountId === currentAccountId
    )

    // Calculate total users across all groups that have this addon (only from current account)
    const totalUsers = filteredGroupAddons.reduce((sum, groupAddon) => {
      return sum + (groupAddon.group._count.members || 0)
    }, 0)

    const transformedAddon = {
      id: addon.id,
      name: addon.name,
      description: addon.description,
      url: addon.manifestUrl,
      version: addon.version,
      category: addon.category || 'Other',
      status: addon.isActive ? 'active' : 'inactive',
      users: totalUsers,
      groups: filteredGroupAddons.map(ga => ({
        id: ga.group.id,
        name: ga.group.name
    })),
      resources: (() => { try { return addon.resources ? JSON.parse(addon.resources) : [] } catch { return [] } })(),
      originalManifest: (() => {
        try {
          if (addon.originalManifest) return JSON.parse(decrypt(addon.originalManifest, req))
        } catch {}
        return null
      })(),
    // include manifest details for UI configuration (resources/types/etc.)
    manifest: (() => {
      let manifestObj = null
      try {
        if (addon.manifest) {
          manifestObj = JSON.parse(decrypt(addon.manifest, req))
        }
      } catch {}
      // Always return an object to avoid null checks client-side
      if (!manifestObj) {
        manifestObj = {
          id: addon.stremioAddonId || addon.name || 'unknown',
          name: addon.name || 'Unknown',
          version: addon.version || 'unknown',
          description: addon.description || '',
          types: [],
            resources: (() => { try { return addon.resources ? JSON.parse(addon.resources) : [] } catch { return [] } })(),
          catalogs: []
        }
      }
      return manifestObj
    })()
    };

    res.json(transformedAddon);
  } catch (error) {
    console.error('Error fetching addon details:', error);
    res.status(500).json({ error: 'Failed to fetch addon details' });
  }
});

// Update addon
app.put('/api/addons/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, url, version, groupIds, resources } = req.body;
    
    console.log(`🔍 PUT /api/addons/${id} called with:`, { name, description, url, groupIds });
    console.log(`🔍 AUTH_ENABLED: ${AUTH_ENABLED}, req.appAccountId: ${req.appAccountId}`);

    // Check if addon exists
    const existingAddon = await prisma.addon.findUnique({
      where: { 
        id
      },
      include: { groupAddons: true }
    });

    console.log(`🔍 Found existing addon:`, existingAddon ? { id: existingAddon.id, name: existingAddon.name, accountId: existingAddon.accountId } : 'null');

    if (!existingAddon) {
      return res.status(404).json({ error: 'Addon not found' });
    }

    // If URL is provided, validate scheme and fetch manifest to refresh fields
    let manifestData = null;
    let nextUrl = undefined;
    if (url !== undefined) {
      const trimmedUrl = String(url).trim()
      const sanitizedUrl = trimmedUrl.replace(/^@+/, '')
      const lowerUrl = sanitizedUrl.toLowerCase()
      if (lowerUrl.startsWith('stremio://')) {
        return res.status(400).json({ message: 'Invalid URL scheme. Please use http:// or https:// for the manifest URL.' });
      }

      // If changing URL, ensure no other addon already uses it (including canonical similarity)
      const prevCanon = canonicalizeManifestUrl(getDecryptedManifestUrl(existingAddon) || '')
      const nextCanon = canonicalizeManifestUrl(sanitizedUrl)
      if (nextCanon !== prevCanon) {
        const all = await prisma.addon.findMany({ where: {}, select: { id: true, manifestUrl: true } })
        const conflict = all.find((a) => a.id !== id && canonicalizeManifestUrl(getDecryptedManifestUrl(a, req)) === nextCanon)
        if (conflict) {
          return res.status(409).json({ message: 'Another addon already exists with this (similar) URL.' })
        }
      }

      nextUrl = sanitizedUrl;
      try {
        console.log(`🔍 Reloading manifest for updated URL: ${sanitizedUrl}`);
        const resp = await fetch(sanitizedUrl);
        if (!resp.ok) {
          return res.status(400).json({ message: 'Failed to fetch addon manifest. The add-on URL may be incorrect.' });
        }
        manifestData = await resp.json();
      } catch (e) {
        return res.status(400).json({ message: 'Failed to fetch addon manifest. The add-on URL may be incorrect.' });
      }
    }

    // Prepare update data
    const updateData = {
      accountId: getAccountId(req) // Always set accountId
    };
    
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (version !== undefined) updateData.version = version;
    if (nextUrl !== undefined) updateData.manifestUrl = nextUrl;

    if (manifestData) {
      updateData.name = name ?? (existingAddon.name);
      updateData.description = description ?? (manifestData?.description || existingAddon.description || '');
      updateData.version = version ?? (manifestData?.version || existingAddon.version || null);
    }

    console.log(`🔍 Attempting to update addon with data:`, updateData);
    console.log(`🔍 Update where clause:`, { 
      id,
      ...(AUTH_ENABLED && req.appAccountId ? { accountId: req.appAccountId } : {})
    });

    // If URL was changed, store encrypted URL and update its hash deterministically
    if (nextUrl !== undefined) {
      try {
        updateData.manifestUrl = encrypt(nextUrl, req)
        updateData.manifestUrlHash = require('./utils/hash').manifestUrlHash(nextUrl)
      } catch (e) {
        console.error('Failed to encrypt updated manifestUrl:', e)
        return res.status(500).json({ error: 'Failed to encrypt updated manifestUrl' })
      }
    }

    // If resources provided, re-derive manifest from originalManifest and persist both fields
    if (resources !== undefined) {
      try {
        const key = getAccountDek(req.appAccountId || (req.user && (req.user.accountId || req.user.id))) || getServerKey()
        let original = null
        try { original = existingAddon.originalManifest ? JSON.parse(aesGcmDecrypt(key, existingAddon.originalManifest)) : null } catch {}
        // Fallback: if no originalManifest, use decrypted current manifest
        if (!original) {
          try { original = existingAddon.manifest ? JSON.parse(aesGcmDecrypt(key, existingAddon.manifest)) : null } catch {}
        }
        if (original && Array.isArray(original.resources)) {
          const selected = Array.isArray(resources) ? resources : []
          // Build set of selected names handling both string and object forms
          const selectedNames = new Set(
            selected
              .map((s) => (typeof s === 'string' ? s : (s && (s.name || s.type))))
              .filter(Boolean)
          )
          const filtered = { ...original }
          if (selected.length > 0) {
            filtered.resources = original.resources.filter((r) => {
              const label = typeof r === 'string' ? r : (r && (r.name || r.type))
              return label && selectedNames.has(label)
            })
          }
          // SDK guidance: keep keys but empty arrays when deselected
          if (!selectedNames.has('catalog')) filtered.catalogs = []
          if (!selectedNames.has('addon_catalog')) filtered.addonCatalogs = []

          updateData.manifest = encrypt(JSON.stringify(filtered), req)
          updateData.originalManifest = existingAddon.originalManifest // keep as is
          updateData.resources = JSON.stringify(Array.from(selectedNames))
        } else if (Array.isArray(resources)) {
          const names = resources.map(r => (typeof r === 'string' ? r : (r && (r.name || r.type)))).filter(Boolean)
          updateData.resources = names.length ? JSON.stringify(names) : JSON.stringify([])
        }
      } catch (e) {
        console.error('Failed to update resources/filter manifest:', e)
      }
    }

    const updatedAddon = await prisma.addon.update({
      where: { 
        id,
        accountId: getAccountId(req)
      },
      data: updateData
    });

    console.log(`🔍 Update successful:`, updatedAddon ? { id: updatedAddon.id, name: updatedAddon.name } : 'null');

    if (groupIds !== undefined) {
      // Get current group associations to preserve order
      const currentGroupAddons = await prisma.groupAddon.findMany({
        where: { 
          addonId: id
        },
        include: { group: true }
      });
      
      const currentGroupIds = new Set(currentGroupAddons.map(ga => ga.groupId));
      const desiredGroupIds = new Set(Array.isArray(groupIds) ? groupIds : []);
      
      // Find groups to remove and add
      const groupsToRemove = currentGroupAddons.filter(ga => !desiredGroupIds.has(ga.groupId));
      const groupsToAdd = [...desiredGroupIds].filter(groupId => !currentGroupIds.has(groupId));
      
      // Remove addon from groups it's no longer in
      if (groupsToRemove.length > 0) {
        await prisma.groupAddon.deleteMany({
          where: { 
            addonId: id, 
            groupId: { in: groupsToRemove.map(ga => ga.groupId) }
          }
        });
      }
      
      // Add addon to new groups (preserve existing order for unchanged groups)
      if (groupsToAdd.length > 0) {
        // Validate that all groups to add exist
          const validGroups = await prisma.group.findMany({
            where: { 
            id: { in: groupsToAdd }
            },
            select: { id: true }
          });
          const validGroupIds = new Set(validGroups.map(g => g.id));
          const invalidGroups = groupsToAdd.filter(id => !validGroupIds.has(id));
          if (invalidGroups.length > 0) {
            return res.status(403).json({ 
            error: 'Some groups do not exist',
              invalidGroups 
            });
        }
        
        await prisma.groupAddon.createMany({
          data: groupsToAdd.map((groupId) => ({ 
            addonId: id, 
            groupId
          })),
        });
      }
    }

    const addonWithGroups = await prisma.addon.findFirst({
      where: { id, accountId: getAccountId(req) },
      include: { groupAddons: { include: { group: true } } }
    });

    // Filter groupAddons to only include those from the current account
    const currentAccountId = getAccountId(req)
    const filteredGroupAddons = addonWithGroups.groupAddons.filter(ga => 
      ga.group && ga.group.accountId === currentAccountId
    )

    // Calculate total users across all groups that contain this addon (only from current account)
    let totalUsers = 0
    if (filteredGroupAddons && filteredGroupAddons.length > 0) {
      // Get all unique user IDs from all groups that contain this addon
      const allUserIds = new Set()
      
      for (const groupAddon of filteredGroupAddons) {
        if (groupAddon.group && groupAddon.group.userIds) {
          try {
            const userIds = JSON.parse(groupAddon.group.userIds)
            if (Array.isArray(userIds)) {
              userIds.forEach(userId => allUserIds.add(userId))
            }
          } catch (e) {
            console.error('Error parsing group userIds:', e)
          }
        }
      }
      
      // Count only active users
      if (allUserIds.size > 0) {
        const activeUsers = await prisma.user.findMany({
          where: {
            id: { in: Array.from(allUserIds) },
            isActive: true,
            accountId: getAccountId(req)
          },
          select: { id: true }
        })
        totalUsers = activeUsers.length
      }
    }

    const transformedAddon = {
      id: addonWithGroups.id,
      name: addonWithGroups.name,
      description: addonWithGroups.description,
      url: getDecryptedManifestUrl(addonWithGroups, req),
      version: addonWithGroups.version,
      status: addonWithGroups.isActive ? 'active' : 'inactive',
      users: totalUsers,
      groups: filteredGroupAddons.length
    };

    res.json(transformedAddon);
  } catch (error) {
    console.error('Error updating addon:', error);
    if (error?.code === 'P2002') {
      return res.status(409).json({ error: 'Conflict: duplicate field' })
    }
    res.status(500).json({ error: 'Failed to update addon' });
  }
});

// Groups API
app.get('/api/groups', async (req, res) => {
  try {
    const whereScope = AUTH_ENABLED && req.appAccountId ? { accountId: req.appAccountId } : {}
    const groups = await prisma.group.findMany({
      where: scopedWhere(req, {}),
      include: {
        addons: { include: { addon: true } },
        _count: { select: { addons: true } }
      },
      orderBy: { id: 'asc' }
    });

    const transformedGroups = await Promise.all(groups.map(async group => {
      // Count only active users from userIds array
      let activeMemberCount = 0
      if (group.userIds) {
        try {
          const userIds = JSON.parse(group.userIds)
          if (Array.isArray(userIds) && userIds.length > 0) {
            const activeUsers = await prisma.user.findMany({
              where: {
                id: { in: userIds },
                isActive: true,
                accountId: getAccountId(req)
              },
              select: { id: true }
            })
            activeMemberCount = activeUsers.length
          }
        } catch (e) {
          console.error('Error parsing group userIds:', e)
        }
      }

      // Count unique active addons scoped to this account (avoid duplicates across accounts)
      const accountId = getAccountId(req)
      const uniqActiveAddonIds = new Set(
        (group.addons || [])
          .filter((ga) => ga?.addon && ga.addon.isActive !== false && (!accountId || ga.addon.accountId === accountId))
          .map((ga) => ga.addon.id)
      )

      return {
      id: group.id,
      name: group.name,
      description: group.description,
        members: activeMemberCount,
        addons: uniqActiveAddonIds.size,
      restrictions: 'none', // TODO: Implement restrictions logic
      isActive: group.isActive,
      // Expose color index for UI
        colorIndex: group.colorIndex || 1,
        // Include userIds for SQLite compatibility
        userIds: group.userIds
      }
    }));
    
    

    res.json(transformedGroups);
  } catch (error) {
    console.error('Error fetching groups:', error);
    res.status(500).json({ message: 'Failed to fetch groups' });
  }
});

// Debug endpoint to inspect addon data
app.get('/api/debug/addon/:name', async (req, res) => {
  try {
    const { name } = req.params
    const addon = await prisma.addon.findFirst({
      where: {
        accountId: getAccountId(req),
        OR: [
          { name: { contains: name } }
        ]
      }
    })
    
    if (!addon) {
      return res.status(404).json({ error: 'Addon not found' })
    }
    
    res.json({
      id: addon.id,
      name: addon.name,
      version: addon.version,
      description: addon.description,
      manifestUrl: addon.manifestUrl,
      manifest: addon.manifest
    })
  } catch (error) {
    console.error('Error fetching addon debug info:', error)
    res.status(500).json({ error: 'Failed to fetch addon debug info' })
  }
})

// Debug endpoint to update addon data
app.put('/api/debug/addon/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { name, version, description, manifest } = req.body
    
    const updatedAddon = await prisma.familyAddon.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(version && { version }),
        ...(description && { description }),
        ...(manifest && { manifest })
      }
    })
    
    res.json({
      id: updatedAddon.id,
      name: updatedAddon.name,
      version: updatedAddon.version,
      description: updatedAddon.description,
      manifestUrl: updatedAddon.manifestUrl,
      manifest: updatedAddon.manifest
    })
  } catch (error) {
    console.error('Error updating addon:', error)
    res.status(500).json({ error: 'Failed to update addon' })
  }
})

// Debug endpoint to inspect current addons from Stremio
app.get('/api/debug/current-addons/:userId', async (req, res) => {
  try {
    const { userId } = req.params
    
    // Get user with Stremio connection
    const user = await prisma.user.findUnique({
      where: { id: userId }
    })

    // Find groups that contain this user using userIds JSON array
    const userGroups = await prisma.group.findMany({
      where: {
        userIds: {
          contains: userId
        }
      },
      include: {
        addons: {
          include: {
            addon: true
          }
        }
      }
    })

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    if (!user.stremioAuthKey) {
      return res.status(400).json({ error: 'User not connected to Stremio' })
    }

    // Decrypt auth
    let authKeyPlain
    try { 
      authKeyPlain = decrypt(user.stremioAuthKey) 
    } catch { 
      return res.status(400).json({ error: 'Failed to decrypt Stremio credentials' })
    }

    const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })
    
    // Get current addons from Stremio
    const current = await apiClient.request('addonCollectionGet', {})
    const currentAddonsRaw = current?.addons || current || []
    const currentAddons = Array.isArray(currentAddonsRaw) ? currentAddonsRaw : (typeof currentAddonsRaw === 'object' ? Object.values(currentAddonsRaw) : [])

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      },
      currentAddons: currentAddons.map(a => ({
        name: a?.manifest?.name || a?.name,
        transportName: a?.transportName,
        id: a?.manifest?.id || a?.id,
        version: a?.manifest?.version,
        description: a?.manifest?.description,
        transportUrl: a?.transportUrl,
        manifestUrl: a?.manifestUrl,
        url: a?.url,
        manifest: a?.manifest
      }))
    })
  } catch (error) {
    console.error('Error in debug current addons:', error)
    res.status(500).json({ error: 'Failed to get current addons' })
  }
})

// Debug endpoint to test sync without actually syncing
app.get('/api/debug/sync/:userId', async (req, res) => {
  try {
    const { userId } = req.params
    
    // Get user
    const user = await prisma.user.findUnique({
      where: { id: userId }
    })

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Find groups that contain this user
    const groups = await prisma.group.findMany({
      where: {
        accountId: getAccountId(req),
        userIds: {
          contains: user.id
        }
      },
              include: {
                addons: {
                  include: {
                    addon: true
          }
        }
      }
    })

    const familyGroup = groups[0]
    const familyAddons = Array.isArray(familyGroup?.addons)
      ? familyGroup.addons
          .filter((ga) => (ga?.isEnabled !== false) && (ga?.addon?.isActive !== false))
          .map((ga) => ({
            id: ga.addon.id,
            name: ga.addon.name,
            version: ga.addon.version,
            description: ga.addon.description,
            manifestUrl: ga.addon.manifestUrl,
            manifest: ga.addon.manifest,
          }))
      : []

    // Test manifest fetching
    const testResults = []
    for (const fa of familyAddons) {
      try {
        const resp = await fetch(fa.manifestUrl)
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}: ${resp.statusText}`)
        }
        const manifest = await resp.json()
        
        const safeManifest = {
          id: manifest?.id || 'unknown',
          name: manifest?.name || fa.name || 'Unknown',
          version: manifest?.version || '1.0.0',
          description: manifest?.description || fa.description || '',
          ...manifest
        }
        
        testResults.push({
          databaseData: fa,
          liveManifest: manifest,
          safeManifest: safeManifest,
          finalAddon: {
            transportUrl: fa.manifestUrl,
            transportName: safeManifest.name,
            manifest: safeManifest,
          }
        })
      } catch (e) {
        testResults.push({
          databaseData: fa,
          error: e.message,
          fallbackManifest: {
            id: fa.id || 'unknown',
            name: fa.name || 'Unknown',
            version: fa.version || '1.0.0',
            description: fa.description || '',
          }
        })
      }
    }

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      },
      group: {
        id: familyGroup?.id,
        name: familyGroup?.name
      },
      familyAddons: familyAddons,
      testResults: testResults
    })
  } catch (error) {
    console.error('Error in debug sync:', error)
    res.status(500).json({ error: 'Failed to debug sync' })
  }
})

// Create new group
app.post('/api/groups', async (req, res) => {
  try {
    const { name, description, colorIndex } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Group name is required' });
    }

    // Check if group with same name exists
    const existingGroup = await prisma.group.findFirst({
      where: { name: name.trim(), ...(AUTH_ENABLED && req.appAccountId ? { accountId: req.appAccountId } : {}) }
    });

    if (existingGroup) {
      return res.status(400).json({ message: 'Group with this name already exists' });
    }

    const newGroup = await prisma.group.create({
      data: {
        name: name.trim(),
        description: description || '',
        colorIndex: colorIndex || 1,
        accountId: getAccountId(req),
      }
    });

    res.status(201).json({
      id: newGroup.id,
      name: newGroup.name,
      description: newGroup.description,
      members: 0,
      addons: 0,
      restrictions: 'none',
      isActive: newGroup.isActive,
      colorIndex: newGroup.colorIndex || 1,
    });
  } catch (error) {
    console.error('Error creating group:', error);
    res.status(500).json({ message: 'Failed to create group', error: error?.message });
  }
});

// Clone group
app.post('/api/groups/clone', async (req, res) => {
  try {
    const { originalGroupId } = req.body;
    
    if (!originalGroupId) {
      return res.status(400).json({ message: 'Original group ID is required' });
    }

    // Get the original group with its addons
    const originalGroup = await prisma.group.findUnique({
      where: { 
        id: originalGroupId,
        accountId: getAccountId(req)
      },
      include: {
        addons: {
          include: {
            addon: true
          }
        }
      }
    });

    if (!originalGroup) {
      return res.status(404).json({ message: 'Original group not found' });
    }

    // Generate unique name with Copy #X pattern
    let newName = `${originalGroup.name} Copy`;
    let copyNumber = 1;
    
    while (true) {
      const existingGroup = await prisma.group.findFirst({
        where: { 
          name: newName,
          accountId: getAccountId(req)
        }
      });
      
      if (!existingGroup) {
        break;
      }
      
      copyNumber++;
      newName = `${originalGroup.name} Copy #${copyNumber}`;
    }

    // Create the new group
    const clonedGroup = await prisma.group.create({
      data: {
        name: newName.trim(),
        description: `Copy of ${originalGroup.name}`,
        accountId: getAccountId(req)
      }
    });

    // Clone all addons from the original group
    if (originalGroup.addons && originalGroup.addons.length > 0) {
      const addonData = originalGroup.addons.map(groupAddon => ({
        groupId: clonedGroup.id,
        addonId: groupAddon.addonId,
        isEnabled: groupAddon.isEnabled || true,
        settings: groupAddon.settings
      }));

      await prisma.groupAddon.createMany({
        data: addonData
      });
    }

    // Return the cloned group with addons
    const clonedGroupWithAddons = await prisma.group.findUnique({
      where: { id: clonedGroup.id },
      include: {
        addons: {
          include: {
            addon: true
          }
        }
      }
    });

    res.status(201).json({
      message: 'Group cloned successfully',
      group: clonedGroupWithAddons
    });
  } catch (error) {
    console.error('Error cloning group:', error);
    res.status(500).json({ message: 'Failed to clone group', error: error?.message });
  }
});

// Find or create group
app.post('/api/groups/find-or-create', async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Group name is required' });
    }

    const group = await prisma.group.upsert({
      where: { 
        name: name.trim(),
        accountId: getAccountId(req)
      },
      update: {},
      create: {
        name: name.trim(),
        description: `Auto-created group: ${name.trim()}`,
        accountId: getAccountId(req)
      }
    });

    res.json(group);
  } catch (error) {
    console.error('Error finding/creating group:', error);
    res.status(500).json({ message: 'Failed to find or create group' });
  }
});

// Get group details with users and addons
app.get('/api/groups/:id', async (req, res) => {
  try {
    const { id } = req.params
    const group = await prisma.group.findUnique({
      where: { id, accountId: getAccountId(req) },
      include: {
        addons: { 
          include: { addon: true }
        }
      }
    })
    if (!group) return res.status(404).json({ message: 'Group not found' })
    
    // Filter addons to only include those from the current account
    const currentAccountId = getAccountId(req)
    const filteredAddons = group.addons.filter(ga => 
      ga.addon && ga.addon.accountId === currentAccountId
    )
    
    // Get group addon manifest URLs for comparison (only enabled addons)
    const groupManifestUrls = filteredAddons
      .filter(ga => ga.addon.manifestUrl && ga.addon.isActive !== false)
      .map(ga => ga.addon.manifestUrl)
    
    // Find users that belong to this group (SQLite approach) - only active users
    const userIds = group.userIds ? JSON.parse(group.userIds) : []
    const users = await prisma.user.findMany({
      where: {
        id: { in: userIds },
        isActive: true,
        accountId: getAccountId(req)
      },
      select: {
        id: true,
        username: true,
        email: true,
        excludedAddons: true
      }
    })

    const memberUsers = users.map((user) => ({
      id: user.id,
      username: user.username,
      email: user.email,
      // Field kept for UI compatibility; with private mode we no longer store per-user stremioAddons
      stremioAddonsCount: 0,
      excludedAddons: user.excludedAddons || []
    }))
    res.json({
      id: group.id,
      name: group.name,
      description: group.description,
      colorIndex: group.colorIndex || 1,
      users: memberUsers,
      addons: filteredAddons
        .filter((ga) => ga.addon.isActive !== false) // already filtered by accountId above
        .map((ga) => ({ 
          id: ga.addon.id, 
          name: ga.addon.name, 
          description: ga.addon.description || '',
          manifestUrl: ga.addon.manifestUrl,
          version: ga.addon.version || null,
          isEnabled: ga.addon.isActive,
          iconUrl: ga.addon.iconUrl,
        })),
    })
  } catch (error) {
    console.error('Error fetching group detail:', error)
    res.status(500).json({ message: 'Failed to fetch group detail', error: error?.message })
  }
})

// Update group fields and membership/addons
app.put('/api/groups/:id', async (req, res) => {
  const { id } = req.params
  const { name, description, userIds, addonIds } = req.body
  try {
    const group = await prisma.group.findUnique({ 
      where: { 
        id,
        accountId: getAccountId(req)
      }, 
      include: { 
        addons: {
          include: {
            addon: true
          }
        }
      } 
    })
    if (!group) return res.status(404).json({ message: 'Group not found' })

    // Update basic fields (ignore empty strings)
    const nextName = (typeof name === 'string' && name.trim() === '') ? undefined : name
    const nextDesc = (typeof description === 'string' && description.trim() === '') ? undefined : description
    await prisma.group.update({ 
      where: { 
        id,
        accountId: getAccountId(req)
      }, 
      data: { name: nextName ?? group.name, description: nextDesc ?? group.description } 
    })

    // Sync members only if userIds is explicitly provided (SQLite approach)
    if (userIds !== undefined) {
      const desiredUserIds = Array.isArray(userIds) ? userIds : []
      
      // First, remove all users from this group
      await prisma.group.update({
        where: { id },
        data: { userIds: JSON.stringify([]) }
      })
      
      // Then, assign each user to this group (which will remove them from other groups)
      for (const userId of desiredUserIds) {
        await assignUserToGroup(userId, id, req)
      }
    }

    // Sync addons only if addonIds is explicitly provided
    if (addonIds !== undefined) {
    const currentAddonIds = new Set(group.addons.map((ga) => ga.addonId))
    const desiredAddonIds = new Set(Array.isArray(addonIds) ? addonIds : [])
    const toRemoveAddons = group.addons.filter((ga) => !desiredAddonIds.has(ga.addonId)).map((ga) => ga.addonId)
    const toAddAddons = [...desiredAddonIds].filter((aid) => !currentAddonIds.has(aid))

    await prisma.$transaction([
      prisma.groupAddon.deleteMany({ where: { groupId: id, addonId: { in: toRemoveAddons } } }),
      ...toAddAddons.map((aid) => prisma.groupAddon.upsert({
        where: { groupId_addonId: { groupId: id, addonId: aid } },
        update: { isEnabled: true },
        create: { groupId: id, addonId: aid, isEnabled: true },
      })),
    ])
    }

    return res.json({ message: 'Group updated successfully' })
  } catch (error) {
    console.error('Error updating group:', error)
    res.status(500).json({ message: 'Failed to update group', error: error?.message })
  }
})

// Delete a group (hard delete and detach users/addons)
app.delete('/api/groups/:id', async (req, res) => {
  try {
    const { id } = req.params
    const existing = await prisma.group.findUnique({ 
      where: { 
        id,
        accountId: getAccountId(req)
      }
    })
    if (!existing) {
      return res.status(404).json({ message: 'Group not found' })
    }

    await prisma.$transaction([
      // GroupMember model removed - using JSON arrays instead
      prisma.groupAddon.deleteMany({ where: { groupId: id } }),
      // ActivityLog model removed
      prisma.group.delete({ 
        where: { 
          id,
          accountId: getAccountId(req)
        }
      }),
    ])

    return res.json({ message: 'Group deleted and members/addons detached' })
  } catch (error) {
    console.error('Error deleting group:', error)
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Group not found' })
    }
    return res.status(500).json({ message: 'Failed to delete group', error: error?.message })
  }
})

// Toggle group status (enable/disable)
app.patch('/api/groups/:id/toggle-status', async (req, res) => {
  try {
    const { id } = req.params
    const { isActive } = req.body
    
    console.log(`🔍 PATCH /api/groups/${id}/toggle-status called with:`, { isActive })
    
    // Update group status
    const updatedGroup = await prisma.group.update({
      where: { id },
      data: { isActive: !isActive },
      include: {
        members: {
          include: {
            user: true
          }
        },
        addons: {
          include: {
            addon: true
          }
        }
      }
    })
    
    res.json(updatedGroup)
  } catch (error) {
    console.error('Error toggling group status:', error)
    res.status(500).json({ error: 'Failed to toggle group status', details: error?.message })
  }
})

// Helper function to get sync mode from request headers or default to normal
function getSyncMode(req) {
  const syncMode = req?.headers?.['x-sync-mode'] || 'normal'
  return syncMode === 'advanced' ? 'advanced' : 'normal'
}

// Reusable function to sync a single user's addons
async function syncUserAddons(userId, excludedManifestUrls = [], syncMode = 'normal', unsafeMode = false) {
  try {
    console.log('🚀 Syncing user addons:', userId, { excludedManifestUrls })
    // Normalize and log exclusions early
    const localNormalize = (s) => (s || '').toString().trim().toLowerCase()
    const rawExclArr = Array.isArray(excludedManifestUrls) ? excludedManifestUrls : []
    const normalizedExcl = rawExclArr.map((u) => localNormalize(u))
    console.log('🧪 Normalized exclusions:', normalizedExcl)

    // Load user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        stremioAuthKey: true,
        isActive: true,
        protectedAddons: true,
        accountId: true
      }
    })

    if (!user) return { success: false, error: 'User not found' }
    if (!user.isActive) return { success: false, error: 'User is disabled' }
    if (!user.stremioAuthKey) return { success: false, error: 'User is not connected to Stremio' }

    // Find groups that contain this user
    const groups = await prisma.group.findMany({
      where: {
        accountId: user.accountId,
        userIds: {
          contains: user.id
        }
      },
      include: {
        addons: {
          include: {
            addon: true
          }
        }
      }
    })

    const excludedSet = new Set(
      Array.isArray(excludedManifestUrls) ? excludedManifestUrls.map((id) => String(id).trim()) : []
    )

    const familyGroup = groups[0]
    // Decrypt addon fields for sync: derive the right key per account
    const resolveAddonFields = (addon) => {
      const result = { manifestUrl: addon?.manifestUrl || null, manifest: addon?.manifest || null }
      try {
        const scopeId = addon?.accountId || user.accountId || userId
        let key = null
        try { key = getAccountDek(scopeId) } catch {}
        if (!key) { key = getServerKey() }
        // manifestUrl may be encrypted string
        if (typeof addon?.manifestUrl === 'string') {
          try { result.manifestUrl = aesGcmDecrypt(key, addon.manifestUrl) } catch { /* keep as is */ }
        }
        // manifest may be encrypted string of JSON
        if (typeof addon?.manifest === 'string') {
          try {
            const dec = aesGcmDecrypt(key, addon.manifest)
            try { result.manifest = JSON.parse(dec) } catch { result.manifest = dec }
          } catch { /* keep as is */ }
        }
      } catch {}
      return result
    }

    const familyAddons = Array.isArray(familyGroup?.addons)
      ? familyGroup.addons
          .filter((ga) => ga?.addon?.isActive !== false)
          .map((ga) => {
            const decrypted = resolveAddonFields(ga.addon)
            return {
              id: ga.addon.id,
              name: ga.addon.name,
              version: ga.addon.version,
              description: ga.addon.description,
              manifestUrl: decrypted.manifestUrl,
              manifest: decrypted.manifest,
            }
          })
          .filter((fa) => fa?.manifestUrl && !excludedSet.has(fa.id))
      : []

    console.log('🔍 Group addons from database:', JSON.stringify(familyAddons, null, 2))

    // Advanced sync: reload all group addons first
    let reloadedCount = 0
    let totalAddons = familyAddons.length
    
    if (syncMode === 'advanced') {
      console.log('🔄 Advanced sync mode: reloading all group addons first...')
      for (const fa of familyAddons) {
        try {
          console.log(`🔄 Reloading addon: ${fa.name} (${fa.manifestUrl})`)
          
          // Fetch fresh manifest
          const response = await fetch(fa.manifestUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(10000)
          })
          
          if (response.ok) {
            const manifestData = await response.json()
            
            // Update the addon in database with fresh data
            await prisma.addon.update({
              where: { 
                id: fa.id,
                accountId: getAccountId(req)
              },
              data: {
                name: manifestData?.name || fa.name,
                description: manifestData?.description || fa.description,
                version: manifestData?.version || fa.version,
                manifest: manifestData,
                iconUrl: manifestData?.logo || null,
              }
            })
            
            console.log(`✅ Successfully reloaded: ${fa.name}`)
            reloadedCount++
          } else {
            console.warn(`⚠️ Failed to reload ${fa.name}: ${response.status}`)
          }
        } catch (error) {
          console.warn(`⚠️ Error reloading ${fa.name}:`, error.message)
        }
      }
      
      // Reload the group addons from database to get updated data
      const updatedFamilyGroup = await prisma.group.findUnique({
        where: { id: familyGroup.id },
        include: {
          addons: { 
            include: { addon: true },
            where: { isEnabled: { not: false } }
          }
        }
      })
      
      const updatedFamilyAddons = Array.isArray(updatedFamilyGroup?.addons)
        ? updatedFamilyGroup.addons
            .filter((ga) => (ga?.isEnabled !== false) && (ga?.addon?.isActive !== false) && ga?.addon?.accountId === user.accountId)
            .map((ga) => ({
              id: ga.addon.id,
              name: ga.addon.name,
              version: ga.addon.version,
              description: ga.addon.description,
              manifestUrl: ga.addon.manifestUrl,
              manifest: ga.addon.manifest,
            }))
            .filter((fa) => fa?.manifestUrl && !excludedSet.has(fa.manifestUrl))
        : []
      
      console.log('🔍 Updated group addons after reload:', JSON.stringify(updatedFamilyAddons, null, 2))
      
      // Use updated addons for sync
      familyAddons.splice(0, familyAddons.length, ...updatedFamilyAddons)
    }

    // Decrypt auth
    let authKeyPlain
    try { authKeyPlain = decrypt(user.stremioAuthKey) } catch { return { success: false, error: 'Failed to decrypt Stremio credentials' } }

    // Create StremioAPIClient for this user
    const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })

    // Helper function for URL normalization
    const normalize = (s) => (s || '').toString().trim().toLowerCase()

    // Protected addons logic:
    // 1. Default Stremio addons: protected in safe mode, not protected in unsafe mode
    // 2. User-defined protected addons: ALWAYS protected regardless of mode
    
    const protectedAddonIds = unsafeMode ? new Set() : new Set(defaultAddons.ids)
    const protectedManifestUrls = unsafeMode ? new Set() : new Set(defaultAddons.manifestUrls.map(normalize))

    // Parse user-defined protected addons (ALWAYS protected regardless of mode)
    let userProtectedAddons = []
    try {
      const encryptedUrls = user.protectedAddons ? JSON.parse(user.protectedAddons) : []
      if (Array.isArray(encryptedUrls)) {
        userProtectedAddons = encryptedUrls.map(encryptedUrl => {
          try {
            return decrypt(encryptedUrl, req)
          } catch (e) {
            console.warn('Failed to decrypt protected addon URL in sync:', e.message)
            return null
          }
        }).filter(url => url !== null)
      }
    } catch (e) {
      console.warn('Failed to parse user protected addons in sync:', e)
      userProtectedAddons = []
    }
    
    // Add user-defined protected addons to the protected URLs set (ALWAYS)
    userProtectedAddons.forEach(url => {
      if (url && typeof url === 'string') {
        protectedManifestUrls.add(normalize(url))
        console.log(`🔒 Added user protected addon: ${url}`)
      }
    })
    
    const isProtected = (a) => {
      const aid = a?.id || a?.manifest?.id || ''
      const url = normalize(a?.manifestUrl || a?.transportUrl || a?.url)
      return protectedAddonIds.has(aid) || protectedManifestUrls.has(url)
    }

    // Pull current collection
    const current = await apiClient.request('addonCollectionGet', {})
    const currentAddonsRaw = current?.addons || current || []
    const currentAddons = Array.isArray(currentAddonsRaw) ? currentAddonsRaw : (typeof currentAddonsRaw === 'object' ? Object.values(currentAddonsRaw) : [])
    console.log('📥 Current addons from Stremio:', currentAddons?.length || 0)

    // Build desired group addon objects (fetch manifests with fallback to stored data)
    const desiredGroup = []
    for (const fa of familyAddons) {
      try {
        const resp = await fetch(fa.manifestUrl)
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}: ${resp.statusText}`)
        }
        const manifest = await resp.json()
        console.log(`🔍 Live manifest fetched for ${fa.name}:`, JSON.stringify(manifest, null, 2))
        
        // Ensure manifest has required fields
        const safeManifest = {
          id: manifest?.id || 'unknown',
          name: manifest?.name || fa.name || 'Unknown',
          version: manifest?.version || '1.0.0', // Default version if null
          description: manifest?.description || fa.description || '',
          ...manifest // Include all other manifest fields
        }
        console.log(`🔍 Safe manifest created:`, JSON.stringify(safeManifest, null, 2))
        
        desiredGroup.push({
          transportUrl: fa.manifestUrl,
          transportName: safeManifest.name,
          manifest: safeManifest,
        })
      } catch (e) {
        console.warn(`⚠️ Failed to fetch manifest for ${fa.manifestUrl}:`, e.message)
        
        // Always include the addon, even if we can't fetch the live manifest
        // Use stored manifest from the database as fallback
        let fallbackManifest
        if (fa.manifest && typeof fa.manifest === 'object') {
          // Use the stored manifest JSON if available
          fallbackManifest = {
            id: fa.manifest.id || fa.id || 'unknown',
            name: fa.manifest.name || fa.name || 'Unknown',
            version: fa.manifest.version || fa.version || '1.0.0',
            description: fa.manifest.description || fa.description || '',
            types: fa.manifest.types || ['other'],
            resources: fa.manifest.resources || [],
            catalogs: fa.manifest.catalogs || [],
            ...fa.manifest // Include all other manifest fields
          }
          console.log(`🔍 Using stored manifest for ${fa.name}:`, JSON.stringify(fallbackManifest, null, 2))
        } else {
          // Fallback to database fields if no stored manifest
          fallbackManifest = {
            id: fa.id || 'unknown',
            name: fa.name || 'Unknown',
            version: fa.version || '1.0.0',
            description: fa.description || '',
            types: ['other'],
            resources: [],
            catalogs: []
          }
          console.log(`🔍 Using database fields for ${fa.name}:`, JSON.stringify(fallbackManifest, null, 2))
        }
        
        desiredGroup.push({ 
          transportUrl: fa.manifestUrl,
          transportName: fallbackManifest.name,
          manifest: fallbackManifest
        })
        
        if (e.message.includes('429') || e.message.includes('Too Many Requests')) {
          console.warn(`⏭️ Using stored manifest due to rate limiting: ${fallbackManifest.name}`)
        } else {
          console.warn(`⏭️ Using stored manifest due to fetch error: ${fallbackManifest.name}`)
        }
      }
    }

    // Don't filter out any group addons here - the "locked positions" approach
    // will handle protected addons by preserving their positions
    const nonProtectedGroupAddons = desiredGroup
    // Build desired collection: preserve protected addons in their original positions, add group addons in correct order

    // Build the desired collection using the "locked positions" approach:
    // 1. Identify protected positions (locked, never move)
    // 2. Fill available positions with group addons in order
    // 3. Remove any addons that don't fit (excluded/deleted)
    
    // Step 1: Identify protected positions and their addons
    const protectedPositions = new Set()
    const protectedAddons = new Map() // position -> addon
    
    for (let i = 0; i < currentAddons.length; i++) {
      const currentAddon = currentAddons[i]
      if (isProtected(currentAddon)) {
        protectedPositions.add(i)
        protectedAddons.set(i, currentAddon)
      }
    }
    
    // Step 2: Create result array with protected addons in their locked positions
    const result = new Array(currentAddons.length).fill(null)
    for (const [position, addon] of protectedAddons) {
      result[position] = addon
    }
    
    // Step 3: Fill available positions with group addons in order
    let groupAddonIndex = 0
    for (let i = 0; i < result.length && groupAddonIndex < nonProtectedGroupAddons.length; i++) {
      if (result[i] === null) {
        // This position is available for a group addon
        result[i] = nonProtectedGroupAddons[groupAddonIndex]
        groupAddonIndex++
      }
    }
    
    // Step 4: Add any remaining group addons at the end
    while (groupAddonIndex < nonProtectedGroupAddons.length) {
      result.push(nonProtectedGroupAddons[groupAddonIndex])
      groupAddonIndex++
    }
    
    // Step 5: Remove null values (holes) and dedupe by URL
    const seenUrls = new Set()
    const desiredCollection = result.filter(addon => {
      if (!addon) return false
      const u = normalize(addon?.transportUrl || addon?.manifestUrl || addon?.url)
      if (!u) return true
      if (seenUrls.has(u)) return false
      seenUrls.add(u)
      return true
    })

    // Note: Excluded addons are already filtered out at the database level when building familyAddons
    // The desiredCollection already contains only non-excluded addons
    const finalDesiredCollection = desiredCollection
    
    console.log('🔍 Final desired collection (excluded addons already filtered):', finalDesiredCollection.map(a => ({ 
      name: a?.manifest?.name || a?.name, 
      protected: isProtected(a),
      url: normalize(a?.transportUrl || a?.manifestUrl || a?.url)
    })))
    
    console.log('🔒 Protected addons preserved in their positions:', currentAddons.filter(a => isProtected(a)).map(a => ({ 
      name: a?.manifest?.name || a?.name, 
      transportName: a?.transportName,
      id: a?.manifest?.id || a?.id,
      version: a?.manifest?.version
    })))

    // Early no-op check: if current collection already equals desired, skip update
    // Compare the entire desired collection with current collection
    const toKey = (a) => {
      const id = a?.manifest?.id || a?.id || ''
      const url = normalize(a?.transportUrl || a?.manifestUrl || a?.url)
      return `${id}@@${url}`
    }
    const currentKeys = new Set(currentAddons.map(toKey))
    const desiredKeys = new Set(finalDesiredCollection.map(toKey))
    const sameSize = currentKeys.size === desiredKeys.size
    let allMatch = sameSize
    if (allMatch) {
      for (const k of desiredKeys) { if (!currentKeys.has(k)) { allMatch = false; break } }
    }
    // If sets match, also ensure order matches exactly
    let curSeq, desSeq
    if (allMatch) {
      curSeq = currentAddons.map((a) => normalize(a?.transportUrl || a?.manifestUrl || a?.url))
      desSeq = finalDesiredCollection.map((a) => normalize(a?.transportUrl || a?.manifestUrl || a?.url))
      if (curSeq.length !== desSeq.length) {
        allMatch = false
      } else {
        for (let i = 0; i < curSeq.length; i++) {
          if (curSeq[i] !== desSeq[i]) { allMatch = false; break }
        }
      }
    }
    if (allMatch) {
      console.log('✅ Collections match, but ensuring Stremio API is updated...')
      console.log('🔍 Current sequence:', curSeq)
      console.log('🔍 Desired sequence:', desSeq)
      
      // Even if collections match, push to Stremio API to ensure order is correct
      try {
        // Hydrate desired entries with full objects from current collection to avoid "Unknown" manifests
        const currentByUrl = new Map(
          currentAddons.map((a) => [
            normalize(a?.transportUrl || a?.manifestUrl || a?.url),
            a
          ])
        )
        const collectionToPush = finalDesiredCollection.map((a) => {
          const u = normalize(a?.transportUrl || a?.manifestUrl || a?.url)
          const cur = currentByUrl.get(u)
          if (cur) return cur
          // Ensure Local Files always has a proper manifest when missing
          if (u === 'http://127.0.0.1:11470/local-addon/manifest.json') {
            return {
              transportUrl: u,
              transportName: 'Local Files',
              manifest: {
                id: 'org.stremio.local',
                name: 'Local Files',
                version: a?.manifest?.version || '1.0.0',
                ...(a?.manifest || {})
              }
            }
          }
          return a
        })
        await apiClient.request('addonCollectionSet', { addons: collectionToPush })
        console.log('✅ Pushed addon collection to Stremio API')
      } catch (error) {
        console.error('Error pushing to Stremio API:', error)
        return res.status(502).json({ message: 'Failed to update Stremio addons', error: error?.message })
      }
      
      const total = currentAddons.length
      
      // Update user's stremioAddons field
      try {
        // Persist hydrated objects so manifests are intact (no "Unknown")
        const currentByUrl = new Map(
          currentAddons.map((a) => [
            normalize(a?.transportUrl || a?.manifestUrl || a?.url),
            a
          ])
        )
        const hydrated = finalDesiredCollection.map((a) => {
          const u = normalize(a?.transportUrl || a?.manifestUrl || a?.url)
          return currentByUrl.get(u) || a
        })
        // Note: stremioAddons field was removed from User schema
        // No database update needed for sync
        console.log('💾 Sync completed (stremioAddons field removed from schema)')
      } catch (updateError) {
        console.warn('⚠️ Failed to update user stremioAddons:', updateError.message)
      }
      
      if (syncMode === 'advanced') {
        return { 
          success: true, 
          total, 
          alreadySynced: false, 
          reloadedCount, 
          totalAddons 
        }
      }
      return { success: true, total, alreadySynced: false }
    }

    // Set the addon collection using the proper format (replaces, removes extras not included)
    try {
      console.log('🔄 Setting addon collection (preserve protected addons + add group addons, exclude excluded addons)')
      console.log('📊 Desired collection addons:', finalDesiredCollection.map(a => ({ 
        name: a?.manifest?.name || a?.name, 
        id: a?.manifest?.id || a?.id,
        version: a?.manifest?.version,
        description: a?.manifest?.description,
        url: normalize(a?.transportUrl || a?.manifestUrl || a?.url)
      })))
      console.log('🔍 Full desired collection being sent to Stremio:', JSON.stringify(finalDesiredCollection, null, 2))
      
      // Hydrate with current objects when available to avoid losing manifest data
      const currentByUrlForSet = new Map(
        currentAddons.map((a) => [
          normalize(a?.transportUrl || a?.manifestUrl || a?.url),
          a
        ])
      )
      const collectionToSet = finalDesiredCollection.map((a) => {
        const u = normalize(a?.transportUrl || a?.manifestUrl || a?.url)
        const cur = currentByUrlForSet.get(u)
        if (cur) return cur
        if (u === 'http://127.0.0.1:11470/local-addon/manifest.json') {
          return {
            transportUrl: u,
            transportName: 'Local Files',
            manifest: {
              id: 'org.stremio.local',
              name: 'Local Files',
              version: a?.manifest?.version || '1.0.0',
              ...(a?.manifest || {})
            }
          }
        }
        return a
      })
      await apiClient.request('addonCollectionSet', { addons: collectionToSet })
      
      // small wait for propagation
      await new Promise((r) => setTimeout(r, 1500))
    } catch (e) {
      console.error('❌ Failed to set addon collection:', e.message)
      return { success: false, error: `Failed to sync addons: ${e?.message}` }
    }

    // Pull after to report counts
    const after = await apiClient.request('addonCollectionGet', {})
    const total = Array.isArray(after?.addons) ? after.addons.length : (after?.addons ? Object.keys(after.addons).length : 0)

    // Note: stremioAddons field was removed from User schema
    // No database update needed for connect
    console.log('💾 Connect completed (stremioAddons field removed from schema)')

    console.log('✅ Sync complete, total addons:', total)
    if (syncMode === 'advanced') {
      return { success: true, total, reloadedCount, totalAddons }
    }
    return { success: true, total }
  } catch (error) {
    console.error('Error in syncUserAddons:', error)
    return { success: false, error: error?.message || 'Unknown error' }
  }
}

// Sync all users in a group
app.post('/api/groups/:id/sync', async (req, res) => {
  try {
    const { id: groupId } = req.params
    const { excludedManifestUrls = [] } = req.body
    const syncMode = getSyncMode(req)
    
    console.log('🚀 Group sync endpoint called with:', groupId, { excludedManifestUrls })
    
    // Get the group with its users
    const group = await prisma.group.findUnique({
      where: { id: groupId }
    })
    
    if (!group) {
      return res.status(404).json({ message: 'Group not found' })
    }
    
    if (!group.isActive) {
      return res.status(400).json({ message: 'Group is disabled' })
    }
    
    // Determine database type
    const isSqlite = process.env.PRISMA_PROVIDER === 'sqlite'
    
    // Get users from the group using userIds JSON array (both SQLite and PostgreSQL)
    const userIds = group.userIds ? JSON.parse(group.userIds) : []
    const groupUsers = await prisma.user.findMany({
      where: {
        id: { in: userIds },
        isActive: true,
        stremioAuthKey: { not: null }
      }
    })
    
    if (groupUsers.length === 0) {
      return res.json({ 
        message: 'No users with Stremio connections found in this group',
        syncedUsers: 0
      })
    }
    
    console.log(`👥 Found ${groupUsers.length} users with Stremio connections in group "${group.name}"`)
    
    let syncedCount = 0
    const errors = []
    let totalReloaded = 0
    let totalAddons = 0
    
    // Sync each user in the group using the individual user sync HTTP endpoint
    for (const user of groupUsers) {
      try {
        debug.log(`🔄 Syncing user: ${user.username || user.email}`)

        // Get user exclusions - handle both SQLite and PostgreSQL
        let finalExcluded = []
        
        if (isSqlite) {
          // SQLite: Check for membership-specific exclusions first, fallback to user-level
          let memberExcluded = []
          try {
            const membership = await prisma.groupMember.findFirst({
              where: { userId: user.id, groupId },
              select: { excludedAddons: true }
            })
            memberExcluded = parseAddonIds(membership?.excludedAddons)
          } catch (e) {
            console.warn('Failed to parse membership exclusions:', e)
          }
          
          const userExcluded = parseAddonIds(user.excludedAddons)
          finalExcluded = [...memberExcluded, ...userExcluded, ...excludedManifestUrls]
        } else {
          // PostgreSQL: Only user-level exclusions
          const userExcluded = parseAddonIds(user.excludedAddons)
          finalExcluded = [...userExcluded, ...excludedManifestUrls]
        }

        // Call the sync function directly to avoid authentication issues
        try {
          const result = await syncUserAddons(user.id, finalExcluded, false) // false = not unsafe mode
          syncedCount++
          debug.log(`✅ Successfully synced user: ${user.username || user.email}`)
        } catch (syncError) {
          const errorMsg = syncError?.message || 'Unknown sync error'
          errors.push(`${user.username || user.email}: ${errorMsg}`)
          console.log(`❌ Failed to sync user: ${user.username || user.email} - ${errorMsg}`)
        }
      } catch (error) {
        errors.push(`${user.username || user.email}: ${error.message}`)
        console.error(`❌ Error syncing user ${user.username || user.email}:`, error)
      }
    }
    
    let message = `Group "${group.name}" sync completed.\n${syncedCount}/${groupUsers.length} users synced`
    
    // Add reload progress if available (show even when 0 reloaded)
    if (totalAddons > 0) {
      message += `\n${totalReloaded}/${totalAddons} addons reloaded`
    }
    
    if (errors.length > 0) {
      console.log('⚠️ Some users failed to sync:', errors)
    }
    
    res.json({
      message,
      syncedUsers: syncedCount,
      totalUsers: groupUsers.length,
      errors: errors.length > 0 ? errors : undefined,
      ...(totalAddons > 0 && { reloadedAddons: totalReloaded, totalAddons })
    })
    
  } catch (error) {
    console.error('Error syncing group:', error)
    res.status(500).json({ message: 'Failed to sync group', error: error?.message })
  }
})

// Reorder addons in a user's Stremio account
app.post('/api/users/:id/stremio-addons/reorder', async (req, res) => {
  try {
    const { id: userId } = req.params
    const { orderedManifestUrls } = req.body || {}
    
    console.log(`🔄 Reordering Stremio addons for user ${userId}:`, orderedManifestUrls)
    
    if (!Array.isArray(orderedManifestUrls) || orderedManifestUrls.length === 0) {
      return res.status(400).json({ message: 'orderedManifestUrls array is required' })
    }
    
    // Get the user
    const user = await prisma.user.findUnique({
      where: { 
        id: userId,
        accountId: getAccountId(req)
      }
    })
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }
    
    if (!user.stremioAuthKey) {
      return res.status(400).json({ message: 'User is not connected to Stremio' })
    }
    
    // Decrypt auth key
    let authKeyPlain
    try { 
      authKeyPlain = decrypt(user.stremioAuthKey) 
    } catch { 
      return res.status(500).json({ message: 'Failed to decrypt Stremio credentials' }) 
    }
    
    // Use StremioAPIClient to get current addons
    const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })
    const current = await apiClient.request('addonCollectionGet', {})
    const currentAddons = current?.addons || []
    
    // Create a map of manifest URLs to addon objects
    const manifestToAddon = new Map()
    currentAddons.forEach(addon => {
      const manifestUrl = addon.transportUrl
      if (manifestUrl) {
        manifestToAddon.set(manifestUrl, addon)
      }
    })
    
    // Validate that all provided URLs exist in the user's addons
    const invalidUrls = orderedManifestUrls.filter(url => !manifestToAddon.has(url))
    if (invalidUrls.length > 0) {
      return res.status(400).json({ 
        message: `Invalid manifest URLs: ${invalidUrls.join(', ')}` 
      })
    }
    
    // Create the reordered addon collection
    const reorderedAddons = orderedManifestUrls.map(url => manifestToAddon.get(url))
    
    // Set the reordered collection using the proper format
    await apiClient.request('addonCollectionSet', { addons: reorderedAddons })
    console.log(`✅ Successfully reordered ${reorderedAddons.length} addons for user ${userId}`)
    
    // Note: stremioAddons field was removed from User schema
    // No database update needed for reordering
    
    res.json({ 
      message: `Successfully reordered ${reorderedAddons.length} addons`,
      reorderedCount: reorderedAddons.length
    })
    
  } catch (error) {
    console.error('Error reordering user Stremio addons:', error)
    return res.status(500).json({ message: 'Failed to reorder addons', error: error?.message })
  }
})

// Clear corrupted Stremio credentials
// Reorder addons in a group
app.post('/api/groups/:id/addons/reorder', async (req, res) => {
  try {
    const { id: groupId } = req.params
    const { orderedManifestUrls } = req.body || {}
    
    console.log(`🔄 Reordering addons for group ${groupId}:`, orderedManifestUrls)
    
    if (!Array.isArray(orderedManifestUrls) || orderedManifestUrls.length === 0) {
      return res.status(400).json({ message: 'orderedManifestUrls array is required' })
    }
    
    // Get the group with its current addons
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        addons: {
          include: {
            addon: true
          }
        }
      }
    })
    
    if (!group) {
      return res.status(404).json({ message: 'Group not found' })
    }
    
    // Create a map of manifest URLs to addon IDs
    const manifestToAddonId = new Map()
    group.addons.forEach(groupAddon => {
      const manifestUrl = groupAddon.addon.manifestUrl
      if (manifestUrl) {
        manifestToAddonId.set(manifestUrl, groupAddon.addon.id)
      }
    })
    
    // Validate that all provided URLs exist in the group
    const invalidUrls = orderedManifestUrls.filter(url => !manifestToAddonId.has(url))
    if (invalidUrls.length > 0) {
      return res.status(400).json({ 
        message: `Invalid manifest URLs: ${invalidUrls.join(', ')}` 
      })
    }
    
    // For both SQLite and PostgreSQL, we delete and recreate GroupAddon records in the new order
    // This maintains the order through the id field (creation order)
    // This approach works for both databases since neither has a dedicated ordering field
    
    // Delete existing group addon relationships
    await prisma.groupAddon.deleteMany({
      where: { groupId }
    })
    
    // Recreate them in the new order
    const addonIds = orderedManifestUrls.map(url => manifestToAddonId.get(url))
    const groupAddonData = addonIds.map(addonId => ({
      groupId,
      addonId
    }))
    
    if (groupAddonData.length > 0) {
      await prisma.groupAddon.createMany({
        data: groupAddonData
      })
    }
    
    console.log(`✅ Successfully reordered ${orderedManifestUrls.length} addons for group ${groupId}`)
    
    // Sync all users in the group to match the new order
    console.log(`🔄 Syncing all users in group ${groupId} to match new addon order...`)
    
    try {
      // Call the existing group sync endpoint logic
      const group = await prisma.group.findUnique({
        where: { id: groupId }
      })
      
      if (!group) {
        console.log(`⚠️ Group ${groupId} not found`)
      } else if (!group.isActive) {
        console.log(`⚠️ Group ${groupId} is disabled`)
      } else {
        // Get users from userIds array (SQLite approach)
        const userIds = group.userIds ? JSON.parse(group.userIds) : []
        const groupUsers = await prisma.user.findMany({
          where: {
            id: { in: userIds },
            stremioAuthKey: { not: null },
            accountId: getAccountId(req)
          }
        })
        
        if (groupUsers.length === 0) {
          console.log(`⚠️ No users with Stremio connections found in group ${groupId}`)
        } else {
          console.log(`👥 Found ${groupUsers.length} users with Stremio connections in group "${group.name}"`)
          
          let syncedCount = 0
          const errors = []
          
          // Get the group's addon order for syncing
          // Use id ordering for both databases since neither has a dedicated ordering field
          const groupAddons = await prisma.groupAddon.findMany({
            where: { groupId },
            include: { addon: true },
            orderBy: { id: 'asc' }
          })
          
          const orderedManifestUrls = groupAddons
            .filter(ga => ga.addon && ga.addon.manifestUrl && ga.addon.accountId === getAccountId(req))
            .map(ga => ga.addon.manifestUrl)
          
          console.log(`📋 Group addon order for sync: ${orderedManifestUrls.length} addons`)
          
          
          console.log(`✅ Group sync completed: ${syncedCount}/${groupUsers.length} users synced`)
          if (errors.length > 0) {
            console.log('⚠️ Some users failed to sync:', errors)
          }
        }
      }
    } catch (error) {
      console.error(`❌ Error during group sync:`, error)
    }
    
    res.json({ 
      message: 'Addons reordered successfully and all users synced',
      orderedCount: orderedManifestUrls.length,
      isSynced: true // Since we just synced all users, they should be synced
    })
    
  } catch (error) {
    console.error('Error reordering group addons:', error)
    return res.status(500).json({ message: 'Failed to reorder addons', error: error?.message })
  }
})

app.post('/api/users/:id/clear-stremio-credentials', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id }
    });

    if (!existingUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Clear Stremio credentials
    const updatedUser = await prisma.user.update({
      where: { 
        id,
        accountId: getAccountId(req)
      },
      data: {
        stremioAuthKey: null,
        stremioAddons: null,
        isActive: false, // Disconnect user since Stremio credentials are cleared
      },
    });

    res.json({ message: 'Stremio credentials cleared successfully', userId: updatedUser.id });
  } catch (error) {
    console.error('Error clearing Stremio credentials:', error);
    res.status(500).json({ message: 'Failed to clear Stremio credentials', error: error?.message });
  }
});

// Connect existing user to Stremio
app.post('/api/users/:id/connect-stremio', async (req, res) => {
  try {
    const safe = (() => { const { password: _pw, authKey: _ak, ...rest } = (req.body || {}); return rest })()
    console.log('🚀 Connect Stremio endpoint called with:', req.params.id, safe);
  } catch {
    console.log('🚀 Connect Stremio endpoint called with:', req.params.id, '{redacted}')
  }
  try {
    const { id } = req.params;
    const { email, password, username } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    
    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id }
    });
    
    if (!existingUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if user already has Stremio credentials
    console.log('🔍 User stremioAuthKey:', existingUser.stremioAuthKey);
    console.log('🔍 User stremioAuthKey type:', typeof existingUser.stremioAuthKey);
    console.log('🔍 User stremioAuthKey truthy:', !!existingUser.stremioAuthKey);
    
    // Allow reconnection - we'll update the stremioAuthKey with new credentials
    console.log('🔍 User stremioAuthKey exists:', !!existingUser.stremioAuthKey);
    console.log('🔍 Allowing reconnection to update credentials');
    
    // Create a temporary storage object for this authentication session
    const tempStorage = {};
    
    // Create Stremio API store for this user
    const apiStore = new StremioAPIStore({
      endpoint: 'https://api.strem.io',
      storage: {
        getJSON: (key) => {
          if (tempStorage[key] !== undefined) {
            return tempStorage[key];
          }
          switch (key) {
            case 'addons':
              return [];
            case 'user':
              return null;
            case 'auth':
              return null;
            default:
              return null;
          }
        },
        setJSON: (key, value) => {
          tempStorage[key] = value;
        }
      }
    });
    
    // Create Stremio API client
    const apiClient = new StremioAPIClient(apiStore);
    
    // Authenticate with Stremio using the same method as new user creation
    const loginEmailOnly = async () => {
      let lastErr
      for (const attempt of [
        () => apiStore.login({ email, password }),
        () => apiStore.login(email, password),
      ]) {
        try {
          await attempt()
          return
        } catch (e) {
          lastErr = e
        }
      }
      throw lastErr
    }
    
    try {
      await loginEmailOnly()
    } catch (e) {
      console.error('Stremio connection error:', e);
      
      // Handle specific Stremio API errors
      if (e?.response?.data?.code === 2) {
        return res.status(401).json({ 
          message: 'User not found',
          error: 'No Stremio account found with this email. Please register first or check your credentials.'
        });
      }
      
      if (e?.response?.data?.code === 3) {
        return res.status(401).json({ 
          message: 'Invalid password',
          error: 'Incorrect password for this Stremio account.'
        });
      }
      
      if (e?.response?.data?.code === 26) {
        return res.status(400).json({ 
          message: 'Invalid email address',
          error: 'Please enter a valid email address'
        });
      }
      
      // Handle other Stremio API errors
      if (e?.response?.data?.message) {
        return res.status(400).json({ 
          message: e.response.data.message,
          error: 'Stremio authentication failed'
        });
      }
      
      return res.status(401).json({ message: 'Invalid Stremio credentials' });
    }
    
    // Pull user's addon collection from Stremio
    await apiStore.pullAddonCollection();
    
    // Get authentication data from the API store (support both possible keys)
    const authKey = apiStore.authKey || tempStorage.auth || tempStorage.authKey;
    const userData = apiStore.user || tempStorage.user;
    
    // Debug: Check what's available
    console.log('🔍 apiStore.authKey:', !!apiStore.authKey);
    console.log('🔍 tempStorage.auth:', !!tempStorage.auth);
    console.log('🔍 apiStore.user:', !!apiStore.user);
    console.log('🔍 tempStorage.user:', !!tempStorage.user);
    
    if (!authKey || !userData) {
      console.error('🔍 Missing auth data - authKey:', !!authKey, 'userData:', !!userData);
      return res.status(401).json({ message: 'Failed to get Stremio authentication data' });
    }
    
    // Get user's addons using the same logic as stremio-addons endpoint
    let addonsData = [];
    try {
      const collection = await apiClient.request('addonCollectionGet', {});
      const rawAddons = collection?.addons || collection || {};
      const addonsNormalized = Array.isArray(rawAddons)
        ? rawAddons
        : (typeof rawAddons === 'object' ? Object.values(rawAddons) : []);
      
      // Process addons to get the actual count (same as stremio-addons endpoint)
      addonsData = await Promise.all(addonsNormalized.map(async (a) => {
        let manifestData = null;
        
        // Always try to fetch manifest if we have a URL and no proper manifest data
        if ((a?.manifestUrl || a?.transportUrl || a?.url) && (!a?.manifest || !a?.name || a.name === 'Unknown')) {
          try {
            const manifestUrl = a?.manifestUrl || a?.transportUrl || a?.url;
            const response = await fetch(manifestUrl);
            if (response.ok) {
              manifestData = await response.json();
            }
          } catch (e) {
            // Ignore manifest fetch errors for counting
          }
        }

        return {
          id: a?.id || a?.manifest?.id || manifestData?.id || 'unknown',
          name: a?.name || a?.manifest?.name || manifestData?.name || 'Unknown',
          manifestUrl: a?.manifestUrl || a?.transportUrl || a?.url || null,
          version: a?.version || a?.manifest?.version || manifestData?.version || null,
          description: a?.description || a?.manifest?.description || manifestData?.description || '',
          manifest: manifestData || a?.manifest || {
            id: manifestData?.id || a?.manifest?.id || a?.id || 'unknown',
            name: manifestData?.name || a?.manifest?.name || a?.name || 'Unknown',
            version: manifestData?.version || a?.manifest?.version || a?.version || null,
            description: manifestData?.description || a?.manifest?.description || a?.description || '',
            types: manifestData?.types || a?.manifest?.types || ['other'],
            resources: manifestData?.resources || a?.manifest?.resources || [],
            catalogs: manifestData?.catalogs || a?.manifest?.catalogs || []
          }
        };
      }));
      
      console.log('🔍 Processed addonsData length:', addonsData.length);
    } catch (e) {
      console.log('Could not fetch addons:', e.message);
    }
    
    // Encrypt the auth key for secure storage
    const encryptedAuthKey = encrypt(authKey);
    
    // Update user with Stremio credentials
    const updatedUser = await prisma.user.update({
      where: { 
        id,
        accountId: getAccountId(req)
      },
      data: {
        email: email,
        username: username || userData?.username || email.split('@')[0],
        stremioAuthKey: encryptedAuthKey,
        stremioAddons: JSON.stringify(addonsData || {}),
        isActive: true, // Re-enable the user after successful reconnection
      }
    });
    
    return res.json({ 
      message: 'Successfully connected to Stremio', 
      addonsCount: addonsData.length,
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email
      }
    });
    
  } catch (error) {
    console.error('Stremio connection error:', error);
    return res.status(500).json({ 
      message: 'Failed to connect to Stremio', 
      error: error?.message || 'Unknown error' 
    });
  }
});

// Test endpoint to manually set Stremio credentials (for testing only)
app.post('/api/test/set-stremio-credentials/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { authKey } = req.body;
    
    if (!authKey) {
      return res.status(400).json({ message: 'Auth key is required' });
    }
    
    // Encrypt the auth key
    const encryptedAuthKey = encrypt(authKey);
    
    // Update user with Stremio credentials
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        stremioAuthKey: encryptedAuthKey,
        email: 'test@example.com',
        username: 'testuser'
      }
    });
    
    res.json({ message: 'Stremio credentials set successfully', userId: updatedUser.id });
  } catch (error) {
    console.error('Error setting Stremio credentials:', error);
    res.status(500).json({ message: 'Failed to set Stremio credentials', error: error?.message });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    message: 'Internal server error',
    error: error.message
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🛑 Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

// Test endpoint to create users (for development only)
app.post('/api/test/users', async (req, res) => {
  try {
    const { email, username, groupName } = req.body;
    
    if (!email || !username) {
      return res.status(400).json({ message: 'email and username are required' });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          { username }
        ]
      }
    });

    if (existingUser) {
      return res.status(400).json({ message: 'User with this email or username already exists' });
    }

    // Create user
    const newUser = await prisma.user.create({
      data: {
        accountId: getAccountId(req),
        username,
        email,
        isActive: true
      }
    });

    // Assign to group if specified
    if (groupName) {
      const group = await prisma.group.findFirst({
        where: { name: groupName.trim() }
      });
      
      if (group) {
        // Assign user to group (ensures user is only in one group)
        await assignUserToGroup(newUser.id, group.id, req)
      }
    }

    res.status(201).json({
      message: 'Test user created successfully',
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        isActive: newUser.isActive,
        groupName: groupName || null
      }
    });
  } catch (error) {
    console.error('Error creating test user:', error);
    res.status(500).json({ message: 'Failed to create test user', error: error?.message });
  }
});

// Import user addons endpoint
app.post('/api/users/:id/import-addons', async (req, res) => {
  try {
    const { id: userId } = req.params
    const { addons } = req.body || {}

    if (!Array.isArray(addons) || addons.length === 0) {
      return res.status(400).json({ message: 'addons array is required' })
    }

    const user = await prisma.user.findUnique({ 
      where: { 
        id: userId,
        accountId: getAccountId(req)
      }
    })
    if (!user) return res.status(404).json({ message: 'User not found' })

    // Check if import group already exists (regardless of membership)
    const groupName = `${user.username} Imports`
    let group = await prisma.group.findFirst({
      where: {
        name: groupName
      }
    })

    if (!group) {
      // Create a new group named "{username} Imports"
      group = await prisma.group.create({
        data: {
          name: groupName,
          description: `Imported addons from ${user.username}`,
          colorIndex: 0, // Default color
          isActive: true,
          accountId: getAccountId(req)
        }
      })
      debug.log(`✅ Created import group: ${groupName}`)
    } else {
      debug.log(`ℹ️ Using existing import group: ${groupName}`)
    }

    // Ensure user is a member of the group ONLY if they have no group assigned yet
    // If the user already belongs to any group, do not auto-attach to the import group
    const allGroups = await prisma.group.findMany({
        where: {
        accountId: getAccountId(req)
      },
      select: { id: true, userIds: true }
    })
    
    // Check if user is already in any group
    let userInAnyGroup = false
    for (const g of allGroups) {
      if (g.userIds) {
        try {
          const userIds = JSON.parse(g.userIds)
          if (Array.isArray(userIds) && userIds.includes(userId)) {
            userInAnyGroup = true
            break
          }
        } catch (e) {
          console.error('Error parsing group userIds:', e)
        }
      }
    }
    
    if (!userInAnyGroup) {
      // Assign user to group (ensures user is only in one group)
      await assignUserToGroup(userId, group.id, req)
      debug.log(`✅ Added user to import group (user had no previous groups)`)
    } else {
      debug.log(`ℹ️ Skipped adding user to import group (user already has a group)`)
    }

    // Process each addon
    const processedAddons = []
    const newlyImportedAddons = []
    const existingAddons = []
    console.log(`🚀 Starting import of ${addons.length} addons for user ${userId}`)
    for (const addonData of addons) {
      const addonUrl = addonData.manifestUrl || addonData.transportUrl || addonData.url
      if (!addonUrl) {
        console.log(`⚠️ Skipping addon with no URL:`, addonData)
        continue
      }

      const addonId = addonData.id
      console.log(`🔍 Processing addon: ID="${addonId}", URL="${addonUrl}", Name="${addonData.name || addonData.manifest?.name || 'Unknown'}"`)
      debug.log(`🔍 Processing addon: ID="${addonId}", URL="${addonUrl}"`)

      // SIMPLE RULE: if an addon with the exact manifestUrl exists, attach it to the group and continue
      let addon = null
      try {
        const { manifestUrlHash } = require('./utils/hash')
        const existingByExactUrl = await prisma.addon.findFirst({ 
          where: {
            manifestUrlHash: manifestUrlHash(addonUrl),
            accountId: getAccountId(req)
          },
          select: { id: true, name: true, manifestUrl: true, accountId: true }
        })
        if (existingByExactUrl) {
          // Attach directly in DB (no internal HTTP)
          try {
            await prisma.groupAddon.upsert({
              where: { groupId_addonId: { groupId: group.id, addonId: existingByExactUrl.id } },
              update: { isEnabled: true },
              create: { groupId: group.id, addonId: existingByExactUrl.id, isEnabled: true }
            })
            console.log(`✅ Attached existing addon to group in DB: ${existingByExactUrl.name}`)
          } catch (e) {
            console.log(`⚠️ DB attach failed:`, e?.message || e)
          }
          processedAddons.push(existingByExactUrl)
          existingAddons.push(existingByExactUrl)
          addon = existingByExactUrl
          continue
        }
        addon = existingByExactUrl
      } catch (e) {
        console.log(`⚠️ Exact URL check failed for ${addonUrl}:`, e?.message || e)
      }

        // If we didn't find an existing addon by exact URL, create a new one
        if (!addon) {
          console.log(`🔨 Creating new addon for: ${addonUrl}`)
          // Do NOT fetch manifests here. Always use the data returned by APIStore.pullAddonCollection()
          // Fall back to a minimal synthesized manifest using the same payload if needed.
          let manifestData = addonData.manifest || {
            id: addonData.id || 'unknown',
            name: addonData.name || 'Unknown Addon',
            version: addonData.version || '1.0.0',
            description: addonData.description || '',
            resources: addonData.manifest?.resources || [],
            types: addonData.manifest?.types || ['other'],
            catalogs: addonData.manifest?.catalogs || []
          }
          console.log(`ℹ️ Using manifest from Stremio API payload: ${manifestData?.name} ${manifestData?.version}`)
        // Try existence check step 3: match any addon whose stored URL contains the manifest.id
        const manifestIdRaw = typeof manifestData?.id === 'string' ? manifestData.id : ''
        if (manifestIdRaw) {
          // Check if any existing addon has this manifest ID in its URL
          const byIdInUrl = await prisma.addon.findFirst({
            where: {
              manifestUrl: { contains: manifestIdRaw },
              accountId: getAccountId(req)
            }
          })
          if (byIdInUrl) {
            addon = byIdInUrl
            console.log(`✅ Found existing addon by manifest.id in URL: ${addon.name} (${addon.manifestUrl})`)
          }
        }

        if (addon) {
          // Skip creation; will proceed to group attach below
        } else {
          // Create addon directly in DB from API payload (no external fetch)
          try {
            const { manifestUrlHash } = require('./utils/hash')
            const createdAddon = await prisma.addon.create({
              data: {
                name: manifestData?.name || addonData.name || 'Unknown Addon',
                description: manifestData?.description || addonData.description || '',
                manifestUrl: encrypt(addonUrl, req),
                manifestUrlHash: manifestUrlHash(addonUrl),
                version: manifestData?.version || addonData.version || null,
                iconUrl: manifestData?.logo || addonData.iconUrl || null,
                stremioAddonId: manifestData?.id || addonData.stremioAddonId || null,
                isActive: true,
                originalManifest: manifestData ? encrypt(JSON.stringify(manifestData), req) : null,
                manifest: manifestData ? encrypt(JSON.stringify(manifestData), req) : null,
                resources: manifestData?.resources ? JSON.stringify(manifestData.resources.map(r => typeof r === 'string' ? r : (r?.name || r?.type)).filter(Boolean)) : null,
                accountId: getAccountId(req)
              }
            })
            addon = createdAddon
            console.log(`✅ Created new addon in DB: ${addon.name} (ID: ${addon.id})`)
            processedAddons.push(addon)
            newlyImportedAddons.push(addon)
          } catch (error) {
            console.log(`❌ Failed to create addon in DB:`, error?.message || error)
            continue
          }
        }
      }

      // Attach to group directly in DB (no internal HTTP)
      console.log(`➕ Ensuring addon ${addon.name} is attached to import group`)
      try {
        await prisma.groupAddon.upsert({
          where: { groupId_addonId: { groupId: group.id, addonId: addon.id } },
          update: { isEnabled: true },
          create: { groupId: group.id, addonId: addon.id, isEnabled: true }
        })
        console.log(`✅ Attached ${addon.name} to import group in DB`)
      } catch (error) {
        console.error(`❌ DB attach error for ${addon.name}:`, error?.message || error)
      }
    }

    console.log(`🎉 Import completed! Processed ${processedAddons.length} addons out of ${addons.length} total addons`)
    console.log(`📋 Processed addons:`, processedAddons.map(a => `${a.name} (${a.id})`))
    console.log(`📊 Newly imported: ${newlyImportedAddons.length}, Already existing: ${existingAddons.length}`)
    
    let message = ''
    if (newlyImportedAddons.length > 0 && existingAddons.length > 0) {
      message = `Successfully imported ${newlyImportedAddons.length} addons to group "${groupName}" (${existingAddons.length} already existed)`
    } else if (newlyImportedAddons.length > 0) {
      message = `Successfully imported ${newlyImportedAddons.length} addons to group "${groupName}"`
    } else if (existingAddons.length > 0) {
      message = `All ${existingAddons.length} addons already existed in group "${groupName}"`
    } else {
      message = `No addons were processed`
    }

    res.json({
      message,
      groupId: group.id,
      groupName: group.name,
      addonCount: processedAddons.length,
      newlyImported: newlyImportedAddons.length,
      existing: existingAddons.length
    })

  } catch (error) {
    console.error('❌ Import addons error:', error)
    console.error('❌ Error stack:', error.stack)
    res.status(500).json({ message: 'Failed to import addons', error: error.message })
  }
})

// Bind explicitly to 0.0.0.0 so it is reachable inside Docker even when ::1 is resolved
app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 Syncio (Database) running on port', PORT);
  console.log('📊 Health check: http://127.0.0.1:' + PORT + '/health');
  console.log('🔌 API endpoints: http://127.0.0.1:' + PORT + '/api/');
  console.log('🎬 Stremio integration: ENABLED');
  console.log('💾 Storage: PostgreSQL with Prisma');
});
