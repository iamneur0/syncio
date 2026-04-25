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
  console.log('🔍 FILTER DEBUG: selectedNames:', Array.from(selectedNames))
  console.log('🔍 FILTER DEBUG: has catalog?', selectedNames.has('catalog'))
  console.log('🔍 FILTER DEBUG: original catalogs count:', manifestObj?.catalogs?.length || 0)
  const clone = JSON.parse(JSON.stringify(manifestObj))
  if (Array.isArray(clone.resources)) {
    clone.resources = clone.resources.filter((r) => {
      const label = typeof r === 'string' ? r : (r && (r.name || r.type))
      return label && selectedNames.has(label)
    })
  }
  if (!selectedNames.has('catalog')) {
    console.log('🔍 FILTER DEBUG: CLEARING CATALOGS because catalog not in selectedNames')
    clone.catalogs = []
  }
  if (!selectedNames.has('addon_catalog')) clone.addonCatalogs = []
  console.log('🔍 FILTER DEBUG: final catalogs count:', clone?.catalogs?.length || 0)
  return clone
}

function filterManifestByCatalogs(manifestObj, selectedCatalogIds) {
  if (!manifestObj || typeof manifestObj !== 'object') return null
  if (!Array.isArray(manifestObj.catalogs)) return manifestObj

  const clone = JSON.parse(JSON.stringify(manifestObj))
  const originalCatalogs = manifestObj.catalogs
  const orderedCatalogs = []

  if (Array.isArray(selectedCatalogIds)) {
    selectedCatalogIds.forEach(selected => {
      // Normalize selected entry
      let sType, sId, sSearch = false
      if (Array.isArray(selected) && selected.length >= 2) {
        // Format: [type, id, search]
        sType = selected[0]
        sId = selected[1]
        sSearch = selected[2] !== undefined ? selected[2] : false
      } else if (typeof selected === 'string') {
        // Legacy string format
        sId = selected
        sType = 'unknown'
      } else if (selected && selected.id) {
        // Database object format: { type, id, search }
        sId = selected.id
        sType = selected.type || 'unknown'
        sSearch = selected.search || false
      }

      if (!sId) return

      // Find matching catalog in original manifest
      const match = originalCatalogs.find(c => {
        const cId = typeof c === 'string' ? c : (c && c.id)
        const cType = typeof c === 'string' ? 'unknown' : (c && c.type) || 'unknown'
        return cId === sId && (sType === 'unknown' || cType === sType)
      })

      if (match) {
        const catalogClone = JSON.parse(JSON.stringify(match))
        
        // If this catalog has search functionality, check if search is enabled
        if (catalogClone.extra && Array.isArray(catalogClone.extra)) {
          const hasSearch = catalogClone.extra.some((extra) => extra.name === 'search')
          
          if (hasSearch && !sSearch) {
            // Remove search functionality from this catalog
            catalogClone.extra = catalogClone.extra.filter((extra) => extra.name !== 'search')
          }
        }
        
        orderedCatalogs.push(catalogClone)
      }
    })
  } else {
    // If no selections provided, return manifest as-is
    return manifestObj
  }

  clone.catalogs = orderedCatalogs
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
