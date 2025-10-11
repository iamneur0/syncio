'use client'

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '@/contexts/ThemeContext'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { groupsAPI, usersAPI, addonsAPI } from '@/services/api'
import api from '@/services/api'
import { useDebounce } from '../../hooks/useDebounce'
import { debug } from '../../utils/debug'
import PageHeader from '../common/PageHeader'
import EntityCard from '../common/EntityCard'
import GroupModal from '../common/GroupModal'
import { LoadingSkeleton, EmptyState, SyncBadge, AddonList, ConfirmDialog } from '../common'
import { Users, Puzzle, Plus, Trash2, X } from 'lucide-react'
import { getColorBgClass, getColorOptions } from '@/utils/colorMapping'
import toast from 'react-hot-toast'
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'

// Helper functions
function getGroupColorClass(colorIndex: number): string {
  const colors = ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose']
  return colors[(colorIndex - 1) % colors.length] || 'gray'
}

function getColorValue(colorClass: string): string {
  const colorMap: { [key: string]: string } = {
    red: '#ef4444', orange: '#f97316', amber: '#f59e0b', yellow: '#eab308', lime: '#84cc16', green: '#22c55e', emerald: '#10b981', teal: '#14b8a6', cyan: '#06b6d4', sky: '#0ea5e9', blue: '#3b82f6', indigo: '#6366f1', violet: '#8b5cf6', purple: '#a855f7', fuchsia: '#d946ef', pink: '#ec4899', rose: '#f43f5e'
  }
  return colorMap[colorClass] || '#6b7280'
}

// Custom hooks for better organization
function useGroupModals() {
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState<'card' | 'list'>(() => {
    if (typeof window !== 'undefined') {
      const raw = String(localStorage.getItem('global-view-mode') || 'card').toLowerCase().trim()
      return raw === 'list' ? 'list' : 'card'
    }
    return 'card'
  })
  const [selectedGroups, setSelectedGroups] = useState<string[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<any>(null)
  
  // Drag and drop state
  const [isDndActive, setIsDndActive] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [addonOrder, setAddonOrder] = useState<string[]>([])
  
  // User picker state
  const [showUserPicker, setShowUserPicker] = useState(false)
  const [selectedUserIdsInline, setSelectedUserIdsInline] = useState<string[]>([])
  const [savingUsers, setSavingUsers] = useState(false)
  
  // Addon picker state
  const [showAddonPicker, setShowAddonPicker] = useState(false)
  const [selectedAddonIdsInline, setSelectedAddonIdsInline] = useState<string[]>([])
  const [savingAddons, setSavingAddons] = useState(false)
  
  // Add group modal state
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupDescription, setNewGroupDescription] = useState('')
  const [newGroupColorIndex, setNewGroupColorIndex] = useState(1)
  const [newGroupColorIndexRef, setNewGroupColorIndexRef] = useState(1)

  return {
    searchTerm,
    setSearchTerm,
    viewMode,
    setViewMode,
    selectedGroups,
    setSelectedGroups,
    showAddModal,
    setShowAddModal,
    showDetailModal,
    setShowDetailModal,
    selectedGroup,
    setSelectedGroup,
    // Drag and drop
    isDndActive,
    setIsDndActive,
    activeId,
    setActiveId,
    addonOrder,
    setAddonOrder,
    // User picker
    showUserPicker,
    setShowUserPicker,
    selectedUserIdsInline,
    setSelectedUserIdsInline,
    savingUsers,
    setSavingUsers,
    // Addon picker
    showAddonPicker,
    setShowAddonPicker,
    selectedAddonIdsInline,
    setSelectedAddonIdsInline,
    savingAddons,
    setSavingAddons,
    // Add group modal
    newGroupName,
    setNewGroupName,
    newGroupDescription,
    setNewGroupDescription,
    newGroupColorIndex,
    setNewGroupColorIndex,
    newGroupColorIndexRef,
    setNewGroupColorIndexRef
  }
}

function useGroupData(selectedGroup: any, showDetailModal: boolean) {
  const { data: groups = [], isLoading, error, isSuccess } = useQuery({
    queryKey: ['groups'],
    queryFn: async () => {
      debug.log('🔄 Fetching groups from API...')
      const result = await groupsAPI.getAll()
      debug.log('🔄 Groups API result:', result)
      
      if (result && typeof result === 'object' && 'data' in result && Array.isArray((result as any).data)) {
        return (result as any).data
      }
      
      if (Array.isArray(result)) {
        return result
      }
      
      return []
    },
  })

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: usersAPI.getAll,
  })

  const { data: addons = [] } = useQuery({
    queryKey: ['addons'],
    queryFn: addonsAPI.getAll,
  })

  // Get group details for the detail modal
  const { data: selectedGroupDetails, isLoading: isLoadingGroupDetails } = useQuery({
    queryKey: ['group', selectedGroup?.id, 'details'],
    queryFn: () => groupsAPI.getById(selectedGroup!.id),
    enabled: !!selectedGroup?.id && showDetailModal,
  })

  return { groups, users, addons, selectedGroupDetails, isLoading, error, isSuccess, isLoadingGroupDetails }
}

function useGroupMutations(selectedGroupDetails: any, selectedGroup: any, onGroupCreated?: () => void) {
  const queryClient = useQueryClient()

  const createGroupMutation = useMutation({
    mutationFn: groupsAPI.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      toast.success('Group created successfully')
      onGroupCreated?.()
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to create group')
    }
  })

  const updateGroupMutation = useMutation({
    mutationFn: ({ id, groupData }: { id: string; groupData: any }) => 
      groupsAPI.update(id, groupData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      toast.success('Group updated successfully')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to update group')
    }
  })

  const deleteGroupMutation = useMutation({
    mutationFn: groupsAPI.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      toast.success('Group deleted successfully')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to delete group')
    }
  })

  const cloneGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      // Simulate clone by getting group details and creating a new one
      const group = await groupsAPI.getById(groupId)
      const cloneData = {
        name: `${group.name} (Copy)`,
        description: group.description,
        isActive: group.isActive,
        colorIndex: group.colorIndex,
        restrictions: group.restrictions || []
      }
      return groupsAPI.create(cloneData)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      toast.success('Group cloned successfully')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to clone group')
    }
  })

  const syncGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      // Simulate group sync - in real implementation this would call a group sync API
      return Promise.resolve({ success: true })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      toast.success('Group synced successfully')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to sync group')
    }
  })

  const bulkSyncMutation = useMutation({
    mutationFn: async (groupIds: string[]) => {
      // Simulate bulk sync by syncing each group individually
      for (const groupId of groupIds) {
        await syncGroupMutation.mutateAsync(groupId)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      toast.success('Groups synced successfully')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to sync groups')
    }
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: async (groupIds: string[]) => {
      // Simulate bulk delete by deleting each group individually
      for (const groupId of groupIds) {
        await groupsAPI.delete(groupId)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      toast.success('Groups deleted successfully')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to delete groups')
    }
  })

  // Inline update mutations for users/addons
  const updateGroupUsersMutation = useMutation({
    mutationFn: async (payload: { id: string; userIds: string[] }) => {
      const currentAddonIds = (selectedGroupDetails?.group?.addons || selectedGroupDetails?.addons || []).map((a: any) => (a.addon?.id || a.id)).filter(Boolean)
      return groupsAPI.update(payload.id, { userIds: payload.userIds, addonIds: currentAddonIds })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group', selectedGroup?.id, 'details'] })
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      toast.success('Members updated')
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to update members'),
  })

  const updateGroupAddonsMutation = useMutation({
    mutationFn: async (payload: { id: string; addonIds: string[] }) => {
      const currentUserIds = (selectedGroupDetails?.users || []).map((u: any) => u.id).filter(Boolean)
      return groupsAPI.update(payload.id, { userIds: currentUserIds, addonIds: payload.addonIds })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group', selectedGroup?.id, 'details'] })
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      toast.success('Addons updated')
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to update addons'),
  })

  const reorderGroupAddonsMutation = useMutation({
    mutationFn: async (payload: { id: string; orderedManifestUrls: string[] }) => {
      return groupsAPI.reorderAddons(payload.id, payload.orderedManifestUrls)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group', selectedGroup?.id, 'details'] })
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      toast.success('Addon order updated')
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to reorder addons'),
  })

  return {
    createGroupMutation,
    updateGroupMutation,
    deleteGroupMutation,
    cloneGroupMutation,
    syncGroupMutation,
    bulkSyncMutation,
    bulkDeleteMutation,
    updateGroupUsersMutation,
    updateGroupAddonsMutation,
    reorderGroupAddonsMutation
  }
}

export default function GroupsPageRefactored() {
  const theme = useTheme()
  const { isDark, isModern, isModernDark, isMono } = theme
  const queryClient = useQueryClient()
  const [mounted, setMounted] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [groupToDelete, setGroupToDelete] = useState<{ id: string; name: string } | null>(null)
  
  useEffect(() => { setMounted(true) }, [])

  // Custom hooks
  const {
    searchTerm,
    setSearchTerm,
    viewMode,
    setViewMode,
    selectedGroups,
    setSelectedGroups,
    showAddModal,
    setShowAddModal,
    showDetailModal,
    setShowDetailModal,
    selectedGroup,
    setSelectedGroup,
    // Drag and drop
    isDndActive,
    setIsDndActive,
    activeId,
    setActiveId,
    addonOrder,
    setAddonOrder,
    // User picker
    showUserPicker,
    setShowUserPicker,
    selectedUserIdsInline,
    setSelectedUserIdsInline,
    savingUsers,
    setSavingUsers,
    // Addon picker
    showAddonPicker,
    setShowAddonPicker,
    selectedAddonIdsInline,
    setSelectedAddonIdsInline,
    savingAddons,
    setSavingAddons,
    // Add group modal
    newGroupName,
    setNewGroupName,
    newGroupDescription,
    setNewGroupDescription,
    newGroupColorIndex,
    setNewGroupColorIndex,
    newGroupColorIndexRef,
    setNewGroupColorIndexRef
  } = useGroupModals()

  const { groups, users, addons, selectedGroupDetails, isLoading, error, isSuccess, isLoadingGroupDetails } = useGroupData(selectedGroup, showDetailModal)
  const {
    createGroupMutation,
    updateGroupMutation,
    deleteGroupMutation,
    cloneGroupMutation,
    syncGroupMutation,
    bulkSyncMutation,
    bulkDeleteMutation,
    updateGroupUsersMutation,
    updateGroupAddonsMutation,
    reorderGroupAddonsMutation
  } = useGroupMutations(selectedGroupDetails, selectedGroup, () => {
    setShowAddModal(false)
    resetAddModal()
  })

  // Escape key handling for modals
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showAddModal) {
          setShowAddModal(false)
          resetAddModal()
        } else if (showDetailModal) {
          setShowDetailModal(false)
        }
      }
    }
    
    if (showAddModal || showDetailModal) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [showAddModal, showDetailModal])

  // Add modal-open class to body when modals are open
  useEffect(() => {
    if (showAddModal || showDetailModal) {
      document.body.classList.add('modal-open')
    } else {
      document.body.classList.remove('modal-open')
    }
    
    // Cleanup on unmount
    return () => {
      document.body.classList.remove('modal-open')
    }
  }, [showAddModal, showDetailModal])

  const debouncedSearchTerm = useDebounce(searchTerm, 300)

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor)
  )

  // Drag and drop handlers
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
    
    // Handle addon reordering
    const oldIndex = addonOrder.indexOf(active.id)
    const newIndex = addonOrder.indexOf(over.id)
    
    if (oldIndex !== -1 && newIndex !== -1) {
      const newOrder = [...addonOrder]
      newOrder.splice(oldIndex, 1)
      newOrder.splice(newIndex, 0, active.id)
      setAddonOrder(newOrder)
      
      // Update the group with new addon order using the reorder endpoint
      if (selectedGroup?.id) {
        // Convert the new order to manifest URLs
        const orderedManifestUrls = newOrder.map(id => {
          const addon = (selectedGroupDetails?.group?.addons || selectedGroupDetails?.addons || []).find((ga: any) => {
            const a = ga.addon || ga
            return mapIdForAddon(a) === id
          })
          if (addon) {
            const addonData = addon.addon || addon
            return addonData.manifestUrl || addonData.transportUrl || addonData.url || addonData.id
          }
          return id
        }).filter(Boolean)
        
        reorderGroupAddonsMutation.mutate({ 
          id: selectedGroup.id, 
          orderedManifestUrls 
        })
      }
    }
  }

  // Sortable addon component
  const SortableAddon: React.FC<{ id: string; index: number; children: (listeners: any) => React.ReactNode }> = ({ id, index, children }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : undefined,
    } as React.CSSProperties

    return (
      <div ref={setNodeRef} style={style} {...attributes}>
        {children(listeners)}
      </div>
    )
  }

  // Helper function to map addon to ID for ordering
  const mapIdForAddon = (addon: any) => (addon.manifestUrl || addon.transportUrl || addon.url || addon.id || '').toString().trim()

  // Order addons based on the current addonOrder
  const orderAddons = React.useCallback((arr: any[]) => {
    const pos = new Map(addonOrder.map((u, i) => [u, i]))
    // Dedupe by mapped id to avoid duplicates in UI
    const seen = new Set<string>()
    const uniq = [] as any[]
    for (const item of arr) {
      const key = mapIdForAddon(item.addon || item)
      if (!seen.has(key)) { seen.add(key); uniq.push(item) }
    }
    return uniq.sort((a, b) => (pos.get(mapIdForAddon(a.addon || a)) ?? 1e9) - (pos.get(mapIdForAddon(b.addon || b)) ?? 1e9))
  }, [addonOrder])

  // Initialize addon order when group details change
  useEffect(() => {
    if (selectedGroupDetails?.group?.addons || selectedGroupDetails?.addons) {
      const addons = selectedGroupDetails?.group?.addons || selectedGroupDetails?.addons || []
      const addonIds = addons.map((ga: any) => {
        const addon = ga.addon || ga
        return mapIdForAddon(addon)
      })
      setAddonOrder(addonIds)
    }
  }, [selectedGroupDetails])

  // Filter groups based on search term
  const displayGroups = useMemo(() => {
    if (!Array.isArray(groups)) return []
    
    const filtered = groups.filter((group: any) => {
      const searchLower = debouncedSearchTerm.toLowerCase()
      return (
        group.name?.toLowerCase().includes(searchLower) ||
        group.description?.toLowerCase().includes(searchLower)
      )
    })
    
    return filtered
  }, [groups, debouncedSearchTerm])

  // Selection handlers
  const handleSelectAll = () => {
    setSelectedGroups(displayGroups.map((group: any) => group.id))
  }

  const handleDeselectAll = () => {
    setSelectedGroups([])
  }

  const handleGroupToggle = (groupId: string) => {
    setSelectedGroups(prev => 
      prev.includes(groupId) 
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    )
  }

  const handleToggleGroupStatus = (groupId: string, currentStatus: boolean) => {
    console.log('🔄 Toggle group status:', { groupId, currentStatus })
    const group = groups?.find((g: any) => g.id === groupId)
    const groupName = group?.name || 'Group'
    api.patch(`/groups/${groupId}/toggle-status`, { isActive: !currentStatus })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['groups'] })
        toast.success(`${groupName} ${!currentStatus ? 'enabled' : 'disabled'}`)
      })
      .catch((error: any) => {
        console.error('❌ Toggle group error:', error)
        toast.error(error?.message || 'Failed to toggle group status')
      })
  }

  // Group actions
  const handleAddGroup = () => {
    setShowAddModal(true)
  }


  const handleViewGroup = (group: any) => {
    setSelectedGroup(group)
    setShowDetailModal(true)
  }

  const handleDeleteGroup = (groupId: string) => {
    const group = groups?.find((g: any) => g.id === groupId)
    const groupName = group?.name || 'Group'
    setGroupToDelete({ id: groupId, name: groupName })
    setShowDeleteConfirm(true)
  }

  const confirmDeleteGroup = () => {
    if (groupToDelete) {
      deleteGroupMutation.mutate(groupToDelete.id)
      setShowDeleteConfirm(false)
      setGroupToDelete(null)
    }
  }

  const cancelDeleteGroup = () => {
    setShowDeleteConfirm(false)
    setGroupToDelete(null)
  }

  const handleCloneGroup = (group: any) => {
    cloneGroupMutation.mutate(group.id)
  }

  const handleSyncGroup = (groupId: string) => {
    syncGroupMutation.mutate(groupId)
  }

  const handleBulkSync = () => {
    if (selectedGroups.length > 0) {
      bulkSyncMutation.mutate(selectedGroups)
    }
  }

  const handleBulkDelete = () => {
    if (selectedGroups.length > 0) {
      bulkDeleteMutation.mutate(selectedGroups)
    }
  }

  // View mode change
  const handleViewModeChange = (mode: 'card' | 'list') => {
    setViewMode(mode)
    localStorage.setItem('global-view-mode', mode)
  }

  // Modal handlers
  const handleSaveGroup = (groupData: any) => {
    createGroupMutation.mutate(groupData)
  }

  const handleCloseModals = () => {
    setShowAddModal(false)
    setShowDetailModal(false)
    setSelectedGroup(null)
  }

  const resetAddModal = () => {
    setNewGroupName('')
    setNewGroupDescription('')
    setNewGroupColorIndex(1)
    setNewGroupColorIndexRef(1)
  }

  // Only show loading state if data is actually taking time to load
  const [showLoading, setShowLoading] = useState(false)
  
  useEffect(() => {
    if (isLoading) {
      const timer = setTimeout(() => setShowLoading(true), 200) // 200ms delay
      return () => clearTimeout(timer)
    } else {
      setShowLoading(false)
    }
  }, [isLoading])

  // Loading state
  if (isLoading && showLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-6 animate-in fade-in duration-200">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <LoadingSkeleton key={i} className="h-48 opacity-60" />
          ))}
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState
          icon="⚠️"
          title="Failed to load groups"
          description="There was an error loading the groups. Please try again."
        />
      </div>
    )
  }

  // Empty state
  if (!isLoading && Array.isArray(groups) && groups.length === 0) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState
          icon="👥"
          title="No groups yet"
          description="Add your first group to get started."
          action={{
            label: 'Add Group',
            onClick: handleAddGroup
          }}
        />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Groups"
        description="Manage Stremio groups for your users"
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search groups..."
        selectedCount={selectedGroups.length}
        onSelectAll={handleSelectAll}
        onDeselectAll={handleDeselectAll}
        onAdd={handleAddGroup}
        onReload={handleBulkSync}
        onDelete={handleBulkDelete}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        isReloadDisabled={selectedGroups.length === 0}
        isDeleteDisabled={selectedGroups.length === 0}
        mounted={mounted}
      />

      {/* Content */}
      {viewMode === 'card' ? (
        /* Card Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
          {displayGroups.map((group: any) => (
            <EntityCard
              key={group.id}
              variant="group"
              entity={{
                ...group,
                isActive: group.isActive ?? true
              }}
              isSelected={selectedGroups.includes(group.id)}
              onSelect={handleGroupToggle}
              onToggle={handleToggleGroupStatus}
              onDelete={handleDeleteGroup}
              onView={handleViewGroup}
              onClone={handleCloneGroup}
              onSync={handleSyncGroup}
              isSyncing={syncGroupMutation.isPending}
            />
          ))}
        </div>
      ) : (
        /* List View */
        <div className="space-y-2">
          {displayGroups.map((group: any) => (
            <EntityCard
              key={group.id}
              variant="group"
              entity={{
                ...group,
                isActive: group.isActive ?? true
              }}
              isSelected={selectedGroups.includes(group.id)}
              onSelect={handleGroupToggle}
              onToggle={handleToggleGroupStatus}
              onDelete={handleDeleteGroup}
              onView={handleViewGroup}
              onClone={handleCloneGroup}
              onSync={handleSyncGroup}
              isSyncing={syncGroupMutation.isPending}
              isListMode={true}
            />
          ))}
        </div>
      )}

      {/* Add Group Modal - Original Complex Implementation */}
      {showAddModal && (
        <div 
          className="fixed top-0 left-0 right-0 bottom-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-[1000] modal-root"
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
                className={`w-8 h-8 flex items-center justify-center rounded transition-colors border-0 ${
                  isDark ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                }`}
              >
                <X className="w-4 h-4" />
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
                const currentColorIndex = newGroupColorIndexRef
                createGroupMutation.mutate({ 
                  name: newGroupName.trim(), 
                  description: newGroupDescription.trim() || '',
                  restrictions: 'none' as const,
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
                        setNewGroupColorIndexRef(selectedIndex)
                      }}
                      aria-pressed={newGroupColorIndex === index + 1}
                      className={`relative w-8 h-8 rounded-full border-2 transition ${newGroupColorIndex === index + 1 ? 'border-white ring-2 ring-offset-2 ring-stremio-purple' : 'border-gray-300'}`}
                      style={{ 
                        backgroundColor: colorOption.hexValue
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
                  disabled={createGroupMutation.isPending}
                  className="flex-1 px-4 py-2 accent-bg accent-text rounded-lg transition-colors disabled:opacity-50"
                >
                  {createGroupMutation.isPending ? 'Creating...' : 'Create Group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* Group Detail Modal - Using original complex modal */}
      {showDetailModal && selectedGroup && createPortal(
        <div 
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[1000] p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowDetailModal(false)
            }
          }}
        >
          <div className={`w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-lg shadow-xl ${
            isDark ? 'bg-gray-800' : 'bg-white'
          }`}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex flex-col flex-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {selectedGroup.name}
                      </h2>
                      <SyncBadge 
                        groupId={selectedGroup.id} 
                        onSync={handleSyncGroup}
                        isSyncing={syncGroupMutation.isPending}
                      />
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Users className={`w-4 h-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
                          <span className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                            {selectedGroupDetails?.users?.length || 0}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Puzzle className={`w-4 h-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
                          <span className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                            {selectedGroupDetails?.group?.addons?.length || selectedGroupDetails?.addons?.length || 0}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => setShowDetailModal(false)}
                        className={`w-8 h-8 flex items-center justify-center rounded transition-colors border-0 ${
                          isDark ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {selectedGroup.description && (
                    <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      {selectedGroup.description}
                    </p>
                  )}
                </div>
              </div>

              {/* Group Members */}
              <div className={`p-4 rounded-lg mb-6 ${isDark ? 'bg-gray-700' : 'bg-gray-50'}`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Members ({selectedGroupDetails?.users?.length || 0})
                  </h3>
                  <button
                    onClick={() => {
                      if (!selectedGroupDetails || !selectedGroup?.id) return
                      setSelectedUserIdsInline((selectedGroupDetails.users || []).map((u: any) => u.id))
                      setShowUserPicker(true)
                    }}
                    className={`p-2 rounded-lg border-0 focus:outline-none ring-0 focus:ring-0 transition-colors ${
                      isDark ? 'text-white hover:text-blue-300 hover:bg-gray-600' : 'text-gray-900 hover:text-blue-700 hover:bg-gray-100'
                    }`}
                    title="Add user to group"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
                {showUserPicker && (
                  <div className={`mb-3 p-3 rounded-lg border ${isDark ? 'bg-gray-600 border-gray-500' : 'bg-white border-gray-200'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>Select Members</h4>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setShowUserPicker(false)}
                          className={`w-[84px] h-8 min-h-8 max-h-8 text-sm rounded-lg border transition-colors ${
                            isDark ? 'bg-gray-600 border-gray-500 text-white hover:bg-gray-500' : 'bg-white border-gray-200 text-gray-900 hover:bg-gray-50'
                          }`}
                        >Cancel</button>
                        <button
                          onClick={() => {
                            if (!selectedGroup?.id) return
                            setSavingUsers(true)
                            updateGroupUsersMutation.mutate({ id: selectedGroup.id, userIds: selectedUserIdsInline })
                            setShowUserPicker(false)
                          }}
                          disabled={savingUsers}
                          className={`w-[84px] h-8 min-h-8 max-h-8 text-sm rounded-lg border transition-colors disabled:opacity-50 ${
                            isDark ? 'bg-gray-600 border-gray-500 text-white hover:bg-gray-500' : 'bg-white border-gray-200 text-gray-900 hover:bg-gray-50'
                          }`}
                        >{savingUsers ? 'Saving...' : 'Save'}</button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 max-h-48 overflow-auto">
                      {users.map((u: any) => {
                        const active = selectedUserIdsInline.includes(u.id)
                        return (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => setSelectedUserIdsInline(prev => active ? prev.filter(id => id !== u.id) : [...prev, u.id])}
                            className={`px-3 py-2 rounded-lg text-sm transition-colors !border-0 ${
                              isMono
                                ? (active ? '!bg-white/15 text-white' : '!bg-black text-white')
                                : (isDark
                                  ? (active ? 'bg-gray-500 text-white' : 'bg-gray-600 text-white')
                                  : (active ? 'bg-gray-200 text-gray-900' : 'bg-white text-gray-700'))
                            }`}
                          >
                            {u.username || u.email}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
                {isLoadingGroupDetails ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 accent-border"></div>
                  </div>
                ) : selectedGroupDetails?.users && selectedGroupDetails.users.length > 0 ? (
                  <div className="space-y-3">
                    {selectedGroupDetails.users.map((member: any, index: number) => (
                      <div
                        key={member.id || index}
                        className={`relative rounded-lg border p-4 hover:shadow-md transition-all cursor-pointer ${
                          isDark 
                            ? 'bg-gray-600 border-gray-500 hover:bg-gray-550' 
                            : 'bg-white border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center flex-1 min-w-0">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 flex-shrink-0 ${
                              isMono ? 'bg-black border border-white/20 text-white' : 'bg-stremio-purple text-white'
                            }`}>
                              <span className="text-white font-semibold text-sm">
                                {member.username ? member.username.charAt(0).toUpperCase() : 
                                 member.email ? member.email.charAt(0).toUpperCase() : 'U'}
                              </span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <h3 className={`font-semibold truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                  {member.username || member.email || 'Unnamed User'}
                                </h3>
                                <SyncBadge 
                                  userId={member.id} 
                                  isListMode={true}
                                />
                              </div>
                              <div className="flex items-center gap-3 text-sm mt-1">
                                <div className="flex items-center gap-1">
                                  <Puzzle className="w-3 h-3 text-gray-400" />
                                  <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                    {member.stremioAddonsCount || 0}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Users className={`w-12 h-12 mx-auto mb-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
                    <p className={`${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      No members in this group
                    </p>
                  </div>
                )}
              </div>

              {/* Group Addons */}
              <AddonList
                addons={(selectedGroupDetails?.group?.addons || selectedGroupDetails?.addons || []).map((ga: any) => ga.addon || ga)}
                title="Addons"
                count={(selectedGroupDetails?.group?.addons || selectedGroupDetails?.addons || []).length}
                isLoading={isLoadingGroupDetails}
                emptyMessage="No addons in this group"
                className="bg-transparent p-0"
              >
                {isLoadingGroupDetails ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 accent-border"></div>
                  </div>
                ) : (selectedGroupDetails?.group?.addons && selectedGroupDetails.group.addons.length > 0) || (selectedGroupDetails?.addons && selectedGroupDetails.addons.length > 0) ? (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStartDnd} onDragEnd={handleDragEndDnd} onDragCancel={handleDragCancelDnd} modifiers={[restrictToVerticalAxis]}>
                    <SortableContext items={addonOrder} strategy={verticalListSortingStrategy}>
                      <div className="space-y-2">
                        {orderAddons(selectedGroupDetails?.group?.addons || selectedGroupDetails?.addons || []).map((groupAddon: any, index: number) => {
                          // Handle both data structures: groupAddon.addon (from detailed API) or groupAddon (from simplified API)
                          const addon = groupAddon.addon || groupAddon
                          const addonId = mapIdForAddon(addon)
                          const isDragged = isDndActive && activeId === addonId
                          const isActive = activeId === addonId
                          
                          return (
                            <SortableAddon key={`${addonId}-${index}`} id={addonId} index={index}>
                              {(listeners) => (
                              <div
                                className={`relative p-3 pl-8 rounded-lg border transition-all duration-200 select-none touch-none ${
                                  isDark ? 'bg-gray-600 border-gray-500' : 'bg-white border-gray-200'
                                } ${isDragged ? (isDark ? 'ring-2 ring-blue-500 opacity-50' : 'ring-2 ring-blue-400 opacity-50') : ''} ${isActive && isDndActive ? 'opacity-0' : ''}`}
                                title="Drag to reorder"
                              >
                                {/* Full-height grab handle on far left, seamless */}
                                <div
                                  className="absolute inset-y-0 left-0 w-6 flex items-center justify-center cursor-grab active:cursor-grabbing hover:bg-gray-100 dark:hover:bg-gray-700 rounded-l-lg transition-colors border-r border-gray-200 dark:border-gray-600"
                                  title="Drag to reorder"
                                  {...listeners}
                                >
                                  <div className={`grid grid-cols-2 gap-0.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                    <span className="w-1 h-1 rounded-full bg-current block" />
                                    <span className="w-1 h-1 rounded-full bg-current block" />
                                    <span className="w-1 h-1 rounded-full bg-current block" />
                                    <span className="w-1 h-1 rounded-full bg-current block" />
                                    <span className="w-1 h-1 rounded-full bg-current block" />
                                    <span className="w-1 h-1 rounded-full bg-current block" />
                                  </div>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center flex-1 min-w-0">
                                      <div 
                                        className={`w-12 h-12 rounded-full flex items-center justify-center mr-3 flex-shrink-0 overflow-hidden border-0`}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onTouchStart={(e) => e.stopPropagation()}
                                      >
                                        {addon.iconUrl ? (
                                          <img
                                            src={addon.iconUrl}
                                            alt={`${addon.name} logo`}
                                            className="w-full h-full object-contain"
                                            onError={(e: any) => { e.currentTarget.style.display = 'none' }}
                                          />
                                        ) : null}
                                        <div className={`w-full h-full ${addon.iconUrl ? 'hidden' : 'flex'} bg-stremio-purple text-white items-center justify-center border-0`}>
                                          <Puzzle className="w-5 h-5 text-white" />
                                        </div>
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div 
                                          className="flex flex-col min-[480px]:flex-row min-[480px]:items-center min-[480px]:gap-2"
                                          onMouseDown={(e) => e.stopPropagation()}
                                          onTouchStart={(e) => e.stopPropagation()}
                                        >
                                          <h4 className={`font-medium truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                            {addon.name || 'Unnamed Addon'}
                                          </h4>
                                          {addon.version && (
                                            <div 
                                              className={`px-2 py-1 rounded text-xs font-medium mt-1 min-[480px]:mt-0 ${
                                                isDark ? 'bg-gray-500 text-gray-200' : 'bg-gray-200 text-gray-700'
                                              }`}
                                              onMouseDown={(e) => e.stopPropagation()}
                                              onTouchStart={(e) => e.stopPropagation()}
                                            >
                                              v{addon.version}
                                            </div>
                                          )}
                                        </div>
                                        {addon.description && (
                                          <p 
                                            className={`hidden sm:block text-sm mt-1 truncate ${isDark ? 'text-gray-300' : 'text-gray-600'}`}
                                            onMouseDown={(e) => e.stopPropagation()}
                                            onTouchStart={(e) => e.stopPropagation()}
                                          >
                                            {addon.description}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="ml-1 p-2 rounded-lg">
                                    <button
                                      className={`flex items-center justify-center h-8 w-8 text-sm rounded transition-colors focus:outline-none ${
                                        isDark ? 'text-gray-300 hover:text-red-400' : 'text-gray-600 hover:text-red-600'
                                      }`}
                                      title="Remove addon from group"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        e.preventDefault()
                                        // Remove addon from group
                                        const currentAddonIds = (selectedGroupDetails?.group?.addons || selectedGroupDetails?.addons || [])
                                          .map((ga: any) => (ga.addon?.id || ga.id))
                                          .filter((id: string) => id !== addon.id)
                                        updateGroupAddonsMutation.mutate({ id: selectedGroup.id, addonIds: currentAddonIds })
                                      }}
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onTouchStart={(e) => e.stopPropagation()}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                              )}
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
                        
                        return addon ? (
                          <div className={`p-3 pl-8 rounded-lg border ${isDark ? 'bg-gray-600 border-gray-500' : 'bg-white border-gray-200'} shadow-xl`}>
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center flex-1 min-w-0">
                                  <div className="w-12 h-12 rounded-full flex items-center justify-center mr-3 flex-shrink-0 overflow-hidden border-0">
                                    {addon.iconUrl ? (
                                      <img
                                        src={addon.iconUrl}
                                        alt={`${addon.name} logo`}
                                        className="w-full h-full object-contain"
                                        onError={(e: any) => { e.currentTarget.style.display = 'none' }}
                                      />
                                    ) : null}
                                    <div className={`w-full h-full ${addon.iconUrl ? 'hidden' : 'flex'} bg-stremio-purple text-white items-center justify-center border-0`}>
                                      <Puzzle className="w-5 h-5 text-white" />
                                    </div>
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-col min-[480px]:flex-row min-[480px]:items-center min-[480px]:gap-2">
                                      <h4 className={`font-medium truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                        {addon.name || 'Unnamed Addon'}
                                      </h4>
                                      {addon.version && (
                                        <div className={`px-2 py-1 rounded text-xs font-medium mt-1 min-[480px]:mt-0 ${
                                          isDark ? 'bg-gray-500 text-gray-200' : 'bg-gray-200 text-gray-700'
                                        }`}>
                                          v{addon.version}
                                        </div>
                                      )}
                                    </div>
                                    {addon.description && (
                                      <p className={`hidden sm:block text-sm mt-1 truncate ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                                        {addon.description}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : null
                      })() : null}
                    </DragOverlay>
                  </DndContext>
                ) : (
                  <div className="text-center py-8">
                    <Puzzle className={`w-12 h-12 mx-auto mb-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
                    <p className={`${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      No addons in this group
                    </p>
                  </div>
                )}
              </AddonList>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Group"
        description={`Are you sure you want to delete "${groupToDelete?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        isDanger={true}
        onConfirm={confirmDeleteGroup}
        onCancel={cancelDeleteGroup}
      />
    </div>
  )
}
