/**
 * User API Key Middleware
 * Validates user API keys and sets req.appUserId
 * Users can only access their own data via API key
 */
const { parsePresentedKey } = require('../utils/apiKey')
const { getServerKey, aesGcmDecrypt } = require('../utils/encryption')
const crypto = require('crypto')

function createUserApiKeyMiddleware(prisma) {
  return async (req, res, next) => {
    try {
      // Only check if no account session exists (user API key, not account API key)
      if (req.appAccountId) {
        // Account session exists, skip user API key check
        return next()
      }

      const presented = parsePresentedKey(req.headers['authorization'] || '')
      if (!presented) {
        return next() // No API key, continue with normal auth
      }

      // Find user by decrypting stored keys and comparing
      const users = await prisma.user.findMany({
        where: { apiKey: { not: null } },
        select: { id: true, apiKey: true, accountId: true }
      })

      const serverKey = getServerKey()
      for (const user of users) {
        try {
          // Derive user-specific key and decrypt
          const userKey = crypto.createHash('sha256')
            .update(Buffer.concat([Buffer.from(user.id || ''), serverKey]))
            .digest()
          const decrypted = aesGcmDecrypt(userKey, user.apiKey)
          if (decrypted === presented) {
            req.appUserId = user.id
            req.appAccountId = user.accountId || 'default'
            return next()
          }
        } catch {
          // Decryption failed for this user, try next
          continue
        }
      }

      // API key not found, but don't fail - might be account API key or session auth
      return next()
    } catch (e) {
      // Error validating, continue with normal auth
      return next()
    }
  }
}

module.exports = { createUserApiKeyMiddleware }










