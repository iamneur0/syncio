import { QueryClient } from '@tanstack/react-query'

/**
 * Utility functions for query invalidation patterns
 */

export interface QueryInvalidationOptions {
  entityType: string
  entityId?: string
  relatedEntities?: string[]
}

/**
 * Invalidate queries for a specific entity type
 */
export const invalidateEntityQueries = (
  queryClient: QueryClient, 
  options: QueryInvalidationOptions
) => {
  const { entityType, entityId, relatedEntities = [] } = options
  
  // Base entity queries
  queryClient.invalidateQueries({ queryKey: [entityType] })
  
  // Specific entity queries
  if (entityId) {
    queryClient.invalidateQueries({ queryKey: [entityType, entityId, 'details'] })
  }
  
  // Related entity queries
  relatedEntities.forEach(relatedEntity => {
    queryClient.invalidateQueries({ queryKey: [relatedEntity] })
  })
}

/**
 * Invalidate multiple query keys at once
 */
export const invalidateQueries = (queryClient: QueryClient, keys: string[]) => {
  keys.forEach(key => {
    queryClient.invalidateQueries({ queryKey: [key] })
  })
}

/**
 * Common invalidation patterns for different entity types
 */
export const invalidateUserQueries = (queryClient: QueryClient, userId?: string) => {
  invalidateEntityQueries(queryClient, {
    entityType: 'user',
    entityId: userId,
    relatedEntities: ['users']
  })
}

export const invalidateGroupQueries = (queryClient: QueryClient, groupId?: string) => {
  invalidateEntityQueries(queryClient, {
    entityType: 'group',
    entityId: groupId,
    relatedEntities: ['groups', 'users']
  })
  
  // Also invalidate group-specific queries
  if (groupId) {
    queryClient.invalidateQueries({ queryKey: ['group', groupId, 'addons'] })
    queryClient.invalidateQueries({ queryKey: ['group', groupId, 'sync-status'] })
  }
}

export const invalidateAddonQueries = (queryClient: QueryClient, addonId?: string) => {
  invalidateEntityQueries(queryClient, {
    entityType: 'addon',
    entityId: addonId,
    relatedEntities: ['addons', 'groups']
  })
}

/**
 * Invalidate sync status queries
 */
export const invalidateSyncStatusQueries = (
  queryClient: QueryClient, 
  userId?: string, 
  groupId?: string
) => {
  if (userId) {
    queryClient.invalidateQueries({ queryKey: ['user', userId, 'sync-status'] })
  }
  if (groupId) {
    queryClient.invalidateQueries({ queryKey: ['group', groupId, 'sync-status'] })
  }
}
