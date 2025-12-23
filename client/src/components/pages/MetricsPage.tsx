'use client'

import React, { useMemo, useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usersAPI, groupsAPI } from '@/services/api'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Users, Film, Tv, TrendingUp, Calendar, Clock, Trophy, Zap, Flame, ChevronDown, X, User, Filter } from 'lucide-react'
import { EmptyState, ToggleButton } from '@/components/ui'
import UserAvatar from '@/components/ui/UserAvatar'
import { useTheme } from '@/contexts/ThemeContext'
import { getEntityColorStyles } from '@/utils/colorMapping'
import { createPortal } from 'react-dom'
import PageHeader from '@/components/layout/PageHeader'

const PERIOD_OPTIONS = [
  { value: 'all', label: 'All Time' },
  { value: '1h', label: '1h' },
  { value: '12h', label: '12h' },
  { value: '1d', label: '1d' },
  { value: '3d', label: '3d' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: '1y', label: '1y' }
]

export default function MetricsPage() {
  const theme = useTheme()
  const [period, setPeriod] = useState<string>('all')
  const [groupFilter, setGroupFilter] = useState<string>('all')
  const [userFilter, setUserFilter] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'users' | 'groups'>('users') // Toggle between users and groups view
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [selectedItemUsers, setSelectedItemUsers] = useState<{ itemId: string; userIds: string[]; itemName?: string; itemPoster?: string; itemType?: string } | null>(null)
  const [userWatchTimes, setUserWatchTimes] = useState<Map<string, number>>(new Map())
  const filterRef = useRef<HTMLDivElement>(null)

  const { data: metricsData, isLoading, error } = useQuery({
    queryKey: ['metrics', period],
    queryFn: () => usersAPI.getMetrics(period),
    refetchInterval: 5 * 60 * 1000 // Refetch every 5 minutes
  })

  // Get all groups for filtering
  const { data: allGroups } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsAPI.getAll(),
    select: (data) => (Array.isArray(data) ? data.filter((g: any) => g.isActive) : [])
  })

  // Parse group userIds and create a map
  const groupUserIdsMap = useMemo(() => {
    if (!allGroups || !Array.isArray(allGroups)) return new Map<string, string[]>()
    const map = new Map<string, string[]>()
    allGroups.forEach((group: any) => {
      if (group.userIds) {
        try {
          const userIds = typeof group.userIds === 'string' ? JSON.parse(group.userIds) : group.userIds
          if (Array.isArray(userIds)) {
            map.set(group.id, userIds)
          }
        } catch (e) {
          console.warn('Failed to parse userIds for group', group.id, e)
        }
      }
    })
    return map
  }, [allGroups])

  // Get all users for stats filtering
  const { data: allUsers } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersAPI.getAll(),
    select: (data) => (Array.isArray(data) ? data.filter((u: any) => u.isActive) : [])
  })

  // Get users to show in filter (based on group selection)
  const availableUsers = useMemo(() => {
    if (!allUsers || !Array.isArray(allUsers)) return []
    if (groupFilter === 'all') return allUsers
    const groupUserIds = groupUserIdsMap.get(groupFilter)
    if (!groupUserIds || groupUserIds.length === 0) return []
    return allUsers.filter((user: any) => groupUserIds.includes(user.id))
  }, [allUsers, groupFilter, groupUserIdsMap])

  // Reset user filter when group filter changes
  useEffect(() => {
    setUserFilter('all')
  }, [groupFilter])

  // Determine which users to include in metrics
  const targetUserIds = useMemo(() => {
    if (userFilter !== 'all') {
      return [userFilter]
    }
    if (groupFilter !== 'all') {
      const groupUserIds = groupUserIdsMap.get(groupFilter)
      return groupUserIds || []
    }
    // When groupFilter is 'all', return all active user IDs
    if (allUsers && Array.isArray(allUsers)) {
      return allUsers.map((u: any) => u.id)
    }
    return []
  }, [userFilter, groupFilter, groupUserIdsMap, allUsers])

  // Create user map for quick lookup
  const userMap = useMemo(() => {
    if (!allUsers || !Array.isArray(allUsers)) return new Map()
    const map = new Map()
    allUsers.forEach((user: any) => {
      map.set(user.id, {
        id: user.id,
        username: user.username,
        email: user.email,
        colorIndex: user.colorIndex || 0
      })
    })
    return map
  }, [allUsers])

  // Close filter dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setIsFilterOpen(false)
      }
    }

    if (isFilterOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isFilterOpen])

  // Handle Escape key to close popup
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedItemUsers) {
        setSelectedItemUsers(null)
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [selectedItemUsers])


  // Fetch activity library for metadata (name, poster)
  const { data: activityLibraryData } = useQuery({
    queryKey: ['activity-library'],
    queryFn: () => usersAPI.getActivityLibrary(),
    staleTime: 5 * 60 * 1000 // Cache for 5 minutes
  })

  // Create metadata map from activity library
  const itemMetadataMap = useMemo(() => {
    const map = new Map<string, { name: string; poster: string }>()
    if (activityLibraryData?.library) {
      for (const item of activityLibraryData.library) {
        const itemId = item._id || item.id
        if (itemId && (item.name || item.poster)) {
          // Store metadata for the full itemId (for movies and direct show items)
          if (!map.has(itemId)) {
            map.set(itemId, {
              name: item.name || '',
              poster: item.poster || ''
            })
          }
          // For episode items, also store metadata for the show ID
          if (itemId.includes(':')) {
            const showId = itemId.split(':')[0]
            if (!map.has(showId)) {
              map.set(showId, {
                name: item.name || '',
                poster: item.poster || ''
              })
            }
          }
        }
      }
    }
    return map
  }, [activityLibraryData])

  // Fetch top items for selected user/group or aggregate
  const { data: topItemsData, isLoading: isLoadingTopItems } = useQuery({
    queryKey: ['top-items', targetUserIds, period, activityLibraryData],
    queryFn: async () => {
      if (!targetUserIds || targetUserIds.length === 0) return null
      
      // If single user, fetch directly
      if (targetUserIds.length === 1) {
        const data = await usersAPI.getTopItems(targetUserIds[0], { period, limit: 20 })
        // Enrich with metadata and add userIds
        if (data?.topItems) {
          data.topItems = data.topItems.map((item: any) => {
            const metadata = itemMetadataMap.get(item.itemId)
            return {
              ...item,
              name: metadata?.name || item.itemId,
              poster: metadata?.poster || '',
              userIds: [targetUserIds[0]]
            }
          })
        }
        return data
      }
      
      // If multiple users (group), aggregate
      const allTopItems: any[] = []
      for (const userId of targetUserIds) {
        try {
          const userData = await usersAPI.getTopItems(userId, { period, limit: 20 })
          if (userData?.topItems) {
            allTopItems.push(...userData.topItems.map((item: any) => ({ ...item, _userId: userId })))
          }
        } catch (e) {
          console.warn('Failed to fetch top items for user', userId, e)
        }
      }
      
      // Aggregate by itemId
      const itemMap = new Map<string, any>()
      for (const item of allTopItems) {
        const key = item.itemId
        if (!itemMap.has(key)) {
          itemMap.set(key, {
            itemId: item.itemId,
            itemType: item.itemType,
            totalWatchTimeSeconds: 0,
            daysWatched: new Set<string>(),
            firstWatched: item.firstWatched,
            lastWatched: item.lastWatched,
            userCount: 0,
            userIds: new Set<string>()
          })
        }
        const aggregated = itemMap.get(key)!
        aggregated.totalWatchTimeSeconds += item.totalWatchTimeSeconds || 0
        aggregated.daysWatched.add(item.daysWatched?.toString() || '')
        aggregated.userCount++
        if (item._userId) {
          aggregated.userIds.add(item._userId)
        }
        if (item.firstWatched && (!aggregated.firstWatched || new Date(item.firstWatched) < new Date(aggregated.firstWatched))) {
          aggregated.firstWatched = item.firstWatched
        }
        if (item.lastWatched && (!aggregated.lastWatched || new Date(item.lastWatched) > new Date(aggregated.lastWatched))) {
          aggregated.lastWatched = item.lastWatched
        }
      }
      
      // Convert to array and calculate hours, enrich with metadata
      const topItems = Array.from(itemMap.values()).map(item => {
        const metadata = itemMetadataMap.get(item.itemId)
        return {
          ...item,
          daysWatched: item.daysWatched.size,
          totalWatchTimeHours: item.totalWatchTimeSeconds / 3600,
          name: metadata?.name || item.itemId,
          poster: metadata?.poster || '',
          userIds: Array.from(item.userIds)
        }
      })
      
      // Sort by userCount (items watched by more users rank higher), then by watch time
      topItems.sort((a, b) => {
        if (b.userCount !== a.userCount) return b.userCount - a.userCount
        return b.totalWatchTimeHours - a.totalWatchTimeHours
      })
      
      return { topItems }
    },
    enabled: !!targetUserIds && targetUserIds.length > 0 && !!activityLibraryData
  })

  // Fetch streaks for selected user/group
  const { data: streaksData, isLoading: isLoadingStreaks } = useQuery({
    queryKey: ['streaks', targetUserIds],
    queryFn: async () => {
      if (!targetUserIds || targetUserIds.length === 0) return null
      
      // If single user, fetch directly
      if (targetUserIds.length === 1) {
        return await usersAPI.getStreaks(targetUserIds[0])
      }
      
      // If multiple users (group), fetch all and show top 5
      const allStreaks: any[] = []
      for (const userId of targetUserIds) {
        try {
          const userStreaks = await usersAPI.getStreaks(userId)
          if (userStreaks) {
            allStreaks.push({
              ...userStreaks,
              userId,
              username: userStreaks.username || userId
            })
          }
        } catch (e) {
          console.warn('Failed to fetch streaks for user', userId, e)
        }
      }
      
      if (allStreaks.length === 0) return null
      
      // Sort by currentStreak (descending), filter out 0 days, and take top 5
      const topStreaks = [...allStreaks]
        .filter((s: any) => (s.totalDaysWatched || 0) > 0)
        .sort((a, b) => (b.currentStreak || 0) - (a.currentStreak || 0))
        .slice(0, 5)
      
      return {
        topStreaks,
        // Also include aggregated stats for display
        maxCurrentStreak: Math.max(...allStreaks.map((s: any) => s.currentStreak || 0)),
        maxLongestStreak: Math.max(...allStreaks.map((s: any) => s.longestStreak || 0)),
        totalDaysWatched: allStreaks.reduce((sum, s: any) => sum + (s.totalDaysWatched || 0), 0)
      }
    },
    enabled: targetUserIds && targetUserIds.length > 0
  })

  // Fetch velocity for selected user/group
  const { data: velocityData, isLoading: isLoadingVelocity } = useQuery({
    queryKey: ['velocity', targetUserIds, period, activityLibraryData],
    queryFn: async () => {
      if (!targetUserIds || targetUserIds.length === 0) return null
      
      // If single user, fetch directly and enrich with metadata
      if (targetUserIds.length === 1) {
        const data = await usersAPI.getVelocity(targetUserIds[0], { period })
        if (data?.items) {
          data.items = data.items.map((item: any) => {
            const metadata = itemMetadataMap.get(item.itemId)
            return {
              ...item,
              name: metadata?.name || item.itemId,
              poster: metadata?.poster || ''
            }
          })
        }
        return data
      }
      
      // If multiple users (group), aggregate
      const allVelocity: any[] = []
      for (const userId of targetUserIds) {
        try {
          const userVelocity = await usersAPI.getVelocity(userId, { period })
          if (userVelocity?.items) {
            allVelocity.push(...userVelocity.items.map((item: any) => ({ ...item, _userId: userId })))
          }
        } catch (e) {
          console.warn('Failed to fetch velocity for user', userId, e)
        }
      }
      
      // Aggregate by itemId
      const itemMap = new Map<string, any>()
      for (const item of allVelocity) {
        const key = item.itemId
        if (!itemMap.has(key)) {
          itemMap.set(key, {
            itemId: item.itemId,
            episodesPerDay: 0,
            estimatedEpisodes: item.estimatedEpisodes || 0,
            daysActive: 0,
            userCount: 0
          })
        }
        const aggregated = itemMap.get(key)!
        aggregated.episodesPerDay += item.episodesPerDay || 0
        aggregated.daysActive = Math.max(aggregated.daysActive, item.daysActive || 0)
        aggregated.userCount++
      }
      
      // Convert to array and average episodes per day, enrich with metadata
      const items = Array.from(itemMap.values()).map(item => {
        const metadata = itemMetadataMap.get(item.itemId)
        return {
          ...item,
          episodesPerDay: item.episodesPerDay / item.userCount, // Average across users
          name: metadata?.name || item.itemId,
          poster: metadata?.poster || ''
        }
      })
      
      // Sort by episodes per day and take top 5
      items.sort((a, b) => b.episodesPerDay - a.episodesPerDay)
      
      return { items: items.slice(0, 5) }
    },
    enabled: targetUserIds && targetUserIds.length > 0 && !!activityLibraryData
  })

  // Defensive normalization so partial/invalid payloads never crash the page
  // MUST be called BEFORE early returns to maintain consistent hook order
  const rawSummary = metricsData?.summary || {}
  const rawUserJoins = metricsData?.userJoins || {}
  const userJoins = {
    byDay: Array.isArray(rawUserJoins.byDay) ? rawUserJoins.byDay : [],
    byWeek: Array.isArray(rawUserJoins.byWeek) ? rawUserJoins.byWeek : [],
    byMonth: Array.isArray(rawUserJoins.byMonth) ? rawUserJoins.byMonth : [],
  }

  const rawWatchActivity = metricsData?.watchActivity || {}
  const watchActivity = {
    byDay: Array.isArray(rawWatchActivity.byDay) ? rawWatchActivity.byDay : [],
    byUser: Array.isArray(rawWatchActivity.byUser) ? rawWatchActivity.byUser : [],
    byUserByDay:
      rawWatchActivity.byUserByDay && typeof rawWatchActivity.byUserByDay === 'object'
        ? rawWatchActivity.byUserByDay
        : {},
  }

  // Filter summary and watchActivity by targetUserIds
  const filteredWatchActivityByUser = useMemo(() => {
    if (!watchActivity.byUser || !Array.isArray(watchActivity.byUser)) return []
    if (!targetUserIds || targetUserIds.length === 0) return watchActivity.byUser
    return watchActivity.byUser.filter((user: any) => targetUserIds.includes(user.id))
  }, [watchActivity.byUser, targetUserIds])

  // Calculate filtered summary from filtered watchActivity.byUser
  const summary = useMemo(() => {
    if (!targetUserIds || targetUserIds.length === 0) {
      return {
        totalUsers: Number(rawSummary.totalUsers) || 0,
        activeUsers: Number(rawSummary.activeUsers) || 0,
        totalMovies: Number(rawSummary.totalMovies) || 0,
        totalShows: Number(rawSummary.totalShows) || 0,
        totalWatched: Number(rawSummary.totalWatched) || 0,
        totalWatchTimeHours: Number(rawSummary.totalWatchTimeHours) || 0,
      }
    }
    
    // Calculate from filtered users
    const activeUsers = filteredWatchActivityByUser.filter((u: any) => (u.movies || 0) + (u.shows || 0) > 0)
    const totalMovies = filteredWatchActivityByUser.reduce((sum: number, u: any) => sum + (u.movies || 0), 0)
    const totalShows = filteredWatchActivityByUser.reduce((sum: number, u: any) => sum + (u.shows || 0), 0)
    const totalWatched = filteredWatchActivityByUser.reduce((sum: number, u: any) => sum + (u.total || 0), 0)
    const totalWatchTimeHours = filteredWatchActivityByUser.reduce((sum: number, u: any) => sum + (u.watchTimeHours || 0), 0)
    
    return {
      totalUsers: targetUserIds.length,
      activeUsers: activeUsers.length,
      totalMovies,
      totalShows,
      totalWatched,
      totalWatchTimeHours
    }
  }, [rawSummary, filteredWatchActivityByUser, targetUserIds])

  // ALL HOOKS MUST BE CALLED BEFORE ANY EARLY RETURNS
  // Options for user filter
  const userOptions = useMemo(() => {
    if (!availableUsers || !Array.isArray(availableUsers)) {
      return [{ value: 'all', label: 'All Users', colorIndex: null as number | null }]
    }
    return [
      { value: 'all', label: 'All Users', colorIndex: null as number | null },
      ...availableUsers.map((user: any) => ({
        value: user.id,
        label: user.username || user.email || user.id,
        username: user.username,
        email: user.email,
        colorIndex: user.colorIndex || 0
      })),
    ]
  }, [availableUsers])

  // Options for group filter
  const groupOptions = useMemo(() => {
    if (!allGroups || !Array.isArray(allGroups)) {
      return [{ value: 'all', label: 'All Groups', colorIndex: null as number | null }]
    }
    return [
      { value: 'all', label: 'All Groups', colorIndex: null as number | null },
      ...allGroups.map((group: any) => ({
        value: group.id,
        label: group.name,
        colorIndex: group.colorIndex || 1
      })),
    ]
  }, [allGroups])

  // Data for Watch Activity chart based on selected user/group filter
  const watchActivityData = useMemo(() => {
    if (!watchActivity || !Array.isArray(watchActivity.byDay)) return []
    
    // If specific user selected
    if (userFilter !== 'all') {
      const perUserByDay = watchActivity.byUserByDay?.[userFilter]
    if (perUserByDay && Array.isArray(perUserByDay) && perUserByDay.length > 0) {
      return perUserByDay
    }
      return []
    }
    
    // If viewMode is 'groups' and both filters are 'all', aggregate by groups
    if (viewMode === 'groups' && groupFilter === 'all' && userFilter === 'all' && allGroups && watchActivity.byUserByDay) {
      const aggregatedByGroupByDay = new Map<string, { date: string; movies: number; shows: number; total: number; groupIds: string[] }>()
      
      allGroups.forEach((group: any) => {
        const groupUserIds = groupUserIdsMap.get(group.id) || []
        groupUserIds.forEach((userId: string) => {
          const perUserByDay = watchActivity.byUserByDay?.[userId]
          if (Array.isArray(perUserByDay)) {
            perUserByDay.forEach((dayData: any) => {
              const date = dayData.date
              const key = `${date}_${group.id}`
              if (!aggregatedByGroupByDay.has(key)) {
                aggregatedByGroupByDay.set(key, { date, movies: 0, shows: 0, total: 0, groupIds: [] })
              }
              const aggregated = aggregatedByGroupByDay.get(key)!
              aggregated.movies += dayData.movies || 0
              aggregated.shows += dayData.shows || 0
              aggregated.total += dayData.total || 0
              if (!aggregated.groupIds.includes(group.id)) {
                aggregated.groupIds.push(group.id)
              }
            })
          }
        })
      })
      
      // Group by date and sum across all groups
      const finalByDay = new Map<string, { date: string; movies: number; shows: number; total: number; groupIds: string[] }>()
      aggregatedByGroupByDay.forEach((value, key) => {
        if (!finalByDay.has(value.date)) {
          finalByDay.set(value.date, { date: value.date, movies: 0, shows: 0, total: 0, groupIds: [] })
        }
        const final = finalByDay.get(value.date)!
        final.movies += value.movies
        final.shows += value.shows
        final.total += value.total
        value.groupIds.forEach((groupId: string) => {
          if (!final.groupIds.includes(groupId)) {
            final.groupIds.push(groupId)
          }
        })
      })
      
      return Array.from(finalByDay.values()).sort((a, b) => a.date.localeCompare(b.date))
    }
    
    // If group selected or all groups, aggregate data for all users in targetUserIds
    // Always aggregate when we have targetUserIds (even if it's all users)
    if (targetUserIds && targetUserIds.length > 0 && watchActivity.byUserByDay) {
      const aggregatedByDay = new Map<string, { date: string; movies: number; shows: number; total: number; userIds: string[] }>()
      
      targetUserIds.forEach((userId: string) => {
        const perUserByDay = watchActivity.byUserByDay?.[userId]
        if (Array.isArray(perUserByDay)) {
          perUserByDay.forEach((dayData: any) => {
            const date = dayData.date
            if (!aggregatedByDay.has(date)) {
              aggregatedByDay.set(date, { date, movies: 0, shows: 0, total: 0, userIds: [] })
            }
            const aggregated = aggregatedByDay.get(date)!
            aggregated.movies += dayData.movies || 0
            aggregated.shows += dayData.shows || 0
            aggregated.total += dayData.total || 0
            if (!aggregated.userIds.includes(userId)) {
              aggregated.userIds.push(userId)
            }
          })
        }
      })
      
      const aggregated = Array.from(aggregatedByDay.values()).sort((a, b) => a.date.localeCompare(b.date))
      // If we have a specific group or user filter, return aggregated data (even if empty)
      // Only fall back to byDay when showing all users/groups
      if (groupFilter !== 'all' || userFilter !== 'all') {
        return aggregated
      }
      // For "all groups" and "all users", return aggregated if available, otherwise fall back to byDay
      if (aggregated.length > 0) {
        return aggregated
      }
    }
    
    // Fallback: All users (no filters) - use pre-aggregated byDay
    // Only use this when both filters are 'all'
    if (groupFilter === 'all' && userFilter === 'all') {
      return watchActivity.byDay || []
    }
    
    // If a specific group/user is selected but no data, return empty array
    return []
  }, [watchActivity, userFilter, groupFilter, targetUserIds, viewMode, allGroups, groupUserIdsMap])

  // Prepare watch time per user/group data (sorted by total watch time, filtered by user/group)
  const watchTimeByUser = useMemo(() => {
    if (!watchActivity.byUser || !Array.isArray(watchActivity.byUser)) return []
    
    // If viewMode is 'groups' and both filters are 'all', aggregate by groups
    if (viewMode === 'groups' && groupFilter === 'all' && userFilter === 'all' && allGroups) {
      const groupWatchTime = new Map<string, { name: string; watchTimeHours: number; watchTimeMoviesHours: number; watchTimeShowsHours: number; colorIndex: number }>()
      
      allGroups.forEach((group: any) => {
        const groupUserIds = groupUserIdsMap.get(group.id) || []
        let totalHours = 0
        let totalMoviesHours = 0
        let totalShowsHours = 0
        
        groupUserIds.forEach((userId: string) => {
          const userData = watchActivity.byUser.find((u: any) => u.id === userId)
          if (userData) {
            totalHours += userData.watchTimeHours || 0
            totalMoviesHours += userData.watchTimeMoviesHours || 0
            totalShowsHours += userData.watchTimeShowsHours || 0
          }
        })
        
        if (totalHours > 0) {
          groupWatchTime.set(group.id, {
            name: group.name,
            watchTimeHours: totalHours,
            watchTimeMoviesHours: totalMoviesHours,
            watchTimeShowsHours: totalShowsHours,
            colorIndex: group.colorIndex || 1
          })
        }
      })
      
      return Array.from(groupWatchTime.values())
        .sort((a, b) => a.watchTimeHours - b.watchTimeHours) // Ascending order
      .slice(0, 10)
    }
    
    // User view mode - ALWAYS filter by targetUserIds when a group or user is selected
    let usersToShow: any[] = []
    
    // If a specific group or user is selected, filter by targetUserIds
    if (targetUserIds && targetUserIds.length > 0) {
      usersToShow = watchActivity.byUser.filter((user: any) => targetUserIds.includes(user.id))
    } else if (groupFilter === 'all' && userFilter === 'all') {
      // Only show all users when both filters are 'all'
      usersToShow = watchActivity.byUser
    } else {
      // If filters are set but targetUserIds is empty, return empty array
      return []
    }
    
    return [...usersToShow]
      .filter(user => {
        const totalWatchTime = user.watchTimeHours || 0
        const hasMovies = (user.movies || 0) > 0
        const hasShows = (user.shows || 0) > 0
        return totalWatchTime > 0 && (hasMovies || hasShows)
      })
      .map(user => ({
        ...user,
        watchTimeHours: user.watchTimeHours || 0,
        watchTimeMoviesHours: user.watchTimeMoviesHours || 0,
        watchTimeShowsHours: user.watchTimeShowsHours || 0,
        username: user.username || user.name || user.id
      }))
      .sort((a, b) => (a.watchTimeHours || 0) - (b.watchTimeHours || 0)) // Ascending order
      .slice(0, 10)
  }, [watchActivity.byUser, targetUserIds, viewMode, allGroups, groupUserIdsMap, groupFilter, userFilter])

  const chartConfig = {
    count: {
      label: 'Users',
      color: 'hsl(var(--chart-1))',
    },
    movies: {
      label: 'Movies',
      color: 'hsl(var(--chart-2))',
    },
    shows: {
      label: 'Shows',
      color: 'hsl(var(--chart-3))',
    },
    total: {
      label: 'Total',
      color: 'hsl(var(--chart-4))',
    },
    hours: {
      label: 'Hours',
      color: 'hsl(var(--chart-5))',
    },
  }

  // Format hours for display in summary
  const formatHours = (hours: number) => {
    if (hours < 1) {
      return `${Math.round(hours * 60)}m`
    }
    if (hours < 24) {
      return `${hours.toFixed(1)}h`
    }
    const days = Math.floor(hours / 24)
    const remainingHours = hours % 24
    if (remainingHours < 1) {
      return `${days}d`
    }
    return `${days}d ${remainingHours.toFixed(1)}h`
  }

  // Format hours as H:MM (e.g. 11:55) for charts/tooltips
  const formatHoursHM = (hours: number) => {
    if (!hours || hours <= 0) return '0:00'
    const totalMinutes = Math.round(hours * 60)
    const h = Math.floor(totalMinutes / 60)
    const m = totalMinutes % 60
    return `${h}:${m.toString().padStart(2, '0')}`
  }

  // Early returns AFTER all hooks have been called
  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-2 text-sm color-text-secondary">
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            <span>Loading...</span>
          </div>
        </div>
      </div>
    )
  }

  if (error || !metricsData) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<TrendingUp className="w-12 h-12" />}
          title="Failed to load metrics"
          description="Unable to fetch metrics data. Please try again later."
        />
      </div>
    )
  }

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-6">
      <PageHeader
        title="Metrics"
        description="Analytics and insights about your Syncio instance"
        searchTerm=""
        onSearchChange={() => {}}
        searchPlaceholder=""
        selectedCount={0}
        onSelectAll={() => {}}
        onDeselectAll={() => {}}
        onAdd={() => {}}
        onDelete={() => {}}
        viewMode="card"
        onViewModeChange={() => {}}
        isDeleteDisabled={true}
        hideSearch={true}
        hideSelectAll={true}
        hideDelete={true}
        hideAdd={true}
        hideViewMode={true}
        customToggle={
          <div className="flex items-center gap-2">
            {/* Combined Filter Button */}
            <div className="relative" ref={filterRef} style={{ flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className="h-10 px-3 rounded-lg input cursor-pointer flex items-center gap-2 relative"
            >
              <span className="flex items-center gap-2">
                {/* Show active filter or default filter icon */}
                {(() => {
                  // Group filter selected
                  if (groupOptions && groupOptions.length > 1 && groupFilter !== 'all') {
                    const selectedGroup = groupOptions.find(opt => opt.value === groupFilter)
                    if (selectedGroup && selectedGroup.colorIndex !== null && selectedGroup.colorIndex !== undefined) {
                      const optionWithColor = selectedGroup as { value: string; label: string; colorIndex: number }
                      const colorStyles = getEntityColorStyles(theme.theme, optionWithColor.colorIndex)
                      const initial = optionWithColor.label.charAt(0).toUpperCase()
                      return (
                        <>
                          <div 
                            className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ 
                              background: colorStyles.background, 
                              color: colorStyles.textColor,
                            }}
                          >
                            <span className="text-xs font-semibold" style={{ color: colorStyles.textColor }}>
                              {initial}
                            </span>
                          </div>
                          <span className="text-sm whitespace-nowrap">{selectedGroup.label}</span>
                        </>
                      )
                    }
                  }
                  
                  // User filter selected
                  if (userOptions && userOptions.length > 1 && userFilter !== 'all') {
                    const selectedUser = userOptions.find(opt => opt.value === userFilter)
                    if (selectedUser && selectedUser.colorIndex !== null && selectedUser.colorIndex !== undefined) {
                      const optionWithUser = selectedUser as { value: string; label: string; username?: string; email?: string; colorIndex: number }
                      return (
                        <>
                          <UserAvatar
                            email={optionWithUser.email || null}
                            username={optionWithUser.username || selectedUser.label}
                            colorIndex={optionWithUser.colorIndex}
                            size="xs"
                          />
                          <span className="text-sm whitespace-nowrap">{selectedUser.label}</span>
                        </>
                      )
                    }
                  }
                  
                  // Default: show Filter icon + "Filters" text
                  return (
                    <>
                      <Filter className="w-4 h-4 color-text-secondary flex-shrink-0" />
                      <span className="text-sm whitespace-nowrap">Filters</span>
                    </>
                  )
                })()}
              </span>
              <ChevronDown className={`w-4 h-4 color-text-secondary flex-shrink-0 transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} />
            </button>
            
            {/* Filter Dropdown */}
            {isFilterOpen && (
              <div className="absolute top-full right-0 mt-2 z-50 rounded-lg shadow-lg border min-w-[280px] lg:min-w-[600px] max-w-[320px] lg:max-w-[800px]" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
                <div className="p-2 lg:p-3">
                  {/* Mobile: Stacked categories with wrapping options */}
                  <div className="lg:hidden space-y-3">
                    {/* Group Filter Section */}
                    {groupOptions && groupOptions.length > 1 && (
                      <div>
                        <div className="px-2 py-1.5 text-xs font-semibold color-text-secondary uppercase">Group</div>
                        <div className="flex flex-wrap gap-1">
                          {groupOptions.map((option) => {
                            const isSelected = option.value === groupFilter
                            const hasColor = option.colorIndex !== null && option.colorIndex !== undefined
                            
                            let avatarElement = null
                            if (hasColor) {
                              const optionWithColor = option as { value: string; label: string; colorIndex: number }
                              const colorStyles = getEntityColorStyles(theme.theme, optionWithColor.colorIndex)
                              const initial = optionWithColor.label.charAt(0).toUpperCase()
                              avatarElement = (
                                <div 
                                  className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mr-1.5"
                                  style={{ 
                                    background: colorStyles.background, 
                                    color: colorStyles.textColor,
                                  }}
                                >
                                  <span className="text-[10px] font-semibold" style={{ color: colorStyles.textColor }}>
                                    {initial}
                                  </span>
                                </div>
                              )
                            } else {
                              avatarElement = <Users className="w-3.5 h-3.5 color-text-secondary mr-1.5 flex-shrink-0" />
                            }
                            
                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => {
                                  setGroupFilter(option.value)
                                  if (option.value !== 'all') {
                                    setUserFilter('all')
                                  }
                                }}
                                className={`px-2.5 py-1.5 text-xs flex items-center hover:opacity-80 transition-colors rounded ${
                                  isSelected ? 'font-medium' : ''
                                }`}
                                style={{
                                  color: 'var(--color-text)',
                                  backgroundColor: isSelected ? 'var(--color-hover)' : 'transparent'
                                }}
                              >
                                {avatarElement}
                                <span>{option.label}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    
                    {/* User Filter Section */}
                    {userOptions && userOptions.length > 1 && (
                      <div>
                        <div className="px-2 py-1.5 text-xs font-semibold color-text-secondary uppercase">User</div>
                        <div className="flex flex-wrap gap-1">
                          {userOptions.map((option) => {
                            const isSelected = option.value === userFilter
                            const hasUserAvatar = option.colorIndex !== null && option.colorIndex !== undefined
                            
                            let avatarElement = null
                            if (hasUserAvatar) {
                              const optionWithUser = option as { value: string; label: string; username?: string; email?: string; colorIndex: number }
                              avatarElement = (
                                <div className="mr-1.5 flex-shrink-0">
                                  <UserAvatar
                                    email={optionWithUser.email || null}
                                    username={optionWithUser.username || option.label}
                                    colorIndex={optionWithUser.colorIndex}
                                    size="xs"
                                  />
                                </div>
                              )
                            } else {
                              avatarElement = <User className="w-3.5 h-3.5 color-text-secondary mr-1.5 flex-shrink-0" />
                            }
                            
                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => {
                                  setUserFilter(option.value)
                                  if (option.value !== 'all') {
                                    setGroupFilter('all')
                                  }
                                }}
                                className={`px-2.5 py-1.5 text-xs flex items-center hover:opacity-80 transition-colors rounded ${
                                  isSelected ? 'font-medium' : ''
                                }`}
                                style={{
                                  color: 'var(--color-text)',
                                  backgroundColor: isSelected ? 'var(--color-hover)' : 'transparent'
                                }}
                              >
                                {avatarElement}
                                <span>{option.label}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    
                    {/* Period Filter Section */}
                    <div>
                      <div className="px-2 py-1.5 text-xs font-semibold color-text-secondary uppercase">Period</div>
                      <div className="flex flex-wrap gap-1">
                        {PERIOD_OPTIONS.map((option) => {
                          const isSelected = option.value === period
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => {
                                setPeriod(option.value)
                              }}
                              className={`px-2.5 py-1.5 text-xs flex items-center gap-1.5 hover:opacity-80 transition-colors rounded ${
                                isSelected ? 'font-medium' : ''
                              }`}
                              style={{
                                color: 'var(--color-text)',
                                backgroundColor: isSelected ? 'var(--color-hover)' : 'transparent'
                              }}
                            >
                              {option.value === 'all' && <Clock className="w-3.5 h-3.5 color-text-secondary flex-shrink-0" />}
                              <span>{option.label}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                  
                  {/* Desktop: Side-by-side categories with stacked options */}
                  <div className="hidden lg:flex gap-4">
                    {/* Group Filter Section */}
                    {groupOptions && groupOptions.length > 1 && (
                      <div className="flex-1 min-w-0">
                        <div className="px-2 py-1.5 text-xs font-semibold color-text-secondary uppercase mb-1">Group</div>
                        <div className="space-y-0.5">
                          {groupOptions.map((option) => {
                            const isSelected = option.value === groupFilter
                            const hasColor = option.colorIndex !== null && option.colorIndex !== undefined
                            
                            let avatarElement = null
                            if (hasColor) {
                              const optionWithColor = option as { value: string; label: string; colorIndex: number }
                              const colorStyles = getEntityColorStyles(theme.theme, optionWithColor.colorIndex)
                              const initial = optionWithColor.label.charAt(0).toUpperCase()
                              avatarElement = (
                                <div 
                                  className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mr-2"
                                  style={{ 
                                    background: colorStyles.background, 
                                    color: colorStyles.textColor,
                                  }}
                                >
                                  <span className="text-xs font-semibold" style={{ color: colorStyles.textColor }}>
                                    {initial}
                                  </span>
                                </div>
                              )
                            } else {
                              avatarElement = <Users className="w-4 h-4 color-text-secondary mr-2" />
                            }
                            
                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => {
                                  setGroupFilter(option.value)
                                  if (option.value !== 'all') {
                                    setUserFilter('all')
                                  }
                                }}
                                className={`w-full px-3 py-2 text-sm flex items-center hover:opacity-80 transition-colors rounded ${
                                  isSelected ? 'font-medium' : ''
                                }`}
                                style={{
                                  color: 'var(--color-text)',
                                  backgroundColor: isSelected ? 'var(--color-hover)' : 'transparent',
                                  justifyContent: 'flex-start'
                                }}
                              >
                                {avatarElement}
                                <span className="text-left truncate">{option.label}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    
                    {/* User Filter Section */}
                    {userOptions && userOptions.length > 1 && (
                      <div className="flex-1 min-w-0">
                        <div className="px-2 py-1.5 text-xs font-semibold color-text-secondary uppercase mb-1">User</div>
                        <div className="space-y-0.5">
                          {userOptions.map((option) => {
                            const isSelected = option.value === userFilter
                            const hasUserAvatar = option.colorIndex !== null && option.colorIndex !== undefined
                            
                            let avatarElement = null
                            if (hasUserAvatar) {
                              const optionWithUser = option as { value: string; label: string; username?: string; email?: string; colorIndex: number }
                              avatarElement = (
                                <div className="mr-2 flex-shrink-0">
                                  <UserAvatar
                                    email={optionWithUser.email || null}
                                    username={optionWithUser.username || option.label}
                                    colorIndex={optionWithUser.colorIndex}
                                    size="xs"
                                  />
                                </div>
                              )
                            } else {
                              avatarElement = <User className="w-4 h-4 color-text-secondary mr-2" />
                            }
                            
                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => {
                                  setUserFilter(option.value)
                                  if (option.value !== 'all') {
                                    setGroupFilter('all')
                                  }
                                }}
                                className={`w-full px-3 py-2 text-sm flex items-center hover:opacity-80 transition-colors rounded ${
                                  isSelected ? 'font-medium' : ''
                                }`}
                                style={{
                                  color: 'var(--color-text)',
                                  backgroundColor: isSelected ? 'var(--color-hover)' : 'transparent',
                                  justifyContent: 'flex-start'
                                }}
                              >
                                {avatarElement}
                                <span className="text-left truncate">{option.label}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    
                    {/* Period Filter Section */}
                    <div className="flex-1 min-w-0">
                      <div className="px-2 py-1.5 text-xs font-semibold color-text-secondary uppercase mb-1">Period</div>
                      <div className="space-y-0.5">
                        {PERIOD_OPTIONS.map((option) => {
                          const isSelected = option.value === period
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => {
                                setPeriod(option.value)
                              }}
                              className={`w-full px-3 py-2 text-sm flex items-center hover:opacity-80 transition-colors rounded ${
                                isSelected ? 'font-medium' : ''
                              }`}
                              style={{
                                color: 'var(--color-text)',
                                backgroundColor: isSelected ? 'var(--color-hover)' : 'transparent',
                                justifyContent: 'flex-start'
                              }}
                            >
                              {option.value === 'all' && <Clock className="w-4 h-4 color-text-secondary mr-2 flex-shrink-0" />}
                              <span className="text-left">{option.label}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            </div>
            
            {/* Toggle between users/groups view */}
            <div className="flex h-10 rounded-lg border color-border">
              <ToggleButton
                isActive={viewMode === 'users'}
                onClick={() => {
                  if (groupFilter === 'all' && userFilter === 'all') {
                    setViewMode('users')
                  }
                }}
                activeIcon={<User className="w-4 h-4" />}
                inactiveIcon={<User className="w-4 h-4" />}
                className="rounded-l-lg border-0 border-r-0"
                title="View by users"
                disabled={groupFilter !== 'all' || userFilter !== 'all'}
              />
              <ToggleButton
                isActive={viewMode === 'groups'}
                onClick={() => {
                  if (groupFilter === 'all' && userFilter === 'all') {
                    setViewMode('groups')
                  }
                }}
                activeIcon={<Users className="w-4 h-4" />}
                inactiveIcon={<Users className="w-4 h-4" />}
                className="rounded-r-lg border-0 border-l-0"
                title="View by groups"
                disabled={groupFilter !== 'all' || userFilter !== 'all'}
              />
            </div>
          </div>
        }
      />

      {/* Summary Card */}
      <div className="card p-4 sm:p-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 sm:gap-6">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 color-text-secondary flex-shrink-0" />
            <div>
              <p className="text-xs sm:text-sm color-text-secondary">Total Users</p>
              <p className="text-lg sm:text-xl font-bold">{summary.totalUsers}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 color-text-secondary flex-shrink-0" />
            <div>
              <p className="text-xs sm:text-sm color-text-secondary">Active Users</p>
              <p className="text-lg sm:text-xl font-bold">{summary.activeUsers}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Film className="w-6 h-6 color-text-secondary flex-shrink-0" />
            <div>
              <p className="text-xs sm:text-sm color-text-secondary">Movies Watched</p>
              <p className="text-lg sm:text-xl font-bold">{summary.totalMovies}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Tv className="w-6 h-6 color-text-secondary flex-shrink-0" />
            <div>
              <p className="text-xs sm:text-sm color-text-secondary">Shows Watched</p>
              <p className="text-lg sm:text-xl font-bold">{summary.totalShows}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <TrendingUp className="w-6 h-6 color-text-secondary flex-shrink-0" />
            <div>
              <p className="text-xs sm:text-sm color-text-secondary">Total Watched</p>
              <p className="text-lg sm:text-xl font-bold">{summary.totalWatched}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Clock className="w-6 h-6 color-text-secondary flex-shrink-0" />
            <div>
              <p className="text-xs sm:text-sm color-text-secondary">Watch Time</p>
              <p className="text-lg sm:text-xl font-bold">{formatHours(summary.totalWatchTimeHours || 0)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Grid - All cards same size */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Joins Over Time */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold mb-4">User Joins Over Time</h3>
          {userJoins.byDay.length > 0 ? (
            <ChartContainer config={chartConfig}>
              <LineChart data={userJoins.byDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  className="text-xs"
                  stroke="var(--color-text-secondary)"
                />
                <YAxis 
                  className="text-xs" 
                  stroke="var(--color-text-secondary)"
                  domain={[0, (dataMax: number) => {
                    // Add 10% padding to the max value for better visualization
                    return Math.ceil(dataMax * 1.1)
                  }]}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line 
                  type="monotone" 
                  dataKey="count" 
                  stroke="hsl(var(--chart-1))" 
                  strokeWidth={2}
                  dot={{ fill: 'hsl(var(--chart-1))', r: 4 }}
                />
              </LineChart>
            </ChartContainer>
          ) : (
            <EmptyState
              icon={<Calendar className="w-8 h-8" />}
              title="No data"
              description="No user joins in the selected period"
            />
          )}
        </div>

        {/* Watch Activity Over Time */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold mb-4">Watch Activity Over Time</h3>
          {watchActivityData.length > 0 ? (
            <ChartContainer config={chartConfig}>
              <BarChart data={watchActivityData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  className="text-xs"
                  stroke="var(--color-text-secondary)"
                />
                <YAxis className="text-xs" stroke="var(--color-text-secondary)" />
                <ChartTooltip 
                  content={<ChartTooltipContent />}
                  labelFormatter={(label, payload) => {
                    if (payload && payload[0] && payload[0].payload) {
                      if (viewMode === 'groups' && payload[0].payload.groupIds) {
                        const groupIds = payload[0].payload.groupIds
                        const groupNames = groupIds.map((gid: string) => {
                          const group = allGroups?.find((g: any) => g.id === gid)
                          return group?.name || gid
                        }).join(', ')
                        return `${label} (${groupNames})`
                      } else if (payload[0].payload.userIds) {
                        const userIds = payload[0].payload.userIds
                        const userNames = userIds.map((uid: string) => {
                          const user = userMap.get(uid)
                          return user?.username || uid
                        }).join(', ')
                        return `${label} (${userNames})`
                      }
                    }
                    return label
                  }}
                />
                <Legend />
                <Bar dataKey="movies" stackId="a" fill="hsl(var(--chart-2))" name="Movies" barSize={30} />
                <Bar dataKey="shows" stackId="a" fill="hsl(var(--chart-3))" name="Shows" barSize={30} />
              </BarChart>
            </ChartContainer>
          ) : (
            <EmptyState
              icon={<TrendingUp className="w-8 h-8" />}
              title="No data"
              description="No watch activity in the selected period"
            />
          )}
        </div>

        {/* Watch Time Per User */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold mb-4">Watch Time</h3>
          {watchTimeByUser.length > 0 ? (
            <ChartContainer config={chartConfig}>
              <BarChart data={watchTimeByUser}>
                <defs>
                  <style>{`
                    .recharts-bar-rectangle:hover {
                      opacity: 1 !important;
                    }
                    .recharts-active-bar {
                      opacity: 1 !important;
                      fill-opacity: 1 !important;
                    }
                    .recharts-bar-rectangle {
                      transition: none !important;
                    }
                  `}</style>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis 
                  dataKey={viewMode === 'groups' && groupFilter === 'all' && userFilter === 'all' ? "name" : "username"}
                  className="text-xs" 
                  stroke="var(--color-text-secondary)"
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis 
                  type="number"
                  className="text-xs"
                  stroke="var(--color-text-secondary)"
                  domain={[0, (dataMax: number) => {
                    // For 1h period, cap at 1h (the actual maximum possible)
                    if (period === '1h') {
                      return 1
                    }
                    // For 12h period, cap at 12h
                    if (period === '12h') {
                      return 12
                    }
                    // For other periods, add 10% padding to the max value
                    return Math.ceil(dataMax * 1.1)
                  }]}
                  tickCount={(() => {
                    // Control number of ticks for better spacing
                    if (period === '1h') {
                      return 3 // Show 0, 0.5h, 1h
                    }
                    return undefined // Let recharts auto-generate for other periods
                  })()}
                  interval={0}
                  tickFormatter={(value) => {
                    const hours = value as number
                    if (hours === 0) return '0'
                    if (hours < 1) {
                      const minutes = Math.round(hours * 60)
                      return `${minutes}m`
                    }
                    return `${Math.round(hours)}h`
                  }}
                />
                <ChartTooltip 
                  content={<ChartTooltipContent hideLabel />}
                  formatter={(value: number | undefined, name: string | undefined) => {
                    if (value === undefined || value === null) return null
                    const hours = value as number
                    if (hours <= 0) return null
                    const h = Math.floor(hours)
                    const m = Math.round((hours - h) * 60)
                    const formatted = h > 0 ? `${h}h${m > 0 ? `${m}m` : ''}` : `${m}m`
                    const isMovies = name === 'watchTimeMoviesHours'
                    return [
                      <span key="value" className="flex items-center gap-1">
                        {isMovies ? <Film className="w-3 h-3" /> : <Tv className="w-3 h-3" />}
                        {formatted}
                      </span>,
                      ''
                    ]
                  }}
                />
                <Legend 
                  content={({ payload }) => (
                    <div className="flex items-center justify-center gap-4 pt-3">
                      {payload?.map((entry: any, index: number) => (
                        <div key={index} className="flex items-center gap-1.5">
                          <div
                            className="h-2 w-2 rounded-[2px]"
                            style={{ backgroundColor: entry.color }}
                          />
                          <span className="text-xs text-muted-foreground">{entry.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                />
                <Bar 
                  dataKey="watchTimeMoviesHours" 
                  stackId="a" 
                  fill="hsl(var(--chart-2))" 
                  name="Movies" 
                  barSize={30}
                  onMouseEnter={() => {}}
                  onMouseLeave={() => {}}
                />
                <Bar 
                  dataKey="watchTimeShowsHours" 
                  stackId="a" 
                  fill="hsl(var(--chart-3))" 
                  name="Shows" 
                  barSize={30}
                  onMouseEnter={() => {}}
                  onMouseLeave={() => {}}
                />
              </BarChart>
            </ChartContainer>
          ) : (
            <EmptyState
              icon={<Clock className="w-8 h-8" />}
              title="No data"
              description="No watch time data available"
            />
          )}
        </div>

        {/* Top Active Users/Groups */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold mb-4">{viewMode === 'groups' && groupFilter === 'all' && userFilter === 'all' ? 'Top Active Groups' : 'Top Active Users'}</h3>
          {(() => {
            // If viewMode is 'groups' and both filters are 'all', aggregate by groups
            if (viewMode === 'groups' && groupFilter === 'all' && userFilter === 'all' && allGroups && watchActivity.byUser) {
              const groupActivity = new Map<string, { name: string; movies: number; shows: number; total: number; colorIndex: number }>()
              
              allGroups.forEach((group: any) => {
                const groupUserIds = groupUserIdsMap.get(group.id) || []
                let totalMovies = 0
                let totalShows = 0
                
                groupUserIds.forEach((userId: string) => {
                  const userData = watchActivity.byUser.find((u: any) => u.id === userId)
                  if (userData) {
                    totalMovies += userData.movies || 0
                    totalShows += userData.shows || 0
                  }
                })
                
                if (totalMovies > 0 || totalShows > 0) {
                  groupActivity.set(group.id, {
                    name: group.name,
                    movies: totalMovies,
                    shows: totalShows,
                    total: totalMovies + totalShows,
                    colorIndex: group.colorIndex || 1
                  })
                }
              })
              
              const groupsToShow = Array.from(groupActivity.values())
                .sort((a, b) => a.total - b.total) // Ascending order
                .slice(0, 10)
              
              return groupsToShow.length > 0 ? (
            <ChartContainer config={chartConfig}>
                  <BarChart data={groupsToShow}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis 
                      dataKey="name"
                      className="text-xs" 
                      stroke="var(--color-text-secondary)"
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                <YAxis 
                      type="number"
                      className="text-xs"
                      stroke="var(--color-text-secondary)"
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Legend />
                    <Bar dataKey="movies" stackId="a" fill="hsl(var(--chart-2))" name="Movies" barSize={30} />
                    <Bar dataKey="shows" stackId="a" fill="hsl(var(--chart-3))" name="Shows" barSize={30} />
                  </BarChart>
                </ChartContainer>
              ) : (
                <EmptyState
                  icon={<Users className="w-8 h-8" />}
                  title="No data"
                  description="No group activity data available"
                />
              )
            }
            
            // User view mode - ALWAYS filter by targetUserIds when a group or user is selected
            let usersToShow: any[] = []
            
            // If a specific group or user is selected, filter by targetUserIds
            if (targetUserIds && targetUserIds.length > 0) {
              usersToShow = (watchActivity.byUser || []).filter((user: any) => targetUserIds.includes(user.id))
            } else if (groupFilter === 'all' && userFilter === 'all') {
              // Only show all users when both filters are 'all'
              usersToShow = watchActivity.byUser || []
            } else {
              // If filters are set but targetUserIds is empty, return empty state
              return (
                <EmptyState
                  icon={<Users className="w-8 h-8" />}
                  title="No data"
                  description="No user activity data available for the selected filter"
                />
              )
            }
            
            // Filter out users with 0 movies and 0 shows, sort ascending
            usersToShow = usersToShow
              .filter((user: any) => {
                const movies = user.movies || 0
                const shows = user.shows || 0
                return movies > 0 || shows > 0
              })
              .sort((a: any, b: any) => {
                const totalA = (a.movies || 0) + (a.shows || 0)
                const totalB = (b.movies || 0) + (b.shows || 0)
                return totalA - totalB // Ascending order
              })
            
            return usersToShow.length > 0 ? (
            <ChartContainer config={chartConfig}>
                <BarChart data={usersToShow}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis 
                  dataKey="username" 
                    className="text-xs" 
                    stroke="var(--color-text-secondary)"
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                <YAxis 
                    type="number"
                  className="text-xs"
                  stroke="var(--color-text-secondary)"
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend />
                  <Bar dataKey="movies" stackId="a" fill="hsl(var(--chart-2))" name="Movies" barSize={30} />
                  <Bar dataKey="shows" stackId="a" fill="hsl(var(--chart-3))" name="Shows" barSize={30} />
              </BarChart>
            </ChartContainer>
          ) : (
            <EmptyState
              icon={<Users className="w-8 h-8" />}
              title="No data"
                description={userFilter !== 'all' ? "No user activity data available for this user" : groupFilter !== 'all' ? "No user activity data available for this group" : "No user activity data available"}
            />
            )
          })()}
        </div>
      </div>

      {/* New Stats Section */}
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold">Detailed Stats</h2>
          <p className="text-sm color-text-secondary mt-1">Top items, streaks, and watch velocity</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Top Items */}
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Trophy className="w-5 h-5 color-text-secondary" />
              <h3 className="text-lg font-semibold">Top Items</h3>
            </div>
            {targetUserIds && targetUserIds.length > 0 ? (
              isLoadingTopItems ? (
                <div className="flex items-center justify-center py-8">
                  <div className="flex items-center gap-2 text-sm color-text-secondary">
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    <span>Loading...</span>
                  </div>
                </div>
              ) : topItemsData?.topItems && topItemsData.topItems.length > 0 ? (
                <div className="space-y-4">
                  {/* Top 3 Movies */}
                  {topItemsData.topItems.filter((item: any) => item.itemType === 'movie').length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <Film className="w-4 h-4" />
                        Top Movies
                      </h4>
                      <div className="space-y-2">
                        {topItemsData.topItems
                          .filter((item: any) => item.itemType === 'movie')
                          .slice(0, 3)
                          .map((item: any, idx: number) => (
                          <div key={item.itemId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-opacity-50 color-hover">
                            {item.poster ? (
                              <img 
                                src={item.poster} 
                                alt={item.name || item.itemId}
                                className="w-12 h-18 object-cover rounded flex-shrink-0"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none'
                                }}
                              />
                            ) : (
                              <div className="w-12 h-18 bg-gray-700 rounded flex-shrink-0 flex items-center justify-center">
                                <Film className="w-6 h-6 color-text-secondary" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">#{idx + 1} {item.name || item.itemId}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (item.userIds && item.userIds.length > 0) {
                                      setSelectedItemUsers({ itemId: item.itemId, userIds: item.userIds, itemName: item.name, itemPoster: item.poster, itemType: item.itemType })
                                      // Fetch watch times for each user
                                      const watchTimeMap = new Map<string, number>()
                                      const startDate = new Date()
                                      let periodDays = 0
                                      if (period === '1h' || period === '12h') {
                                        periodDays = 0
                                      } else if (period === '1d') {
                                        periodDays = 1
                                      } else if (period === '3d') {
                                        periodDays = 3
                                      } else if (period === '7d') {
                                        periodDays = 7
                                      } else if (period === '30d') {
                                        periodDays = 30
                                      }
                                      startDate.setDate(startDate.getDate() - periodDays)
                                      Promise.all(
                                        item.userIds.map(async (userId: string) => {
                                          try {
                                            const watchTimeData = await usersAPI.getWatchTime(userId, {
                                              itemId: item.itemId,
                                              itemType: item.itemType,
                                              startDate: startDate.toISOString().split('T')[0],
                                              endDate: new Date().toISOString().split('T')[0]
                                            })
                                            // The API returns totalWatchTimeSeconds in the response
                                            const totalSeconds = watchTimeData?.totalWatchTimeSeconds || watchTimeData?.totalSeconds || watchTimeData?.total || 0
                                            watchTimeMap.set(userId, totalSeconds)
                                          } catch (e) {
                                            console.warn('Failed to fetch watch time for user', userId, e)
                                            watchTimeMap.set(userId, 0)
                                          }
                                        })
                                      ).then(() => {
                                        setUserWatchTimes(watchTimeMap)
                                      })
                                    }
                                  }}
                                  className="text-xs color-text-secondary hover:color-text-primary transition-colors"
                                >
                                  {item.userIds && item.userIds.length > 0 ? (
                                    <span>{item.userIds.length} user{item.userIds.length !== 1 ? 's' : ''}</span>
                                  ) : (
                                    <span>{item.userCount || 1} user{(item.userCount || 1) !== 1 ? 's' : ''}</span>
                                  )}
                                </button>
        </div>
      </div>
                            <div className="text-right ml-2 flex-shrink-0">
                              {(() => {
                                const totalSeconds = (item.totalWatchTimeHours || 0) * 3600
                                const hours = Math.floor(totalSeconds / 3600)
                                const minutes = Math.round((totalSeconds % 3600) / 60)
                                if (hours > 0) {
                                  return <p className="text-sm font-semibold">{hours}h{minutes > 0 ? `${minutes}m` : ''}</p>
                                }
                                return <p className="text-sm font-semibold">{minutes}m</p>
                              })()}
    </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Top 3 Shows */}
                  {topItemsData.topItems.filter((item: any) => item.itemType === 'series').length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                        <Tv className="w-4 h-4" />
                        Top Shows
                      </h4>
                      <div className="space-y-2">
                        {topItemsData.topItems
                          .filter((item: any) => item.itemType === 'series')
                          .slice(0, 3)
                          .map((item: any, idx: number) => (
                          <div key={item.itemId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-opacity-50 color-hover">
                            {item.poster ? (
                              <img 
                                src={item.poster} 
                                alt={item.name || item.itemId}
                                className="w-12 h-18 object-cover rounded flex-shrink-0"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none'
                                }}
                              />
                            ) : (
                              <div className="w-12 h-18 bg-gray-700 rounded flex-shrink-0 flex items-center justify-center">
                                <Tv className="w-6 h-6 color-text-secondary" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">#{idx + 1} {item.name || item.itemId}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (item.userIds && item.userIds.length > 0) {
                                      setSelectedItemUsers({ itemId: item.itemId, userIds: item.userIds, itemName: item.name, itemPoster: item.poster, itemType: item.itemType })
                                      // Fetch watch times for each user
                                      const watchTimeMap = new Map<string, number>()
                                      const startDate = new Date()
                                      let periodDays = 0
                                      if (period === '1h' || period === '12h') {
                                        periodDays = 0
                                      } else if (period === '1d') {
                                        periodDays = 1
                                      } else if (period === '3d') {
                                        periodDays = 3
                                      } else if (period === '7d') {
                                        periodDays = 7
                                      } else if (period === '30d') {
                                        periodDays = 30
                                      }
                                      startDate.setDate(startDate.getDate() - periodDays)
                                      Promise.all(
                                        item.userIds.map(async (userId: string) => {
                                          try {
                                            const watchTimeData = await usersAPI.getWatchTime(userId, {
                                              itemId: item.itemId,
                                              itemType: item.itemType,
                                              startDate: startDate.toISOString().split('T')[0],
                                              endDate: new Date().toISOString().split('T')[0]
                                            })
                                            // The API returns totalWatchTimeSeconds in the response
                                            const totalSeconds = watchTimeData?.totalWatchTimeSeconds || watchTimeData?.totalSeconds || watchTimeData?.total || 0
                                            watchTimeMap.set(userId, totalSeconds)
                                          } catch (e) {
                                            console.warn('Failed to fetch watch time for user', userId, e)
                                            watchTimeMap.set(userId, 0)
                                          }
                                        })
                                      ).then(() => {
                                        setUserWatchTimes(watchTimeMap)
                                      })
                                    }
                                  }}
                                  className="text-xs color-text-secondary hover:color-text-primary transition-colors"
                                >
                                  {item.userIds && item.userIds.length > 0 ? (
                                    <span>{item.userIds.length} user{item.userIds.length !== 1 ? 's' : ''}</span>
                                  ) : (
                                    <span>{item.userCount || 1} user{(item.userCount || 1) !== 1 ? 's' : ''}</span>
                                  )}
                                </button>
                              </div>
                            </div>
                            <div className="text-right ml-2 flex-shrink-0">
                              {(() => {
                                const totalSeconds = (item.totalWatchTimeHours || 0) * 3600
                                const hours = Math.floor(totalSeconds / 3600)
                                const minutes = Math.round((totalSeconds % 3600) / 60)
                                if (hours > 0) {
                                  return <p className="text-sm font-semibold">{hours}h{minutes > 0 ? `${minutes}m` : ''}</p>
                                }
                                return <p className="text-sm font-semibold">{minutes}m</p>
                              })()}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <EmptyState
                  icon={<Trophy className="w-8 h-8" />}
                  title="No data"
                  description={userFilter !== 'all' ? "No top items for this user" : groupFilter !== 'all' ? "No top items for this group" : "No top items available"}
                />
              )
            ) : (
              <EmptyState
                icon={<Trophy className="w-8 h-8" />}
                title="No data"
                description="No top items available"
              />
            )}
          </div>

          {/* Watch Streaks */}
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Flame className="w-5 h-5 color-text-secondary" />
              <h3 className="text-lg font-semibold">Watch Streaks</h3>
            </div>
            {targetUserIds && targetUserIds.length > 0 ? (
              isLoadingStreaks ? (
                <div className="flex items-center justify-center py-8">
                  <div className="flex items-center gap-2 text-sm color-text-secondary">
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    <span>Loading...</span>
                  </div>
                </div>
              ) : streaksData ? (
                targetUserIds.length === 1 ? (
                  // Single user: show detailed stats
                  <div className="space-y-4">
                    <div className="text-center p-4 rounded-lg section-panel">
                      <p className="text-3xl font-bold color-text-secondary">{streaksData.currentStreak || 0}d</p>
                      <p className="text-sm color-text-secondary mt-1">Current Streak</p>
                      {streaksData.streakStartDate && (
                        <p className="text-xs color-text-secondary mt-1">
                          Since {new Date(streaksData.streakStartDate).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <div className="text-center p-4 rounded-lg section-panel">
                      <p className="text-2xl font-bold">{streaksData.longestStreak || 0}d</p>
                      <p className="text-sm color-text-secondary mt-1">Longest Streak</p>
                      {streaksData.longestStreakStartDate && streaksData.longestStreakEndDate && (
                        <p className="text-xs color-text-secondary mt-1">
                          {new Date(streaksData.longestStreakStartDate).toLocaleDateString()} - {new Date(streaksData.longestStreakEndDate).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <div className="text-center p-3 rounded-lg section-panel">
                      <p className="text-xl font-bold">{streaksData.totalDaysWatched || 0}</p>
                      <p className="text-xs color-text-secondary mt-1">Total Days Watched</p>
                    </div>
                  </div>
                ) : (
                  // Multiple users: show top 5
                  streaksData.topStreaks && streaksData.topStreaks.length > 0 ? (
                    <div className="space-y-2">
                      {streaksData.topStreaks.map((streak: any, idx: number) => {
                        const userInfo = userMap.get(streak.userId)
                        return (
                          <div key={streak.userId || idx} className="p-3 rounded-lg section-panel">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold color-text-secondary">#{idx + 1}</span>
                              <UserAvatar 
                                email={userInfo?.email}
                                username={streak.username || streak.userId} 
                                size="sm"
                                colorIndex={userInfo?.colorIndex}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium">{streak.username || streak.userId}</span>
                                  <span className="text-lg font-bold color-text-secondary">{streak.currentStreak || 0}d</span>
                                </div>
                                <div className="flex items-center justify-between text-xs color-text-secondary mt-1">
                                  <span>Longest</span>
                                  <span className="font-medium">{streak.longestStreak || 0}d</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <EmptyState
                      icon={<Flame className="w-8 h-8" />}
                      title="No data"
                      description="No streak data available"
                    />
                  )
                )
              ) : (
                <EmptyState
                  icon={<Flame className="w-8 h-8" />}
                  title="No data"
                  description={userFilter !== 'all' ? "No streak data for this user" : groupFilter !== 'all' ? "No streak data for this group" : "No streak data available"}
                />
              )
            ) : (
              <EmptyState
                icon={<Flame className="w-8 h-8" />}
                title="No data"
                description="No streak data available"
              />
            )}
          </div>

          {/* Watch Velocity */}
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-5 h-5 color-text-secondary" />
              <h3 className="text-lg font-semibold">Watch Velocity</h3>
            </div>
            {targetUserIds && targetUserIds.length > 0 ? (
              isLoadingVelocity ? (
                <div className="flex items-center justify-center py-8">
                  <div className="flex items-center gap-2 text-sm color-text-secondary">
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    <span>Loading...</span>
                  </div>
                </div>
              ) : velocityData?.items && velocityData.items.length > 0 ? (
                <div className="space-y-3">
                  {velocityData.items.map((item: any, idx: number) => (
                    <div key={item.itemId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-opacity-50 color-hover">
                      {item.poster ? (
                        <img 
                          src={item.poster} 
                          alt={item.name || item.itemId}
                          className="w-12 h-18 object-cover rounded flex-shrink-0"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none'
                          }}
                        />
                      ) : (
                        <div className="w-12 h-18 bg-gray-700 rounded flex-shrink-0 flex items-center justify-center">
                          {item.itemType === 'movie' ? (
                            <Film className="w-6 h-6 color-text-secondary" />
                          ) : (
                            <Tv className="w-6 h-6 color-text-secondary" />
                          )}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-medium truncate">{item.name || item.itemId}</p>
                          <p className="text-xs font-semibold flex-shrink-0 ml-2">{Math.round(item.episodesPerDay)}/day</p>
                        </div>
                        <div className="flex items-center justify-between text-xs color-text-secondary">
                          <span>{item.estimatedEpisodes} episodes</span>
                          <span>{item.daysActive} {item.daysActive === 1 ? 'day' : 'days'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={<Zap className="w-8 h-8" />}
                  title="No data"
                  description={userFilter !== 'all' ? "No velocity data for this user" : groupFilter !== 'all' ? "No velocity data for this group" : "No velocity data available"}
                />
              )
            ) : (
              <EmptyState
                icon={<Zap className="w-8 h-8" />}
                title="No data"
                description="No watch velocity data available"
              />
            )}
          </div>
        </div>
      </div>

      {/* User List Modal */}
      {selectedItemUsers && typeof window !== 'undefined' && document.body && createPortal(
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
          onClick={() => setSelectedItemUsers(null)}
        >
          <div 
            className="card p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              {selectedItemUsers.itemPoster ? (
                <img 
                  src={selectedItemUsers.itemPoster} 
                  alt={selectedItemUsers.itemName || selectedItemUsers.itemId}
                  className="w-12 h-18 object-cover rounded flex-shrink-0"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
              ) : (
                <div className="w-12 h-18 bg-gray-700 rounded flex-shrink-0 flex items-center justify-center">
                  <Film className="w-6 h-6 color-text-secondary" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold break-words">Users who watched {selectedItemUsers.itemName || selectedItemUsers.itemId}</h3>
              </div>
              <button
                onClick={() => setSelectedItemUsers(null)}
                className="p-1 rounded-lg hover:bg-opacity-50 color-hover flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2">
              {selectedItemUsers.userIds.map((userId: string) => {
                const userInfo = userMap.get(userId)
                if (!userInfo) return null
                return (
                  <div key={userId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-opacity-50 color-hover">
                    <UserAvatar
                      email={userInfo.email}
                      username={userInfo.username || userId}
                      size="sm"
                      colorIndex={userInfo.colorIndex}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium break-words">{userInfo.username || 'No username'}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs color-text-secondary">
                        {(() => {
                          const seconds = userWatchTimes.get(userId) || 0
                          const hours = Math.floor(seconds / 3600)
                          const minutes = Math.floor((seconds % 3600) / 60)
                          if (hours > 0) {
                            return `${hours}h ${minutes}m`
                          }
                          return `${minutes}m`
                        })()}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}