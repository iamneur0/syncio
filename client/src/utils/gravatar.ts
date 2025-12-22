import CryptoJS from 'crypto-js'

/**
 * Generate a Gravatar URL from an email address
 * @param email - The email address
 * @param size - The size of the image (default: 128)
 * @param defaultImage - The default image type if no Gravatar exists (default: '404' to check if image exists)
 * @returns The Gravatar URL
 */
export function getGravatarUrl(email: string | null | undefined, size: number = 128, defaultImage: string = '404'): string | null {
  if (!email) return null
  
    // Normalize email: trim and convert to lowercase
    const normalizedEmail = email.trim().toLowerCase()
    
  // Generate MD5 hash
  const hash = CryptoJS.MD5(normalizedEmail).toString()
    
  // Construct Gravatar URL
  // Using d=404 means Gravatar will return 404 if no image exists for this email
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=${defaultImage}`
}

/**
 * Check if a Gravatar image exists for an email address
 * @param email - The email address
 * @param size - The size of the image (default: 128)
 * @returns Promise that resolves to true if image exists, false otherwise
 */
export async function checkGravatarExists(email: string | null | undefined, size: number = 128): Promise<boolean> {
  if (!email) return false
  
  const url = getGravatarUrl(email, size, '404')
  if (!url) return false
  
  try {
    const response = await fetch(url, { method: 'HEAD' })
    return response.ok
  } catch {
    return false
  }
}
