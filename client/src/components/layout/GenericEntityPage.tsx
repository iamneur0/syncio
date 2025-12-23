'use client'

import React, { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { addonsAPI, usersAPI, groupsAPI } from '@/services/api'
import { useSyncStatusRefresh } from '@/hooks/useSyncStatusRefresh'
import { invalidateEntityQueries, invalidateSyncStatusQueries } from '@/utils/queryUtils'
import { genericSuccessHandlers, addonSuccessHandlers, userSuccessHandlers, groupSuccessHandlers } from '@/utils/toastUtils'
import { useModalState, useUnsafeMode } from '@/hooks/useCommonState'
import toast from 'react-hot-toast'
import { Puzzle, User as UserIcon, Users } from 'lucide-react'

// Types
interface BaseEntity {
  id: string
  name: string
  isActive: boolean
  colorIndex?: number
  // user
  email?: string
  username?: string
  // group
  description?: string
  // common
  iconUrl?: string
}

// Components
import PageHeader from './PageHeader'
import { EntityCard } from '@/components/entities'
import { AddonDetailModal, UserDetailModal, GroupDetailModal, AddonAddModal, UserAddModal, GroupAddModal, UserInviteModal, ConfirmDialog } from '@/components/modals'
import { LoadingSkeleton, EmptyState } from '@/components/ui'

// Types
export type EntityType = 'addon' | 'user' | 'group' | 'invite'

export interface EntityPageConfig {
  entityType: EntityType
  title: string
  description: string
  searchPlaceholder: string
  emptyStateTitle: string
  emptyStateDescription: string
  emptyStateAction: {
    label: string
    onClick: () => void
  }
  icon: React.ReactNode
  api: {
    getAll: () => Promise<any[]>
    create: (data: any) => Promise<any>
    update: (id: string, data: any) => Promise<any>
    delete: (id: string) => Promise<any>
    enable?: (id: string) => Promise<any>
    disable?: (id: string) => Promise<any>
    reload?: (id: string) => Promise<any>
    reloadAll?: () => Promise<any>
    sync?: (id: string) => Promise<any>
    clone?: (id: string) => Promise<any>
    import?: (id: string) => Promise<any>
  }
  detailModal?: React.ComponentType<any>
  addModal: React.ComponentType<any>
  getEntityStatus?: (entity: any) => boolean
  getEntityName?: (entity: any) => string
  getEntityId?: (entity: any) => string
  searchFields?: string[]
  customContent?: React.ReactNode | ((viewMode: 'card' | 'list') => React.ReactNode)
  customFilter?: (entities: any[], statusFilter: string, searchTerm: string) => any[]
  customSort?: (entities: any[]) => any[]
  customSync?: () => void
  customSyncLabel?: string
  refetchInterval?: number
  customEntityTransform?: (entity: any) => any
  customToggleHandler?: (id: string, isActive: boolean, entity: any) => void
  customBadgeRenderer?: (entity: any, viewMode: 'card' | 'list') => React.ReactNode
  customRefreshOAuth?: (entity: any) => void
}

interface GenericEntityPageProps {
  config: EntityPageConfig
}

export default function GenericEntityPage({ config }: GenericEntityPageProps) {
  const queryClient = useQueryClient()
  
  // Create config with proper setShowAddModal function
  const finalConfig = {
    ...config,
    emptyStateAction: {
      ...config.emptyStateAction,
      onClick: () => {} // Will be set later
    }
  }
  
  // State
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(`${config.entityType}-filter`)
      return saved || 'all'
    }
    return 'all'
  })
  
  // Persist filter to localStorage
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`${finalConfig.entityType}-filter`, statusFilter)
    }
  }, [statusFilter, finalConfig.entityType])
  const [viewMode, setViewMode] = useState<'card' | 'list'>(() => {
    if (typeof window !== 'undefined') {
      const raw = String(localStorage.getItem('global-view-mode') || 'card').toLowerCase().trim()
      return raw === 'list' ? 'list' : 'card'
    }
    return 'card'
  })
  const [selectedEntities, setSelectedEntities] = useState<string[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedEntity, setSelectedEntity] = useState<any>(null)
  const [editingUser, setEditingUser] = useState<any>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [entityToDelete, setEntityToDelete] = useState<{ id: string; name: string } | null>(null)
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const [syncingEntities, setSyncingEntities] = useState<Set<string>>(new Set())
  const [reloadingEntities, setReloadingEntities] = useState<Set<string>>(new Set())
  const [importingEntities, setImportingEntities] = useState<Set<string>>(new Set())
  const [deletingEntities, setDeletingEntities] = useState<Set<string>>(new Set())

  // Update finalConfig with proper setShowAddModal function
  finalConfig.emptyStateAction.onClick = () => setShowAddModal(true)

  const { refreshAllSyncStatus } = useSyncStatusRefresh()
  const { isUnsafeMode } = useUnsafeMode()

  // Data fetching
  const { data: entities, isLoading, error } = useQuery({
    queryKey: [finalConfig.entityType],
    queryFn: finalConfig.api.getAll,
    staleTime: finalConfig.entityType === 'invite' ? 0 : undefined,
    refetchInterval: finalConfig.refetchInterval
  })

  // Get related data for modals
  const { data: groups } = useQuery({
    queryKey: ['groups'],
    queryFn: groupsAPI.getAll,
    enabled: finalConfig.entityType === 'addon' || finalConfig.entityType === 'user'
  })

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: usersAPI.getAll,
    enabled: finalConfig.entityType === 'group'
  })

  // Mutations
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => finalConfig.api.update(id, data),
    onSuccess: () => {
      invalidateEntityQueries(queryClient, { entityType: finalConfig.entityType })
      // Use entity-specific success handlers
      if (finalConfig.entityType === 'addon') {
        addonSuccessHandlers.update()
      } else if (finalConfig.entityType === 'user') {
        userSuccessHandlers.update()
      } else if (finalConfig.entityType === 'group') {
        groupSuccessHandlers.update()
      } else {
        toast.success(`${finalConfig.title.slice(0, -1)} updated successfully`)
      }
      // Close detail modal after successful save
      setShowDetailModal(false)
      setSelectedEntity(null)
    },
    onError: (error: any) => {
      // Check both 'message' and 'error' fields from backend response
      const message = error?.response?.data?.message || error?.response?.data?.error || error?.message || `Failed to update ${finalConfig.entityType}`
      toast.error(message)
    }
  })
  const createMutation = useMutation({
    mutationFn: (data: any) => finalConfig.api.create(data),
    onSuccess: (createdEntity: any) => {
      invalidateEntityQueries(queryClient, { entityType: finalConfig.entityType })
      genericSuccessHandlers.sync(finalConfig.title.slice(0, -1))
      setShowAddModal(false)

      // For invites, immediately open the detail modal for the newly created invite
      if (finalConfig.entityType === 'invite' && createdEntity) {
        setSelectedEntity(createdEntity)
        setShowDetailModal(true)
      }
    },
    onError: (error: any) => {
      // Check both 'message' and 'error' fields from backend response
      const message = error?.response?.data?.message || error?.response?.data?.error || error?.message || `Failed to create ${finalConfig.entityType}`
      toast.error(message)
    }
  })

  const deleteMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => finalConfig.api.delete(id),
    onSuccess: (_data, variables) => {
      // Invalidate the main list
      invalidateEntityQueries(queryClient, { entityType: finalConfig.entityType })
      // Stop any lingering sync-status polling for this specific user
      if (finalConfig.entityType === 'user' && variables?.id) {
        try {
          // Remove and cancel the polling query entirely
          queryClient.removeQueries({ queryKey: ['user', variables.id, 'sync-status'], exact: true })
        } catch {}
        try {
          window.dispatchEvent(new CustomEvent('sfm:user:deleted', { detail: { userId: variables.id } } as any))
        } catch {}
      }
      genericSuccessHandlers.sync(finalConfig.title.slice(0, -1))
      setShowDeleteConfirm(false)
      setEntityToDelete(null)
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || error?.message || `Failed to delete ${finalConfig.entityType}`
      toast.error(message)
    }
  })

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => {
      if (isActive && finalConfig.api.enable) {
        return finalConfig.api.enable(id)
      } else if (!isActive && finalConfig.api.disable) {
        return finalConfig.api.disable(id)
      }
      throw new Error('Toggle not supported for this entity type')
    },
    onSuccess: (_, { id, isActive }) => {
      queryClient.invalidateQueries({ queryKey: [finalConfig.entityType] })
      // Trigger sync status refresh for users and groups
      if (finalConfig.entityType === 'user' || finalConfig.entityType === 'group') {
        refreshAllSyncStatus(finalConfig.entityType === 'group' ? id : undefined, finalConfig.entityType === 'user' ? id : undefined)
      }
      toast.success(`${finalConfig.title.slice(0, -1)} ${isActive ? 'enabled' : 'disabled'} successfully`)
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || error?.message || `Failed to toggle ${finalConfig.entityType} status`
      toast.error(message)
    }
  })

  const reloadAllMutation = useMutation({
    mutationFn: async () => {
      if (finalConfig.api.reloadAll) {
        return finalConfig.api.reloadAll()
      } else if (finalConfig.api.reload && Array.isArray(entities)) {
        await Promise.all(entities.map((entity: any) => finalConfig.api.reload!(entity.id)))
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [finalConfig.entityType] })
      // Trigger sync status refresh for users and groups
      if (finalConfig.entityType === 'user' || finalConfig.entityType === 'group') {
        refreshAllSyncStatus()
      }
      toast.success(`All ${finalConfig.entityType}s reloaded successfully`)
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || error?.message || `Failed to reload ${finalConfig.entityType}s`
      toast.error(message)
    }
  })

  const cloneMutation = useMutation({
    mutationFn: (id: string) => finalConfig.api.clone!(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [finalConfig.entityType] })
      // Trigger sync status refresh for groups (cloning affects group structure)
      if (finalConfig.entityType === 'group') {
        refreshAllSyncStatus()
      }
      toast.success(`${finalConfig.title.slice(0, -1)} cloned successfully`)
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || error?.message || `Failed to clone ${finalConfig.entityType}`
      toast.error(message)
    }
  })

  const reloadMutation = useMutation({
    mutationFn: (id: string) => finalConfig.api.reload!(id),
    onSuccess: (result: any, id) => {
      queryClient.invalidateQueries({ queryKey: [finalConfig.entityType] })
      // Trigger sync status refresh for users and groups
      if (finalConfig.entityType === 'user' || finalConfig.entityType === 'group') {
        refreshAllSyncStatus(finalConfig.entityType === 'group' ? id : undefined, finalConfig.entityType === 'user' ? id : undefined)
      }
      
      // Show specific reload statistics for users and groups
      if ((finalConfig.entityType === 'user' || finalConfig.entityType === 'group') && result?.reloadedCount !== undefined) {
        const { reloadedCount, failedCount, total } = result
        if (failedCount > 0) {
          toast.success(`${reloadedCount}/${total} addons reloaded successfully (${failedCount} failed)`)
        } else {
          toast.success(`${reloadedCount}/${total} addons reloaded successfully`)
        }
      } else {
        // Default message for other entity types
        toast.success(`${finalConfig.title.slice(0, -1)} reloaded successfully`)
      }
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || error?.message || `Failed to reload ${finalConfig.entityType}`
      toast.error(message)
    }
  })

  const importMutation = useMutation({
    mutationFn: (id: string) => finalConfig.api.import!(id),
    onSuccess: (result: any, id) => {
      queryClient.invalidateQueries({ queryKey: [finalConfig.entityType] })
      // Trigger sync status refresh for users (importing affects user addons)
      if (finalConfig.entityType === 'user') {
        refreshAllSyncStatus(undefined, id)
      }
      if (result && typeof result === 'object') {
        toast.success(result.message || `${finalConfig.title.slice(0, -1)} imported successfully`)
      } else {
        toast.success(`${finalConfig.title.slice(0, -1)} imported successfully`)
      }
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || error?.message || `Failed to import ${finalConfig.entityType}`
      toast.error(message)
    }
  })

  const syncAllMutation = useMutation({
    mutationFn: async () => {
      if (finalConfig.api.sync && Array.isArray(entities)) {
        // For groups, sync all selected groups
        // For users, sync all selected users
        await Promise.all(selectedEntities.map(id => finalConfig.api.sync!(id)))
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [finalConfig.entityType] })
      // Trigger sync status refresh for users and groups
      if (finalConfig.entityType === 'user' || finalConfig.entityType === 'group') {
        refreshAllSyncStatus()
      }
      toast.success(`All ${finalConfig.title.toLowerCase()} synced successfully`)
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || error?.message || `Failed to sync ${finalConfig.entityType}`
      toast.error(message)
    }
  })

  // Handlers
  const handleViewModeChange = (mode: 'card' | 'list') => {
    setViewMode(mode)
    if (typeof window !== 'undefined') {
      localStorage.setItem('global-view-mode', mode)
    }
  }

  const handleSelectAll = () => {
    if (Array.isArray(entities)) {
      setSelectedEntities(entities.map((entity: any) => finalConfig.getEntityId?.(entity) || entity.id))
    }
  }

  const handleDeselectAll = () => {
    setSelectedEntities([])
  }

  const handleEntityToggle = (id: string) => {
    setSelectedEntities(prev => 
      prev.includes(id) 
        ? prev.filter(entityId => entityId !== id)
        : [...prev, id]
    )
  }

  const handleToggleEntityStatus = (id: string, isActive: boolean) => {
    if (finalConfig.api.enable && finalConfig.api.disable) {
      // Toggle the current state - if currently active, disable it; if inactive, enable it
      toggleStatusMutation.mutate({ id, isActive: !isActive })
    }
  }

  const handleViewEntity = async (entity: any) => {
    try {
      // For addons, fetch full details
      if (finalConfig.entityType === 'addon') {
        const response = await fetch(`/api/addons/${entity.id}`)
        const fullEntity = await response.json()
        setSelectedEntity(fullEntity)
      } else {
        setSelectedEntity(entity)
      }
      setShowDetailModal(true)
    } catch (error) {
      console.error(`Failed to fetch ${finalConfig.entityType} details:`, error)
      toast.error(`Failed to load ${finalConfig.entityType} details`)
    }
  }

  const handleCloseDetailModal = () => {
    setShowDetailModal(false)
    setSelectedEntity(null)
  }

  const handleDeleteEntity = (id: string, name: string) => {
    setEntityToDelete({ id, name })
    setShowDeleteConfirm(true)
  }

  const handleConfirmDelete = () => {
    if (entityToDelete) {
      setDeletingEntities(prev => { const next = new Set(prev); next.add(entityToDelete.id); return next })
      deleteMutation.mutate({ id: entityToDelete.id, name: entityToDelete.name })
    }
  }

  const handleBulkDelete = () => {
    if (selectedEntities.length === 0) return
    setShowBulkDeleteConfirm(true)
  }

  const handleConfirmBulkDelete = async () => {
    try {
      setDeletingEntities(prev => { const next = new Set(prev); selectedEntities.forEach(id => next.add(id)); return next })
      await Promise.all(selectedEntities.map(id => finalConfig.api.delete(id)))
      
      queryClient.invalidateQueries({ queryKey: [finalConfig.entityType] })
      setSelectedEntities([])
      setShowBulkDeleteConfirm(false)
      toast.success(`${selectedEntities.length} ${finalConfig.entityType}${selectedEntities.length > 1 ? 's' : ''} deleted successfully`)
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || `Failed to delete ${finalConfig.entityType}s`
      toast.error(message)
    }
  }

  const handleSync = async (id: string) => {
    if (finalConfig.api.sync) {
      // Get sync mode and unsafe mode from localStorage
      
      // For users, check if they need to reconnect first
      if (finalConfig.entityType === 'user') {
        try {
          const syncStatus = await usersAPI.getSyncStatus(id)
          if (syncStatus?.status === 'connect') {
            // User needs to reconnect - use the user data from the entities list instead of fetching
            const user = entities?.find((u: any) => u.id === id)
            if (user) {
              const editingUserData = {
                id: user.id,
                username: user.username || user.email,
                email: user.email,
                groupId: user.groups?.[0]?.id,
                colorIndex: user.colorIndex || 0
              }
              setEditingUser(editingUserData)
              setShowAddModal(true)
              return
            }
          }
        } catch (error) {
          // If we can't get sync status, try to sync anyway
          console.warn('Could not check sync status, attempting sync:', error)
        }
      }

      setSyncingEntities(prev => new Set(prev).add(id))
      try {
        // Sync the group or user itself
        if (finalConfig.entityType === 'user') {
          // User sync (backend reads DB config for behavior)
          await usersAPI.sync(id)
        } else if (finalConfig.entityType === 'group') {
          // Sync the group (backend reads DB config for behavior)
          await groupsAPI.sync(id)
        } else {
          // Fallback for other entity types
          await finalConfig.api.sync(id)
        }
        toast.success(`${finalConfig.title.slice(0, -1)} synced successfully`)
        queryClient.invalidateQueries({ queryKey: [finalConfig.entityType] })
        // Refresh sync badges
        if (finalConfig.entityType === 'user') {
          refreshAllSyncStatus(undefined, id)
        } else if (finalConfig.entityType === 'group') {
          refreshAllSyncStatus(id)
        }
      } catch (error: any) {
        const message = error?.response?.data?.message || error?.message || `Failed to sync ${finalConfig.entityType}`
        toast.error(message)
      } finally {
        setSyncingEntities(prev => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }
    }
  }

  const handleClone = (entity: BaseEntity) => {
    if (finalConfig.api.clone) {
      cloneMutation.mutate(entity.id)
    }
  }

  const handleImport = (id: string) => {
    if (finalConfig.api.import) {
      importMutation.mutate(id)
    }
  }

  const handleReload = (id: string) => {
    if (finalConfig.api.reload) {
      reloadMutation.mutate(id)
    }
  }

  // Fetch sync status for all entities when filtering by sync status
  const needsSyncStatus = (finalConfig.entityType === 'user' || finalConfig.entityType === 'group') && 
    (statusFilter === 'synced' || statusFilter === 'unsynced' || statusFilter === 'stale')

  // Fetch sync statuses for users
  const userSyncStatuses = useQuery({
    queryKey: ['users', 'sync-statuses', isUnsafeMode ? 'unsafe' : 'safe'],
    queryFn: async () => {
      if (finalConfig.entityType !== 'user' || !needsSyncStatus || !Array.isArray(entities)) return {}
      const statusMap: Record<string, string> = {}
      await Promise.all(
        entities.map(async (entity: any) => {
          try {
            // Get user's first group if available
            const userDetails = await usersAPI.getById(entity.id)
            const groupId = (userDetails as any)?.groups?.[0]?.id
            const syncStatus = await usersAPI.getSyncStatus(entity.id, groupId, isUnsafeMode)
            statusMap[entity.id] = (syncStatus as any)?.status || 'unsynced'
          } catch {
            statusMap[entity.id] = 'unsynced'
          }
        })
      )
      return statusMap
    },
    enabled: finalConfig.entityType === 'user' && needsSyncStatus && Array.isArray(entities) && entities.length > 0,
    staleTime: 30000, // Cache for 30 seconds
  })

  // Fetch sync statuses for groups
  const groupSyncStatuses = useQuery({
    queryKey: ['groups', 'sync-statuses', isUnsafeMode ? 'unsafe' : 'safe'],
    queryFn: async () => {
      if (finalConfig.entityType !== 'group' || !needsSyncStatus || !Array.isArray(entities)) return {}
      const statusMap: Record<string, string> = {}
      await Promise.all(
        entities.map(async (entity: any) => {
          try {
            const groupDetails = await groupsAPI.getById(entity.id)
            const groupUsers = (groupDetails as any)?.users || []
            if (groupUsers.length === 0) {
              statusMap[entity.id] = 'stale'
              return
            }
            const userSyncResults = await Promise.all(
              groupUsers.map(async (user: any) => {
                try {
                  const syncStatus = await usersAPI.getSyncStatus(user.id, entity.id, isUnsafeMode)
                  return (syncStatus as any)?.status === 'synced'
                } catch {
                  return false
                }
              })
            )
            const allUsersSynced = userSyncResults.every(Boolean)
            statusMap[entity.id] = allUsersSynced ? 'synced' : 'unsynced'
          } catch {
            statusMap[entity.id] = 'unsynced'
          }
        })
      )
      return statusMap
    },
    enabled: finalConfig.entityType === 'group' && needsSyncStatus && Array.isArray(entities) && entities.length > 0,
    staleTime: 30000, // Cache for 30 seconds
  })

  // Filter entities based on search and status
  const displayEntities = useMemo(() => {
    if (!Array.isArray(entities)) return []
    
    let filtered = entities
    
    // Use custom filter if provided
    if (finalConfig.customFilter) {
      filtered = finalConfig.customFilter(filtered, statusFilter, searchTerm)
    } else {
      // Apply status filter for addons, users and groups
      if (statusFilter !== 'all') {
        filtered = filtered.filter((entity: any) => {
          // For addons, only check active/inactive status
          if (finalConfig.entityType === 'addon') {
            if (statusFilter === 'active' || statusFilter === 'inactive') {
              const isActive = finalConfig.getEntityStatus?.(entity) ?? (entity.status === 'active' || entity.isActive === true)
              return statusFilter === 'active' ? isActive : !isActive
            }
            return true
          }
          
          // For users and groups
          if (finalConfig.entityType === 'user' || finalConfig.entityType === 'group') {
            // Check active/inactive status
            if (statusFilter === 'active' || statusFilter === 'inactive') {
              const isActive = entity.isActive === true
              return statusFilter === 'active' ? isActive : !isActive
            }
            
            // Check sync status
            if (statusFilter === 'synced' || statusFilter === 'unsynced' || statusFilter === 'stale') {
              const syncStatusMap = finalConfig.entityType === 'user' 
                ? userSyncStatuses.data 
                : groupSyncStatuses.data
              const entitySyncStatus = syncStatusMap?.[entity.id] || 'unsynced'
              return entitySyncStatus === statusFilter
            }
          }
          
          return true
        })
      }
      
      // Apply search filter
      if (searchTerm.trim()) {
        const searchLower = searchTerm.toLowerCase()
        const searchFields = finalConfig.searchFields || ['name', 'description']
        
        filtered = filtered.filter((entity: any) => {
          return searchFields.some(field => {
            const value = entity[field]
            return value && String(value).toLowerCase().includes(searchLower)
          })
        })
      }
    }
    
    // Use custom sort if provided
    if (finalConfig.customSort) {
      filtered = finalConfig.customSort(filtered)
    } else if (finalConfig.entityType === 'addon') {
      // Sort addons alphabetically by name
      filtered = [...filtered].sort((a: any, b: any) => {
        const nameA = (finalConfig.getEntityName?.(a) || a.name || '').toLowerCase()
        const nameB = (finalConfig.getEntityName?.(b) || b.name || '').toLowerCase()
        return nameA.localeCompare(nameB)
      })
    }
    
    return filtered
  }, [entities, searchTerm, statusFilter, finalConfig.searchFields, finalConfig.entityType, finalConfig.getEntityName, finalConfig.customFilter, finalConfig.customSort, userSyncStatuses.data, groupSyncStatuses.data])

  // Check if empty state
  const isEmpty = !isLoading && Array.isArray(entities) && entities.length === 0

  // Error state - show header but error for content
  const renderErrorContent = () => (
    <EmptyState
      icon={finalConfig.icon}
      title={`Failed to load ${finalConfig.entityType}s`}
      description={`There was an error loading the ${finalConfig.entityType}s. Please try again.`}
    />
  )

  return (
    <>
      <div className="pt-2 px-4 pb-4 sm:p-6 space-y-6">
        <PageHeader
          title={finalConfig.title}
          description={finalConfig.description}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder={finalConfig.searchPlaceholder}
          selectedCount={selectedEntities.length}
          onSelectAll={handleSelectAll}
          onDeselectAll={handleDeselectAll}
          onAdd={() => setShowAddModal(true)}
          onInvite={undefined}
          onReload={finalConfig.entityType === 'addon' ? () => reloadAllMutation.mutate() : undefined}
          onSync={finalConfig.customSync ? finalConfig.customSync : (finalConfig.entityType === 'group' || finalConfig.entityType === 'user' ? () => syncAllMutation.mutate() : undefined)}
          onDelete={handleBulkDelete}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          isReloading={reloadAllMutation.isPending}
          isReloadDisabled={selectedEntities.length === 0 || reloadAllMutation.isPending}
          isSyncing={syncAllMutation.isPending}
          isSyncDisabled={selectedEntities.length === 0 || syncAllMutation.isPending}
          isDeleteDisabled={selectedEntities.length === 0}
          filterOptions={
            finalConfig.entityType === 'addon'
              ? [
                  { value: 'all', label: 'All' },
                  { value: 'inactive', label: 'Inactive' },
                  { value: 'active', label: 'Active' }
                ]
              : (finalConfig.entityType === 'user' || finalConfig.entityType === 'group')
              ? [
                  { value: 'all', label: 'All' },
                  { value: 'unsynced', label: 'Unsynced' },
                  { value: 'stale', label: 'Stale' },
                  { value: 'synced', label: 'Synced' },
                  { value: 'inactive', label: 'Inactive' },
                  { value: 'active', label: 'Active' }
                ]
              : finalConfig.entityType === 'invite'
              ? [
                  { value: 'all', label: 'All' },
                  { value: 'incomplete', label: 'Incomplete' },
                  { value: 'expired', label: 'Expired' },
                  { value: 'full', label: 'Full' },
                  { value: 'inactive', label: 'Inactive' },
                  { value: 'active', label: 'Active' }
                ]
              : undefined
          }
          filterValue={statusFilter}
          onFilterChange={setStatusFilter}
          filterPlaceholder="Filter by status"
        />

        {isLoading ? null : error ? (
          renderErrorContent()
        ) : isEmpty ? (
          <EmptyState
            icon={finalConfig.icon}
            title={finalConfig.emptyStateTitle}
            description={finalConfig.emptyStateDescription}
            action={finalConfig.emptyStateAction}
          />
        ) : viewMode === 'card' ? (
          <div className="grid [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))] gap-4 items-start max-w-full">
            {displayEntities.map((entity: any) => {
              const transformedEntity = finalConfig.customEntityTransform 
                ? finalConfig.customEntityTransform(entity)
                : {
                    ...entity,
                    name: finalConfig.getEntityName?.(entity) || entity.name,
                    isActive: finalConfig.getEntityStatus?.(entity) ?? (entity.status === 'active' || entity.isActive)
                  }
              const handleToggle = finalConfig.customToggleHandler
                ? (id: string, isActive: boolean) => finalConfig.customToggleHandler!(id, isActive, entity)
                : (finalConfig.api.enable && finalConfig.api.disable ? handleToggleEntityStatus : () => {})
              
              return (
                <EntityCard
                  key={finalConfig.getEntityId?.(entity) || entity.id}
                  variant={finalConfig.entityType}
                  entity={transformedEntity}
                  isSelected={selectedEntities.includes(finalConfig.getEntityId?.(entity) || entity.id)}
                  onSelect={handleEntityToggle}
                  onToggle={handleToggle}
                  onDelete={(id) => handleDeleteEntity(id, finalConfig.getEntityName?.(entity) || entity.name)}
                  onView={handleViewEntity}
                  onSync={finalConfig.api.sync && !deletingEntities.has(finalConfig.getEntityId?.(entity) || entity.id) ? handleSync : undefined}
                  onClone={finalConfig.api.clone ? handleClone : undefined}
                  onImport={finalConfig.api.import ? handleImport : undefined}
                  onReload={finalConfig.api.reload ? handleReload : undefined}
                  onRefreshOAuth={finalConfig.customRefreshOAuth ? () => finalConfig.customRefreshOAuth!(entity) : undefined}
                  isSyncing={syncingEntities.has(finalConfig.getEntityId?.(entity) || entity.id)}
                  isReloading={reloadingEntities.has(finalConfig.getEntityId?.(entity) || entity.id)}
                  isImporting={importingEntities.has(finalConfig.getEntityId?.(entity) || entity.id)}
                  customBadge={finalConfig.customBadgeRenderer ? finalConfig.customBadgeRenderer(entity, viewMode) : undefined}
                  userProtectedSet={new Set(entity?.protectedAddons || [])}
                  userExcludedSet={new Set(entity?.excludedAddons || [])}
                />
              )
            })}
            
            {finalConfig.customContent && typeof finalConfig.customContent === 'function' 
              ? finalConfig.customContent(viewMode)
              : finalConfig.customContent && React.cloneElement(finalConfig.customContent as React.ReactElement<any>, { viewMode } as any)
            }
          </div>
        ) : (
          <div className="space-y-2">
            {displayEntities.map((entity: any) => {
              const transformedEntity = finalConfig.customEntityTransform 
                ? finalConfig.customEntityTransform(entity)
                : {
                    ...entity,
                    name: finalConfig.getEntityName?.(entity) || entity.name,
                    isActive: finalConfig.getEntityStatus?.(entity) ?? (entity.status === 'active' || entity.isActive)
                  }
              const handleToggle = finalConfig.customToggleHandler
                ? (id: string, isActive: boolean) => finalConfig.customToggleHandler!(id, isActive, entity)
                : (finalConfig.api.enable && finalConfig.api.disable ? handleToggleEntityStatus : () => {})
              
              return (
                <EntityCard
                  key={finalConfig.getEntityId?.(entity) || entity.id}
                  variant={finalConfig.entityType}
                  entity={transformedEntity}
                  isSelected={selectedEntities.includes(finalConfig.getEntityId?.(entity) || entity.id)}
                  onSelect={handleEntityToggle}
                  onToggle={handleToggle}
                  onDelete={(id) => handleDeleteEntity(id, finalConfig.getEntityName?.(entity) || entity.name)}
                  onView={handleViewEntity}
                  onSync={finalConfig.api.sync && !deletingEntities.has(finalConfig.getEntityId?.(entity) || entity.id) ? handleSync : undefined}
                  onClone={finalConfig.api.clone ? handleClone : undefined}
                  onImport={finalConfig.api.import ? handleImport : undefined}
                  onReload={finalConfig.api.reload ? handleReload : undefined}
                  onRefreshOAuth={finalConfig.customRefreshOAuth ? () => finalConfig.customRefreshOAuth!(entity) : undefined}
                  isSyncing={syncingEntities.has(finalConfig.getEntityId?.(entity) || entity.id)}
                  isReloading={reloadingEntities.has(finalConfig.getEntityId?.(entity) || entity.id)}
                  isImporting={importingEntities.has(finalConfig.getEntityId?.(entity) || entity.id)}
                  customBadge={finalConfig.customBadgeRenderer ? finalConfig.customBadgeRenderer(entity, viewMode) : undefined}
                  userProtectedSet={new Set(entity?.protectedAddons || [])}
                  userExcludedSet={new Set(entity?.excludedAddons || [])}
                  isListMode={true}
                />
              )
            })}
            
            {finalConfig.customContent && typeof finalConfig.customContent === 'function' 
              ? finalConfig.customContent(viewMode)
              : finalConfig.customContent && React.cloneElement(finalConfig.customContent as React.ReactElement<any>, { viewMode } as any)
            }
          </div>
        )}
      </div>

      {/* Modals */}
      {typeof window !== 'undefined' && document.body && createPortal(
        <finalConfig.addModal
          isOpen={showAddModal}
          editingUser={editingUser}
          onClose={() => {
            setShowAddModal(false)
            setEditingUser(null)
          }}
          onAdd={(data: any) => createMutation.mutate(data)}
          onAddUser={(data: any) => createMutation.mutate(data)}
          onAddAddon={(data: any) => createMutation.mutate(data)}
          onCreateGroup={(data: any) => createMutation.mutate(data)}
          onCreate={(data: any) => createMutation.mutate(data)}
          isCreating={createMutation.isPending}
          groups={groups || []}
          users={users || []}
        />,
        document.body
      )}

      {typeof window !== 'undefined' && document.body && finalConfig.detailModal && createPortal(
        <finalConfig.detailModal
          isOpen={showDetailModal}
          onClose={handleCloseDetailModal}
          {...(finalConfig.entityType === 'invite' 
            ? { invitation: selectedEntity }
            : { [finalConfig.entityType]: selectedEntity }
          )}
          groups={groups || []}
          users={users || []}
          userExcludedSet={new Set(selectedEntity?.excludedAddons || [])}
          userProtectedSet={new Set(selectedEntity?.protectedAddons || [])}
          isSyncing={selectedEntity ? syncingEntities.has(selectedEntity.id) : false}
          onUpdate={() => {}}
          onSync={(id: string) => {
            if ((finalConfig.entityType === 'user' || finalConfig.entityType === 'group') && id) {
              handleSync(id)
            }
          }}
          {...(finalConfig.entityType === 'addon' ? {
            onSave: (data: any) => {
              if (selectedEntity?.id) {
                updateMutation.mutate({ id: selectedEntity.id, data })
              }
            }
          } : {})}
        />,
        document.body
      )}

      {finalConfig.entityType === 'user' && typeof window !== 'undefined' && document.body && createPortal(
        <UserInviteModal
          isOpen={showInviteModal}
          onClose={() => setShowInviteModal(false)}
        />,
        document.body
      )}

      {typeof window !== 'undefined' && document.body && createPortal(
        <ConfirmDialog
          open={showDeleteConfirm}
          title={`Delete ${finalConfig.title.slice(0, -1)}`}
          body={
            <p className="text-sm">
              Are you sure you want to delete{' '}
              <span
                onClick={async () => {
                  if (entityToDelete?.name) {
                    await navigator.clipboard.writeText(entityToDelete.name)
                    toast.success('Copied to clipboard')
                  }
                }}
                className="font-bold px-2 py-1 rounded cursor-pointer inline-block"
                style={{ backgroundColor: 'var(--color-hover)' }}
                title="Click to copy"
              >
                {entityToDelete?.name}
              </span>
              ? This action cannot be undone.
            </p>
          }
          confirmText="Delete"
          cancelText="Cancel"
          isDanger={true}
          onConfirm={handleConfirmDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />,
        document.body
      )}

      {typeof window !== 'undefined' && document.body && createPortal(
        <ConfirmDialog
          open={showBulkDeleteConfirm}
          title={`Delete ${selectedEntities.length} ${finalConfig.title.slice(0, -1)}${selectedEntities.length > 1 ? 's' : ''}`}
          description={`Are you sure you want to delete ${selectedEntities.length} selected ${finalConfig.entityType}${selectedEntities.length > 1 ? 's' : ''}? This action cannot be undone.`}
          confirmText="Delete"
          cancelText="Cancel"
          isDanger={true}
          onConfirm={handleConfirmBulkDelete}
          onCancel={() => setShowBulkDeleteConfirm(false)}
        />,
        document.body
      )}
    </>
  )
}

// Helper function to create entity page configs
export function createEntityPageConfig(entityType: Exclude<EntityType, 'invite'>): EntityPageConfig {
  const baseConfigs = {
    addon: {
      entityType: 'addon' as const,
      title: 'Addons',
      description: 'Manage your Stremio addons',
      searchPlaceholder: 'Search addons...',
      emptyStateTitle: 'No addons yet',
      emptyStateDescription: 'Add your first addon to get started.',
      emptyStateAction: {
        label: 'Add Addon',
        onClick: () => {}
      },
      icon: <Puzzle className="w-16 h-16" />,
      api: {
        ...addonsAPI,
        sync: undefined,
        import: undefined
      },
      detailModal: AddonDetailModal,
      addModal: AddonAddModal,
      getEntityStatus: (entity: any) => entity.status === 'active',
      getEntityName: (entity: any) => entity.name,
      getEntityId: (entity: any) => entity.id,
      searchFields: ['name', 'description', 'manifestUrl']
    },
    user: {
      entityType: 'user' as const,
      title: 'Users',
      description: 'Manage Stremio users for your group',
      searchPlaceholder: 'Search users...',
      emptyStateTitle: 'No users yet',
      emptyStateDescription: 'Add your first user to get started.',
      emptyStateAction: {
        label: 'Add User',
        onClick: () => {}
      },
      icon: <UserIcon className="w-16 h-16" />,
      api: {
        ...usersAPI,
        clone: undefined,
        reload: usersAPI.reloadUserAddons,
        import: usersAPI.importUserAddons
      },
      detailModal: UserDetailModal,
      addModal: UserAddModal,
      getEntityStatus: (entity: any) => entity.isActive,
      getEntityName: (entity: any) => entity.username || entity.email || entity.name,
      getEntityId: (entity: any) => entity.id,
      searchFields: ['name', 'email']
    },
    group: {
      entityType: 'group' as const,
      title: 'Groups',
      description: 'Manage your Stremio groups',
      searchPlaceholder: 'Search groups...',
      emptyStateTitle: 'No groups yet',
      emptyStateDescription: 'Create your first group to get started.',
      emptyStateAction: {
        label: 'Create Group',
        onClick: () => {}
      },
      icon: <Users className="w-16 h-16" />,
      api: {
        ...groupsAPI,
        reload: groupsAPI.reloadGroupAddons, // Map reloadGroupAddons to reload
        sync: groupsAPI.sync, // Keep sync for sync badge
        import: undefined
      },
      detailModal: GroupDetailModal,
      addModal: GroupAddModal,
      getEntityStatus: (entity: any) => entity.isActive,
      getEntityName: (entity: any) => entity.name,
      getEntityId: (entity: any) => entity.id,
      searchFields: ['name', 'description']
    }
  }

  return baseConfigs[entityType]
}