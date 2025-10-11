'use client'

import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '@/contexts/ThemeContext'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usersAPI, groupsAPI, type User } from '@/services/api'
import api from '@/services/api'
import { useDebounce } from '../../hooks/useDebounce'
import { debug } from '../../utils/debug'
import PageHeader from '../common/PageHeader'
import EntityCard from '../common/EntityCard'
import { LoadingSkeleton, EmptyState, SyncBadge, AddonList, ConfirmDialog } from '../common'
import { Users, Puzzle, RefreshCw, Trash2, Grip, Eye, EyeOff, LockKeyhole, Unlock, X, Search, Plus, Square, CheckSquare, List } from 'lucide-react'
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { getColorBgClass, getColorOptions } from '@/utils/colorMapping'
import toast from 'react-hot-toast'

// Custom hooks for better organization
function useUserModals() {
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState<'card' | 'list'>(() => {
    if (typeof window !== 'undefined') {
      const raw = String(localStorage.getItem('global-view-mode') || 'card').toLowerCase().trim()
      return raw === 'list' ? 'list' : 'card'
    }
    return 'card'
  })
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedUser, setSelectedUser] = useState<any>(null)
  
  // Add user modal state
  const [stremioEmail, setStremioEmail] = useState('')
  const [stremioPassword, setStremioPassword] = useState('')
  const [stremioUsername, setStremioUsername] = useState('')
  const [authMode, setAuthMode] = useState<'email' | 'authkey'>('email')
  const [selectedGroup, setSelectedGroup] = useState('')
  const [newGroupName, setNewGroupName] = useState('')
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [stremioRegisterNew, setStremioRegisterNew] = useState(false)
  
  // Drag and drop state for Stremio addons
  const [isDndActive, setIsDndActive] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [stremioAddonOrder, setStremioAddonOrder] = useState<string[]>([])
  
  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [userToDelete, setUserToDelete] = useState<{ id: string; name: string } | null>(null)

  return {
    searchTerm,
    setSearchTerm,
    viewMode,
    setViewMode,
    selectedUsers,
    setSelectedUsers,
    showAddModal,
    setShowAddModal,
    showDetailModal,
    setShowDetailModal,
    selectedUser,
    setSelectedUser,
    // Add user modal
    stremioEmail,
    setStremioEmail,
    stremioPassword,
    setStremioPassword,
    stremioUsername,
    setStremioUsername,
    authMode,
    setAuthMode,
    selectedGroup,
    setSelectedGroup,
    newGroupName,
    setNewGroupName,
    showConnectModal,
    setShowConnectModal,
    stremioRegisterNew,
    setStremioRegisterNew,
    // Drag and drop
    isDndActive,
    setIsDndActive,
    activeId,
    setActiveId,
    stremioAddonOrder,
    setStremioAddonOrder,
    // Delete confirmation
    showDeleteConfirm,
    setShowDeleteConfirm,
    userToDelete,
    setUserToDelete
  }
}

function useUserData() {
  const { data: users = [], isLoading, error, isSuccess } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      debug.log('🔄 Fetching users from API...')
      const result = await usersAPI.getAll()
      debug.log('🔄 Users API result:', result)
      
      if (result && typeof result === 'object' && 'data' in result && Array.isArray((result as any).data)) {
        return (result as any).data
      }
      
      if (Array.isArray(result)) {
        return result
      }
      
      return []
    },
  })

  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: groupsAPI.getAll,
  })

  return { users, groups, isLoading, error, isSuccess }
}

function useUserDetails(selectedUser: any, showDetailModal: boolean, deleteStremioAddonMutation: any) {
  const queryClient = useQueryClient()
  // Fetch user details (without Stremio addons to avoid duplicate API calls)
  const { data: userDetailsData, isLoading: isLoadingDetails } = useQuery({
    queryKey: ['user', selectedUser?.id, 'basic'],
    queryFn: async () => {
      if (!selectedUser?.id) return null
      const response = await fetch(`/api/users/${selectedUser.id}?basic=true`)
      return response.json()
    },
    enabled: !!selectedUser?.id && showDetailModal
  })

  // Fetch live Stremio addons for the selected user
  const { data: stremioAddonsData, isLoading: isLoadingStremioAddons } = useQuery({
    queryKey: ['user', selectedUser?.id, 'stremio-addons'],
    queryFn: async () => {
      if (!selectedUser?.id) return null
      try {
        const response = await fetch(`/api/users/${selectedUser.id}/stremio-addons`)
        return response.json()
      } catch (error: any) {
        // If user is not connected to Stremio, return empty addons instead of throwing
        if (error.response?.status === 400) {
          return { addons: [] }
        }
        // If decryption fails (bad stremioAuthKey), return empty addons and mark for reconnection
        if (error.response?.status === 500 && error.response?.data?.message?.includes('decrypt')) {
          return { addons: [], needsReconnect: true }
        }
        throw error
      }
    },
    enabled: !!selectedUser?.id && !!selectedUser?.hasStremioConnection && showDetailModal,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchOnMount: false, // Don't refetch on mount if we have cached data
    refetchOnWindowFocus: false
  })

  // Per-user excluded group addons (addon ID) — now from database
  const [userExcludedSet, setUserExcludedSet] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (userDetailsData?.excludedAddons) {
      setUserExcludedSet(new Set(userDetailsData.excludedAddons))
    } else {
      setUserExcludedSet(new Set())
    }
  }, [userDetailsData?.excludedAddons])

  // User-defined protected addons, persisted per user (by manifestUrl) — now from database
  const [userProtectedSet, setUserProtectedSet] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (userDetailsData?.protectedAddons) {
      setUserProtectedSet(new Set(userDetailsData.protectedAddons))
    } else {
      setUserProtectedSet(new Set())
    }
  }, [userDetailsData?.protectedAddons])

  const toggleUserExcluded = async (addonId?: string) => {
    const uid = selectedUser?.id
    if (!uid || !addonId) return
    
    setUserExcludedSet((prev) => {
      const next = new Set(prev)
      const key = addonId
      if (next.has(key)) next.delete(key)
      else next.add(key)
      
      // Update database using dedicated endpoint
      api.put(`/users/${uid}/excluded-addons`, { excludedAddons: Array.from(next) })
        .then(() => {
          // Invalidate queries to update UI
          queryClient.invalidateQueries({ queryKey: ['user', uid] })
          queryClient.invalidateQueries({ queryKey: ['user', uid, 'stremio-addons'] })
        })
        .catch(error => console.error('Failed to update excluded addons:', error))
      
      return next
    })
  }

  const toggleUserProtected = (manifestUrl?: string) => {
    if (!manifestUrl) return
    const uid = selectedUser?.id
    if (!uid) return
    
    setUserProtectedSet((prev) => {
      const next = new Set(prev)
      const key = manifestUrl
      if (next.has(key)) next.delete(key)
      else next.add(key)
      
      // Update database using dedicated endpoint
      api.put(`/users/${uid}/protected-addons`, { protectedAddons: Array.from(next) })
        .then(() => {
          // Invalidate queries to update UI
        queryClient.invalidateQueries({ queryKey: ['user', uid] })
        queryClient.invalidateQueries({ queryKey: ['user', uid, 'stremio-addons'] })
        })
        .catch(error => console.error('Failed to update protected addons:', error))
      
      return next
    })
  }

  const handleDeleteStremioAddon = async (manifestUrl: string, addonName: string) => {
    if (!selectedUser?.id) return
    
    try {
      await deleteStremioAddonMutation.mutateAsync({ 
        userId: selectedUser.id, 
        addonId: manifestUrl 
      })
    } catch (error) {
      console.error('Failed to delete Stremio addon:', error)
      // Error is already handled by the mutation
    }
  }

  return { 
    userDetailsData, 
    stremioAddonsData, 
    isLoadingDetails, 
    isLoadingStremioAddons,
    userExcludedSet,
    userProtectedSet,
    toggleUserExcluded,
    toggleUserProtected,
    handleDeleteStremioAddon
  }
}

function useUserMutations() {
  const queryClient = useQueryClient()

  const createUserMutation = useMutation({
    mutationFn: usersAPI.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('User created successfully')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to create user')
    }
  })

  const updateUserMutation = useMutation({
    mutationFn: ({ id, userData }: { id: string; userData: any }) => 
      usersAPI.update(id, userData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('User updated successfully')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to update user')
    }
  })

  const deleteUserMutation = useMutation({
    mutationFn: usersAPI.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('User deleted successfully')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to delete user')
    }
  })

  const syncUserMutation = useMutation({
    mutationFn: (userId: string) => usersAPI.sync(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('User synced successfully')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to sync user')
    }
  })

  const toggleUserStatusMutation = useMutation({
    mutationFn: async ({ id, isActive, userName }: { id: string; isActive: boolean; userName: string }) => {
      console.log('🔄 User mutation called:', { id, isActive, willSend: !isActive, userName })
      const response = await api.patch(`/users/${id}/toggle-status`, { isActive: !isActive })
      console.log('✅ User mutation success:', response.data)
      return response.data
    },
    onSuccess: (data, variables) => {
      console.log('✅ User mutation onSuccess called')
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success(`${variables.userName} ${!variables.isActive ? 'enabled' : 'disabled'}`)
    },
    onError: (error: any) => {
      console.error('❌ User mutation error:', error)
      toast.error(error?.response?.data?.message || 'Failed to update user status')
    },
  })

  const bulkSyncMutation = useMutation({
    mutationFn: async (userIds: string[]) => {
      // Simulate bulk sync by syncing each user individually
      for (const userId of userIds) {
        await usersAPI.sync(userId)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('Users synced successfully')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to sync users')
    }
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: async (userIds: string[]) => {
      // Simulate bulk delete by deleting each user individually
      for (const userId of userIds) {
        await usersAPI.delete(userId)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('Users deleted successfully')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to delete users')
    }
  })

  // Wipe user addons mutation
  const wipeUserAddonsMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await api.post(`/users/${userId}/stremio-addons/clear`)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['user'] })
      toast.success('All addons cleared from Stremio account')
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to clear addons')
    }
  })

  // Delete Stremio addon mutation
  const deleteStremioAddonMutation = useMutation({
    mutationFn: async ({ userId, addonId }: { userId: string; addonId: string }) => {
      const encodedAddonId = encodeURIComponent(addonId)
      const response = await api.delete(`/users/${userId}/stremio-addons/${encodedAddonId}`)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['user'] })
      toast.success('Addon deleted successfully')
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to delete addon')
    }
  })

  // Reorder Stremio addons mutation
  const reorderStremioAddonsMutation = useMutation({
    mutationFn: async ({ userId, orderedManifestUrls }: { userId: string; orderedManifestUrls: string[] }) => {
      const response = await api.post(`/users/${userId}/stremio-addons/reorder`, { orderedManifestUrls })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['user'] })
      toast.success('Addon order updated')
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to reorder addons')
    }
  })

  return {
    createUserMutation,
    updateUserMutation,
    deleteUserMutation,
    syncUserMutation,
    bulkSyncMutation,
    bulkDeleteMutation,
    toggleUserStatusMutation,
    wipeUserAddonsMutation,
    deleteStremioAddonMutation,
    reorderStremioAddonsMutation
  }
}

export default function UsersPageRefactored() {
  const theme = useTheme()
  const { isDark, isModern, isModernDark, isMono } = theme
  const queryClient = useQueryClient()
  const [mounted, setMounted] = useState(false)
  
  useEffect(() => { setMounted(true) }, [])
  

  // Custom hooks
  const {
    searchTerm,
    setSearchTerm,
    viewMode,
    setViewMode,
    selectedUsers,
    setSelectedUsers,
    showAddModal,
    setShowAddModal,
    showDetailModal,
    setShowDetailModal,
    selectedUser,
    setSelectedUser,
    // Add user modal
    stremioEmail,
    setStremioEmail,
    stremioPassword,
    setStremioPassword,
    stremioUsername,
    setStremioUsername,
    authMode,
    setAuthMode,
    selectedGroup,
    setSelectedGroup,
    newGroupName,
    setNewGroupName,
    showConnectModal,
    setShowConnectModal,
    stremioRegisterNew,
    setStremioRegisterNew,
    // Drag and drop
    isDndActive,
    setIsDndActive,
    activeId,
    setActiveId,
    stremioAddonOrder,
    setStremioAddonOrder,
    // Delete confirmation
    showDeleteConfirm,
    setShowDeleteConfirm,
    userToDelete,
    setUserToDelete
  } = useUserModals()

  const { users, groups, isLoading, error, isSuccess } = useUserData()
  const {
    createUserMutation,
    updateUserMutation,
    deleteUserMutation,
    syncUserMutation,
    bulkSyncMutation,
    bulkDeleteMutation,
    toggleUserStatusMutation,
    wipeUserAddonsMutation,
    deleteStremioAddonMutation,
    reorderStremioAddonsMutation
  } = useUserMutations()
  const { 
    userDetailsData, 
    stremioAddonsData, 
    isLoadingDetails, 
    isLoadingStremioAddons,
    userExcludedSet,
    userProtectedSet,
    toggleUserExcluded,
    toggleUserProtected,
    handleDeleteStremioAddon
  } = useUserDetails(selectedUser, showDetailModal, deleteStremioAddonMutation)

  // Escape key handling for modals
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showConnectModal) {
          setShowConnectModal(false)
        } else if (showDetailModal) {
          setShowDetailModal(false)
        }
      }
    }
    
    if (showConnectModal || showDetailModal) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [showConnectModal, showDetailModal])

  // Add modal-open class to body when modals are open
  useEffect(() => {
    if (showConnectModal || showDetailModal || showDeleteConfirm) {
      document.body.classList.add('modal-open')
    } else {
      document.body.classList.remove('modal-open')
    }
    
    // Cleanup on unmount
    return () => {
      document.body.classList.remove('modal-open')
    }
  }, [showConnectModal, showDetailModal, showDeleteConfirm])

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 6,
      },
    })
  )

  // Drag and drop handlers
  const handleDragStartDnd = (event: any) => {
    const { active } = event
    setActiveId(active.id)
    setIsDndActive(true)
  }

  const handleDragCancelDnd = () => {
    setActiveId(null)
    setIsDndActive(false)
  }

  const handleDragEndDnd = (event: any) => {
    const { active, over } = event
    
    if (active.id !== over?.id && selectedUser?.id) {
      const oldIndex = stremioAddonOrder.indexOf(active.id)
      const newIndex = stremioAddonOrder.indexOf(over.id)
      
      const newOrder = [...stremioAddonOrder]
      newOrder.splice(oldIndex, 1)
      newOrder.splice(newIndex, 0, active.id)
      
      setStremioAddonOrder(newOrder)
      
      // Call the reorder mutation
      reorderStremioAddonsMutation.mutate({
          userId: selectedUser.id, 
        orderedManifestUrls: newOrder
      })
    }
    
    setActiveId(null)
    setIsDndActive(false)
  }

  // Helper function to map addon to ID for ordering
  const mapIdForStremioAddon = (addon: any) => (addon.manifestUrl || addon.transportUrl || addon.url || addon.id || '').toString().trim()

  // Order Stremio addons based on the current order
  const orderStremioAddons = useCallback((addons: any[]) => {
    if (!Array.isArray(addons) || addons.length === 0) return []
    
    const pos = new Map(stremioAddonOrder.map((id, i) => [id, i]))
    const uniq: any[] = []
    const seen = new Set()
    
    for (const addon of addons) {
      const key = mapIdForStremioAddon(addon)
      if (!seen.has(key)) { 
        seen.add(key)
        uniq.push(addon)
      }
    }
    
    return uniq.sort((a, b) => (pos.get(mapIdForStremioAddon(a)) ?? 1e9) - (pos.get(mapIdForStremioAddon(b)) ?? 1e9))
  }, [stremioAddonOrder])

  // Initialize Stremio addon order when data changes
  useEffect(() => {
    if (stremioAddonsData?.addons && stremioAddonsData.addons.length > 0) {
      const addonIds = stremioAddonsData.addons.map((addon: any) => mapIdForStremioAddon(addon))
      console.log('Initializing Stremio addon order:', addonIds)
      console.log('Stremio addons data:', stremioAddonsData.addons)
      setStremioAddonOrder(addonIds)
    } else {
      console.log('No Stremio addons data or empty array')
    }
  }, [stremioAddonsData])

  // Sortable Stremio addon component
  const SortableStremioAddon: React.FC<{ id: string; index: number; children: React.ReactNode }> = ({ id, index, children }) => {
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

  const debouncedSearchTerm = useDebounce(searchTerm, 300)

  // Filter users based on search term
  const displayUsers = useMemo(() => {
    if (!Array.isArray(users)) return []
    
    const filtered = users.filter((user: any) => {
      const searchLower = debouncedSearchTerm.toLowerCase()
      return (
        user.username?.toLowerCase().includes(searchLower) ||
        user.email?.toLowerCase().includes(searchLower) ||
        user.stremioUsername?.toLowerCase().includes(searchLower) ||
        user.stremioEmail?.toLowerCase().includes(searchLower)
      )
    })
    
    return filtered
  }, [users, debouncedSearchTerm])

  // Selection handlers
  const handleSelectAll = () => {
    setSelectedUsers(displayUsers.map((user: any) => user.id))
  }

  const handleDeselectAll = () => {
    setSelectedUsers([])
  }

  const handleUserToggle = (userId: string) => {
    setSelectedUsers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    )
  }

  const handleToggleUserStatus = (userId: string, currentStatus: boolean) => {
    try {
      console.log('🔄 Toggle user status called:', { userId, currentStatus })
      const user = users?.find((u: any) => u.id === userId)
      const userName = user?.username || user?.email || 'User'
      console.log('🔄 Calling mutation with:', { id: userId, isActive: currentStatus, userName })
      toggleUserStatusMutation.mutate({ id: userId, isActive: currentStatus, userName })
      console.log('🔄 Mutation called successfully')
    } catch (error) {
      console.error('❌ Error in handleToggleUserStatus:', error)
    }
  }

  // User actions
  const handleAddUser = () => {
    setShowConnectModal(true)
  }


  const handleViewUser = (user: any) => {
    setSelectedUser(user)
    setShowDetailModal(true)
  }

  const handleDeleteUser = (userId: string) => {
    const user = users?.find((u: any) => u.id === userId)
    const userName = user?.username || user?.email || 'User'
    setUserToDelete({ id: userId, name: userName })
    setShowDeleteConfirm(true)
  }

  const confirmDeleteUser = () => {
    if (userToDelete) {
      deleteUserMutation.mutate(userToDelete.id)
      setShowDeleteConfirm(false)
      setUserToDelete(null)
    }
  }

  const cancelDeleteUser = () => {
    setShowDeleteConfirm(false)
    setUserToDelete(null)
  }

  const handleSyncUser = (userId: string) => {
    syncUserMutation.mutate(userId)
  }

  const handleImportUser = (userId: string) => {
    // TODO: Implement user import functionality
    toast('Import functionality coming soon', { icon: 'ℹ️' })
  }

  const handleReloadUser = (userId: string) => {
    // Use the existing reloadUserAddons API method
    usersAPI.reloadUserAddons(userId)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['users'] })
        toast.success('User addons reloaded successfully')
      })
      .catch((error: any) => {
        toast.error(error?.message || 'Failed to reload user addons')
      })
  }

  const handleBulkSync = () => {
    if (selectedUsers.length > 0) {
      bulkSyncMutation.mutate(selectedUsers)
    }
  }

  const handleBulkDelete = () => {
    if (selectedUsers.length > 0) {
      bulkDeleteMutation.mutate(selectedUsers)
    }
  }

  // View mode change
  const handleViewModeChange = (mode: 'card' | 'list') => {
    setViewMode(mode)
      localStorage.setItem('global-view-mode', mode)
  }

  // Modal handlers
  const handleSaveUser = (userData: any) => {
    createUserMutation.mutate(userData)
    setShowAddModal(false)
  }

  const handleConnectStremio = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!stremioUsername.trim() || !stremioPassword.trim()) {
      toast.error('Please fill in all required fields')
      return
    }

    try {
      const userData = {
        username: stremioUsername.trim(),
        email: authMode === 'email' ? stremioEmail.trim() : stremioUsername.trim() + '@stremio.local'
      }

      await createUserMutation.mutateAsync(userData)
      
      // Reset form
      setStremioEmail('')
      setStremioPassword('')
      setStremioUsername('')
      setSelectedGroup('')
      setNewGroupName('')
      setShowConnectModal(false)
      
      toast.success('User added successfully!')
    } catch (error) {
      console.error('Error adding user:', error)
      toast.error('Failed to add user')
    }
  }

  const handleCloseModals = () => {
    setShowAddModal(false)
    setShowDetailModal(false)
    setSelectedUser(null)
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
          title="Failed to load users"
          description="There was an error loading the users. Please try again."
            />
          </div>
    )
  }

  // Empty state
  if (!isLoading && Array.isArray(users) && users.length === 0) {
  return (
    <div className="p-4 sm:p-6">
        <EmptyState
          icon="👥"
          title="No users yet"
          description="Add your first user to get started."
          action={{
            label: 'Add User',
            onClick: handleAddUser
          }}
        />
              </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Users"
        description="Manage Stremio users for your group"
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search users..."
        selectedCount={selectedUsers.length}
        onSelectAll={handleSelectAll}
        onDeselectAll={handleDeselectAll}
        onAdd={handleAddUser}
        onReload={handleBulkSync}
        onDelete={handleBulkDelete}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        isReloading={bulkSyncMutation.isPending}
        isReloadDisabled={selectedUsers.length === 0}
        isDeleteDisabled={selectedUsers.length === 0}
        mounted={mounted}
      />

      {/* Content */}
          {viewMode === 'card' ? (
            /* Card Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
          {displayUsers.map((user: any) => (
            <EntityCard
              key={user.id}
              variant="user"
              entity={{
                ...user,
                isActive: user.isActive
              }}
              isSelected={selectedUsers.includes(user.id)}
              onSelect={handleUserToggle}
              onToggle={handleToggleUserStatus}
              onDelete={handleDeleteUser}
              onView={handleViewUser}
              onSync={handleSyncUser}
              onImport={handleImportUser}
              onReload={handleReloadUser}
              userExcludedSet={new Set()}
              userProtectedSet={new Set()}
              isSyncing={syncUserMutation.isPending}
            />
          ))}
        </div>
          ) : (
            /* List View */
        <div className="space-y-2">
              {displayUsers.map((user: any) => (
            <EntityCard
                  key={user.id}
              variant="user"
              entity={{
                ...user,
                isActive: user.isActive
              }}
              isSelected={selectedUsers.includes(user.id)}
              onSelect={handleUserToggle}
              onToggle={handleToggleUserStatus}
              onDelete={handleDeleteUser}
              onView={handleViewUser}
              onSync={handleSyncUser}
              onImport={handleImportUser}
              onReload={handleReloadUser}
              userExcludedSet={new Set()}
              userProtectedSet={new Set()}
              isSyncing={syncUserMutation.isPending}
                            isListMode={true}
            />
          ))}
        </div>
      )}

      {/* Add User Modal - Original Complex Implementation */}
      {showConnectModal && mounted && typeof window !== 'undefined' && createPortal(
        <div 
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-[1000]"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowConnectModal(false)
            }
          }}
        >
          <div className={`w-full max-w-md rounded-lg shadow-lg ${
            isDark ? 'bg-gray-800' : 'bg-white'
          }`}>
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Add New User
                </h3>
              <button
                onClick={() => {
                  setShowConnectModal(false)
                  setStremioEmail('')
                  setStremioPassword('')
                  setStremioUsername('')
                  setSelectedGroup('')
                  setNewGroupName('')
                }}
                className={`w-8 h-8 flex items-center justify-center rounded transition-colors border-0 focus:outline-none ring-0 focus:ring-0 ${
                  isMono ? 'text-white hover:text-white/80 hover:bg-white/10' : (isDark ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100')
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleConnectStremio} className="p-6 space-y-4">
              {/* Auth method toggle */}
              <div className="w-full mb-2 flex justify-center">
                <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
                  <button
                    type="button"
                    onClick={() => setAuthMode('email')}
                    className={`w-full py-2 text-sm font-medium rounded-md border ${authMode==='email' ? 'accent-bg accent-text accent-border' : (isDark ? 'text-gray-300 border-gray-600' : 'text-gray-700 border-gray-300')}`}
                  >
                    Email & Password
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthMode('authkey')}
                    className={`w-full py-2 text-sm font-medium rounded-md border ${authMode==='authkey' ? 'accent-bg accent-text accent-border' : (isDark ? 'text-gray-300 border-gray-600' : 'text-gray-700 border-gray-300')}`}
                  >
                    Auth Key
                  </button>
                </div>
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Username *
                </label>
                <input
                  type="text"
                  value={stremioUsername}
                  onChange={(e) => setStremioUsername(e.target.value)}
                  placeholder="Enter username"
                  required
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-stremio-purple focus:border-transparent ${
                    isDark 
                      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                  }`}
                />
              </div>
              {authMode === 'email' ? (
                <>
              <div>
                <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Stremio Email *
                </label>
                <input
                  type="email"
                  value={stremioEmail}
                  onChange={(e) => setStremioEmail(e.target.value)}
                  placeholder="your@stremio-email.com"
                  required
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-stremio-purple focus:border-transparent ${
                    isDark 
                      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                  }`}
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Stremio Password *
                </label>
                <input
                  type="password"
                  value={stremioPassword}
                  onChange={(e) => setStremioPassword(e.target.value)}
                  placeholder="Enter your Stremio password"
                  required
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-stremio-purple focus:border-transparent ${
                    isDark 
                      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                  }`}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="stremio-register-new"
                  type="checkbox"
                  checked={stremioRegisterNew}
                  onChange={(e) => setStremioRegisterNew(e.target.checked)}
                  className={`h-4 w-4 rounded border ${isDark ? 'border-gray-600 bg-gray-700' : 'border-gray-300'} accent-text focus:ring-0`}
                />
                <label htmlFor="stremio-register-new" className={`${isDark ? 'text-gray-300' : 'text-gray-700'} text-sm`}>
                  Register new Stremio account with these credentials
                </label>
              </div>
                </>
              ) : (
                <div>
                  <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    Stremio Auth Key *
                  </label>
                  <input
                    type="text"
                    value={stremioPassword}
                    onChange={(e) => setStremioPassword(e.target.value)}
                    placeholder="Enter your Stremio auth key"
                    required
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-stremio-purple focus:border-transparent ${
                      isDark 
                        ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                    }`}
                  />
                </div>
              )}
                  <div>
                    <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Assign to group (optional)
                    </label>
                <div className="space-y-2">
                    <select
                      value={selectedGroup}
                      onChange={(e) => setSelectedGroup(e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-stremio-purple focus:border-transparent ${
                        isDark 
                          ? 'bg-gray-700 border-gray-600 text-white' 
                          : 'bg-white border-gray-300 text-gray-900'
                      }`}
                    >
                    <option value="">Select a group (optional)</option>
                    {groups?.map((group: any) => (
                      <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                  <div className="text-center text-sm text-gray-500">or</div>
                      <input
                        type="text"
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="Create new group"
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-stremio-purple focus:border-transparent ${
                          isDark 
                            ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                            : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                        }`}
                      />
                    </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowConnectModal(false)
                    setStremioEmail('')
                    setStremioPassword('')
                    setStremioUsername('')
                    setSelectedGroup('')
                    setNewGroupName('')
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
                  disabled={createUserMutation.isPending}
                  className="flex-1 px-4 py-2 accent-bg accent-text rounded-lg transition-colors disabled:opacity-50"
                >
                  {createUserMutation.isPending ? (stremioRegisterNew ? 'Registering...' : 'Adding...') : (stremioRegisterNew ? 'Register & Connect' : 'Add User')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* User Detail Modal - Using original complex modal */}
      {showDetailModal && selectedUser && mounted && typeof window !== 'undefined' && createPortal(
        <div 
          className="fixed top-0 left-0 right-0 bottom-0 bg-black bg-opacity-75 flex items-center justify-center z-[1000] p-4 modal-root"
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
                          {selectedUser.username || selectedUser.email}
                  </h2>
                      <SyncBadge 
                        userId={selectedUser.id} 
                        onSync={handleSyncUser}
                        isSyncing={syncUserMutation.isPending}
                      />
                </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Users className={`w-4 h-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
                          <span className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                          {selectedUser.groupName || 'No group'}
                          </span>
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
                  <p className={`text-sm mt-1 px-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    {selectedUser.email}
                  </p>
                </div>
              </div>

              {/* User's Addons Section */}
              {isLoadingDetails ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 accent-border"></div>
                </div>
              ) : userDetailsData ? (
                <div className="space-y-6">
                  {/* Group Addons (from user's group) */}
                  <AddonList
                    addons={userDetailsData?.addons?.filter((addon: any) => addon.isEnabled !== false) || []}
                    title={`${userDetailsData?.groupName || 'No Group'} Addons`}
                    count={userDetailsData?.addons?.filter((addon: any) => addon.isEnabled !== false).length || 0}
                    emptyMessage="No addons in this group"
                    type="group"
                    onExclude={toggleUserExcluded}
                    excludedAddons={userExcludedSet}
                  />

                  {/* Stremio Account Addons - Draggable */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                            <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        Stremio Account Addons ({stremioAddonsData?.addons?.length || 0})
                            </h3>
                            <button
                              onClick={() => wipeUserAddonsMutation.mutate(selectedUser.id)}
                              disabled={wipeUserAddonsMutation.isPending}
                              className={`flex items-center justify-center w-[84px] h-8 min-h-8 max-h-8 text-sm rounded-lg transition-colors border disabled:opacity-50 ${
                                isMono
                                  ? 'bg-black border-white/20 text-white hover:bg-white/10'
                                  : (isDark
                                      ? 'bg-gray-600 border-gray-500 text-white hover:bg-gray-500'
                                      : 'bg-white border-gray-200 text-gray-900 hover:bg-gray-50')
                              }`}
                              title="Clear all addons from user's Stremio account"
                            >
                              {wipeUserAddonsMutation.isPending ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                              ) : (
                                'Clear'
                              )}
                            </button>
                          </div>
                    
                    {isLoadingStremioAddons ? (
                      <div className="text-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                        <p className={`text-sm mt-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                          Loading Stremio addons...
                        </p>
                      </div>
                    ) : stremioAddonsData?.addons && stremioAddonsData.addons.length > 0 ? (
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragStart={handleDragStartDnd}
                        onDragCancel={handleDragCancelDnd}
                        onDragEnd={handleDragEndDnd}
                        modifiers={[restrictToVerticalAxis]}
                      >
                        <SortableContext
                          items={stremioAddonOrder}
                          strategy={verticalListSortingStrategy}
                        >
                            <div className="space-y-2">
                            {orderStremioAddons(stremioAddonsData.addons).map((addon: any, index: number) => {
                              const addonId = mapIdForStremioAddon(addon)
                              const isDragged = isDndActive && activeId === addonId
                              const isActive = activeId === addonId
                              const isProtected = userProtectedSet.has(addon.manifestUrl || addon.transportUrl || addon.url || addon.id)
                              
                              // Use the same fallback logic as the original implementation
                              const iconUrl = addon.iconUrl || addon?.manifest?.logo
                              const addonName = addon.name || addon?.manifest?.name || addon.id || 'Unnamed Addon'
                                
                                return (
                                <SortableStremioAddon key={`${addonId}-${index}`} id={addonId} index={index}>
                                  <div
                                    className={`relative p-3 pl-8 rounded-lg border transition-all duration-200 select-none touch-none ${
                                      isDark ? 'bg-gray-600 border-gray-500' : 'bg-white border-gray-200'
                                    } ${isDragged ? (isDark ? 'ring-2 ring-blue-500 opacity-50' : 'ring-2 ring-blue-400 opacity-50') : ''} ${isActive && isDndActive ? 'opacity-0' : ''}`}
                                    title="Drag to reorder"
                                  >
                                    {/* Drag handle */}
                                    <div
                                      className="absolute inset-y-0 left-0 w-6 flex items-center justify-center cursor-grab active:cursor-grabbing hover:bg-gray-100 dark:hover:bg-gray-700 rounded-l-lg transition-colors border-r border-gray-200 dark:border-gray-600"
                                      title="Drag to reorder"
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
                                              {iconUrl ? (
                                                <img
                                                  src={iconUrl}
                                                  alt={`${addonName} logo`}
                                                    className="w-full h-full object-contain"
                                                    onError={(e: any) => { e.currentTarget.style.display = 'none' }}
                                                  />
                                                ) : null}
                                              <div className={`w-full h-full ${iconUrl ? 'hidden' : 'flex'} bg-stremio-purple text-white items-center justify-center border-0`}>
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
                                                  {addonName}
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
                                        <div className="flex items-center gap-2">
                                          {/* Protect button */}
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              e.preventDefault()
                                              if (addon.manifestUrl) {
                                                toggleUserProtected(addon.manifestUrl)
                                              }
                                            }}
                                            className={`flex items-center justify-center h-8 w-8 text-sm rounded transition-colors focus:outline-none ${
                                              isProtected 
                                                ? (isDark ? 'text-yellow-400' : 'text-yellow-600')
                                                : (isDark ? 'text-gray-300 hover:text-yellow-400' : 'text-gray-600 hover:text-yellow-600')
                                            }`}
                                            title={isProtected ? 'Unprotect addon' : 'Protect addon'}
                                          >
                                            {isProtected ? <LockKeyhole className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                                          </button>
                                          
                                          {/* Delete button */}
                                        <button
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              e.preventDefault()
                                              if (addon.manifestUrl && addon.name) {
                                                handleDeleteStremioAddon(addon.manifestUrl, addon.name)
                                              }
                                            }}
                                              className={`flex items-center justify-center h-8 w-8 text-sm rounded transition-colors focus:outline-none ${
                                              isDark ? 'text-gray-300 hover:text-red-400' : 'text-gray-600 hover:text-red-600'
                                            }`}
                                            title="Delete addon"
                                            >
                                              <Trash2 className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </SortableStremioAddon>
                                )
                              })}
                            </div>
                              </SortableContext>
                              <DragOverlay dropAnimation={null}>
                                {activeId ? (() => {
                            const list = orderStremioAddons(stremioAddonsData.addons)
                            const activeAddon = list.find((a: any) => mapIdForStremioAddon(a) === activeId)
                            
                            if (!activeAddon) return null
                            
                            // Use the same fallback logic as the original implementation
                            const activeIconUrl = activeAddon.iconUrl || activeAddon?.manifest?.logo
                            const activeAddonName = activeAddon.name || activeAddon?.manifest?.name || activeAddon.id || 'Unnamed Addon'
                            
                                  return (
                                    <div className={`p-3 pl-8 rounded-lg border ${isDark ? 'bg-gray-600 border-gray-500' : 'bg-white border-gray-200'} shadow-xl`}> 
                                      <div className="flex items-center justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center flex-1 min-w-0">
                                      <div className="w-12 h-12 rounded-full flex items-center justify-center mr-3 flex-shrink-0 overflow-hidden border-0">
                                        {activeIconUrl ? (
                                                <img
                                            src={activeIconUrl}
                                            alt={`${activeAddonName} logo`}
                                                  className="w-full h-full object-contain"
                                                  onError={(e: any) => { e.currentTarget.style.display = 'none' }}
                                                />
                                              ) : null}
                                        <div className={`w-full h-full ${activeIconUrl ? 'hidden' : 'flex'} bg-stremio-purple text-white items-center justify-center border-0`}>
                                                <Puzzle className="w-5 h-5 text-white" />
                                              </div>
                                            </div>
                                            <div className="min-w-0 flex-1">
                                        <div className="flex flex-col min-[480px]:flex-row min-[480px]:items-center min-[480px]:gap-2">
                                                <h4 className={`font-medium truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                            {activeAddonName}
                                                </h4>
                                          {activeAddon.version && (
                                            <div className={`px-2 py-1 rounded text-xs font-medium mt-1 min-[480px]:mt-0 ${
                                              isDark ? 'bg-gray-500 text-gray-200' : 'bg-gray-200 text-gray-700'
                                                  }`}>
                                                    v{activeAddon.version}
                                            </div>
                                                )}
                                              </div>
                                        {activeAddon.description && (
                                          <p className={`hidden sm:block text-sm mt-1 truncate ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                                                  {activeAddon.description}
                                                </p>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )
                                })() : null}
                              </DragOverlay>
                            </DndContext>
                          ) : (
                      <div className="text-center py-8">
                        <Puzzle className={`w-12 h-12 mx-auto mb-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
                        <p className={`${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                          {stremioAddonsData?.needsReconnect ? 'Reconnection required' : 'No addons in Stremio account'}
                                    </p>
                                  </div>
                              )}
                            </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Failed to load user details.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete User"
        description={`Are you sure you want to delete "${userToDelete?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        isDanger={true}
        onConfirm={confirmDeleteUser}
        onCancel={cancelDeleteUser}
      />
    </div>
  )
}
