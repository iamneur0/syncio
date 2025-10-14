'use client'

import React from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { usersAPI, groupsAPI } from '@/services/api'

interface SyncBadgeProps {
  // Simple mode - just show status
  status?: 'synced' | 'unsynced' | 'stale' | 'connect' | 'syncing' | 'checking'
  isClickable?: boolean
  onClick?: () => void
  title?: string
  isListMode?: boolean
  
  // Smart mode - auto-detect sync status
  userId?: string
  groupId?: string
  onSync?: (id: string) => void
  isSyncing?: boolean
  userExcludedSet?: Set<string>
  userProtectedSet?: Set<string>
}

export default function SyncBadge({ 
  status, 
  isClickable = false, 
  onClick, 
  title,
  isListMode = false,
  userId,
  groupId,
  onSync,
  isSyncing = false,
  userExcludedSet,
  userProtectedSet
}: SyncBadgeProps) {
  const { isDark, isMono } = useTheme()
  const queryClient = useQueryClient()
  const [smartStatus, setSmartStatus] = React.useState<'synced' | 'unsynced' | 'stale' | 'connect' | 'syncing' | 'checking'>('checking')
  const [isLoading, setIsLoading] = React.useState(true)

  // Smart mode: auto-detect sync status
  const isSmartMode = !status && Boolean(userId || groupId)

  // User sync logic
  const { data: userSyncStatus } = useQuery({
    queryKey: ['user', userId, 'sync-status', groupId || 'nogroup'],
    queryFn: async () => {
      if (!userId) return null
      console.log(`🔍 SyncBadge: Fetching sync status for user ${userId}${groupId ? ` in group ${groupId}` : ' (no group)'}`)
      const result = await usersAPI.getSyncStatus(userId, groupId)
      console.log(`🔍 SyncBadge: Sync status result for user ${userId}:`, result)
      return result
    },
    enabled: isSmartMode && Boolean(userId),
    staleTime: 0, // Always refetch to get fresh sync status
    refetchOnMount: 'always',
    refetchOnWindowFocus: true, // Refetch when window regains focus
    refetchInterval: 30000, // Refetch every 30 seconds to keep status fresh
  })

  // Group sync logic
  const { data: groupDetails } = useQuery({
    queryKey: ['group', groupId, 'details'],
    queryFn: () => groupId ? groupsAPI.getById(groupId) : null,
    enabled: isSmartMode && Boolean(groupId),
    refetchOnMount: 'always',
  })

  const groupUsers = (groupDetails as any)?.users || []

  // Get sync status for all users in the group
  const { data: groupSyncStatus } = useQuery({
    queryKey: ['group', groupId, 'sync-status'],
    queryFn: async () => {
      if (!groupId || !groupUsers || groupUsers.length === 0) {
        return { status: 'stale', allSynced: false }
      }

      try {
        const userSyncResults = await Promise.all(
          groupUsers.map(async (user: any) => {
            try {
              const syncStatus = await usersAPI.getSyncStatus(user.id, groupId)
              return (syncStatus as any)?.status === 'synced'
            } catch {
              return false
            }
          })
        )
        const allUsersSynced = userSyncResults.every(Boolean)
        return { status: allUsersSynced ? 'synced' : 'unsynced', allSynced: allUsersSynced }
      } catch {
        return { status: 'unsynced', allSynced: false }
      }
    },
    enabled: isSmartMode && Boolean(groupId) && groupUsers.length > 0,
    staleTime: 0, // Always refetch to get fresh sync status
    refetchOnMount: 'always',
    refetchOnWindowFocus: true, // Refetch when window regains focus
    refetchInterval: 30000, // Refetch every 30 seconds to keep status fresh
  })

  // Update smart status based on data
  React.useEffect(() => {
    if (!isSmartMode) return

    if (userId && userSyncStatus) {
      setSmartStatus((userSyncStatus as any).status || 'checking')
      setIsLoading(false)
    } else if (groupId) {
      if (!groupUsers || groupUsers.length === 0) {
        setSmartStatus('stale')
        setIsLoading(false)
        return
      }

      if (isSyncing) {
        setSmartStatus('syncing')
        setIsLoading(false)
        return
      }

      // Use the React Query data for group sync status
      if (groupSyncStatus) {
        setSmartStatus((groupSyncStatus as any).status || 'checking')
        setIsLoading(false)
      }
    }
  }, [userId, userSyncStatus, groupId, groupUsers, groupDetails, isSyncing, isSmartMode, groupSyncStatus])


  // Listen for group reordering events
  React.useEffect(() => {
    if (!groupId) return

    const onGroupReordered = (e: CustomEvent) => {
      if ((e as any).detail?.id === groupId) {
        // Invalidate group sync status query to trigger refetch
        queryClient.invalidateQueries({ queryKey: ['group', groupId, 'sync-status'] })
      }
    }
    window.addEventListener('sfm:group:reordered' as any, onGroupReordered as any)
    return () => window.removeEventListener('sfm:group:reordered' as any, onGroupReordered as any)
  }, [groupId, queryClient])

  // Listen for user sync data changes
  React.useEffect(() => {
    if (!groupId || !groupUsers.length) return

    const onUserSyncData = (e: CustomEvent) => {
      const { userId: changedUserId } = (e as any).detail || {}
      if (groupUsers.some((u: any) => u.id === changedUserId)) {
        // Invalidate group sync status query to trigger refetch
        queryClient.invalidateQueries({ queryKey: ['group', groupId, 'sync-status'] })
      }
    }
    window.addEventListener('sfm:user-sync-data' as any, onUserSyncData as any)
    return () => window.removeEventListener('sfm:user-sync-data' as any, onUserSyncData as any)
  }, [groupId, groupUsers, queryClient])

  // Listen for tab activation to refresh sync status
  React.useEffect(() => {
    const onTabActivated = (e: CustomEvent) => {
      // Refresh sync status when switching tabs
      if (userId) {
        queryClient.invalidateQueries({ queryKey: ['user', userId, 'sync-status'] })
      }
      if (groupId) {
        queryClient.invalidateQueries({ queryKey: ['group', groupId, 'sync-status'] })
      }
    }
    window.addEventListener('sfm:tab:activated' as any, onTabActivated as any)
    return () => window.removeEventListener('sfm:tab:activated' as any, onTabActivated as any)
  }, [userId, groupId, queryClient])

  // Determine final status and click handler
  const finalStatus = isSmartMode ? smartStatus : status!
  const finalIsClickable = isSmartMode 
    ? (finalStatus === 'unsynced' && !!onSync)
    : isClickable
  const finalOnClick = isSmartMode && onSync
    ? () => onSync(userId || groupId!)
    : onClick

  const getStatusConfig = () => {
    // Treat mono theme like dark for contrast purposes
    const prefersDark = isDark || isMono
    switch (finalStatus) {
      case 'synced':
        return {
          text: 'Synced',
          dotColor: 'bg-green-500',
          bgColor: isMono ? 'bg-black text-white border border-white/20' : (prefersDark ? 'bg-green-900 text-green-300' : 'bg-green-100 text-green-800')
        }
      case 'unsynced':
        return {
          text: 'Unsynced',
          dotColor: 'bg-red-500',
          bgColor: isMono ? 'bg-black text-white border border-white/20' : (prefersDark ? 'bg-red-900 text-red-300' : 'bg-red-100 text-red-800')
        }
      case 'stale':
        return {
          text: 'Stale',
          dotColor: 'bg-gray-400',
          bgColor: isMono ? 'bg-black text-white border border-white/20' : (prefersDark ? 'bg-gray-700 text-gray-100' : 'bg-gray-600 text-gray-100')
        }
      case 'connect':
        return {
          text: 'Connect Stremio',
          dotColor: 'bg-purple-200',
          bgColor: 'bg-stremio-purple text-white'
        }
      case 'syncing':
        return {
          text: 'Syncing',
          dotColor: 'bg-red-500',
          bgColor: isMono ? 'bg-black text-white border border-white/20' : (prefersDark ? 'bg-red-800 text-red-200' : 'bg-red-100 text-red-800')
        }
      case 'checking':
        return {
          text: 'Checking',
          dotColor: 'bg-gray-400',
          bgColor: isMono ? 'bg-black text-white border border-white/20' : (prefersDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-600')
        }
      default:
        return {
          text: 'Unknown',
          dotColor: 'bg-gray-400',
          bgColor: isDark ? 'bg-gray-700 text-gray-100' : 'bg-gray-600 text-gray-100'
        }
    }
  }

  const config = getStatusConfig()
  const isSpinning = finalStatus === 'syncing' || finalStatus === 'checking'

  if (isListMode) {
    // Circular mode - same proportions as pill but circular
    const content = (
      <div 
        className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${config.bgColor} ${finalIsClickable ? 'cursor-pointer hover:opacity-80 transition-opacity' : 'cursor-default'}`}
        title={title}
      >
        <div className={`w-2 h-2 rounded-full ${config.dotColor} ${isSpinning ? 'animate-spin' : ''}`} />
      </div>
    )

    if (finalIsClickable && finalOnClick) {
      if (isMono) {
        // Avoid generic .mono button styles adding unwanted borders by not using <button>
        return (
          <div onClick={(e) => {
            e.stopPropagation()
            finalOnClick()
          }} className="cursor-pointer select-none">
            {content}
          </div>
        )
      }
      return (
        <button onClick={(e) => {
          e.stopPropagation()
          finalOnClick()
        }} className="focus:outline-none">
          {content}
        </button>
      )
    }

    return content
  }

  // Regular pill mode
  const baseClasses = `inline-flex items-center px-2 py-1 text-xs font-medium ${config.bgColor}`
  const clickableClasses = finalIsClickable ? 'cursor-pointer hover:opacity-80 transition-opacity' : 'cursor-default'

  const content = (
    <div 
      className={`${baseClasses} ${clickableClasses}`}
      style={{ 
        borderRadius: '9999px',
        display: 'inline-flex',
        alignItems: 'center',
        paddingLeft: '8px',
        paddingRight: '8px',
        paddingTop: '4px',
        paddingBottom: '4px'
      }}
      title={title}
    >
      <div className={`w-2 h-2 rounded-full mr-1 ${config.dotColor} ${isSpinning ? 'animate-spin' : ''}`} />
      {config.text}
    </div>
  )

  if (finalIsClickable && finalOnClick) {
    if (isMono) {
      // Avoid generic .mono button styles adding unwanted borders by not using <button>
      return (
        <div onClick={(e) => {
          e.stopPropagation()
          finalOnClick()
        }} className="cursor-pointer select-none">
          {content}
        </div>
      )
    }
    return (
      <button onClick={(e) => {
        e.stopPropagation()
        finalOnClick()
      }} className="focus:outline-none">
        {content}
      </button>
    )
  }

  return content
}
