// Shared utility for generating user avatar URLs
// Tries Gravatar first, falls back to colored initial avatar

// Generate Gravatar URL from email
function getGravatarUrl(email, size = 128) {
  if (!email) return null
  
  const crypto = require('crypto')
  // Normalize email: trim and convert to lowercase
  const normalizedEmail = email.trim().toLowerCase()
  
  // Generate MD5 hash
  const hash = crypto.createHash('md5').update(normalizedEmail).digest('hex')
  
  // Construct Gravatar URL with d=404 to check if image exists
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=404`
}

// Check if Gravatar exists for an email
async function checkGravatarExists(email, size = 128) {
  if (!email) return false
  
  const gravatarUrl = getGravatarUrl(email, size)
  if (!gravatarUrl) return false
  
  try {
    const response = await fetch(gravatarUrl, { method: 'HEAD' })
    return response.ok
  } catch {
    return false
  }
}

// Generate user avatar URL - tries Gravatar first, falls back to colored initial
async function getUserAvatarUrl(username, email, colorIndex) {
  // Try Gravatar first if email is available
  if (email) {
    const gravatarExists = await checkGravatarExists(email, 128)
    if (gravatarExists) {
      return getGravatarUrl(email, 128)
    }
  }
  
  // Fall back to UI Avatars with colored initial
  if (!username) return null
  
  // Simple color palette based on colorIndex (0-4)
  // These are hex colors that work well for avatars
  const colorPalette = [
    { bg: '3b82f6', text: 'ffffff' }, // Blue
    { bg: '10b981', text: 'ffffff' }, // Green
    { bg: 'f59e0b', text: 'ffffff' }, // Amber
    { bg: 'ef4444', text: 'ffffff' }, // Red
    { bg: '8b5cf6', text: 'ffffff' }, // Purple
  ]
  
  const index = (colorIndex || 0) % colorPalette.length
  const colors = colorPalette[index]
  const initial = username.charAt(0).toUpperCase()
  
  // Use UI Avatars service to generate avatar
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(initial)}&background=${colors.bg}&color=${colors.text}&size=128&bold=true&font-size=0.5`
}

module.exports = {
  getUserAvatarUrl,
  getGravatarUrl,
  checkGravatarExists
}





