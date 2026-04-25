/**
 * Session Tracker - Tracks individual watch sessions with start/end times
 *
 * Logic:
 * - When we detect activity on an item (recent _mtime), check for active session
 * - If no active session exists, create one with startTime = now
 * - If active session exists and same video_id, update duration
 * - If active session exists but different video_id, close old session and start new one
 * - If item activity stopped (old _mtime), close the active session
 */

const { fetchKitsuMetadata, extractSeasonEpisode } = require('./kitsuUtils')
const { postDiscord, fetchMetadata } = require('./notify')
const { getUserAvatarUrl } = require('./avatarUtils')

const CHECK_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Format episode info to match UI display
 * - With season: S{season}E{episode}
 * - Without season (anime): E{episode}
 */
function formatEpisodeInfo(season, episode) {
  if (season !== null && season !== undefined) {
    return `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
  }
  return `E${episode}`
}

/**
 * Send Discord notification when a watch session starts (now playing)
 */
async function sendSessionStartNotification(webhookUrl, session, user) {
  try {
    if (!webhookUrl) return

    // Build title with show/movie name and episode info for shows
    let itemTitle = session.itemName || 'Unknown'
    if (session.itemType === 'series' && session.episode !== null && session.episode !== undefined) {
      itemTitle += ` (${formatEpisodeInfo(session.season, session.episode)})`
    }

    // Fetch metadata for additional info
    const metadata = await fetchMetadata(session.itemId, session.itemType, session.videoId)

    const fields = []

    // Field 1: Started timestamp
    const startTime = session.startTime || new Date()
    fields.push({
      name: 'Started',
      value: `<t:${Math.floor(startTime.getTime() / 1000)}:R>`,
      inline: true
    })

    // Field 2: Overview (if available)
    let overviewText = null
    if (session.itemType === 'series' && metadata?.episode?.overview) {
      overviewText = metadata.episode.overview
    } else if (metadata?.description) {
      overviewText = metadata.description
    }

    if (overviewText) {
      fields.push({
        name: 'Overview',
        value: overviewText.length > 1024 ? overviewText.substring(0, 1021) + '...' : overviewText,
        inline: false
      })
    }

    // Field 3: Episode title (for series)
    if (session.itemType === 'series' && metadata?.episode?.title) {
      fields.push({
        name: 'Episode Title',
        value: metadata.episode.title,
        inline: true
      })
    }

    // Field 4: Links (TMDb and IMDb)
    const links = []
    if (metadata?.moviedb_id) {
      const tmdbUrl = session.itemType === 'movie'
        ? `https://www.themoviedb.org/movie/${metadata.moviedb_id}`
        : `https://www.themoviedb.org/tv/${metadata.moviedb_id}`
      links.push(`[TMDb](${tmdbUrl})`)
    }
    if (metadata?.imdb_id) {
      const imdbUrl = `https://www.imdb.com/title/${metadata.imdb_id}`
      links.push(`[IMDb](${imdbUrl})`)
    }

    if (links.length > 0) {
      fields.push({
        name: 'Links',
        value: links.join(' ∙ '),
        inline: true
      })
    }

    // Generate user avatar URL
    const avatarUrl = await getUserAvatarUrl(user.username, user.email, user.colorIndex)

    const embed = {
      title: itemTitle,
      author: {
        name: `${user.username} started watching`,
        icon_url: avatarUrl || undefined
      },
      description: '',
      color: 0x00ff00, // Green color to indicate active/started
      fields: fields,
      timestamp: new Date().toISOString()
    }

    // Add thumbnail (poster)
    if (session.poster) {
      embed.thumbnail = {
        url: session.poster
      }
    }

    // Add footer with Syncio version
    let appVersion = process.env.NEXT_PUBLIC_APP_VERSION || process.env.APP_VERSION || ''
    if (!appVersion) {
      try { appVersion = require('../../package.json')?.version || '' } catch { }
    }
    if (appVersion) {
      embed.footer = { text: `Syncio v${appVersion}` }
    }

    await postDiscord(webhookUrl, null, {
      embeds: [embed],
      avatar_url: 'https://raw.githubusercontent.com/iamneur0/syncio/refs/heads/main/client/public/logo-black.png'
    })

    console.log(`[SessionTracker] Sent now playing notification for user ${user.username}, item: ${session.itemName}`)
  } catch (error) {
    console.warn(`[SessionTracker] Failed to send session start notification:`, error.message)
  }
}

// In-memory: track previous watch state per user:item to detect when watching stops.
// If lastWatched/timeWatched/overallTimeWatched haven't changed since last sync,
// the user stopped watching → close session in 1 cycle instead of 2.
const previousWatchStates = new Map() // key: `${userId}:${itemId}` -> stateHash string

/**
 * Build a hash of the watch-relevant fields.
 * If this hash is the same between two syncs, nothing changed → user stopped.
 */
function getWatchStateHash(item) {
  const state = item.state || {}
  return `${state.lastWatched || ''}|${state.timeWatched || 0}|${state.overallTimeWatched || 0}|${state.timeOffset || 0}`
}

/**
 * Get watch date from library item
 * IMPORTANT: Only use state.lastWatched - this is the actual watch timestamp
 * Do NOT use _mtime - that's just when the library item was modified (e.g., added to library)
 */
function getWatchDate(item) {
  if (item.state?.lastWatched) {
    const d = new Date(item.state.lastWatched)
    if (!isNaN(d.getTime())) return d
  }
  return null
}

/**
 * Check if item is actively being watched.
 * Uses two signals:
 * 1. State comparison: if watch state changed since last sync → still watching
 * 2. Time-based fallback (for first sync after restart): lastWatched within 7.5 min
 */
function isActivelyWatching(item, userId, now) {
  const watchDate = getWatchDate(item)
  if (!watchDate) return false

  const itemId = item._id || item.id
  const key = `${userId}:${itemId}`
  const currentHash = getWatchStateHash(item)
  const previousHash = previousWatchStates.get(key)

  // Always store the latest state for next comparison
  previousWatchStates.set(key, currentHash)

  if (previousHash !== undefined) {
    // We have a previous observation to compare against
    if (currentHash === previousHash) {
      // Watch state hasn't changed since last sync → user stopped
      return false
    }
    // State changed → user is still watching (as long as lastWatched is reasonably recent)
    return (now - watchDate.getTime()) < (CHECK_INTERVAL_MS * 3)
  }

  // First observation (after server restart): fall back to time-based check
  return (now - watchDate.getTime()) < (CHECK_INTERVAL_MS * 1.5)
}

/**
 * Process watch sessions for a user's library
 * Called during each 5-minute sync
 */
async function processUserSessions(prisma, accountId, userId, library, now = new Date()) {
  if (!library || !Array.isArray(library) || library.length === 0) {
    console.log(`[SessionTracker] No library items for user ${userId}`)
    return { sessionsCreated: 0, sessionsUpdated: 0, sessionsClosed: 0 }
  }

  console.log(`[SessionTracker] Processing ${library.length} library items for user ${userId}`)

  const accountIdValue = accountId || 'default'
  const nowMs = now.getTime()
  let sessionsCreated = 0
  let sessionsUpdated = 0
  let sessionsClosed = 0

  // Fetch user data once for webhook notifications
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, email: true, colorIndex: true, discordWebhookUrl: true }
  })

  // Get all active sessions for this user
  const activeSessions = await prisma.watchSession.findMany({
    where: {
      accountId: accountIdValue,
      userId,
      isActive: true
    }
  })

  // Create a map of active sessions by composite key: userId + itemId + videoId
  // This ensures we can have multiple active sessions for the same item (different episodes)
  // but prevents duplicates for the same user+item+videoId combination
  const activeSessionMap = new Map()
  const duplicateSessionsToClose = []

  // Helper to create composite key
  const getSessionKey = (session) => {
    return `${session.userId}:${session.itemId}:${session.videoId || 'null'}`
  }

  for (const session of activeSessions) {
    const key = getSessionKey(session)
    const existing = activeSessionMap.get(key)
    if (!existing) {
      activeSessionMap.set(key, session)
    } else {
      // Duplicate session for same user+item+videoId - keep the one with earliest startTime
      const existingTime = existing.startTime.getTime()
      const currentTime = session.startTime.getTime()
      if (currentTime < existingTime) {
        // Current session is older, replace existing
        duplicateSessionsToClose.push(existing)
        activeSessionMap.set(key, session)
      } else {
        // Existing session is older, mark current as duplicate
        duplicateSessionsToClose.push(session)
      }
    }
  }

  // Close duplicate sessions (keep only the oldest one per user+item+videoId)
  for (const duplicate of duplicateSessionsToClose) {
    const key = getSessionKey(duplicate)
    const keptSession = activeSessionMap.get(key)
    if (keptSession && keptSession.id !== duplicate.id) {
      await prisma.watchSession.update({
        where: { id: duplicate.id },
        data: {
          isActive: false,
          endTime: keptSession.startTime, // End when the kept session started
          durationSeconds: Math.max(0, Math.floor((keptSession.startTime.getTime() - duplicate.startTime.getTime()) / 1000))
        }
      })
      sessionsClosed++
    }
  }

  // Track which items are currently active
  const currentlyActiveItems = new Set()
  // Track last activity time per item from the library (lastWatched only)
  // NOTE: Do NOT use _mtime - that's modification time, not watch time
  const lastActivityByItemId = new Map()

  // Process each library item
  for (const item of library) {
    const itemId = item._id || item.id
    if (!itemId) continue

    // Check if item has watch progress or recent activity
    const state = item.state || {}

    // Consider item as having watch progress if:
    // 1. It has any time watched tracked
    // 2. It has a video_id (series with episode progress)
    // 3. It has a recent lastWatched (actively being watched)
    // NOTE: Do NOT use _mtime - that's just modification time, not watch time
    const hasTimeWatched = state.timeWatched > 0 || state.overallTimeWatched > 0 || state.timeOffset > 0
    const hasVideoId = !!state.video_id
    const watchDate = getWatchDate(item)
    const hasRecentActivity = watchDate && (nowMs - watchDate.getTime()) < (CHECK_INTERVAL_MS * 3)

    const hasWatchProgress = hasTimeWatched || hasVideoId || hasRecentActivity

    if (!hasWatchProgress) continue

    // Update last activity tracking (watchDate is already defined above)
    if (watchDate) {
      lastActivityByItemId.set(itemId, watchDate)
    }

    const isActive = isActivelyWatching(item, userId, nowMs)
    const videoId = item.type === 'series' ? state.video_id : null
    const { season, episode } = await extractSeasonEpisode(videoId)

    // Debug: log active items
    if (isActive) {
      const ageMinutes = watchDate ? Math.round((nowMs - watchDate.getTime()) / 60000) : 'unknown'
      console.log(`[SessionTracker] Active item: ${item.name} (${itemId}), age: ${ageMinutes}min, videoId: ${videoId}`)
    }

    if (isActive) {
      // Track active items by composite key (not just itemId) to prevent closing wrong sessions
      const sessionKey = `${userId}:${itemId}:${videoId || 'null'}`
      currentlyActiveItems.add(sessionKey)

      // Use composite key: userId + itemId + videoId for proper session matching
      const existingSession = activeSessionMap.get(sessionKey)

      if (existingSession) {
        // Same user+item+videoId - update existing session duration
        // Since we use composite key with videoId, different episodes create new sessions automatically
        const latestPingMs = (watchDate ? watchDate.getTime() : nowMs)
        const sessionDurationSeconds = Math.max(
          0,
          Math.floor((latestPingMs - existingSession.startTime.getTime()) / 1000)
        )

        // NEVER update startTime forward - only backward if we discover an earlier ping
        // This prevents resets when lastWatched gets updated to recent times
        const updateData = {
          durationSeconds: sessionDurationSeconds
        }

        // Update season/episode if they've changed (e.g., Kitsu API now returns correct season)
        // This fixes old sessions that were created with season=1
        if (season !== null && season !== existingSession.season) {
          updateData.season = season
        }
        if (episode !== null && episode !== existingSession.episode) {
          updateData.episode = episode
        }

        // Only update startTime if watchDate is at least 2 minutes earlier (conservative threshold)
        if (watchDate &&
          watchDate.getTime() < existingSession.startTime.getTime() &&
          (existingSession.startTime.getTime() - watchDate.getTime()) >= 120000) {
          updateData.startTime = watchDate
          console.log(`[SessionTracker] Correcting startTime backward for ${item.name}: ${existingSession.startTime.toISOString()} -> ${watchDate.toISOString()}`)
        }

        await prisma.watchSession.update({
          where: { id: existingSession.id },
          data: updateData
        })
        sessionsUpdated++
      } else {
        // No active session, create new one
        console.log(`[SessionTracker] Creating NEW session for ${item.name} (${itemId}), videoId: ${videoId}`)
        try {
          // Use watchDate if available and reasonable (not in the future), otherwise use now
          // Note: The early reactivation loop handles recently closed sessions,
          // so by the time we get here, we genuinely need a new session
          const sessionStartTime = watchDate && watchDate.getTime() <= nowMs ? watchDate : now

          const newSession = await prisma.watchSession.create({
            data: {
              accountId: accountIdValue,
              userId,
              itemId,
              videoId,
              itemName: item.name || 'Unknown',
              itemType: item.type || 'movie',
              season,
              episode,
              poster: item.poster,
              // Use the first observed watch timestamp (first "ping"), not the sync time
              startTime: sessionStartTime,
              isActive: true,
              durationSeconds: 0
            }
          })
          sessionsCreated++
          console.log(`[SessionTracker] Session created successfully`)
          
          // Send Discord webhook notification when session starts (now playing)
          if (user?.discordWebhookUrl) {
            await sendSessionStartNotification(user.discordWebhookUrl, newSession, user)
          }
        } catch (error) {
          // Ignore duplicate errors
          if (!error.message.includes('Unique constraint')) {
            console.warn(`[SessionTracker] Error creating session:`, error.message)
          }
        }
      }
    }
  }

  // Close sessions for items that are no longer active
  // Use composite key to ensure we only close the correct session (not all sessions for an itemId)
  for (const session of activeSessions) {
    const sessionKey = getSessionKey(session)
    if (!currentlyActiveItems.has(sessionKey)) {
      const lastActivity = lastActivityByItemId.get(session.itemId)
      const endTime = lastActivity || now
      // Calculate final duration based on last observed ping for that item
      const sessionDurationSeconds = Math.max(0, Math.floor((endTime.getTime() - session.startTime.getTime()) / 1000))

      await prisma.watchSession.update({
        where: { id: session.id },
        data: {
          isActive: false,
          endTime,
          durationSeconds: sessionDurationSeconds
        }
      })
      sessionsClosed++
    }
  }

  if (sessionsCreated > 0 || sessionsUpdated > 0 || sessionsClosed > 0) {
    console.log(`[SessionTracker] User ${userId}: Created ${sessionsCreated}, Updated ${sessionsUpdated}, Closed ${sessionsClosed}`)
  }
  return { sessionsCreated, sessionsUpdated, sessionsClosed }
}

/**
 * Process sessions for all users in an account
 */
async function processAccountSessions(prisma, accountId, users, getLibraryForUser, now = new Date()) {
  const accountIdValue = accountId || 'default'
  let totalCreated = 0
  let totalUpdated = 0
  let totalClosed = 0

  for (const user of users) {
    try {
      const library = await getLibraryForUser(user)
      if (library && Array.isArray(library) && library.length > 0) {
        const result = await processUserSessions(prisma, accountIdValue, user.id, library, now)
        totalCreated += result.sessionsCreated
        totalUpdated += result.sessionsUpdated
        totalClosed += result.sessionsClosed
      }
    } catch (error) {
      console.warn(`[SessionTracker] Error processing user ${user.id}:`, error.message)
    }
  }

  if (totalCreated > 0 || totalUpdated > 0 || totalClosed > 0) {
    console.log(`[SessionTracker] Account ${accountIdValue}: Created ${totalCreated}, Updated ${totalUpdated}, Closed ${totalClosed} sessions`)
  }

  return { totalCreated, totalUpdated, totalClosed }
}

/**
 * Get recent watch sessions for an account
 */
async function getRecentSessions(prisma, accountId, since, limit = 100) {
  const accountIdValue = accountId || 'default'

  return prisma.watchSession.findMany({
    where: {
      accountId: accountIdValue,
      startTime: {
        gte: since
      }
    },
    orderBy: {
      startTime: 'desc'
    },
    take: limit
  })
}

/**
 * Get active sessions (currently watching)
 */
async function getActiveSessions(prisma, accountId) {
  const accountIdValue = accountId || 'default'

  return prisma.watchSession.findMany({
    where: {
      accountId: accountIdValue,
      isActive: true
    },
    orderBy: {
      startTime: 'desc'
    }
  })
}

module.exports = {
  processUserSessions,
  processAccountSessions,
  getRecentSessions,
  getActiveSessions,
  extractSeasonEpisode
}
