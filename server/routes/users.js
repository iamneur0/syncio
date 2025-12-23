const express = require('express');
const { StremioAPIClient } = require('stremio-api-client');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { handleStremioError } = require('../utils/handlers');
const { findUserById } = require('../utils/helpers');
const { responseUtils, dbUtils } = require('../utils/routeUtils');
const { sendShareNotification } = require('../utils/activityMonitor');
const { postDiscord } = require('../utils/notify');

// Export a function that returns the router, allowing dependency injection
module.exports = ({ prisma, getAccountId, scopedWhere, AUTH_ENABLED, decrypt, encrypt, parseAddonIds, parseProtectedAddons, getDecryptedManifestUrl, StremioAPIClient, StremioAPIStore, assignUserToGroup, debug, defaultAddons, canonicalizeManifestUrl, getAccountDek, getServerKey, aesGcmDecrypt, validateStremioAuthKey, manifestUrlHmac, manifestHash }) => {
  const { findLatestEpisode, enrichPostersFromCinemeta } = require('../utils/libraryHelpers')
  const router = express.Router();

  // User API key middleware - allows users to access their own data via API key
  const { createUserApiKeyMiddleware } = require('../middleware/userApiKey')
  router.use(createUserApiKeyMiddleware(prisma))

  // Check if user exists by email or username (for validation)
  router.get('/check', async (req, res) => {
    try {
      const { email, username } = req.query
      const accountId = getAccountId(req)
      
      if (!accountId) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      if (!email && !username) {
        return res.status(400).json({ error: 'Email or username is required' })
      }

      const where = { accountId }
      
      if (email && username) {
        where.OR = [
          { email: email.trim().toLowerCase() },
          { username: username.trim() }
        ]
      } else if (email) {
        where.email = email.trim().toLowerCase()
      } else if (username) {
        where.username = username.trim()
      }

      const existingUser = await prisma.user.findFirst({
        where,
        select: {
          id: true,
          email: true,
          username: true
        }
      })

      if (existingUser) {
        const conflicts = {}
        if (email && existingUser.email === email.trim().toLowerCase()) {
          conflicts.email = true
        }
        if (username && existingUser.username === username.trim()) {
          conflicts.username = true
        }
        return res.json({
          exists: true,
          conflicts
        })
      }

      return res.json({
        exists: false,
        conflicts: {}
      })
    } catch (error) {
      console.error('Error checking user existence:', error)
      return res.status(500).json({ error: error?.message || 'Failed to check user existence' })
    }
  })

  // Get all users
  router.get('/', async (req, res) => {
    try {
      const users = await prisma.user.findMany({
        where: scopedWhere(req, {}),
        include: {},
        orderBy: { id: 'asc' }
      });

      // Transform data for frontend compatibility
      const transformedUsers = await Promise.all(users.map(async (user) => {
        // For SQLite, we need to find groups that contain this user
        const groups = await prisma.group.findMany({
          where: scopedWhere(req, { userIds: { contains: user.id } }),
          include: {
            addons: {
              include: {
                addon: true
              }
            }
          }
        })
        
        const userGroup = groups[0] // Use first group
        const addonCount = userGroup?.addons?.length || 0
        
        // Calculate Stremio addons count by fetching live data
        let stremioAddonsCount = 0
        if (user.stremioAuthKey) {
          try {
            // Decrypt stored auth key
            const authKeyPlain = decrypt(user.stremioAuthKey, req)
            
            // Use stateless client with authKey to fetch addon collection directly
            const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })
            const collection = await apiClient.request('addonCollectionGet', {})
            
            const rawAddons = collection?.addons || collection || {}
            const addonsNormalized = Array.isArray(rawAddons)
              ? rawAddons
              : (typeof rawAddons === 'object' ? Object.values(rawAddons) : [])
            
            stremioAddonsCount = addonsNormalized.length
          } catch (error) {
            console.error(`Error fetching Stremio addons for user ${user.id}:`, error.message)
            // Note: stremioAddons field was removed from User schema
            // No fallback to database value available
          }
        }
        
        const excludedAddons = parseAddonIds(user.excludedAddons)
        const protectedAddons = parseProtectedAddons(user.protectedAddons, req)

        return {
          id: user.id,
          username: user.username,
          email: user.email,
          groupName: userGroup?.name || null,
          groupId: userGroup?.id || null,
          status: user.isActive ? 'active' : 'inactive',
          addons: addonCount,
          stremioAddonsCount: stremioAddonsCount,
          groups: groups.length,
          lastActive: null,
          hasStremioConnection: !!user.stremioAuthKey,
          isActive: user.isActive,
          excludedAddons: excludedAddons,
          protectedAddons: protectedAddons,
          colorIndex: user.colorIndex,
          inviteCode: user.inviteCode
        };
      }));

      res.json(transformedUsers);
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ message: 'Failed to fetch users' });
    }
  });

  // GET /users/metrics - Get metrics data for dashboard (must be before /:id route)
  router.get('/metrics', async (req, res) => {
    try {
      const accountId = getAccountId(req)
      if (!accountId) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      const { period = '30d' } = req.query // '7d', '30d', '90d', '1y', 'all'

      const { getCachedMetrics, setCachedMetrics } = require('../utils/metricsCache')
      const { buildMetricsForAccount } = require('../utils/metricsBuilder')

      // Try in-memory metrics cache first (populated by activityMonitor every 5 minutes)
      const cached = getCachedMetrics(accountId, period)
      if (cached) {
        return res.json(cached)
      }

      // Build on demand (also used on first boot or if scheduler hasn't run yet)
      const metrics = await buildMetricsForAccount({
        prisma,
        accountId,
        period,
        decrypt
      })

      setCachedMetrics(accountId, period, metrics)
      return res.json(metrics)
    } catch (error) {
      console.error('Error fetching metrics:', error)
      res.status(500).json({ error: 'Failed to fetch metrics' })
    }
  })

  // GET /users/:id/watch-time - Get watch time for a specific user
  router.get('/:id/watch-time', async (req, res) => {
    try {
      const accountId = getAccountId(req)
      if (!accountId) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      const { id: userId } = req.params
      const { 
        startDate, 
        endDate, 
        itemId,  // Optional: filter by specific item
        itemType, // Optional: 'movie' or 'series'
        groupBy = 'day' // 'day' or 'week'
      } = req.query

      const accountIdValue = accountId || 'default'

      // If user API key is used, restrict to own data only
      if (req.appUserId && req.appUserId !== userId) {
        return res.status(403).json({ error: 'Forbidden: You can only access your own data' })
      }

      // Verify user belongs to account
      const user = await prisma.user.findFirst({
        where: {
          id: userId,
          accountId: accountIdValue
        },
        select: { id: true, username: true, email: true }
      })

      if (!user) {
        return res.status(404).json({ error: 'User not found' })
      }

      // Build date range
      let start = startDate ? new Date(startDate) : new Date()
      start.setDate(start.getDate() - 7) // Default: last 7 days
      let end = endDate ? new Date(endDate) : new Date()

      // Build query
      const where = {
        accountId: accountIdValue,
        userId: userId,
        date: {
          gte: start,
          lte: end
        }
      }

      if (itemId) {
        where.itemId = itemId
      }

      if (itemType) {
        where.itemType = itemType
      }

      const activities = await prisma.watchActivity.findMany({
        where,
        select: {
          date: true,
          watchTimeSeconds: true,
          itemId: true,
          itemType: true
        },
        orderBy: {
          date: 'asc'
        }
      })

      // Group by day or week
      const grouped = {}
      let totalSeconds = 0

      for (const activity of activities) {
        const date = new Date(activity.date)
        let key

        if (groupBy === 'week') {
          // Get week start (Monday)
          const weekStart = new Date(date)
          const day = date.getDay()
          const diff = date.getDate() - day + (day === 0 ? -6 : 1) // Adjust to Monday
          weekStart.setDate(diff)
          key = weekStart.toISOString().split('T')[0]
        } else {
          key = date.toISOString().split('T')[0]
        }

        if (!grouped[key]) {
          grouped[key] = {
            date: key,
            watchTimeSeconds: 0,
            watchTimeHours: 0,
            items: new Set(),
            movies: 0,
            shows: 0
          }
        }

        grouped[key].watchTimeSeconds += activity.watchTimeSeconds || 0
        grouped[key].items.add(activity.itemId)
        totalSeconds += activity.watchTimeSeconds || 0

        if (activity.itemType === 'movie') {
          grouped[key].movies++
        } else if (activity.itemType === 'series') {
          grouped[key].shows++
        }
      }

      // Convert to array and format
      const result = Object.values(grouped).map(entry => ({
        date: entry.date,
        watchTimeSeconds: entry.watchTimeSeconds,
        watchTimeHours: Math.round((entry.watchTimeSeconds / 3600) * 100) / 100,
        itemsCount: entry.items.size,
        movies: entry.movies,
        shows: entry.shows
      }))

      // If itemId specified, also return per-item breakdown
      let itemBreakdown = null
      if (itemId) {
        itemBreakdown = {
          itemId,
          totalWatchTimeSeconds: totalSeconds,
          totalWatchTimeHours: Math.round((totalSeconds / 3600) * 100) / 100,
          days: result.length
        }
      }

      res.json({
        userId: user.id,
        username: user.username || user.email,
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
        totalWatchTimeSeconds: totalSeconds,
        totalWatchTimeHours: Math.round((totalSeconds / 3600) * 100) / 100,
        byDate: result,
        itemBreakdown
      })
    } catch (error) {
      console.error('Error fetching watch time:', error)
      res.status(500).json({ error: 'Failed to fetch watch time', message: error.message })
    }
  })

  // GET /users/:id/top-items - Get top shows/movies by watch time
  router.get('/:id/top-items', async (req, res) => {
    try {
      const accountId = getAccountId(req)
      if (!accountId) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      const { id: userId } = req.params
      const { 
        period = '30d',  // '1h', '12h', '1d', '3d', '7d', '30d', '90d', '1y', 'all'
        itemType,        // 'movie' or 'series' (optional)
        limit = 10       // Number of items to return
      } = req.query

      const accountIdValue = accountId || 'default'

      // If user API key is used, restrict to own data only
      if (req.appUserId && req.appUserId !== userId) {
        return res.status(403).json({ error: 'Forbidden: You can only access your own data' })
      }

      // Verify user belongs to account
      const user = await prisma.user.findFirst({
        where: {
          id: userId,
          accountId: accountIdValue
        },
        select: { id: true, username: true, email: true }
      })

      if (!user) {
        return res.status(404).json({ error: 'User not found' })
      }

      // Calculate date range
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

      // Build query
      // For short periods (1h, 12h, 1d, 3d), filter by createdAt timestamp for accurate filtering
      // For longer periods, date filtering is sufficient
      const useTimestampFilter = period === '1h' || period === '12h' || period === '1d' || period === '3d'
      
      const where = {
        accountId: accountIdValue,
        userId: userId,
        ...(useTimestampFilter ? {
          createdAt: {
            gte: startDate
          }
        } : {
          date: {
            gte: startDate
          }
        })
      }

      if (itemType) {
        where.itemType = itemType
      }

      // Aggregate watch time by item
      const activities = await prisma.watchActivity.findMany({
        where,
        select: {
          itemId: true,
          itemType: true,
          watchTimeSeconds: true,
          date: true
        }
      })

      // Group by itemId
      const itemStats = {}
      for (const activity of activities) {
        if (!itemStats[activity.itemId]) {
          itemStats[activity.itemId] = {
            itemId: activity.itemId,
            itemType: activity.itemType,
            totalWatchTimeSeconds: 0,
            daysWatched: new Set(),
            firstWatched: activity.date,
            lastWatched: activity.date
          }
        }

        itemStats[activity.itemId].totalWatchTimeSeconds += activity.watchTimeSeconds || 0
        itemStats[activity.itemId].daysWatched.add(activity.date.toISOString().split('T')[0])
        
        if (activity.date < itemStats[activity.itemId].firstWatched) {
          itemStats[activity.itemId].firstWatched = activity.date
        }
        if (activity.date > itemStats[activity.itemId].lastWatched) {
          itemStats[activity.itemId].lastWatched = activity.date
        }
      }

      // Convert to array and sort
      const topItems = Object.values(itemStats)
        .map(item => ({
          itemId: item.itemId,
          itemType: item.itemType,
          totalWatchTimeSeconds: item.totalWatchTimeSeconds,
          totalWatchTimeHours: Math.round((item.totalWatchTimeSeconds / 3600) * 100) / 100,
          daysWatched: item.daysWatched.size,
          firstWatched: item.firstWatched.toISOString().split('T')[0],
          lastWatched: item.lastWatched.toISOString().split('T')[0]
        }))
        .sort((a, b) => b.totalWatchTimeSeconds - a.totalWatchTimeSeconds)
        .slice(0, parseInt(limit) || 10)

      res.json({
        userId: user.id,
        username: user.username || user.email,
        period,
        itemType: itemType || 'all',
        totalItems: Object.keys(itemStats).length,
        topItems
      })
    } catch (error) {
      console.error('Error fetching top items:', error)
      res.status(500).json({ error: 'Failed to fetch top items', message: error.message })
    }
  })

  // GET /users/:id/streaks - Get watch streaks
  router.get('/:id/streaks', async (req, res) => {
    try {
      const accountId = getAccountId(req)
      if (!accountId) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      const { id: userId } = req.params
      const accountIdValue = accountId || 'default'

      // If user API key is used, restrict to own data only
      if (req.appUserId && req.appUserId !== userId) {
        return res.status(403).json({ error: 'Forbidden: You can only access your own data' })
      }

      // Verify user belongs to account
      const user = await prisma.user.findFirst({
        where: {
          id: userId,
          accountId: accountIdValue
        },
        select: { id: true, username: true, email: true }
      })

      if (!user) {
        return res.status(404).json({ error: 'User not found' })
      }

      // Get all watch activity dates
      const activities = await prisma.watchActivity.findMany({
        where: {
          accountId: accountIdValue,
          userId: userId
        },
        select: {
          date: true
        },
        distinct: ['date'],
        orderBy: {
          date: 'desc'
        }
      })

      if (activities.length === 0) {
        return res.json({
          userId: user.id,
          username: user.username || user.email,
          currentStreak: 0,
          longestStreak: 0,
          streakStartDate: null,
          longestStreakStartDate: null,
          longestStreakEndDate: null,
          totalDaysWatched: 0
        })
      }

      // Get unique date strings (YYYY-MM-DD) and sort
      const dateStrings = [...new Set(activities.map(a => {
        const d = new Date(a.date)
        // Normalize to UTC date string to avoid timezone issues
        const year = d.getUTCFullYear()
        const month = String(d.getUTCMonth() + 1).padStart(2, '0')
        const day = String(d.getUTCDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
      }))].sort((a, b) => b.localeCompare(a)) // Most recent first

      // Calculate current streak
      let currentStreak = 0
      let streakStartDate = null
      const today = new Date()
      // Normalize today to UTC date string
      const todayYear = today.getUTCFullYear()
      const todayMonth = String(today.getUTCMonth() + 1).padStart(2, '0')
      const todayDay = String(today.getUTCDate()).padStart(2, '0')
      const todayStr = `${todayYear}-${todayMonth}-${todayDay}`
      
      let checkDate = new Date(today)
      checkDate.setUTCHours(0, 0, 0, 0)
      let isFirstCheck = true
      
      // Keep checking consecutive days until we find a gap
      while (true) {
        const year = checkDate.getUTCFullYear()
        const month = String(checkDate.getUTCMonth() + 1).padStart(2, '0')
        const day = String(checkDate.getUTCDate()).padStart(2, '0')
        const dateStr = `${year}-${month}-${day}`
        const hasActivity = dateStrings.includes(dateStr)
        
        if (hasActivity) {
          if (currentStreak === 0) {
            streakStartDate = new Date(checkDate)
          }
          currentStreak++
          checkDate.setUTCDate(checkDate.getUTCDate() - 1)
          isFirstCheck = false
        } else {
          // Allow 1 day gap (yesterday) for current streak only on first check (if today has no activity)
          if (isFirstCheck && dateStr === todayStr) {
            checkDate.setUTCDate(checkDate.getUTCDate() - 1)
            isFirstCheck = false
            continue
          }
          break
        }
      }

      // Calculate longest streak
      let longestStreak = 0
      let longestStreakStartDate = null
      let longestStreakEndDate = null
      let currentStreakLength = 1
      let currentStreakStart = dateStrings[0]

      for (let i = 1; i < dateStrings.length; i++) {
        const prevDateStr = dateStrings[i - 1]
        const currDateStr = dateStrings[i]
        const prevDate = new Date(prevDateStr + 'T00:00:00Z')
        const currDate = new Date(currDateStr + 'T00:00:00Z')
        const daysDiff = Math.floor((prevDate - currDate) / (1000 * 60 * 60 * 24))

        if (daysDiff === 1) {
          // Consecutive day
          currentStreakLength++
        } else {
          // Streak broken
          if (currentStreakLength > longestStreak) {
            longestStreak = currentStreakLength
            longestStreakStartDate = new Date(currDateStr + 'T00:00:00Z')
            longestStreakEndDate = new Date(prevDateStr + 'T00:00:00Z')
          }
          currentStreakLength = 1
          currentStreakStart = dateStrings[i]
        }
      }

      // Check if last streak is longest
      if (currentStreakLength > longestStreak) {
        longestStreak = currentStreakLength
        longestStreakStartDate = new Date(currentStreakStart + 'T00:00:00Z')
        longestStreakEndDate = new Date(dateStrings[0] + 'T00:00:00Z')
      }

      res.json({
        userId: user.id,
        username: user.username || user.email,
        currentStreak,
        longestStreak,
        streakStartDate: streakStartDate ? streakStartDate.toISOString().split('T')[0] : null,
        longestStreakStartDate: longestStreakStartDate ? longestStreakStartDate.toISOString().split('T')[0] : null,
        longestStreakEndDate: longestStreakEndDate ? longestStreakEndDate.toISOString().split('T')[0] : null,
        totalDaysWatched: dateStrings.length
      })
    } catch (error) {
      console.error('Error fetching streaks:', error)
      res.status(500).json({ error: 'Failed to fetch streaks', message: error.message })
    }
  })

  // GET /users/:id/velocity - Get watch velocity (episodes per day for shows)
  router.get('/:id/velocity', async (req, res) => {
    try {
      const accountId = getAccountId(req)
      if (!accountId) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      const { id: userId } = req.params
      const { 
        itemId,  // Optional: specific show
        period = '30d'  // '1h', '12h', '1d', '3d', '7d', '30d', '90d', '1y', 'all'
      } = req.query

      const accountIdValue = accountId || 'default'

      // If user API key is used, restrict to own data only
      if (req.appUserId && req.appUserId !== userId) {
        return res.status(403).json({ error: 'Forbidden: You can only access your own data' })
      }

      // Verify user belongs to account
      const user = await prisma.user.findFirst({
        where: {
          id: userId,
          accountId: accountIdValue
        },
        select: { id: true, username: true, email: true }
      })

      if (!user) {
        return res.status(404).json({ error: 'User not found' })
      }

      // Calculate date range
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

      // Get watch snapshots to track episode progress
      const snapshotWhere = {
        accountId: accountIdValue,
        userId: userId,
        date: {
          gte: startDate
        }
      }

      if (itemId) {
        snapshotWhere.itemId = itemId
      }

      // Get snapshots for series only
      const snapshots = await prisma.watchSnapshot.findMany({
        where: snapshotWhere,
        select: {
          itemId: true,
          date: true,
          overallTimeWatched: true
        },
        orderBy: {
          date: 'asc'
        }
      })

      // Get watch activities to see daily changes
      const activities = await prisma.watchActivity.findMany({
        where: {
          accountId: accountIdValue,
          userId: userId,
          itemType: 'series',
          date: {
            gte: startDate
          },
          ...(itemId ? { itemId } : {})
        },
        select: {
          itemId: true,
          date: true,
          watchTimeSeconds: true
        },
        orderBy: {
          date: 'asc'
        }
      })

      // Group by itemId and calculate velocity
      const velocityByItem = {}
      
      // Process activities to estimate episodes watched
      // Assume average episode is ~45 minutes (2700 seconds)
      const avgEpisodeSeconds = 45 * 60

      for (const activity of activities) {
        if (!velocityByItem[activity.itemId]) {
          velocityByItem[activity.itemId] = {
            itemId: activity.itemId,
            totalWatchTimeSeconds: 0,
            estimatedEpisodes: 0,
            daysActive: new Set(),
            firstWatched: activity.date,
            lastWatched: activity.date,
            watchDays: []
          }
        }

        const item = velocityByItem[activity.itemId]
        item.totalWatchTimeSeconds += activity.watchTimeSeconds || 0
        item.daysActive.add(activity.date.toISOString().split('T')[0])
        item.watchDays.push({
          date: activity.date.toISOString().split('T')[0],
          watchTimeSeconds: activity.watchTimeSeconds
        })

        if (activity.date < item.firstWatched) {
          item.firstWatched = activity.date
        }
        if (activity.date > item.lastWatched) {
          item.lastWatched = activity.date
        }
      }

      // Calculate velocity metrics
      const velocityResults = Object.values(velocityByItem).map(item => {
        const daysActive = item.daysActive.size
        const totalDays = Math.max(1, Math.ceil((item.lastWatched - item.firstWatched) / (1000 * 60 * 60 * 24)) + 1)
        const estimatedEpisodes = Math.round(item.totalWatchTimeSeconds / avgEpisodeSeconds)
        const episodesPerDay = daysActive > 0 ? (estimatedEpisodes / daysActive) : 0
        const episodesPerWeek = episodesPerDay * 7

        // Estimate completion date (if we have current progress)
        let estimatedCompletion = null
        if (itemId && snapshots.length > 0) {
          const latestSnapshot = snapshots[snapshots.length - 1]
          // This is a rough estimate - would need total episodes from metadata
          // For now, just show velocity
        }

        return {
          itemId: item.itemId,
          totalWatchTimeSeconds: item.totalWatchTimeSeconds,
          totalWatchTimeHours: Math.round((item.totalWatchTimeSeconds / 3600) * 100) / 100,
          estimatedEpisodes,
          daysActive,
          totalDays,
          episodesPerDay: Math.round(episodesPerDay * 100) / 100,
          episodesPerWeek: Math.round(episodesPerWeek * 100) / 100,
          firstWatched: item.firstWatched.toISOString().split('T')[0],
          lastWatched: item.lastWatched.toISOString().split('T')[0],
          watchDays: item.watchDays.slice(-7) // Last 7 days of activity
        }
      }).sort((a, b) => b.episodesPerDay - a.episodesPerDay)

      res.json({
        userId: user.id,
        username: user.username || user.email,
        period,
        itemId: itemId || null,
        averageEpisodeLength: avgEpisodeSeconds,
        items: velocityResults
      })
    } catch (error) {
      console.error('Error fetching velocity:', error)
      res.status(500).json({ error: 'Failed to fetch velocity', message: error.message })
    }
  })

  // Get single user with detailed information
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params
      const { basic } = req.query
      
      const user = await findUserById(prisma, id, getAccountId(req), {})
      if (!user) {
        return responseUtils.notFound(res, 'User')
      }

      // Find groups that contain this user
      const groups = await prisma.group.findMany({
        where: {
          accountId: getAccountId(req),
          userIds: {
            contains: user.id
          }
        },
        include: {
          addons: {
            include: {
              addon: true
            }
          }
        }
      })

      // Group addons come from the user's primary group assignment
      const primaryGroup = groups[0]
      const currentAccountId = getAccountId(req)
      // Resolve ordered addons via shared helper
      const { getGroupAddons } = require('../utils/helpers')
      const orderedAddons = primaryGroup ? await getGroupAddons(prisma, primaryGroup.id, req) : []

      // Get all groups the user belongs to
      const userGroups = groups.map(g => ({ id: g.id, name: g.name }))

      // Note: stremioAddons field was removed from User schema
      // Stremio addons are now fetched live when needed
      let stremioAddonsCount = 0
      let stremioAddons = []

      // Parse excluded and protected addons from database
      let excludedAddons = []
      let protectedAddons = []
      
      excludedAddons = parseAddonIds(user.excludedAddons)
      
      // protectedAddons are stored as plaintext names (JSON array)
      try {
        protectedAddons = user.protectedAddons ? JSON.parse(user.protectedAddons) : []
      } catch {
        protectedAddons = []
      }

      // Transform for frontend
      const transformedUser = {
        id: user.id,
        email: user.email,
        username: user.username,
        hasStremioConnection: !!user.stremioAuthKey,
        status: user.isActive ? 'active' : 'inactive',
        addons: orderedAddons,
        groups: userGroups,
        groupName: groups[0]?.name || null,
        groupId: groups[0]?.id || null,
        lastActive: null,
        stremioAddonsCount: stremioAddonsCount,
        stremioAddons: stremioAddons,
        excludedAddons: excludedAddons,
        protectedAddons: protectedAddons,
        colorIndex: user.colorIndex,
        expiresAt: user.expiresAt,
        inviteCode: user.inviteCode,
        createdAt: user.createdAt,
        discordWebhookUrl: user.discordWebhookUrl || null
      }

      res.json(transformedUser)
    } catch (error) {
      console.error('Error fetching user details:', error)
      res.status(500).json({ error: 'Failed to fetch user details' })
    }
  });

  // Update user (including Discord settings for public users)
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params
      const { username, email, password, groupId, colorIndex, expiresAt } = req.body
      

      // Check if user exists
      const existingUser = await prisma.user.findUnique({
        where: { 
          id,
          accountId: getAccountId(req)
        },
      })

      if (!existingUser) {
        return res.status(404).json({ error: 'User not found' })
      }

      // Prepare update data
      const updateData = {}
      
      if (username !== undefined) {
        updateData.username = username
      }
      
      if (email !== undefined) {
        // Check if email is already taken by another user
        const emailExists = await prisma.user.findFirst({
          where: { 
            AND: [
              { email },
              { id: { not: id } },
              ...(AUTH_ENABLED && req.appAccountId ? [{ accountId: req.appAccountId }] : [])
            ]
          }
        })
        
        if (emailExists) {
          return res.status(400).json({ error: 'Email already exists' })
        }
        
        updateData.email = email
      }

      if (password !== undefined && password.trim() !== '') {
        updateData.password = await bcrypt.hash(password, 12)
      }

      if (colorIndex !== undefined) {
        updateData.colorIndex = colorIndex
      }

      if (expiresAt !== undefined) {
        updateData.expiresAt = expiresAt ? new Date(expiresAt) : null
      }

      // Handle Discord settings (for public users)
      if (req.body.discordWebhookUrl !== undefined) {
        updateData.discordWebhookUrl = req.body.discordWebhookUrl || null
      }
      if (req.body.discordUserId !== undefined) {
        updateData.discordUserId = req.body.discordUserId || null
      }

      // Update user
      const updatedUser = await prisma.user.update({
        where: { id },
        data: updateData
      })

      // Handle group assignment
      if (groupId !== undefined) {
        // Treat empty string as null (remove from all groups)
        if (groupId === null || groupId === '') {
          // Remove user from all groups
          const allGroups = await prisma.group.findMany({
            where: { accountId: getAccountId(req) },
            select: { id: true, userIds: true }
          });

          for (const group of allGroups) {
            if (group.userIds) {
              const userIds = JSON.parse(group.userIds);
              const updatedUserIds = userIds.filter(userId => userId !== id);
              if (updatedUserIds.length !== userIds.length) {
                await prisma.group.update({
                  where: { id: group.id },
                  data: { userIds: JSON.stringify(updatedUserIds) }
                });
              }
            }
          }
        } else {
          // Validate groupId is a valid string before calling assignUserToGroup
          if (typeof groupId === 'string' && groupId.trim() !== '') {
            // First verify the group exists for this account
            const accountId = getAccountId(req)
            const groupExists = await prisma.group.findUnique({
              where: { 
                id: groupId,
                accountId: accountId
              },
              select: { id: true }
            })
            
            if (!groupExists) {
              return res.status(404).json({ 
                error: `Group not found: ${groupId} (accountId: ${accountId})` 
              })
            }
            
            await assignUserToGroup(id, groupId, req)
          }
        }
      }

      // Fetch updated user for response
      const userWithGroups = await prisma.user.findUnique({
        where: { id }
      })

      // Find groups that contain this user using userIds JSON array
      const userGroups = await prisma.group.findMany({
        where: {
          userIds: {
            contains: id
          }
        }
      })

      // Transform for frontend response
      const userGroup = userGroups[0] // Get first group if any
      const transformedUser = {
        id: userWithGroups.id,
        username: userWithGroups.username,
        email: userWithGroups.email,
        status: userWithGroups.isActive ? 'active' : 'inactive',
        addons: userWithGroups.stremioAddons ? 
          (Array.isArray(userWithGroups.stremioAddons) ? userWithGroups.stremioAddons.length : Object.keys(userWithGroups.stremioAddons).length) : 0,
        groups: userGroups.length,
        groupName: userGroup?.name || null,
        groupId: userGroup?.id || null,
        lastActive: null
      }

      // Log activity (temporarily disabled for debugging)
      // try {
      //   await prisma.activityLog.create({
      //     data: {
      //       userId: id,
      //       action: 'user_updated',
      //       details: JSON.stringify({ updatedFields: Object.keys(updateData) }),
      //       accountId: getAccountId(req)
      //     }
      //   })
      // } catch (logError) {
      //   console.warn('Failed to log user update activity:', logError.message)
      // }

      res.json(transformedUser)
    } catch (error) {
      console.error('Error updating user:', error)
      res.status(500).json({ error: 'Failed to update user', details: error?.message })
    }
  });

  // Test user's Discord webhook
  router.post('/:id/test-webhook', async (req, res) => {
    try {
      const { id } = req.params
      const accountId = getAccountId(req)
      
      if (!accountId) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      // Get user's webhook URL
      const user = await prisma.user.findUnique({
        where: { id, accountId },
        select: { id: true, username: true, discordWebhookUrl: true }
      })

      if (!user) {
        return res.status(404).json({ error: 'User not found' })
      }

      // Use provided URL or user's stored URL
      const providedUrl = typeof req.body?.webhookUrl === 'string' ? req.body.webhookUrl.trim() : ''
      const targetUrl = providedUrl || user.discordWebhookUrl

      if (!targetUrl) {
        return res.status(400).json({ message: 'No webhook URL configured' })
      }

      await postDiscord(targetUrl, `🔬 Syncio test webhook message for ${user.username}`)
      return res.json({ message: 'Test message sent' })
    } catch (error) {
      console.error('Failed to send user webhook test:', error)
      return res.status(500).json({ message: 'Failed to send test message', error: error?.message })
    }
  });

  // Enable user
  router.put('/:id/enable', async (req, res) => {
    try {
      const { id } = req.params
      
      
      // Update user status to active
      const updatedUser = await prisma.user.update({
        where: { 
          id,
          accountId: getAccountId(req)
        },
        data: { isActive: true },
        include: {}
      })
      
      // Remove sensitive data
      delete updatedUser.password
      delete updatedUser.stremioAuthKey
      
      res.json(updatedUser)
    } catch (error) {
      console.error('Error enabling user:', error)
      res.status(500).json({ error: 'Failed to enable user', details: error?.message })
    }
  });

  // Disable user
  router.put('/:id/disable', async (req, res) => {
    try {
      const { id } = req.params
      
      
      // Update user status to inactive
      const updatedUser = await prisma.user.update({
        where: { 
          id,
          accountId: getAccountId(req)
        },
        data: { isActive: false },
        include: {}
      })
      
      // Remove sensitive data
      delete updatedUser.password
      delete updatedUser.stremioAuthKey
      
      res.json(updatedUser)
    } catch (error) {
      console.error('Error disabling user:', error)
      res.status(500).json({ error: 'Failed to disable user', details: error?.message })
    }
  });

  // Delete user
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      // Ensure user exists
      const existingUser = await prisma.user.findUnique({ 
        where: { 
          id,
          accountId: getAccountId(req)
        }
      })
      if (!existingUser) {
        return responseUtils.notFound(res, 'User')
      }

      // Remove user from all groups first (update userIds arrays)
      const groups = await prisma.group.findMany({
        where: {
          accountId: getAccountId(req),
          userIds: {
            contains: id
          }
        }
      })
      
      // Update each group to remove the user from userIds array
      for (const group of groups) {
        const userIds = group.userIds ? JSON.parse(group.userIds) : []
        const updatedUserIds = userIds.filter(userId => userId !== id)
        await prisma.group.update({
          where: { id: group.id },
          data: { userIds: JSON.stringify(updatedUserIds) }
        })
      }

      // Delete related records first to avoid FK constraint errors
      await prisma.$transaction([
        // ActivityLog model removed
        prisma.user.delete({ 
          where: { 
            id,
            accountId: getAccountId(req)
          }
        })
      ])

      res.json({ message: 'User deleted successfully' });
    } catch (error) {
      console.error('Error deleting user:', error);
      res.status(500).json({ message: 'Failed to delete user' });
    }
  });

  // Get user sync status (delegates to shared util)
  router.get('/:id/sync-status', async (req, res) => {
    try {
      const { id } = req.params
      const { groupId } = req.query

      // Read account-backed sync settings; fallback to query param only if unavailable
      let unsafeMode = false
      try {
        const acct = await prisma.appAccount.findUnique({ where: { id: getAccountId(req) }, select: { sync: true } })
        let cfg = acct?.sync
        if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg) } catch { cfg = null } }
        if (cfg && typeof cfg === 'object' && typeof cfg.safe === 'boolean') {
          unsafeMode = !cfg.safe
        } else {
          unsafeMode = req.query?.unsafe === 'true' || req.body?.unsafe === true
        }
      } catch {
        unsafeMode = req.query?.unsafe === 'true' || req.body?.unsafe === true
      }

      const { createGetUserSyncStatus } = require('../utils/sync')
      const getUserSyncStatus = createGetUserSyncStatus({
        prisma,
        getAccountId,
        decrypt,
        parseAddonIds,
        parseProtectedAddons,
        getDecryptedManifestUrl,
        canonicalizeManifestUrl,
        StremioAPIClient,
      })

      const result = await getUserSyncStatus(id, { groupId, unsafe: unsafeMode }, req)
      return res.json(result)
    } catch (error) {
      console.error('Error getting sync status:', error)
      res.status(500).json({ message: 'Failed to get sync status' })
    }
  });

  // Get user's raw Stremio addons (getUserAddons function)
  router.get('/:id/user-addons', async (req, res) => {
    try {
      const { id } = req.params

      // Get user
      const user = await prisma.user.findUnique({
        where: { 
          id,
          accountId: getAccountId(req)
        },
        select: { 
          id: true,
          stremioAuthKey: true,
          isActive: true
        }
      })

      if (!user) {
        return responseUtils.notFound(res, 'User')
      }

      if (!user.stremioAuthKey) {
        return res.status(400).json({ message: 'User not connected to Stremio' })
      }

      // Import the getUserAddons function
      const { getUserAddons } = require('../utils/sync')
      
      // Get raw Stremio addons
      const result = await getUserAddons(user, req, {
        decrypt,
        StremioAPIClient
      })

      if (!result.success) {
        console.error('❌ getUserAddons failed:', result.error)
        return res.status(500).json({ message: 'Failed to fetch Stremio addons', error: result.error })
      }

      // Removed verbose raw addons log to reduce noise
      res.json(result.addons)
    } catch (error) {
      console.error('❌ Error fetching raw Stremio addons:', error)
      res.status(500).json({ message: 'Failed to fetch raw Stremio addons', error: error?.message })
    }
  });

  // Get user's Stremio addons
  router.get('/:id/stremio-addons', async (req, res) => {
    try {
      const { id } = req.params
      // Fetch the user's stored Stremio auth
      const user = await prisma.user.findUnique({
        where: { 
          id,
          accountId: getAccountId(req)
        },
        select: { stremioAuthKey: true }
      })

      if (!user) {
        return responseUtils.notFound(res, 'User')
      }

      if (!user.stremioAuthKey) {
        return res.status(400).json({ message: 'User is not connected to Stremio' })
      }

      // Decrypt stored auth key
      let authKeyPlain
      try {
        authKeyPlain = decrypt(user.stremioAuthKey, req)
      } catch (e) {
        console.error('Decryption failed:', e.message)
        return res.status(500).json({ message: 'Failed to decrypt Stremio credentials' })
      }

      // Use stateless client with authKey to fetch addon collection directly
      try {
        const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })
        const collection = await apiClient.request('addonCollectionGet', {})

        const rawAddons = collection?.addons || collection || {}
        const addonsNormalized = Array.isArray(rawAddons)
          ? rawAddons
          : (typeof rawAddons === 'object' ? Object.values(rawAddons) : [])

        // Keep only safe serializable fields (skip manifest fetching for performance)
        const allAddons = addonsNormalized.map((a) => {
          return {
            id: a?.id || a?.manifest?.id || 'unknown',
            name: a?.name || a?.manifest?.name || 'Unknown',
            manifestUrl: a?.manifestUrl || a?.transportUrl || a?.url || null,
            version: a?.version || a?.manifest?.version || 'unknown',
            description: a?.description || a?.manifest?.description || '',
            iconUrl: a?.iconUrl || a?.manifest?.logo || null, // Add iconUrl field
            // Include manifest object for frontend compatibility - ensure it's never null
            manifest: a?.manifest || {
              id: a?.manifest?.id || a?.id || 'unknown',
              name: a?.manifest?.name || a?.name || 'Unknown',
              version: a?.manifest?.version || a?.version || 'unknown',
              description: a?.manifest?.description || a?.description || '',
              logo: a?.iconUrl || a?.manifest?.logo || null, // Add logo to manifest
              // Include other essential manifest fields to prevent null errors
              types: a?.manifest?.types || ['other'],
              resources: a?.manifest?.resources || [],
              catalogs: a?.manifest?.catalogs || []
            }
          }
        })

        // Keep all addons for display (don't filter default addons in the main endpoint)
        const addons = allAddons

        return res.json({
          userId: id,
          count: addons.length,
          addons
        })
      } catch (error) {
        console.error('Error fetching Stremio addons:', error)
        return res.status(500).json({ message: 'Failed to fetch addons from Stremio', error: error.message })
      }
    } catch (error) {
      console.error('Error getting Stremio addons:', error)
      res.status(500).json({ message: 'Failed to get Stremio addons' })
    }
  });

  // Get user's desired addons (group addons + protected addons)
  router.get('/:id/desired-addons', async (req, res) => {
    try {
      const { id } = req.params
      
      // Fetch the user
      const user = await prisma.user.findUnique({
        where: { 
          id,
          accountId: getAccountId(req)
        },
        select: { 
          id: true,
          stremioAuthKey: true,
          excludedAddons: true,
          protectedAddons: true
        }
      })

      if (!user) {
        return responseUtils.notFound(res, 'User')
      }

      // Import the getDesiredAddons function
      const { getDesiredAddons } = require('../utils/sync')
      
      // Get unsafe mode from query parameter
      const unsafe = req.query.unsafe === 'true'
      
      // Call getDesiredAddons with all required dependencies
      const result = await getDesiredAddons(user, req, {
        prisma,
        getAccountId,
        decrypt,
        parseAddonIds,
        parseProtectedAddons,
        canonicalizeManifestUrl,
        StremioAPIClient,
        unsafeMode: unsafe
      })

      if (!result.success) {
        return res.status(500).json({ message: result.error })
      }

      res.json({ addons: result.addons })
    } catch (error) {
      console.error('❌ Error fetching desired addons:', error)
      res.status(500).json({ message: 'Failed to fetch desired addons', error: error?.message })
    }
  });

  // Get user's group addons
  router.get('/:id/group-addons', async (req, res) => {
    try {
      const { id } = req.params
      
      // Get user's groups
      const groups = await prisma.group.findMany({
        where: {
          accountId: getAccountId(req),
          userIds: {
            contains: id
          }
        }
      })

      if (groups.length === 0) {
        return res.json({ addons: [] })
      }

      // Use the primary group (first one)
      const primaryGroup = groups[0]
      
      // Import the getGroupAddons function
      const { getGroupAddons } = require('../utils/helpers')
      
      // Get group addons with proper ordering and decryption
      const groupAddons = await getGroupAddons(prisma, primaryGroup.id, req)

      res.json({ addons: groupAddons })
    } catch (error) {
      console.error('❌ Error fetching group addons:', error)
      res.status(500).json({ message: 'Failed to fetch group addons', error: error?.message })
    }
  });

  // Update excluded addons
  router.put('/:id/excluded-addons', async (req, res) => {
    try {
      const { id } = req.params
      const { excludedAddons } = req.body

      const user = await prisma.user.findUnique({
        where: { id, accountId: getAccountId(req) }
      })

      if (!user) {
        return responseUtils.notFound(res, 'User')
      }

      const updatedUser = await prisma.user.update({
        where: { id, accountId: getAccountId(req) },
        data: { excludedAddons: JSON.stringify(excludedAddons || []) }
      })

      res.json({ 
        message: 'Excluded addons updated successfully',
        excludedAddons: parseAddonIds(updatedUser.excludedAddons)
      })
    } catch (error) {
      console.error('Error updating excluded addons:', error)
      res.status(500).json({ message: 'Failed to update excluded addons' })
    }
  });

  // Update protected addons
  router.put('/:id/protected-addons', async (req, res) => {
    try {
      const { id } = req.params
      const { protectedAddons } = req.body

      const user = await prisma.user.findUnique({
        where: { id, accountId: getAccountId(req) }
      })

      if (!user) {
        return responseUtils.notFound(res, 'User')
      }

      const updatedUser = await prisma.user.update({
        where: { id, accountId: getAccountId(req) },
        data: { protectedAddons: JSON.stringify(protectedAddons || []) }
      })

      res.json({ 
        message: 'Protected addons updated successfully',
        protectedAddons: parseProtectedAddons(updatedUser.protectedAddons, req)
      })
    } catch (error) {
      console.error('Error updating protected addons:', error)
      res.status(500).json({ message: 'Failed to update protected addons' })
    }
  });

  // Sync user addons - delegate to shared syncUserAddons to keep behavior consistent everywhere
  router.post('/:id/sync', async (req, res) => {
    try {
      const { id } = req.params
      // Read account-backed sync settings; fallback to query/body only if unavailable
      let unsafeMode = false
      let useCustomFields = true
      try {
        const acct = await prisma.appAccount.findUnique({ where: { id: getAccountId(req) }, select: { sync: true } })
        let cfg = acct?.sync
        if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg) } catch { cfg = null } }
        if (cfg && typeof cfg === 'object') {
          if (typeof cfg.safe === 'boolean') {
            unsafeMode = !cfg.safe
          }
          if (typeof cfg.useCustomFields === 'boolean') {
            useCustomFields = cfg.useCustomFields
          } else if (typeof cfg.useCustomNames === 'boolean') {
            // Backward compatibility: migrate old useCustomNames to useCustomFields
            useCustomFields = cfg.useCustomNames
          } else {
            // Default to true if not set (backward compatibility)
            useCustomFields = true
          }
        } else {
          unsafeMode = req.query?.unsafe === 'true' || req.body?.unsafe === true
        }
      } catch {
        unsafeMode = req.query?.unsafe === 'true' || req.body?.unsafe === true
      }

      // Individual user sync - no reload needed, just sync
      const result = await syncUserAddons(prisma, id, [], unsafeMode, req, decrypt, getAccountId, useCustomFields)

      if (!result.success) {
        return res.status(400).json({ message: result.error || 'Failed to sync user' })
      }

      return res.json({
        message: 'User synced successfully', 
        addonsCount: result.totalAddons ?? result.addonsCount ?? 0,
        ...(result.reloadedCount !== undefined ? { reloadedCount: result.reloadedCount } : {}),
        ...(result.totalAddons !== undefined ? { totalAddons: result.totalAddons } : {})
      })
    } catch (error) {
      console.error('Error in sync endpoint:', error)
      return res.status(500).json({ message: 'Failed to sync user', error: error?.message })
    }
  });

  // Sync all users
  router.post('/sync-all', async (req, res) => {
    try {
      debug.log('🚀 Sync all users endpoint called')
      
      // Read account-backed sync settings
      let unsafeMode = false
      let useCustomFields = true
      try {
        const acct = await prisma.appAccount.findUnique({ where: { id: getAccountId(req) }, select: { sync: true } })
        let cfg = acct?.sync
        if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg) } catch { cfg = null } }
        if (cfg && typeof cfg === 'object') {
          if (typeof cfg.safe === 'boolean') {
            unsafeMode = !cfg.safe
          }
          if (typeof cfg.useCustomFields === 'boolean') {
            useCustomFields = cfg.useCustomFields
          } else if (typeof cfg.useCustomNames === 'boolean') {
            // Backward compatibility: migrate old useCustomNames to useCustomFields
            useCustomFields = cfg.useCustomNames
          } else {
            useCustomFields = true
          }
        }
      } catch {}
      
      // Get all enabled users
      const users = await prisma.user.findMany({
        where: { isActive: true }
      })
      
      if (users.length === 0) {
        return res.json({ 
          message: 'No enabled users found to sync',
          syncedCount: 0,
          totalUsers: 0
        })
      }
      
      let syncedCount = 0
      let totalAddons = 0
      const errors = []
      
      debug.log(`🔄 Starting sync for ${users.length} enabled users`)
      
      // Sync each user
      for (const user of users) {
        try {
          debug.log(`🔄 Syncing user: ${user.username || user.email}`)
          
          // Use the reusable sync function
          const syncResult = await syncUserAddons(prisma, user.id, [], unsafeMode, req, decrypt, getAccountId, useCustomFields)
          
          if (syncResult.success) {
            syncedCount++
            debug.log(`✅ Successfully synced user: ${user.username || user.email}`)
            
            // Collect reload progress if available
            if (syncResult.reloadedCount !== undefined && syncResult.totalAddons !== undefined) {
              totalAddons += syncResult.totalAddons
            }
          } else {
            errors.push(`${user.username || user.email}: ${syncResult.error}`)
          }
        } catch (error) {
          errors.push(`${user.username || user.email}: ${error.message}`)
          console.error(`❌ Error syncing user ${user.username || user.email}:`, error)
        }
      }
      
      let message = `All users sync completed.\n${syncedCount}/${users.length} users synced`
      if (totalAddons > 0) {
        message += `\n${totalAddons} total addons processed`
      }
      if (errors.length > 0) {
        message += `\n\nErrors:\n${errors.join('\n')}`
      }
      
      res.json({
        message,
        syncedCount,
        totalUsers: users.length,
        totalAddons,
        errors: errors.length > 0 ? errors : undefined
      })
    } catch (error) {
      console.error('Error syncing all users:', error)
      res.status(500).json({ message: 'Failed to sync all users', error: error?.message })
    }
  });

  // Patch user (partial update)
  router.patch('/:id', async (req, res) => {
    try {
      const { id } = req.params
      const updateData = req.body

      // Remove any fields that shouldn't be updated directly
      delete updateData.id
      delete updateData.accountId
      delete updateData.createdAt
      delete updateData.updatedAt

      const user = await prisma.user.update({
        where: { 
          id,
          accountId: getAccountId(req)
        },
        data: updateData
      })

      // Hide sensitive fields
      delete user.password
      delete user.stremioAuthKey

      res.json(user)
    } catch (error) {
      console.error('Error patching user:', error)
      res.status(500).json({ message: 'Failed to patch user' })
    }
  })

  // Toggle user status
  router.patch('/:id/toggle-status', async (req, res) => {
    try {
      const { id } = req.params
      const { isActive } = req.body

      const user = await prisma.user.update({
        where: { 
          id,
          accountId: getAccountId(req)
        },
        data: { isActive }
      })

      res.json({ 
        message: `User ${isActive ? 'enabled' : 'disabled'} successfully`,
        isActive: user.isActive
      })
    } catch (error) {
      console.error('Error toggling user status:', error)
      res.status(500).json({ message: 'Failed to toggle user status' })
    }
  })

  // Toggle protect status for a single addon (BY NAME ONLY)
  router.post('/:id/protect-addon', async (req, res) => {
    try {
      const { id } = req.params
      const { name } = req.body
      const { unsafe } = req.query
      
      // Default Stremio addons (name-based) in safe mode
      const defaultAddons = { names: ['Cinemeta', 'Local Files', 'Local Files (without catalog support)'] }

      // Check if this is a default addon in safe mode (match by name)
      const isDefaultAddon = typeof name === 'string' && defaultAddons.names.some((n) => (name || '').includes(n))
      
      if (isDefaultAddon && unsafe !== 'true') {
        return res.status(403).json({ 
          error: 'This addon is protected by default and cannot be unprotected in safe mode',
          isDefaultAddon: true
        })
      }
      
      // Get current user with protected addons
      const user = await prisma.user.findUnique({
        where: { 
          id,
          accountId: getAccountId(req)
        },
        select: { protectedAddons: true }
      })
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' })
      }
      
      // Parse current protected addons (encrypted strings of names)
      let currentEncrypted = []
      try {
        currentEncrypted = user.protectedAddons ? JSON.parse(user.protectedAddons) : []
      } catch (e) {
        console.warn('Failed to parse protected addons:', e)
        currentEncrypted = []
      }
      // Read current list of plaintext names from DB (already plaintext as of latest changes)
      const currentList = Array.isArray(user.protectedAddons) ? user.protectedAddons : (user.protectedAddons ? (() => { try { return JSON.parse(user.protectedAddons) } catch { return [] } })() : [])

      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'name is required' })
      }

      const targetName = name.trim()
      const targetNorm = targetName.toLowerCase()
      const nextList = Array.isArray(currentList) ? [...currentList] : []
      const idx = nextList.findIndex((n) => typeof n === 'string' && n.trim().toLowerCase() === targetNorm)
      if (idx >= 0) {
        nextList.splice(idx, 1)
      } else {
        nextList.push(targetName)
      }
      const nextPlain = nextList

      // Update user (store plaintext names)
      await prisma.user.update({
        where: { id },
        data: {
          protectedAddons: JSON.stringify(nextPlain)
        }
      })
      
      res.json({ 
        message: `Addon protected list updated`,
        protectedAddons: nextPlain,
        isProtected: nextList.findIndex((n) => typeof n === 'string' && n.trim().toLowerCase() === targetNorm) >= 0
      })
    } catch (error) {
      console.error('Error toggling protect addon:', error)
      res.status(500).json({ error: 'Failed to toggle protect addon' })
    }
  })

  // Reload all group addons for a user (fetch fresh manifests and update database)
  router.post('/:id/reload-addons', async (req, res) => {
    try {
      const { id } = req.params

      const user = await prisma.user.findUnique({
        where: { 
          id,
          accountId: getAccountId(req)
        },
        select: { 
          isActive: true
        }
      })

      if (!user) {
        return responseUtils.notFound(res, 'User')
      }

      if (!user.isActive) {
        return res.status(400).json({ message: 'User is disabled' })
      }

      // Get user's group
      const userGroup = await prisma.group.findFirst({
          where: {
            accountId: getAccountId(req),
            userIds: {
              contains: user.id
            }
          }
        })

      if (!userGroup) {
          return res.json({ 
          message: 'User not in any group, no addons to reload',
          reloadedCount: 0,
          failedCount: 0,
          total: 0
        })
      }

      // Call reloadGroupAddons on the user's group
      const reloadResult = await reloadGroupAddons(prisma, getAccountId, userGroup.id, req, decrypt)

        res.json({
        message: 'Group addons reloaded successfully',
        reloadedCount: reloadResult.reloadedCount,
        failedCount: reloadResult.failedCount,
        total: reloadResult.total
      })
    } catch (error) {
      console.error('Error in reload addons endpoint:', error)
      res.status(500).json({ message: 'Failed to reload user addons', error: error?.message })
    }
  })

  // Add specific addons to user's Stremio account
  router.post('/:id/stremio-addons/add', async (req, res) => {
    try {
      const { id } = req.params
      const { addonUrls } = req.body

      if (!Array.isArray(addonUrls) || addonUrls.length === 0) {
        return res.status(400).json({ message: 'addonUrls must be a non-empty array' })
      }

      const user = await prisma.user.findUnique({
        where: { 
          id,
          accountId: getAccountId(req)
        },
        select: { 
          stremioAuthKey: true,
          isActive: true
        }
      })

      if (!user) {
        return responseUtils.notFound(res, 'User')
      }

      if (!user.stremioAuthKey) {
        return res.status(400).json({ message: 'User not connected to Stremio' })
      }

      if (!user.isActive) {
        return res.status(400).json({ message: 'User is disabled' })
      }

      try {
        const authKeyPlain = decrypt(user.stremioAuthKey, req)
        const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })
        
        let addedCount = 0
        const results = []

        for (const addonUrl of addonUrls) {
          try {
            // Fetch addon manifest
            const manifestResponse = await fetch(addonUrl)
            if (!manifestResponse.ok) {
              throw new Error(`Failed to fetch manifest: ${manifestResponse.status}`)
            }
            const manifest = await manifestResponse.json()

            // Add to Stremio
            await apiClient.request('addonCollectionAdd', {
              addonId: addonUrl,
              manifest: manifest
            })

            addedCount++
            results.push({
              url: addonUrl,
              status: 'success',
              name: manifest.name || 'Unknown'
            })
          } catch (error) {
            console.error(`Error adding addon ${addonUrl}:`, error)
            results.push({
              url: addonUrl,
              status: 'error',
              error: error.message
            })
          }
        }

        res.json({
          message: 'Addons added successfully',
          addedCount,
          totalRequested: addonUrls.length,
          results
        })
      } catch (error) {
        console.error('Error adding Stremio addons:', error)
        res.status(500).json({ message: 'Failed to add addons', error: error?.message })
      }
    } catch (error) {
      console.error('Error in add Stremio addons endpoint:', error)
      res.status(500).json({ message: 'Failed to add addons', error: error?.message })
    }
  })

  // Get combined library/watch history from all users (for Activity page)
  // Loads all cached library files for active users
  router.get('/activity/library', async (req, res) => {
    try {
      const accountId = getAccountId(req)
      if (!accountId) {
        return res.status(401).json({ message: 'Unauthorized' })
      }

      // Get all active users with Stremio connections
      // For admin view, show all users regardless of visibility
      // For user-facing views, filter by activityVisibility (handled in frontend/user endpoints)
      const users = await prisma.user.findMany({
        where: {
          accountId: accountId,
          isActive: true,
          stremioAuthKey: { not: null }
        },
        select: {
          id: true,
          username: true,
          email: true,
          stremioAuthKey: true,
          colorIndex: true,
          activityVisibility: true
        }
      })

      if (users.length === 0) {
        return res.json({
          library: [],
          count: 0
        })
      }

      // Load all cached library files at once (only from this account's folder)
      const { getAllCachedLibraries, setCachedLibrary } = require('../utils/libraryCache')
      const userIds = users.map(u => u.id)
      const cachedLibraries = getAllCachedLibraries(accountId, userIds)
      
      const allLibraryItems = []
      const userMap = new Map() // Map user ID to user info for adding to items

      // Process each user's cached library
      // Note: This is an admin endpoint, so we include all users
      // Frontend will filter by visibility for user-facing views
      for (const user of users) {
        try {
          let library = cachedLibraries.get(user.id)
          
          // Check if cache only has removed items (stale cache) - if so, refresh from Stremio
          // Active items: removed === false (or missing/undefined, treated as in library)
          const hasActiveItems = library && Array.isArray(library) && library.some(item => {
            return item.removed === false || item.removed === undefined || item.removed === null;
          })
          
          // If no cache file exists or cache only has removed items, fetch from Stremio and cache it
          if (!library || !Array.isArray(library) || library.length === 0 || !hasActiveItems) {
            const authKeyPlain = decrypt(user.stremioAuthKey, req)
            const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })

            const libraryItems = await apiClient.request('datastoreGet', {
              collection: 'libraryItem',
              ids: [],
              all: true
            })

            library = Array.isArray(libraryItems) ? libraryItems : (libraryItems?.result || libraryItems?.library || [])
            
            // Cache the library data for future requests
            if (Array.isArray(library) && library.length > 0) {
              setCachedLibrary(accountId, user.id, library)
            }
          }

          // Add user info to each item
          library = library.map(item => ({
            ...item,
            _userId: user.id,
            _username: user.username || user.email,
            _userColorIndex: user.colorIndex || 0
          }))

          allLibraryItems.push(...library)
          userMap.set(user.id, { username: user.username, email: user.email })
        } catch (error) {
          console.error(`Error loading library for user ${user.id}:`, error)
          // Continue with other users
        }
      }

      // Process and expand items (same logic as single user endpoint)
      // Group by show ID + user ID to handle multiple users watching the same show
      const expandedLibrary = []
      const episodeItemsByShowAndUser = new Map() // Key: `${showId}:${userId}`
      
      for (const item of allLibraryItems) {
        if (item.type === 'movie') {
          expandedLibrary.push(item)
          continue
        }
        
        const isEpisodeItem = item._id && item._id.includes(':') && item._id.split(':').length >= 3
        
        if (isEpisodeItem) {
          const showId = item._id.split(':')[0]
          const userId = item._userId
          const key = `${showId}:${userId}`
          if (!episodeItemsByShowAndUser.has(key)) {
            episodeItemsByShowAndUser.set(key, [])
          }
          episodeItemsByShowAndUser.get(key).push(item)
          continue
        }
        
        // Just add the item as-is (no cinemeta expansion)
        expandedLibrary.push(item)
      }

      // Process episode items: only keep the latest episode per show per user
      episodeItemsByShowAndUser.forEach((episodes, key) => {
        const latestEpisode = findLatestEpisode(episodes)
        if (latestEpisode) {
          expandedLibrary.push(latestEpisode)
        }
      })

      // Sort by watch date in descending order (most recent first), using lastWatched only
      expandedLibrary.sort((a, b) => {
        const getWatchDate = (item) => {
          if (item.state?.lastWatched) {
            const date = new Date(item.state.lastWatched)
            if (!isNaN(date.getTime())) return date.getTime()
          }
          return 0
        }

        const dateA = getWatchDate(a)
        const dateB = getWatchDate(b)

        if (dateB === dateA) return 0
        return dateB - dateA
      })

        // Return all items (both removed and non-removed)
        // Frontend will filter based on viewType:
        // - Library mode: shows only non-removed items (removed: false)
        // - History mode: shows all watched items (based on _ctime) regardless of removed status

      res.json({
        library: expandedLibrary,
        count: expandedLibrary.length
      })
    } catch (error) {
      console.error('Error fetching combined library:', error)
      res.status(500).json({ message: 'Failed to fetch combined library', error: error?.message })
    }
  })

  // Get like/love status for a media item in Stremio
  router.get('/:userId/status', async (req, res) => {
    try {
      const { userId } = req.params
      const { mediaId, mediaType } = req.query
      const accountId = getAccountId(req)

      if (!mediaId || !mediaType) {
        return res.status(400).json({ message: 'mediaId and mediaType are required' })
      }

      // Get user
      const user = await prisma.user.findUnique({
        where: { 
          id: userId,
          accountId: accountId
        },
        select: { 
          stremioAuthKey: true,
          isActive: true
        }
      })

      if (!user || !user.isActive) {
        return res.status(404).json({ message: 'User not found or inactive' })
      }

      if (!user.stremioAuthKey) {
        return res.status(400).json({ message: 'User not connected to Stremio' })
      }

      // Decrypt auth key
      const authKeyPlain = decrypt(user.stremioAuthKey, req)

      // Call Stremio likes API to get status
      const response = await fetch(`https://likes.stremio.com/api/get_status?authToken=${encodeURIComponent(authKeyPlain)}&mediaId=${encodeURIComponent(mediaId)}&mediaType=${encodeURIComponent(mediaType)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`[Get Status] Stremio API error: ${response.status} - ${errorText}`)
        return res.status(response.status).json({ 
          message: 'Failed to get like/love status',
          error: errorText 
        })
      }

      const data = await response.json().catch(() => ({}))
      // Stremio returns { status: 'liked' | 'loved' | null }
      res.json({ status: data.status || null })
    } catch (error) {
      console.error('Error getting like/love status:', error)
      res.status(500).json({ message: 'Failed to get like/love status', error: error?.message })
    }
  })

  // Update like/love status for a media item in Stremio
  router.post('/:userId/statusUpdate', async (req, res) => {
    try {
      const { userId } = req.params
      const { mediaId, mediaType, status } = req.body // status: 'liked', 'loved', or null
      const accountId = getAccountId(req)

      if (!mediaId || !mediaType) {
        return res.status(400).json({ message: 'mediaId and mediaType are required' })
      }

      if (status !== null && status !== undefined && !['liked', 'loved'].includes(status)) {
        return res.status(400).json({ message: 'status must be "liked", "loved", or null' })
      }

      // Get user
      const user = await prisma.user.findUnique({
        where: { 
          id: userId,
          accountId: accountId
        },
        select: { 
          stremioAuthKey: true,
          isActive: true
        }
      })

      if (!user || !user.isActive) {
        return res.status(404).json({ message: 'User not found or inactive' })
      }

      if (!user.stremioAuthKey) {
        return res.status(400).json({ message: 'User not connected to Stremio' })
      }

      // Decrypt auth key
      const authKeyPlain = decrypt(user.stremioAuthKey, req)

      // Call Stremio likes API
      const response = await fetch('https://likes.stremio.com/api/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          authToken: authKeyPlain,
          mediaId: mediaId,
          mediaType: mediaType, // 'series' or 'movie'
          status: status // 'liked', 'loved', or null to unlike/unlove
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`[Like/Love] Stremio API error: ${response.status} - ${errorText}`)
        return res.status(response.status).json({ 
          message: 'Failed to update like/love status',
          error: errorText 
        })
      }

      const data = await response.json().catch(() => ({}))
      res.json({ success: true, data })
    } catch (error) {
      console.error('Error updating like/love status:', error)
      res.status(500).json({ message: 'Failed to update like/love status', error: error?.message })
    }
  })

  // Toggle library status (add/remove) for selected items
  router.post('/:userId/library/toggle', async (req, res) => {
    try {
      const { userId } = req.params
      const { items } = req.body // Array of { itemId, itemType, itemName, poster, addToLibrary }
      const accountId = getAccountId(req)

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: 'items array is required' })
      }

      // Get user
      const user = await prisma.user.findUnique({
        where: { 
          id: userId,
          accountId: accountId
        },
        select: { 
          stremioAuthKey: true,
          isActive: true
        }
      })

      if (!user || !user.isActive) {
        return res.status(404).json({ message: 'User not found or inactive' })
      }

      if (!user.stremioAuthKey) {
        return res.status(400).json({ message: 'User not connected to Stremio' })
      }

      // Decrypt auth key
      const authKeyPlain = decrypt(user.stremioAuthKey, req)

      const { toggleLibraryItemsBatch } = require('../utils/libraryToggle')
      const { clearCache, setCachedLibrary } = require('../utils/libraryCache')

      // Process all items in a single batch call (1 API call per user)
      let batchResult
      try {
        batchResult = await toggleLibraryItemsBatch({
          authKey: authKeyPlain,
          items: items,
          logPrefix: `[LibraryToggle] User ${userId}`
        })
      } catch (error) {
        console.error(`[LibraryToggle] Failed to toggle library items for user ${userId}:`, error)
        console.error(`[LibraryToggle] Error stack:`, error?.stack)
        clearCache(accountId, userId)
        return res.status(500).json({ 
          error: 'Failed to toggle library items', 
          message: error?.message || String(error),
          success: false,
          successCount: 0,
          errorCount: items.length,
          results: items.map(item => ({ itemId: item.itemId, success: false, error: error?.message }))
        })
      }

      // Wait a moment for Stremio to process the changes before refreshing cache
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Fetch updated library from Stremio and update cache
      try {
        const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })
        const libraryItems = await apiClient.request('datastoreGet', {
          collection: 'libraryItem',
          ids: [],
          all: true
        })
        
        let library = []
        if (Array.isArray(libraryItems)) {
          library = libraryItems
        } else if (libraryItems?.result) {
          library = Array.isArray(libraryItems.result) ? libraryItems.result : [libraryItems.result]
        } else if (libraryItems?.library) {
          library = Array.isArray(libraryItems.library) ? libraryItems.library : [libraryItems.library]
        }
        
        if (Array.isArray(library) && library.length > 0) {
          setCachedLibrary(accountId, userId, library)
          console.log(`[LibraryToggle] Updated cache for user ${userId} with ${library.length} items`)
        }
      } catch (cacheError) {
        console.error(`[LibraryToggle] Failed to refresh cache for user ${userId}:`, cacheError)
        // Clear cache as fallback so it will be refreshed on next request
        clearCache(accountId, userId)
      }

      const successCount = batchResult?.processedCount || 0
      const errorCount = items.length - successCount

      // Build results array for response
      const results = items.map((item, index) => ({
        itemId: item.itemId,
        success: index < successCount,
        error: index < successCount ? undefined : 'Item was skipped or failed'
      }))

      res.json({ 
        success: errorCount === 0,
        results,
        successCount,
        errorCount
      })
    } catch (error) {
      console.error('Error toggling library items:', error)
      res.status(500).json({ error: 'Failed to toggle library items', message: error?.message })
    }
  })

  // Delete a library item from a user's Stremio library
  router.delete('/:userId/library/:itemId', async (req, res) => {
    try {
      const { userId, itemId } = req.params
      const accountId = getAccountId(req)

      // Get user
      const user = await prisma.user.findUnique({
        where: { 
          id: userId,
          accountId: accountId
        },
        select: { 
          stremioAuthKey: true,
          isActive: true
        }
      })

      if (!user) {
        return res.status(404).json({ error: 'User not found' })
      }

      if (!user.isActive) {
        return res.status(400).json({ error: 'User is disabled' })
      }

      if (!user.stremioAuthKey) {
        return res.status(400).json({ error: 'User not connected to Stremio' })
      }

      // Decrypt auth key
      const authKeyPlain = decrypt(user.stremioAuthKey, req)

      const { markLibraryItemRemoved } = require('../utils/libraryDelete')

      try {
        await markLibraryItemRemoved({
          authKey: authKeyPlain,
          itemId,
          logPrefix: '[users/delete-library-item]'
        })
      } catch (deleteError) {
        if (deleteError.code === 'NOT_FOUND') {
          return res.status(404).json({ error: 'Library item not found', itemId: deleteError.meta?.itemId })
        }
        console.error('[users] Error deleting library item via helper:', deleteError)
        return res.status(500).json({ error: 'Failed to delete library item', message: deleteError?.message })
      }

      // Clear the cache for this user so it refreshes on next request
      const { clearCache } = require('../utils/libraryCache')
      clearCache(accountId, userId)

      res.json({ 
        success: true,
        message: 'Library item deleted successfully'
      })
    } catch (error) {
      console.error('Error deleting library item:', error)
      res.status(500).json({ error: 'Failed to delete library item', message: error?.message })
    }
  })

  // Backup user's library (download as JSON)
  router.get('/:id/library/backup', async (req, res) => {
    try {
      const { id } = req.params
      const accountId = getAccountId(req)

      // Get user
      const user = await prisma.user.findUnique({
        where: { 
          id,
          accountId: accountId
        },
        select: { 
          stremioAuthKey: true,
          isActive: true,
          username: true,
          email: true
        }
      })

      if (!user) {
        return res.status(404).json({ error: 'User not found' })
      }

      if (!user.isActive) {
        return res.status(400).json({ error: 'User is disabled' })
      }

      if (!user.stremioAuthKey) {
        return res.status(400).json({ error: 'User not connected to Stremio' })
      }

      // Decrypt auth key
      const authKeyPlain = decrypt(user.stremioAuthKey, req)
      const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })

      // Get all library items
      const libraryItems = await apiClient.request('datastoreGet', {
        collection: 'libraryItem',
        ids: [],
        all: true
      })

      let library = Array.isArray(libraryItems) ? libraryItems : (libraryItems?.result || libraryItems?.library || [])

      // Find the latest modification time for filename
      let lastModified = 0
      for (const item of library) {
        const mtime = item._mtime || item.mtime || 0
        if (mtime > lastModified) {
          lastModified = mtime
        }
      }

      // Generate filename: Stremio-Library-{email/username}-{timestamp}.json
      const userIdentifier = user.email || user.username || 'user'
      const timestamp = lastModified || Date.now()
      const filename = `Stremio-Library-${userIdentifier}-${timestamp}.json`

      // Set headers for file download
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)

      // Send JSON response
      res.json(library)
    } catch (error) {
      console.error('Error backing up library:', error)
      res.status(500).json({ error: 'Failed to backup library', message: error?.message })
    }
  })

  // Get user's library/watch history
  router.get('/:id/library', async (req, res) => {
    try {
      const { id } = req.params

      const user = await prisma.user.findUnique({
        where: { 
          id,
          accountId: getAccountId(req)
        },
        select: { 
          stremioAuthKey: true,
          isActive: true
        }
      })

      if (!user) {
        return responseUtils.notFound(res, 'User')
      }

      if (!user.stremioAuthKey) {
        return res.status(400).json({ message: 'User not connected to Stremio' })
      }

      if (!user.isActive) {
        return res.status(400).json({ message: 'User is disabled' })
      }

      try {
        // Use cached library data (updated every 5 minutes by activity monitor)
        const accountId = getAccountId(req)
        const { getCachedLibrary, setCachedLibrary } = require('../utils/libraryCache')
        let library = getCachedLibrary(accountId, id)
        
        // If no cache, fetch from Stremio and cache it
        if (!library || !Array.isArray(library) || library.length === 0) {
          const authKeyPlain = decrypt(user.stremioAuthKey, req)
          const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })

          // Get library items from Stremio API using datastoreGet
          const libraryItems = await apiClient.request('datastoreGet', {
            collection: 'libraryItem',
            ids: [],
            all: true
          })

          // The response might be wrapped or direct array
          library = Array.isArray(libraryItems) ? libraryItems : (libraryItems?.result || libraryItems?.library || [])
          
          // Cache the library data
          if (Array.isArray(library) && library.length > 0) {
            setCachedLibrary(accountId, id, library)
          }
        }

        // Expand series into individual episodes
        // Stremio stores one library item per show with a watched bitfield
        // We only want to show the latest episode per show (since we only have show-level watch dates)
        const expandedLibrary = []
        const episodeItemsByShow = new Map() // Track episode items by show ID
        
        // First pass: collect all items
        for (const item of library) {
          // Movies: add as-is
          if (item.type === 'movie') {
            expandedLibrary.push(item)
            continue
          }
          
          // Series: Check if Stremio already returned per-episode items
          // If the _id contains episode info (format: "tt1234567:season:episode"), it's already an episode item
          const isEpisodeItem = item._id && item._id.includes(':') && item._id.split(':').length >= 3
          
          if (isEpisodeItem) {
            // Stremio already returned this as a separate episode item
            // Group by show ID to find the latest episode per show
            const showId = item._id.split(':')[0] // Get base show ID (e.g., "tt0096697" from "tt0096697:0:1")
            if (!episodeItemsByShow.has(showId)) {
              episodeItemsByShow.set(showId, [])
            }
            episodeItemsByShow.get(showId).push(item)
            continue
          }
          
          // Just add the item as-is (no cinemeta expansion)
          expandedLibrary.push(item)
        }

        // Process episode items: only keep the latest episode per show
        episodeItemsByShow.forEach((episodes, showId) => {
          const latestEpisode = findLatestEpisode(episodes, { inheritPoster: true })
          if (latestEpisode) {
            expandedLibrary.push(latestEpisode)
          }
        })

        // Enrich items with missing posters from Cinemeta
        await enrichPostersFromCinemeta(expandedLibrary)

        // Sort by watch date in descending order (most recent first), using the least-recent of _mtime vs lastWatched
        expandedLibrary.sort((a, b) => {
          const getWatchDate = (item) => {
            const dates = []
            if (item._mtime) {
              const d = new Date(item._mtime)
              if (!isNaN(d.getTime())) dates.push(d.getTime())
            }
            if (item.state?.lastWatched) {
              const d = new Date(item.state.lastWatched)
              if (!isNaN(d.getTime())) dates.push(d.getTime())
            }
            if (dates.length === 0) return 0
            return Math.min(...dates)
          }

          const dateA = getWatchDate(a)
          const dateB = getWatchDate(b)

          // Descending order (most recent first) - higher timestamp comes first
          // If dates are equal, maintain original order
          if (dateB === dateA) return 0
          return dateB - dateA
        })

        // Debug: log first few items to verify sorting
        if (expandedLibrary.length > 0) {
          console.log('Library sorted by date (first 5 items, using min(_mtime,lastWatched)):')
          expandedLibrary.slice(0, 5).forEach((item, idx) => {
            const dates = []
            if (item._mtime) dates.push(item._mtime)
            if (item.state?.lastWatched) dates.push(item.state.lastWatched)
            const date = dates.length ? Math.min(...dates.map(d => new Date(d).getTime())) : null
            console.log(`${idx + 1}. ${item.name} - ${date}`)
          })
        }

        res.json({
          library: expandedLibrary,
          count: expandedLibrary.length
        })
      } catch (error) {
        console.error('Error fetching library items:', error)
        res.status(500).json({ message: 'Failed to fetch library items', error: error?.message })
      }
    } catch (error) {
      console.error('Error in get library endpoint:', error)
      res.status(500).json({ message: 'Failed to fetch library items', error: error?.message })
    }
  })

  // Clear all Stremio addons from user's account
  router.post('/:id/stremio-addons/clear', async (req, res) => {
    try {
      const { id } = req.params

      const user = await prisma.user.findUnique({
        where: { 
          id,
          accountId: getAccountId(req)
        },
        select: { 
          stremioAuthKey: true,
          isActive: true
        }
      })

      if (!user) {
        return responseUtils.notFound(res, 'User')
      }

      if (!user.stremioAuthKey) {
        return res.status(400).json({ message: 'User not connected to Stremio' })
      }

      if (!user.isActive) {
        return res.status(400).json({ message: 'User is disabled' })
      }

      try {
        const authKeyPlain = decrypt(user.stremioAuthKey, req)
        const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })

        // Clear all addons
        const { clearAddons } = require('../utils/addonHelpers')
        await clearAddons(apiClient)

        res.json({
          message: 'All addons cleared successfully',
          clearedCount: 0
        })
      } catch (error) {
        console.error('Error clearing Stremio addons:', error)
        res.status(500).json({ message: 'Failed to clear addons', error: error?.message })
      }
    } catch (error) {
      console.error('Error in clear Stremio addons endpoint:', error)
      res.status(500).json({ message: 'Failed to clear addons', error: error?.message })
    }
  })

  // Delete Stremio addon from user's account
  router.delete('/:id/stremio-addons/:addonName', async (req, res) => {
    try {
      const { id, addonName } = req.params
      const { unsafe } = req.query
      
      // Get user to check for user-defined protected addons and Stremio auth
      const user = await prisma.user.findUnique({
        where: { 
          id,
          accountId: getAccountId(req)
        },
        select: { 
          stremioAuthKey: true,
          isActive: true,
          protectedAddons: true
        }
      })

      if (!user) {
        return responseUtils.notFound(res, 'User')
      }

      if (!user.stremioAuthKey) {
        return res.status(400).json({ message: 'User not connected to Stremio' })
      }

      if (!user.isActive) {
        return res.status(400).json({ message: 'User is disabled' })
      }

      // Protected addons logic (name-based):
      // 1. Default Stremio addons: protected in safe mode, not protected in unsafe mode
      // 2. User-defined protected addons: ALWAYS protected regardless of mode
      const { defaultAddons } = require('../utils/config')
      const normalizeName = (n) => String(n || '').trim().toLowerCase()
      const targetNameNormalized = normalizeName(addonName)
      
      // Default protected addon names (only in safe mode)
      const defaultProtectedNames = unsafe === 'true' ? [] : (defaultAddons.names || [])
      const defaultProtectedNameSet = new Set(defaultProtectedNames.map(normalizeName))
      
      // Parse user-defined protected addons (ALWAYS protected regardless of mode) - stored as plaintext names
      let userProtectedNames = []
      try {
        const parsed = user.protectedAddons ? JSON.parse(user.protectedAddons) : []
        if (Array.isArray(parsed)) {
          userProtectedNames = parsed.map(n => normalizeName(n)).filter(Boolean)
        }
      } catch (e) {
        console.warn('Failed to parse user protected addons in delete:', e)
        userProtectedNames = []
      }
      
      const userProtectedNameSet = new Set(userProtectedNames)
      const allProtectedNameSet = new Set([...defaultProtectedNameSet, ...userProtectedNameSet])
      
      // Check if the addon being deleted is protected (by name)
      const isProtected = allProtectedNameSet.has(targetNameNormalized)
      
      // In unsafe mode, allow deletion of default Stremio addons but not user-defined protected addons
      if (isProtected && (unsafe !== 'true' || userProtectedNameSet.has(targetNameNormalized))) {
        return res.status(403).json({ message: 'This addon is protected and cannot be deleted' })
      }

      // Decrypt stored auth key
      let authKeyPlain
      try {
        authKeyPlain = decrypt(user.stremioAuthKey, req)
      } catch (e) {
        return res.status(500).json({ message: 'Failed to decrypt Stremio credentials' })
      }

      // Use StremioAPIClient with proper addon collection format
      const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })

      // 1) Pull current collection
      const current = await apiClient.request('addonCollectionGet', {})
      const currentAddonsRaw = current?.addons || current || []
      const currentAddons = Array.isArray(currentAddonsRaw)
        ? currentAddonsRaw
        : (typeof currentAddonsRaw === 'object' ? Object.values(currentAddonsRaw) : [])

      // Filter out the target addon by matching name (normalized)
      let filteredAddons = currentAddons
      try {
        filteredAddons = currentAddons.filter((a) => {
          const addonName = a?.manifest?.name || a?.transportName || a?.name || ''
          return normalizeName(addonName) !== targetNameNormalized
        })

        // Set the filtered addons using the proper format
        await apiClient.request('addonCollectionSet', { addons: filteredAddons })
      } catch (e) {
        console.error(`❌ Failed to remove addon:`, e.message)
        throw e
      }

      return res.json({ message: 'Addon removed from Stremio account successfully' })
    } catch (error) {
      console.error('Error removing Stremio addon:', error)
      return res.status(502).json({ message: 'Failed to remove addon from Stremio', error: error?.message })
    }
  })

  // Connect user with auth key
  router.post('/:id/connect-stremio-authkey', async (req, res) => {
    try {
      const { id } = req.params
      const { authKey } = req.body

      if (!authKey) {
        return res.status(400).json({ message: 'Auth key is required' })
      }

      const user = await prisma.user.findUnique({
        where: { 
          id,
          accountId: getAccountId(req)
        }
      })

      if (!user) {
        return responseUtils.notFound(res, 'User')
      }

      // Encrypt and store the auth key
      const encryptedAuthKey = encrypt(authKey, req)

      await prisma.user.update({
        where: { 
          id,
          accountId: getAccountId(req)
        },
        data: {
          stremioAuthKey: encryptedAuthKey,
          isActive: true
        }
      })

      res.json({ message: 'Stremio connection established successfully' })
    } catch (error) {
      console.error('Error connecting user with auth key:', error)
      res.status(500).json({ message: 'Failed to connect user', error: error?.message })
    }
  })

  // Clear Stremio credentials
  router.post('/:id/clear-stremio-credentials', async (req, res) => {
    try {
      const { id } = req.params

      const user = await prisma.user.findUnique({
        where: { 
          id,
          accountId: getAccountId(req)
        }
      })

      if (!user) {
        return responseUtils.notFound(res, 'User')
      }

      // Clear Stremio credentials
      await prisma.user.update({
        where: { 
          id,
          accountId: getAccountId(req)
        },
        data: {
          stremioAuthKey: null,
          isActive: false // Disconnect user since Stremio credentials are cleared
        }
      })

      res.json({ message: 'Stremio credentials cleared successfully' })
    } catch (error) {
      console.error('Error clearing Stremio credentials:', error)
      res.status(500).json({ message: 'Failed to clear Stremio credentials', error: error?.message })
    }
  })

  // Connect existing user to Stremio
  router.post('/:id/connect-stremio', async (req, res) => {
    try {
      const { id } = req.params
      const { password, authKey } = req.body

      if (!password || !authKey) {
        return res.status(400).json({ message: 'Password and authKey are required' })
      }

      const user = await prisma.user.findUnique({
        where: { 
          id,
          accountId: getAccountId(req)
        }
      })

      if (!user) {
        return responseUtils.notFound(res, 'User')
      }

      // Encrypt and store the auth key
      const encryptedAuthKey = encrypt(authKey, req)

      await prisma.user.update({
        where: { 
          id,
          accountId: getAccountId(req)
        },
        data: {
          stremioAuthKey: encryptedAuthKey,
          isActive: true
        }
      })

      res.json({ message: 'Stremio connection established successfully' })
    } catch (error) {
      console.error('Error connecting user to Stremio:', error)
      res.status(500).json({ message: 'Failed to connect user to Stremio', error: error?.message })
    }
  })

  // Import addons from a user
  router.post('/:id/import-addons', async (req, res, next) => {
    try {
      // Compatibility shim: if payload already contains addons array (new flow), or addonUrls (legacy),
      // normalize and forward to the enhanced handler declared later in this file.
      if (Array.isArray(req.body?.addons) || Array.isArray(req.body?.addonUrls)) {
        if (!Array.isArray(req.body.addons) && Array.isArray(req.body.addonUrls)) {
          req.body.addons = req.body.addonUrls.map((url) => ({ url, manifestUrl: url }))
        }
        return next()
      }
      const { id } = req.params
      const { addonUrls } = req.body

      if (!Array.isArray(addonUrls) || addonUrls.length === 0) {
        return res.status(400).json({ message: 'addonUrls must be a non-empty array' })
      }

      const user = await prisma.user.findUnique({
        where: { 
          id,
          accountId: getAccountId(req)
        }
      })

      if (!user) {
        return responseUtils.notFound(res, 'User')
      }

      // Find groups that contain this user
      const groups = await prisma.group.findMany({
        where: {
          accountId: getAccountId(req),
          userIds: {
            contains: user.id
          }
        }
      })

      if (groups.length === 0) {
        return res.status(400).json({ message: 'User is not in any groups' })
      }

      const group = groups[0] // Use first group
      let importedCount = 0
      const results = []

      for (const addonUrl of addonUrls) {
        try {
          // Fetch addon manifest
          const manifestResponse = await fetch(addonUrl)
          if (!manifestResponse.ok) {
            throw new Error(`Failed to fetch manifest: ${manifestResponse.status}`)
          }
          const manifest = await manifestResponse.json()

          // Check if addon already exists
          const existingAddon = await prisma.addon.findFirst({
            where: {
              accountId: getAccountId(req),
              manifestUrlHash: manifestUrlHmac(req, addonUrl)
            }
          })

          if (existingAddon) {
            // Check if addon is already in the group
            const existingGroupAddon = await prisma.groupAddon.findFirst({
              where: {
                groupId: group.id,
                addonId: existingAddon.id
              }
            })

            if (!existingGroupAddon) {
              // Add existing addon to group
              await prisma.groupAddon.create({
                data: {
                  groupId: group.id,
                  addonId: existingAddon.id,
                  isEnabled: true
                }
              })
              importedCount++
            }
            results.push({
              url: addonUrl,
              status: 'added_to_group',
              name: manifest.name || 'Unknown'
            })
          } else {
            // Create new addon
            const newAddon = await prisma.addon.create({
              data: {
                accountId: getAccountId(req),
                name: manifest.name || 'Unknown',
                description: manifest.description || '',
                version: manifest.version || null,
                iconUrl: manifest.logo || null,
                stremioAddonId: manifest.id || null,
                isActive: true,
                manifestUrl: encrypt(addonUrl, req),
                manifestUrlHash: manifestUrlHmac(req, addonUrl),
                manifest: encrypt(JSON.stringify(manifest), req),
                manifestHash: manifestHash(manifest)
              }
            })

            // Add to group
            await prisma.groupAddon.create({
              data: {
                groupId: group.id,
                addonId: newAddon.id,
                isEnabled: true
              }
            })

            importedCount++
            results.push({
              url: addonUrl,
              status: 'created_and_added',
              name: manifest.name || 'Unknown'
            })
          }
        } catch (error) {
          console.error(`Error importing addon ${addonUrl}:`, error)
          results.push({
            url: addonUrl,
            status: 'error',
            error: error.message
          })
        }
      }

      if (importedCount === 0) {
        return res.status(400).json({ 
          message: 'No new addons were imported. All addons already exist in the group.',
          importedCount: 0,
          results
        })
      }

      res.json({
        message: `Successfully imported ${importedCount} addons to group "${group.name}"`,
        importedCount,
        totalRequested: addonUrls.length,
        results
      })
    } catch (error) {
      console.error('Error importing addons:', error)
      res.status(500).json({ message: 'Failed to import addons', error: error?.message })
    }
  })

  // Reorder Stremio addons for a user (by manifest.name ONLY)
  router.post('/:id/stremio-addons/reorder', async (req, res) => {
    try {
      const { id: userId } = req.params
      const { orderedNames } = req.body || {}
      
      // Require orderedNames strictly
      if (!Array.isArray(orderedNames) || orderedNames.length === 0) {
        return res.status(400).json({ message: 'orderedNames array is required' })
      }
      
      // Get the user
      const user = await prisma.user.findUnique({
        where: { 
          id: userId,
          accountId: getAccountId(req)
        }
      })
      
      if (!user) {
        return responseUtils.notFound(res, 'User')
      }
      
      if (!user.stremioAuthKey) {
        return res.status(400).json({ message: 'User is not connected to Stremio' })
      }
      
      // Decrypt auth key
      let authKeyPlain
      try { 
        authKeyPlain = decrypt(user.stremioAuthKey, req) 
      } catch { 
        return res.status(500).json({ message: 'Failed to decrypt Stremio credentials' }) 
      }
      
      // Use StremioAPIClient to get current addons
      const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })
      const current = await apiClient.request('addonCollectionGet', {})
      const currentAddons = current?.addons || []
      
      // Build a map name -> queue of addons with that name to handle duplicates
      const nameToAddons = new Map()
      for (const addon of currentAddons) {
        const name = addon?.manifest?.name || addon?.transportName || 'Addon'
        if (!nameToAddons.has(name)) nameToAddons.set(name, [])
        nameToAddons.get(name).push(addon)
        }
      
      // Validate all names exist
      const invalidNames = orderedNames.filter((n) => !nameToAddons.has(n))
      if (invalidNames.length > 0) {
        return res.status(400).json({ message: 'Some addon names not found in current collection', invalidNames })
      }
      
      // Build reordered list by consuming from queues to preserve duplicates order
      const reorderedAddons = []
      for (const n of orderedNames) {
        const q = nameToAddons.get(n)
        if (q && q.length > 0) {
          reorderedAddons.push(q.shift())
        }
      }

      // Append any remaining addons (names not specified) after the ordered ones, preserving original order
      for (const [_, q] of nameToAddons.entries()) {
        while (q.length > 0) reorderedAddons.push(q.shift())
      }
      
      // Set the reordered collection
      await apiClient.request('addonCollectionSet', { addons: reorderedAddons })
      
      res.json({ 
        message: 'Addons reordered successfully (by name)',
        reorderedCount: reorderedAddons.length
      })
    } catch (error) {
      console.error('Error reordering Stremio addons:', error)
      res.status(500).json({ message: 'Failed to reorder addons', error: error?.message })
    }
  });

  // Protect addon
  router.post('/:id/protect-addon', async (req, res) => {
    try {
      const { id } = req.params
      const { addonId, manifestUrl } = req.body
      const { unsafe } = req.query
      
      
      // Resolve target URL to protect/unprotect
      let targetUrl = null
      try {
        if (typeof manifestUrl === 'string' && manifestUrl.trim()) {
          targetUrl = manifestUrl.trim()
        } else if (typeof addonId === 'string' && /^https?:\/\//i.test(addonId)) {
          targetUrl = addonId.trim()
        } else if (typeof addonId === 'string' && addonId.trim()) {
          const found = await prisma.addon.findFirst({
            where: { id: addonId.trim(), accountId: getAccountId(req) }
          })
          if (found && found.manifestUrl) {
            try { targetUrl = decrypt(found.manifestUrl, req) } catch { targetUrl = found.manifestUrl }
          }
        }
      } catch {}

      // Check if this is a default addon in safe mode (match by ID or URL)
      const isDefaultAddon = (typeof addonId === 'string' && defaultAddons.ids.includes(addonId)) ||
                             (typeof targetUrl === 'string' && defaultAddons.manifestUrls.includes(targetUrl)) ||
                             (typeof addonId === 'string' && defaultAddons.names.some(name => addonId.includes(name)))
      
      if (isDefaultAddon && unsafe !== 'true') {
        return res.status(403).json({ 
          error: 'This addon is protected by default and cannot be unprotected in safe mode',
          isDefaultAddon: true
        })
      }
      
      // Get current user with protected addons
      const user = await prisma.user.findUnique({
        where: { 
          id,
          accountId: getAccountId(req)
        },
        select: { protectedAddons: true }
      })
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' })
      }
      
      // Parse current protected addons (stored as encrypted manifest URLs)
      let currentEncrypted = []
      try {
        currentEncrypted = user.protectedAddons ? JSON.parse(user.protectedAddons) : []
      } catch (e) {
        console.warn('Failed to parse protected addons:', e)
        currentEncrypted = []
      }
      // Decrypt existing to URLs for comparison
      const currentUrls = currentEncrypted.map((enc) => { try { return decrypt(enc, req) } catch { return null } }).filter((u) => typeof u === 'string' && u.trim())

      if (!targetUrl || !/^https?:\/\//i.test(String(targetUrl))) {
        return res.status(400).json({ error: 'manifestUrl required or resolvable' })
      }

      const isCurrentlyProtected = currentUrls.includes(targetUrl)
      const nextUrls = isCurrentlyProtected ? currentUrls.filter((u) => u !== targetUrl) : [...currentUrls, targetUrl]
      const nextEncrypted = nextUrls.map((u) => { try { return encrypt(u, req) } catch { return null } }).filter(Boolean)

      // Update user (store encrypted URLs)
      await prisma.user.update({
        where: { id },
        data: {
          protectedAddons: JSON.stringify(nextEncrypted)
        }
      })
      
      res.json({ 
        message: `Addon ${isCurrentlyProtected ? 'unprotected' : 'protected'} successfully`,
        isProtected: !isCurrentlyProtected,
        protectedAddons: nextUrls
      })
    } catch (error) {
      console.error('Error toggling protect addon:', error)
      res.status(500).json({ error: 'Failed to toggle protect addon' })
    }
  });

  // Connect user with Stremio auth key
  router.post('/:id/connect-stremio-authkey', async (req, res) => {
    try {
      const { id } = req.params
      const { authKey } = req.body
      if (!authKey) return res.status(400).json({ message: 'authKey is required' })

      const user = await prisma.user.findUnique({ 
        where: { 
          id,
          accountId: getAccountId(req)
        }
      })
      if (!user) return res.status(404).json({ message: 'User not found' })

      // Validate auth key
      let addonsData = {}
      let verifiedUser = null
      try {
        const validation = await validateStremioAuthKey(authKey)
        addonsData = (validation && validation.addons) || {}
        verifiedUser = validation && validation.user ? validation.user : null
      } catch (e) {
        const msg = (e && (e.message || e.error || '')) || ''
        const code = (e && e.code) || 0
        if (code === 1 || /session does not exist/i.test(String(msg))) {
          return res.status(401).json({ message: 'Invalid or expired Stremio auth key' })
        }
        return res.status(400).json({ message: 'Could not validate auth key' })
      }

      const encryptedAuthKey = encrypt(authKey, req)

      const updated = await prisma.user.update({
        where: { id },
        data: {
          stremioAuthKey: encryptedAuthKey,
          stremioAddons: JSON.stringify(addonsData || {}),
          email: verifiedUser?.email ? verifiedUser.email.toLowerCase() : undefined,
          isActive: true, // Reconnect user since they now have valid Stremio connection
        },
      })

      delete updated.password
      delete updated.stremioAuthKey
      return res.json(updated)
    } catch (e) {
      console.error('connect-stremio-authkey failed:', e)
      return res.status(500).json({ message: 'Failed to connect existing user with authKey' })
    }
  });

  // Clear Stremio credentials
  router.post('/:id/clear-stremio-credentials', async (req, res) => {
    try {
      const { id } = req.params;
      
      // Use the middleware-protected user (ensures account isolation)
      const existingUser = await prisma.user.findUnique({
        where: { id }
      });

      if (!existingUser) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Clear Stremio credentials
      const updatedUser = await prisma.user.update({
        where: { 
          id,
          accountId: getAccountId(req)
        },
        data: {
          stremioAuthKey: null,
          stremioAddons: null,
          isActive: false, // Disconnect user since Stremio credentials are cleared
        },
      });

      res.json({ message: 'Stremio credentials cleared successfully', userId: updatedUser.id });
    } catch (error) {
      console.error('Error clearing Stremio credentials:', error);
      res.status(500).json({ message: 'Failed to clear Stremio credentials', error: error?.message });
    }
  });

  // Connect existing user to Stremio
  router.post('/:id/connect-stremio', async (req, res) => {
    try {
      const safe = (() => { const { password: _pw, authKey: _ak, ...rest } = (req.body || {}); return rest })()
      console.log('🚀 Connect Stremio endpoint called with:', req.params.id, safe);
    } catch {
      console.log('🚀 Connect Stremio endpoint called with:', req.params.id, '{redacted}')
    }
    try {
      const { id } = req.params;
      const { email, password, username } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
      }
      
      // Use the middleware-protected user (ensures account isolation)
      const existingUser = await prisma.user.findUnique({
        where: { id }
      });
      
      if (!existingUser) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      // Check if user already has Stremio credentials
      // Allow reconnection - we'll update the stremioAuthKey with new credentials
      
      // Create a temporary storage object for this authentication session
      const tempStorage = {};
      
      // Create Stremio API store for this user
      const apiStore = new StremioAPIStore({
        endpoint: 'https://api.strem.io',
        storage: {
          getJSON: (key) => {
            if (tempStorage[key] !== undefined) {
              return tempStorage[key];
            }
            switch (key) {
              case 'addons':
                return [];
              case 'user':
                return null;
              case 'auth':
                return null;
              default:
                return null;
            }
          },
          setJSON: (key, value) => {
            tempStorage[key] = value;
          }
        }
      });
      
      // Create Stremio API client
      const apiClient = new StremioAPIClient(apiStore);
      
      // Authenticate with Stremio using the same method as new user creation
      const loginEmailOnly = async () => {
        let lastErr
        for (const attempt of [
          () => apiStore.login({ email, password }),
          () => apiStore.login(email, password),
        ]) {
          try {
            await attempt()
            return
          } catch (e) {
            lastErr = e
          }
        }
        throw lastErr
      }
      
      try {
        await loginEmailOnly()
      } catch (e) {
        console.error('Stremio connection error:', e);
        
        // Use centralized Stremio error handling
        return handleStremioError(e, res);
      }
      
      // Pull user's addon collection from Stremio
      await apiStore.pullAddonCollection();
      
      // Get authentication data from the API store (support both possible keys)
      const authKey = apiStore.authKey || tempStorage.auth || tempStorage.authKey;
      const userData = apiStore.user || tempStorage.user;
      
      
      if (!authKey || !userData) {
        console.error('🔍 Missing auth data - authKey:', !!authKey, 'userData:', !!userData);
        return res.status(401).json({ message: 'Failed to get Stremio authentication data' });
      }
      
      // Get user's addons using the same logic as stremio-addons endpoint
      let addonsData = [];
      try {
        const collection = await apiClient.request('addonCollectionGet', {});
        const rawAddons = collection?.addons || collection || {};
        const addonsNormalized = Array.isArray(rawAddons)
          ? rawAddons
          : (typeof rawAddons === 'object' ? Object.values(rawAddons) : []);
        
        // Process addons to get the actual count (same as stremio-addons endpoint)
        addonsData = await Promise.all(addonsNormalized.map(async (a) => {
          let manifestData = null;
          
          // Always try to fetch manifest if we have a URL and no proper manifest data
          if ((a?.manifestUrl || a?.transportUrl || a?.url) && (!a?.manifest || !a?.name || a.name === 'Unknown')) {
            try {
              const manifestUrl = a?.manifestUrl || a?.transportUrl || a?.url;
              const response = await fetch(manifestUrl);
              if (response.ok) {
                manifestData = await response.json();
              }
            } catch (e) {
              // Ignore manifest fetch errors for counting
            }
          }

          return {
            id: a?.id || a?.manifest?.id || manifestData?.id || 'unknown',
            name: a?.name || a?.manifest?.name || manifestData?.name || 'Unknown',
            manifestUrl: a?.manifestUrl || a?.transportUrl || a?.url || null,
            version: a?.version || a?.manifest?.version || manifestData?.version || null,
            description: a?.description || a?.manifest?.description || manifestData?.description || '',
            manifest: manifestData || a?.manifest || {
              id: manifestData?.id || a?.manifest?.id || a?.id || 'unknown',
              name: manifestData?.name || a?.manifest?.name || a?.name || 'Unknown',
              version: manifestData?.version || a?.manifest?.version || a?.version || null,
              description: manifestData?.description || a?.manifest?.description || a?.description || '',
              types: manifestData?.types || a?.manifest?.types || ['other'],
              resources: manifestData?.resources || a?.manifest?.resources || [],
              catalogs: manifestData?.catalogs || a?.manifest?.catalogs || []
            }
          };
        }));
        
      } catch (e) {
        console.log('Could not fetch addons:', e.message);
      }
      
      // Encrypt the auth key for secure storage
      const encryptedAuthKey = encrypt(authKey, req);
      
      // Update user with Stremio credentials
      const updatedUser = await prisma.user.update({
        where: { 
          id,
          accountId: getAccountId(req)
        },
        data: {
          email: email,
          username: username || userData?.username || email.split('@')[0],
          stremioAuthKey: encryptedAuthKey,
          stremioAddons: JSON.stringify(addonsData || {}),
          isActive: true, // Re-enable the user after successful reconnection
        }
      });
      
      return res.json({ 
        message: 'Successfully connected to Stremio', 
        addonsCount: addonsData.length,
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          email: updatedUser.email
        }
      });
      
    } catch (error) {
      console.error('Stremio connection error:', error);
      return res.status(500).json({ 
        message: 'Failed to connect to Stremio', 
        error: error?.message || 'Unknown error' 
      });
    }
  });

  // Import user addons endpoint
  router.post('/:id/import-addons', async (req, res) => {
    try {
      const { id: userId } = req.params
      const { addons } = req.body || {}

      if (!Array.isArray(addons) || addons.length === 0) {
        return res.status(400).json({ message: 'addons array is required' })
      }

      // Validate user exists
      const user = await prisma.user.findUnique({ 
        where: { 
          id: userId,
          accountId: getAccountId(req)
        }
      })
      if (!user) return res.status(404).json({ message: 'User not found' })

      // Create import group with unique name
      const baseGroupName = `${user.username} Imports`
      let groupName = baseGroupName
      let group = await prisma.group.findFirst({
        where: { name: groupName, accountId: getAccountId(req) }
      })
      
      // Find unique name if group exists (Copy, Copy #2, etc.)
      if (group) {
        let copyNumber = 1
        while (group) {
          groupName = copyNumber === 1 ? `${baseGroupName} Copy` : `${baseGroupName} Copy #${copyNumber}`
          group = await prisma.group.findFirst({
            where: { name: groupName, accountId: getAccountId(req) }
          })
          copyNumber++
        }
      }
      
      // Create the group
      group = await prisma.group.create({
        data: {
          name: groupName,
          description: `Imported addons from ${user.username}`,
          colorIndex: 0,
          isActive: true,
          accountId: getAccountId(req)
        }
      })

      // Process each addon
      const processedAddons = []
      const newlyImportedAddons = []
      const existingAddons = []
      
      for (const addonData of addons) {
        const addonUrl = addonData.manifestUrl || addonData.transportUrl || addonData.url
        if (!addonUrl) {
          console.log(`⚠️ Skipping addon with no URL:`, addonData)
          continue
        }

        // Get manifest data first
          let manifestData = addonData.manifest
          if (!manifestData) {
            try {
              const resp = await fetch(addonUrl)
              if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
              manifestData = await resp.json()
            } catch (e) {
              manifestData = {
                id: addonData.id || 'unknown',
                name: addonData.name || 'Unknown Addon',
                version: addonData.version || '1.0.0',
                description: addonData.description || '',
                resources: addonData.manifest?.resources || [],
                types: addonData.manifest?.types || ['other'],
                catalogs: addonData.manifest?.catalogs || []
              }
          }
        }

        // Check if addon exists by manifest content hash
        let addon = null
        try {
          const existingAddon = await prisma.addon.findFirst({ 
              where: {
              manifestHash: manifestHash(manifestData),
              accountId: getAccountId(req)
            },
            select: { id: true, name: true, manifestUrl: true, accountId: true }
          })
          if (existingAddon) {
            console.log(`♻️ Found existing addon with same manifest: ${existingAddon.name}`)
            processedAddons.push(existingAddon)
            existingAddons.push(existingAddon)
            addon = existingAddon
          }
        } catch (e) {
          console.log(`⚠️ Manifest check failed for ${addonUrl}:`, e?.message || e)
        }

        // Create new addon if not found
        if (!addon) {
          console.log(`🔨 Creating new addon for: ${addonUrl}`)
          
          // Check if addon name exists and find unique name
          let addonName = manifestData?.name || addonData.name || 'Unknown Addon'
          let finalAddonName = addonName
          let copyNumber = 1
          
          while (true) {
            const nameExists = await prisma.addon.findFirst({
              where: {
                name: finalAddonName,
                accountId: getAccountId(req)
              }
            })
            
            if (!nameExists) break
            
            finalAddonName = copyNumber === 1 ? `${addonName} Copy` : `${addonName} Copy #${copyNumber}`
            copyNumber++
          }
          
          if (finalAddonName !== addonName) {
            console.log(`📝 Addon name exists, using: ${finalAddonName}`)
          }

          // Fetch original manifest for full capabilities - always try to fetch from transportUrl first
              let originalManifestObj = null
              try {
                const resp = await fetch(addonUrl)
                if (resp.ok) {
                  originalManifestObj = await resp.json()
                }
              } catch {}
              
              // If fetch failed, use the same manifest that goes into the manifest field
              if (!originalManifestObj) {
                originalManifestObj = manifestData
              }

          // Create addon
          try {
            const resourcesNames = JSON.stringify(
              Array.isArray(manifestData?.resources) 
                ? manifestData.resources.map(r => typeof r === 'string' ? r : (r?.name || r?.type)).filter(Boolean)
                : []
            )

            // Process catalogs with search detection logic
            const processedCatalogs = []
            if (Array.isArray(manifestData?.catalogs)) {
              for (const catalog of manifestData.catalogs) {
                if (!catalog?.type || !catalog?.id) continue
                
                // Check if catalog has search functionality
                const hasSearch = catalog?.extra?.some((extra) => extra.name === 'search')
                const hasOtherExtras = catalog?.extra?.some((extra) => extra.name !== 'search')
                const isEmbeddedSearch = hasSearch && hasOtherExtras
                const isStandaloneSearch = hasSearch && !hasOtherExtras
                
                if (isStandaloneSearch) {
                  // Standalone search catalog: add with original ID (no suffix)
                  processedCatalogs.push({
                    type: catalog.type,
                    id: catalog.id
                  })
                } else if (isEmbeddedSearch) {
                  // Embedded search catalog: add both original and search versions
                  processedCatalogs.push({
                    type: catalog.type,
                    id: catalog.id
                  })
                  processedCatalogs.push({
                    type: catalog.type,
                    id: `${catalog.id}-embed-search`
                  })
                } else {
                  // Regular catalog: add as-is
                  processedCatalogs.push({
                    type: catalog.type,
                    id: catalog.id
                  })
                }
              }
            }
            
            const catalogsData = JSON.stringify(processedCatalogs.map(c => ({
              type: c.type,
              id: c.id,
              search: false // Default to false for imported catalogs
            })))

              const createdAddon = await prisma.addon.create({
                data: {
                  accountId: getAccountId(req),
                  name: finalAddonName,
                  description: manifestData?.description || addonData.description || '',
                  version: manifestData?.version || addonData.version || null,
                  iconUrl: manifestData?.logo || addonData.iconUrl || null,
                  stremioAddonId: manifestData?.id || addonData.stremioAddonId || null,
                  isActive: true,
                  manifestUrl: encrypt(addonUrl, req),
                  manifestUrlHash: manifestUrlHmac(req, addonUrl),
                  originalManifest: originalManifestObj ? encrypt(JSON.stringify(originalManifestObj), req) : null,
                  manifest: manifestData ? encrypt(JSON.stringify(manifestData), req) : null,
                  manifestHash: manifestData ? manifestHash(manifestData) : null,
                  resources: resourcesNames,
                  catalogs: catalogsData
                }
              })
            
              addon = createdAddon
              processedAddons.push(addon)
              newlyImportedAddons.push(addon)
            } catch (error) {
            console.error(`❌ Failed to create addon:`, error?.message || error)
                    continue
                  }
          }
      }

      // Get the starting position for new addons in this group
      const maxPositionResult = await prisma.groupAddon.aggregate({
        where: { 
          groupId: group.id,
          position: { not: null }
        },
        _max: { position: true }
      })
      let nextPosition = (maxPositionResult._max.position ?? -1) + 1

      // Attach all processed addons to the group
      for (let index = 0; index < processedAddons.length; index++) {
        const addon = processedAddons[index]
        try {
          // Get the addon URL for comparison
          const addonUrl = addon.manifestUrl ? decrypt(addon.manifestUrl, req) : null
          
          if (addonUrl) {
            // Check if addon with same URL already exists in group
            const existingGroupAddon = await prisma.groupAddon.findFirst({
              where: {
                groupId: group.id,
                addon: {
                  manifestUrlHash: manifestUrlHmac(req, addonUrl),
                  accountId: getAccountId(req)
                }
              },
              include: { addon: true }
            })

            if (existingGroupAddon) {
              // Remove old addon from group
              await prisma.groupAddon.delete({
                where: {
                  groupId_addonId: {
                    groupId: group.id,
                    addonId: existingGroupAddon.addonId
                  }
                }
              })
              console.log(`🗑️ Removed old addon from group: ${existingGroupAddon.addon.name}`)
            }
          }

          // Add new addon to group with the current position
          await prisma.groupAddon.create({
          data: {
              groupId: group.id,
              addonId: addon.id,
              isEnabled: true,
              position: nextPosition
            }
          })
          
          // Increment position for next addon
          nextPosition++
        } catch (error) {
          console.error(`❌ Failed to attach ${addon.name}:`, error?.message || error)
        }
      }

      // Assign user to group if they don't have any groups
      const allGroups = await prisma.group.findMany({
        where: { accountId: getAccountId(req) },
        select: { id: true, userIds: true }
      })
      
      let userInAnyGroup = false
      for (const g of allGroups) {
        if (g.userIds) {
          try {
            const userIds = JSON.parse(g.userIds)
            if (Array.isArray(userIds) && userIds.includes(userId)) {
              userInAnyGroup = true
              break
            }
          } catch (e) {
            console.error('Error parsing group userIds:', e)
          }
        }
      }
      
      if (!userInAnyGroup) {
        await assignUserToGroup(userId, group.id, req)
      }

      const message = existingAddons.length > 0
        ? `Successfully imported ${processedAddons.length} addons to group "${groupName}" (${existingAddons.length} already existed, ${newlyImportedAddons.length} newly created)`
        : `Successfully imported ${processedAddons.length} addons to group "${groupName}"`

      res.json({
        message,
        groupId: group.id,
        groupName: group.name,
        addonCount: processedAddons.length,
        newlyImported: newlyImportedAddons.length,
        existing: existingAddons.length
      })

    } catch (error) {
      console.error('❌ Import addons error:', error)
      res.status(500).json({ message: 'Failed to import addons', error: error.message })
    }
  });

  // POST /users/invite-webhook - Send webhook notification for invites (generation or summary)
  router.post('/invite-webhook', async (req, res) => {
    try {
      const { type, invites, createdUsers, totalInvites, groupName } = req.body
      
      if (type !== 'generated' && type !== 'summary') {
        return res.status(400).json({ message: 'Invalid type. Must be "generated" or "summary"' })
      }

      const accountId = getAccountId(req)
      const account = await prisma.appAccount.findUnique({ 
        where: { id: accountId }, 
        select: { sync: true } 
      })
      
      let syncCfg = account?.sync
      if (syncCfg && typeof syncCfg === 'string') {
        try { syncCfg = JSON.parse(syncCfg) } catch { syncCfg = null }
      }
      
      const webhookUrl = syncCfg?.webhookUrl
      if (!webhookUrl) {
        return res.json({ message: 'No webhook URL configured', sent: false })
      }

      // Import notify utilities
      const { postDiscord } = require('../utils/notify')
      
      let embed
      
      if (type === 'generated') {
        // Webhook for when invites are generated
        if (!Array.isArray(invites) || typeof totalInvites !== 'number') {
          return res.status(400).json({ message: 'Invalid request data for generated type' })
        }
        
        const fields = []
        invites.forEach((invite, index) => {
          const codeBlock = `Code: ${invite.code}\nLink: ${invite.link}`
          fields.push({
            name: `Invite ${index + 1}`,
            value: '```' + codeBlock + '```',
            inline: false
          })
        })
        
        embed = {
          title: `${invites.length} Invite${invites.length > 1 ? 's' : ''} Generated${groupName ? ` for ${groupName}` : ''}`,
          description: 'Each link expires in 5 minutes.',
          color: 0x808080, // Gray, similar to sync notifications
          fields: fields,
          timestamp: new Date().toISOString()
        }
      } else {
        // Webhook for invite summary (users created)
        if (!Array.isArray(createdUsers) || typeof totalInvites !== 'number') {
          return res.status(400).json({ message: 'Invalid request data for summary type' })
        }
        
        if (createdUsers.length === 0) {
          return res.json({ message: 'No users created, skipping webhook', sent: false })
        }
        
        const fields = []
        createdUsers.forEach((user, index) => {
          const valueParts = []
          if (user.username) {
            valueParts.push(`User: ${user.username}`)
          }
          if (user.code) {
            valueParts.push(`Code: ${user.code}`)
          }
          if (user.link) {
            valueParts.push(`Link: ${user.link}`)
          }
          
          const codeBlock = valueParts.join('\n')
          fields.push({
            name: `Invite ${index + 1}`,
            value: '```' + codeBlock + '```',
            inline: false
          })
        })
        
        const userWord = createdUsers.length === 1 ? 'User' : 'Users'
        const allSynced = createdUsers.length > 0 && createdUsers.every((user) => user.synced === true)
        const syncText = allSynced ? ' and Synced' : ''
        const title = groupName && groupName !== 'No Group'
          ? `${createdUsers.length} ${groupName} ${userWord} Created${syncText}`
          : `${createdUsers.length} ${userWord} Created${syncText}`
        
        embed = {
          title: title,
          description: `${createdUsers.length}/${totalInvites} invite${totalInvites > 1 ? 's' : ''} resulted in new users.`,
          color: 0x00ff00, // Green
          fields: fields,
          timestamp: new Date().toISOString()
        }
      }

      // Add footer with Syncio version (same as sync notifications)
      let appVersion = process.env.NEXT_PUBLIC_APP_VERSION || process.env.APP_VERSION || ''
      if (!appVersion) {
        try { appVersion = require('../../package.json')?.version || '' } catch {}
      }
      if (appVersion) {
        embed.footer = { text: `Syncio v${appVersion}` }
      }

      await postDiscord(webhookUrl, null, {
        embeds: [embed],
        avatar_url: 'https://raw.githubusercontent.com/iamneur0/syncio/refs/heads/main/client/public/logo-black.png'
      })

      return res.json({ message: 'Webhook sent successfully', sent: true })
    } catch (error) {
      console.error('Failed to send invite webhook:', error)
      return res.status(500).json({ message: 'Failed to send webhook', error: error?.message })
    }
  })

  // ==================== USER ACTIVITY VISIBILITY ====================
  // Update user's activity visibility
  router.patch('/:id/activity-visibility', async (req, res) => {
    try {
      const { id } = req.params
      const { activityVisibility } = req.body
      const accountId = getAccountId(req)

      if (!accountId) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      if (!activityVisibility || !['public', 'private'].includes(activityVisibility)) {
        return res.status(400).json({ error: 'Invalid activityVisibility value. Must be "public" or "private".' })
      }

      const user = await prisma.user.findUnique({
        where: { 
          id,
          accountId
        }
      })

      if (!user) {
        return res.status(404).json({ error: 'User not found' })
      }

      const updatedUser = await prisma.user.update({
        where: { 
          id,
          accountId
        },
        data: { activityVisibility }
      })

      res.json({ 
        message: `Activity visibility set to ${activityVisibility}`,
        activityVisibility: updatedUser.activityVisibility 
      })
    } catch (error) {
      console.error('Error updating user activity visibility:', error)
      res.status(500).json({ error: 'Failed to update activity visibility', details: error?.message })
    }
  })

  // ==================== SHARES ENDPOINTS ====================
  const { getShares, addShare, removeShare, markShareAsViewed, getGroupMembers } = require('../utils/sharesManager')
  const { getCachedLibrary } = require('../utils/libraryCache')

  // Get all shares for a user (sent + received)
  router.get('/:userId/shares', async (req, res) => {
    try {
      const { userId } = req.params
      const accountId = getAccountId(req)
      
      if (!accountId) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      // Verify user exists and belongs to account
      const user = await prisma.user.findUnique({
        where: { id: userId, accountId },
        select: { id: true, username: true }
      })

      if (!user) {
        return res.status(404).json({ error: 'User not found' })
      }

      const shares = getShares(accountId, userId)
      res.json(shares)
    } catch (error) {
      console.error(`Failed to get shares for user ${req.params.userId}:`, error)
      res.status(500).json({ error: 'Failed to get shares', message: error?.message })
    }
  })

  // Get received shares only
  router.get('/:userId/shares/received', async (req, res) => {
    try {
      const { userId } = req.params
      const accountId = getAccountId(req)
      
      if (!accountId) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      const user = await prisma.user.findUnique({
        where: { id: userId, accountId },
        select: { id: true }
      })

      if (!user) {
        return res.status(404).json({ error: 'User not found' })
      }

      const shares = getShares(accountId, userId)
      res.json({ received: shares.received })
    } catch (error) {
      console.error(`Failed to get received shares for user ${req.params.userId}:`, error)
      res.status(500).json({ error: 'Failed to get received shares', message: error?.message })
    }
  })

  // Get group members (users in same group)
  router.get('/:userId/shares/group-members', async (req, res) => {
    try {
      const { userId } = req.params
      const accountId = getAccountId(req)
      
      if (!accountId) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      const user = await prisma.user.findUnique({
        where: { id: userId, accountId },
        select: { id: true }
      })

      if (!user) {
        return res.status(404).json({ error: 'User not found' })
      }

      const groupMembers = await getGroupMembers(prisma, accountId, userId)
      res.json({ members: groupMembers })
    } catch (error) {
      console.error(`Failed to get group members for user ${req.params.userId}:`, error)
      res.status(500).json({ error: 'Failed to get group members', message: error?.message })
    }
  })

  // Share item(s) with user(s)
  router.post('/:userId/shares', async (req, res) => {
    try {
      const { userId } = req.params
      const { items, targetUserIds } = req.body
      const accountId = getAccountId(req)
      
      if (!accountId) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Items array is required' })
      }

      if (!Array.isArray(targetUserIds) || targetUserIds.length === 0) {
        return res.status(400).json({ error: 'Target user IDs array is required' })
      }

      // Verify sender exists and get info for notification
      const sender = await prisma.user.findUnique({
        where: { id: userId, accountId },
        select: { id: true, username: true, email: true, colorIndex: true }
      })

      if (!sender) {
        return res.status(404).json({ error: 'User not found' })
      }

      // Get target users with their Discord webhook URLs for notifications
      const targetUsers = await prisma.user.findMany({
        where: { id: { in: targetUserIds }, accountId },
        select: { id: true, username: true, discordWebhookUrl: true }
      })
      const targetUserMap = new Map(targetUsers.map(u => [u.id, u]))

      // Verify all target users exist and are in the same group
      const groupMembers = await getGroupMembers(prisma, accountId, userId)
      const groupMemberIds = new Set(groupMembers.map(u => u.id))
      
      const invalidTargets = targetUserIds.filter(id => !groupMemberIds.has(id))
      if (invalidTargets.length > 0) {
        return res.status(400).json({ 
          error: 'Some target users are not in your group',
          invalidTargets 
        })
      }

      // Get sender's library to verify items exist
      const senderLibrary = getCachedLibrary(accountId, userId) || []
      const libraryItemMap = new Map()
      const baseIdMap = new Map() // Map base IDs (tt...) to any matching library item
      
      senderLibrary.forEach(item => {
        const itemId = item._id || item.id
        if (itemId) {
          libraryItemMap.set(itemId, item)
          // Also index by base ID (everything before the first colon)
          const baseId = itemId.split(':')[0]
          if (baseId && !baseIdMap.has(baseId)) {
            baseIdMap.set(baseId, item)
          }
        }
      })

      // Helper to find item in library (exact match first, then base ID match)
      const findLibraryItem = (searchId) => {
        // Try exact match first
        let found = libraryItemMap.get(searchId)
        if (found) return found
        
        // Try base ID match (for shows where we might have episode IDs)
        const baseId = searchId.split(':')[0]
        found = baseIdMap.get(baseId)
        if (found) return found
        
        return null
      }

      // Build valid items - use library data when available, fall back to frontend data
      const validItems = []
      for (const item of items) {
        const itemId = item.itemId || item._id || item.id
        const libraryItem = findLibraryItem(itemId)
        
        // Accept item if found in library OR if frontend provided enough data
        if (libraryItem || (item.itemName && item.itemType)) {
          validItems.push({
            itemId,
            itemName: libraryItem?.name || item.itemName || 'Unknown',
            itemType: libraryItem?.type || item.itemType || 'movie',
            poster: libraryItem?.poster || item.poster || ''
          })
        }
      }

      if (validItems.length === 0) {
        return res.status(400).json({ 
          error: 'No valid items to share'
        })
      }

      // Share each item with each target user
      const results = []
      const errors = []

      // Track which users received shares for notifications
      const notificationsToSend = []

      for (const item of validItems) {
        for (const targetUserId of targetUserIds) {
          try {
            const targetUser = groupMembers.find(u => u.id === targetUserId)
            if (!targetUser) continue

            const share = addShare(
              accountId,
              userId,
              targetUserId,
              item,
              sender.username,
              targetUser.username
            )
            results.push(share)
            
            // Queue notification if target user has a Discord webhook
            const targetUserData = targetUserMap.get(targetUserId)
            if (targetUserData?.discordWebhookUrl) {
              notificationsToSend.push({
                webhookUrl: targetUserData.discordWebhookUrl,
                item
              })
            }
          } catch (error) {
            if (error.message.includes('already shared')) {
              // Skip duplicates silently
              continue
            }
            errors.push({ itemId: item.itemId, targetUserId, error: error.message })
          }
        }
      }

      // Send Discord notifications to target users (don't block the response)
      if (notificationsToSend.length > 0) {
        // Fire and forget - send notifications in the background
        setImmediate(async () => {
          for (const notification of notificationsToSend) {
            try {
              await sendShareNotification(
                notification.webhookUrl,
                sender.username,
                sender.email,
                sender.colorIndex,
                notification.item
              )
            } catch (err) {
              // Silently fail - notifications are best effort
            }
          }
        })
      }

      res.json({
        success: errors.length === 0,
        shared: results.length,
        results,
        errors: errors.length > 0 ? errors : undefined
      })
    } catch (error) {
      console.error(`Failed to share items for user ${req.params.userId}:`, error)
      res.status(500).json({ error: 'Failed to share items', message: error?.message })
    }
  })

  // Remove a share
  router.delete('/:userId/shares/:shareId', async (req, res) => {
    try {
      const { userId, shareId } = req.params
      const accountId = getAccountId(req)
      
      if (!accountId) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      const user = await prisma.user.findUnique({
        where: { id: userId, accountId },
        select: { id: true }
      })

      if (!user) {
        return res.status(404).json({ error: 'User not found' })
      }

      const removed = removeShare(accountId, userId, shareId)
      if (!removed) {
        return res.status(404).json({ error: 'Share not found' })
      }

      res.json({ success: true, message: 'Share removed' })
    } catch (error) {
      console.error(`Failed to remove share ${req.params.shareId} for user ${req.params.userId}:`, error)
      res.status(500).json({ error: 'Failed to remove share', message: error?.message })
    }
  })

  // Mark share as viewed
  router.put('/:userId/shares/:shareId/viewed', async (req, res) => {
    try {
      const { userId, shareId } = req.params
      const accountId = getAccountId(req)
      
      if (!accountId) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      const user = await prisma.user.findUnique({
        where: { id: userId, accountId },
        select: { id: true }
      })

      if (!user) {
        return res.status(404).json({ error: 'User not found' })
      }

      const marked = markShareAsViewed(accountId, userId, shareId)
      if (!marked) {
        return res.status(404).json({ error: 'Share not found' })
      }

      res.json({ success: true, message: 'Share marked as viewed' })
    } catch (error) {
      console.error(`Failed to mark share ${req.params.shareId} as viewed for user ${req.params.userId}:`, error)
      res.status(500).json({ error: 'Failed to mark share as viewed', message: error?.message })
    }
  })

  return router;
};

// Export the reloadGroupAddons helper function for use by other modules
module.exports.reloadGroupAddons = reloadGroupAddons;

// Export the syncUserAddons helper function for use by other modules
module.exports.syncUserAddons = syncUserAddons;

// Helper function to get sync mode from request headers
function getSyncMode(req) {
  const syncMode = req?.headers?.['x-sync-mode'] || 'normal'
  return syncMode === 'advanced' ? 'advanced' : 'normal'
}

// Reusable function to sync a single user's addons
// Import helpers for standalone usage (when called outside router closure)
const {
  parseAddonIds: parseAddonIdsUtil,
  canonicalizeManifestUrl: canonicalizeManifestUrlUtil,
  filterManifestByResources,
  filterManifestByCatalogs
} = require('../utils/validation')
const { 
  getAccountDek: getAccountDekUtil, 
  getServerKey: getServerKeyUtil, 
  aesGcmDecrypt: aesGcmDecryptUtil,
  encrypt,
  getDecryptedManifestUrl
} = require('../utils/encryption')
const { manifestHash } = require('../utils/hashing')

// Import the shared reload addon helper at module level
const { reloadAddon } = require('./addons')

// Helper function to reload all addons for a group
async function reloadGroupAddons(prisma, getAccountId, groupId, req, decrypt) {
  let reloadedCount = 0
  let failedCount = 0
  const diffsByAddon = [] // { id, name, diffs }
  
  // Get all active addons in the group
  const group = await prisma.group.findUnique({
    where: { id: groupId, accountId: getAccountId(req) },
    include: {
      addons: {
        include: { addon: true }
      }
    }
  })

  if (!group) {
    throw new Error('Group not found')
  }

  const groupAddons = group.addons
    .filter(ga => ga.addon && ga.addon.isActive !== false)
    .map(ga => ga.addon)

  // Single-line summary of addons to be reloaded
  try {
    const names = groupAddons.map(a => a.name).filter(Boolean)
    if (names.length > 0) console.log(`🔄 Reloading addons: ${names.join(', ')}`)
  } catch {}

  
  for (const addon of groupAddons) {
    try {
      // Get fresh addon data from database to ensure we have latest resources/catalogs
      const freshAddon = await prisma.addon.findFirst({
        where: { id: addon.id, accountId: getAccountId(req) }
      })
      
      if (!freshAddon) {
        console.warn(`⚠️ Addon ${addon.name} not found in database`)
        failedCount++
        continue
      }
      
      // Use the existing reloadAddon function with fresh addon data
      const result = await reloadAddon(prisma, getAccountId, freshAddon.id, req, { 
        filterManifestByResources, 
        filterManifestByCatalogs, 
        encrypt, 
        decrypt,  // Use the same decrypt function as individual reload
        getDecryptedManifestUrl, 
        manifestHash,
        silent: true 
      }, true) // Auto-select truly new elements for bulk reload
      
      if (result.success) {
        reloadedCount++
        if (result.diffs && (result.diffs.addedResources?.length || result.diffs.removedResources?.length || result.diffs.addedCatalogs?.length || result.diffs.removedCatalogs?.length)) {
          diffsByAddon.push({ id: freshAddon.id, name: freshAddon.name, diffs: result.diffs })
        }
      } else {
        console.warn(`⚠️ Failed to reload ${addon.name}`)
        failedCount++
      }
      
    } catch (error) {
      console.warn(`⚠️ Error reloading ${addon.name}:`, error.message)
      failedCount++
    }
  }
  
  
  return {
    reloadedCount,
    failedCount,
    total: groupAddons.length,
    diffsByAddon
  }
}

async function syncUserAddons(prismaClient, userId, excludedManifestUrls = [], unsafeMode = false, req, decrypt, getAccountIdParam, useCustomFields = true) {
  try {
    // Ensure req has appAccountId for account scoping
    if (!req.appAccountId) {
      req.appAccountId = getAccountIdParam(req)
    }
    
    // Load user to get name for logging
    const userForLog = await prismaClient.user.findUnique({
      where: { id: userId },
      select: { username: true }
    })
    const userName = userForLog?.username || userId
    console.log(`🚀 Syncing user addons: ${userName}`)

    // Load user
    const user = await prismaClient.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        stremioAuthKey: true,
        isActive: true,
        protectedAddons: true,
        excludedAddons: true,
        accountId: true
      }
    })

    if (!user) return { success: false, error: 'User not found' }
    if (!user.isActive) return { success: false, error: 'User is disabled' }
    if (!user.stremioAuthKey) return { success: false, error: 'User is not connected to Stremio' }

    // syncUserAddons only handles the actual syncing - no mode handling

    // Decrypt auth using account-scoped key (no req in this scope)
    let authKeyPlain
    try {
      let key = null
      try { key = (typeof getAccountDek === 'function' ? getAccountDek : getAccountDekUtil)(user.accountId) } catch {}
      if (!key) { key = (typeof getServerKey === 'function' ? getServerKey : getServerKeyUtil)() }
      authKeyPlain = (typeof aesGcmDecrypt === 'function' ? aesGcmDecrypt : aesGcmDecryptUtil)(key, user.stremioAuthKey)
    } catch {
      return { success: false, error: 'Failed to decrypt Stremio credentials' }
    }

    // Create StremioAPIClient for this user
    const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })

    // Compute plan (shared logic); short-circuit if already synced
    try {
      const { computeUserSyncPlan } = require('../utils/sync')
      const parseAddonIdsFn = (typeof parseAddonIds === 'function' ? parseAddonIds : parseAddonIdsUtil)
      const parseProtectedAddonsFn = (typeof parseProtectedAddons === 'function' ? parseProtectedAddons : require('../utils/validation').parseProtectedAddons)
      const canonicalizeFn = (typeof canonicalizeManifestUrl === 'function' ? canonicalizeManifestUrl : canonicalizeManifestUrlUtil)
      const plan = await computeUserSyncPlan(user, req, {
        prisma: prismaClient,
        getAccountId: (typeof getAccountIdParam === 'function' ? getAccountIdParam : getAccountId),
        decrypt,
        parseAddonIds: parseAddonIdsFn,
        parseProtectedAddons: parseProtectedAddonsFn,
        canonicalizeManifestUrl: canonicalizeFn,
        StremioAPIClient,
        unsafeMode,
        useCustomFields
      })
      if (!plan.success) return { success: false, error: plan.error || 'Failed to compute plan' }

      // Log concise names
      try {
        const currentNames = (plan.current || []).map(a => a?.manifest?.name || a?.transportName || 'Unknown').filter(Boolean)
        const desiredNames = (plan.desired || []).map(a => a?.manifest?.name || a?.name || a?.transportName || 'Unknown').filter(Boolean)
        console.log(`📥 Current addons (${currentNames.length}):`, currentNames.join(', '))
        console.log(`🎯 Desired addons (${desiredNames.length}):`, desiredNames.join(', '))
      } catch {}

      if (plan.alreadySynced) {
        console.log(`✅ User already synced`)
        return { success: true, total: (plan.desired || []).length, alreadySynced: true }
      }

      // If desired addons is empty (empty group), clear all addons
      let finalDesired = plan.desired || []
      if (finalDesired.length === 0) {
        // Empty group: clear all addons
        const { clearAddons } = require('../utils/addonHelpers')
        await clearAddons(apiClient)
        console.log('📦 Empty group detected, cleared all addons')
        return { success: true, total: 0 }
      }

      await apiClient.request('addonCollectionSet', { addons: finalDesired })
      console.log('✅ User now synced')
      return { success: true, total: (plan.desired || []).length }
      } catch (e) {
      console.error('❌ Failed to apply sync plan:', e?.message)
      return { success: false, error: e?.message || 'Failed to sync addons' }
    }
  } catch (error) {
    console.error('Error in syncUserAddons:', error)
    return { success: false, error: error?.message || 'Unknown error' }
  }
}
