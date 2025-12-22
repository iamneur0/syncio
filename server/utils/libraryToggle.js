const { StremioAPIClient } = require('stremio-api-client')

/**
 * Extract base ID from item ID (removes episode/season info for series)
 * e.g., "tt0388629:22:67" -> "tt0388629"
 */
function extractBaseId(itemId) {
  if (!itemId) return itemId
  const decoded = decodeURIComponent(itemId)
  // For series, extract base ID (before first colon after tt...)
  if (decoded.startsWith('tt') && decoded.includes(':')) {
    return decoded.split(':')[0]
  }
  return decoded
}

/**
 * Batch toggle library items (add/remove) in a single Stremio API call
 * 
 * @param {Object} options
 * @param {string} options.authKey - decrypted Stremio authKey
 * @param {Array} options.items - Array of { itemId, itemType, itemName, poster, addToLibrary }
 * @param {string} [options.logPrefix] - prefix for console logs
 */
async function toggleLibraryItemsBatch({ authKey, items, logPrefix = '[libraryToggle]' }) {
  if (!authKey || !items || !Array.isArray(items) || items.length === 0) {
    throw new Error(`${logPrefix} authKey and items array are required`)
  }

  const apiClient = new StremioAPIClient({
    endpoint: 'https://api.strem.io',
    authKey
  })

  const now = new Date().toISOString()

  // Get all existing items from library
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
  }

  const changes = []
  const processedBaseIds = new Set() // Track processed base IDs to avoid duplicates

  for (const item of items) {
    if (!item || !item.itemId) {
      console.warn(`${logPrefix} Skipping invalid item:`, item)
      continue
    }
    
    const { itemId, itemType, itemName, poster, addToLibrary } = item
    
    if (!itemId || !itemType || !itemName) {
      console.warn(`${logPrefix} Skipping item with missing required fields:`, { itemId, itemType, itemName })
      continue
    }
    
    // Extract base ID (for series, this removes episode info)
    const baseId = extractBaseId(itemId)
    
    // Skip if we've already processed this base ID (for series with multiple episodes)
    if (processedBaseIds.has(baseId)) {
      console.log(`${logPrefix} Skipping duplicate base ID: ${baseId}`)
      continue
    }
    processedBaseIds.add(baseId)

    // Find existing item by base ID (for series) or exact ID (for movies)
    const existingItem = allItems.find(libItem => {
      const libId = libItem._id || libItem.id
      // For series, match by base ID; for movies, match exactly
      if (itemType === 'series') {
        return extractBaseId(libId) === baseId
      }
      return libId === baseId
    })

    let updatedItem

    if (addToLibrary) {
      // Add to library: removed: false, temp: false, with behaviorHints.defaultVideoId
      if (existingItem) {
        // Preserve existing item data, just update removed and behaviorHints
        updatedItem = {
          ...existingItem,
          removed: false,
          temp: false,
          _mtime: now,
          behaviorHints: {
            ...(existingItem.behaviorHints || {}),
            defaultVideoId: baseId
          }
        }
        // Ensure _id is set correctly
        updatedItem._id = existingItem._id || existingItem.id || baseId
      } else {
        // New item - create from scratch
        updatedItem = {
          _id: baseId,
          name: itemName,
          type: itemType,
          poster: poster || '',
          posterShape: 'poster',
          removed: false,
          temp: false,
          _ctime: now,
          _mtime: now,
          state: {
            lastWatched: now,
            timeWatched: 0,
            timeOffset: 0,
            overallTimeWatched: 0,
            timesWatched: 0,
            flaggedWatched: 0,
            duration: 0,
            video_id: null,
            watched: null,
            noNotif: false
          },
          behaviorHints: {
            defaultVideoId: baseId,
            featuredVideoId: null,
            hasScheduledVideos: false
          }
        }
      }
    } else {
      // Remove from library: preserve watch history (state, _ctime, temp)
      if (existingItem) {
        // Preserve existing item data, especially watch history
        updatedItem = {
          _id: existingItem._id || existingItem.id || baseId,
          name: existingItem.name || itemName || 'Unknown',
          type: existingItem.type || itemType || 'unknown',
          poster: existingItem.poster || poster || '',
          posterShape: existingItem.posterShape || 'poster',
          removed: true,
          temp: existingItem.temp !== undefined ? existingItem.temp : false,
          _ctime: existingItem._ctime || now,
          _mtime: now,
          // Preserve watch history state
          state: existingItem.state || {
            lastWatched: now,
            timeWatched: 0,
            timeOffset: 0,
            overallTimeWatched: 0,
            timesWatched: 0,
            flaggedWatched: 0,
            duration: 0,
            video_id: null,
            watched: null,
            noNotif: false
          },
          behaviorHints: {
            defaultVideoId: null,
            featuredVideoId: null,
            hasScheduledVideos: false
          }
        }
      } else {
        // Item doesn't exist, skip it
        console.log(`${logPrefix} Item not found for removal: ${baseId}, skipping`)
        continue
      }
    }

    changes.push(updatedItem)
    console.log(`${logPrefix} ${addToLibrary ? 'Adding' : 'Removing'} item ${baseId} (${itemName})`)
  }

  if (changes.length === 0) {
    console.log(`${logPrefix} No items to process`)
    return { ok: true, processedCount: 0 }
  }

  try {
    // Send all changes in a single batch call
    const result = await apiClient.request('datastorePut', {
      collection: 'libraryItem',
      changes: changes
    })
    console.log(`${logPrefix} Successfully processed ${changes.length} item(s) in batch`)
    return { ok: true, processedCount: changes.length }
  } catch (err) {
    console.error(`${logPrefix} Error in datastorePut batch:`, err?.message || err)
    const error = new Error(`Failed to toggle library items: ${err?.message || err}`)
    error.cause = err
    throw error
  }
}

module.exports = {
  toggleLibraryItemsBatch,
  extractBaseId
}





