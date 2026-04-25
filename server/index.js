// Restart trigger: 2026-01-29 - Refreshing backend state for library cache fixes
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
const proxyRouter = require('./routes/proxy');
const streamProxyRouter = require('./routes/streamProxy');

// Import configuration constants
const { INSTANCE_TYPE, PRIVATE_AUTH_ENABLED, PRIVATE_AUTH_USERNAME, PRIVATE_AUTH_PASSWORD, JWT_SECRET, DEFAULT_ACCOUNT_ID, DEFAULT_ACCOUNT_UUID, defaultAddons, AUTH_ALLOWLIST, BACKUP_DIR, BACKUP_CFG, PEPPER, ENCRYPTION_KEY, allowedOrigins, QUIET, DEBUG_ENABLED, PORT } = require('./utils/config');

// Import utility modules
const { parseAddonIds, parseProtectedAddons, canonicalizeManifestUrl, normalizeUrl, isProdEnv, filterManifestByResources, filterManifestByCatalogs } = require('./utils/validation');
const { sha256Hex, hmacHex, manifestUrlHash, manifestUrlHmac, getAccountHmacKey, normalizeManifestObject, manifestHash, manifestHmac } = require('./utils/hashing');
const { validateStremioAuthKey, filterDefaultAddons, buildAddonDbData } = require('./utils/stremio');
const { pathIsAllowlisted, extractBearerToken, parseCookies, cookieName, issueAccessToken, issueRefreshToken, issuePublicToken, randomCsrfToken } = require('./utils/auth');
const { getAccountId: getAccountIdHelper, scopedWhere, assignUserToGroup } = require('./utils/helpers');
const { selectKeyForRequest, encrypt, decrypt, getAccountHmacKey: getAccountHmacKeyEnc, encryptIf, decryptIf, getDecryptedManifestUrl, decryptWithFallback } = require('./utils/encryption');

async function ensureDefaultAccount(prismaClient) {
  if (INSTANCE_TYPE === 'public') return

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
  const noop = () => { }
  console.log = noop
  console.info = noop
  console.warn = noop
}

const app = express();
// PORT is now imported from utils/config
const prisma = new PrismaClient();
console.log('Prisma client initialized:', !!prisma);

// Trust proxy headers (for correct client IP behind reverse proxies)
app.set('trust proxy', true);

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
app.use(createAuthGate({ INSTANCE_TYPE, PRIVATE_AUTH_ENABLED, JWT_SECRET, pathIsAllowlisted, parseCookies, cookieName, extractBearerToken, issueAccessToken, randomCsrfToken, isProdEnv }))
app.use(createCsrfGuard({ INSTANCE_TYPE, PRIVATE_AUTH_ENABLED, pathIsAllowlisted, parseCookies, cookieName }))

if (INSTANCE_TYPE !== 'public' && !PRIVATE_AUTH_ENABLED) {
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
for (const base of ['/api/groups', '/api/users', '/api/addons', '/api/stremio']) {
  app.use(base, (req, res, next) => {
    res.on('finish', () => {
      if (req._restorePrisma) req._restorePrisma()
    })
    next()
  })
}

// Mount routers
const publicAuthRouterInstance = publicAuthRouter({ prisma, getAccountId, INSTANCE_TYPE, PRIVATE_AUTH_ENABLED, PRIVATE_AUTH_USERNAME, PRIVATE_AUTH_PASSWORD, DEFAULT_ACCOUNT_ID, issueAccessToken, issueRefreshToken, cookieName, isProdEnv, encrypt, decrypt, getDecryptedManifestUrl, scopedWhere, getAccountDek, decryptWithFallback, manifestUrlHmac, manifestHash, filterManifestByResources, filterManifestByCatalogs, parseCookies, JWT_SECRET });
app.use('/api/auth', publicAuthRouterInstance);
app.use('/api/public-auth', publicAuthRouterInstance);
app.use('/api/addons', addonsRouter({ prisma, getAccountId, decrypt, encrypt, getDecryptedManifestUrl, scopedWhere, INSTANCE_TYPE, manifestHash, filterManifestByResources, filterManifestByCatalogs, manifestUrlHmac }));
app.use('/api/groups', groupsRouter({ prisma, getAccountId, scopedWhere, INSTANCE_TYPE, assignUserToGroup, getDecryptedManifestUrl, manifestUrlHmac, decrypt }));
app.use('/api/users', usersRouter({ prisma, getAccountId, scopedWhere, INSTANCE_TYPE, decrypt, encrypt, parseAddonIds, parseProtectedAddons, getDecryptedManifestUrl, StremioAPIClient, StremioAPIStore, assignUserToGroup, debug, defaultAddons, canonicalizeManifestUrl, getAccountDek, getServerKey, aesGcmDecrypt, validateStremioAuthKey, manifestUrlHmac, manifestHash }));
app.use('/api/stremio', stremioRouter({ prisma, getAccountId, encrypt, decrypt, assignUserToGroup, INSTANCE_TYPE }));
app.use('/api/settings', settingsRouter({ prisma, INSTANCE_TYPE, getAccountDek, getDecryptedManifestUrl, getAccountId }));
// External API (API key protected, account-scoped)
app.use('/api/ext', externalApiRouter({
  prisma,
  getAccountId,
  scopedWhere,
  reloadDeps: { decrypt, encrypt, getDecryptedManifestUrl, filterManifestByResources, filterManifestByCatalogs, manifestHash },
  syncGroupUsers: require('./routes/groups')({ prisma, getAccountId, scopedWhere, INSTANCE_TYPE, assignUserToGroup, getDecryptedManifestUrl, manifestUrlHmac, decrypt }).syncGroupUsers
}));
app.use('/api/invitations', invitationsRouter({ prisma, getAccountId, INSTANCE_TYPE, encrypt, decrypt, assignUserToGroup }));
app.use('/invite', invitationsRouter.createPublicRouter({ prisma, encrypt, assignUserToGroup, decrypt }));
// Public library router (no auth required)
const { getCachedLibrary, setCachedLibrary } = require('./utils/libraryCache');
app.use('/api/public-library', publicLibraryRouter({ prisma, DEFAULT_ACCOUNT_ID, encrypt, decrypt, getCachedLibrary, setCachedLibrary }));

// Addon proxy router (no auth required - UUID serves as bearer token)
app.use('/proxy', proxyRouter({ prisma, decrypt, getAccountId, getServerKey }));

// Stream proxy router (no auth required - handles encrypted stream URLs)
app.use('/stream', streamProxyRouter({ getServerKey }).router);

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
  appAccountId: INSTANCE_TYPE === 'public' ? undefined : DEFAULT_ACCOUNT_ID
};

async function bootstrap() {
  if (INSTANCE_TYPE !== 'public') {
    await ensureDefaultAccount(prisma)
  }

  // Defer heavy startup tasks to avoid blocking the main thread during boot
  setTimeout(async () => {
    // Import schedulers here to break circular dependencies
    const { ensureBackupDir, readBackupFrequencyDays, scheduleBackups } = require('./utils/backup');
    const { scheduleSyncs, readSyncFrequencyMinutes } = require('./utils/syncScheduler');
    const { scheduleUserExpiration } = require('./utils/userExpiration');
    const { scheduleActivityMonitor } = require('./utils/activityMonitor');

    if (INSTANCE_TYPE !== 'public') {
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
      INSTANCE_TYPE
    )

    // Schedule user expiration cleanup (runs at midnight)
    try {
      scheduleUserExpiration(prisma, decrypt, StremioAPIClient)
    } catch (err) {
      console.error('⚠️ Failed to initialize user expiration scheduler:', err)
    }

    // Schedule activity monitor (checks for new watch activity every 5 minutes)
    try {
      scheduleActivityMonitor(prisma, decrypt, getAccountId, INSTANCE_TYPE)
    } catch (err) {
      console.error('⚠️ Failed to initialize activity monitor:', err)
    }

    // Schedule addon health checker (checks if addon manifests are reachable)
    try {
      const { startHealthCheckScheduler } = require('./utils/addonHealthCheck')
      startHealthCheckScheduler(prisma, schedulerReq.appAccountId)
    } catch (err) {
      console.error('⚠️ Failed to initialize addon health checker:', err)
    }

    // Startup repair: reload addons with uninitialized resources/catalogs across all accounts
    try {
      const { reloadAddon } = require('./routes/addons')
      const reloadDeps = { filterManifestByResources, filterManifestByCatalogs, encrypt, decrypt, getDecryptedManifestUrl, manifestHash, silent: true }

      // Find all addons with empty resources AND empty catalogs that have an originalManifest
      const uninitializedAddons = await prisma.addon.findMany({
        where: {
          isActive: true,
          originalManifest: { not: null },
          OR: [
            { resources: '[]' },
            { resources: null }
          ]
        },
        select: { id: true, name: true, accountId: true, catalogs: true }
      })

      // Filter to only those where catalogs is also empty
      const toRepair = uninitializedAddons.filter(a => {
        if (!a.catalogs || a.catalogs === '[]') return true
        try {
          const parsed = JSON.parse(a.catalogs)
          return !Array.isArray(parsed) || parsed.length === 0
        } catch { return true }
      })

      if (toRepair.length > 0) {
        console.error(`🔧 Startup repair: found ${toRepair.length} addon(s) with uninitialized resources/catalogs, reloading...`)
        let repaired = 0
        let failed = 0
        for (const addon of toRepair) {
          try {
            const mockReq = { appAccountId: addon.accountId }
            await reloadAddon(prisma, () => addon.accountId, addon.id, mockReq, reloadDeps, true)
            repaired++
          } catch (err) {
            failed++
            console.error(`  ❌ Failed to repair ${addon.name}: ${err.message}`)
          }
        }
        console.error(`🔧 Startup repair complete: ${repaired} repaired, ${failed} failed`)
      }
    } catch (err) {
      console.error('⚠️ Failed to run startup addon repair:', err)
    }
  }, 10000)

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



