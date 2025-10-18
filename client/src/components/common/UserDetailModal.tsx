import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '@/contexts/ThemeContext'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usersAPI, groupsAPI } from '@/services/api'
import { getColorBgClass, getColorHexValue } from '@/utils/colorMapping'
import toast from 'react-hot-toast'
import { VersionChip, EntityList, SyncBadge, InlineEdit, ColorPicker } from './'
import AddonIcon from './AddonIcon'
import { useSyncStatusRefresh } from '@/hooks/useSyncStatusRefresh'
import { Puzzle, X, Eye, EyeOff, LockKeyhole, Unlock, Bug, Copy } from 'lucide-react'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { restrictToParentElement } from '@dnd-kit/modifiers'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface UserDetailModalProps {
  isOpen: boolean
  onClose: () => void
  user: {
    id: string
    username?: string
    email?: string
    stremioUsername?: string
    stremioEmail?: string
    groupName?: string
    groups?: Array<{ id: string; name: string; colorIndex?: number }>
    isActive: boolean
    colorIndex?: number
  } | null
  onUpdate: (userData: any) => void
  onSync: (userId: string) => void
  userExcludedSet: Set<string>
  userProtectedSet: Set<string>
  isSyncing: boolean
}

export default function UserDetailModal({
  isOpen,
  onClose,
  user,
  onUpdate,
  onSync,
  userExcludedSet,
  userProtectedSet,
  isSyncing
}: UserDetailModalProps) {
  const theme = useTheme()
  const { isDark, isModern, isModernDark, isMono, hideSensitive } = theme as any
  const queryClient = useQueryClient()
  const [mounted, setMounted] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const logoRef = useRef<HTMLDivElement>(null)
  const { refreshAllSyncStatus } = useSyncStatusRefresh()
  // Reflect Settings "Delete mode" (safe/unsafe)
  const [isUnsafeMode, setIsUnsafeMode] = useState(false)

  // Fetch user data using query to ensure it stays updated
  const { data: userData, isLoading: isLoadingUser } = useQuery({
    queryKey: ['user', user?.id, 'details'],
    queryFn: () => usersAPI.getById(user!.id),
    enabled: !!user?.id && isOpen,
    initialData: user // Use prop as initial data
  })

  // Use the query data instead of the prop
  const currentUser = userData || user
  
  // Local state for excluded and protected addons to ensure proper reactivity
  const [localExcludedSet, setLocalExcludedSet] = useState<Set<string>>(new Set())
  const [localProtectedSet, setLocalProtectedSet] = useState<Set<string>>(new Set())
  
  // Drag and drop state for Stremio addons
  const [stremioAddons, setStremioAddons] = useState<any[]>([])
  
  // Debug modal state
  const [showCurrentModal, setShowCurrentModal] = useState(false)
  const [showDesiredModal, setShowDesiredModal] = useState(false)
  const [currentAddonsData, setCurrentAddonsData] = useState<any[]>([])
  const [desiredAddonsData, setDesiredAddonsData] = useState<any[]>([])

  // Initialize local state when opening the modal or switching user
  useEffect(() => {
    if (user && isOpen) {
      const excludedArray = Array.isArray(userExcludedSet) ? userExcludedSet : Array.from(userExcludedSet)
      const protectedArray = Array.isArray(userProtectedSet) ? userProtectedSet : Array.from(userProtectedSet)
      setLocalExcludedSet(new Set(excludedArray))
      setLocalProtectedSet(new Set(protectedArray))
    }
  }, [isOpen, user?.id])

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  useEffect(() => {
    setMounted(true)
  }, [])

  // Read delete mode from localStorage (set in SettingsPage)
  useEffect(() => {
    try {
      const mode = localStorage.getItem('sfm_delete_mode')
      setIsUnsafeMode(mode === 'unsafe')
    } catch {}
  }, [isOpen])

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Fetch user details
  const { data: userDetails, isLoading: isLoadingUserDetails } = useQuery({
    queryKey: ['user', user?.id, 'details'],
    queryFn: () => usersAPI.getById(user!.id),
    enabled: !!user?.id,
  })


  // Fetch Stremio addons
  const { data: stremioAddonsData } = useQuery({
    queryKey: ['user', user?.id, 'stremio-addons'],
    queryFn: () => usersAPI.getStremioAddons(user!.id),
    enabled: !!user?.id,
  })


  // Debug mode check
  const isDebugMode = process.env.NEXT_PUBLIC_DEBUG === 'true' || process.env.NEXT_PUBLIC_DEBUG === '1'

  // Debug function to show raw Stremio addons
  const handleDebugStremioAddons = () => {
    // Use the raw API data instead of the local state
    setCurrentAddonsData(stremioAddonsData || [])
    setShowCurrentModal(true)
  }

  // Debug function to show desired addons
  const handleDebugDesiredAddons = () => {
    setDesiredAddonsData(userDetails?.addons || [])
    setShowDesiredModal(true)
  }

  // Reset/reload Stremio account addons (same UX as other reset buttons)
  const handleResetStremioAddons = () => {
    if (!user) return
    // Optimistically clear UI
    setStremioAddons([])
    const promise = (usersAPI.clearStremioAddons
      ? usersAPI.clearStremioAddons(currentUser.id)
      : usersAPI.reloadUserAddons(currentUser.id))
      .then(() => {
        // Refresh local list and any dependent UI
        queryClient.invalidateQueries({ queryKey: ['user', currentUser.id, 'stremio-addons'] })
        refreshAllSyncStatus(undefined, currentUser.id)
        toast.success('Stremio addons cleared')
      })
      .catch((error) => {
        const msg = error?.response?.data?.error || error?.message || 'Failed to clear Stremio addons'
        toast.error(msg)
      })
    return promise
  }


  // Update Stremio addons when data changes
  useEffect(() => {
    if (stremioAddonsData?.addons) {
      setStremioAddons(stremioAddonsData.addons)
    }
  }, [stremioAddonsData?.addons])

  // Fetch groups for group selection
  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: groupsAPI.getAll,
  })

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: ({ id, userData }: { id: string; userData: any }) => 
      usersAPI.update(id, userData),
    onSuccess: () => {
      console.log('🔍 UserDetailModal: Invalidating queries after name update')
      queryClient.invalidateQueries({ queryKey: ['user'] })
      queryClient.invalidateQueries({ queryKey: ['user', currentUser?.id, 'details'] })
      console.log('🔍 UserDetailModal: Queries invalidated')
      toast.success('User updated successfully')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to update user')
    }
  })

  // Handle color change
  const handleColorChange = (newColorIndex: number) => {
    if (currentUser?.id) {
      updateUserMutation.mutate({
        id: currentUser.id,
        userData: { colorIndex: newColorIndex }
      })
    }
  }

  // Handle username update
  const handleUsernameUpdate = async (newUsername: string) => {
    if (currentUser) {
      await updateUserMutation.mutateAsync({
        id: currentUser.id,
        userData: { username: newUsername }
      })
    }
  }

  // Handle group change
  const handleGroupChange = (groupId: string) => {
    if (currentUser) {
      updateUserMutation.mutate({
        id: currentUser.id,
        userData: { groupId: groupId || null }
      }, {
        onSuccess: () => {
          // Invalidate caches and refresh sync status so badge updates immediately
          queryClient.invalidateQueries({ queryKey: ['users'] })
          queryClient.invalidateQueries({ queryKey: ['user', currentUser.id, 'details'] })
          refreshAllSyncStatus(undefined, currentUser.id)
        }
      } as any)
    }
  }

  // Handle group addon exclude
  const handleExcludeGroupAddon = (addonId: string) => {
    if (currentUser) {
      const isExcluded = localExcludedSet.has(addonId)
      const optimistic = new Set(localExcludedSet)
      if (isExcluded) optimistic.delete(addonId); else optimistic.add(addonId)
      // Optimistic UI
      setLocalExcludedSet(optimistic)

      const next = Array.from(optimistic)
      usersAPI.updateExcludedAddons(currentUser.id, next)
        .then(() => {
          // Ensure UI reflects server state after success
          setLocalExcludedSet(new Set(next))
          queryClient.invalidateQueries({ queryKey: ['users'] })
          queryClient.invalidateQueries({ queryKey: ['user', currentUser.id] })
          refreshAllSyncStatus(undefined, currentUser.id)
          toast.success(`Addon ${isExcluded ? 'included' : 'excluded'} successfully`)
        })
        .catch((error) => {
          console.error('Error updating excluded addons:', error)
          // Revert on error
          const reverted = new Set(localExcludedSet)
          if (isExcluded) reverted.add(addonId); else reverted.delete(addonId)
          setLocalExcludedSet(reverted)
          toast.error('Failed to update excluded addons')
        })
    }
  }

  // Drag and drop handlers
  const handleDragEnd = (event: any) => {
    const { active, over } = event
    if (active.id !== over?.id) {
      const reordered = arrayMove(
        stremioAddons,
        stremioAddons.findIndex(item => (item.manifestUrl || item.transportUrl || item.url || item.id) === active.id),
        stremioAddons.findIndex(item => (item.manifestUrl || item.transportUrl || item.url || item.id) === over.id)
      )
      setStremioAddons(reordered)
      // Persist order in backend
      const orderedManifestUrls = (reordered || stremioAddons).map(a => a.manifestUrl || a.transportUrl || a.url || a.id).filter(Boolean)
      if (currentUser) {
        usersAPI.reorderStremioAddons?.(currentUser.id, orderedManifestUrls)
          .then(() => {
            toast.success('Stremio addons order updated')
            refreshAllSyncStatus(undefined, currentUser.id)
          })
          .catch((error) => {
            console.error('Failed to reorder Stremio addons:', error)
            toast.error('Failed to update order')
          })
      }
    }
  }

  // Handle Stremio addon actions
  const handleDeleteStremioAddon = (addonId: string) => {
    if (!currentUser) return
    const id = currentUser.id
    usersAPI.removeStremioAddon(id, addonId, isUnsafeMode)
      .then(() => {
        // Remove from local list
        setStremioAddons(prev => prev.filter(a => (a.manifestUrl || a.transportUrl || a.url || a.id) !== addonId))
        toast.success('Addon removed from Stremio account')
        // Refresh sync badge
        refreshAllSyncStatus(undefined, id)
      })
      .catch((error) => {
        const msg = error?.response?.data?.message || 'Failed to remove addon'
        toast.error(msg)
      })
  }

  // Helper function to check if an addon is a default addon
  const isDefaultAddon = (addonId: string, addonName?: string) => {
    const defaultAddonIds = ['com.linvo.cinemeta', 'org.stremio.local']
    const defaultManifestUrls = [
      'https://v3-cinemeta.strem.io/manifest.json',
      'http://127.0.0.1:11470/local-addon/manifest.json'
    ]
    const defaultNames = ['Cinemeta', 'Local Files']
    
    return defaultAddonIds.includes(addonId) ||
           defaultManifestUrls.includes(addonId) ||
           (addonName && defaultNames.some(name => addonName.includes(name)))
  }

  const handleProtectStremioAddon = (addonId: string) => {
    if (currentUser) {
      console.log('🔍 Protecting Stremio addon:', addonId)
      console.log('🔍 User ID:', currentUser.id)
      console.log('🔍 Current protected set:', Array.from(localProtectedSet))
      
      // Use the single addon toggle endpoint
      // addonId is the manifest URL, but we'll use it as the addon identifier
      usersAPI.toggleProtectAddon(currentUser.id, addonId, isUnsafeMode)
        .then((response) => {
          console.log('🔍 Protect response:', response)
          // Update local state immediately for better UX
          const newProtectedSet = new Set(localProtectedSet)
          if (response.isProtected) {
            newProtectedSet.add(addonId)
          } else {
            newProtectedSet.delete(addonId)
          }
          setLocalProtectedSet(newProtectedSet)
          // Invalidate user queries to refresh the data
          queryClient.invalidateQueries({ queryKey: ['users'] })
          queryClient.invalidateQueries({ queryKey: ['user', currentUser.id] })
          // Trigger sync status refresh for the user
          refreshAllSyncStatus(undefined, currentUser.id)
          toast.success(response.message)
        })
        .catch((error) => {
          console.error('Error toggling protect addon:', error)
          const errorMessage = error?.response?.data?.error || 'Failed to toggle protect addon'
          // Revert local state on error
          setLocalProtectedSet(new Set(userProtectedSet))
          toast.error(errorMessage)
        })
    }
  }

  // Custom GroupAddonItem component with exclude button
  const GroupAddonItem = ({ addon, index }: { addon: any; index: number }) => {
    const isExcluded = localExcludedSet.has(addon.id)
    
    return (
      <div className={`relative rounded-lg border p-4 hover:shadow-md transition-all ${
        isDark
          ? 'bg-gray-600 border-gray-500 hover:bg-gray-550'
          : 'bg-white border-gray-200 hover:bg-gray-50'
      }`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center flex-1 min-w-0">
            <AddonIcon name={addon.name || 'Addon'} iconUrl={addon.iconUrl} size="10" className="mr-3 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h4 className={`font-medium truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {addon.name || 'Unknown Addon'}
                </h4>
                {addon.version && (
                  <VersionChip version={addon.version} />
                )}
              </div>
              <p className={`text-sm truncate ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                {addon.description || 'No description'}
              </p>
            </div>
          </div>
          <button
            onClick={() => handleExcludeGroupAddon(addon.id)}
            className={`p-2 rounded-lg transition-colors ${
              isExcluded
                ? ((isMono || isDark) ? 'text-red-400 hover:bg-red-900/20' : 'text-red-600 hover:bg-red-50')
                : ((isMono || isDark) ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100')
            }`}
            title={isExcluded ? "Include addon" : "Exclude addon"}
          >
            {isExcluded ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>
    )
  }

  // SortableStremioAddonItem component
  const SortableStremioAddonItem = ({ addon, index }: { addon: any; index: number }) => {
    const addonId = addon.manifestUrl || addon.transportUrl || addon.url || addon.id
    const isProtected = localProtectedSet.has(addonId)
    const isDefault = isDefaultAddon(addonId, addon.name)
    // Use global setting reflected in modal state
    const unsafe = isUnsafeMode
    
    
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: addonId })

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
    }

    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`relative rounded-lg border p-4 hover:shadow-md transition-all cursor-grab active:cursor-grabbing select-none touch-none ${
          isDark
            ? 'bg-gray-600 border-gray-500 hover:bg-gray-550'
            : 'bg-white border-gray-200 hover:bg-gray-50'
        } ${isDragging ? 'opacity-50' : ''}`}
        {...attributes}
        {...listeners}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center flex-1 min-w-0">
            <AddonIcon name={addon.name || 'Addon'} iconUrl={addon.iconUrl} size="10" className="mr-3 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h4 className={`font-medium truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {addon.name || 'Unknown Addon'}
                </h4>
                {addon.version && (
                  <VersionChip version={addon.version} />
                )}
              </div>
              <p className={`text-sm truncate ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                {addon.description || 'No description'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (!isDefault || unsafe) {
                  handleProtectStremioAddon(addonId)
                }
              }}
              onPointerDown={(e) => {
                e.stopPropagation()
              }}
              disabled={Boolean(isDefault && !unsafe)}
              className={`p-2 rounded-lg transition-colors ${
                isDefault && !unsafe
                  ? ((isMono || isDark) ? 'text-gray-500 cursor-not-allowed' : 'text-gray-500 cursor-not-allowed')
                  : isProtected
                    ? ((isMono || isDark) ? 'text-green-400 hover:bg-green-900/20' : 'text-green-600 hover:bg-green-50')
                    : ((isMono || isDark) ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100')
              }`}
              title={
                isDefault && !unsafe
                  ? "Default addon - cannot be unprotected in safe mode"
                  : isProtected
                    ? "Unprotect addon"
                    : "Protect addon"
              }
            >
              {isProtected ? <LockKeyhole className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (!isDefault || unsafe) {
                  handleDeleteStremioAddon(addonId)
                }
              }}
              onPointerDown={(e) => {
                e.stopPropagation()
              }}
              disabled={Boolean(isDefault && !unsafe)}
              className={`p-2 rounded-lg transition-colors ${
                isDefault && !unsafe
                  ? ((isMono || isDark) ? 'text-gray-500 cursor-not-allowed' : 'text-gray-500 cursor-not-allowed')
                  : ((isMono || isDark) ? 'text-red-400 hover:bg-red-900/20' : 'text-red-600 hover:bg-red-50')
              }`}
              title={
                isDefault && !unsafe
                  ? "Default addon - cannot be deleted in safe mode"
                  : "Delete addon"
              }
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!isOpen || !user || !mounted || typeof window === 'undefined' || !document.body) {
    return null
  }

  return createPortal(
    <div 
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[1000] p-4 overflow-x-hidden"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div className={`relative w-full max-w-4xl max-h-[90vh] overflow-y-auto overflow-x-hidden rounded-lg shadow-xl ${
        isDark ? 'bg-gray-800' : 'bg-white'
      }`}>
        {/* Fixed close button in top-right */}
        <button
          onClick={onClose}
          className={`absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded transition-colors border-0 ${
            isDark ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
          }`}
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="p-6 pt-12">
          {/* Header: Logo + Name/email + Sync (left), Group selector + Close (right) */}
          <div className="flex flex-wrap items-start justify-between mb-6 gap-4">
            <div className="flex items-center gap-4 relative">
              {/* User Logo */}
              <div 
                ref={logoRef}
                onClick={() => setShowColorPicker(!showColorPicker)}
                className={`w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0 border-2 cursor-pointer transition-all hover:scale-105 ${
                  getColorBgClass(currentUser.colorIndex || 0, isMono ? 'mono' : isDark ? 'dark' : 'light')
                }`}
                style={{ backgroundColor: getColorHexValue(currentUser.colorIndex || 0, isMono ? 'mono' : isDark ? 'dark' : 'light') }}
                title="Click to change color"
              >
                <span className="text-white font-semibold text-xl">
                  {(currentUser.username || currentUser.email || 'U').charAt(0).toUpperCase()}
                </span>
              </div>
              
              {/* Color Picker */}
          <ColorPicker
            currentColorIndex={currentUser.colorIndex || 0}
            onColorChange={handleColorChange}
            isOpen={showColorPicker}
            onClose={() => setShowColorPicker(false)}
            triggerRef={logoRef}
          />
              
              <div className="flex flex-col">
                <div className="flex items-center gap-3">
                  <InlineEdit
                    value={currentUser.username || ''}
                    onSave={handleUsernameUpdate}
                    placeholder="Enter username..."
                    maxLength={50}
                  />
                  <SyncBadge 
                    userId={currentUser.id} 
                    onSync={() => onSync(currentUser.id)}
                    isSyncing={isSyncing}
                  />
                </div>
                <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'} ${hideSensitive ? 'blur-sm select-none' : ''}`}>
                  {hideSensitive ? '••••••••' : (currentUser.email || 'No email')}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2"></div>
          </div>

          {/* Removed legacy user info block */}

          {/* Group Addons Section */}
          <EntityList
            title="Group Addons"
          count={userDetails?.addons?.length || 0}
          items={userDetails?.addons || []}
            isLoading={isLoadingUserDetails}
            headerRight={(
              <select
                value={userDetails?.groupId || userDetails?.groups?.[0]?.id || ''}
                onChange={(e) => handleGroupChange(e.target.value)}
                className={`px-3 py-2 border rounded-lg text-sm focus:outline-none ${
                  isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                }`}
                title="Change group"
              >
                <option value="">No group</option>
                {groups?.map((group: any) => (
                  <option key={group.id} value={group.id}>{group.name}</option>
                ))}
              </select>
            )}
            renderItem={(addon: any, index: number) => (
              <GroupAddonItem
                key={addon.id || index}
                addon={addon}
                index={index}
              />
            )}
            emptyIcon={<Puzzle className={`w-12 h-12 mx-auto mb-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />}
            emptyMessage="No group addons assigned to this user"
          />

          {/* Stremio Account Addons Section */}
          <EntityList
            title="Stremio Account Addons"
            count={stremioAddons?.length || 0}
            items={stremioAddons || []}
            isLoading={false}
            onClear={handleResetStremioAddons}
            confirmReset={{
              title: 'Reset Stremio Addons',
              description: "This will clear all addons from this user's Stremio account. Continue?",
              confirmText: 'Reset',
              isDanger: true,
            }}
            headerRight={
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDebugStremioAddons}
                  className={`px-3 py-1 text-sm rounded transition-colors ${
                    isDark ? 'text-gray-300 hover:text-white hover:bg-gray-600' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                  title="Show current Stremio addons"
                >
                  Current
                </button>
                <button
                  onClick={handleDebugDesiredAddons}
                  className={`px-3 py-1 text-sm rounded transition-colors ${
                    isDark ? 'text-gray-300 hover:text-white hover:bg-gray-600' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                  title="Show desired addons from groups"
                >
                  Desired
                </button>
              </div>
            }
            isDraggable={true}
            renderItem={(addon: any, index: number) => (
              <SortableStremioAddonItem
                key={addon.id || addon.manifestUrl || addon.transportUrl || index}
                addon={addon}
                index={index}
              />
            )}
            emptyIcon={<Puzzle className={`w-12 h-12 mx-auto mb-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />}
            emptyMessage="No Stremio addons found for this user"
          >
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToParentElement]}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={stremioAddons.map(addon => addon.manifestUrl || addon.transportUrl || addon.url || addon.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {stremioAddons.map((addon: any, index: number) => (
                    <SortableStremioAddonItem
                      key={addon.id || addon.manifestUrl || addon.transportUrl || index}
                      addon={addon}
                      index={index}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </EntityList>

        </div>
      </div>

      {/* Current Addons Debug Modal */}
      {showCurrentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`rounded-lg p-6 max-w-2xl max-h-[80vh] overflow-y-auto ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Current Stremio Addons ({currentAddonsData.length})
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(currentAddonsData, null, 2))
                    toast.success('JSON copied to clipboard')
                  }}
                  className={`p-2 rounded-lg transition-colors ${
                    isDark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                  title="Copy JSON to clipboard"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowCurrentModal(false)}
                  className={`p-2 rounded-lg transition-colors ${
                    isDark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {currentAddonsData.length === 0 ? (
                <p className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>No addons found</p>
              ) : (
                <div className="relative">
                  <pre className={`p-4 rounded-lg border text-xs overflow-auto max-h-96 ${isDark ? 'bg-gray-900 border-gray-600 text-gray-300' : 'bg-gray-100 border-gray-200 text-gray-800'}`}>
                    {JSON.stringify(currentAddonsData, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Desired Addons Debug Modal */}
      {showDesiredModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`rounded-lg p-6 max-w-2xl max-h-[80vh] overflow-y-auto ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Desired Addons from Groups ({desiredAddonsData.length})
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(desiredAddonsData, null, 2))
                    toast.success('JSON copied to clipboard')
                  }}
                  className={`p-2 rounded-lg transition-colors ${
                    isDark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                  title="Copy JSON to clipboard"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowDesiredModal(false)}
                  className={`p-2 rounded-lg transition-colors ${
                    isDark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {desiredAddonsData.length === 0 ? (
                <p className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>No addons found</p>
              ) : (
                <div className="relative">
                  <pre className={`p-4 rounded-lg border text-xs overflow-auto max-h-96 ${isDark ? 'bg-gray-900 border-gray-600 text-gray-300' : 'bg-gray-100 border-gray-200 text-gray-800'}`}>
                    {JSON.stringify(desiredAddonsData, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  )
}