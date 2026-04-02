/**
 * Provider factory — creates the correct provider for a user based on providerType.
 *
 * Usage:
 *   const { createProvider } = require('./providers')
 *   const provider = createProvider(user, { decrypt, req })
 *   if (!provider) return res.status(400).json({ error: 'User not connected' })
 *   const { addons } = await provider.getAddons()
 */

const { createStremioProvider } = require('./stremio')
const { createNuvioProvider } = require('./nuvio')

function createProvider(user, { decrypt, req }) {
  const type = user.providerType || 'stremio'

  try {
    if (type === 'nuvio') {
      if (!user.nuvioRefreshToken || !user.nuvioUserId) return null
      return createNuvioProvider({
        refreshToken: decrypt(user.nuvioRefreshToken, req),
        userId: user.nuvioUserId
      })
    }

    // Default: stremio
    if (!user.stremioAuthKey) return null
    return createStremioProvider({
      authKey: decrypt(user.stremioAuthKey, req)
    })
  } catch {
    return null
  }
}

module.exports = { createProvider }
