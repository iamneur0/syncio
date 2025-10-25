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
  
  // Parse selected catalog tuples: (type, id, search)
  const selectedCatalogs = new Map()
  
  if (Array.isArray(selectedCatalogIds)) {
    selectedCatalogIds.forEach(catalog => {
      if (Array.isArray(catalog) && catalog.length >= 2) {
        // Format: [type, id, search] where search is optional (defaults to false)
        const [type, id, search = false] = catalog
        const catalogKey = `${id}:${type}`
        selectedCatalogs.set(catalogKey, { type, id, search })
      } else if (typeof catalog === 'string') {
        // Legacy string format - assume no search
        selectedCatalogs.set(catalog, { type: 'unknown', id: catalog, search: false })
      } else if (catalog && catalog.id) {
        // Database object format: { type, id, search }
        const catalogKey = `${catalog.id}:${catalog.type || 'unknown'}`
        selectedCatalogs.set(catalogKey, { 
          type: catalog.type || 'unknown', 
          id: catalog.id, 
          search: catalog.search || false 
        })
      }
    })
  }
  
  const clone = JSON.parse(JSON.stringify(manifestObj))
  if (Array.isArray(clone.catalogs)) {
    clone.catalogs = clone.catalogs.filter((catalog) => {
      const catalogId = typeof catalog === 'string' ? catalog : (catalog && catalog.id)
      const catalogType = typeof catalog === 'string' ? 'unknown' : (catalog && catalog.type) || 'unknown'
      const catalogKey = `${catalogId}:${catalogType}`
      
      // Check if this catalog is selected
      const selectedCatalog = selectedCatalogs.get(catalogKey)
      console.log(`🔍 Looking for catalog key: ${catalogKey}`)
      console.log(`🔍 Available keys:`, Array.from(selectedCatalogs.keys()))
      console.log(`🔍 Found selected catalog:`, selectedCatalog)
      if (!selectedCatalog) return false
      
      // If this catalog has search functionality, check if search is enabled
      if (catalog.extra && Array.isArray(catalog.extra)) {
        const hasSearch = catalog.extra.some((extra) => extra.name === 'search')
        const hasOtherExtras = catalog.extra.some((extra) => extra.name !== 'search')
        const isEmbeddedSearch = hasSearch && hasOtherExtras
        
        if (isEmbeddedSearch) {
          // For embedded search catalogs, check if search is enabled in the tuple
          console.log(`🔍 Catalog ${catalogId}:${catalogType} - selectedSearch:`, selectedCatalog.search)
          console.log(`🔍 Selected catalog object:`, selectedCatalog)
          console.log(`🔍 Catalog type match: ${selectedCatalog.type} === ${catalogType}`, selectedCatalog.type === catalogType)
          
          if (!selectedCatalog.search) {
            // Remove search functionality from this catalog
            console.log(`🔍 Removing search from ${catalogId}:${catalogType}`)
            // Only remove the extra object with name: "search", keep extraSupported intact
            catalog.extra = catalog.extra.filter((extra) => extra.name !== 'search')
            // Don't modify extraSupported - keep it as is
          } else {
            console.log(`🔍 Keeping search for ${catalogId}:${catalogType}`)
          }
        } else if (hasSearch && !hasOtherExtras) {
          // For standalone search catalogs, check if search is enabled
          console.log(`🔍 Standalone search catalog ${catalogId}:${catalogType} - selectedSearch:`, selectedCatalog.search)
          
          if (!selectedCatalog.search) {
            // Remove search functionality from this catalog
            console.log(`🔍 Removing search from standalone ${catalogId}:${catalogType}`)
            catalog.extra = catalog.extra.filter((extra) => extra.name !== 'search')
          } else {
            console.log(`🔍 Keeping search for standalone ${catalogId}:${catalogType}`)
          }
        }
      }
      
      return true
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
