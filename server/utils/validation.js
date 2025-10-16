// Data validation and parsing functions

/**
 * Parse excluded/protected addons (handles both array and JSON string formats)
 */
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

/**
 * Parse protected addons from encrypted storage
 */
function parseProtectedAddons(field, req) {
  if (!field) return []
  if (Array.isArray(field)) return field
  if (typeof field === 'string') {
    try {
      const parsed = JSON.parse(field)
      if (!Array.isArray(parsed)) return []
      // Entries are AES-GCM encrypted manifest URLs; decrypt to plaintext URLs
      return parsed.map(enc => {
        try {
          const { decrypt } = require('./encryption')
          return decrypt(enc, req)
        } catch {
          return null
        }
      }).filter((u) => typeof u === 'string' && u.trim().length > 0)
    } catch {
      return []
    }
  }
  return []
}

/**
 * Canonicalize manifest URLs for comparison
 */
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
 * Check if production environment
 */
function isProdEnv() {
  return String(process.env.NODE_ENV) === 'production';
}

/**
 * Filter a manifest by selected resource labels (name/type)
 */
function filterManifestByResources(manifestObj, selectedResourceNames) {
  if (!manifestObj || typeof manifestObj !== 'object') return null
  const selectedNames = new Set(
    (Array.isArray(selectedResourceNames) ? selectedResourceNames : [])
      .map((r) => (typeof r === 'string' ? r : (r && (r.name || r.type))))
      .filter(Boolean)
  )
  const clone = JSON.parse(JSON.stringify(manifestObj))
  if (Array.isArray(clone.resources)) {
    clone.resources = clone.resources.filter((r) => {
      const label = typeof r === 'string' ? r : (r && (r.name || r.type))
      return label && selectedNames.has(label)
    })
  }
  if (!selectedNames.has('catalog')) clone.catalogs = []
  if (!selectedNames.has('addon_catalog')) clone.addonCatalogs = []
  return clone
}

function filterManifestByCatalogs(manifestObj, selectedCatalogIds) {
  if (!manifestObj || typeof manifestObj !== 'object') return null
  const selectedIds = new Set(
    (Array.isArray(selectedCatalogIds) ? selectedCatalogIds : [])
      .map((c) => (typeof c === 'string' ? c : (c && c.id)))
      .filter(Boolean)
  )
  const clone = JSON.parse(JSON.stringify(manifestObj))
  if (Array.isArray(clone.catalogs)) {
    clone.catalogs = clone.catalogs.filter((c) => {
      const catalogId = typeof c === 'string' ? c : (c && c.id)
      return catalogId && selectedIds.has(catalogId)
    })
  }
  return clone
}

module.exports = {
  parseAddonIds,
  parseProtectedAddons,
  canonicalizeManifestUrl,
  normalizeUrl,
  isProdEnv,
  filterManifestByResources,
  filterManifestByCatalogs
}
