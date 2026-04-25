// Shared metrics builder used by both /users/metrics and /ext/metrics.json
// Consumes cached libraries (from activityMonitor + libraryCache) and only
// falls back to Stremio API when cache is missing.

const { StremioAPIClient } = require('stremio-api-client')
const { getCachedLibrary, setCachedLibrary } = require('./libraryCache')
const { fetchKitsuMetadata } = require('./kitsuUtils')
const { enrichPostersFromCinemeta } = require('./libraryHelpers')
const { calculateAddonAnalytics, calculateServerHealth, generateOperationalAlerts } = require('./adminAnalytics')
const { calculateTopItemsWithUsers, calculateWatchVelocity, calculateInterestingMetrics } = require('./enhancedMetrics')

// Helper function to extract base item ID (for series, strip season/episode info)
function getBaseItemId(itemId, itemType) {
  if (itemType === 'series') {
    // For series, itemId may include season:episode (e.g., "tt123:1:5" or "kitsu:123:1")
    // Return just the base ID
    const parts = itemId.split(':')
    if (parts[0] === 'kitsu') {
      // Kitsu format: "kitsu:123:1" -> return "kitsu:123"
      return parts.slice(0, 2).join(':')
    } else {
      // Standard format: "tt123:1:5" -> return "tt123"
      return parts[0]
    }
  }
  // For movies, itemId is already the base ID
  return itemId
}

// Admin Analytics Helpers

/**
 * Calculate user lifecycle metrics including retention and at-risk users
 */
async function calculateUserLifecycle(prisma, accountId, allUsers, watchActivityByUser) {
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

  // Get last activity date for each user from watch activity (like old syncio)
  const lastActivityDates = await prisma.watchActivity.groupBy({
    by: ['userId'],
    where: {
      accountId: accountId || 'default'
    },
    _max: {
      date: true
    }
  })

  const lastActivityMap = new Map()
  lastActivityDates.forEach(item => {
    lastActivityMap.set(item.userId, item._max.date)
  })

  // Calculate retention cohorts
  let active7d = 0
  let active30d = 0
  let active90d = 0

  // Track at-risk users
  const atRiskUsers = []
  const criticalRiskUsers = []

  allUsers.forEach(user => {
    const lastActivity = lastActivityMap.get(user.id)
    
    if (lastActivity) {
      if (lastActivity >= sevenDaysAgo) active7d++
      if (lastActivity >= thirtyDaysAgo) active30d++
      if (lastActivity >= ninetyDaysAgo) active90d++

      const daysSinceActivity = Math.floor((now - lastActivity) / (1000 * 60 * 60 * 24))
      const totalWatchTime = watchActivityByUser[user.id]?.watchTime || 0

      const userData = {
        id: user.id,
        username: user.username,
        email: user.email,
        lastActivity: lastActivity.toISOString(),
        daysInactive: daysSinceActivity,
        totalWatchTimeHours: Math.round((totalWatchTime / 3600) * 100) / 100
      }

      if (daysSinceActivity >= 60) {
        criticalRiskUsers.push(userData)
      } else if (daysSinceActivity >= 30) {
        atRiskUsers.push(userData)
      }
    } else {
      // Never watched anything - check join date
      const daysSinceJoin = Math.floor((now - new Date(user.createdAt)) / (1000 * 60 * 60 * 24))
      if (daysSinceJoin >= 30) {
        atRiskUsers.push({
          id: user.id,
          username: user.username,
          email: user.email,
          lastActivity: null,
          daysInactive: daysSinceJoin,
          totalWatchTimeHours: 0,
          neverWatched: true
        })
      }
    }
  })

  return {
    retention: {
      total: allUsers.length,
      active7d,
      active30d,
      active90d,
      rate7d: allUsers.length > 0 ? Math.round((active7d / allUsers.length) * 100) : 0,
      rate30d: allUsers.length > 0 ? Math.round((active30d / allUsers.length) * 100) : 0,
      rate90d: allUsers.length > 0 ? Math.round((active90d / allUsers.length) * 100) : 0
    },
    atRisk: atRiskUsers.sort((a, b) => b.daysInactive - a.daysInactive),
    criticalRisk: criticalRiskUsers.sort((a, b) => b.daysInactive - a.daysInactive)
  }
}

/**
 * Calculate completion-weighted top content
 */
async function calculateTopContent(watchSessions) {
  const contentStats = new Map()
  
  // Process watch sessions to build content stats
  watchSessions.forEach(session => {
    const itemId = session.item.id
    const itemType = session.item.type
    
    if (!contentStats.has(itemId)) {
      contentStats.set(itemId, {
        id: itemId,
        name: session.item.name,
        type: itemType,
        poster: session.item.poster,
        totalWatchTime: 0,
        uniqueViewers: new Set(),
        completionCount: 0,
        totalSessions: 0,
        recentVelocity: 0
      })
    }
    
    const stats = contentStats.get(itemId)
    stats.totalWatchTime += session.durationSeconds || 0
    stats.uniqueViewers.add(session.user.id)
    stats.totalSessions++
    
    if (session.endTime && session.durationSeconds > 1800) {
      stats.completionCount++
    }
    
    const sessionDate = new Date(session.startTime)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    if (sessionDate >= sevenDaysAgo) {
      stats.recentVelocity++
    }
  })

  const scoredContent = Array.from(contentStats.values()).map(content => {
    const watchCount = content.uniqueViewers.size
    const completionRate = content.totalSessions > 0 ? content.completionCount / content.totalSessions : 0
    const watchVelocity = content.recentVelocity / Math.max(watchCount, 1)
    const score = (completionRate * 0.6) + (Math.min(watchVelocity / 5, 1) * 0.4)
    
    return {
      ...content,
      watchCount,
      uniqueViewers: Array.from(content.uniqueViewers),
      completionRate: Math.round(completionRate * 100),
      avgWatchTimeMinutes: Math.round((content.totalWatchTime / content.totalSessions) / 60),
      score: Math.round(score * 100) / 100
    }
  })

  const sorted = scoredContent.sort((a, b) => b.score - a.score)
  
  // Get top 30 items for poster enrichment (covers movies + series + trending overlap)
  const topItems = sorted.slice(0, 30)
  
  // Convert to format expected by enrichPostersFromCinemeta
  const itemsForEnrichment = topItems.map(item => ({
    _id: item.id,
    id: item.id,
    type: item.type,
    poster: item.poster
  }))
  
  // Enrich missing posters from Cinemeta
  await enrichPostersFromCinemeta(itemsForEnrichment, { timeout: 5000, requestTimeout: 1500 })
  
  // Update posters in sorted results
  const enrichedContent = sorted.map(item => {
    const enriched = itemsForEnrichment.find(e => e.id === item.id)
    if (enriched && enriched.poster && !item.poster) {
      return { ...item, poster: enriched.poster }
    }
    return item
  })
  
  return {
    movies: enrichedContent.filter(c => c.type === 'movie').slice(0, 10),
    series: enrichedContent.filter(c => c.type === 'series').slice(0, 10),
    trending: enrichedContent
      .filter(c => c.recentVelocity > 0)
      .sort((a, b) => b.recentVelocity - a.recentVelocity)
      .slice(0, 10)
  }
}

/**
 * Calculate engagement heatmap and session stats
 */
async function calculateEngagementMetrics(watchSessions) {
  const hourlyActivity = new Array(24).fill(0).map((_, hour) => ({
    hour,
    watchTimeMinutes: 0,
    sessions: 0
  }))

  let totalSessionDuration = 0
  let bingeSessions = 0
  let sessionCount = 0
  const sessionEpisodes = new Map()

  watchSessions.forEach(session => {
    const hour = new Date(session.startTime).getHours()
    const duration = session.durationSeconds || 0

    hourlyActivity[hour].watchTimeMinutes += duration / 60
    hourlyActivity[hour].sessions++
    totalSessionDuration += duration
    sessionCount++

    const sessionKey = `${session.user.id}:${session.item.id}:${session.startTime?.split('T')[0]}`
    if (!sessionEpisodes.has(sessionKey)) {
      sessionEpisodes.set(sessionKey, new Set())
    }
    if (session.item.episode) {
      sessionEpisodes.get(sessionKey).add(session.item.episode)
    }
  })

  sessionEpisodes.forEach(episodes => {
    if (episodes.size >= 3) {
      bingeSessions++
    }
  })

  const avgSessionMinutes = sessionCount > 0 
    ? Math.round((totalSessionDuration / sessionCount) / 60) 
    : 0

  return {
    hourlyActivity: hourlyActivity.map(h => ({
      hour: h.hour,
      watchTimeMinutes: Math.round(h.watchTimeMinutes * 10) / 10,
      sessions: h.sessions
    })),
    averageSessionMinutes: avgSessionMinutes,
    totalSessions: sessionCount,
    bingeSessions,
    peakHour: hourlyActivity.reduce((max, curr, idx) => 
      curr.sessions > hourlyActivity[max].sessions ? idx : max, 0
    )
  }
}

/**
 * Generate admin alerts based on metrics
 */
function generateAlerts(userLifecycle, topContent, engagement, period) {
  const critical = []
  const warnings = []

  if (userLifecycle.criticalRisk.length > 0) {
    critical.push({
      type: 'inactive_users_critical',
      message: `${userLifecycle.criticalRisk.length} users haven't watched anything in 60+ days`,
      count: userLifecycle.criticalRisk.length,
      users: userLifecycle.criticalRisk.slice(0, 5).map(u => u.username),
      severity: 'critical'
    })
  }

  if (userLifecycle.atRisk.length > 0) {
    warnings.push({
      type: 'inactive_users_warning',
      message: `${userLifecycle.atRisk.length} users inactive for 30+ days`,
      count: userLifecycle.atRisk.length,
      severity: 'warning'
    })
  }

  if (userLifecycle.retention.rate30d < 30) {
    warnings.push({
      type: 'low_retention',
      message: `30-day retention rate is only ${userLifecycle.retention.rate30d}%`,
      severity: 'warning'
    })
  }

  if (topContent.trending.length === 0 && period !== '1h' && period !== '12h') {
    warnings.push({
      type: 'no_trending_content',
      message: 'No content trending in the last 7 days',
      severity: 'warning'
    })
  }

  if (engagement.totalSessions === 0 && period !== '1h') {
    warnings.push({
      type: 'no_activity',
      message: 'No watch activity in the selected period',
      severity: 'warning'
    })
  }

  return {
    critical,
    warnings,
    total: critical.length + warnings.length,
    hasCritical: critical.length > 0
  }
}

/**
 * Build metrics for a given account and period.
 *
 * @param {object} params
 * @param {import('@prisma/client').PrismaClient} params.prisma
 * @param {string} params.accountId
 * @param {string} params.period - '7d' | '30d' | '90d' | '1y' | 'all'
 * @param {Function} params.decrypt - decrypt(stremioAuthKey, reqLike)
 * @returns {Promise<object>} metrics payload compatible with /users/metrics response
 */
async function buildMetricsForAccount({ prisma, accountId, period = '30d', decrypt }) {
  if (!accountId) {
    throw new Error('accountId is required to build metrics')
  }

  // Calculate date range based on period
  let startDate = new Date()
  switch (period) {
    case '1h':
      startDate.setHours(startDate.getHours() - 1)
      break
    case '12h':
      startDate.setHours(startDate.getHours() - 12)
      break
    case '1d':
      startDate.setDate(startDate.getDate() - 1)
      break
    case '3d':
      startDate.setDate(startDate.getDate() - 3)
      break
    case '7d':
      startDate.setDate(startDate.getDate() - 7)
      break
    case '30d':
      startDate.setDate(startDate.getDate() - 30)
      break
    case '90d':
      startDate.setDate(startDate.getDate() - 90)
      break
    case '1y':
      startDate.setFullYear(startDate.getFullYear() - 1)
      break
    case 'all':
      startDate = new Date(0)
      break
    default:
      startDate.setDate(startDate.getDate() - 30)
  }

  // Get all users for this account
  const allUsers = await prisma.user.findMany({
    where: { accountId },
    select: {
      id: true,
      username: true,
      email: true,
      createdAt: true,
      isActive: true,
      stremioAuthKey: true,
      inviteCode: true,
      colorIndex: true
    },
    orderBy: { createdAt: 'asc' }
  })

  // User joins
  const userJoinsByDay = {}
  const userJoinsByWeek = {}
  const userJoinsByMonth = {}

  allUsers.forEach(user => {
    const date = new Date(user.createdAt)
    if (period !== 'all' && date < startDate) return

    const dayKey = date.toISOString().split('T')[0]
    userJoinsByDay[dayKey] = (userJoinsByDay[dayKey] || 0) + 1

    const weekStart = new Date(date)
    weekStart.setDate(date.getDate() - date.getDay())
    const weekNum = Math.ceil((weekStart.getDate() + 6) / 7)
    const weekKey = `${weekStart.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
    userJoinsByWeek[weekKey] = (userJoinsByWeek[weekKey] || 0) + 1

    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    userJoinsByMonth[monthKey] = (userJoinsByMonth[monthKey] || 0) + 1
  })

  // Watch activity & time from WatchActivity table (accurate daily deltas)
  // We include all active users, even if they don't have a Stremio auth key,
  // because they might have library-email.json files.
  const activeUsers = allUsers.filter(u => u.isActive)
  const watchActivityByDay = {}
  const watchActivityByUser = {}
  const watchTimeByDay = {}
  const watchActivityByDayPerUser = {}
  const watchTimeByItem = {} // Track watch time per itemId
  let totalMovies = 0
  let totalShows = 0
  let totalWatchTime = 0

  // Try to use WatchActivity first (accurate daily deltas)
  const accountIdValue = accountId || 'default'
  const startDateStr = startDate.toISOString().split('T')[0]

  // Track if we have any WatchActivity data
  let hasWatchActivityData = false
  let earliestWatchActivityDate = null
  let earliestSnapshotDate = null

  // Find the earliest snapshot date to know when we started tracking
  try {
    const earliestSnapshot = await prisma.watchSnapshot.findFirst({
      where: {
        accountId: accountIdValue
      },
      select: {
        date: true
      },
      orderBy: {
        date: 'asc'
      }
    })
    if (earliestSnapshot) {
      earliestSnapshotDate = earliestSnapshot.date
    }
  } catch (error) {
    console.warn(`[Metrics] Error fetching earliest snapshot:`, error.message)
  }

  // Track DB activity to avoid double counting in fallback
  const dbActivityKeys = new Set() 
  let watchActivities = []

  try {
    // For short periods (1h, 12h, 24h, 1d, 3d), filter by createdAt timestamp, not just date
    // For longer periods, date filtering is sufficient
    const useTimestampFilter = period === '1h' || period === '12h' || period === '24h' || period === '1d' || period === '3d'

    const whereClause = {
      accountId: accountIdValue
    }

    if (useTimestampFilter) {
      // Filter by createdAt timestamp for accurate short-period filtering
      whereClause.createdAt = {
        gte: startDate
      }
    } else {
      // Filter by date field for longer periods
      whereClause.date = {
        gte: new Date(startDateStr)
      }
    }

    watchActivities = await prisma.watchActivity.findMany({
      where: whereClause,
      select: {
        userId: true,
        itemId: true,
        date: true,
        createdAt: true,
        watchTimeSeconds: true,
        itemType: true
      },
      orderBy: { date: 'asc' }
    })

    hasWatchActivityData = watchActivities.length > 0
    if (hasWatchActivityData) {
      earliestWatchActivityDate = watchActivities[0].date
    }

    // Use earliest snapshot date if available (either as the start date, or if earlier than WatchActivity)
    if (earliestSnapshotDate) {
      if (!earliestWatchActivityDate || earliestSnapshotDate < earliestWatchActivityDate) {
        earliestWatchActivityDate = earliestSnapshotDate
      }
    }

    // Process WatchActivity data
    const userItemSet = new Set() // Track unique user+item combinations for counting
    const userItemByDay = new Map() // Track unique items per day per user
    const userMap = new Map(allUsers.map(u => [u.id, u]))

    for (const activity of watchActivities) {
      const userId = activity.userId
      
      // Only include activity for users that currently exist in the database
      const dbUser = userMap.get(userId)
      if (!dbUser) continue

      const itemId = activity.itemId
      const date = activity.date.toISOString().split('T')[0]
      let watchTime = activity.watchTimeSeconds || 0
      const itemType = activity.itemType

      // Track that we have DB data for this user+item+date
      dbActivityKeys.add(`${userId}:${itemId}:${date}`)

      // For "1h" period, cap watch time at 1 hour (3600 seconds) per activity
      // This prevents showing more than 1 hour when activities span longer periods
      if (period === '1h' && watchTime > 3600) {
        watchTime = 3600
      }

      // Initialize user data
      if (!watchActivityByUser[userId]) {
        watchActivityByUser[userId] = {
          id: userId,
          username: dbUser.username || dbUser.email || userId,
          movies: 0,
          shows: 0,
          total: 0,
          watchTime: 0,
          watchTimeMovies: 0,
          watchTimeShows: 0
        }
      }
      if (!watchActivityByDayPerUser[userId]) {
        watchActivityByDayPerUser[userId] = {}
      }
      if (!watchActivityByDayPerUser[userId][date]) {
        watchActivityByDayPerUser[userId][date] = { movies: 0, shows: 0, total: 0 }
      }
      if (!watchActivityByDay[date]) {
        watchActivityByDay[date] = { movies: 0, shows: 0, total: 0 }
      }
      if (!watchTimeByDay[date]) {
        watchTimeByDay[date] = 0
      }

      // Only count items and watch time if the date is on or after the earliest tracking date
      const activityDateStr = date
      const shouldCount = !earliestWatchActivityDate || activityDateStr >= earliestWatchActivityDate.toISOString().split('T')[0]

      if (shouldCount) {
        // Track unique items (count once per user, not per day)
        // Use base item ID to count unique series/movies, not episodes
        const baseItemId = getBaseItemId(itemId, itemType)
        const userItemKey = `${userId}:${baseItemId}`
        if (!userItemSet.has(userItemKey)) {
          userItemSet.add(userItemKey)
          if (itemType === 'movie') {
            watchActivityByUser[userId].movies++
            totalMovies++
          } else if (itemType === 'series') {
            watchActivityByUser[userId].shows++
            totalShows++
          }
          watchActivityByUser[userId].total++
        }

        // Accumulate watch time
        watchActivityByUser[userId].watchTime += watchTime
        watchTimeByDay[date] += watchTime
        totalWatchTime += watchTime

        if (itemType === 'movie') {
          watchActivityByUser[userId].watchTimeMovies += watchTime
        } else if (itemType === 'series') {
          watchActivityByUser[userId].watchTimeShows += watchTime
        }

        // Track watch time per itemId
        if (!watchTimeByItem[itemId]) {
          watchTimeByItem[itemId] = {
            itemId,
            itemType,
            watchTimeSeconds: 0,
            watchTimeHours: 0
          }
        }
        watchTimeByItem[itemId].watchTimeSeconds += watchTime
      }

      // Track unique items per day (for daily activity counts)
      // Use base item ID to count unique series/movies per day, not episodes
      const baseItemId = getBaseItemId(itemId, itemType)
      const dayUserItemKey = `${date}:${userId}:${baseItemId}`
      if (!userItemByDay.has(dayUserItemKey)) {
        userItemByDay.set(dayUserItemKey, true)
        if (itemType === 'movie') {
          watchActivityByDay[date].movies++
          watchActivityByDayPerUser[userId][date].movies++
        } else if (itemType === 'series') {
          watchActivityByDay[date].shows++
          watchActivityByDayPerUser[userId][date].shows++
        }
        watchActivityByDay[date].total++
        watchActivityByDayPerUser[userId][date].total++
      }
    }
  } catch (error) {
    console.warn(`[Metrics] Error fetching WatchActivity:`, error.message)
    // No fallback - metrics require accurate DB data for time-based calculations
  }

  // Note: Library JSON fallback has been removed from metrics calculation
  // Metrics now rely exclusively on WatchActivity table data for accurate time-based tracking
  // The activityMonitor syncs library data to DB every 5 minutes
  // This provides accurate per-day, per-episode, per-session tracking
  const shouldUseFallback = false

  const userJoinsChart = Object.entries(userJoinsByDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count: Number(count) }))

  // Filter watchActivityChart to only include dates where we have actual WatchActivity data
  // OR if using fallback, allow older dates
  const watchActivityChart = Object.entries(watchActivityByDay)
    .filter(([date]) => {
      // If fallback is enabled, show all dates that are within the requested period
      if (shouldUseFallback) {
        // If period is 'all', show everything. Otherwise check start date.
        if (period === 'all') return true
        return date >= startDate.toISOString().split('T')[0]
      }
      
      // If fallback disabled, respect earliest snapshot/activity date
      if (earliestWatchActivityDate) {
        return date >= earliestWatchActivityDate.toISOString().split('T')[0]
      }
      return true
    })
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({
      date,
      movies: data.movies,
      shows: data.shows,
      total: data.total
    }))





  const watchActivityByUserByDayCharts = Object.fromEntries(
    Object.entries(watchActivityByDayPerUser).map(([userId, days]) => {
      const series = Object.entries(days)
        .filter(([date]) => {
          // If fallback is enabled, show all dates that are within the requested period
          if (shouldUseFallback) {
            if (period === 'all') return true
            return date >= startDate.toISOString().split('T')[0]
          }

          // If fallback disabled, respect earliest snapshot/activity date
          if (earliestWatchActivityDate) {
            return date >= earliestWatchActivityDate.toISOString().split('T')[0]
          }
          return true
        })
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, data]) => ({
          date,
          movies: data.movies,
          shows: data.shows,
          total: data.total
        }))
      return [userId, series]
    })
  )

  // Convert watchTimeByItem to array and calculate hours
  const watchTimeByItemArray = Object.values(watchTimeByItem)
    .map(item => ({
      ...item,
      watchTimeHours: Math.round((item.watchTimeSeconds / 3600) * 100) / 100
    }))
    .sort((a, b) => b.watchTimeSeconds - a.watchTimeSeconds) // Sort by watch time descending

  // Calculate "Now Playing" - users watching recently
  // Use a 7.5-minute window (1.5x interval) to match session tracker logic
  // This ensures we catch active watchers even if there's sync delay
  let nowPlaying = []
  const startedPlaying = []

  // Helper function to get watch date (same logic as activityMonitor)
  // IMPORTANT: Only use state.lastWatched - this is the actual watch timestamp
  // Do NOT use _mtime - that's just when the library item was modified (e.g., added to library)
  function getWatchDate(item) {
    if (item.state?.lastWatched) {
      const d = new Date(item.state.lastWatched)
      if (!isNaN(d.getTime())) return d
    }
    return null
  }

  function isActuallyWatched(item) {
    const state = item.state || {}
    if (state.timeWatched > 0 || state.overallTimeWatched > 0) {
      return true
    }
    if (state.video_id && state.video_id.trim() !== '') {
      return true
    }
    return false
  }


  // Helper function to extract season/episode info from an item
  async function extractSeasonEpisode(item) {
    let season = item.state?.season
    let episode = item.state?.episode

    if (item.state?.video_id) {
      const videoId = item.state.video_id
      const videoIdParts = videoId.split(':')

      // Handle Kitsu IDs: format "kitsu:46676:1" -> episode = last segment, season from Kitsu API title
      if (videoId.startsWith('kitsu:') && videoIdParts.length >= 3) {
        const kitsuId = videoIdParts[1] // e.g., "46676" or "12"
        const episodePart = videoIdParts[videoIdParts.length - 1]
        const parsedEpisode = parseInt(episodePart, 10)

        // Always extract episode from video_id for Kitsu items (override state value)
        if (!isNaN(parsedEpisode)) {
          episode = parsedEpisode
        }

        // Fetch season from Kitsu API if not already set to a valid value (> 0)
        if ((season === undefined || season === null || season === 0) && kitsuId) {
          try {
            const kitsuData = await fetchKitsuMetadata(kitsuId)
            if (kitsuData && kitsuData.season !== null) {
              season = kitsuData.season
            } else {
              // Default to 1 if Kitsu API doesn't return a season (common for anime without explicit season numbers)
              season = 1
            }
          } catch (error) {
            console.warn(`[MetricsBuilder] Failed to fetch Kitsu metadata for ID ${kitsuId}:`, error.message)
            // Default to 1 if API call fails
            season = 1
          }
        } else if (season === undefined || season === null || season === 0) {
          // If no kitsuId but it's a kitsu video_id, default season to 1
          season = 1
        }
      }
      // Handle standard IMDb format: "tt8080122:4:6" (season 4, episode 6)
      else if (videoIdParts.length >= 3 && videoIdParts[0].startsWith('tt')) {
        season = parseInt(videoIdParts[1], 10) || season
        episode = parseInt(videoIdParts[2], 10) || episode
      }
      // Handle format: "tt8080122:6" (episode 6 only, no season or season 0)
      else if (videoIdParts.length === 2 && videoIdParts[0].startsWith('tt')) {
        episode = parseInt(videoIdParts[1], 10) || episode
        if (season === undefined) season = 0
      }
    }

    return { season, episode }
  }

  const now = Date.now()

  // "Now Playing" is driven exclusively by active DB sessions (isActive=true).
  // The session tracker manages session lifecycle: creates on activity, closes when stopped.
  // No library cache fallback - library JSON should not drive UI state.
  let activeSessionsFromDb = []
  try {
    activeSessionsFromDb = await prisma.watchSession.findMany({
      where: {
        accountId: accountIdValue || 'default',
        isActive: true
      },
      orderBy: { startTime: 'desc' }
    })
  } catch (error) {
    console.warn('[MetricsBuilder] Failed to fetch active sessions from database:', error.message)
  }

  // Build nowPlaying from active DB sessions
  const userMap = new Map(activeUsers.map(u => [u.id, u]))
  for (const session of activeSessionsFromDb) {
    const user = userMap.get(session.userId)
    if (!user) continue

    nowPlaying.push({
      user: {
        id: user.id,
        username: user.username || user.email,
        email: user.email,
        colorIndex: user.colorIndex || 0
      },
      item: {
        id: session.itemId,
        name: session.itemName,
        type: session.itemType,
        year: null,
        poster: session.poster,
        season: session.season,
        episode: session.episode
      },
      videoId: session.videoId ?? null,
      watchedAt: session.startTime.toISOString(),
      watchedAtTimestamp: session.startTime.getTime()
    })
  }

  // Build startedPlaying from library cache (for period-based metrics, not UI display)
  const periodStartTime = startDate.getTime()
  for (const user of activeUsers) {
    try {
      const library = getCachedLibrary(accountIdValue, user)
      if (!Array.isArray(library) || library.length === 0) continue

      for (const item of library) {
        if (!isActuallyWatched(item)) continue

        const watchDate = getWatchDate(item)
        if (!watchDate) continue

        const watchTime = watchDate.getTime()

        if (watchTime >= periodStartTime) {
          const { season, episode } = await extractSeasonEpisode(item)
          startedPlaying.push({
            user: {
              id: user.id,
              username: user.username || user.email,
              email: user.email,
              colorIndex: user.colorIndex || 0
            },
            item: {
              id: item._id || item.id,
              name: item.name,
              type: item.type,
              year: item.year,
              poster: item.poster,
              season: season,
              episode: episode
            },
            startedAt: new Date(watchTime).toISOString(),
            startedAtTimestamp: watchTime
          })
        }
      }
    } catch (error) {
      // Skip users with errors
      continue
    }
  }

  // Synthesize sessions and episodes from library fallback data
  // This allows the Activity page to show history even if it's not in the DB yet
  let synthesizedSessions = []
  let synthesizedEpisodes = []
  
  if (shouldUseFallback) {
    for (const user of activeUsers) {
      const library = getCachedLibrary(accountIdValue, user)
      if (!Array.isArray(library)) continue
      
      for (const item of library) {
        if (!isActuallyWatched(item)) continue
        const watchDate = getWatchDate(item)
        if (!watchDate) continue
        
        // Respect period filter
        if (period !== 'all' && watchDate < startDate) continue
        
        const { season, episode } = await extractSeasonEpisode(item) // Use await here inside loop is okay for now, or optimize
        
        // Create synthetic session
        synthesizedSessions.push({
          id: `synth-${user.id}-${item._id}-${watchDate.getTime()}`,
          user: {
            id: user.id,
            username: user.username || user.email,
            email: user.email,
            colorIndex: user.colorIndex || 0
          },
          item: {
            id: item._id || item.id,
            name: item.name,
            type: item.type,
            poster: item.poster,
            season: season,
            episode: episode
          },
          videoId: item.state?.video_id || null,
          startTime: watchDate.toISOString(),
          endTime: null, // Unknown end time for historical items
          durationSeconds: (item.state?.overallTimeWatched || item.state?.timeWatched) ? Math.round((item.state.overallTimeWatched || item.state.timeWatched) / 1000) : 0,
          isActive: false,
          startTimeTimestamp: watchDate.getTime(),
          updatedAtTimestamp: watchDate.getTime(),
          isSynthetic: true
        })

        // Create synthetic episode (for series only)
        if (item.type === 'series') {
            synthesizedEpisodes.push({
                user: {
                    id: user.id,
                    username: user.username || user.email,
                    email: user.email,
                    colorIndex: user.colorIndex || 0
                },
                item: {
                    id: item._id || item.id,
                    name: item.name,
                    type: 'series',
                    poster: item.poster,
                    season: season,
                    episode: episode
                },
                videoId: item.state?.video_id || null,
                watchedAt: watchDate.toISOString(),
                watchedAtTimestamp: watchDate.getTime(),
                isSynthetic: true
            })
        }
      }
    }
  }

  // Sort by most recent first (legacy library-derived nowPlaying)
  nowPlaying.sort((a, b) => b.watchedAtTimestamp - a.watchedAtTimestamp)
  startedPlaying.sort((a, b) => b.startedAtTimestamp - a.startedAtTimestamp)

  // Fetch episode watch history from database
  // This provides episode-level granularity that Stremio doesn't track
  let recentEpisodes = []
  try {
    const episodeHistory = await prisma.episodeWatchHistory.findMany({
      where: {
        accountId: accountIdValue,
        watchedAt: {
          gte: startDate
        }
      },
      orderBy: {
        watchedAt: 'desc'
      },
      take: 5000 // Activity page needs deep history (UI lazily renders)
    })

    // Build user lookup for episode history
    const userMap = new Map(allUsers.map(u => [u.id, u]))

    recentEpisodes = episodeHistory.map(ep => {
      const user = userMap.get(ep.userId)
      return {
        user: {
          id: ep.userId,
          username: user?.username || user?.email || ep.userId,
          email: user?.email,
          colorIndex: user?.colorIndex || 0
        },
        item: {
          id: ep.showId,
          name: ep.showName,
          type: 'series',
          poster: ep.poster,
          season: ep.season,
          episode: ep.episode
        },
        videoId: ep.videoId,
        watchedAt: ep.watchedAt.toISOString(),
        watchedAtTimestamp: ep.watchedAt.getTime()
      }
    })
  } catch (error) {
    console.warn(`[MetricsBuilder] Error fetching episode history:`, error.message)
  }

  // Fetch watch sessions from database
  // This provides start time, end time, and duration for each viewing session
  let watchSessions = []
  try {
    const sessions = await prisma.watchSession.findMany({
      where: {
        accountId: accountIdValue,
        startTime: {
          gte: startDate
        }
      },
      orderBy: {
        startTime: 'desc'
      },
      take: 5000 // Activity page needs deep history (UI lazily renders)
    })

    // Build user lookup for sessions
    const userMap = new Map(allUsers.map(u => [u.id, u]))

    watchSessions = sessions.map(session => {
      const user = userMap.get(session.userId)
      return {
        id: session.id,
        user: {
          id: session.userId,
          username: user?.username || user?.email || session.userId,
          email: user?.email,
          colorIndex: user?.colorIndex || 0
        },
        item: {
          id: session.itemId,
          name: session.itemName,
          type: session.itemType,
          poster: session.poster,
          season: session.season,
          episode: session.episode
        },
        videoId: session.videoId,
        startTime: session.startTime.toISOString(),
        endTime: session.endTime ? session.endTime.toISOString() : null,
        durationSeconds: session.durationSeconds,
        isActive: session.isActive,
        startTimeTimestamp: session.startTime.getTime(),
        updatedAtTimestamp: session.updatedAt ? session.updatedAt.getTime() : session.startTime.getTime()
      }
    })
  } catch (error) {
    console.warn(`[MetricsBuilder] Error fetching watch sessions:`, error.message)
  }

  // Calculate summary stats (Movies, Shows, Total Time) from WatchActivity data (already period-filtered)
  const activeUserCount = Object.keys(watchActivityByUser).length;

  // Build topUsers from session stats (real sessions only, no synthetic data)
  const userStatsFromSessions = new Map()
  const topUsersItemSet = new Set() 
  
  // RESET summary totals to use session-based data for consistency
  totalMovies = 0
  totalShows = 0
  totalWatchTime = 0
  const globalItemSet = new Set()

  watchSessions.filter(s => s.endTime !== null && !s.isSynthetic).forEach(session => {
    const userId = session.user.id
    const username = session.user.username
    const email = session.user.email
    const itemId = session.item.id
    const itemType = session.item.type
    const baseItemId = getBaseItemId(itemId, itemType)
    const userItemKey = `${userId}:${baseItemId}`
    const duration = session.durationSeconds || 0
    
    // Accumulate global totals
    totalWatchTime += duration
    if (!globalItemSet.has(userItemKey)) {
      globalItemSet.add(userItemKey)
      if (itemType === 'movie') totalMovies++
      else if (itemType === 'series') totalShows++
    }

    if (!userStatsFromSessions.has(userId)) {
      userStatsFromSessions.set(userId, {
        id: userId,
        username: username,
        email: email,
        movies: 0,
        shows: 0,
        total: 0,
        watchTime: 0,
        watchTimeMovies: 0,
        watchTimeShows: 0,
        dates: new Set()
      })
    }
    
    const stats = userStatsFromSessions.get(userId)
    stats.watchTime += duration
    if (session.startTime) stats.dates.add(session.startTime.split('T')[0])
    
    if (itemType === 'movie') stats.watchTimeMovies += duration
    else if (itemType === 'series') stats.watchTimeShows += duration
    
    if (!topUsersItemSet.has(userItemKey)) {
      topUsersItemSet.add(userItemKey)
      if (itemType === 'movie') stats.movies++
      else if (itemType === 'series') stats.shows++
      stats.total++
    }
  })
  
  const topUsers = Array.from(userStatsFromSessions.values())
    .sort((a, b) => b.total - a.total)
    .map(user => {
      let currentStreak = 0
      const dates = Array.from(user.dates).sort((a, b) => b.localeCompare(a))
      if (dates.length > 0) {
        const today = new Date().toISOString().split('T')[0]
        const yesterdayDate = new Date(); yesterdayDate.setDate(yesterdayDate.getDate() - 1)
        const yesterday = yesterdayDate.toISOString().split('T')[0]
        let checkDateStr = dates.includes(today) ? today : (dates.includes(yesterday) ? yesterday : null)
        if (checkDateStr) {
          let checkDate = new Date(checkDateStr)
          while (true) {
            const dateStr = checkDate.toISOString().split('T')[0]
            if (dates.includes(dateStr)) { currentStreak++; checkDate.setDate(checkDate.getDate() - 1) }
            else break
          }
        }
      }
      return {
        ...user,
        watchTimeHours: Math.round((user.watchTime / 3600) * 100) / 100,
        watchTimeMoviesHours: Math.round((user.watchTimeMovies / 3600) * 100) / 100,
        watchTimeShowsHours: Math.round((user.watchTimeShows / 3600) * 100) / 100,
        streak: currentStreak
      }
    })
    .map(({ dates, ...rest }) => rest)

  // Watch Time Trend Chart data
  const watchTimeByDayFromSessions = {}
  watchSessions.filter(s => s.endTime !== null && !s.isSynthetic).forEach(session => {
    const date = new Date(session.startTime).toISOString().split('T')[0]
    const duration = session.durationSeconds || 0
    watchTimeByDayFromSessions[date] = (watchTimeByDayFromSessions[date] || 0) + duration
  })
  
  const watchTimeChart = Object.entries(watchTimeByDayFromSessions)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, seconds]) => ({
      date,
      hours: Math.round((seconds / 3600) * 100) / 100
    }))

  let growthTrend = { percentage: 0, direction: 'up' }
  if (watchTimeChart.length >= 4) {
    const midPoint = Math.floor(watchTimeChart.length / 2)
    const firstHalf = watchTimeChart.slice(0, midPoint)
    const secondHalf = watchTimeChart.slice(midPoint)
    const firstHalfTotal = firstHalf.reduce((sum, day) => sum + day.hours, 0)
    const secondHalfTotal = secondHalf.reduce((sum, day) => sum + day.hours, 0)
    if (firstHalfTotal > 0) {
      const growth = ((secondHalfTotal - firstHalfTotal) / firstHalfTotal) * 100
      growthTrend = { percentage: Math.round(Math.abs(growth)), direction: growth >= 0 ? 'up' : 'down' }
    } else if (secondHalfTotal > 0) growthTrend = { percentage: 100, direction: 'up' }
  }

  // Calculate admin analytics (Phase 1)
  const userLifecycle = await calculateUserLifecycle(prisma, accountId, allUsers, watchActivityByUser)
  const topContent = await calculateTopContent(watchSessions)
  const engagement = await calculateEngagementMetrics(watchSessions)
  const alerts = generateAlerts(userLifecycle, topContent, engagement, period)

  // Calculate Phase 2 analytics (Addon Performance & Server Health)
  const addonAnalytics = await calculateAddonAnalytics(prisma, accountId)
  const serverHealth = await calculateServerHealth(prisma, accountId)
  const operationalAlerts = generateOperationalAlerts(serverHealth, addonAnalytics)
  
  const allAlerts = {
    ...alerts,
    operational: operationalAlerts,
    total: alerts.total + operationalAlerts.length,
    hasCritical: alerts.hasCritical || operationalAlerts.some(a => a.severity === 'critical')
  }

  // Phase 3: Enhanced Metrics
  const topItems = calculateTopItemsWithUsers(watchSessions, allUsers)
  const watchVelocity = calculateWatchVelocity(watchSessions)
  const interestingMetrics = calculateInterestingMetrics(watchActivityByUser, engagement, watchSessions, allUsers)

  return {
    summary: {
      totalUsers: allUsers.length,
      activeUsers: activeUserCount,
      totalMovies,
      totalShows,
      totalWatched: totalMovies + totalShows,
      totalWatchTimeHours: Math.round((totalWatchTime / 3600) * 100) / 100
    },
    userJoins: {
      byDay: userJoinsChart,
      byWeek: Object.entries(userJoinsByWeek).map(([week, count]) => ({ week, count: Number(count) })),
      byMonth: Object.entries(userJoinsByMonth).map(([month, count]) => ({ month, count: Number(count) }))
    },
    watchActivity: {
      byDay: watchActivityChart,
      byUser: topUsers,
      byUserByDay: watchActivityByUserByDayCharts
    },
    watchTime: {
      byDay: watchTimeChart,
      byItem: watchTimeByItemArray,
      trend: growthTrend
    },
    nowPlaying,
    startedPlaying,
    recentEpisodes,
    watchSessions,
    period,
    admin: {
      userLifecycle,
      topContent,
      engagement,
      alerts: allAlerts,
      addonAnalytics,
      serverHealth,
      topItems,
      watchVelocity,
      interestingMetrics
    }
  }
}

module.exports = {
  buildMetricsForAccount
}











