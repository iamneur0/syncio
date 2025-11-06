import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '@/contexts/ThemeContext'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { groupsAPI, usersAPI, addonsAPI } from '@/services/api'
import { useSyncStatusRefresh } from '@/hooks/useSyncStatusRefresh'
import { getColorBgClass, getColorHexValue } from '@/utils/colorMapping'
import { invalidateGroupQueries, invalidateSyncStatusQueries } from '@/utils/queryUtils'
import { groupSuccessHandlers } from '@/utils/toastUtils'
import { useModalState } from '@/hooks/useCommonState'
import toast from 'react-hot-toast'
import { VersionChip, SyncBadge } from '@/components/ui'
import { EntityList, UserItem, AddonItem, InlineEdit, AddonIcon, SortableAddonItem } from '@/components/entities'
import { ColorPicker } from '@/components/layout'
import { UserSelectModal, AddonSelectModal, ConfirmDialog } from '@/components/modals'
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
  const { mounted } = useModalState()
  const [addons, setAddons] = useState<any[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [showUserSelectModal, setShowUserSelectModal] = useState(false)
  const [showAddonSelectModal, setShowAddonSelectModal] = useState(false)
  const [confirmGroupDeleteAllOpen, setConfirmGroupDeleteAllOpen] = useState(false)
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

  // Mounted state is handled by useModalState hook

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

  // Fetch group addons directly
  const { data: groupAddonsData, isLoading: isLoadingGroupAddons } = useQuery({
    queryKey: ['group', group?.id, 'addons'],
    queryFn: () => groupsAPI.getGroupAddons(group!.id),
    enabled: !!group?.id && isOpen,
  })

  // Use the query data instead of the prop
  const currentGroup = groupDetails || group

  // Force refresh when group data changes
  useEffect(() => {
    setRefreshKey(prev => prev + 1)
  }, [groupDetails?.users?.length, groupAddonsData?.addons?.length])

  // Update addons when group addons data changes (backend already returns sorted by position)
  useEffect(() => {
    if (groupAddonsData?.addons) {
      setAddons(groupAddonsData.addons)
    }
  }, [groupAddonsData?.addons])

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
      invalidateGroupQueries(queryClient, currentGroup?.id)
      // Also refresh all group details to update counts
      queryClient.refetchQueries({ queryKey: ['group'] })
      groupSuccessHandlers.update()
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
      invalidateGroupQueries(queryClient, group?.id)
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
    mutationFn: ({ groupId, orderedAddonIds }: { groupId: string; orderedAddonIds: string[] }) => 
      groupsAPI.reorderAddons(groupId, orderedAddonIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group'] })
      queryClient.invalidateQueries({ queryKey: ['group', group?.id, 'details'] })
      queryClient.invalidateQueries({ queryKey: ['group', group?.id, 'addons'] })
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

    if (active.id !== over?.id) {
      // Use the same ID extraction logic as SortableAddonItem
      const getAddonId = (item: any) => {
        const manifest = item?.manifest || item
        return item?.id || item?.transportUrl || item?.manifestUrl || item?.url || manifest?.id || 'unknown'
      }

      const newAddons = arrayMove(
        addons,
        addons.findIndex((item) => getAddonId(item) === active.id),
        addons.findIndex((item) => getAddonId(item) === over.id)
      )
      setAddons(newAddons)
      
      // Update backend with new order
      if (group) {
        // Send addon IDs instead of URLs to handle duplicate URLs
        const orderedAddonIds = newAddons.map(addon => addon.id).filter(Boolean)
        console.log('Reorder payload:', { groupId: group.id, orderedAddonIds, newAddons })
        reorderAddonsMutation.mutate({
          groupId: group.id,
          orderedAddonIds
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
      queryClient.invalidateQueries({ queryKey: ['group', group?.id, 'addons'] })
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
      queryClient.invalidateQueries({ queryKey: ['group', group?.id, 'addons'] })
      queryClient.invalidateQueries({ queryKey: ['addons'] })
      // Also refresh all group details to update addon counts
      queryClient.refetchQueries({ queryKey: ['group'] })
      // Trigger sync status refresh for all users in the group
      if (group?.id) {
        refreshAllSyncStatus(group.id)
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
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex flex-col flex-1">
                <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 relative">
                  {/* Group Logo */}
                  <div 
                    ref={logoRef}
                    onClick={() => setShowColorPicker(!showColorPicker)}
                    className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 border-2 cursor-pointer transition-all hover:scale-105 ${
                      getColorBgClass(currentGroup.colorIndex || 0, isMono ? 'mono' : isDark ? 'dark' : 'light')
                    }`}
                    style={{ backgroundColor: getColorHexValue(currentGroup.colorIndex || 0, isMono ? 'mono' : isDark ? 'dark' : 'light') }}
                    title="Click to change color"
                  >
                    <span className="text-white font-semibold text-lg">
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
                          const addonCount = groupAddonsData?.addons?.length || 0
                          if (addonCount === 0) {
                            setConfirmGroupDeleteAllOpen(true)
                            return
                          }
                          try {
                            await groupsAPI.sync(group.id)
                            queryClient.invalidateQueries({ queryKey: ['group'] })
                            queryClient.invalidateQueries({ queryKey: ['group', group.id, 'details'] })
                            queryClient.invalidateQueries({ queryKey: ['users'] })
                            refreshAllSyncStatus(group.id)
                            toast.success('Group sync completed')
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
            <button
              onClick={onClose}
              className={`w-8 h-8 flex items-center justify-center rounded transition-colors border-0 ${
                isDark ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
              }`}
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
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
                  const addonCount = groupAddonsData?.addons?.length || 0
                  if (addonCount === 0) {
                    setConfirmGroupDeleteAllOpen(true)
                    // store a pending action
                    ;(window as any).__pendingUserSync = { userId, groupIdStr }
                    return
                  }
                  try {
                    await usersAPI.sync(userId, [], false)
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
            count={groupAddonsData?.addons?.length || 0}
            items={addons}
            isLoading={isLoadingGroupAddons}
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
            {!isLoadingGroupAddons && addons.length > 0 && (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                modifiers={[restrictToParentElement]}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={addons.map(addon => addon.id || addon.transportUrl || addon.manifestUrl).filter(Boolean)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-3">
                  {addons.map((addon: any, index: number) => (
                    <SortableAddonItem
                      key={addon.id || addon.transportUrl || addon.manifestUrl || index}
                      addon={addon}
                      onRemove={handleRemoveAddon}
                      showProtectButton={false}
                    />
                  ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
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

      {/* Confirm deletion when syncing with no group addons */}
      <ConfirmDialog
        open={confirmGroupDeleteAllOpen}
        title="Sync will remove all users' addons"
        description="This group has no addons. Syncing will delete all Stremio addons from its users. Continue?"
        confirmText="Delete all and Sync"
        cancelText="Cancel"
        isDanger={true}
        onCancel={() => { setConfirmGroupDeleteAllOpen(false); (window as any).__pendingUserSync = null }}
        onConfirm={async () => {
          setConfirmGroupDeleteAllOpen(false)
          const pending = (window as any).__pendingUserSync
          if (pending && pending.userId) {
            try {
              await usersAPI.sync(pending.userId, [], false)
              queryClient.invalidateQueries({ queryKey: ['users'] })
              queryClient.invalidateQueries({ queryKey: ['group', pending.groupIdStr, 'details'] })
              refreshAllSyncStatus(pending.groupIdStr, pending.userId)
              ;(window as any).__pendingUserSync = null
              toast.success('User sync completed')
            } catch (error: any) {
              toast.error(error?.response?.data?.message || 'Failed to sync user')
            }
            return
          }
          if (group?.id) {
            try {
              await groupsAPI.sync(group.id)
              queryClient.invalidateQueries({ queryKey: ['group'] })
              queryClient.invalidateQueries({ queryKey: ['group', group.id, 'details'] })
              queryClient.invalidateQueries({ queryKey: ['users'] })
              refreshAllSyncStatus(group.id)
              toast.success('Group sync completed')
            } catch (error: any) {
              toast.error(error?.response?.data?.message || 'Failed to sync group')
            }
          }
        }}
      />
    </div>,
    document.body
  )
}
