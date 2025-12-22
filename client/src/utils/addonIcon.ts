/**
 * Utility functions for getting addon icon URLs
 * Handles custom logo priority and fallback logic
 */

/**
 * Get the icon URL for an addon, prioritizing custom logo
 * @param addon - Addon object with potential customLogo, iconUrl, and manifest
 * @returns The icon URL string or null
 */
export function getAddonIconUrl(addon: {
  customLogo?: string | null
  iconUrl?: string | null
  manifest?: {
    logo?: string
    icon?: string
    images?: {
      logo?: string
    }
  } | null
}): string | null {
  // Priority: customLogo > iconUrl > manifest.logo > manifest.icon > manifest.images.logo
  return (
    addon.customLogo ||
    addon.iconUrl ||
    addon.manifest?.logo ||
    addon.manifest?.icon ||
    addon.manifest?.images?.logo ||
    null
  )
}

