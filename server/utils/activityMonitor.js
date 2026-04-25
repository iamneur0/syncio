// Activity monitor - checks for new watch activity and sends Discord notifications
const { StremioAPIClient } = require('stremio-api-client')
const { setCachedLibrary } = require('./libraryCache')
const { processAccountSessions } = require('./sessionTracker')
const { fetchKitsuMetadata } = require('./kitsuUtils')
const { sendShareNotification: notifySendShareNotification } = require('./notify')

const CHECK_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

let activityTimer = null
// Track notified items: Map<accountId, Set<itemId>>
const notifiedItems = new Map()

function clearActivityMonitor() {
  if (activityTimer) {
    clearInterval(activityTimer)
    activityTimer = null
  }
  notifiedItems.clear()
}

function getWatchDate(item) {
  // IMPORTANT: Only use state.lastWatched - this is the actual watch timestamp
  // Do NOT use _mtime - that's just when the library item was modified (e.g., added to library)
  // Do NOT use _ctime - that's creation time
  if (item.state?.lastWatched) {
    const d = new Date(item.state.lastWatched)
    if (!isNaN(d.getTime())) return d
  }
  return null
}

function isActuallyWatched(item) {
  // Check if the item was actually watched vs just added to library
  // An item is considered watched if:
  // 1. It has timeWatched > 0 or overallTimeWatched > 0
  // 2. OR it has a non-empty video_id (indicates specific content was played)
  const state = item.state || {}

  if (state.timeWatched > 0 || state.overallTimeWatched > 0) {
    return true
  }

  // For series, video_id indicates which episode was watched (e.g., "tt123:1:1")
  // For movies, video_id might be the movie ID itself
  if (state.video_id && state.video_id.trim() !== '') {
    return true
  }

  return false
}

async function checkActivityForAccount(prisma, accountId, decrypt, getAccountId) {
  try {
    // Get account sync config to check for webhook URL
    const account = await prisma.appAccount.findUnique({
      where: { id: accountId },
      select: { sync: true }
    })

    if (!account) return

    let syncCfg = account.sync || null
    if (syncCfg && typeof syncCfg === 'string') {
      try { syncCfg = JSON.parse(syncCfg) } catch { syncCfg = null }
    }

    const webhookUrl = syncCfg?.webhookUrl

    // Get all active users for this account
    const users = await prisma.user.findMany({
      where: {
        accountId: accountId,
        isActive: true
      },
      select: {
        id: true,
        username: true,
        email: true,
        stremioAuthKey: true,
        colorIndex: true
      }
    })

    if (users.length === 0) return

    // Process metrics for all users (regardless of webhook configuration)
    // This runs every 5 minutes to compute accurate watch time deltas
    try {
      const { processAccountMetrics } = require('./metricsProcessor')
      const { getCachedLibrary } = require('./libraryCache')
      const { StremioAPIClient } = require('stremio-api-client')

      // Helper function to get library for a user
      // Fetches fresh from Stremio if auth key is available, otherwise uses cache
      const getLibraryForUser = async (user) => {
        try {
          if (!user.stremioAuthKey) {
            // No auth key, use cached library (library-email.json)
            return getCachedLibrary(accountId, user) || []
          }

          const mockReq = { appAccountId: accountId }
          const authKeyPlain = decrypt(user.stremioAuthKey, mockReq)
          const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })

          const libraryItems = await apiClient.request('datastoreGet', {
            collection: 'libraryItem',
            ids: [],
            all: true
          })

          const library = Array.isArray(libraryItems) ? libraryItems : (libraryItems?.result || libraryItems?.library || [])

          // Update cache with fresh data
          if (Array.isArray(library) && library.length > 0) {
            setCachedLibrary(accountId, user, library)
          }

          return library || []
        } catch (error) {
          console.warn(`[ActivityMonitor] Failed to fetch library for user ${user.id}:`, error.message)
          // Fallback to cache if API call fails
          const cachedLibrary = getCachedLibrary(accountId, user)
          return cachedLibrary || []
        }
      }

      // Process metrics for all users
      console.log(`[ActivityMonitor] Starting metrics processing for account ${accountId}, ${users.length} users`)
      await processAccountMetrics(prisma, accountId, users, getLibraryForUser, new Date())
      console.log(`[ActivityMonitor] Completed metrics processing for account ${accountId}`)

      // Process watch sessions (track start/end times)
      try {
        await processAccountSessions(prisma, accountId, users, getLibraryForUser, new Date())
      } catch (sessionError) {
        console.warn(`[ActivityMonitor] Error processing sessions:`, sessionError.message)
      }

      // Precompute and cache metrics for all periods (runs every 5 minutes)
      // This ensures fresh data is available for both /users/metrics and /ext/metrics.json
      try {
        const { setCachedMetrics } = require('./metricsCache')
        const { buildMetricsForAccount } = require('./metricsBuilder')
        const periods = ['1h', '12h', '1d', '3d', '7d', '30d', '90d', '1y', 'all']

        console.log(`[ActivityMonitor] Precomputing metrics cache for account ${accountId}`)
        for (const period of periods) {
          try {
            const metrics = await buildMetricsForAccount({
              prisma,
              accountId,
              period,
              decrypt
            })
            setCachedMetrics(accountId, period, metrics)
          } catch (periodError) {
            console.warn(`[ActivityMonitor] Failed to precompute metrics for period ${period}:`, periodError.message)
          }
        }
        console.log(`[ActivityMonitor] Metrics cache updated for account ${accountId}`)
      } catch (cacheError) {
        console.warn(`[ActivityMonitor] Error during metrics cache update:`, cacheError.message)
      }
    } catch (metricsError) {
      console.error(`[ActivityMonitor] Error during metrics processing for account ${accountId}:`, metricsError.message)
      console.error(`[ActivityMonitor] Error stack:`, metricsError.stack)
    }

    // Only process Discord notifications if webhook is configured
    if (!webhookUrl) return

    const now = Date.now()
    const cutoffTime = now - CHECK_INTERVAL_MS
    const newActivities = []

    // Initialize notified items set for this account if needed
    if (!notifiedItems.has(accountId)) {
      notifiedItems.set(accountId, new Set())
    }
    const accountNotifiedItems = notifiedItems.get(accountId)

    // Check each user with an auth key for new activity to notify
    const usersWithAuth = users.filter(u => u.stremioAuthKey)

    for (const user of usersWithAuth) {
      try {
        // Create a mock request object for decrypt
        const mockReq = { appAccountId: accountId }
        const authKeyPlain = decrypt(user.stremioAuthKey, mockReq)
        const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })

        const libraryItems = await apiClient.request('datastoreGet', {
          collection: 'libraryItem',
          ids: [],
          all: true
        })

        let library = Array.isArray(libraryItems) ? libraryItems : (libraryItems?.result || libraryItems?.library || [])

        // Cache the library data for metrics queries
        if (Array.isArray(library) && library.length > 0) {
          setCachedLibrary(accountId, user, library)
        }

        // Check each item for recent activity
        for (const item of library) {
          const watchDate = getWatchDate(item)
          if (!watchDate || watchDate < cutoffTime) continue // Not recent enough

          // Skip items that weren't actually watched (e.g., just added to library from share)
          if (!isActuallyWatched(item)) continue

          // Create unique item ID (for movies: just _id, for series: _id:season:episode)
          let itemId = item._id || item.id
          if (item.type === 'series' && item.state?.season !== undefined && item.state?.episode !== undefined) {
            itemId = `${item._id}:${item.state.season}:${item.state.episode}`
          }

          // Check if we've already notified about this item
          const notificationKey = `${user.id}:${itemId}`
          if (accountNotifiedItems.has(notificationKey)) continue

          // Extract season/episode from video_id if available
          // Format: "tt8080122:4:6" = season 4, episode 6
          // Format: "tt8080122:6" = episode 6 only (no season or season 0)
          let season = item.state?.season
          let episode = item.state?.episode

          if (item.state?.video_id) {
            const videoId = item.state.video_id
            const videoIdParts = videoId.split(':')

            // Special handling for kitsu ids:
            // - Format: "kitsu:46676:1" -> episode = last segment ("1"), season from Kitsu API title
            if (videoId.startsWith('kitsu:') && videoIdParts.length >= 2) {
              const kitsuId = videoIdParts[1] // e.g., "46676"
              const episodePart = videoIdParts[videoIdParts.length - 1]
              const parsedEpisode = parseInt(episodePart, 10)
              if (!isNaN(parsedEpisode)) {
                episode = parsedEpisode
              }
              // Fetch season from Kitsu API title (e.g., "My Hero Academia Season 3" -> 3)
              const kitsuData = await fetchKitsuMetadata(kitsuId)
              if (kitsuData && kitsuData.season !== null) {
                season = kitsuData.season
              }
            } else {
              // Default handling for normal ids:
              // Format: "tt8080122:4:6" (2 colons = 3 parts)
              if (videoIdParts.length === 3) {
                season = parseInt(videoIdParts[1], 10) || season
                episode = parseInt(videoIdParts[2], 10) || episode
              }
              // Format: "tt8080122:6" (1 colon = 2 parts)
              else if (videoIdParts.length === 2) {
                episode = parseInt(videoIdParts[1], 10) || episode
                // No season specified, keep existing or default to 0
                if (season === undefined) season = 0
              }
            }
          }

          // This is a new activity!
          newActivities.push({
            user: {
              id: user.id,
              username: user.username || user.email,
              email: user.email,
              colorIndex: user.colorIndex || 0
            },
            item: {
              id: itemId,
              _id: item._id || item.id, // Original ID for link generation
              name: item.name,
              type: item.type,
              year: item.year,
              poster: item.poster,
              season: season,
              episode: episode,
              video_id: item.state?.video_id // Keep video_id for reference
            },
            watchDate: watchDate,
            notificationKey: notificationKey
          })

          // Mark as notified
          accountNotifiedItems.add(notificationKey)
        }
      } catch (error) {
        // Skip user if there's an error fetching their library
        continue
      }
    }

    // Note: Discord notifications for watch activity are now handled by sessionTracker.js
    // which sends notifications when a session starts (now playing) using user-level webhooks.
    // The old account-level activity notification has been disabled to avoid duplicate notifications.
  } catch (error) {
    // Silently fail - don't spam logs
  }
}

async function checkAllAccounts(prisma, decrypt, getAccountId, INSTANCE_TYPE) {
  try {
    if (INSTANCE_TYPE === 'public') {
      // Check all accounts
      const accounts = await prisma.appAccount.findMany({
        select: { id: true }
      })
      for (const account of accounts) {
        await checkActivityForAccount(prisma, account.id, decrypt, getAccountId)
      }
    } else {
      // Private mode: check default account
      const DEFAULT_ACCOUNT_ID = process.env.DEFAULT_ACCOUNT_ID || 'default'
      await checkActivityForAccount(prisma, DEFAULT_ACCOUNT_ID, decrypt, getAccountId)
    }
  } catch (error) {
    // Silently fail
  }
}

function scheduleActivityMonitor(prisma, decrypt, getAccountId, INSTANCE_TYPE) {
  clearActivityMonitor()

  // Run immediately on startup to update library database
  checkAllAccounts(prisma, decrypt, getAccountId, INSTANCE_TYPE)

  // Then run every 5 minutes
  activityTimer = setInterval(() => {
    checkAllAccounts(prisma, decrypt, getAccountId, INSTANCE_TYPE)
  }, CHECK_INTERVAL_MS)
}

// Send share notification to a user's Discord webhook
async function sendShareNotification(webhookUrl, sharerUsername, sharerEmail, sharerColorIndex, item) {
  return await notifySendShareNotification(webhookUrl, sharerUsername, sharerEmail, sharerColorIndex, item)
}

module.exports = {
  scheduleActivityMonitor,
  clearActivityMonitor,
  sendShareNotification,
  CHECK_INTERVAL_MS
}