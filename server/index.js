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
const debugRouter = require('./routes/debug');
const publicAuthRouter = require('./routes/publicAuth');

// Import configuration constants
const { AUTH_ENABLED, JWT_SECRET, DEFAULT_ACCOUNT_ID, defaultAddons, AUTH_ALLOWLIST, BACKUP_DIR, BACKUP_CFG, PEPPER, ENCRYPTION_KEY, allowedOrigins, QUIET, DEBUG_ENABLED, PORT } = require('./utils/config');

// Import utility modules
const { parseAddonIds, parseProtectedAddons, canonicalizeManifestUrl, normalizeUrl, isProdEnv, filterManifestByResources, filterManifestByCatalogs } = require('./utils/validation');
const { sha256Hex, hmacHex, manifestUrlHash, manifestUrlHmac, getAccountHmacKey, normalizeManifestObject, manifestHash, manifestHmac } = require('./utils/hashing');
const { validateStremioAuthKey, filterDefaultAddons, buildAddonDbData } = require('./utils/stremio');
const { ensureBackupDir, readBackupFrequencyDays, writeBackupFrequencyDays, performBackupOnce, clearBackupSchedule, scheduleBackups } = require('./utils/backup');
const { pathIsAllowlisted, extractBearerToken, parseCookies, cookieName, issueAccessToken, issueRefreshToken, issuePublicToken, randomCsrfToken } = require('./utils/auth');
const { getAccountId: getAccountIdHelper, scopedWhere, convertManifestUrlsToAddonIds, ensureUserInAccount, ensureGroupInAccount, assignUserToGroup } = require('./utils/helpers');
const { selectKeyForRequest, encrypt, decrypt, getAccountHmacKey: getAccountHmacKeyEnc, encryptIf, decryptIf, getDecryptedManifestUrl, decryptWithFallback } = require('./utils/encryption');

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
app.use(createAuthGate({ AUTH_ENABLED, JWT_SECRET, pathIsAllowlisted, parseCookies, cookieName, extractBearerToken, issueAccessToken, isProdEnv }))
app.use(createCsrfGuard({ AUTH_ENABLED, pathIsAllowlisted, parseCookies, cookieName }))

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
app.use('/api/groups', groupsRouter({ prisma, getAccountId, scopedWhere, AUTH_ENABLED, assignUserToGroup, getDecryptedManifestUrl, manifestUrlHmac }));
app.use('/api/users', usersRouter({ prisma, getAccountId, scopedWhere, AUTH_ENABLED, decrypt, encrypt, parseAddonIds, parseProtectedAddons, getDecryptedManifestUrl, StremioAPIClient, StremioAPIStore, assignUserToGroup, debug, defaultAddons, canonicalizeManifestUrl, getAccountDek, getServerKey, aesGcmDecrypt, validateStremioAuthKey, manifestUrlHmac, manifestHash }));
app.use('/api/stremio', stremioRouter({ prisma, getAccountId, encrypt, decrypt, assignUserToGroup, AUTH_ENABLED }));
app.use('/api/settings', settingsRouter({ prisma, AUTH_ENABLED, getAccountDek, getDecryptedManifestUrl }));
app.use('/', debugRouter({ prisma, getDecryptedManifestUrl, getAccountId }));
app.use('/api/public-auth', publicAuthRouter({ prisma, getAccountId, AUTH_ENABLED, issueAccessToken, issueRefreshToken, cookieName, isProdEnv, encrypt, decrypt, getDecryptedManifestUrl, scopedWhere, getAccountDek, decryptWithFallback, manifestUrlHmac, manifestHash, filterManifestByResources, filterManifestByCatalogs }));

// Error handling
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ message: 'Internal server error', error: error.message });
});

// Shutdown
process.on('SIGINT', async () => { console.log('🛑 Shutting down gracefully...'); await prisma.$disconnect(); process.exit(0); });
process.on('SIGTERM', async () => { console.log('🛑 Shutting down gracefully...'); await prisma.$disconnect(); process.exit(0); });

// Start
app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 Syncio (Database) running on port', PORT);
  console.log('📊 Health check: http://127.0.0.1:' + PORT + '/health');
  console.log('🔌 API endpoints: http://127.0.0.1:' + PORT + '/api/');
  console.log('🎬 Stremio integration: ENABLED');
  console.log('💾 Storage: PostgreSQL with Prisma');
});



