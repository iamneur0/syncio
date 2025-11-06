'use client'

import React from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { usersAPI, groupsAPI } from '@/services/api'
import { invalidateSyncStatusQueries } from '@/utils/queryUtils'
import { useUnsafeMode } from '@/hooks/useCommonState'

interface SyncBadgeProps {
  // Simple mode - just show status
  status?: 'synced' | 'unsynced' | 'stale' | 'connect' | 'syncing' | 'checking' | 'error'
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
  const [smartStatus, setSmartStatus] = React.useState<'synced' | 'unsynced' | 'stale' | 'connect' | 'syncing' | 'checking' | 'error'>('checking')
  const [isLoading, setIsLoading] = React.useState(true)

  // Smart mode: auto-detect sync status
  const isSmartMode = !status && Boolean(userId || groupId)

  // Get unsafe mode from localStorage
  const { isUnsafeMode } = useUnsafeMode()

  // Get user details to check if user has a group
  const { data: userDetails } = useQuery({
    queryKey: ['user', userId, 'details'],
    queryFn: async () => {
      if (!userId) return null
      try {
        return await usersAPI.getById(userId)
      } catch {
        return null
      }
    },
    enabled: isSmartMode && Boolean(userId),
    refetchOnMount: 'always',
    retry: false,
  })

  const userGroups = (userDetails as any)?.groups || []

  // User sync logic
  const { data: userSyncStatus, isLoading: userSyncLoading, error: userSyncError } = useQuery({
    queryKey: ['user', userId, 'sync-status', groupId || 'nogroup', isUnsafeMode ? 'unsafe' : 'safe'],
    queryFn: async () => {
      if (!userId) return null
      const result = await usersAPI.getSyncStatus(userId, groupId, isUnsafeMode)
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
    queryFn: async () => {
      if (!groupId) return null
      try {
        return await groupsAPI.getById(groupId)
      } catch {
        // Treat missing/404 group as null so we don't throw or keep retrying
        return null
      }
    },
    enabled: isSmartMode && Boolean(groupId),
    refetchOnMount: 'always',
    retry: false,
  })

  const groupUsers = (groupDetails as any)?.users || []

  // Get sync status for all users in the group
  const { data: groupSyncStatus } = useQuery({
    queryKey: ['group', groupId, 'sync-status', isUnsafeMode ? 'unsafe' : 'safe'],
    queryFn: async () => {
      if (!groupId || !groupUsers || groupUsers.length === 0) {
        return { status: 'stale', allSynced: false }
      }

      try {
        const userSyncResults = await Promise.all(
          groupUsers.map(async (user: any) => {
            try {
              const syncStatus = await usersAPI.getSyncStatus(user.id, groupId, isUnsafeMode)
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

    const onUserDeleted = (e: CustomEvent) => {
      const deletedId = (e as any).detail?.userId
      if (deletedId && userId === deletedId) {
        // Stop showing/polling for this user
        setSmartStatus('stale')
        setIsLoading(false)
      }
    }
    window.addEventListener('sfm:user:deleted' as any, onUserDeleted as any)

    const onGroupReordered = (e: CustomEvent) => {
      const id = (e as any).detail?.id
      if (groupId && id === groupId) {
        // Do not change current display; just refetch fresh status
        try { queryClient.invalidateQueries({ queryKey: ['group', groupId, 'sync-status'] }) } catch {}
        try { queryClient.refetchQueries({ queryKey: ['group', groupId, 'sync-status'], exact: true }) } catch {}
        if (userId) {
          try { queryClient.invalidateQueries({ queryKey: ['user', userId, 'sync-status'] }) } catch {}
          try { queryClient.refetchQueries({ queryKey: ['user', userId, 'sync-status'], exact: true }) } catch {}
        }
      }
    }
    window.addEventListener('sfm:group:reordered' as any, onGroupReordered as any)

    const onUserSyncData = (e: CustomEvent) => {
      const changedUserId = (e as any).detail?.userId
      if (userId && changedUserId === userId) {
        // Just refetch this user's status; keep current display until result arrives
        try { queryClient.invalidateQueries({ queryKey: ['user', userId, 'sync-status'] }) } catch {}
        try { queryClient.refetchQueries({ queryKey: ['user', userId, 'sync-status'], exact: true }) } catch {}
      }
    }
    window.addEventListener('sfm:user-sync-data' as any, onUserSyncData as any)

    if (userId) {
      // Check if user has no groups - show stale
      if (!userGroups || userGroups.length === 0) {
        setSmartStatus('stale')
        setIsLoading(false)
        return
      }

      if (userSyncStatus) {
      const status = (userSyncStatus as any).status
      // If status is 'error' but it's an authentication error, show 'connect' instead
      if (status === 'error') {
        const message = (userSyncStatus as any).message || ''
        if (message.includes('Stremio connection invalid') || 
            message.includes('authentication') || 
            message.includes('auth') || 
            message.includes('invalid') || 
            message.includes('corrupted')) {
          setSmartStatus('connect')
        } else {
          setSmartStatus('error')
        }
      } else {
        setSmartStatus(status || 'checking')
      }
      setIsLoading(false)
      }
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
    return () => {
      window.removeEventListener('sfm:user:deleted' as any, onUserDeleted as any)
      window.removeEventListener('sfm:group:reordered' as any, onGroupReordered as any)
      window.removeEventListener('sfm:user-sync-data' as any, onUserSyncData as any)
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
  // Make badge actionable whenever an onSync handler is provided in smart mode
  const finalIsClickable = isSmartMode 
    ? !!onSync
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
          text: 'Reconnect',
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
      case 'error':
        return {
          text: 'Error',
          dotColor: 'bg-red-500',
          bgColor: isMono ? 'bg-black text-white border border-white/20' : (prefersDark ? 'bg-red-900 text-red-300' : 'bg-red-100 text-red-800')
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
