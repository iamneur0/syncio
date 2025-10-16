import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '@/contexts/ThemeContext'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { groupsAPI, usersAPI, addonsAPI } from '@/services/api'
import { useSyncStatusRefresh } from '@/hooks/useSyncStatusRefresh'
import { getColorBgClass, getColorHexValue } from '@/utils/colorMapping'
import toast from 'react-hot-toast'
import { VersionChip, SyncBadge, EntityList, UserItem, AddonItem, UserSelectModal, AddonSelectModal, InlineEdit, ColorPicker } from './'
import { Users, Puzzle, Plus, X } from 'lucide-react'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { restrictToParentElement } from '@dnd-kit/modifiers'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface GroupDetailModalProps {
  isOpen: boolean
  onClose: () => void
  group: {
    id: string
    name: string
    description?: string
    isActive: boolean
    colorIndex?: number
    users?: number
    addons?: number
  } | null
}

export default function GroupDetailModal({
  isOpen,
  onClose,
  group
}: GroupDetailModalProps) {
  const theme = useTheme()
  const { isDark, isModern, isModernDark, isMono } = theme
  const [mounted, setMounted] = useState(false)
  const [addons, setAddons] = useState<any[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [showUserSelectModal, setShowUserSelectModal] = useState(false)
  const [showAddonSelectModal, setShowAddonSelectModal] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const logoRef = useRef<HTMLDivElement>(null)

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

  const queryClient = useQueryClient()
  const { refreshAllSyncStatus } = useSyncStatusRefresh()

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Fetch group details
  const { data: groupDetails, isLoading: isLoadingGroupDetails } = useQuery({
    queryKey: ['group', group?.id, 'details'],
    queryFn: () => groupsAPI.getById(group!.id),
    enabled: !!group?.id && isOpen,
    initialData: group // Use prop as initial data
  })

  // Use the query data instead of the prop
  const currentGroup = groupDetails || group

  // Force refresh when group data changes
  useEffect(() => {
    setRefreshKey(prev => prev + 1)
  }, [groupDetails?.users?.length, groupDetails?.addons?.length])

  // Update addons when group details change (backend already returns sorted by position)
  useEffect(() => {
    if (groupDetails?.addons) {
      setAddons(groupDetails.addons)
    }
  }, [groupDetails?.addons])

  // Fetch users and addons
  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: usersAPI.getAll,
  })

  const { data: allAddons = [] } = useQuery({
    queryKey: ['addons'],
    queryFn: addonsAPI.getAll,
  })

  // Update group mutation
  const updateGroupMutation = useMutation({
    mutationFn: ({ groupId, groupData }: { groupId: string; groupData: any }) => 
      groupsAPI.update(groupId, groupData),
    onSuccess: () => {
      console.log('🔍 GroupDetailModal: Invalidating queries after name update')
      queryClient.invalidateQueries({ queryKey: ['group'] })
      queryClient.invalidateQueries({ queryKey: ['group', currentGroup?.id, 'details'] })
      queryClient.invalidateQueries({ queryKey: ['group'] })
      // Also refresh all group details to update counts
      queryClient.refetchQueries({ queryKey: ['group'] })
      console.log('🔍 GroupDetailModal: Queries invalidated')
      toast.success('Group updated successfully')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to update group')
    }
  })

  // Handle color change
  const handleColorChange = (newColorIndex: number) => {
    if (currentGroup?.id) {
      updateGroupMutation.mutate({
        groupId: currentGroup.id,
        groupData: { colorIndex: newColorIndex }
      })
    }
  }

  // Handle group name update
  const handleGroupNameUpdate = async (newName: string) => {
    if (currentGroup) {
      await updateGroupMutation.mutateAsync({
        groupId: currentGroup.id,
        groupData: { name: newName }
      })
    }
  }

  // Remove user from group mutation
  const removeUserMutation = useMutation({
    mutationFn: ({ groupId, userId }: { groupId: string; userId: string }) => 
      groupsAPI.removeUser(groupId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group'] })
      queryClient.invalidateQueries({ queryKey: ['group', group?.id, 'details'] })
      queryClient.invalidateQueries({ queryKey: ['users'] })
      // Also refresh all group details to update user counts
      queryClient.refetchQueries({ queryKey: ['group'] })
      // Trigger sync status refresh
      refreshAllSyncStatus(group?.id)
      toast.success('User removed from group')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to remove user from group')
    }
  })

  const handleRemoveUser = (userId: string) => {
    if (group) {
      removeUserMutation.mutate({
        groupId: group.id,
        userId
      })
    }
  }

  // Reorder addons mutation
  const reorderAddonsMutation = useMutation({
    mutationFn: ({ groupId, orderedManifestUrls }: { groupId: string; orderedManifestUrls: string[] }) => 
      groupsAPI.reorderAddons(groupId, orderedManifestUrls),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group'] })
      queryClient.invalidateQueries({ queryKey: ['group', group?.id, 'details'] })
      // Also refresh all group details to update counts
      queryClient.refetchQueries({ queryKey: ['group'] })
      // Fetch aggregated group+users sync status and update badges
      if (group?.id) {
        groupsAPI.getSyncStatus(group.id)
          .then(({ groupStatus, userStatuses }) => {
            try { window.dispatchEvent(new CustomEvent('sfm:group:sync-status', { detail: { id: group.id, status: groupStatus } } as any)) } catch {}
            ;(userStatuses || []).forEach((s: any) => {
              try { window.dispatchEvent(new CustomEvent('sfm:user-sync-data', { detail: { userId: s.userId, status: s.status } } as any)) } catch {}
              queryClient.invalidateQueries({ queryKey: ['user', s.userId, 'sync-status'] })
              queryClient.refetchQueries({ queryKey: ['user', s.userId, 'sync-status'], exact: true })
            })
          })
          .catch(() => {})
      }
      toast.success('Addon order updated')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to update addon order')
    }
  })

  // Drag and drop handlers
  const handleDragEnd = (event: any) => {
    const { active, over } = event

    if (active.id !== over.id) {
      const newAddons = arrayMove(addons, addons.findIndex((item) => item.id === active.id), addons.findIndex((item) => item.id === over.id))
      setAddons(newAddons)
      
      // Update backend with new order
      if (group) {
        const orderedManifestUrls = newAddons.map(addon => addon.manifestUrl || addon.url).filter(Boolean)
        reorderAddonsMutation.mutate({
          groupId: group.id,
          orderedManifestUrls
        })
      }
    }
  }

  // Remove addon from group mutation
  const removeAddonMutation = useMutation({
    mutationFn: ({ groupId, addonId }: { groupId: string; addonId: string }) => 
      groupsAPI.removeAddon(groupId, addonId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group'] })
      queryClient.invalidateQueries({ queryKey: ['group', group?.id, 'details'] })
      queryClient.invalidateQueries({ queryKey: ['addons'] })
      // Also refresh all group details to update addon counts
      queryClient.refetchQueries({ queryKey: ['group'] })
      // Fetch aggregated group+users sync status and update badges
      if (group?.id) {
        groupsAPI.getSyncStatus(group.id)
          .then(({ groupStatus, userStatuses }) => {
            try { window.dispatchEvent(new CustomEvent('sfm:group:sync-status', { detail: { id: group.id, status: groupStatus } } as any)) } catch {}
            ;(userStatuses || []).forEach((s: any) => {
              try { window.dispatchEvent(new CustomEvent('sfm:user-sync-data', { detail: { userId: s.userId, status: s.status } } as any)) } catch {}
              queryClient.invalidateQueries({ queryKey: ['user', s.userId, 'sync-status'] })
              queryClient.refetchQueries({ queryKey: ['user', s.userId, 'sync-status'], exact: true })
            })
          })
          .catch(() => {})
      }
      toast.success('Addon removed from group')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to remove addon from group')
    }
  })

  // Add user to group mutation
  const addUserMutation = useMutation({
    mutationFn: ({ groupId, userId }: { groupId: string; userId: string }) => 
      groupsAPI.addUser(groupId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group'] })
      queryClient.invalidateQueries({ queryKey: ['group', group?.id, 'details'] })
      queryClient.invalidateQueries({ queryKey: ['users'] })
      // Also refresh all group details to update user counts
      queryClient.refetchQueries({ queryKey: ['group'] })
      // Trigger sync status refresh for group first (so group badge updates)
      refreshAllSyncStatus(group?.id)
      // Then explicitly refresh each user's sync status (including newly added)
      try {
        const users = (groupDetails?.users || []) as any[]
        users.forEach((u: any) => {
          if (u?.id) {
            queryClient.invalidateQueries({ queryKey: ['user', u.id, 'sync-status'] })
            queryClient.refetchQueries({ queryKey: ['user', u.id, 'sync-status'], exact: true })
            try { window.dispatchEvent(new CustomEvent('sfm:user-sync-data', { detail: { userId: u.id } } as any)) } catch {}
          }
        })
      } catch {}
      toast.success('User added to group')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to add user to group')
    }
  })

  // Add addon to group mutation
  const addAddonMutation = useMutation({
    mutationFn: ({ groupId, addonId }: { groupId: string; addonId: string }) => 
      groupsAPI.addAddon(groupId, addonId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group'] })
      queryClient.invalidateQueries({ queryKey: ['group', group?.id, 'details'] })
      queryClient.invalidateQueries({ queryKey: ['addons'] })
      // Also refresh all group details to update addon counts
      queryClient.refetchQueries({ queryKey: ['group'] })
      // Fetch aggregated group+users sync status and update badges
      if (group?.id) {
        groupsAPI.getSyncStatus(group.id)
          .then(({ groupStatus, userStatuses }) => {
            try { window.dispatchEvent(new CustomEvent('sfm:group:sync-status', { detail: { id: group.id, status: groupStatus } } as any)) } catch {}
            ;(userStatuses || []).forEach((s: any) => {
              try { window.dispatchEvent(new CustomEvent('sfm:user-sync-data', { detail: { userId: s.userId, status: s.status } } as any)) } catch {}
              queryClient.invalidateQueries({ queryKey: ['user', s.userId, 'sync-status'] })
              queryClient.refetchQueries({ queryKey: ['user', s.userId, 'sync-status'], exact: true })
            })
          })
          .catch(() => {})
      }
      toast.success('Addon added to group')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to add addon to group')
    }
  })

  // Helper function to trigger sync status refresh
  const triggerSyncStatusRefresh = () => {
    if (group?.id) {
      refreshAllSyncStatus(group.id)
    }
  }

  const handleRemoveAddon = (addonId: string) => {
    if (group) {
      removeAddonMutation.mutate({
        groupId: group.id,
        addonId
      })
    }
  }

  const handleSelectUser = async (user: any) => {
    if (group) {
      try {
        await groupsAPI.addUser(group.id, user.id)
        // Invalidate all group-related queries to update user counts
        queryClient.invalidateQueries({ queryKey: ['group'] })
        queryClient.invalidateQueries({ queryKey: ['group', group.id, 'details'] })
        queryClient.invalidateQueries({ queryKey: ['users'] })
        // Also refresh all group details to update user counts
        queryClient.refetchQueries({ queryKey: ['group'] })
        toast.success(`Added ${user.username || user.email} to group`)
      } catch (error: any) {
        toast.error(error?.response?.data?.message || `Failed to add ${user.username || user.email} to group`)
      }
    }
  }

  const handleSelectAddon = async (addon: any) => {
    if (group) {
      // Reuse the same mutation/onSuccess logic used by inline add
      addAddonMutation.mutate({ groupId: group.id, addonId: addon.id })
    }
  }

  // Sortable Addon Item Component
  const SortableAddonItem = ({ addon, onRemove }: { addon: any; onRemove: (id: string) => void }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: addon.id })

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    }

    return (
      <div ref={setNodeRef} style={style} className="select-none touch-none">
        <AddonItem
          addon={addon}
          onRemove={onRemove}
          isDraggable={true}
          dragProps={attributes}
          dragListeners={listeners}
        />
      </div>
    )
  }

  if (!isOpen || !group) return null

  // Don't render until mounted
  if (!mounted || typeof window === 'undefined' || !document.body) {
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
          <div className="flex items-center justify-between mb-6">
            <div className="flex flex-col flex-1">
                <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 relative">
                  {/* Group Logo */}
                  <div 
                    ref={logoRef}
                    onClick={() => setShowColorPicker(!showColorPicker)}
                    className={`w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0 border-2 cursor-pointer transition-all hover:scale-105 ${
                      getColorBgClass(currentGroup.colorIndex || 0, isMono ? 'mono' : isDark ? 'dark' : 'light')
                    }`}
                    style={{ backgroundColor: getColorHexValue(currentGroup.colorIndex || 0, isMono ? 'mono' : isDark ? 'dark' : 'light') }}
                    title="Click to change color"
                  >
                    <span className="text-white font-semibold text-xl">
                      {currentGroup.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  
                  {/* Color Picker */}
          <ColorPicker
            currentColorIndex={currentGroup.colorIndex || 0}
            onColorChange={handleColorChange}
            isOpen={showColorPicker}
            onClose={() => setShowColorPicker(false)}
            triggerRef={logoRef}
          />
                  
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-3">
                      <InlineEdit
                        value={currentGroup.name}
                        onSave={handleGroupNameUpdate}
                        placeholder="Enter group name..."
                        maxLength={50}
                      />
                      <SyncBadge 
                        key={`group-sync-${group.id}-${refreshKey}`}
                        groupId={group.id} 
                        onSync={async () => {
                          try {
                            // Sync the group
                            await groupsAPI.sync(group.id)
                            // Then sync all users in the group as requested
                            const users = groupDetails?.users || []
                            if (Array.isArray(users) && users.length > 0) {
                              await Promise.all(users.map((u: any) => usersAPI.sync(u.id)))
                            }
                            // Invalidate and refresh
                            queryClient.invalidateQueries({ queryKey: ['group'] })
                            queryClient.invalidateQueries({ queryKey: ['group', group.id, 'details'] })
                            queryClient.invalidateQueries({ queryKey: ['users'] })
                            refreshAllSyncStatus(group.id)
                            toast.success('Group and users sync completed')
                          } catch (error: any) {
                            toast.error(error?.response?.data?.message || 'Failed to sync group')
                          }
                        }}
                        isSyncing={false}
                      />
                    </div>
                    {currentGroup.description && (
                      <p className={`text-sm mt-1 truncate ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        {currentGroup.description}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              {/* Group description now shown under name above */}
            </div>
          </div>

          {/* Group Users */}
          <EntityList
            title="Users"
            count={groupDetails?.users?.length || 0}
            items={groupDetails?.users || []}
            isLoading={isLoadingGroupDetails}
            onClear={() => {
              groupDetails?.users?.forEach((user: any) => {
                handleRemoveUser(user.id)
              })
            }}
            confirmReset={{
              title: 'Reset Group Users',
              description: 'Remove all users from this group? This cannot be undone.',
              confirmText: 'Reset',
              isDanger: true,
            }}
            actionButton={{
              icon: <Plus className="w-4 h-4" />,
              onClick: () => setShowUserSelectModal(true),
              tooltip: 'Add user to group'
            }}
            renderItem={(user: any, index: number) => (
              <UserItem
                key={user.id || index}
                user={user}
                groupId={group.id}
                onRemove={handleRemoveUser}
                onSync={async (userId: string, groupIdStr: string) => {
                  try {
                    await usersAPI.sync(userId, [], 'normal', false)
                    queryClient.invalidateQueries({ queryKey: ['users'] })
                    queryClient.invalidateQueries({ queryKey: ['group', groupIdStr, 'details'] })
                    refreshAllSyncStatus(groupIdStr, userId)
                    toast.success(`Synced ${user.username || user.email}`)
                  } catch (error: any) {
                    toast.error(error?.response?.data?.message || `Failed to sync ${user.username || user.email}`)
                  }
                }}
              />
            )}
            emptyIcon={<Users className={`w-12 h-12 mx-auto mb-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />}
            emptyMessage="No users in this group"
          />

          {/* Group Addons */}
          <EntityList
            title="Addons"
            count={groupDetails?.addons?.length || 0}
            items={addons}
            isLoading={isLoadingGroupDetails}
            renderItem={() => null as any}
            onClear={() => {
              addons.forEach((addon: any) => {
                handleRemoveAddon(addon.id)
              })
            }}
            confirmReset={{
              title: 'Reset Group Addons',
              description: 'Remove all addons from this group? This cannot be undone.',
              confirmText: 'Reset',
              isDanger: true,
            }}
            actionButton={{
              icon: <Plus className="w-4 h-4" />,
              onClick: () => setShowAddonSelectModal(true),
              tooltip: 'Add addon to group'
            }}
            isDraggable={true}
            emptyIcon={<Puzzle className={`w-12 h-12 mx-auto mb-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />}
            emptyMessage="No addons in this group"
          >
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToParentElement]}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={addons.map(addon => addon.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {addons.map((addon: any, index: number) => (
                    <SortableAddonItem
                      key={addon.id || index}
                      addon={addon}
                      onRemove={handleRemoveAddon}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </EntityList>

        </div>
      </div>

      {/* Modals */}
      {showUserSelectModal && (
        <UserSelectModal
          isOpen={showUserSelectModal}
          onClose={() => setShowUserSelectModal(false)}
          onSelectUser={handleSelectUser}
          groupId={group?.id || ''}
          excludeUserIds={groupDetails?.users?.map((u: any) => u.id) || []}
        />
      )}

      {showAddonSelectModal && (
        <AddonSelectModal
          isOpen={showAddonSelectModal}
          onClose={() => setShowAddonSelectModal(false)}
          onSelectAddon={handleSelectAddon}
          groupId={group?.id || ''}
          excludeAddonIds={addons.map((a: any) => a.id)}
        />
      )}
    </div>,
    document.body
  )
}
