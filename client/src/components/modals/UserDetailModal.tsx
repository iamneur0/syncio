import React, { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '@/contexts/ThemeContext'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api, { usersAPI, groupsAPI } from '@/services/api'
import { getEntityColorStyles } from '@/utils/colorMapping'
import { invalidateUserQueries, invalidateSyncStatusQueries } from '@/utils/queryUtils'
import { userSuccessHandlers } from '@/utils/toastUtils'
import { useModalState } from '@/hooks/useCommonState'
import toast from 'react-hot-toast'
import { VersionChip, SyncBadge } from '@/components/ui'
import { EntityList, InlineEdit, AddonIcon, SortableAddonItem } from '@/components/entities'
import { ColorPicker } from '@/components/layout'
import { ConfirmDialog } from '@/components/modals'
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
  const { hideSensitive, theme: themeName } = useTheme()
  const queryClient = useQueryClient()
  const { mounted } = useModalState()
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
  const userColorIndex = currentUser?.colorIndex || 0
  const userColorStyles = useMemo(
    () => getEntityColorStyles(themeName, userColorIndex),
    [themeName, userColorIndex]
  )
  
  // Local state for excluded and protected addons to ensure proper reactivity
  const [localExcludedSet, setLocalExcludedSet] = useState<Set<string>>(new Set())
  const [localProtectedSet, setLocalProtectedSet] = useState<Set<string>>(new Set())
  
  // Debug modal state
  const [showCurrentModal, setShowCurrentModal] = useState(false)
  const [showDesiredModal, setShowDesiredModal] = useState(false)
  const [showGroupAddonsModal, setShowGroupAddonsModal] = useState(false)
  const [currentAddonsData, setCurrentAddonsData] = useState<any>({})
  const [desiredAddonsData, setDesiredAddonsData] = useState<any>({})
  const [groupAddonsData, setGroupAddonsData] = useState<any>({})
  const [confirmDeleteAllOpen, setConfirmDeleteAllOpen] = useState(false)

  // Initialize local state when opening the modal or switching user
  useEffect(() => {
    if (user && isOpen) {
      const excludedArray = Array.isArray(userExcludedSet) ? userExcludedSet : Array.from(userExcludedSet)
      // Prefer names coming from currentUser.protectedAddons if available
      const protectedFromUser = (currentUser as any)?.protectedAddons
      const protectedArray = Array.isArray(protectedFromUser)
        ? protectedFromUser
        : (Array.isArray(userProtectedSet) ? userProtectedSet : Array.from(userProtectedSet))
      setLocalExcludedSet(new Set(excludedArray))
      setLocalProtectedSet(new Set(protectedArray))
    }
  }, [isOpen, user?.id])

  // Build a protected name set sourced from DB, with local optimistic overlay
  const protectedNameSet: Set<string> = (() => {
    const base = new Set<string>(Array.isArray((currentUser as any)?.protectedAddons) ? (currentUser as any).protectedAddons : [])
    // Overlay local changes
    for (const n of Array.from(localProtectedSet)) base.add(n)
    return base
  })()

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

  // Mounted state is handled by useModalState hook

  // Read delete mode from DB-backed account sync settings
  useEffect(() => {
    if (!isOpen) return
    api.get('/settings/account-sync')
      .then(r => {
        const safe = (r.data?.safe !== undefined) ? !!r.data.safe : !(!!r.data?.unsafe)
        setIsUnsafeMode(!safe)
      })
      .catch(() => {})
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

  // Fetch group addons for user
  const { data: userGroupAddons, isLoading: isLoadingGroupAddons } = useQuery({
    queryKey: ['user', user?.id, 'group-addons'],
    queryFn: () => usersAPI.getGroupAddons(user!.id),
    enabled: !!user?.id,
  })


  // Fetch Stremio addons using getUserAddons (raw Stremio API format)
  const { data: stremioAddonsData } = useQuery({
    queryKey: ['user', user?.id, 'stremio-addons'],
    queryFn: () => usersAPI.getUserAddons(user!.id),
    enabled: !!user?.id,
  })


  // Debug mode check - show debug buttons in debug mode or private instances
  const AUTH_ENABLED = process.env.NEXT_PUBLIC_AUTH_ENABLED === 'true'
  const isDebugMode = process.env.NEXT_PUBLIC_DEBUG === 'true' || process.env.NEXT_PUBLIC_DEBUG === '1' || !AUTH_ENABLED

  // Debug function to show raw Stremio addons
  const handleDebugStremioAddons = async () => {
    try {
      // Call getUserAddons directly to get the exact response
      const response = await usersAPI.getUserAddons(user!.id)
      setCurrentAddonsData(response || {})
      setShowCurrentModal(true)
    } catch (error) {
      console.error('Failed to fetch user addons:', error)
      toast.error('Failed to fetch user addons')
    }
  }

  // Debug function to show desired addons
  const handleDebugDesiredAddons = async () => {
    try {
      // Pass unsafe=true for advanced mode
      const response = await usersAPI.getDesiredAddons(user!.id, true)
      setDesiredAddonsData(response || {})
      setShowDesiredModal(true)
    } catch (error) {
      console.error('Failed to fetch desired addons:', error)
      toast.error('Failed to fetch desired addons')
    }
  }

  // Debug function to show group addons
  const handleDebugGroupAddons = async () => {
    try {
      const response = await usersAPI.getGroupAddons(user!.id)
      setGroupAddonsData(response || {})
      setShowGroupAddonsModal(true)
    } catch (error) {
      console.error('Failed to fetch group addons:', error)
      toast.error('Failed to fetch group addons')
    }
  }

  // Reset/reload Stremio account addons (same UX as other reset buttons)
  const handleResetStremioAddons = () => {
    if (!user) return
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
      queryClient.invalidateQueries({ queryKey: ['user'] })
      queryClient.invalidateQueries({ queryKey: ['user', currentUser?.id, 'details'] })
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
      const currentAddons = stremioAddonsData?.addons || []
      
      // Extract index from the unique ID (format: "index-transportUrl")
      const activeIndex = parseInt(active.id.split('-')[0])
      const overIndex = parseInt(over.id.split('-')[0])
      
      const reordered = arrayMove(currentAddons, activeIndex, overIndex)
      
      // Update the query cache immediately for smooth UI
      queryClient.setQueryData(['user', currentUser?.id, 'stremio-addons'], (oldData: any) => ({
        ...oldData,
        addons: reordered
      }))
      
      // Persist order in backend by sending only names in order
      if (currentUser) {
        const orderedNames = reordered.map((a: any) => (a?.manifest?.name || a?.transportName || 'Addon'))
        usersAPI.reorderStremioAddons?.(currentUser.id, orderedNames)
          .then(() => {
            // Refresh the data from the server to ensure consistency
            queryClient.invalidateQueries({ queryKey: ['user', currentUser.id, 'stremio-addons'] })
            toast.success('Stremio addons order updated')
            refreshAllSyncStatus(undefined, currentUser.id)
          })
          .catch((error) => {
            console.error('Failed to reorder Stremio addons:', error)
            toast.error('Failed to update order')
            // Revert the optimistic update on error
            queryClient.invalidateQueries({ queryKey: ['user', currentUser.id, 'stremio-addons'] })
          })
      }
    }
  }

  // Handle Stremio addon actions
  const handleDeleteStremioAddon = (addonName: string) => {
    if (!currentUser) return
    const id = currentUser.id
    usersAPI.removeStremioAddon(id, addonName, isUnsafeMode)
      .then(() => {
        // Refresh the data from the server instead of local state manipulation
        queryClient.invalidateQueries({ queryKey: ['user', id, 'stremio-addons'] })
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
    const defaultNames = ['Cinemeta', 'Local Files (without catalog support)']
    
    return defaultAddonIds.includes(addonId) ||
           defaultManifestUrls.includes(addonId) ||
           (addonName && defaultNames.some(name => addonName.includes(name)))
  }

  const handleProtectStremioAddon = (nameOrId: string) => {
    if (currentUser) {
      
      // Use the single addon toggle endpoint
      // nameOrId may be a name already; if it's a URL, try to resolve to name
      let name = nameOrId
      if (/^https?:\/\//i.test(nameOrId)) {
        const currentAddons = stremioAddonsData?.addons || []
        const match = currentAddons.find((a: any) => (a?.transportUrl || a?.manifestUrl) === nameOrId)
        name = match?.manifest?.name || match?.transportName || 'Addon'
      }
      usersAPI.toggleProtectAddon(currentUser.id, name, isUnsafeMode)
        .then((response) => {
          // Update local state immediately for better UX
          const newProtectedSet = new Set(localProtectedSet)
          if (response.isProtected) {
            newProtectedSet.add(name)
          } else {
            newProtectedSet.delete(name)
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
    // Support both legacy shape (plain manifest) and new shape ({ transportUrl, transportName, manifest })
    const manifest = addon?.manifest || addon
    // Use database ID for exclusions
    const addonId = addon?.id
    const name = addon?.name || manifest?.name || addon?.transportName || 'Unknown'
    const version = addon?.version || manifest?.version
    const description = addon?.description || manifest?.description || ''
    const iconUrl = addon?.iconUrl || manifest?.logo || manifest?.icon || null
    const isExcluded = localExcludedSet.has(addonId)
    
    return (
      <div className={`relative rounded-lg card card-selectable p-4 hover:shadow-lg transition-all color-hover`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center flex-1 min-w-0">
            <AddonIcon name={name || 'Addon'} iconUrl={iconUrl} size="10" className="mr-3 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h4 className={`font-medium truncate`}>
                  {name || 'Unknown Addon'}
                </h4>
                {version && (
                  <VersionChip version={version} />
                )}
              </div>
              <p className={`text-sm truncate color-text-secondary`}>
                {description || 'No description'}
              </p>
            </div>
          </div>
          <button
            onClick={() => handleExcludeGroupAddon(addonId)}
            className={`p-2 rounded-lg transition-colors ${
              isExcluded
                ? 'color-text color-hover'
                : 'color-text-secondary color-hover'
            }`}
            title={isExcluded ? "Include addon" : "Exclude addon"}
          >
            {isExcluded ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
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
      <div
        className={`relative w-full max-w-4xl max-h-[90vh] overflow-y-auto overflow-x-hidden rounded-lg shadow-xl card`}
        style={{ background: 'var(--color-background)' }}
      >
        <div className="p-6">
          {/* Header: Logo + Name/email + Sync (left), Group selector + Close (right) */}
          <div className="flex flex-wrap items-start justify-between mb-6 gap-4">
            <div className="flex items-center gap-4 relative">
              {/* User Logo */}
              <div 
                ref={logoRef}
                onClick={() => setShowColorPicker(!showColorPicker)}
                className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 cursor-pointer transition-all hover:scale-105"
                title="Click to change color"
                style={{ 
                  background: userColorStyles.background,
                  color: userColorStyles.textColor,
                }}
              >
                <span className="font-semibold text-lg" style={{ color: userColorStyles.textColor }}>
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
                    onSync={() => {
                      const groupAddonCount = userGroupAddons?.addons?.length || 0
                      if (groupAddonCount === 0) {
                        setConfirmDeleteAllOpen(true)
                        return
                      }
                      onSync(currentUser.id)
                    }}
                    isSyncing={isSyncing}
                  />
                </div>
                <div className={`text-sm color-text-secondary ${hideSensitive ? 'blur-sm select-none' : ''}`}>
                  {hideSensitive ? '••••••••' : (currentUser.email || 'No email')}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className={`w-8 h-8 flex items-center justify-center rounded transition-colors border-0 color-hover`}
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Removed legacy user info block */}

          {/* Group Addons Section */}
          <EntityList
            title="Group Addons"
            count={userGroupAddons?.addons?.length || 0}
            items={userGroupAddons?.addons || []}
            isLoading={isLoadingGroupAddons}
            headerRight={isDebugMode ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDebugGroupAddons}
                  className={`px-3 py-1 text-sm rounded transition-colors ${
                    'color-text-secondary color-hover'
                  }`}
                  title="Show current group addons"
                >
                  Current
                </button>
                <select
                  value={userDetails?.groupId || userDetails?.groups?.[0]?.id || ''}
                  onChange={(e) => handleGroupChange(e.target.value)}
                  className={`px-3 py-2 border rounded-lg text-sm focus:outline-none ${
                    'input'
                  }`}
                  title="Change group"
                >
                  <option value="">No group</option>
                  {groups?.map((group: any) => (
                    <option key={group.id} value={group.id}>{group.name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <select
                value={userDetails?.groupId || userDetails?.groups?.[0]?.id || ''}
                onChange={(e) => handleGroupChange(e.target.value)}
                className={`px-3 py-2 border rounded-lg text-sm focus:outline-none ${
                  'input'
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
            emptyIcon={<Puzzle className={`w-12 h-12 mx-auto mb-4 color-text-secondary`} />}
            emptyMessage="No group addons assigned to this user"
          />

          {/* Stremio Account Addons Section */}
          <EntityList
            title="Stremio Account Addons"
            count={stremioAddonsData?.addons?.length || 0}
            items={stremioAddonsData?.addons || []}
            isLoading={false}
            onClear={handleResetStremioAddons}
            confirmReset={{
              title: 'Reset Stremio Addons',
              description: "This will clear all addons from this user's Stremio account. Continue?",
              confirmText: 'Reset',
              isDanger: true,
            }}
            headerRight={isDebugMode ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDebugStremioAddons}
                  className={`px-3 py-1 text-sm rounded transition-colors ${
                    'color-text-secondary color-hover'
                  }`}
                  title="Show current Stremio addons"
                >
                  Current
                </button>
                <button
                  onClick={handleDebugDesiredAddons}
                  className={`px-3 py-1 text-sm rounded transition-colors ${
                    'color-text-secondary color-hover'
                  }`}
                  title="Show desired addons (group addons + protected addons)"
                >
                  Desired 2
                </button>
              </div>
            ) : undefined}
            isDraggable={true}
            renderItem={(addon: any, index: number) => {
              const addonId = addon.transportUrl || addon.manifestUrl || addon.url || addon.id
              const addonName = addon.manifest?.name || addon.transportName || addon.name || 'Unknown Addon'
              const isProtected = protectedNameSet.has(addonName)
              const isDefault = isDefaultAddon(addonId, addonName)
              
              
              return (
                <SortableAddonItem
                  key={addonId || index}
                  addon={addon}
                  onRemove={() => handleDeleteStremioAddon(addonName)}
                  onProtect={() => handleProtectStremioAddon(addonName)}
                  isProtected={isProtected}
                  isDefault={!!isDefault}
                  isUnsafeMode={isUnsafeMode}
                  showProtectButton={true}
                />
              )
            }}
            emptyIcon={<Puzzle className={`w-12 h-12 mx-auto mb-4 color-text-secondary`} />}
            emptyMessage="No Stremio addons found for this user"
          >
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToParentElement]}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={(stremioAddonsData?.addons || []).map((addon: any, index: number) => {
                const addonId = addon.transportUrl || addon.manifestUrl || addon.url || addon.id
                return `${index}-${addonId}`
              })} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {(stremioAddonsData?.addons || []).map((addon: any, index: number) => {
                    const addonId = addon.transportUrl || addon.manifestUrl || addon.url || addon.id
                    const uniqueId = `${index}-${addonId}`
                    const addonName = addon.manifest?.name || addon.transportName || addon.name || 'Unknown Addon'
                    const isProtected = protectedNameSet.has(addonName)
                    const isDefault = isDefaultAddon(addonId, addonName)
                    
                    return (
                      <SortableAddonItem
                        key={uniqueId}
                        addon={addon}
                        onRemove={() => handleDeleteStremioAddon(addonName)}
                        onProtect={() => handleProtectStremioAddon(addonName)}
                        isProtected={isProtected}
                        isDefault={!!isDefault}
                        isUnsafeMode={isUnsafeMode}
                        showProtectButton={true}
                        uniqueId={uniqueId}
                      />
                    )
                  })}
                </div>
              </SortableContext>
            </DndContext>
          </EntityList>

        </div>
      </div>

      {/* Current Addons Debug Modal */}
      {showCurrentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`rounded-lg p-6 max-w-2xl max-h-[80vh] overflow-y-auto card`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className={`text-lg font-semibold`}>
                Current Stremio Addons ({Array.isArray(currentAddonsData) ? currentAddonsData.length : (currentAddonsData?.addons?.length || 0)})
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(currentAddonsData, null, 2))
                    toast.success('JSON copied to clipboard')
                  }}
                  className={`p-2 rounded-lg transition-colors ${
                    'color-text-secondary color-hover'
                  }`}
                  title="Copy JSON to clipboard"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowCurrentModal(false)}
                  className={`p-2 rounded-lg transition-colors ${
                    'color-text-secondary color-hover'
                  }`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {(!currentAddonsData || (Array.isArray(currentAddonsData) && currentAddonsData.length === 0) || (!Array.isArray(currentAddonsData) && !currentAddonsData.addons)) ? (
                <p className={`color-text-secondary`}>No addons found</p>
              ) : (
                <div className="relative">
                  <pre className={`p-4 rounded-lg border text-xs overflow-auto max-h-96 card`}>
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
          <div className={`rounded-lg p-6 max-w-2xl max-h-[80vh] overflow-y-auto card`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className={`text-lg font-semibold`}>
                Desired Addons from Groups ({Array.isArray(desiredAddonsData) ? desiredAddonsData.length : (desiredAddonsData?.addons?.length || 0)})
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(desiredAddonsData, null, 2))
                    toast.success('JSON copied to clipboard')
                  }}
                  className={`p-2 rounded-lg transition-colors ${
                    'color-text-secondary color-hover'
                  }`}
                  title="Copy JSON to clipboard"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowDesiredModal(false)}
                  className={`p-2 rounded-lg transition-colors ${
                    'color-text-secondary color-hover'
                  }`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {(!desiredAddonsData || (Array.isArray(desiredAddonsData) && desiredAddonsData.length === 0) || (!Array.isArray(desiredAddonsData) && !desiredAddonsData.addons)) ? (
                <p className={`color-text-secondary`}>No addons found</p>
              ) : (
                <div className="relative">
                  <pre className={`p-4 rounded-lg border text-xs overflow-auto max-h-96 card`}>
                    {JSON.stringify(desiredAddonsData, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Group Addons Debug Modal */}
      {showGroupAddonsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`rounded-lg p-6 max-w-2xl max-h-[80vh] overflow-y-auto card`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className={`text-lg font-semibold`}>
                Group Addons ({Array.isArray(groupAddonsData) ? groupAddonsData.length : (groupAddonsData?.addons?.length || 0)})
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(groupAddonsData, null, 2))
                    toast.success('JSON copied to clipboard')
                  }}
                  className={`p-2 rounded-lg transition-colors ${
                    'color-text-secondary color-hover'
                  }`}
                  title="Copy JSON to clipboard"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowGroupAddonsModal(false)}
                  className={`p-2 rounded-lg transition-colors ${
                    'color-text-secondary color-hover'
                  }`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {(!groupAddonsData || (Array.isArray(groupAddonsData) && groupAddonsData.length === 0) || (!Array.isArray(groupAddonsData) && !groupAddonsData.addons)) ? (
                <p className={`color-text-secondary`}>No addons found</p>
              ) : (
                <div className="relative">
                  <pre className={`p-4 rounded-lg border text-xs overflow-auto max-h-96 card`}>
                    {JSON.stringify(groupAddonsData, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirm deletion of all user's addons when group has no addons */}
      <ConfirmDialog
        open={confirmDeleteAllOpen}
        title="Sync will remove all this user's addons"
        description="This user belongs to a group with no addons. Syncing will delete all addons from this user's Stremio account. Continue?"
        confirmText="Delete all and Sync"
        cancelText="Cancel"
        isDanger={true}
        onCancel={() => setConfirmDeleteAllOpen(false)}
        onConfirm={() => {
          setConfirmDeleteAllOpen(false)
          onSync(currentUser.id)
        }}
      />
    </div>,
    document.body
  )
}