const crypto = require('crypto')

const PEPPER = process.env.HASH_PEPPER || process.env.ENCRYPTION_KEY || 'syncio-pepper'

function normalizeUrl(u) {
  if (!u) return ''
  try { return String(u).trim().replace(/\s+/g, '').toLowerCase() } catch { return '' }
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex')
}

function manifestUrlHash(u) {
  return sha256Hex(normalizeUrl(u) + '|' + PEPPER)
}

module.exports = { manifestUrlHash, normalizeUrl }


