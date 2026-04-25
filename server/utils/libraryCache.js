/**
 * Libraries cache utility - stores user library data for fast queries
 * Organizes files by account ID: CACHE_DIR/account-{accountId}/library-{email}.json
 */

const fs = require('fs')
const path = require('path')

// Use /app/data/libraries in Docker, or relative path in development
// In Docker, __dirname will be /app/server/utils, so ../../data/libraries = /app/data/libraries
const CACHE_DIR = process.env.LIBRARIES_CACHE_DIR || path.join(__dirname, '../../data/libraries')
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes cache TTL

// Ensure cache directory exists
function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true })
  }
}

/**
 * Get account-specific cache directory
 */
function getAccountCacheDir(accountId) {
  ensureCacheDir()
  const accountDir = path.join(CACHE_DIR, `account-${accountId}`)
  if (!fs.existsSync(accountDir)) {
    fs.mkdirSync(accountDir, { recursive: true })
  }
  return accountDir
}

/**
 * Get cache file path for a user within an account folder
 * Prefers email-based naming: library-{email}.json
 * Falls back to user-{userId}.json if email not available
 */
function getCacheFilePath(accountId, user) {
  const accountDir = getAccountCacheDir(accountId)
  
  // If user object has email, use it
  if (user && user.email) {
    // Sanitize email for filename (replace special chars just in case, though usually fine)
    const safeEmail = user.email.replace(/[^a-zA-Z0-9@._-]/g, '_')
    return path.join(accountDir, `library-${safeEmail}.json`)
  }
  
  // Fallback to userId
  const userId = user && user.id ? user.id : user
  return path.join(accountDir, `user-${userId}.json`)
}

/**
 * Read cached library data for a user
 * Cache files are stored as plain arrays (compatible with stremthru restore format)
 * @param {string} accountId - Account ID
 * @param {object|string} user - User object {id, email} or userId string
 * @returns {Array|null} - Cached library array or null
 */
function getCachedLibrary(accountId, user) {
  try {
    let cachePath = getCacheFilePath(accountId, user)
    
    // If email-based file doesn't exist, try legacy ID-based file
    if (!fs.existsSync(cachePath) && typeof user === 'object' && user.id && user.email) {
      const legacyPath = path.join(getAccountCacheDir(accountId), `user-${user.id}.json`)
      if (fs.existsSync(legacyPath)) {
        cachePath = legacyPath
        // Optionally migrate immediately?
        // Let's just read from it for now. Write will happen on next update.
      }
    }

    if (!fs.existsSync(cachePath)) {
      return null
    }

    const data = fs.readFileSync(cachePath, 'utf8')
    const parsed = JSON.parse(data)

    // Handle new format: plain array
    if (Array.isArray(parsed)) {
      return parsed
    }

    // Handle old format: {timestamp, library: [...]} - migrate on read
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.library)) {
      // Migrate: write back as new format (plain array)
      try {
        fs.writeFileSync(cachePath, JSON.stringify(parsed.library, null, 2), 'utf8')
      } catch (migrateError) {
        console.warn(`Failed to migrate cache file for user ${user.id || user} in account ${accountId}:`, migrateError.message)
      }
      return parsed.library
    }

    return null
  } catch (error) {
    console.warn(`Failed to read cache for user ${user.id || user} in account ${accountId}:`, error.message)
    return null
  }
}

/**
 * Cache library data for a user
 * @param {string} accountId - Account ID
 * @param {object|string} user - User object {id, email} or userId string
 * @param {Array} library - Library data to cache
 */
function setCachedLibrary(accountId, user, library) {
  try {
    const cachePath = getCacheFilePath(accountId, user)
    
    // Store as plain array (compatible with stremthru restore format)
    const data = Array.isArray(library) ? library : []
    fs.writeFileSync(cachePath, JSON.stringify(data, null, 2), 'utf8')
    
    // If we successfully wrote a new email-based file, check for and delete the old ID-based file to avoid duplicates
    if (typeof user === 'object' && user.id && user.email) {
      const legacyPath = path.join(getAccountCacheDir(accountId), `user-${user.id}.json`)
      if (fs.existsSync(legacyPath) && legacyPath !== cachePath) {
        try {
          fs.unlinkSync(legacyPath)
        } catch (e) {
          // Ignore delete error
        }
      }
    }
  } catch (error) {
    console.warn(`Failed to write cache for user ${user.id || user} in account ${accountId}:`, error.message)
  }
}

/**
 * Clear cache for a user
 * @param {string} accountId - Account ID
 * @param {object|string} user - User object {id, email} or userId string
 */
function clearCache(accountId, user) {
  try {
    const cachePath = getCacheFilePath(accountId, user)
    if (fs.existsSync(cachePath)) {
      fs.unlinkSync(cachePath)
    }
    
    // Also clear legacy file if it exists
    if (typeof user === 'object' && user.id) {
        const legacyPath = path.join(getAccountCacheDir(accountId), `user-${user.id}.json`)
        if (fs.existsSync(legacyPath)) {
            fs.unlinkSync(legacyPath)
        }
    }
  } catch (error) {
    console.warn(`Failed to clear cache for user ${user.id || user} in account ${accountId}:`, error.message)
  }
}

/**
 * Clear all caches for an account
 * @param {string} accountId - Account ID (optional, if not provided clears all accounts)
 */
function clearAllCaches(accountId) {
  try {
    ensureCacheDir()
    if (accountId) {
      // Clear only for specific account
      const accountDir = path.join(CACHE_DIR, `account-${accountId}`)
      if (fs.existsSync(accountDir)) {
        const files = fs.readdirSync(accountDir)
        files.forEach(file => {
          if (file.endsWith('.json')) { // Clear all json files (both user- and library-)
            try {
              fs.unlinkSync(path.join(accountDir, file))
            } catch (error) {
              console.warn(`Failed to delete cache file ${file}:`, error.message)
            }
          }
        })
      }
    } else {
      // Clear all accounts
      const accounts = fs.readdirSync(CACHE_DIR)
      accounts.forEach(accountFolder => {
        if (accountFolder.startsWith('account-')) {
          const accountDir = path.join(CACHE_DIR, accountFolder)
          const files = fs.readdirSync(accountDir)
          files.forEach(file => {
            if (file.endsWith('.json')) {
              try {
                fs.unlinkSync(path.join(accountDir, file))
              } catch (error) {
                console.warn(`Failed to delete cache file ${file}:`, error.message)
              }
            }
          })
        }
      })
    }
  } catch (error) {
    console.warn('Failed to clear caches:', error.message)
  }
}

/**
 * Load cached libraries for multiple users within an account
 * @param {string} accountId - Account ID
 * @param {Array<object|string>} users - Array of user objects or IDs
 * @returns {Map<string, Array>} - Map of userId -> library array
 */
function getAllCachedLibraries(accountId, users) {
  const result = new Map()
  if (!Array.isArray(users) || users.length === 0) {
    return result
  }
  
  for (const user of users) {
    try {
      const library = getCachedLibrary(accountId, user)
      if (library && Array.isArray(library) && library.length > 0) {
        const userId = typeof user === 'object' ? user.id : user
        result.set(userId, library)
      }
    } catch (error) {
      // Skip users with invalid cache
      const userId = typeof user === 'object' ? user.id : user
      console.warn(`Failed to load cache for user ${userId} in account ${accountId}:`, error.message)
    }
  }
  
  return result
}

/**
 * Get cache stats for an account (or all accounts if accountId is not provided)
 * @param {string} accountId - Account ID (optional)
 * @returns {Object} - Cache statistics
 */
function getCacheStats(accountId) {
  try {
    ensureCacheDir()
    let cacheFiles = []
    
    if (accountId) {
      // Stats for specific account
      const accountDir = path.join(CACHE_DIR, `account-${accountId}`)
      if (fs.existsSync(accountDir)) {
        const files = fs.readdirSync(accountDir)
        cacheFiles = files.filter(f => f.endsWith('.json'))
          .map(f => path.join(accountDir, f))
      }
    } else {
      // Stats for all accounts
      const accounts = fs.readdirSync(CACHE_DIR)
      accounts.forEach(accountFolder => {
        if (accountFolder.startsWith('account-')) {
          const accountDir = path.join(CACHE_DIR, accountFolder)
          const files = fs.readdirSync(accountDir)
          cacheFiles.push(...files.filter(f => f.endsWith('.json'))
            .map(f => path.join(accountDir, f)))
        }
      })
    }
    
    let totalSize = 0
    let oldestTimestamp = Date.now()
    let newestTimestamp = 0

    cacheFiles.forEach(filePath => {
      try {
        const stats = fs.statSync(filePath)
        totalSize += stats.size

        // Use file modification time for timestamp (works for both old and new format)
        const mtime = stats.mtimeMs
        if (mtime < oldestTimestamp) oldestTimestamp = mtime
        if (mtime > newestTimestamp) newestTimestamp = mtime
      } catch (error) {
        // Skip invalid files
      }
    })

    return {
      fileCount: cacheFiles.length,
      totalSize,
      oldestTimestamp: oldestTimestamp === Date.now() ? null : oldestTimestamp,
      newestTimestamp: newestTimestamp === 0 ? null : newestTimestamp
    }
  } catch (error) {
    return { fileCount: 0, totalSize: 0, oldestTimestamp: null, newestTimestamp: null }
  }
}

module.exports = {
  getCachedLibrary,
  setCachedLibrary,
  getAllCachedLibraries,
  clearCache,
  clearAllCaches,
  getCacheStats,
  CACHE_TTL_MS
}

