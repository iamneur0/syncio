/**
 * Metrics Migration - Populate watchSessions and episodeWatchHistory from historical WatchActivity data
 * 
 * This runs at startup to backfill historical session data for v1.0.0+ features when upgrading from older versions.
 */

const { getCachedLibrary } = require('./libraryCache')
const { fetchMetadata } = require('./notify')

/**
 * Extract season/episode from video_id or item state
 */
function extractSeasonEpisode(item) {
  let season = item?.state?.season ?? null
  let episode = item?.state?.episode ?? null

  if (item?.state?.video_id) {
    const videoId = item.state.video_id
    const parts = videoId.split(':')

    if (videoId.startsWith('kitsu:') && parts.length >= 3) {
      const episodePart = parts[parts.length - 1]
      const parsedEpisode = parseInt(episodePart, 10)
      if (!isNaN(parsedEpisode)) {
        episode = parsedEpisode
      }
      season = 1
    } else if (parts.length >= 3 && parts[0].startsWith('tt')) {
      season = parseInt(parts[1], 10) || season
      episode = parseInt(parts[2], 10) || episode
    } else if (parts.length === 2 && parts[0].startsWith('tt')) {
      episode = parseInt(parts[1], 10) || episode
    }
  }

  return { season, episode }
}

/**
 * Get item metadata - first from cache, then from external API
 */
async function getItemMetadata(accountId, userId, itemId, itemType) {
  // Try library cache first
  const user = { id: userId }
  const library = getCachedLibrary(accountId, user)
  
  if (library && Array.isArray(library)) {
    const item = library.find(i => (i._id || i.id) === itemId)
    if (item) {
      const { season, episode } = extractSeasonEpisode(item)
      return {
        name: item.name || 'Unknown',
        poster: item.poster || null,
        season,
        episode,
        type: item.type
      }
    }
  }

  // Fallback: fetch from external API (Cinemeta)
  // Only for IMDb IDs (tt...)
  if (itemId && itemId.startsWith('tt')) {
    try {
      console.log(`[Migration] Fetching metadata for ${itemId}...`)
      const metadata = await fetchMetadata(itemId, itemType, null)
      console.log(`[Migration] Got metadata for ${itemId}:`, metadata ? { title: metadata.title, hasPoster: !!metadata.poster } : 'NULL')
      if (metadata) {
        return {
          name: metadata.title || itemId,
          poster: metadata.poster || null,
          season: metadata.season ?? null,
          episode: metadata.episode ?? null,
          type: itemType
        }
      }
    } catch (e) {
      console.log(`[Migration] Error fetching metadata for ${itemId}:`, e.message)
      // Ignore errors, will use fallback name
    }
  }

  // Final fallback: generate name from itemId
  return {
    name: generateNameFromId(itemId),
    poster: null,
    season: null,
    episode: null,
    type: itemType
  }
}

/**
 * Generate a readable name from an IMDb ID
 */
function generateNameFromId(itemId) {
  if (!itemId) return 'Unknown'
  
  // If it's a simple IMDb ID (tt0123456), return "Movie 123456" or "Show 123456"
  if (itemId.startsWith('tt') && /^\d+$/.test(itemId.slice(2))) {
    const num = itemId.slice(2)
    return `Movie ${num}`
  }
  
  // If it has season/episode (tt0123456:1:5), extract just the ID
  if (itemId.includes(':')) {
    const baseId = itemId.split(':')[0]
    if (baseId.startsWith('tt') && /^\d+$/.test(baseId.slice(2))) {
      const num = baseId.slice(2)
      return `Movie ${num}`
    }
  }

  // For other IDs, return as-is
  return itemId
}

/**
 * Get series metadata - try to extract base show ID for lookup
 */
async function getSeriesMetadata(accountId, userId, itemId) {
  // Try library cache first
  const user = { id: userId }
  const library = getCachedLibrary(accountId, user)

  if (library && Array.isArray(library)) {
    const baseItemId = itemId.split(':')[0]

    const item = library.find(i => (i._id || i.id) === baseItemId || (i._id || i.id)?.startsWith(baseItemId))
    if (item) {
      const { season, episode } = extractSeasonEpisode(item)

      return {
        showId: baseItemId,
        showName: item.name || 'Unknown',
        poster: item.poster || null,
        season,
        episode
      }
    }
  }

  // Fallback: try external API
  const baseItemId = itemId.split(':')[0]
  if (baseItemId.startsWith('tt')) {
    try {
      const metadata = await fetchMetadata(baseItemId, 'series', null)
      if (metadata) {
        return {
          showId: baseItemId,
          showName: metadata.title || baseItemId,
          poster: metadata.poster || null,
          season: metadata.season ?? 1,
          episode: metadata.episode ?? 1
        }
      }
    } catch (e) {
      // Ignore
    }
  }

  return {
    showId: baseItemId,
    showName: generateNameFromId(baseItemId),
    poster: null,
    season: 1,
    episode: 1
  }
}

/**
 * Run migration for a single account
 */
async function migrateAccountMetrics(prisma, accountId) {
  const accountIdValue = accountId || 'default'

  console.log(`[MetricsMigration] === Checking account ${accountIdValue} ===`)

  const [sessionCount, episodeCount, activityCount] = await Promise.all([
    prisma.watchSession.count({ where: { accountId: accountIdValue } }),
    prisma.episodeWatchHistory.count({ where: { accountId: accountIdValue } }),
    prisma.watchActivity.count({ where: { accountId: accountIdValue } })
  ])

  console.log(`[MetricsMigration] ${accountIdValue} - Sessions: ${sessionCount}, Episodes: ${episodeCount}, Activities: ${activityCount}`)

  if (activityCount === 0) {
    console.log(`[MetricsMigration] ${accountIdValue}: No WatchActivity data to migrate`)
    return { migrated: false, reason: 'no_activity_data' }
  }

  // Get all activities to determine what needs to be created
  const activities = await prisma.watchActivity.findMany({
    where: { accountId: accountIdValue },
    orderBy: { date: 'asc' }
  })

  // Calculate unique items from watch_activity that should have sessions
  // One session per user + item combination (not per date - that's too granular)
  const uniqueUserItems = new Set()
  activities.forEach(a => uniqueUserItems.add(`${a.userId}:${a.itemId}`))
  const neededSessions = uniqueUserItems.size

  console.log(`[MetricsMigration] ${accountIdValue}: Have ${sessionCount} sessions, need ${neededSessions} for historical data`)

  // Get existing sessions to avoid duplicates
  const existingSessions = await prisma.watchSession.findMany({
    where: { accountId: accountIdValue },
    select: { userId: true, itemId: true }
  })
  const existingSessionSet = new Set(existingSessions.map(s => `${s.userId}:${s.itemId}`))

  // Get existing episode keys to avoid duplicates
  const existingEpisodes = await prisma.episodeWatchHistory.findMany({
    where: { accountId: accountIdValue },
    select: { userId: true, videoId: true }
  })
  const existingEpisodeKeys = new Set(existingEpisodes.map(e => `${e.userId}:${e.videoId}`))

  // If we already have enough sessions, just update episodes if needed
  const needsMigration = sessionCount < neededSessions
  if (!needsMigration && episodeCount > 0) {
    console.log(`[MetricsMigration] ${accountIdValue}: Sessions and episodes already complete, skipping`)
    return { migrated: false, reason: 'already_complete' }
  }

  console.log(`[MetricsMigration] ${accountIdValue}: Starting migration of ${activityCount} activities...`)

  const userIds = [...new Set(activities.map(a => a.userId))]
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true, email: true, colorIndex: true }
  })
  const userMap = new Map(users.map(u => [u.id, u]))

  // Pre-fetch metadata for all unique items (from cache or API)
  const uniqueItems = [...new Set(activities.map(a => `${a.userId}:${a.itemId}`))]
  console.log(`[MetricsMigration] ${accountIdValue}: Fetching metadata for ${uniqueItems.length} unique items...`)
  
  const metadataCache = new Map()
  
  // First pass: get metadata for each unique user+item combination
  for (const uniqueKey of uniqueItems) {
    const [userId, itemId] = uniqueKey.split(':')
    const itemType = activities.find(a => a.userId === userId && a.itemId === itemId)?.itemType || 'movie'
    const metadata = await getItemMetadata(accountIdValue, userId, itemId, itemType)
    metadataCache.set(uniqueKey, metadata)
  }
  
  console.log(`[MetricsMigration] ${accountIdValue}: Metadata fetched, starting session creation...`)

  let sessionsCreated = 0
  let episodesCreated = 0

  const sessionsToCreate = []
  const episodesToCreate = []

  for (const activity of activities) {
    const user = userMap.get(activity.userId)
    const userInfo = user ? {
      id: user.id,
      username: user.username || user.email,
      email: user.email,
      colorIndex: user.colorIndex || 0
    } : {
      id: activity.userId,
      username: activity.userId,
      email: null,
      colorIndex: 0
    }

    const metadata = metadataCache.get(`${activity.userId}:${activity.itemId}`)
    console.log(`[Migration] Using metadata for ${activity.userId}:${activity.itemId}:`, { name: metadata?.name, hasPoster: !!metadata?.poster })
    
    const itemId = activity.itemId
    const isSeries = activity.itemType === 'series'

    // Session key includes date - one session per user+item+date
    // This properly distributes historical watch time across actual days
    const sessionKey = `${activity.userId}:${itemId}:${activity.date}`
    if (existingSessionSet.has(sessionKey)) {
      // Already have this session, skip
    } else {
      existingSessionSet.add(sessionKey)

      // Use the actual date from the activity
      const startTime = new Date(activity.date)
      startTime.setHours(Math.floor(Math.random() * 12) + 8, Math.floor(Math.random() * 60), 0, 0)

      // Use just this day's watch time, not cumulative
      const totalWatchTime = activity.watchTimeSeconds || 0
      
      const endTime = new Date(startTime.getTime() + (totalWatchTime * 1000))

      // Try to get better name from itemId (extract title from common ID patterns)
      let itemName = metadata?.name || activity.itemId
      if (itemName === activity.itemId && activity.itemId.startsWith('tt')) {
        // Extract numeric part as fallback
        const numPart = activity.itemId.match(/tt(\d+)/)?.[1]
        if (numPart) {
          itemName = `Movie ${numPart}`
        }
      }

      sessionsToCreate.push({
        accountId: accountIdValue,
        userId: activity.userId,
        itemId: itemId,
        videoId: isSeries ? `${itemId}:1:1` : null,
        itemName: itemName,
        itemType: activity.itemType,
        season: metadata?.season || null,
        episode: metadata?.episode || null,
        poster: metadata?.poster,
        startTime,
        endTime,
        durationSeconds: totalWatchTime,
        isActive: false
      })
      // DEBUG: Show what was just pushed
      const justPushed = sessionsToCreate[sessionsToCreate.length - 1]
      console.log(`[Migration] PUSHED session: itemName="${justPushed.itemName}" poster=${justPushed.poster ? 'HAS_VALUE' : 'NULL'}`)
      sessionsCreated++
    }

    // Create episodes for series - one per unique item (not per date)
    if (isSeries) {
      // Use metadata from cache (already fetched)
      const seriesMeta = metadata
      
      // Episode key without date - one episode entry per item
      const episodeKey = `${activity.userId}:${itemId}`
      if (!existingEpisodeKeys.has(episodeKey)) {
        // Get earliest and latest dates for this item
        const itemActivities = activities.filter(a => a.userId === activity.userId && a.itemId === itemId)
        const earliestDate = itemActivities.reduce((min, a) => a.date < min ? a.date : min, itemActivities[0].date)
        const latestDate = itemActivities.reduce((max, a) => a.date > max ? a.date : max, itemActivities[0].date)
        
        const videoId = `${itemId}:${seriesMeta?.season || 1}:${seriesMeta?.episode || 1}`

        episodesToCreate.push({
          accountId: accountIdValue,
          userId: activity.userId,
          showId: seriesMeta?.showId || itemId.split(':')[0],
          showName: seriesMeta?.showName || activity.itemId,
          videoId,
          season: seriesMeta?.season || 1,
          episode: seriesMeta?.episode || 1,
          poster: seriesMeta?.poster,
          watchedAt: latestDate // Use latest date as the watchedAt
        })
        existingEpisodeKeys.add(episodeKey)
        episodesCreated++
      }
    }
  }

  if (sessionsToCreate.length > 0) {
    console.log(`[MetricsMigration] ${accountIdValue}: Creating ${sessionsToCreate.length} sessions...`)
    
    for (const session of sessionsToCreate) {
      try {
        console.log(`[Migration] Upserting session:`, { itemId: session.itemId, name: session.itemName, poster: session.poster ? 'YES' : 'no' })
        await prisma.watchSession.upsert({
          where: {
            accountId_userId_itemId: {
              accountId: session.accountId,
              userId: session.userId,
              itemId: session.itemId
            }
          },
          create: session,
          update: {
            itemName: session.itemName,
            poster: session.poster,
            itemType: session.itemType,
            season: session.season,
            episode: session.episode,
            videoId: session.videoId,
            startTime: session.startTime,
            endTime: session.endTime,
            durationSeconds: session.durationSeconds,
            isActive: false
          }
        })
      } catch (error) {
        // Ignore errors - session might already exist
      }
    }
  }

  if (episodesToCreate.length > 0) {
    console.log(`[MetricsMigration] ${accountIdValue}: Creating ${episodesToCreate.length} episodes...`)
    
    for (const episode of episodesToCreate) {
      try {
        await prisma.episodeWatchHistory.upsert({
          where: {
            accountId_userId_videoId: {
              accountId: episode.accountId,
              userId: episode.userId,
              videoId: episode.videoId
            }
          },
          create: episode,
          update: {
            watchedAt: episode.watchedAt,
            showName: episode.showName,
            poster: episode.poster
          }
        })
      } catch (error) {
        if (!error.message.includes('Unique constraint')) {
          console.warn(`[MetricsMigration] Error creating episode:`, error.message)
        }
      }
    }
  }

  console.log(`[MetricsMigration] ${accountIdValue}: Migration complete - ${sessionsCreated} sessions, ${episodesCreated} episodes`)

  return {
    migrated: true,
    sessionsCreated,
    episodesCreated
  }
}

/**
 * Main migration function - runs at startup
 */
async function runMetricsMigration(prisma, decrypt, getAccountId, INSTANCE_TYPE) {
  console.log('[MetricsMigration] Starting metrics migration...')

  try {
    // Get account ID - handle both public and private modes
    let accountId
    if (INSTANCE_TYPE === 'public') {
      const accounts = await prisma.appAccount.findMany({
        select: { id: true }
      })
      console.log(`[MetricsMigration] Found ${accounts.length} accounts to check`)

      let totalMigrated = 0
      for (const account of accounts) {
        console.log(`[MetricsMigration] Checking account: ${account.id}`)
        const result = await migrateAccountMetrics(prisma, account.id)
        if (result.migrated) {
          totalMigrated++
        }
      }
      console.log(`[MetricsMigration] Completed - migrated ${totalMigrated} accounts`)
    } else {
      accountId = process.env.DEFAULT_ACCOUNT_ID || 'default'
      console.log(`[MetricsMigration] Private mode - using account: ${accountId}`)
      await migrateAccountMetrics(prisma, accountId)
      console.log('[MetricsMigration] Completed for private instance')
    }
  } catch (error) {
    console.error('[MetricsMigration] Migration failed:', error.message)
    console.error('[MetricsMigration] Stack:', error.stack)
  }
}

module.exports = {
  runMetricsMigration,
  migrateAccountMetrics
}