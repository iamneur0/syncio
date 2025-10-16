// Configuration constants and variables
const path = require('path');

// Auth configuration
const AUTH_ENABLED = String(process.env.AUTH_ENABLED || 'false').toLowerCase() === 'true';
const JWT_SECRET = process.env.JWT_SECRET || 'syncio-dev-secret-change-me';
const DEFAULT_ACCOUNT_ID = 'default';

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
};

// Auth allowlist for public endpoints
const AUTH_ALLOWLIST = [
  '/health',
  '/api/health',
  '/api/public-auth/login',
  '/api/public-auth/register',
  '/api/public-auth/generate-uuid',
  '/api/public-auth/suggest-uuid',
  // Stremio endpoints require auth now (no allowlist)
];

// Backup configuration
const BACKUP_DIR = path.join(process.cwd(), 'data', 'backup');
const BACKUP_CFG = path.join(BACKUP_DIR, 'schedule.json');

// Encryption/hashing pepper
const PEPPER = process.env.HASH_PEPPER || process.env.ENCRYPTION_KEY || 'syncio-pepper';

// Encryption key
const ENCRYPTION_KEY_RAW = process.env.ENCRYPTION_KEY || '';
const ENCRYPTION_KEY = (() => {
  const crypto = require('crypto');
  const raw = ENCRYPTION_KEY_RAW;
  // Accept base64 or utf8; prefer base64 when it looks like it
  try {
    if (/^[A-Za-z0-9+/=]+$/.test(raw) && raw.length >= 44) {
      const b = Buffer.from(raw, 'base64');
      if (b.length >= 32) return b.subarray(0, 32);
    }
  } catch {}
  return Buffer.from((raw || 'syncio-default-key-32chars-please-change!!').padEnd(32, '0').slice(0, 32), 'utf8');
})();

// CORS allowed origins
const allowedOrigins = [/^http:\/\/localhost:300\d$/, /^http:\/\/127\.0\.0\.1:300\d$/];

// Quiet mode
const QUIET = process.env.QUIET === 'true' || process.env.QUIET === '1';
const DEBUG_ENABLED = process.env.DEBUG === 'true' || process.env.DEBUG === '1';

// Port
const PORT = process.env.PORT || 4000;

module.exports = {
  AUTH_ENABLED,
  JWT_SECRET,
  DEFAULT_ACCOUNT_ID,
  defaultAddons,
  AUTH_ALLOWLIST,
  BACKUP_DIR,
  BACKUP_CFG,
  PEPPER,
  ENCRYPTION_KEY,
  allowedOrigins,
  QUIET,
  DEBUG_ENABLED,
  PORT
};

