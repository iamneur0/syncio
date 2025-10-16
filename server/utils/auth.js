// Authentication and security functions
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'syncio-dev-secret-change-me';

/**
 * Check if path is allowlisted for public access
 */
function pathIsAllowlisted(path) {
  const AUTH_ALLOWLIST = [
    '/health',
    '/api/health',
    '/api/public-auth/login',
    '/api/public-auth/register',
    '/api/public-auth/generate-uuid',
    '/api/public-auth/suggest-uuid',
    // Stremio helpers are NOT allowlisted; require auth
    // Note: addons endpoints are NOT allowlisted; they require auth/CSRF
  ];
  return AUTH_ALLOWLIST.some((prefix) => path.startsWith(prefix));
}

/**
 * Extract bearer token from request headers
 */
function extractBearerToken(req) {
  const header = req.headers && req.headers.authorization;
  if (!header) return null;
  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1];
}

/**
 * Parse cookies from request headers
 */
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

/**
 * Generate cookie name based on environment
 */
function cookieName(base) {
  const isProdEnv = String(process.env.NODE_ENV) === 'production';
  return isProdEnv ? `__Host-${base}` : base;
}

/**
 * Issue access token
 */
function issueAccessToken(appAccountId) {
  return jwt.sign({ accId: appAccountId, typ: 'access' }, JWT_SECRET, { expiresIn: '30d' });
}

/**
 * Issue refresh token
 */
function issueRefreshToken(appAccountId) {
  return jwt.sign({ accId: appAccountId, typ: 'refresh' }, JWT_SECRET, { expiresIn: '365d' });
}

/**
 * Issue public token (kept for compatibility)
 */
function issuePublicToken(appAccountId) {
  return jwt.sign({ accId: appAccountId }, JWT_SECRET, { expiresIn: '30d' });
}

/**
 * Generate random CSRF token
 */
function randomCsrfToken() {
  try { 
    return crypto.randomUUID(); 
  } catch { 
    return Math.random().toString(36).slice(2); 
  }
}

module.exports = {
  pathIsAllowlisted,
  extractBearerToken,
  parseCookies,
  cookieName,
  issueAccessToken,
  issueRefreshToken,
  issuePublicToken,
  randomCsrfToken
}
