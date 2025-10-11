// Protected addon configuration
export const PROTECTED_ADDON_IDS = [
  'com.linvo.cinemeta', // Cinemeta
  'org.stremio.local' // Local Files
]

export const PROTECTED_MANIFEST_URLS = [
  'https://v3-cinemeta.strem.io/manifest.json',
  'http://127.0.0.1:11470/local-addon/manifest.json'
]

export interface Addon {
  id?: string
  manifest?: {
    id?: string
  }
  manifestUrl?: string
  transportUrl?: string
  url?: string
}

/**
 * Check if an addon is protected by built-in rules
 */
export function isAddonProtectedBuiltIn(addon: Addon): boolean {
  const addonId = addon?.id || addon?.manifest?.id
  const manifestUrl = addon?.manifestUrl || addon?.transportUrl || addon?.url
  
  // Check by ID
  if (addonId && PROTECTED_ADDON_IDS.includes(addonId)) {
    return true
  }
  
  // Check by manifest URL
  if (manifestUrl && PROTECTED_MANIFEST_URLS.includes(manifestUrl)) {
    return true
  }
  
  // Check if manifest URL contains any protected IDs (for cases where URL contains the ID)
  if (manifestUrl) {
    return PROTECTED_ADDON_IDS.some((id: string) => manifestUrl.includes(id)) ||
           PROTECTED_MANIFEST_URLS.some((url: string) => manifestUrl.includes(url))
  }
  
  return false
}

/**
 * Check if an addon is protected (built-in + user-defined)
 */
export function isAddonProtected(addon: Addon, userProtectedSet: Set<string>): boolean {
  const addonUrl = addon?.manifestUrl || addon?.transportUrl || addon?.url || ''
  return isAddonProtectedBuiltIn(addon) || userProtectedSet.has(addonUrl)
}

/**
 * Get the addon URL for protection checking
 */
export function getAddonUrl(addon: Addon): string {
  return addon?.manifestUrl || addon?.transportUrl || addon?.url || ''
}

/**
 * Check if an addon can be deleted based on protection status
 */
export function canDeleteAddon(addon: Addon, userProtectedSet: Set<string>, deleteMode: 'safe' | 'unsafe' = 'safe'): boolean {
  if (deleteMode === 'unsafe') {
    return true // Unsafe mode allows deletion of protected addons
  }
  
  return !isAddonProtected(addon, userProtectedSet)
}

/**
 * Get protection reason for an addon
 */
export function getProtectionReason(addon: Addon, userProtectedSet: Set<string>): string | null {
  if (isAddonProtectedBuiltIn(addon)) {
    return 'Built-in addon (cannot be deleted)'
  }
  
  const addonUrl = getAddonUrl(addon)
  if (userProtectedSet.has(addonUrl)) {
    return 'User-protected addon'
  }
  
  return null
}
