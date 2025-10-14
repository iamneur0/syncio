import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '@/contexts/ThemeContext'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { groupsAPI, usersAPI, addonsAPI } from '@/services/api'
import { useSyncStatusRefresh } from '@/hooks/useSyncStatusRefresh'
import { getColorBgClass, getColorHexValue } from '@/utils/colorMapping'
import toast from 'react-hot-toast'
import { VersionChip, SyncBadge, EntityList, MemberItem, AddonItem, UserSelectModal, AddonSelectModal, InlineEdit, ColorPicker } from './'
import { Users, Puzzle, Plus } from 'lucide-react'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
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
    members?: number
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

  // Update addons when group details change
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

  // Remove member from group mutation
  const removeMemberMutation = useMutation({
    mutationFn: ({ groupId, userId }: { groupId: string; userId: string }) => 
      groupsAPI.removeMember(groupId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group'] })
      queryClient.invalidateQueries({ queryKey: ['group', group?.id, 'details'] })
      queryClient.invalidateQueries({ queryKey: ['users'] })
      // Also refresh all group details to update member counts
      queryClient.refetchQueries({ queryKey: ['group'] })
      // Trigger sync status refresh
      refreshAllSyncStatus(group?.id)
      toast.success('Member removed from group')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to remove member from group')
    }
  })

  const handleRemoveMember = (userId: string) => {
    if (group) {
      removeMemberMutation.mutate({
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
      // Trigger sync status refresh
      refreshAllSyncStatus(group?.id)
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
      // Trigger sync status refresh
      refreshAllSyncStatus(group?.id)
      toast.success('Addon removed from group')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to remove addon from group')
    }
  })

  // Add member to group mutation
  const addMemberMutation = useMutation({
    mutationFn: ({ groupId, userId }: { groupId: string; userId: string }) => 
      groupsAPI.addMember(groupId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group'] })
      queryClient.invalidateQueries({ queryKey: ['group', group?.id, 'details'] })
      queryClient.invalidateQueries({ queryKey: ['users'] })
      // Also refresh all group details to update member counts
      queryClient.refetchQueries({ queryKey: ['group'] })
      toast.success('Member added to group')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to add member to group')
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
        await groupsAPI.addMember(group.id, user.id)
        // Invalidate all group-related queries to update member counts
        queryClient.invalidateQueries({ queryKey: ['group'] })
        queryClient.invalidateQueries({ queryKey: ['group', group.id, 'details'] })
        queryClient.invalidateQueries({ queryKey: ['users'] })
        // Also refresh all group details to update member counts
        queryClient.refetchQueries({ queryKey: ['group'] })
        toast.success(`Added ${user.username || user.email} to group`)
      } catch (error: any) {
        toast.error(error?.response?.data?.message || `Failed to add ${user.username || user.email} to group`)
      }
    }
  }

  const handleSelectAddon = async (addon: any) => {
    if (group) {
      try {
        await groupsAPI.addAddon(group.id, addon.id)
        // Invalidate all group-related queries to update addon counts
        queryClient.invalidateQueries({ queryKey: ['group'] })
        queryClient.invalidateQueries({ queryKey: ['group', group.id, 'details'] })
        queryClient.invalidateQueries({ queryKey: ['addons'] })
        // Also refresh all group details to update addon counts
        queryClient.refetchQueries({ queryKey: ['group'] })
        toast.success(`Added ${addon.name} to group`)
      } catch (error: any) {
        toast.error(error?.response?.data?.message || `Failed to add ${addon.name} to group`)
      }
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
      <div ref={setNodeRef} style={style}>
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
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[1000] p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
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
                        await groupsAPI.sync(group.id)
                        queryClient.invalidateQueries({ queryKey: ['group'] })
                        queryClient.invalidateQueries({ queryKey: ['group', group.id, 'details'] })
                        queryClient.invalidateQueries({ queryKey: ['users'] })
                        // Trigger sync status refresh
                        refreshAllSyncStatus(group.id)
                        toast.success('Group sync completed')
                      } catch (error: any) {
                        toast.error(error?.response?.data?.message || 'Failed to sync group')
                      }
                    }}
                    isSyncing={false}
                  />
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Users className={`w-4 h-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
                      <span className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                        {group.members || 0}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Puzzle className={`w-4 h-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
                      <span className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                        {group.addons || 0}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    className={`w-8 h-8 flex items-center justify-center rounded transition-colors border-0 ${
                      isDark ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    ✕
                  </button>
                </div>
              </div>
              {group.description && (
                <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  {group.description}
                </p>
              )}
            </div>
          </div>

          {/* Group Members */}
          <EntityList
            title="Members"
            count={groupDetails?.users?.length || 0}
            items={groupDetails?.users || []}
            isLoading={isLoadingGroupDetails}
            onClear={() => {
              groupDetails?.users?.forEach((member: any) => {
                handleRemoveMember(member.id)
              })
            }}
            confirmReset={{
              title: 'Reset Group Members',
              description: 'Remove all members from this group? This cannot be undone.',
              confirmText: 'Reset',
              isDanger: true,
            }}
            actionButton={{
              icon: <Plus className="w-4 h-4" />,
              onClick: () => setShowUserSelectModal(true),
              tooltip: 'Add member to group'
            }}
            renderItem={(member: any, index: number) => (
              <MemberItem
                key={member.id || index}
                member={member}
                groupId={group.id}
                onRemove={handleRemoveMember}
                onSync={async (userId: string, groupId: string) => {
                  try {
                    await usersAPI.sync(userId, groupId)
                    queryClient.invalidateQueries({ queryKey: ['users'] })
                    queryClient.invalidateQueries({ queryKey: ['group', groupId, 'details'] })
                    refreshAllSyncStatus(groupId, userId)
                    toast.success(`Synced ${member.username || member.email}`)
                  } catch (error: any) {
                    toast.error(error?.response?.data?.message || `Failed to sync ${member.username || member.email}`)
                  }
                }}
              />
            )}
            emptyIcon={<Users className={`w-12 h-12 mx-auto mb-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />}
            emptyMessage="No members in this group"
          />

          {/* Group Addons */}
          <EntityList
            title="Addons"
            count={groupDetails?.addons?.length || 0}
            items={addons}
            isLoading={isLoadingGroupDetails}
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
