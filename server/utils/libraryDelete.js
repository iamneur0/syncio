const { StremioAPIClient } = require('stremio-api-client')
const { createProvider } = require('../providers')

/**
 * Mark a single library item as removed in Stremio, using the minimal-field
 * discordio-style payload: _id, name, type, removed, _mtime.
 *
 * This helper encapsulates the common logic used by:
 * - publicLibrary DELETE /library/:itemId
 * - users DELETE /:userId/library/:itemId
 *
 * @param {Object} options
 * @param {string} [options.authKey] - decrypted Stremio authKey (legacy path)
 * @param {Object} [options.provider] - provider instance from createProvider (preferred)
 * @param {Object} [options.user] - user object for createProvider
 * @param {Function} [options.decrypt] - decrypt function for createProvider
 * @param {Object} [options.req] - request object for createProvider
 * @param {string} options.itemId - raw item id from route (may be URL-encoded)
 * @param {string} [options.logPrefix] - prefix for console logs
 */
async function markLibraryItemRemoved({ authKey, provider: providerArg, user, decrypt, req, itemId, logPrefix = '[libraryDelete]' }) {
  if (!itemId) {
    throw new Error(`${logPrefix} itemId is required`)
  }

  // Resolve provider: explicit provider > createProvider from user > legacy apiClient
  let provider = providerArg
  if (!provider && user && decrypt) {
    provider = createProvider(user, { decrypt, req })
  }

  if (!provider && !authKey) {
    throw new Error(`${logPrefix} provider, user+decrypt, or authKey is required`)
  }

  let apiClient = null
  if (!provider) {
    apiClient = new StremioAPIClient({
      endpoint: 'https://api.strem.io',
      authKey
    })
  }

  // Decode itemId (it might be URL encoded)
  const decodedItemId = decodeURIComponent(itemId)

  // Get full library to find the item
  const libraryItems = provider
    ? await provider.getLibrary()
    : await apiClient.request('datastoreGet', {
        collection: 'libraryItem',
        ids: [],
        all: true
      })

  let allItems = []
  if (Array.isArray(libraryItems)) {
    allItems = libraryItems
  } else if (libraryItems?.result) {
    allItems = Array.isArray(libraryItems.result) ? libraryItems.result : [libraryItems.result]
  } else if (libraryItems?.library) {
    allItems = Array.isArray(libraryItems.library) ? libraryItems.library : [libraryItems.library]
  } else if (libraryItems && typeof libraryItems === 'object') {
    allItems = Object.values(libraryItems).filter(item => item && (item._id || item.id))
  }

  const itemToDelete = allItems.find(item => {
    const idValue = item._id || item.id
    return idValue === decodedItemId
  })

  if (!itemToDelete) {
    console.error(`${logPrefix} Item not found: ${decodedItemId}`)
    console.error(`${logPrefix} Total items in library: ${allItems.length}`)
    const err = new Error('Library item not found')
    err.code = 'NOT_FOUND'
    err.meta = { itemId: decodedItemId, totalItems: allItems.length }
    throw err
  }

  const updatedItem = {
    _id: itemToDelete._id || itemToDelete.id,
    name: itemToDelete.name || 'Unknown',
    type: itemToDelete.type || 'unknown',
    removed: true,
    _mtime: new Date().toISOString()
  }

  console.log(`${logPrefix} Deleting item ${decodedItemId} (${updatedItem.name}) using minimal payload`)

  try {
    if (provider) {
      await provider.removeLibraryItem([updatedItem])
    } else {
      const result = await apiClient.request('datastorePut', {
        collection: 'libraryItem',
        changes: [updatedItem]
      })
      if (result) {
        console.log(`${logPrefix} Stremio response keys:`, Object.keys(result))
      }
    }
    console.log(`${logPrefix} Successfully marked item ${decodedItemId} as removed`)
    return { ok: true, itemId: decodedItemId }
  } catch (err) {
    console.error(`${logPrefix} Error in datastorePut:`, err?.message || err)
    const error = new Error(`Failed to delete library item: ${err?.message || err}`)
    error.cause = err
    throw error
  }
}

module.exports = {
  markLibraryItemRemoved
}











