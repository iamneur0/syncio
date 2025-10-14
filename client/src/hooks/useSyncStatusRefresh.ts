import { useQueryClient } from '@tanstack/react-query'

/**
 * Custom hook to trigger sync status refresh across the application
 * This ensures that sync badges and status indicators are updated
 * whenever group or user data changes
 */
export const useSyncStatusRefresh = () => {
  const queryClient = useQueryClient()

  const refreshGroupSyncStatus = (groupId: string) => {
    queryClient.invalidateQueries({ queryKey: ['group', groupId, 'details'] })
    queryClient.invalidateQueries({ queryKey: ['group', groupId, 'sync-status'] })
    queryClient.invalidateQueries({ queryKey: ['groups'] })
    // Force refetch of group sync status
    queryClient.refetchQueries({ queryKey: ['group', groupId, 'sync-status'] })
  }

  const refreshUserSyncStatus = (userId?: string) => {
    queryClient.invalidateQueries({ queryKey: ['user'] })
    if (userId) {
      queryClient.invalidateQueries({ queryKey: ['user', userId, 'sync-status'] })
    }
    // Also invalidate all user sync status queries to refresh group sync status
    queryClient.invalidateQueries({ queryKey: ['user'], predicate: (query) => 
      query.queryKey.includes('sync-status')
    })
    // Force refetch of all sync status queries
    queryClient.refetchQueries({ queryKey: ['user'], predicate: (query) => 
      query.queryKey.includes('sync-status')
    })
  }

  const refreshAllSyncStatus = (groupId?: string, userId?: string) => {
    if (groupId) {
      refreshGroupSyncStatus(groupId)
    }
    refreshUserSyncStatus(userId)
    
    // If we have a userId, also invalidate all group details to refresh group sync status
    // This ensures that when a user is synced, all groups they belong to get their sync status refreshed
    if (userId) {
      queryClient.invalidateQueries({ queryKey: ['group'], predicate: (query) => 
        query.queryKey.includes('details')
      })
    }
  }

  return {
    refreshGroupSyncStatus,
    refreshUserSyncStatus,
    refreshAllSyncStatus
  }
}
