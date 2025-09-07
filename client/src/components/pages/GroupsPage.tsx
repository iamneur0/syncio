'use client'

import React, { useState, useMemo, useEffect, useRef } from 'react'
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
  RotateCcw,
  Copy
} from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { groupsAPI, usersAPI, addonsAPI } from '@/services/api'
import toast from 'react-hot-toast'
import ConfirmDialog from '../common/ConfirmDialog'
import SyncBadge from '../common/SyncBadge'
import { useDebounce } from '../../hooks/useDebounce'


// Group sync status badge component
function GroupSyncBadge({ groupId, onSync, isSyncing }: { groupId: string; onSync: (groupId: string) => void; isSyncing: boolean }) {
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

  // Re-check when Groups tab is activated
  React.useEffect(() => {
    const onTab = (e: CustomEvent) => {
      if (e.detail?.id === 'groups') {
        setStatus('checking')
      }
    }
    window.addEventListener('sfm:tab:activated' as any, onTab as any)
    return () => window.removeEventListener('sfm:tab:activated' as any, onTab as any)
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
        
        // Determine per-user status using UserSyncBadge persisted results
        const userSyncPromises = groupUsers.map(async (user: any) => {
          try {
            const cached = localStorage.getItem(`sfm_user_sync_status:${user.id}`)
            if (cached === 'synced') return true
            if (cached === 'unsynced') return false
            // Fallback: query user detail quickly to know if they have connection;
            // without cached status treat as unsynced to be conservative.
            const userDetail = await usersAPI.getById(user.id)
            return !!userDetail?.hasStremioConnection ? false : true
          } catch (error) {
            console.error(`Error checking cached status for user ${user.id}:`, error)
            return false
          }
        })

        const userSyncResults = await Promise.all(userSyncPromises)
        const allUsersSynced = userSyncResults.every(synced => synced)
        
        setStatus(allUsersSynced ? 'synced' : 'unsynced')
      } catch (error) {
        console.error('Error checking group sync status:', error)
        setStatus('unsynced')
      } finally {
        setIsLoading(false)
      }
    }

    checkGroupSyncStatus()
  }, [groupId, groupUsers, syncStatusData, isSyncing])

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
    />
  )
}

export default function GroupsPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const debouncedSearchTerm = useDebounce(searchTerm, 300)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<any>(null)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupDescription, setNewGroupDescription] = useState('')
  const [newGroupColor, setNewGroupColor] = useState<string>('purple')
  const { isDark } = useTheme()
  const queryClient = useQueryClient()
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
  const handleDragCancelDnd = () => {
    setActiveId(null)
    setIsDndActive(false)
    try { document.body.style.overflow = '' } catch {}
  }
    if (from === -1 || to === -1) return
    const next = [...addonOrder]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setAddonOrder(next)
    // Persist reorder to backend, mirror Users behavior
    justReorderedRef.current = true
    if (selectedGroup?.id) {
      groupsAPI.reorderAddons(selectedGroup.id, next)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['group', selectedGroup.id, 'details'] })
          queryClient.invalidateQueries({ queryKey: ['groups'] })
          queryClient.invalidateQueries({ queryKey: ['users'] })
          queryClient.invalidateQueries({ queryKey: ['user'] })
          // Notify GroupSyncBadge to reflect unsynced immediately
          try { window.dispatchEvent(new CustomEvent('sfm:group:reordered' as any, { detail: { id: selectedGroup.id } })) } catch {}
          toast.success('Addon order updated')
        })
        .catch((error: any) => {
          console.error('Failed to reorder addons:', error)
          toast.error(error?.message || 'Failed to update addon order')
        })
    }
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
  }

  // Handle clone group
  const handleCloneGroup = (group: any) => {
    cloneGroupMutation.mutate(group.id)
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

  const createGroupMutation = useMutation({
    mutationFn: (data: { name: string; description?: string }) => groupsAPI.create({
      name: data.name,
      description: data.description || '',
      restrictions: 'none',
      color: newGroupColor || 'purple'
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      setShowAddModal(false)
      setNewGroupName('')
      setNewGroupDescription('')
      toast.success('Group created successfully!')
    },
    onError: (error: any) => {
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
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
      // Remove and invalidate all related queries to force fresh data
      queryClient.removeQueries({ queryKey: ['group', selectedGroup?.id, 'details'] })
      queryClient.removeQueries({ queryKey: ['group', selectedGroup?.id] })
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      queryClient.invalidateQueries({ queryKey: ['addons'] })
      
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

  const getGroupColorClass = (color: string) => {
    if (!color) return 'bg-gray-500'
    if (typeof color === 'string' && color.trim().startsWith('#')) return ''
    switch (color) {
      case 'blue': return 'bg-blue-500'
      case 'green': return 'bg-green-500'
      case 'purple': return 'bg-purple-500'
      case 'orange': return 'bg-orange-500'
      case 'red': return 'bg-red-500'
      case 'gray': return 'bg-gray-500'
      default: return 'bg-gray-500'
    }
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
              className="flex items-center justify-center px-3 py-2 sm:px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm sm:text-base"
            >
              <RotateCcw className={`w-4 h-4 sm:w-5 sm:h-5 mr-2 ${isSyncingAll ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isSyncingAll ? 'Syncing...' : 'Sync All Groups'}</span>
              <span className="sm:hidden">{isSyncingAll ? 'Syncing...' : 'Sync All'}</span>
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center justify-center px-3 py-2 sm:px-4 bg-stremio-purple text-white rounded-lg hover:bg-purple-700 transition-colors text-sm sm:text-base"
            >
              <Plus className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
              <span className="hidden sm:inline">Create Group</span>
              <span className="sm:hidden">Create</span>
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="flex flex-col sm:flex-row gap-4">
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
        </div>
      </div>

      {/* Groups Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredGroups.map((group) => (
          <div key={group.id} className={`rounded-lg shadow-sm border p-6 hover:shadow-md transition-shadow flex flex-col h-full ${
            isDark 
              ? 'bg-gray-800 border-gray-700' 
              : 'bg-white border-gray-200'
          } ${!group.isActive ? 'opacity-50' : ''}`}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center">
                <div
                  className={`w-12 h-12 rounded-lg flex items-center justify-center mr-3 text-white ${!group?.color ? 'bg-stremio-purple' : (typeof group.color === 'string' && group.color.trim().startsWith('#') ? '' : getGroupColorClass(group.color))}`}
                  style={typeof group?.color === 'string' && group.color.trim().startsWith('#') ? ({ backgroundColor: group.color } as React.CSSProperties) : undefined}
                >
                  <span className="text-white font-semibold text-lg">
                    {group.name ? group.name.charAt(0).toUpperCase() : 'G'}
                  </span>
                </div>
                <div>
                  <h3 className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{group.name}</h3>
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
                  <p className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{group.addons}</p>
                  <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Addons</p>
                </div>
              </div>
              <div className="flex items-center">
                <Users className="w-4 h-4 text-gray-400 mr-2" />
                <div>
                  <p className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{group.members}</p>
                  <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Members</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-auto">
              <button 
                onClick={() => handleViewGroupDetails(group)}
                className={`flex-1 flex items-center justify-center px-3 py-2 text-sm rounded-lg transition-colors ${
                  isDark 
                    ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Eye className="w-4 h-4 mr-1" />
                View
              </button>
              <button
                onClick={() => handleCloneGroup(group)}
                className="flex items-center justify-center px-3 py-2 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                title="Clone this group"
              >
                <Copy className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleGroupSync(group.id)}
                disabled={syncingGroups.has(group.id)}
                className="flex items-center justify-center px-3 py-2 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors disabled:opacity-50"
                title="Sync all users in this group"
              >
                <RotateCcw className={`w-4 h-4 ${syncingGroups.has(group.id) ? 'animate-spin' : ''}`} />
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
                className="flex items-center justify-center px-3 py-2 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {filteredGroups.length === 0 && (
        <div className="text-center py-12">
          <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className={`text-lg font-medium mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>No groups found</h3>
          <p className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Try adjusting your search or filter criteria</p>
        </div>
      )}

      {/* Add Group Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className={`rounded-lg max-w-md w-full p-6 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Create New Group</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className={`${isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}
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
                createGroupMutation.mutate({ name: newGroupName.trim(), description: newGroupDescription.trim() || undefined })
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
                  {[
                    { name: 'purple', className: 'bg-stremio-purple' },
                    { name: 'blue', className: 'bg-blue-500' },
                    { name: 'green', className: 'bg-green-500' },
                    { name: 'orange', className: 'bg-orange-500' },
                    { name: 'red', className: 'bg-red-500' },
                    { name: 'gray', className: 'bg-gray-500' },
                  ].map(opt => (
                    <button
                      key={opt.name}
                      type="button"
                      onClick={() => setNewGroupColor(opt.name)}
                      aria-pressed={newGroupColor === opt.name}
                      className={`relative w-8 h-8 rounded-full border-2 transition ${opt.className} ${newGroupColor === opt.name ? 'border-white ring-2 ring-offset-2 ring-stremio-purple' : 'border-gray-300'}`}
                      title={opt.name}
                    >
                      {newGroupColor === opt.name && (
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
                  onClick={() => setShowAddModal(false)}
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className={`rounded-lg max-w-lg w-full p-6 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Edit Group</h2>
              <button
                onClick={() => { setShowEditModal(false); setEditingGroupId(null) }}
                className={`${isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`w-full max-w-4xl max-h-[90vh] ${isDndActive ? 'overflow-hidden' : 'overflow-y-auto'} rounded-lg shadow-xl ${
            isDark ? 'bg-gray-800' : 'bg-white'
          }`}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex flex-col">
                  <div className="flex items-center gap-4">
                    <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      {selectedGroup.name}
                    </h2>
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
                  <div className="flex flex-wrap justify-center gap-3">
                    {selectedGroupDetails.users.map((member: any, index: number) => (
                      <div
                        key={member.id || index}
                        className={`relative p-3 rounded-lg border transition-all duration-200 hover:shadow-md ${
                          isDark 
                            ? 'bg-gray-600 border-gray-500 hover:bg-gray-500' 
                            : 'bg-white border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <button
                          onClick={() => {
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
                          className={`absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                            isDark 
                              ? 'bg-red-600 hover:bg-red-700 text-white' 
                              : 'bg-red-500 hover:bg-red-600 text-white'
                          }`}
                        >
                          ×
                        </button>
                        <div className="flex items-center">
                          <div
                            className={`w-12 h-12 rounded-full flex items-center justify-center text-white ${!selectedGroup?.color ? 'bg-stremio-purple' : (typeof selectedGroup.color === 'string' && selectedGroup.color.trim().startsWith('#') ? '' : getGroupColorClass(selectedGroup.color))}`}
                            style={typeof selectedGroup?.color === 'string' && selectedGroup.color.trim().startsWith('#') ? ({ backgroundColor: selectedGroup.color } as React.CSSProperties) : undefined}
                          >
                            <span className="text-white font-semibold text-lg">
                              {member.username ? member.username.charAt(0).toUpperCase() : 
                               member.email ? member.email.charAt(0).toUpperCase() : 'U'}
                            </span>
                          </div>
                          <h4 className={`font-medium text-sm ml-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                            {member.username || member.email || 'Unnamed User'}
                          </h4>
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
                        <SortableAddon id={murl} index={index}>
                        <div
                          key={`${murl}-${index}` || `addon-${index}`}
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
