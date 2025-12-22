// Avatar utility functions

/**
 * Generate Gravatar URL from email address
 * @param email - User's email address
 * @param size - Size of the avatar (default: 128)
 * @returns Gravatar URL or null if email is not provided
 */
export function getGravatarUrl(email: string | null | undefined, size: number = 128): string | null {
  if (!email) return null
  
  // Trim and lowercase email for Gravatar
  const normalizedEmail = email.trim().toLowerCase()
  
  // Create MD5 hash (in browser, we'll need to use crypto or a library)
  // For now, we'll use Gravatar's API which accepts email directly in some cases
  // But standard Gravatar requires MD5 hash
  try {
    // Use crypto.subtle for MD5 if available, otherwise use a simple approach
    // Note: Gravatar requires MD5 hash of the email
    const crypto = require('crypto')
    const hash = crypto.createHash('md5').update(normalizedEmail).digest('hex')
    return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=404`
  } catch {
    // Fallback: Gravatar also supports direct email in some cases, but MD5 is standard
    // For client-side, we might need to use a library or API endpoint
    return null
  }
}

/**
 * Get user avatar URL - either Gravatar or generated avatar
 * @param email - User's email address
 * @param username - User's username
 * @param colorIndex - User's color index for generated avatar
 * @param useGravatar - Whether to use Gravatar
 * @param size - Size of the avatar (default: 128)
 * @returns Avatar URL
 */
export function getUserAvatarUrl(
  email: string | null | undefined,
  username: string | null | undefined,
  colorIndex: number | null | undefined,
  useGravatar: boolean = false,
  size: number = 128
): string | null {
  // Try Gravatar first if enabled
  if (useGravatar && email) {
    const gravatarUrl = getGravatarUrl(email, size)
    if (gravatarUrl) return gravatarUrl
  }
  
  // Fallback to generated avatar
  if (!username && !email) return null
  
  // Simple color palette based on colorIndex (0-4)
  const colorPalette = [
    { bg: '3b82f6', text: 'ffffff' }, // Blue
    { bg: '10b981', text: 'ffffff' }, // Green
    { bg: 'f59e0b', text: 'ffffff' }, // Amber
    { bg: 'ef4444', text: 'ffffff' }, // Red
    { bg: '8b5cf6', text: 'ffffff' }, // Purple
  ]
  
  const index = (colorIndex || 0) % colorPalette.length
  const colors = colorPalette[index]
  const displayName = username || email || 'U'
  const initial = displayName.charAt(0).toUpperCase()
  
  // Use UI Avatars service to generate avatar
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(initial)}&background=${colors.bg}&color=${colors.text}&size=${size}&bold=true&font-size=0.5`
}
