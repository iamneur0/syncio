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
    queryFn: async () => userId ? usersAPI.getSyncStatus(userId, groupId) : null,
    enabled: isSmartMode && Boolean(userId),
    staleTime: 5_000,
  })

  // Group sync logic
  const { data: groupDetails } = useQuery({
    queryKey: ['group', groupId, 'sync-status'],
    queryFn: () => groupId ? groupsAPI.getById(groupId) : null,
    enabled: isSmartMode && Boolean(groupId),
    refetchOnMount: 'always',
  })

  const groupUsers = (groupDetails as any)?.users || []

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

      // Check if group was recently synced
      const recentSync = localStorage.getItem(`sfm_group_sync:${groupId}`)
      const syncTime = recentSync ? parseInt(recentSync) : 0
      const isRecentlySynced = (Date.now() - syncTime) < 5000

      if (isRecentlySynced) {
        setSmartStatus('synced')
        setIsLoading(false)
        return
      }

      // Check group sync status by checking all users
      checkGroupSyncStatus()
    }
  }, [userId, userSyncStatus, groupId, groupUsers, isSyncing, isSmartMode])

  // Helper to check group sync status
  const checkGroupSyncStatus = React.useCallback(async () => {
    if (!groupId || !groupUsers || groupUsers.length === 0) {
      setSmartStatus('stale')
      setIsLoading(false)
      return
    }

    try {
      setIsLoading(true)
      setSmartStatus('checking')

      const userSyncResults = await Promise.all(
        groupUsers.map(async (user: any) => {
          try {
            // Use localStorage like the old GroupSyncBadge for consistency
            const cached = localStorage.getItem(`sfm_user_sync_status:${user.id}`)
            if (cached === 'synced') return true
            if (cached === 'unsynced') return false
            // Fallback: conservatively unsynced if unknown
            return false
          } catch {
            return false
          }
        })
      )
      const allUsersSynced = userSyncResults.every(Boolean)
      setSmartStatus(allUsersSynced ? 'synced' : 'unsynced')
    } catch {
      setSmartStatus('unsynced')
    } finally {
      setIsLoading(false)
    }
  }, [groupId, groupUsers, queryClient])

  // Listen for group reordering events
  React.useEffect(() => {
    if (!groupId) return

    const onGroupReordered = (e: CustomEvent) => {
      if ((e as any).detail?.id === groupId) {
        setSmartStatus('unsynced')
      }
    }
    window.addEventListener('sfm:group:reordered' as any, onGroupReordered as any)
    return () => window.removeEventListener('sfm:group:reordered' as any, onGroupReordered as any)
  }, [groupId])

  // Listen for user sync data changes
  React.useEffect(() => {
    if (!groupId || !groupUsers.length) return

    const onUserSyncData = (e: CustomEvent) => {
      const { userId: changedUserId } = (e as any).detail || {}
      if (groupUsers.some((u: any) => u.id === changedUserId)) {
        checkGroupSyncStatus()
      }
    }
    window.addEventListener('sfm:user-sync-data' as any, onUserSyncData as any)
    return () => window.removeEventListener('sfm:user-sync-data' as any, onUserSyncData as any)
  }, [groupId, groupUsers, checkGroupSyncStatus])

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
          bgColor: isMono ? 'bg-black text-white' : (prefersDark ? 'bg-gray-700 text-gray-100' : 'bg-gray-600 text-gray-100')
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
