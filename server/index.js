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

// Import modular routers
const addonsRouter = require('./routes/addons');
const groupsRouter = require('./routes/groups');
const usersRouter = require('./routes/users');
const stremioRouter = require('./routes/stremio');
const settingsRouter = require('./routes/settings');
const externalApiRouter = require('./routes/externalApi');
const debugRouter = require('./routes/debug');
const publicAuthRouter = require('./routes/publicAuth');
const invitationsRouter = require('./routes/invitations');
const publicLibraryRouter = require('./routes/publicLibrary');

// Import configuration constants
const { AUTH_ENABLED, PRIVATE_AUTH_ENABLED, PRIVATE_AUTH_USERNAME, PRIVATE_AUTH_PASSWORD, JWT_SECRET, DEFAULT_ACCOUNT_ID, DEFAULT_ACCOUNT_UUID, defaultAddons, AUTH_ALLOWLIST, BACKUP_DIR, BACKUP_CFG, PEPPER, ENCRYPTION_KEY, allowedOrigins, QUIET, DEBUG_ENABLED, PORT } = require('./utils/config');

// Import utility modules
const { parseAddonIds, parseProtectedAddons, canonicalizeManifestUrl, normalizeUrl, isProdEnv, filterManifestByResources, filterManifestByCatalogs } = require('./utils/validation');
const { sha256Hex, hmacHex, manifestUrlHash, manifestUrlHmac, getAccountHmacKey, normalizeManifestObject, manifestHash, manifestHmac } = require('./utils/hashing');
const { validateStremioAuthKey, filterDefaultAddons, buildAddonDbData } = require('./utils/stremio');
const { ensureBackupDir, readBackupFrequencyDays, scheduleBackups } = require('./utils/backup');
const { scheduleSyncs, readSyncFrequencyMinutes } = require('./utils/syncScheduler');
const { scheduleUserExpiration } = require('./utils/userExpiration');
const { scheduleActivityMonitor } = require('./utils/activityMonitor');
const { pathIsAllowlisted, extractBearerToken, parseCookies, cookieName, issueAccessToken, issueRefreshToken, issuePublicToken, randomCsrfToken } = require('./utils/auth');
const { getAccountId: getAccountIdHelper, scopedWhere, assignUserToGroup } = require('./utils/helpers');
const { selectKeyForRequest, encrypt, decrypt, getAccountHmacKey: getAccountHmacKeyEnc, encryptIf, decryptIf, getDecryptedManifestUrl, decryptWithFallback } = require('./utils/encryption');

async function ensureDefaultAccount(prismaClient) {
  if (AUTH_ENABLED) return

  const defaultPassword = process.env.PRIVATE_ACCOUNT_PASSWORD || 'private-mode'
  const existing = await prismaClient.appAccount.findUnique({ where: { id: DEFAULT_ACCOUNT_ID } })

  if (!existing) {
    const passwordHash = await bcrypt.hash(defaultPassword, 12)
    await prismaClient.appAccount.create({
      data: {
        id: DEFAULT_ACCOUNT_ID,
        uuid: DEFAULT_ACCOUNT_UUID,
        passwordHash,
        sync: JSON.stringify({ enabled: false, frequency: '0' })
      }
    })
  } else {
    const updates = {}
    if (!existing.uuid || existing.uuid !== DEFAULT_ACCOUNT_UUID) {
      updates.uuid = DEFAULT_ACCOUNT_UUID
    }
    if (!existing.sync) {
      updates.sync = JSON.stringify({ enabled: false, frequency: '0' })
    }
    if (!existing.passwordHash) {
      updates.passwordHash = await bcrypt.hash(defaultPassword, 12)
    }
    if (Object.keys(updates).length > 0) {
      await prismaClient.appAccount.update({ where: { id: DEFAULT_ACCOUNT_ID }, data: updates })
    }
  }

  // Normalize existing data to default account scope
  await Promise.all([
    prismaClient.user.updateMany({ where: { OR: [{ accountId: null }, { accountId: '' }] }, data: { accountId: DEFAULT_ACCOUNT_ID } }),
    prismaClient.group.updateMany({ where: { OR: [{ accountId: null }, { accountId: '' }] }, data: { accountId: DEFAULT_ACCOUNT_ID } }),
    prismaClient.addon.updateMany({ where: { OR: [{ accountId: null }, { accountId: '' }] }, data: { accountId: DEFAULT_ACCOUNT_ID } })
  ])

  console.log('👤 Private mode: default account ready')
}

// Optional quiet mode: suppress non-error console output when QUIET=true or DEBUG is not enabled
// QUIET and DEBUG_ENABLED are now imported from utils/config
if (QUIET || !DEBUG_ENABLED) {
  const noop = () => {}
  console.log = noop
  console.info = noop
  console.warn = noop
}

const app = express();
// PORT is now imported from utils/config
const prisma = new PrismaClient();
console.log('Prisma client initialized:', !!prisma);

// Use helper-provided getAccountId (account scoping rules centralized)
const getAccountId = getAccountIdHelper

// Parse JSON bodies
app.use(express.json());

// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
}));

// CORS
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.some((re) => re.test(origin))) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
}));

// Rate limiting (disabled by default)
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000'),
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again later.',
});

app.use(express.json({ limit: '10mb' }));

// Multer - use centralized configuration
const { standardUpload } = require('./utils/helpers');
const upload = standardUpload;

// Encryption helpers
const { getServerKey, aesGcmEncrypt, aesGcmDecrypt, getAccountDek } = require('./utils/encryption')

// Global auth and CSRF gates via middleware factories
const { createAuthGate, createCsrfGuard } = require('./middleware/auth')
app.use(createAuthGate({ AUTH_ENABLED, PRIVATE_AUTH_ENABLED, JWT_SECRET, pathIsAllowlisted, parseCookies, cookieName, extractBearerToken, issueAccessToken, randomCsrfToken, isProdEnv }))
app.use(createCsrfGuard({ AUTH_ENABLED, PRIVATE_AUTH_ENABLED, pathIsAllowlisted, parseCookies, cookieName }))

if (!AUTH_ENABLED && !PRIVATE_AUTH_ENABLED) {
  app.use((req, res, next) => {
    if (!req.appAccountId) {
      req.appAccountId = DEFAULT_ACCOUNT_ID
    }
    next()
  })
}

// Account scoping middleware
const { createAccountScopingMiddleware } = require('./middleware/accountScoping');
const accountScopingMiddleware = createAccountScopingMiddleware(prisma);
app.use('/api/groups', accountScopingMiddleware);
app.use('/api/users', accountScopingMiddleware);
app.use('/api/addons', accountScopingMiddleware);
app.use('/api/stremio', accountScopingMiddleware);

// Cleanup middleware to restore prisma
for (const base of ['/api/groups','/api/users','/api/addons','/api/stremio']) {
  app.use(base, (req, res, next) => {
    res.on('finish', () => {
      if (req._restorePrisma) req._restorePrisma()
    })
    next()
  })
}

// Mount routers
app.use('/api/addons', addonsRouter({ prisma, getAccountId, decrypt, encrypt, getDecryptedManifestUrl, scopedWhere, AUTH_ENABLED, manifestHash, filterManifestByResources, filterManifestByCatalogs, manifestUrlHmac }));
app.use('/api/groups', groupsRouter({ prisma, getAccountId, scopedWhere, AUTH_ENABLED, assignUserToGroup, getDecryptedManifestUrl, manifestUrlHmac, decrypt }));
app.use('/api/users', usersRouter({ prisma, getAccountId, scopedWhere, AUTH_ENABLED, decrypt, encrypt, parseAddonIds, parseProtectedAddons, getDecryptedManifestUrl, StremioAPIClient, StremioAPIStore, assignUserToGroup, debug, defaultAddons, canonicalizeManifestUrl, getAccountDek, getServerKey, aesGcmDecrypt, validateStremioAuthKey, manifestUrlHmac, manifestHash }));
app.use('/api/stremio', stremioRouter({ prisma, getAccountId, encrypt, decrypt, assignUserToGroup, AUTH_ENABLED }));
app.use('/api/settings', settingsRouter({ prisma, AUTH_ENABLED, getAccountDek, getDecryptedManifestUrl, getAccountId }));
// External API (API key protected, account-scoped)
app.use('/api/ext', externalApiRouter({
  prisma,
  getAccountId,
  scopedWhere,
  reloadDeps: { decrypt, encrypt, getDecryptedManifestUrl, filterManifestByResources, filterManifestByCatalogs, manifestHash },
  syncGroupUsers: require('./routes/groups')({ prisma, getAccountId, scopedWhere, AUTH_ENABLED, assignUserToGroup, getDecryptedManifestUrl, manifestUrlHmac, decrypt }).syncGroupUsers
}))
// Debug routes - only available in private mode (when AUTH is disabled)
if (!AUTH_ENABLED) {
  app.use('/', debugRouter({ prisma, getDecryptedManifestUrl, getAccountId }));
}
app.use('/api/public-auth', publicAuthRouter({ prisma, getAccountId, AUTH_ENABLED, PRIVATE_AUTH_ENABLED, PRIVATE_AUTH_USERNAME, PRIVATE_AUTH_PASSWORD, DEFAULT_ACCOUNT_ID, issueAccessToken, issueRefreshToken, cookieName, isProdEnv, encrypt, decrypt, getDecryptedManifestUrl, scopedWhere, getAccountDek, decryptWithFallback, manifestUrlHmac, manifestHash, filterManifestByResources, filterManifestByCatalogs, parseCookies, JWT_SECRET }));
app.use('/api/invitations', invitationsRouter({ prisma, getAccountId, AUTH_ENABLED, encrypt, decrypt, assignUserToGroup }));
app.use('/invite', invitationsRouter.createPublicRouter({ prisma, encrypt, assignUserToGroup, decrypt }));
// Public library router (no auth required)
const { getCachedLibrary, setCachedLibrary } = require('./utils/libraryCache');
app.use('/api/public-library', publicLibraryRouter({ prisma, DEFAULT_ACCOUNT_ID, encrypt, decrypt, getCachedLibrary, setCachedLibrary }));

// Error handling
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ message: 'Internal server error', error: error.message });
});

// Shutdown
process.on('SIGINT', async () => { console.log('🛑 Shutting down gracefully...'); await prisma.$disconnect(); process.exit(0); });
process.on('SIGTERM', async () => { console.log('🛑 Shutting down gracefully...'); await prisma.$disconnect(); process.exit(0); });

// Initialize sync schedule on startup (works in all modes)
const { reloadGroupAddons } = require('./routes/users');

// Create a mock request object for scheduler context
const schedulerReq = {
  appAccountId: AUTH_ENABLED ? undefined : DEFAULT_ACCOUNT_ID
};

async function bootstrap() {
  if (!AUTH_ENABLED) {
    await ensureDefaultAccount(prisma)
    try {
      ensureBackupDir()
      scheduleBackups(readBackupFrequencyDays())
    } catch (err) {
      console.error('⚠️ Failed to initialize backup scheduler:', err)
    }
  }

scheduleSyncs(
  readSyncFrequencyMinutes(),
  prisma,
  getAccountId,
  scopedWhere,
  decrypt,
  reloadGroupAddons,
  schedulerReq,
  AUTH_ENABLED
  )

  // Schedule user expiration cleanup (runs at midnight)
  try {
    scheduleUserExpiration(prisma, decrypt, StremioAPIClient)
  } catch (err) {
    console.error('⚠️ Failed to initialize user expiration scheduler:', err)
  }

  // Schedule activity monitor (checks for new watch activity every 5 minutes)
  try {
    scheduleActivityMonitor(prisma, decrypt, getAccountId, AUTH_ENABLED)
  } catch (err) {
    console.error('⚠️ Failed to initialize activity monitor:', err)
  }

  const storageLabel = process.env.PRISMA_PROVIDER === 'sqlite' ? 'SQLite with Prisma' : 'PostgreSQL with Prisma'

app.listen(PORT, '0.0.0.0', () => {
    console.log('🚀 Syncio (Database) running on port', PORT)
    console.log('📊 Health check: http://127.0.0.1:' + PORT + '/health')
    console.log('🔌 API endpoints: http://127.0.0.1:' + PORT + '/api/')
    console.log('🎬 Stremio integration: ENABLED')
    console.log(`💾 Storage: ${storageLabel}`)
  })
}

bootstrap().catch((err) => {
  console.error('❌ Failed to start Syncio server:', err)
  process.exit(1)
})



