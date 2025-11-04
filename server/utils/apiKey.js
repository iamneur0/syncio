const crypto = require('crypto')

function generateApiKey() {
  // Single-token hex key (e.g., 32 hex chars)
  return crypto.randomBytes(16).toString('hex') // 128-bit, 32 hex chars
}

function parsePresentedKey(headerValue) {
  if (!headerValue) return null
  const raw = headerValue.trim().replace(/^Bearer\s+/i, '')
  // Hex token format (32 chars)
  if (/^[a-f0-9]{32}$/i.test(raw)) {
    return raw
  }
  // Backward compatibility: sk_<id>_<secret> - extract full key
  if (raw.startsWith('sk_')) {
    const parts = raw.split('_')
    if (parts.length >= 3) {
      return parts.slice(1).join('_') // Reconstruct full key
    }
  }
  return null
}

module.exports = { generateApiKey, parsePresentedKey }