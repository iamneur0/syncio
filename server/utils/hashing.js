// Hashing and manifest functions
const crypto = require('crypto');

/**
 * SHA256 hash function
 */
function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex')
}

/**
 * HMAC hash function
 */
function hmacHex(keyBuf, input) {
  return crypto.createHmac('sha256', keyBuf).update(input).digest('hex')
}

/**
 * Manifest URL hash (backward-compatible global peppered hash)
 */
function manifestUrlHash(url) {
  const PEPPER = process.env.HASH_PEPPER || process.env.ENCRYPTION_KEY || 'syncio-pepper'
  return sha256Hex(normalizeUrl(url) + '|' + PEPPER)
}

/**
 * Manifest URL HMAC (per-account)
 */
function manifestUrlHmac(req, url) {
  return hmacHex(getAccountHmacKey(req), normalizeUrl(url))
}

/**
 * Normalize URL for consistent comparison
 */
function normalizeUrl(u) {
  if (!u) return ''
  try {
    const s = String(u).trim()
    return s.replace(/\s+/g, '').toLowerCase()
  } catch { return '' }
}

/**
 * Get account HMAC key for per-account hashing
 */
function getAccountHmacKey(req) {
  const { selectKeyForRequest } = require('./encryption')
  // Derive per-account HMAC key from DEK if available, fallback to PEPPER
  try {
    const dek = selectKeyForRequest(req) // Uint8Array/Buffer used for AES-GCM
    const salt = Buffer.from('syncio-hmac-salt')
    // Simple HKDF-like derivation using SHA-256 (not full HKDF API to avoid deps)
    const ikm = Buffer.isBuffer(dek) ? dek : Buffer.from(String(dek || ''))
    const prk = crypto.createHmac('sha256', salt).update(ikm).digest()
    const okm = crypto.createHmac('sha256', prk).update('syncio-manifest-hmac').digest()
    return okm
  } catch {
    const PEPPER = process.env.HASH_PEPPER || process.env.ENCRYPTION_KEY || 'syncio-pepper'
    return Buffer.from(String(PEPPER))
  }
}

/**
 * Normalize manifest object for deep equality checks
 */
function normalizeManifestObject(manifest) {
  if (!manifest || typeof manifest !== 'object') return '{}'
  try {
    // Pick only deterministic, sync-relevant fields
    const pick = {}
    if (manifest.id != null) pick.id = String(manifest.id)
    if (manifest.name != null) pick.name = String(manifest.name)
    if (manifest.version != null) pick.version = String(manifest.version)

    if (Array.isArray(manifest.types)) {
      pick.types = [...manifest.types].map(String).sort()
    }

    // Normalize resources to an array of labels (name/type), sorted
    if (Array.isArray(manifest.resources)) {
      const labels = manifest.resources
        .map((r) => (typeof r === 'string' ? r : (r && (r.name || r.type)))).filter(Boolean)
        .map(String)
        .sort()
      pick.resources = labels
    }

    // Normalize catalogs to include all functional fields
    if (Array.isArray(manifest.catalogs)) {
      const catalogData = manifest.catalogs
        .map((c) => {
          if (!c || typeof c !== 'object') return null
          
          const catalog = {
            id: c.id || '',
            name: c.name || '',
            type: c.type || ''
          }
          
          // Include functional fields
          if (Array.isArray(c.genres)) {
            catalog.genres = [...c.genres].map(String).sort()
          }
          
          if (Array.isArray(c.extra)) {
            catalog.extra = c.extra
              .map(e => typeof e === 'object' ? e : { name: String(e) })
              .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
          }
          
          if (Array.isArray(c.extraSupported)) {
            catalog.extraSupported = [...c.extraSupported].map(String).sort()
          }
          
          if (Array.isArray(c.extraRequired)) {
            catalog.extraRequired = [...c.extraRequired].map(String).sort()
          }
          
          return catalog
        })
        .filter(Boolean)
      
      if (catalogData.length) pick.catalogs = catalogData
    }

    // behaviorHints is often used by Stremio to affect behavior
    if (manifest.behaviorHints && typeof manifest.behaviorHints === 'object') {
      // Sort keys deterministically
      const entries = Object.entries(manifest.behaviorHints)
        .map(([k, v]) => [String(k), v])
        .sort((a, b) => a[0].localeCompare(b[0]))
      const obj = {}
      for (const [k, v] of entries) obj[k] = v
      pick.behaviorHints = obj
    }

    // Include other functional fields
    if (Array.isArray(manifest.idPrefixes)) {
      pick.idPrefixes = [...manifest.idPrefixes].map(String).sort()
    }

    if (Array.isArray(manifest.addonCatalogs)) {
      pick.addonCatalogs = manifest.addonCatalogs
        .map(ac => ({
          id: ac.id || '',
          name: ac.name || '',
          type: ac.type || ''
        }))
        .sort((a, b) => (a.id + a.type).localeCompare(b.id + b.type))
    }

    // Stable stringify with sorted keys
    const stable = (value) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const out = {}
        for (const k of Object.keys(value).sort()) out[k] = stable(value[k])
        return out
      }
      if (Array.isArray(value)) return value.map(stable)
      return value
    }
    return JSON.stringify(stable(pick))
  } catch {
    return '{}'
  }
}

/**
 * Manifest hash (unkeyed content hash)
 */
function manifestHash(manifest) {
  return sha256Hex(normalizeManifestObject(manifest))
}

/**
 * Manifest HMAC (per-account)
 */
function manifestHmac(req, manifest) {
  return hmacHex(getAccountHmacKey(req), normalizeManifestObject(manifest))
}

module.exports = {
  sha256Hex,
  hmacHex,
  manifestUrlHash,
  manifestUrlHmac,
  normalizeUrl,
  getAccountHmacKey,
  normalizeManifestObject,
  manifestHash,
  manifestHmac
}
