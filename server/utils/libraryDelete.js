const { StremioAPIClient } = require('stremio-api-client')

/**
 * Mark a single library item as removed in Stremio, using the minimal-field
 * discordio-style payload: _id, name, type, removed, _mtime.
 *
 * This helper encapsulates the common logic used by:
 * - publicLibrary DELETE /library/:itemId
 * - users DELETE /:userId/library/:itemId
 *
 * @param {Object} options
 * @param {string} options.authKey - decrypted Stremio authKey
 * @param {string} options.itemId - raw item id from route (may be URL-encoded)
 * @param {string} [options.logPrefix] - prefix for console logs
 */
async function markLibraryItemRemoved({ authKey, itemId, logPrefix = '[libraryDelete]' }) {
  if (!authKey || !itemId) {
    throw new Error(`${logPrefix} authKey and itemId are required`)
  }

  const apiClient = new StremioAPIClient({
    endpoint: 'https://api.strem.io',
    authKey
  })

  // Decode itemId (it might be URL encoded)
  const decodedItemId = decodeURIComponent(itemId)

  // Get full library to find the item
  const libraryItems = await apiClient.request('datastoreGet', {
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
    const result = await apiClient.request('datastorePut', {
      collection: 'libraryItem',
      changes: [updatedItem]
    })
    console.log(`${logPrefix} Successfully marked item ${decodedItemId} as removed`)
    if (result) {
      console.log(`${logPrefix} Stremio response keys:`, Object.keys(result))
    }
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











