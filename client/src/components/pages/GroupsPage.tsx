'use client'

import React, { useState, useMemo, useEffect, useRef, useLayoutEffect, useCallback } from 'react'
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { 
  Plus, 
  Search,
  Users,
  Eye,
  Trash2,
  Edit,
  Puzzle,
  ShieldAlert,
  RefreshCw,
  Copy,
  Grid3X3,
  List,
  AlertTriangle,
  EyeOff
} from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { getColorBgClass, getColorTextClass, getColorOptions } from '@/utils/colorMapping'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { groupsAPI, usersAPI, addonsAPI } from '@/services/api'
import toast from 'react-hot-toast'
import ConfirmDialog from '../common/ConfirmDialog'
import SyncBadge from '../common/SyncBadge'
import { useDebounce } from '../../hooks/useDebounce'


// Simple sync badge for individual users in group view
function GroupUserSyncBadge({ userId, userExcludedSet, userProtectedSet, isListMode = false }: { 
  userId: string, 
  userExcludedSet?: Set<string>, 
  userProtectedSet?: Set<string>, 
  isListMode?: boolean 
}) {
  const { isDark, isMono } = useTheme()
  const queryClient = useQueryClient()
  const { data: selectedGroup } = useQuery({ queryKey: ['selectedGroup'], queryFn: async () => null, enabled: false })
  const groupId = (selectedGroup as any)?.id || (typeof window !== 'undefined' ? (window as any).__sfmCurrentGroupId : undefined)

  const { data: syncStatus } = useQuery({
    queryKey: ['user', userId, 'sync-status', groupId || 'nogroup'],
    queryFn: async () => usersAPI.getSyncStatus(userId, groupId),
    staleTime: 5_000,
  })

  const [status, setStatus] = React.useState<'synced' | 'unsynced' | 'stale' | 'connect' | 'syncing' | 'checking'>('checking')

  React.useEffect(() => {
    if (!syncStatus) return
    setStatus(syncStatus.status || 'checking')
  }, [syncStatus])

  // Expose the sync status data for parent components
  React.useEffect(() => {
    if (syncStatus) {
      // Store the sync status data in a way that parent components can access it
      window.dispatchEvent(new CustomEvent('sfm:user-sync-data' as any, { 
        detail: { userId, syncStatus } 
      }))
    }
  }, [syncStatus, userId])

  const getStatusConfig = () => {
    const prefersDark = isDark || isMono
    switch (status) {
      case 'synced':
        return {
          dotColor: 'bg-green-500',
          bgColor: isMono ? 'bg-black text-white border border-white/20' : (prefersDark ? 'bg-green-900 text-green-300' : 'bg-green-100 text-green-800')
        }
      case 'unsynced':
        return {
          dotColor: 'bg-red-500',
          bgColor: isMono ? 'bg-black text-white border border-white/20' : (prefersDark ? 'bg-red-900 text-red-300' : 'bg-red-100 text-red-800')
        }
      case 'stale':
        return {
          dotColor: 'bg-gray-400',
          bgColor: isMono ? 'bg-black text-white' : (prefersDark ? 'bg-gray-700 text-gray-100' : 'bg-gray-600 text-gray-100')
        }
      case 'connect':
        return {
          dotColor: 'bg-stremio-purple',
          bgColor: 'bg-stremio-purple text-white'
        }
      case 'syncing':
        return {
          dotColor: 'bg-red-500',
          bgColor: isMono ? 'bg-black text-white border border-white/20' : (prefersDark ? 'bg-red-800 text-red-200' : 'bg-red-100 text-red-800')
        }
      case 'checking':
        return {
          dotColor: 'bg-gray-400',
          bgColor: isMono ? 'bg-black text-white border border-white/20' : (prefersDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-600')
        }
      default:
        return {
          dotColor: 'bg-gray-400',
          bgColor: isDark ? 'bg-gray-700 text-gray-100' : 'bg-gray-600 text-gray-100'
        }
    }
  }

  const config = getStatusConfig()
  const isSpinning = status === 'syncing' || status === 'checking'

  if (isListMode) {
  return (
      <div 
        className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${config.bgColor}`}
      >
        <div className={`w-2 h-2 rounded-full ${config.dotColor} ${isSpinning ? 'animate-spin' : ''}`} />
      </div>
    )
  }

  return (
    <div 
      className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${config.bgColor}`}
    >
      <div className={`w-2 h-2 rounded-full ${config.dotColor} ${isSpinning ? 'animate-spin' : ''}`} />
    </div>
  )
}

// Group sync status badge component
function GroupSyncBadge({ groupId, onSync, isSyncing, isListMode = false }: { groupId: string; onSync: (groupId: string) => void; isSyncing: boolean; isListMode?: boolean }) {
  const [status, setStatus] = React.useState<'synced' | 'unsynced' | 'stale' | 'syncing' | 'checking'>('checking')
  const [isLoading, setIsLoading] = React.useState(true)

  // Fetch group details to get users
  const { data: groupDetails } = useQuery({
    queryKey: ['group', groupId, 'sync-status'],
    queryFn: () => groupsAPI.getById(groupId),
    enabled: !!groupId,
    refetchOnMount: 'always',
  })

  const groupUsers = groupDetails?.users || []

  // If the group configuration changes (e.g., order changed), mark as unsynced immediately
  React.useEffect(() => {
    const onGroupReordered = (e: CustomEvent) => {
      if ((e as any).detail?.id === groupId) {
        setStatus('unsynced')
      }
    }
    window.addEventListener('sfm:group:reordered' as any, onGroupReordered as any)
    return () => window.removeEventListener('sfm:group:reordered' as any, onGroupReordered as any)
  }, [groupId])

  // Helper to recompute group status from cached per-user statuses
  const recomputeGroupStatus = React.useCallback(async () => {
    if (!groupId || !groupUsers || groupUsers.length === 0) {
      setStatus('stale')
      setIsLoading(false)
      return
    }

    try {
      setIsLoading(true)
      setStatus(prev => (prev === 'syncing' ? prev : 'checking'))

      // If currently syncing, keep syncing state
      if (isSyncing) {
        setStatus('syncing')
        setIsLoading(false)
        return
      }

      // Use cached user statuses first for snappy feedback
      const userSyncResults = await Promise.all(
        groupUsers.map(async (user: any) => {
          try {
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
      setStatus(allUsersSynced ? 'synced' : 'unsynced')
    } catch {
      setStatus('unsynced')
    } finally {
      setIsLoading(false)
    }
  }, [groupId, groupUsers, isSyncing])

  // Listen for user status updates to update group sync status immediately
  React.useEffect(() => {
    const onUserStatusUpdate = (e: CustomEvent) => {
      const { userId } = (e as any).detail || {}
      if (groupUsers.some((user: any) => user.id === userId)) {
        recomputeGroupStatus()
      }
    }
    window.addEventListener('sfm:user-status' as any, onUserStatusUpdate as any)
    return () => window.removeEventListener('sfm:user-status' as any, onUserStatusUpdate as any)
  }, [groupUsers, recomputeGroupStatus])

  // Listen for addon deletion to update group sync status
  React.useEffect(() => {
    const onAddonDeleted = (e: CustomEvent) => {
      // When any addon is deleted, re-check group status since it affects all users
      setStatus('checking')
      // Immediately recompute from per-user statuses so we don't stay stuck
      recomputeGroupStatus()
    }
    window.addEventListener('sfm:addon:deleted' as any, onAddonDeleted as any)
    return () => window.removeEventListener('sfm:addon:deleted' as any, onAddonDeleted as any)
  }, [])

  // After a sync completes, briefly go to checking so we don't flash unsynced
  React.useEffect(() => {
    if (isSyncing) {
      setStatus('syncing')
    } else {
      // transition from syncing -> checking
      setStatus('checking')
    }
  }, [isSyncing])

  // Add a dependency on the sync status to trigger re-checking
  const { data: syncStatusData } = useQuery({
    queryKey: ['group', groupId, 'sync-check'],
    queryFn: async () => {
      // This query will be invalidated after sync, triggering a re-check
      return { timestamp: Date.now() }
    },
    enabled: !!groupId,
    staleTime: 0, // Always consider stale to allow re-checking
    refetchOnMount: 'always',
  })

  // Whenever the re-check query or group members change, recompute
  React.useEffect(() => {
    if (groupId) {
      setStatus(prev => (prev === 'syncing' ? prev : 'checking'))
      recomputeGroupStatus()
    }
  }, [groupId, syncStatusData, groupUsers])

  // Re-check when Groups tab is activated
  React.useEffect(() => {
    const onTab = (e: CustomEvent) => {
      if (e.detail?.id === 'groups') {
        setStatus('checking')
        // Also recompute immediately from cached per-user statuses
        recomputeGroupStatus()
      }
    }
    window.addEventListener('sfm:tab:activated' as any, onTab as any)
    return () => window.removeEventListener('sfm:tab:activated' as any, onTab as any)
  }, [])

  // Allow external triggers (e.g., Users tab) to nudge groups to re-check now
  React.useEffect(() => {
    const onGroupsRecheck = () => {
      setStatus(prev => (prev === 'syncing' ? prev : 'checking'))
      recomputeGroupStatus()
    }
    window.addEventListener('sfm:groups:recheck' as any, onGroupsRecheck as any)
    return () => window.removeEventListener('sfm:groups:recheck' as any, onGroupsRecheck as any)
  }, [])

  React.useEffect(() => {
    if (!groupId || !groupUsers || groupUsers.length === 0) {
      // Empty group → show stale (like user with no group)
      setStatus('stale')
      setIsLoading(false)
      return
    }

    const checkGroupSyncStatus = async () => {
      try {
        setIsLoading(true)
        setStatus('checking')
        
        // If currently syncing, show syncing state
        if (isSyncing) {
          setStatus('syncing')
          setIsLoading(false)
          return
        }
        
        // Check if group was just synced by looking at recent sync events
        const recentSync = localStorage.getItem(`sfm_group_sync:${groupId}`)
        const syncTime = recentSync ? parseInt(recentSync) : 0
        const isRecentlySynced = (Date.now() - syncTime) < 5000 // 5 seconds
        
        if (isRecentlySynced) {
          setStatus('synced')
          setIsLoading(false)
          return
        }

        // Reuse the recompute logic (cached-first)
        await recomputeGroupStatus()
      } catch (error) {
        console.error('Error checking group sync status:', error)
        setStatus('unsynced')
      } finally {
        setIsLoading(false)
      }
    }

    checkGroupSyncStatus()
  }, [groupId, groupUsers, syncStatusData, isSyncing, recomputeGroupStatus])

  if (isLoading) {
    return (
      <SyncBadge
        status="checking"
        isClickable={false}
        title="Checking group sync status..."
      />
    )
  }

  const getTitle = () => {
    switch (status) {
      case 'synced':
        return 'Group is synced'
      case 'unsynced':
        return 'Click to sync group'
      case 'stale':
        return 'Group is stale'
      case 'syncing':
        return 'Syncing group...'
      case 'checking':
        return 'Checking group sync status...'
      default:
        return ''
    }
  }

  return (
    <SyncBadge
      status={status}
      isClickable={status === 'unsynced'}
      onClick={status === 'unsynced' ? () => onSync(groupId) : undefined}
      title={getTitle()}
      isListMode={isListMode}
    />
  )
}

export default function GroupsPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const debouncedSearchTerm = useDebounce(searchTerm, 300)
  
  // View mode state (card or list)
  const [viewMode, setViewMode] = useState<'card' | 'list'>(() => {
    if (typeof window !== 'undefined') {
      const raw = String(localStorage.getItem('global-view-mode') || 'card').toLowerCase().trim()
      return raw === 'list' ? 'list' : 'card'
    }
    return 'card'
  })
  // Ensure highlight persists after refresh/hydration
  useLayoutEffect(() => {
    try {
      const raw = String(localStorage.getItem('global-view-mode') || 'card').toLowerCase().trim()
      const stored = raw === 'list' ? 'list' : 'card'
      setViewMode(stored)
    } catch {}
  }, [])
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<any>(null)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  
  
  // Group name editing state for detail modal
  const [editingDetailGroupName, setEditingDetailGroupName] = useState<boolean>(false)
  const [tempDetailGroupName, setTempDetailGroupName] = useState<string>('')
  
  // Inline group name editing state for general view
  const [editingGroupName, setEditingGroupName] = useState<string | null>(null)
  const [tempGroupName, setTempGroupName] = useState<string>('')
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupDescription, setNewGroupDescription] = useState('')
  const [newGroupColorIndex, setNewGroupColorIndex] = useState<number>(1)
  const newGroupColorIndexRef = useRef<number>(1)
  const { isDark, isModern, isModernDark, isMono } = useTheme()

  const resetAddModal = () => {
    setNewGroupName('')
    setNewGroupDescription('')
    setNewGroupColorIndex(1)
    newGroupColorIndexRef.current = 1
  }

  const queryClient = useQueryClient()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmConfig, setConfirmConfig] = useState<{ title: string; description: string; isDanger?: boolean; onConfirm: () => void }>({ title: '', description: '', isDanger: true, onConfirm: () => {} })
  
  // Drag and drop state for group addons
  const [addonOrder, setAddonOrder] = useState<string[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const draggingIdRef = useRef<string | null>(null)
  const justReorderedRef = useRef(false)
  // dnd-kit sensors and helpers
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } })
  )
  const [activeId, setActiveId] = useState<string | null>(null)
  const [isDndActive, setIsDndActive] = useState(false)
  const SortableAddon: React.FC<{ id: string; index: number; children: React.ReactNode }> = ({ id, index, children }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : undefined,
    } as React.CSSProperties
    return (
      <div ref={setNodeRef} style={style} data-addon-index={index} {...attributes} {...listeners}>
        {children}
      </div>
    )
  }
  const handleDragStartDnd = (e: any) => {
    setActiveId(e.active?.id || null)
    setIsDndActive(true)
    try { document.body.style.overflow = 'hidden' } catch {}
  }
  const handleDragCancelDnd = () => {
    setActiveId(null)
    setIsDndActive(false)
    try { document.body.style.overflow = '' } catch {}
  }
  const handleDragEndDnd = (e: any) => {
    const { active, over } = e
    setActiveId(null)
    setIsDndActive(false)
    try { document.body.style.overflow = '' } catch {}
    if (!active?.id || !over?.id || active.id === over.id) return
    const from = addonOrder.indexOf(active.id)
    const to = addonOrder.indexOf(over.id)
    if (from === -1 || to === -1) return
    const next = [...addonOrder]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setAddonOrder(next)
    // Persist reorder to backend, mirror Users behavior
    justReorderedRef.current = true
    if (selectedGroup?.id) {
      groupsAPI.reorderAddons(selectedGroup.id, next)
        .then((response) => {
          queryClient.invalidateQueries({ queryKey: ['group', selectedGroup.id, 'details'] })
          queryClient.invalidateQueries({ queryKey: ['groups'] })
          queryClient.invalidateQueries({ queryKey: ['users'] })
          queryClient.invalidateQueries({ queryKey: ['user'] })
          
          // Notify GroupSyncBadge about sync status
          if (response.isSynced === false) {
            try { window.dispatchEvent(new CustomEvent('sfm:group:reordered' as any, { detail: { id: selectedGroup.id, isSynced: false } })) } catch {}
          }
          
          toast.success('Addon order updated')
        })
        .catch((error: any) => {
          console.error('Failed to reorder addons:', error)
          toast.error(error?.message || 'Failed to update addon order')
        })
    }
  }

  // Handle opening user detail view via UsersPage existing modal
  const handleViewUserDetails = (user: any) => {
    try {
      const event = new CustomEvent('sfm:view-user-details', { detail: { user } })
      window.dispatchEvent(event)
    } catch {}
  }

  // Force-refetch groups and group-related queries when Groups tab is activated
  useEffect(() => {
    const onGroupsTab = async (e: CustomEvent) => {
      if ((e as any).detail?.id !== 'groups') return
      try {
        await Promise.all([
          queryClient.refetchQueries({ queryKey: ['groups'] as any, type: 'all' }),
          queryClient.refetchQueries({ queryKey: ['group'] as any, type: 'all' }),
        ])
      } catch {}
    }
    window.addEventListener('sfm:tab:activated' as any, onGroupsTab as any)
    return () => window.removeEventListener('sfm:tab:activated' as any, onGroupsTab as any)
  }, [queryClient])
  
  // Touch drag and drop refs
  const touchStartPos = useRef<{ x: number; y: number } | null>(null)
  const touchStartIndex = useRef<number | null>(null)
  const isTouchDragging = useRef(false)

  const openConfirm = (cfg: { title: string; description: string; isDanger?: boolean; onConfirm: () => void }) => {
    setConfirmConfig(cfg)
    setConfirmOpen(true)
  }

  // Handle view group details
  const handleViewGroupDetails = (group: any) => {
    setSelectedGroup(group)
    setShowDetailModal(true)
    // Reset editing states when opening detail view
    setEditingDetailGroupName(false)
    setTempDetailGroupName('')
  }

  // Group name editing handlers for detail modal
  const handleStartEditDetailGroupName = (currentGroupName: string) => {
    setEditingDetailGroupName(true)
    setTempDetailGroupName(currentGroupName)
  }

  const handleSaveDetailGroupName = (originalGroupName: string) => {
    if (tempDetailGroupName.trim()) {
      // Only update if the group name actually changed
      if (tempDetailGroupName.trim() !== originalGroupName) {
        // Optimistically update the cache immediately
        queryClient.setQueryData(['group', selectedGroup.id, 'details'], (oldData: any) => {
          if (oldData) {
            return {
              ...oldData,
              group: {
                ...oldData.group,
                name: tempDetailGroupName.trim()
              }
            }
          }
          return oldData
        })
        
        // Also update the groups list cache
        queryClient.setQueryData(['groups'], (oldData: any) => {
          if (oldData) {
            return oldData.map((group: any) => 
              group.id === selectedGroup.id 
                ? { ...group, name: tempDetailGroupName.trim() }
                : group
            )
          }
          return oldData
        })
        
        // Update the selectedGroup state as well
        setSelectedGroup((prev: any) => ({
          ...prev,
          name: tempDetailGroupName.trim()
        }))

        // Make the API call
        updateGroupMutation.mutate({
          id: selectedGroup.id,
          data: { 
            name: tempDetailGroupName.trim() 
          }
        }, {
          onSuccess: () => {
            // Invalidate both detail and list queries to refresh the UI
            queryClient.invalidateQueries({ queryKey: ['groups'] })
            queryClient.invalidateQueries({ queryKey: ['group', selectedGroup.id, 'details'] })
            queryClient.invalidateQueries({ queryKey: ['group', selectedGroup.id, 'sync-status'] })
            // Reset editing state after successful update
            setEditingDetailGroupName(false)
            setTempDetailGroupName('')
          },
          onError: () => {
            // Revert optimistic update on error
            queryClient.setQueryData(['group', selectedGroup.id, 'details'], (oldData: any) => {
              if (oldData) {
                return {
                  ...oldData,
                  group: {
                    ...oldData.group,
                    name: originalGroupName
                  }
                }
              }
              return oldData
            })
            
            // Also revert the groups list cache
            queryClient.setQueryData(['groups'], (oldData: any) => {
              if (oldData) {
                return oldData.map((group: any) => 
                  group.id === selectedGroup.id 
                    ? { ...group, name: originalGroupName }
                    : group
                )
              }
              return oldData
            })
            
            if (selectedGroup) {
              selectedGroup.name = originalGroupName
            }
            // Keep editing state on error so user can try again
          }
        })
      } else {
        // No change, just exit edit mode
        setEditingDetailGroupName(false)
        setTempDetailGroupName('')
      }
    } else {
      setEditingDetailGroupName(false)
      setTempDetailGroupName('')
    }
  }

  const handleBlurDetailGroupName = (originalGroupName: string) => {
    if (tempDetailGroupName.trim()) {
      // Only update if the group name actually changed
      if (tempDetailGroupName.trim() !== originalGroupName) {
        // Optimistically update the cache immediately
        queryClient.setQueryData(['group', selectedGroup.id, 'details'], (oldData: any) => {
          if (oldData) {
            return {
              ...oldData,
              group: {
                ...oldData.group,
                name: tempDetailGroupName.trim()
              }
            }
          }
          return oldData
        })
        
        // Also update the groups list cache
        queryClient.setQueryData(['groups'], (oldData: any) => {
          if (oldData) {
            return oldData.map((group: any) => 
              group.id === selectedGroup.id 
                ? { ...group, name: tempDetailGroupName.trim() }
                : group
            )
          }
          return oldData
        })
        
        // Update the selectedGroup state as well
        setSelectedGroup((prev: any) => ({
          ...prev,
          name: tempDetailGroupName.trim()
        }))

        // Make the API call
        updateGroupMutation.mutate({
          id: selectedGroup.id,
          data: { 
            name: tempDetailGroupName.trim() 
          }
        }, {
          onSuccess: () => {
            // Invalidate both detail and list queries to refresh the UI
            queryClient.invalidateQueries({ queryKey: ['groups'] })
            queryClient.invalidateQueries({ queryKey: ['group', selectedGroup.id, 'details'] })
            queryClient.invalidateQueries({ queryKey: ['group', selectedGroup.id, 'sync-status'] })
            // Reset editing state after successful update
            setEditingDetailGroupName(false)
            setTempDetailGroupName('')
          },
          onError: () => {
            // Revert optimistic update on error
            queryClient.setQueryData(['group', selectedGroup.id, 'details'], (oldData: any) => {
              if (oldData) {
                return {
                  ...oldData,
                  group: {
                    ...oldData.group,
                    name: originalGroupName
                  }
                }
              }
              return oldData
            })
            
            // Also revert the groups list cache
            queryClient.setQueryData(['groups'], (oldData: any) => {
              if (oldData) {
                return oldData.map((group: any) => 
                  group.id === selectedGroup.id 
                    ? { ...group, name: originalGroupName }
                    : group
                )
              }
              return oldData
            })
            
            if (selectedGroup) {
              selectedGroup.name = originalGroupName
            }
            // Keep editing state on error so user can try again
          }
        })
      } else {
        // No change, just exit edit mode
        setEditingDetailGroupName(false)
        setTempDetailGroupName('')
      }
    } else {
      // If empty, revert to original and exit edit mode
      setEditingDetailGroupName(false)
      setTempDetailGroupName('')
    }
  }

  // Handle clone group
  const handleCloneGroup = (group: any) => {
    cloneGroupMutation.mutate(group.id)
  }

  // Inline group name editing handlers for general view
  const handleStartEditGroupName = (groupId: string, currentGroupName: string) => {
    setEditingGroupName(groupId)
    setTempGroupName(currentGroupName)
  }

  const handleSaveGroupName = (groupId: string, originalGroupName: string) => {
    if (tempGroupName.trim()) {
      // Only update if the group name actually changed
      if (tempGroupName.trim() !== originalGroupName) {
        // Optimistically update the cache immediately
        queryClient.setQueryData(['groups'], (oldData: any) => {
          if (oldData) {
            return oldData.map((group: any) => 
              group.id === groupId 
                ? { ...group, name: tempGroupName.trim() }
                : group
            )
          }
          return oldData
        })

        // Make the API call
        updateGroupMutation.mutate({
          id: groupId,
          data: { 
            name: tempGroupName.trim() 
          }
        }, {
          onSuccess: () => {
            // Invalidate queries to refresh the UI
            queryClient.invalidateQueries({ queryKey: ['groups'] })
            queryClient.invalidateQueries({ queryKey: ['users'] })
            queryClient.invalidateQueries({ queryKey: ['addons'] })
            queryClient.invalidateQueries({ queryKey: ['group', groupId, 'sync-status'] })
            queryClient.invalidateQueries({ queryKey: ['group', groupId, 'details'] })
            // Reset editing state after successful update
            setEditingGroupName(null)
            setTempGroupName('')
          },
          onError: () => {
            // Revert optimistic update on error
            queryClient.setQueryData(['groups'], (oldData: any) => {
              if (oldData) {
                return oldData.map((group: any) => 
                  group.id === groupId 
                    ? { ...group, name: originalGroupName }
                    : group
                )
              }
              return oldData
            })
            // Keep editing state on error so user can try again
          }
        })
      } else {
        // No change, just exit edit mode
        setEditingGroupName(null)
        setTempGroupName('')
      }
    } else {
      setEditingGroupName(null)
      setTempGroupName('')
    }
  }

  const handleBlurGroupName = (groupId: string, originalGroupName: string) => {
    if (tempGroupName.trim()) {
      // Only update if the group name actually changed
      if (tempGroupName.trim() !== originalGroupName) {
        // Optimistically update the cache immediately
        queryClient.setQueryData(['groups'], (oldData: any) => {
          if (oldData) {
            return oldData.map((group: any) => 
              group.id === groupId 
                ? { ...group, name: tempGroupName.trim() }
                : group
            )
          }
          return oldData
        })

        // Make the API call
        updateGroupMutation.mutate({
          id: groupId,
          data: { 
            name: tempGroupName.trim() 
          }
        }, {
          onSuccess: () => {
            // Invalidate queries to refresh the UI
            queryClient.invalidateQueries({ queryKey: ['groups'] })
            queryClient.invalidateQueries({ queryKey: ['users'] })
            queryClient.invalidateQueries({ queryKey: ['addons'] })
            queryClient.invalidateQueries({ queryKey: ['group', groupId, 'sync-status'] })
            queryClient.invalidateQueries({ queryKey: ['group', groupId, 'details'] })
            // Reset editing state after successful update
            setEditingGroupName(null)
            setTempGroupName('')
          },
          onError: () => {
            // Revert optimistic update on error
            queryClient.setQueryData(['groups'], (oldData: any) => {
              if (oldData) {
                return oldData.map((group: any) => 
                  group.id === groupId 
                    ? { ...group, name: originalGroupName }
                    : group
                )
              }
              return oldData
            })
            // Keep editing state on error so user can try again
          }
        })
      } else {
        // No change, just exit edit mode
        setEditingGroupName(null)
        setTempGroupName('')
      }
    } else {
      // If empty, revert to original and exit edit mode
      setEditingGroupName(null)
      setTempGroupName('')
    }
  }

  // Drag and drop handlers for addon reordering
  const handleDragStart = (id: string, e?: React.DragEvent) => {
    draggingIdRef.current = id
    setIsDragging(true)
    try {
      const img = new Image()
      img.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='
      e?.dataTransfer?.setDragImage(img, 0, 0)
    } catch {}
  }

  // Touch handlers for mobile drag and drop
  const handleTouchStart = (id: string, index: number, e: React.TouchEvent) => {
    // Don't start drag if touching a button or interactive element
    const target = e.target as HTMLElement
    if (target.tagName === 'BUTTON' || target.closest('button')) {
      // Don't prevent default for buttons - let them work normally
      return
    }
    
    const touch = e.touches[0]
    touchStartPos.current = { x: touch.clientX, y: touch.clientY }
    touchStartIndex.current = index
    isTouchDragging.current = false
    draggingIdRef.current = id
    // Do not prevent default on touchstart; allow taps to become clicks on mobile
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPos.current || !draggingIdRef.current) return
    
    const touch = e.touches[0]
    const deltaX = Math.abs(touch.clientX - touchStartPos.current.x)
    const deltaY = Math.abs(touch.clientY - touchStartPos.current.y)
    
    // Start dragging if moved more than 10px in any direction
    if (!isTouchDragging.current && (deltaX > 10 || deltaY > 10)) {
      isTouchDragging.current = true
      setIsDragging(true)
      // Prevent scrolling when drag starts
      document.body.style.overflow = 'hidden'
    }
    
    if (isTouchDragging.current) {
      // Only prevent defaults once dragging actually started
      e.preventDefault()
      e.stopPropagation()
      // Find the element under the touch point
      const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY)
      if (elementBelow) {
        const addonElement = elementBelow.closest('[data-addon-index]')
        if (addonElement) {
          const targetIndex = parseInt(addonElement.getAttribute('data-addon-index') || '0')
          if (targetIndex !== touchStartIndex.current) {
            setDragOverIndex(targetIndex)
          }
        }
      }
    }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (isTouchDragging.current && draggingIdRef.current && touchStartIndex.current !== null) {
      const targetIndex = dragOverIndex !== null ? dragOverIndex : touchStartIndex.current
      handleDrop(targetIndex)
    }
    
    // Reset all touch state
    touchStartPos.current = null
    touchStartIndex.current = null
    isTouchDragging.current = false
    setIsDragging(false)
    setDragOverIndex(null)
    draggingIdRef.current = null
    // Restore scrolling
    document.body.style.overflow = ''
    if (isTouchDragging.current) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  const handleDragOver = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault()
    setDragOverIndex(targetIndex)
  }

  const handleDragLeave = () => { 
    setDragOverIndex(null)
  }

  const handleDragEnd = () => { 
    draggingIdRef.current = null
    setIsDragging(false)
    setDragOverIndex(null)
  }

  const handleDrop = (targetIndex: number) => {
    const fromId = draggingIdRef.current
    if (!fromId) { 
      setDragOverIndex(null)
      setIsDragging(false)
      return 
    }
    
    // Use the preview order as the final order
    const currentIndex = addonOrder.indexOf(fromId)
    if (currentIndex === -1 || currentIndex === targetIndex) {
      setDragOverIndex(null)
      setIsDragging(false)
      draggingIdRef.current = null
      return
    }
    
    // The preview order already has the correct final arrangement
    setAddonOrder(previewOrder)
    setDragOverIndex(null)
    setIsDragging(false)
    draggingIdRef.current = null
    
    // Set flag to prevent UI reversion
    justReorderedRef.current = true
    
    // Call the reorder API
    if (selectedGroup?.id) {
      groupsAPI.reorderAddons(selectedGroup.id, previewOrder)
        .then(() => {
          // Invalidate queries to refresh the data
          queryClient.invalidateQueries({ queryKey: ['group', selectedGroup.id, 'details'] })
          queryClient.invalidateQueries({ queryKey: ['groups'] })
          queryClient.invalidateQueries({ queryKey: ['users'] })
          queryClient.invalidateQueries({ queryKey: ['user'] })
          toast.success('Addon order updated')
        })
        .catch((error) => {
          console.error('Failed to reorder addons:', error)
          toast.error(error?.message || 'Failed to update addon order')
        })
    }
  }

  // Helper function to map addon to ID for ordering
  const mapIdForAddon = (addon: any) => (addon.manifestUrl || addon.transportUrl || addon.url || addon.id || '').toString().trim()

  // Create preview order that shows the dragged item in its new position
  const previewOrder = React.useMemo(() => {
    if (!isDragging || !draggingIdRef.current || dragOverIndex === null) return addonOrder
    
    const fromId = draggingIdRef.current
    const currentIndex = addonOrder.indexOf(fromId)
    if (currentIndex === -1 || currentIndex === dragOverIndex) return addonOrder
    
    const next = [...addonOrder]
    // Move the dragged item to the target position
    const [moved] = next.splice(currentIndex, 1)
    next.splice(dragOverIndex, 0, moved)
    
    return next
  }, [isDragging, draggingIdRef.current, dragOverIndex, addonOrder])

  // Use preview order while dragging, otherwise use current order
  const orderAddons = React.useCallback((arr: any[]) => {
    const orderToUse = isDragging ? previewOrder : addonOrder
    const pos = new Map(orderToUse.map((u, i) => [u, i]))
    return [...arr].sort((a, b) => (pos.get(mapIdForAddon(a)) ?? 1e9) - (pos.get(mapIdForAddon(b)) ?? 1e9))
  }, [isDragging, previewOrder, addonOrder])


  // Fetch groups from API
  const { data: groupsRaw = [], isLoading, error } = useQuery({
    queryKey: ['groups'],
    queryFn: groupsAPI.getAll,
    retry: 1,
  })

  // Normalize groups response (handles plain arrays and axios-like objects)
  const groups = useMemo(() => {
    if (Array.isArray(groupsRaw)) return groupsRaw
    if (groupsRaw && typeof groupsRaw === 'object' && Array.isArray((groupsRaw as any).data)) {
      return (groupsRaw as any).data
    }
    return [] as any[]
  }, [groupsRaw])


  // Ensure filteredGroups is always an array
  const filteredGroups = useMemo(() => {
    const base = Array.isArray(groups) ? groups : []
    return base.filter((group: any) => {
      const name = String(group.name || '')
      const desc = String(group.description || '')
      const matchesSearch = name.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
                           desc.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
      return matchesSearch
    })
  }, [groups, debouncedSearchTerm])

  // Handle view mode change and persist to localStorage
  const handleViewModeChange = (mode: 'card' | 'list') => {
    setViewMode(mode)
    if (typeof window !== 'undefined') {
      localStorage.setItem('global-view-mode', mode)
    }
  }

  const createGroupMutation = useMutation({
    mutationFn: (data: { name: string; description?: string; colorIndex?: number }) => {
      return groupsAPI.create({
      name: data.name,
      description: data.description || '',
      restrictions: 'none',
        colorIndex: data.colorIndex || 1
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      setShowAddModal(false)
      resetAddModal()
      toast.success('Group created successfully!')
    },
    onError: (error: any) => {
      console.error('❌ Group creation failed:', error)
      toast.error(error?.response?.data?.message || 'Failed to create group')
    },
  })

  const cloneGroupMutation = useMutation({
    mutationFn: async (originalGroupId: string) => {
      const response = await fetch('/api/groups/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalGroupId })
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to clone group')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      toast.success('Group cloned successfully!')
    },
    onError: (error: any) => {
      console.error('Error cloning group:', error)
      toast.error(error.message || 'Failed to clone group')
    }
  })

  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editUserIds, setEditUserIds] = useState<string[]>([])
  const [editAddonIds, setEditAddonIds] = useState<string[]>([])
  const [syncingGroups, setSyncingGroups] = useState<Set<string>>(new Set())
  const [isSyncingAll, setIsSyncingAll] = useState(false)
  
  // Global states for all users (used by UserSyncBadge components)
  const [globalUserExcludedSets, setGlobalUserExcludedSets] = useState<Map<string, Set<string>>>(new Map())
  const [globalUserProtectedSets, setGlobalUserProtectedSets] = useState<Map<string, Set<string>>>(new Map())
  
  // State to track user sync data (for addon counts)
  const [userSyncData, setUserSyncData] = useState<Map<string, any>>(new Map())


  // Get group details for placeholders
  const { data: groupDetail } = useQuery({
    queryKey: ['group', editingGroupId],
    queryFn: () => groupsAPI.getById(editingGroupId!),
    enabled: !!editingGroupId,
  })

  // Get group details for the detail modal
  const { data: selectedGroupDetails, isLoading: isLoadingGroupDetails } = useQuery({
    queryKey: ['group', selectedGroup?.id, 'details'],
    queryFn: () => groupsAPI.getById(selectedGroup!.id),
    enabled: !!selectedGroup?.id && showDetailModal,
  })

  // Initialize/refresh local addon order whenever detail modal opens or group addons change
  React.useEffect(() => {
    if (!showDetailModal || !selectedGroupDetails) return
    
    const groupAddons = selectedGroupDetails?.group?.addons || selectedGroupDetails?.addons || []
    const urls = groupAddons.map((ga: any) => mapIdForAddon(ga.addon || ga))
    
    // Only update addonOrder if it's empty, not dragging, and we haven't just reordered
    if (addonOrder.length === 0 || (!isDragging && !justReorderedRef.current)) {
      setAddonOrder(urls)
    }
    
    // Reset the reorder flag after a short delay
    if (justReorderedRef.current) {
      setTimeout(() => {
        justReorderedRef.current = false
      }, 1000)
    }
  }, [showDetailModal, selectedGroup?.id, selectedGroupDetails, addonOrder.length, isDragging])


  // Open edit by fetching fresh details, then set state and show modal
  const openEditModal = async (id: string) => {
    try {
      const detail = await groupsAPI.getById(id)
      setEditingGroupId(id)
      setEditName(detail?.name || '')
      setEditDescription(detail?.description || '')
      setEditUserIds(Array.isArray((detail as any)?.users) ? (detail as any).users.map((u: any) => u.id) : [])
      setEditAddonIds(Array.isArray((detail as any)?.addons) ? (detail as any).addons.map((a: any) => a.id) : [])
      setShowEditModal(true)
    } catch (e) {
      toast.error('Failed to load group details')
    }
  }

  // Handle edit group with immediate data from group object
  const handleEditGroup = (group: any) => {
    setEditingGroupId(group.id)
    // Clear form data so placeholders show
    setEditName('')
    setEditDescription('')
    // Populate user/addon selections from group object
    setEditUserIds(Array.isArray(group?.users) ? group.users.map((u: any) => u.id) : [])
    setEditAddonIds(Array.isArray(group?.addons) ? group.addons.map((a: any) => a.id) : [])
    setShowEditModal(true)
  }

  const updateGroupMutation = useMutation({
    mutationFn: (payload: { id: string; data: any }) => groupsAPI.update(payload.id, payload.data),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['addons'] })
      queryClient.invalidateQueries({ queryKey: ['group', variables.id, 'sync-status'] })
      queryClient.invalidateQueries({ queryKey: ['group', variables.id, 'details'] })
      setShowEditModal(false)
      setEditingGroupId(null)
      toast.success('Group updated successfully!')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to update group')
    },
  })

  // Fetch all users and addons for selection lists
  const { data: allUsers = [] } = useQuery({
    queryKey: ['users'],
    queryFn: usersAPI.getAll,
    retry: 1,
  })
  
  // Load excluded and protected sets for all users
  useEffect(() => {
    if (!allUsers || allUsers.length === 0) return
    
    const newExcludedSets = new Map<string, Set<string>>()
    const newProtectedSets = new Map<string, Set<string>>()
    
    allUsers.forEach((user: any) => {
      const uid = user.id
      if (!uid) return
      
      // Load excluded and protected addons from user data
      const excludedAddons = user.excludedAddons || []
      const protectedAddons = user.protectedAddons || []
      
      newExcludedSets.set(uid, new Set(excludedAddons))
      newProtectedSets.set(uid, new Set(protectedAddons))
    })
    
    setGlobalUserExcludedSets(newExcludedSets)
    setGlobalUserProtectedSets(newProtectedSets)
  }, [allUsers])

  // Listen for user sync data updates
  useEffect(() => {
    const onUserSyncData = (e: CustomEvent) => {
      const { userId, syncStatus } = (e as any).detail || {}
      if (userId && syncStatus) {
        setUserSyncData(prev => new Map(prev).set(userId, syncStatus))
      }
    }
    window.addEventListener('sfm:user-sync-data' as any, onUserSyncData as any)
    return () => window.removeEventListener('sfm:user-sync-data' as any, onUserSyncData as any)
  }, [])
  
  const { data: allAddons = [] } = useQuery({
    queryKey: ['addons'],
    queryFn: addonsAPI.getAll,
    retry: 1,
  })

  const safeUsers = useMemo(() => {
    if (Array.isArray(allUsers)) return allUsers
    if (allUsers && typeof allUsers === 'object' && Array.isArray((allUsers as any).data)) return (allUsers as any).data
    return []
  }, [allUsers])
  const safeAddons = useMemo(() => {
    if (Array.isArray(allAddons)) return allAddons
    if (allAddons && typeof allAddons === 'object' && Array.isArray((allAddons as any).data)) return (allAddons as any).data
    return []
  }, [allAddons])

  const deleteGroupMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/groups/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `Failed with status ${res.status}`)
      }
      return id
    },
    onSuccess: (deletedId: string) => {
      queryClient.setQueryData(['groups'], (prev: any) => {
        const arr = Array.isArray(prev) ? prev : (prev?.data && Array.isArray(prev.data) ? prev.data : [])
        return arr.filter((g: any) => g.id !== deletedId)
      })
      toast.success('Group deleted successfully!')
      queryClient.invalidateQueries({ queryKey: ['groups'] })
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to delete group')
    },
  })

  // Toggle group status mutation
  const toggleGroupStatusMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const response = await fetch(`/api/groups/${id}/toggle-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !isActive })
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = 'Failed to toggle group status'
        try {
          const error = JSON.parse(errorText)
          errorMessage = error.message || errorMessage
        } catch {
          errorMessage = errorText || errorMessage
        }
        throw new Error(errorMessage)
      }
      
      return await response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      toast.success('Group status updated successfully!')
    },
    onError: (error: any) => {
      console.error('Toggle group status error:', error)
      toast.error(error.message || 'Failed to toggle group status')
    }
  })

  // Handle toggle group status
  const handleToggleGroupStatus = (groupId: string, currentStatus: boolean) => {
    toggleGroupStatusMutation.mutate({ id: groupId, isActive: !currentStatus })
  }

  // Close modals on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showAddModal) setShowAddModal(false)
        if (showEditModal) { setShowEditModal(false); setEditingGroupId(null) }
        if (selectedGroup) setSelectedGroup(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showAddModal, showEditModal, selectedGroup])

  // Group sync mutation
  const groupSyncMutation = useMutation({
    mutationFn: async (groupId: string) => {
      const syncMode = localStorage.getItem('sfm_sync_mode') || 'normal'
      const res = await fetch(`/api/groups/${groupId}/sync`, { 
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-sync-mode': syncMode
        },
        body: JSON.stringify({ 
          excludedManifestUrls: []
        })
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || 'Failed to sync group')
      }
      return res.json()
    },
    onSuccess: (data, groupId) => {
      setSyncingGroups(prev => {
        const newSet = new Set(prev)
        newSet.delete(groupId)
        return newSet
      })
      // Mark group as recently synced in localStorage
      localStorage.setItem(`sfm_group_sync:${groupId}`, Date.now().toString())
      // Mark all users in this group as recently synced
      const groupDetails = queryClient.getQueryData(['group', groupId, 'sync-status']) as any
      if (groupDetails?.users) {
        const now = Date.now().toString()
        groupDetails.users.forEach((user: any) => {
          localStorage.setItem(`sfm_user_sync:${user.id}`, now)
        })
      }
      // Invalidate user queries to refresh sync status
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['user'] })
      // Invalidate group sync status to update the badge
      queryClient.invalidateQueries({ queryKey: ['group', groupId, 'sync-status'] })
      // Invalidate the sync check query to trigger badge re-evaluation
      queryClient.invalidateQueries({ queryKey: ['group', groupId, 'sync-check'] })
      // Also invalidate the groups query to refresh the main group list
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      toast.success(data?.message || `Group synced successfully! ${data?.syncedUsers || 0} users updated.`)
    },
    onError: (error: any, groupId) => {
      setSyncingGroups(prev => {
        const newSet = new Set(prev)
        newSet.delete(groupId)
        return newSet
      })
      toast.error(error?.message || 'Failed to sync group')
    },
  })

  const handleGroupSync = async (groupId: string) => {
    setSyncingGroups(prev => new Set(prev).add(groupId))
    groupSyncMutation.mutate(groupId)
  }

  // Bulk sync all groups mutation
  const syncAllGroupsMutation = useMutation({
    mutationFn: async () => {
      setIsSyncingAll(true)
      
      // Get all groups and sync them sequentially
      const groupsToSync = groups || []
      
      let successCount = 0
      let errorCount = 0
      let totalSyncedUsers = 0
      let totalUsers = 0
      let totalReloadedAddons = 0
      let totalAddons = 0
      
      // Sync each group one by one (sequential execution)
      const syncMode = localStorage.getItem('sfm_sync_mode') || 'normal'
      for (const group of groupsToSync) {
        try {
          const response = await fetch(`/api/groups/${group.id}/sync`, { 
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'x-sync-mode': syncMode
            },
            body: JSON.stringify({ 
              excludedManifestUrls: []
            })
          })
          if (!response.ok) {
            const text = await response.text()
            throw new Error(text || `Failed with status ${response.status}`)
          }
          const result = await response.json()
          successCount++
          totalSyncedUsers += result?.syncedUsers || 0
          totalUsers += result?.totalUsers || 0
          totalReloadedAddons += result?.reloadedAddons || 0
          totalAddons += result?.totalAddons || 0
        } catch (error: any) {
          console.error(`Failed to sync group ${group.name}:`, error)
          errorCount++
        }
      }
      
      return { successCount, errorCount, totalSyncedUsers, totalUsers, totalReloadedAddons, totalAddons, total: groupsToSync.length }
    },
    onSuccess: (data) => {
      let message = `${data.successCount}/${data.total} groups synced\n${data.totalSyncedUsers}/${data.totalUsers} users synced`
      
      // Add reload progress if available
      if (data.totalAddons > 0) {
        message += `\n${data.totalReloadedAddons}/${data.totalAddons} addons reloaded`
      }
      
      if (data.errorCount === 0) {
        toast.success(message)
      } else {
        toast.success(message)
      }
      // Mark all groups as recently synced in localStorage
      const groupsToSync = groups || []
      const now = Date.now().toString()
      groupsToSync.forEach((group: any) => {
        localStorage.setItem(`sfm_group_sync:${group.id}`, now)
        // Also mark all users in this group as recently synced
        const groupDetails = queryClient.getQueryData(['group', group.id, 'sync-status']) as any
        if (groupDetails?.users) {
          groupDetails.users.forEach((user: any) => {
            localStorage.setItem(`sfm_user_sync:${user.id}`, now)
          })
        }
      })
      // Invalidate queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['user'] })
    },
    onError: (error: any) => {
      toast.error('Failed to sync groups')
    },
    onSettled: () => {
      setIsSyncingAll(false)
    }
  })

  const deleteGroupAddonMutation = useMutation({
    mutationFn: async ({ groupId, addonId }: { groupId: string; addonId: string }) => {
      // Get current addon details to find its current group assignments
      const addonResponse = await fetch(`/api/addons/${addonId}`)
      if (!addonResponse.ok) {
        throw new Error('Failed to fetch addon details')
      }
      const addonData = await addonResponse.json()
      
      // Get current group IDs and remove the target group
      const currentGroupIds = (addonData.groups || []).map((group: any) => group.id)
      const updatedGroupIds = currentGroupIds.filter((id: string) => id !== groupId)
      
      // Update the addon with the new group assignments
      const response = await fetch(`/api/addons/${addonId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ groupIds: updatedGroupIds })
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to remove addon from group')
      }
      
      return response.json()
    },
    onSuccess: () => {
      // Clear per-user cached sync flags for users in this group so badges flip immediately
      try {
        const members = selectedGroupDetails?.users || []
        members.forEach((m: any) => {
          localStorage.setItem(`sfm_user_sync_status:${m.id}`, 'unsynced')
          const evt = new CustomEvent('sfm:user-status', { detail: { userId: m.id, status: 'unsynced', groupId: selectedGroup?.id } })
          window.dispatchEvent(evt)
        })
      } catch {}

      // Notify group badge to recompute now
      try {
        const evt = new CustomEvent('sfm:addon:deleted', { detail: { groupId: selectedGroup?.id } })
        window.dispatchEvent(evt)
      } catch {}

      // Remove and invalidate all related queries to force fresh data
      queryClient.removeQueries({ queryKey: ['group', selectedGroup?.id, 'details'] })
      queryClient.removeQueries({ queryKey: ['group', selectedGroup?.id] })
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      queryClient.invalidateQueries({ queryKey: ['addons'] })
      queryClient.invalidateQueries({ queryKey: ['group', selectedGroup?.id, 'sync-status'] })
      queryClient.invalidateQueries({ queryKey: ['group', selectedGroup?.id, 'sync-check'] })

      const members = selectedGroupDetails?.users || []
      members.forEach((m: any) => {
        queryClient.invalidateQueries({ queryKey: ['user', m.id, 'sync-status'] })
      })

      toast.success('Addon removed from group successfully!')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to remove addon from group')
    }
  })

  // Remove user from group mutation - uses the same endpoint as detailed user view
  const removeUserFromGroupMutation = useMutation({
    mutationFn: async ({ userId }: { userId: string }) => {
      // Use the same endpoint as the detailed user view when setting group to "no group"
      const response = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupName: '' }) // Empty string removes user from group
      })
      
      if (!response.ok) {
        throw new Error('Failed to remove user from group')
      }
      return response.json()
    },
    onSuccess: () => {
      // Force re-fetch of group details to update the member count
      queryClient.removeQueries({ queryKey: ['group', selectedGroup?.id, 'details'] })
      queryClient.removeQueries({ queryKey: ['group', selectedGroup?.id] })
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('User removed from group successfully')
    },
    onError: (error: any) => {
      console.error('Error removing user from group:', error)
      toast.error('Failed to remove user from group')
    }
  })

  const handleDeleteGroupAddon = (addonId: string, addonName: string) => {
    setConfirmConfig({
      title: 'Remove addon from group?',
      description: `Remove "${addonName}" from this group? This action cannot be undone.`,
      isDanger: true,
      onConfirm: () => {
        deleteGroupAddonMutation.mutate({
          groupId: selectedGroup?.id || '',
          addonId: addonId
        })
      }
    })
    setConfirmOpen(true)
  }

  const getGroupColorClass = useCallback((colorIndex: number | null | undefined) => {
    const theme = isMono ? 'mono' : isModern ? 'modern' : isModernDark ? 'modern-dark' : isDark ? 'dark' : 'light'
    const colorClass = getColorBgClass(colorIndex, theme)
    return colorClass
  }, [isMono, isModern, isModernDark, isDark])

  // Helper function to convert Tailwind classes to actual color values
  const getColorValue = (tailwindClass: string): string => {
    const colorMap: Record<string, string> = {
      'bg-black': '#000000',
      'bg-gray-800': '#1f2937',
      'bg-gray-600': '#4b5563',
      'bg-gray-400': '#9ca3af',
      'bg-gray-300': '#d1d5db',
      'bg-blue-500': '#3b82f6',
      'bg-green-500': '#10b981',
      'bg-purple-500': '#8b5cf6',
      'bg-orange-500': '#f97316',
      'bg-red-500': '#ef4444',
      // Add gradient classes for modern themes
      'bg-gradient-to-br from-blue-500 to-blue-600': '#3b82f6',
      'bg-gradient-to-br from-green-500 to-green-600': '#10b981',
      'bg-gradient-to-br from-purple-500 to-purple-600': '#8b5cf6',
      'bg-gradient-to-br from-orange-500 to-orange-600': '#f97316',
      'bg-gradient-to-br from-red-500 to-red-600': '#ef4444',
      'bg-gradient-to-br from-blue-600 to-blue-700': '#2563eb',
      'bg-gradient-to-br from-green-600 to-green-700': '#059669',
      'bg-gradient-to-br from-purple-600 to-purple-700': '#7c3aed',
      'bg-gradient-to-br from-orange-600 to-orange-700': '#ea580c',
      'bg-gradient-to-br from-red-600 to-red-700': '#dc2626'
    }
    return colorMap[tailwindClass] || '#000000'
  }

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-4">
          <div>
            <h1 className={`hidden sm:block text-xl sm:text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Groups</h1>
            <p className={`text-sm sm:text-base ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Organize users and manage content access</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <button
              onClick={() => syncAllGroupsMutation.mutate()}
              disabled={syncAllGroupsMutation.isPending || isSyncingAll || groups.length === 0}
              className={`flex items-center justify-center px-3 py-2 sm:px-4 text-white rounded-lg transition-colors disabled:opacity-50 text-sm sm:text-base ${
                isModern
                  ? 'bg-gradient-to-br from-purple-600 via-purple-700 to-blue-800 hover:from-purple-700 hover:via-purple-800 hover:to-blue-900'
                  : isModernDark
                  ? 'bg-gradient-to-br from-purple-800 via-purple-900 to-blue-900 hover:from-purple-900 hover:via-purple-950 hover:to-indigo-900'
                  : isMono
                  ? 'bg-black hover:bg-gray-800'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              <RefreshCw className={`w-4 h-4 sm:w-5 sm:h-5 mr-2 ${isSyncingAll ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isSyncingAll ? 'Syncing...' : 'Sync All Groups'}</span>
              <span className="sm:hidden">{isSyncingAll ? 'Syncing...' : 'Sync All'}</span>
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className={`flex items-center justify-center px-3 py-2 sm:px-4 text-white rounded-lg transition-colors text-sm sm:text-base ${
                isModern
                  ? 'bg-gradient-to-br from-purple-600 via-purple-700 to-blue-800 hover:from-purple-700 hover:via-purple-800 hover:to-blue-900'
                  : isModernDark
                  ? 'bg-gradient-to-br from-purple-800 via-purple-900 to-blue-900 hover:from-purple-900 hover:via-purple-950 hover:to-indigo-900'
                  : isMono
                  ? 'bg-black hover:bg-gray-800'
                  : 'bg-stremio-purple hover:bg-purple-700'
              }`}
            >
              <Plus className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
              <span className="hidden sm:inline">Create Group</span>
              <span className="sm:hidden">Create</span>
            </button>
          </div>
        </div>

        {/* Search and View Toggle */}
        <div className="flex flex-row items-center gap-4">
          <div className="relative flex-1">
            <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
            <input
              type="text"
              placeholder="Search groups..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full pl-9 sm:pl-10 pr-4 py-2 sm:py-3 border rounded-lg focus:ring-2 focus:ring-stremio-purple focus:border-transparent text-sm sm:text-base ${
                isDark 
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              }`}
            />
          </div>
          
          {/* View Mode Toggle */}
          {mounted && (
            <div className="flex items-center">
              <div className={`flex rounded-lg ${isMono ? '' : 'border'} ${isMono ? '' : (isDark ? 'border-gray-600' : 'border-gray-300')}`}>
                <button
                  onClick={() => handleViewModeChange('card')}
                  className={`flex items-center gap-2 px-3 py-2 sm:py-3 text-sm rounded-l-lg transition-colors h-10 sm:h-12 ${
                    viewMode === 'card'
                      ? isMono
                        ? '!bg-white/10 text-white'
                        : isDark
                        ? 'bg-purple-600 text-white'
                        : 'bg-stremio-purple text-white'
                      : isMono
                        ? 'text-white/70 hover:bg-white/10'
                        : isDark
                        ? 'text-gray-300 hover:bg-gray-700'
                        : 'text-gray-700 hover:bg-gray-100'
                  }`}
                  title="Card view"
                >
                  <Grid3X3 className="w-4 h-4" />
                  <span className="hidden sm:inline">Cards</span>
                </button>
                <button
                  onClick={() => handleViewModeChange('list')}
                  className={`flex items-center gap-2 px-3 py-2 sm:py-3 text-sm rounded-r-lg transition-colors h-10 sm:h-12 ${
                    viewMode === 'list'
                      ? isMono
                        ? '!bg-white/10 text-white'
                        : isDark
                        ? 'bg-purple-600 text-white'
                        : 'bg-stremio-purple text-white'
                      : isMono
                        ? 'text-white/70 hover:bg-white/10'
                        : isDark
                        ? 'text-gray-300 hover:bg-gray-700'
                        : 'text-gray-700 hover:bg-gray-100'
                  }`}
                  title="List view"
                >
                  <List className="w-4 h-4" />
                  <span className="hidden sm:inline">List</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-stremio-purple"></div>
          <span className={`ml-3 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>Loading groups...</span>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className={`text-center py-12 ${
          isMono 
            ? 'bg-black border border-white/20' 
            : isDark 
            ? 'bg-gray-800 border-gray-700' 
            : 'bg-red-50 border-red-200'
        } rounded-lg border`}>
          <AlertTriangle className={`w-12 h-12 mx-auto mb-4 ${
            isMono ? 'text-white' : 'text-red-500'
          }`} />
          <h3 className={`text-lg font-medium mb-2 ${
            isMono ? 'text-white' : isDark ? 'text-white' : 'text-gray-900'
          }`}>Unable to load groups</h3>
          <p className={`${
            isMono ? 'text-white/70' : isDark ? 'text-gray-400' : 'text-gray-600'
          }`}>
            Make sure the backend server is running on port 4000
          </p>
          <button 
            onClick={() => queryClient.invalidateQueries({ queryKey: ['groups'] })}
            className={`mt-4 px-4 py-2 text-white rounded-lg transition-colors ${
              isMono
                ? 'bg-black hover:bg-gray-800 border border-white/20'
                : isModern
                ? 'bg-gradient-to-br from-purple-600 via-purple-700 to-blue-800 hover:from-purple-700 hover:via-purple-800 hover:to-blue-900'
                : isModernDark
                ? 'bg-gradient-to-br from-purple-800 via-purple-900 to-blue-900 hover:from-purple-900 hover:via-purple-950 hover:to-indigo-900'
                : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            Try Again
          </button>
        </div>
      )}

      {/* Groups Display */}
      {viewMode === 'card' ? (
        /* Card Grid View */
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredGroups.map((group) => (
          <div key={group.id} className={`rounded-lg shadow-sm border p-6 hover:shadow-md transition-shadow flex flex-col h-full ${
              isModern
                ? 'bg-gradient-to-br from-purple-50/90 to-blue-50/90 backdrop-blur-sm border-purple-200/60'
                : isModernDark
                ? 'bg-gradient-to-br from-purple-800/40 to-blue-800/40 backdrop-blur-sm border-purple-600/50'
                : isDark 
              ? 'bg-gray-800 border-gray-700' 
              : 'bg-white border-gray-200'
            } ${!group.isActive ? 'opacity-50' : ''}`}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center">
                  <div
                    className={`w-12 h-12 rounded-lg flex items-center justify-center mr-3 text-white ${getGroupColorClass(group?.colorIndex)} ${
                      isMono ? 'border border-white/20' : ''
                    }`}
                    style={{
                      backgroundColor: group?.colorIndex === 2 && isMono ? '#1f2937' : undefined
                    }}
                  >
                    <span className="text-white font-semibold text-lg">
                      {group.name ? group.name.charAt(0).toUpperCase() : 'G'}
                    </span>
                </div>
                <div>
                    {editingGroupName === group.id ? (
                      <input
                        type="text"
                        value={tempGroupName}
                        onChange={(e) => setTempGroupName(e.target.value)}
                        onBlur={() => handleBlurGroupName(group.id, group.name)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleSaveGroupName(group.id, group.name)
                          } else if (e.key === 'Escape') {
                            setEditingGroupName(null)
                            setTempGroupName('')
                          }
                        }}
                        placeholder={group.name}
                        className={`font-semibold bg-transparent border-none outline-none w-full ${
                          isModern ? 'text-purple-800' : isModernDark ? 'text-purple-200' : (isDark ? 'text-white' : 'text-gray-900')
                        }`}
                        autoFocus
                      />
                    ) : (
                      <h3 
                        className={`font-semibold cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-1 py-0.5 rounded transition-colors ${
                          isModern ? 'text-purple-800' : isModernDark ? 'text-purple-200' : (isDark ? 'text-white' : 'text-gray-900')
                        }`}
                        onClick={() => handleStartEditGroupName(group.id, group.name)}
                        title="Click to edit group name"
                      >
                        {group.name}
                      </h3>
                    )}
                    <div className="mt-1">
                      <GroupSyncBadge 
                        groupId={group.id} 
                        onSync={handleGroupSync}
                        isSyncing={syncingGroups.has(group.id)}
                      />
                    </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleGroupStatus(group.id, group.isActive)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      group.isActive ? 'bg-stremio-purple' : (isDark ? 'bg-gray-700' : 'bg-gray-300')
                    }`}
                    aria-pressed={group.isActive}
                    title={group.isActive ? 'Click to disable' : 'Click to enable'}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                        group.isActive ? 'translate-x-5' : 'translate-x-1'
                      }`}
                    />
                  </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="flex items-center">
                  <Puzzle className="w-4 h-4 text-gray-400 mr-2" />
                <div>
                    <p className={`text-lg font-semibold ${
                      isModern ? 'text-purple-100' : isModernDark ? 'text-purple-100' : (isDark ? 'text-white' : 'text-gray-900')
                    }`}>{group.addons}</p>
                    <p className={`text-xs ${
                      isModern ? 'text-purple-300' : isModernDark ? 'text-purple-300' : (isDark ? 'text-gray-400' : 'text-gray-500')
                    }`}>{group.addons === 1 ? 'Addon' : 'Addons'}</p>
                </div>
              </div>
              <div className="flex items-center">
                  <Users className="w-4 h-4 text-gray-400 mr-2" />
                <div>
                    <p className={`text-lg font-semibold ${
                      isModern ? 'text-purple-100' : isModernDark ? 'text-purple-100' : (isDark ? 'text-white' : 'text-gray-900')
                    }`}>{group.members}</p>
                    <p className={`text-xs ${
                      isModern ? 'text-purple-300' : isModernDark ? 'text-purple-300' : (isDark ? 'text-gray-400' : 'text-gray-500')
                    }`}>{group.members === 1 ? 'Member' : 'Members'}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-auto">
              <button 
                  onClick={() => handleViewGroupDetails(group)}
                  className={`flex-1 flex items-center justify-center px-3 py-2 h-8 min-h-8 max-h-8 text-sm rounded transition-colors ${
                    isModern
                      ? 'bg-gradient-to-r from-purple-100 to-blue-100 text-purple-800 hover:from-purple-200 hover:to-blue-200'
                      : isModernDark
                      ? 'bg-gradient-to-r from-purple-800 to-blue-800 text-purple-100 hover:from-purple-700 hover:to-blue-700'
                      : isMono
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      : isDark 
                    ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                  <Eye className="w-4 h-4 mr-1" />
                View
              </button>
                <button
                  onClick={() => handleCloneGroup(group)}
                  className={`flex items-center justify-center px-3 py-2 h-8 min-h-8 max-h-8 text-sm rounded transition-colors ${
                    isModern
                      ? 'bg-gradient-to-br from-purple-100 to-blue-100 text-purple-800 hover:from-purple-200 hover:to-blue-200'
                      : isModernDark
                      ? 'bg-gradient-to-br from-purple-800 to-blue-800 text-purple-100 hover:from-purple-700 hover:to-blue-700'
                      : isMono
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  }`}
                  title="Clone this group"
                >
                  <Copy className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleGroupSync(group.id)}
                disabled={syncingGroups.has(group.id)}
                  className={`flex items-center justify-center px-3 py-2 h-8 min-h-8 max-h-8 text-sm rounded transition-colors disabled:opacity-50 ${
                    isModern
                      ? 'bg-gradient-to-br from-purple-100 to-blue-100 text-purple-800 hover:from-purple-200 hover:to-blue-200'
                      : isModernDark
                      ? 'bg-gradient-to-br from-purple-800 to-blue-800 text-purple-100 hover:from-purple-700 hover:to-blue-700'
                      : isMono
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      : 'bg-green-100 text-green-700 hover:bg-green-200'
                  }`}
                title="Sync all users in this group"
              >
                  <RefreshCw className={`w-4 h-4 ${syncingGroups.has(group.id) ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => handleEditGroup(group)}
                className="hidden"
              />
              <button 
                onClick={() => {
                  openConfirm({
                      title: `Delete group ${group.name}`,
                      description: 'This action cannot be undone.',
                    isDanger: true,
                    onConfirm: () => deleteGroupMutation.mutate(group.id)
                  })
                }}
                disabled={deleteGroupMutation.isPending}
                  className={`flex items-center justify-center px-3 py-2 h-8 min-h-8 max-h-8 text-sm rounded transition-colors disabled:opacity-50 ${
                    isModern
                      ? 'bg-gradient-to-br from-purple-100 to-blue-100 text-purple-800 hover:from-purple-200 hover:to-blue-200'
                      : isModernDark
                      ? 'bg-gradient-to-br from-purple-800 to-blue-800 text-purple-100 hover:from-purple-700 hover:to-blue-700'
                      : isMono
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      : 'bg-red-100 text-red-700 hover:bg-red-200'
                  }`}
                >
                  <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        </div>
      ) : (
        /* List View */
        <div className="space-y-3">
          {filteredGroups.map((group) => (
            <div
              key={group.id}
              className={`rounded-lg border p-4 hover:shadow-md transition-shadow cursor-pointer ${
              isDark 
                ? 'bg-gray-800 border-gray-700' 
                : 'bg-white border-gray-200'
            } ${!group.isActive ? 'opacity-50' : ''}`}
              onClick={() => handleViewGroupDetails(group)}
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center flex-1 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center mr-3 flex-shrink-0 text-white ${getGroupColorClass(group?.colorIndex)} ${
                      isMono ? 'border border-white/20' : ''
                    }`}
                    style={{
                      backgroundColor: group?.colorIndex === 2 && isMono ? '#1f2937' : undefined
                    }}
                  >
                    <span className="text-white font-semibold text-sm">
                      {group.name ? group.name.charAt(0).toUpperCase() : 'G'}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {editingGroupName === group.id ? (
                        <input
                          type="text"
                          value={tempGroupName}
                          onChange={(e) => setTempGroupName(e.target.value)}
                          onBlur={() => handleBlurGroupName(group.id, group.name)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleSaveGroupName(group.id, group.name)
                            } else if (e.key === 'Escape') {
                              setEditingGroupName(null)
                              setTempGroupName('')
                            }
                          }}
                          placeholder={group.name}
                          className={`font-semibold bg-transparent border-none outline-none w-full ${isDark ? 'text-white' : 'text-gray-900'}`}
                          autoFocus
                        />
                      ) : (
                        <h3 
                          className={`font-semibold truncate cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-1 py-0.5 rounded transition-colors ${isDark ? 'text-white' : 'text-gray-900'}`}
                          onClick={() => handleStartEditGroupName(group.id, group.name)}
                          title="Click to edit group name"
                        >
                          {group.name}
                        </h3>
                      )}
                      <GroupSyncBadge 
                        groupId={group.id} 
                        onSync={handleGroupSync}
                        isSyncing={syncingGroups.has(group.id)}
                        isListMode={true}
                      />
                    </div>
                    {group.description && (
                      <p className={`text-sm truncate ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                        {group.description}
                      </p>
                    )}
                  </div>
      </div>

                <div className="flex items-center gap-2 sm:gap-4 sm:ml-4 flex-wrap">
                  {/* Stats */}
                  <div className="hidden sm:flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1">
                      <Puzzle className="w-4 h-4 text-gray-400" />
                      <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{group.addons}</span>
                      <span className={`${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{group.addons === 1 ? 'addon' : 'addons'}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Users className="w-4 h-4 text-gray-400" />
                      <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{group.members}</span>
                      <span className={`${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{group.members === 1 ? 'member' : 'members'}</span>
                    </div>
                  </div>
                  
                  {/* Enable/Disable toggle */}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleToggleGroupStatus(group.id, group.isActive) }}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      group.isActive ? (isMono ? 'bg-white/30 border border-white/20' : 'bg-stremio-purple') : (isMono ? 'bg-white/15 border border-white/20' : (isDark ? 'bg-gray-700' : 'bg-gray-300'))
                    }`}
                    aria-pressed={group.isActive}
                    title={group.isActive ? 'Click to disable' : 'Click to enable'}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        group.isActive ? 'translate-x-4' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                  
                  {/* Action buttons */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCloneGroup(group) }}
                      className={`flex items-center justify-center h-8 w-8 text-sm rounded transition-colors focus:outline-none ${
                        isDark ? 'text-gray-300 hover:text-blue-400' : 'text-gray-600 hover:text-blue-600'
                      }`}
                      title="Clone this group"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleGroupSync(group.id) }}
                      disabled={syncingGroups.has(group.id)}
                      className={`flex items-center justify-center h-8 w-8 text-sm rounded transition-colors disabled:opacity-50 focus:outline-none ${
                        isDark ? 'text-gray-300 hover:text-green-400' : 'text-gray-600 hover:text-green-600'
                      }`}
                      title="Sync all users in this group"
                    >
                      <RefreshCw className={`w-4 h-4 ${syncingGroups.has(group.id) ? 'animate-spin' : ''}`} />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation();
                        openConfirm({
                          title: `Delete group ${group.name}`,
                          description: 'This action cannot be undone.',
                          isDanger: true,
                          onConfirm: () => deleteGroupMutation.mutate(group.id)
                        })
                      }}
                      disabled={deleteGroupMutation.isPending}
                      className={`flex items-center justify-center h-8 w-8 text-sm rounded transition-colors disabled:opacity-50 focus:outline-none ${
                        isDark ? 'text-gray-300 hover:text-red-400' : 'text-gray-600 hover:text-red-600'
                      }`}
                      title="Delete group"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && !error && filteredGroups.length === 0 && (
        <div className="text-center py-12">
          <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className={`text-lg font-medium mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            {groups.length === 0 ? 'No groups yet' : 'No groups found'}
          </h3>
          <p className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            {groups.length === 0 
              ? 'Start by creating your first group to organize addons' 
              : 'Try adjusting your search or filter criteria'
            }
          </p>
          {groups.length === 0 && (
            <div className="mt-6">
              <button
                onClick={() => setShowAddModal(true)}
                className={`flex items-center justify-center px-3 py-2 sm:px-4 text-white rounded-lg transition-colors text-sm sm:text-base mx-auto ${
                  isModern
                    ? 'bg-gradient-to-br from-purple-600 via-purple-700 to-blue-800 hover:from-purple-700 hover:via-purple-800 hover:to-blue-900'
                    : isModernDark
                    ? 'bg-gradient-to-br from-purple-800 via-purple-900 to-blue-900 hover:from-purple-900 hover:via-purple-950 hover:to-indigo-900'
                    : isMono
                    ? 'bg-black hover:bg-gray-800'
                    : 'bg-stremio-purple hover:bg-purple-700'
                }`}
              >
                <Plus className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                <span className="hidden sm:inline">Add Your First Group</span>
                <span className="sm:hidden">Add Group</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Add Group Modal */}
      {showAddModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowAddModal(false)
              resetAddModal()
            }
          }}
        >
          <div className={`rounded-lg max-w-md w-full p-6 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Create New Group</h2>
              <button
                onClick={() => {
                  setShowAddModal(false)
                  resetAddModal()
                }}
                className={`w-8 h-8 flex items-center justify-center rounded ${isDark ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
              >
                ×
              </button>
            </div>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                if (!newGroupName.trim()) {
                  toast.error('Group name is required')
                  return
                }
            const currentColorIndex = newGroupColorIndexRef.current
            createGroupMutation.mutate({ 
              name: newGroupName.trim(), 
              description: newGroupDescription.trim() || undefined,
              colorIndex: currentColorIndex
            })
              }}
            >
              <div>
                <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Group Name</label>
                <input
                  type="text"
                  placeholder="Group name"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-stremio-purple focus:border-transparent ${
                    isDark 
                      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                  }`}
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Description</label>
                <textarea
                  placeholder="Describe the purpose of this group..."
                  rows={3}
                  value={newGroupDescription}
                  onChange={(e) => setNewGroupDescription(e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-stremio-purple focus:border-transparent ${
                    isDark 
                      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                  }`}
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Color</label>
                <div className="flex items-center gap-2">
                  {getColorOptions(isMono ? 'mono' : isModern ? 'modern' : isModernDark ? 'modern-dark' : isDark ? 'dark' : 'light').map((colorOption, index) => (
                    <button
                      key={index + 1}
                      type="button"
                  onClick={() => {
                    const selectedIndex = index + 1
                    setNewGroupColorIndex(selectedIndex)
                    newGroupColorIndexRef.current = selectedIndex
                  }}
                      aria-pressed={newGroupColorIndex === index + 1}
                      className={`relative w-8 h-8 rounded-full border-2 transition ${newGroupColorIndex === index + 1 ? 'border-white ring-2 ring-offset-2 ring-stremio-purple' : 'border-gray-300'}`}
                      style={{ 
                        backgroundColor: getColorValue(colorOption.bg)
                      }}
                    >
                      {newGroupColorIndex === index + 1 && (
                        <span className="absolute inset-0 flex items-center justify-center">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="white" className="w-4 h-4">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-7.25 7.25a1 1 0 01-1.414 0l-3-3a1 1 0 111.414-1.414L8.5 11.586l6.543-6.543a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false)
                    resetAddModal()
                  }}
                  className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                    isDark 
                      ? 'text-gray-300 bg-gray-700 hover:bg-gray-600' 
                      : 'text-gray-700 bg-gray-100 hover:bg-gray-200'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-stremio-purple text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  Create Group
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Edit Group Modal */}
      {showEditModal && editingGroupId && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowEditModal(false)
            }
          }}
        >
          <div className={`rounded-lg max-w-lg w-full p-6 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Edit Group</h2>
              <button
                onClick={() => { setShowEditModal(false); setEditingGroupId(null) }}
                className={`w-8 h-8 flex items-center justify-center rounded ${isDark ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
              >
                ×
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder={groupDetail?.name || ''}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-stremio-purple focus:border-transparent ${
                    isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                  }`}
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Description</label>
                <textarea
                  rows={3}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder={groupDetail?.description || ''}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-stremio-purple focus:border-transparent ${
                    isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                  }`}
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Users</label>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-auto">
                  {safeUsers.map((u: any) => {
                    const active = editUserIds.includes(u.id)
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => setEditUserIds(prev => active ? prev.filter(id => id !== u.id) : [...prev, u.id])}
                        className={`px-3 py-1 rounded-full border text-sm ${active ? 'bg-stremio-purple text-white border-stremio-purple' : (isDark ? 'bg-gray-700 text-gray-200 border-gray-600' : 'bg-gray-100 text-gray-700 border-gray-300')}`}
                      >
                        {u.username || u.email} {active ? '✓' : ''}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Addons</label>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-auto">
                  {safeAddons.map((a: any) => {
                    const active = editAddonIds.includes(a.id)
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setEditAddonIds(prev => active ? prev.filter(id => id !== a.id) : [...prev, a.id])}
                        className={`px-3 py-1 rounded-full border text-sm ${active ? 'bg-stremio-purple text-white border-stremio-purple' : (isDark ? 'bg-gray-700 text-gray-200 border-gray-600' : 'bg-gray-100 text-gray-700 border-gray-300')}`}
                      >
                        {a.name} {active ? '✓' : ''}
                      </button>
                    )
                  })}
                </div>
              </div>
              {/* Placeholders for members/addons selection UI - can be enhanced later */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => { setShowEditModal(false); setEditingGroupId(null) }}
                  className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                    isDark ? 'text-gray-300 bg-gray-700 hover:bg-gray-600' : 'text-gray-700 bg-gray-100 hover:bg-gray-200'
                  }`}
                >
                  Cancel
                </button>
                <button
                  onClick={() => updateGroupMutation.mutate({ id: editingGroupId, data: { name: editName, description: editDescription, userIds: editUserIds, addonIds: editAddonIds } })}
                  className="flex-1 px-4 py-2 bg-stremio-purple text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Group Detail Modal */}
      {showDetailModal && selectedGroup && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowDetailModal(false)
            }
          }}
        >
          <div className={`w-full max-w-4xl max-h-[90vh] ${isDndActive ? 'overflow-hidden' : 'overflow-y-auto'} rounded-lg shadow-xl ${
            isDark ? 'bg-gray-800' : 'bg-white'
          }`}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex flex-col">
                  <div className="flex items-center gap-4">
                    {editingDetailGroupName ? (
                      <input
                        type="text"
                        value={tempDetailGroupName}
                        onChange={(e) => setTempDetailGroupName(e.target.value)}
                        onBlur={() => handleBlurDetailGroupName(selectedGroup.name)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleSaveDetailGroupName(selectedGroup.name)
                          } else if (e.key === 'Escape') {
                            setEditingDetailGroupName(false)
                            setTempDetailGroupName('')
                          }
                        }}
                        placeholder={selectedGroup.name}
                        className={`px-2 py-1 text-xl font-bold border rounded focus:ring-2 focus:ring-stremio-purple focus:border-transparent ${
                          isDark 
                            ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                            : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                        }`}
                        autoFocus
                      />
                    ) : (
                      <h2 
                        className={`text-xl font-bold cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-2 py-1 rounded transition-colors ${isDark ? 'text-white' : 'text-gray-900'}`}
                        onClick={() => handleStartEditDetailGroupName(selectedGroup.name)}
                        title="Click to edit group name"
                      >
                        {selectedGroup.name}
                      </h2>
                    )}
                    <div className="flex items-center gap-2">
                      <Users className={`w-4 h-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
                      <span className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                        {selectedGroup.members || 0}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Puzzle className={`w-4 h-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
                      <span className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                        {selectedGroupDetails?.group?.addons?.length || selectedGroupDetails?.addons?.length || 0}
                      </span>
                    </div>
                  </div>
                  <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    {selectedGroup.description || 'No description'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <GroupSyncBadge 
                    groupId={selectedGroup.id} 
                    onSync={handleGroupSync}
                    isSyncing={syncingGroups.has(selectedGroup.id)}
                  />
                  <button
                    onClick={() => setShowDetailModal(false)}
                    className={`p-2 rounded-lg hover:bg-gray-200 transition-colors ${
                      isDark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500'
                    }`}
                  >
                    ✕
                  </button>
                </div>
              </div>


              {/* Group Members */}
              <div className={`p-4 rounded-lg mb-6 ${isDark ? 'bg-gray-700' : 'bg-gray-50'}`}>
                <h3 className={`text-lg font-semibold mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Members ({selectedGroupDetails?.users?.length || 0})
                </h3>
                {isLoadingGroupDetails ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-stremio-purple"></div>
                  </div>
                ) : selectedGroupDetails?.users && selectedGroupDetails.users.length > 0 ? (
                  <div className="space-y-3">
                    {selectedGroupDetails.users.map((member: any, index: number) => (
                      <div
                        key={member.id || index}
                        onClick={() => handleViewUserDetails(member)}
                        className={`relative rounded-lg border p-4 hover:shadow-md transition-all cursor-pointer ${
                          isDark 
                            ? 'bg-gray-800 border-gray-700 hover:bg-gray-750' 
                            : 'bg-white border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div className="flex items-center flex-1 min-w-0">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 flex-shrink-0 ${
                              isMono ? 'bg-black border border-white/20 text-white' : getGroupColorClass(selectedGroup?.colorIndex)
                            }`}
                            style={{
                              backgroundColor: selectedGroup?.colorIndex === 2 && isMono ? '#1f2937' : undefined
                            }}>
                              <span className="text-white font-semibold text-sm">
                                {member.username ? member.username.charAt(0).toUpperCase() : 
                                 member.email ? member.email.charAt(0).toUpperCase() : 'U'}
                              </span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className={`font-semibold truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                  {member.username || member.email || 'Unnamed User'}
                                </h3>
                                <GroupUserSyncBadge 
                                  userId={member.id} 
                                  userExcludedSet={globalUserExcludedSets.get(member.id) || new Set()} 
                                  userProtectedSet={globalUserProtectedSets.get(member.id) || new Set()} 
                                  isListMode={true}
                                />
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2 sm:gap-4 sm:ml-4 flex-wrap">
                            {/* Stats */}
                            <div className="hidden sm:flex items-center gap-4 text-sm">
                              <div className="flex items-center gap-1">
                                <Puzzle className="w-4 h-4 text-gray-400" />
                                <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                  {userSyncData.get(member.id)?.stremioAddonCount || member.stremioAddonsCount || 0}
                                </span>
                                <span className={`${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                  {(userSyncData.get(member.id)?.stremioAddonCount || member.stremioAddonsCount || 0) === 1 ? 'addon' : 'addons'}
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                <EyeOff className="w-4 h-4 text-gray-400" />
                                <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{globalUserExcludedSets.get(member.id)?.size || 0}</span>
                                <span className={`${isDark ? 'text-gray-400' : 'text-gray-500'}`}>excluded</span>
                              </div>
                            </div>
                            
                            {/* Action buttons */}
                            <div className="flex items-center gap-1">
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation()
                                  try {
                                    const syncMode = typeof window !== 'undefined' ? (localStorage.getItem('sfm_sync_mode') || 'normal') : 'normal'
                                    // Collect membership-specific exclusions if we have them in state
                                    const excluded = Array.from(globalUserExcludedSets.get(member.id) || [])
                                    await usersAPI.sync(member.id, excluded, syncMode as any)
                                    // mark cached status
                                    localStorage.setItem(`sfm_user_sync_status:${member.id}`, 'synced')
                                    const now = Date.now().toString()
                                    localStorage.setItem(`sfm_user_sync:${member.id}`, now)
                                    // invalidate queries
                                    queryClient.invalidateQueries({ queryKey: ['user', member.id, 'sync-status'] })
                                    if (selectedGroup?.id) {
                                      queryClient.invalidateQueries({ queryKey: ['user', member.id, 'sync-status', selectedGroup.id] })
                                      queryClient.invalidateQueries({ queryKey: ['group', selectedGroup.id, 'sync-status'] })
                                    }
                                    toast.success('User synced')
                                  } catch (e: any) {
                                    toast.error(e?.message || 'Failed to sync user')
                                  }
                                }}
                                className={`flex items-center justify-center h-8 w-8 text-sm rounded transition-colors focus:outline-none ${
                                  isDark ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'
                                }`}
                                title="Sync user"
                              >
                                <RefreshCw className="w-4 h-4" />
                              </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            openConfirm({
                              title: 'Remove user from group?',
                              description: `Remove "${member.username || member.email || 'this user'}" from the group? This will set their group to "no group".`,
                              isDanger: true,
                              onConfirm: () => {
                                removeUserFromGroupMutation.mutate({
                                  userId: member.id
                                });
                              }
                            });
                          }}
                                className={`flex items-center justify-center h-8 w-8 text-sm rounded transition-colors focus:outline-none ${
                                  isDark ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'
                                }`}
                                title="Remove from group"
                              >
                                <Trash2 className="w-4 h-4" />
                        </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Users className={`w-12 h-12 mx-auto mb-3 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
                    <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      No members in this group yet.
                    </p>
                  </div>
                )}
              </div>

              {/* Group Addons Management */}
              <div className={`p-4 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-gray-50'}`}>
                <h3 className={`text-lg font-semibold mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Addons
                </h3>
                {isLoadingGroupDetails ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-stremio-purple"></div>
                  </div>
                ) : (selectedGroupDetails?.group?.addons && selectedGroupDetails.group.addons.length > 0) || (selectedGroupDetails?.addons && selectedGroupDetails.addons.length > 0) ? (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStartDnd} onDragEnd={handleDragEndDnd} onDragCancel={handleDragCancelDnd} modifiers={[restrictToVerticalAxis]}>
                  <SortableContext items={addonOrder} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {orderAddons(selectedGroupDetails?.group?.addons || selectedGroupDetails?.addons || []).map((groupAddon: any, index: number) => {
                      // Handle both data structures: groupAddon.addon (from detailed API) or groupAddon (from simplified API)
                      const addon = groupAddon.addon || groupAddon
                      const murl = mapIdForAddon(addon)
                      const isDragged = isDragging && draggingIdRef.current === murl
                      const isActive = activeId === murl
                      
                      return (
                        <SortableAddon key={`${murl}-${index}` || `addon-${index}`} id={murl} index={index}>
                        <div
                          data-addon-index={index}
                          className={`relative p-3 pl-8 rounded-lg border transition-all duration-200 select-none touch-none ${
                            isDark ? 'bg-gray-600 border-gray-500' : 'bg-white border-gray-200'
                          } ${isDragged ? (isDark ? 'ring-2 ring-blue-500 opacity-50' : 'ring-2 ring-blue-400 opacity-50') : ''} ${isActive && isDragging ? 'opacity-0' : ''}`}
                          title="Drag to reorder"
                        >
                          {/* Full-height grab handle on far left, seamless */}
                          <div
                            className="absolute inset-y-0 left-0 w-6 flex items-center justify-center cursor-grab active:cursor-grabbing"
                            title="Drag to reorder"
                          >
                            <div className={`grid grid-cols-2 gap-0.5 ${isDark ? 'text-gray-400' : 'text-gray-400'}`}>
                              <span className="w-1 h-1 rounded-full bg-current block" />
                              <span className="w-1 h-1 rounded-full bg-current block" />
                              <span className="w-1 h-1 rounded-full bg-current block" />
                              <span className="w-1 h-1 rounded-full bg-current block" />
                              <span className="w-1 h-1 rounded-full bg-current block" />
                              <span className="w-1 h-1 rounded-full bg-current block" />
                            </div>
                          </div>
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h4 className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                  {addon.name || addon.id || 'Unnamed Addon'}
                                </h4>
                                {addon.version && (
                                  <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                                    isDark ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-800'
                                  }`}>
                                    v{addon.version}
                                  </span>
                                )}
                              </div>
                              {addon.description && (
                                <p className={`text-sm mt-1 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                                  {addon.description.length > 50 
                                    ? `${addon.description.substring(0, 50)}...` 
                                    : addon.description}
                                </p>
                              )}
                            </div>
                            <div className="ml-3 p-2 rounded-lg">
                              <button
                                className={`${isDark ? 'text-red-300 hover:bg-gray-700' : 'text-red-600 hover:bg-gray-100'} p-2 rounded-lg`}
                                title="Remove addon from group"
                                onClick={() => handleDeleteGroupAddon(addon.id, addon.name)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                        </SortableAddon>
                      )
                    })}
                  </div>
                  </SortableContext>
                  <DragOverlay dropAnimation={null}>
                    {activeId ? (() => {
                      const list = orderAddons(selectedGroupDetails?.group?.addons || selectedGroupDetails?.addons || [])
                      const activeAddon = list.find((g: any) => {
                        const a = g.addon || g
                        return mapIdForAddon(a) === activeId
                      })
                      const addon = (activeAddon && (activeAddon.addon || activeAddon)) || null
                      return (
                        <div className={`p-3 pl-8 rounded-lg border ${isDark ? 'bg-gray-600 border-gray-500' : 'bg-white border-gray-200'} shadow-xl`}>
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h4 className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                  {addon?.name || addon?.id || 'Addon'}
                                </h4>
                                {addon?.version && (
                                  <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                                    isDark ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-800'
                                  }`}>
                                    v{addon.version}
                                  </span>
                                )}
                              </div>
                              {addon?.description && (
                                <p className={`text-sm mt-1 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                                  {addon.description.length > 50 ? `${addon.description.substring(0, 50)}...` : addon.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })() : null}
                  </DragOverlay>
                  </DndContext>
                ) : (
                  <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    No addons assigned to this group yet.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      

      <ConfirmDialog
        open={confirmOpen}
        title={confirmConfig.title}
        description={confirmConfig.description}
        isDanger={confirmConfig.isDanger}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => { setConfirmOpen(false); confirmConfig.onConfirm?.() }}
      />
    </div>
  )
}