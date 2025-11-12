import React, { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, Users, Puzzle, Plus } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { getEntityColorStyles } from '@/utils/colorMapping'
import { useModalState, useFormState } from '@/hooks/useCommonState'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { groupsAPI, usersAPI, addonsAPI } from '@/services/api'
import { invalidateGroupQueries } from '@/utils/queryUtils'
import { groupSuccessHandlers } from '@/utils/toastUtils'
import toast from 'react-hot-toast'
import { ColorPicker } from '@/components/layout'
import { EntityList, UserItem, SortableAddonItem } from '@/components/entities'
import { UserSelectModal, AddonSelectModal } from '@/components/modals'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { restrictToParentElement } from '@dnd-kit/modifiers'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'

interface GroupAddModalProps {
  isOpen: boolean
  onClose: () => void
  onCreateGroup: (groupData: {
    name: string
    description: string
    restrictions: 'none'
    colorIndex: number
  }) => void
  isCreating: boolean
}

export default function GroupAddModal({ 
  isOpen, 
  onClose, 
  onCreateGroup, 
  isCreating 
}: GroupAddModalProps) {
  const { mounted } = useModalState()
  const { formData, updateField, reset } = useFormState({
    groupName: '',
    groupDescription: '',
    colorIndex: 0,
    colorIndexRef: 0
  })
  const { theme } = useTheme()
  const logoRef = useRef<HTMLDivElement>(null)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [selectedUsers, setSelectedUsers] = useState<any[]>([])
  const [selectedAddons, setSelectedAddons] = useState<any[]>([])
  const [showUserSelectModal, setShowUserSelectModal] = useState(false)
  const [showAddonSelectModal, setShowAddonSelectModal] = useState(false)
  const queryClient = useQueryClient()

  // Drag and drop sensors (needed for SortableAddonItem even if we don't use drag)
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const colorStyles = useMemo(
    () => getEntityColorStyles(theme, formData.colorIndex),
    [theme, formData.colorIndex]
  )

  // Fetch users and addons for selection
  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: usersAPI.getAll,
    enabled: isOpen,
  })

  const { data: allAddons = [] } = useQuery({
    queryKey: ['addons'],
    queryFn: addonsAPI.getAll,
    enabled: isOpen,
  })

  // Create group mutation
  const createGroupMutation = useMutation({
    mutationFn: async (groupData: {
      name: string
      description: string
      restrictions: 'none'
      colorIndex: number
    }) => {
      // Create the group first
      const newGroup = await groupsAPI.create(groupData)
      
      // Then add all selected users
      for (const user of selectedUsers) {
        try {
          await groupsAPI.addUser(newGroup.id, user.id)
        } catch (error: any) {
          console.error(`Failed to add user ${user.id} to group:`, error)
          // Continue with other users even if one fails
        }
      }
      
      // Then add all selected addons
      for (const addon of selectedAddons) {
        try {
          await groupsAPI.addAddon(newGroup.id, addon.id)
        } catch (error: any) {
          console.error(`Failed to add addon ${addon.id} to group:`, error)
          // Continue with other addons even if one fails
        }
      }
      
      return newGroup
    },
    onSuccess: () => {
      invalidateGroupQueries(queryClient, undefined)
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['addons'] })
      groupSuccessHandlers.create()
      handleClose()
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to create group')
    }
  })

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        e.preventDefault()
        handleClose()
      }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true } as any)
  }, [isOpen])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.groupName.trim()) {
      toast.error('Group name is required')
      return
    }
    createGroupMutation.mutate({
      name: formData.groupName.trim(),
      description: formData.groupDescription.trim() || '',
      restrictions: 'none' as const,
      colorIndex: formData.colorIndexRef
    })
  }

  const handleClose = () => {
    reset()
    setSelectedUsers([])
    setSelectedAddons([])
    onClose()
  }

  const handleRemoveUser = (userId: string) => {
    setSelectedUsers(prev => prev.filter(u => u.id !== userId))
  }

  const handleRemoveAddon = (addonId: string) => {
    setSelectedAddons(prev => prev.filter(a => {
      // Match the same ID extraction logic as SortableAddonItem
      const manifest = a?.manifest || a
      const id = a?.id || a?.transportUrl || a?.manifestUrl || a?.url || manifest?.id || 'unknown'
      return id !== addonId
    }))
  }

  const handleSelectUser = (user: any) => {
    if (!selectedUsers.find(u => u.id === user.id)) {
      setSelectedUsers(prev => [...prev, user])
    }
    setShowUserSelectModal(false)
  }

  const handleSelectAddon = (addon: any) => {
    if (!selectedAddons.find(a => a.id === addon.id)) {
      setSelectedAddons(prev => [...prev, addon])
    }
    setShowAddonSelectModal(false)
  }

  // Drag and drop handler for reordering addons
  const handleDragEnd = (event: any) => {
    const { active, over } = event

    if (active.id !== over?.id) {
      // Use the same ID extraction logic as SortableAddonItem
      const getAddonId = (item: any) => {
        const manifest = item?.manifest || item
        return item?.id || item?.transportUrl || item?.manifestUrl || item?.url || manifest?.id || 'unknown'
      }

      const newAddons = arrayMove(
        selectedAddons,
        selectedAddons.findIndex((item) => getAddonId(item) === active.id),
        selectedAddons.findIndex((item) => getAddonId(item) === over.id)
      )
      setSelectedAddons(newAddons)
    }
  }

  if (!isOpen) return null

  if (!mounted || typeof window === 'undefined' || !document.body) {
    return null
  }

  return createPortal(
    <div 
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[1000] p-4 overflow-x-hidden"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose()
        }
      }}
    >
      <div
        className={`relative w-full max-w-4xl max-h-[90vh] overflow-y-auto overflow-x-hidden rounded-lg shadow-xl card`}
        style={{ background: 'var(--color-background)' }}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex flex-col flex-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 relative">
                  {/* Group Logo */}
                  <div 
                    ref={logoRef}
                    onClick={() => setShowColorPicker(!showColorPicker)}
                    className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 cursor-pointer transition-all hover:scale-105"
                    title="Click to change color"
                    style={{
                      background: colorStyles.background,
                      color: colorStyles.textColor,
                    }}
                  >
                    <span className="font-semibold text-lg" style={{ color: colorStyles.textColor }}>
                      {(formData.groupName || 'Group').charAt(0).toUpperCase()}
                    </span>
                  </div>
                  
                  {/* Color Picker */}
                  <ColorPicker
                    currentColorIndex={formData.colorIndex}
                    onColorChange={(next) => {
                      updateField('colorIndex', next)
                      updateField('colorIndexRef', next)
                      setShowColorPicker(false)
                    }}
                    isOpen={showColorPicker}
                    onClose={() => setShowColorPicker(false)}
                    triggerRef={logoRef}
                  />
                  
                  <div className="flex flex-col min-w-0">
                    <label className="sr-only" htmlFor="group-name-input">
                      Group Name
                    </label>
                    <input
                      id="group-name-input"
                      type="text"
                      value={formData.groupName}
                      onChange={(e) => updateField('groupName', e.target.value)}
                      placeholder="Group name *"
                      required
                      className="text-lg font-semibold bg-transparent border-none focus:outline-none focus:ring-0 p-0 m-0 color-text"
                    />
                    <label className="sr-only" htmlFor="group-description-header">
                      Group description
                    </label>
                    <input
                      id="group-description-header"
                      type="text"
                      value={formData.groupDescription}
                      onChange={(e) => updateField('groupDescription', e.target.value)}
                      placeholder="Description (optional)"
                      className="text-sm bg-transparent border-none focus:outline-none focus:ring-0 p-0 m-0 color-text-secondary placeholder:color-text-secondary/70"
                    />
                  </div>
                </div>
              </div>
            </div>
          <button
            onClick={handleClose}
            className={`w-8 h-8 flex items-center justify-center rounded transition-colors border-0 color-hover`}
              aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

          {/* Group Users */}
          <EntityList
            title="Users"
            count={selectedUsers.length}
            items={selectedUsers}
            isLoading={false}
            onClear={() => setSelectedUsers([])}
            confirmReset={{
              title: 'Clear Selected Users',
              description: 'Remove all selected users from this group?',
              confirmText: 'Clear',
              isDanger: false,
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
                groupId=""
                onRemove={handleRemoveUser}
                onSync={async () => {}}
              />
            )}
            emptyIcon={<Users className={`w-12 h-12 mx-auto mb-4 color-text-secondary`} />}
            emptyMessage="No users selected for this group"
          />

          {/* Group Addons */}
          <EntityList
            title="Addons"
            count={selectedAddons.length}
            items={selectedAddons}
            isLoading={false}
            renderItem={() => null as any}
            isDraggable={true}
            onClear={() => setSelectedAddons([])}
            confirmReset={{
              title: 'Clear Selected Addons',
              description: 'Remove all selected addons from this group?',
              confirmText: 'Clear',
              isDanger: false,
            }}
            actionButton={{
              icon: <Plus className="w-4 h-4" />,
              onClick: () => setShowAddonSelectModal(true),
              tooltip: 'Add addon to group'
            }}
            emptyIcon={<Puzzle className={`w-12 h-12 mx-auto mb-4 color-text-secondary`} />}
            emptyMessage="No addons selected for this group"
          >
            {selectedAddons.length > 0 && (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                modifiers={[restrictToParentElement]}
                onDragEnd={handleDragEnd}
                  >
                <SortableContext 
                  items={selectedAddons.map(addon => addon.id || addon.transportUrl || addon.manifestUrl).filter(Boolean)} 
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-3">
                    {selectedAddons.map((addon: any, index: number) => (
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

          {/* Action Buttons */}
          <div className="flex gap-3 pt-6 mt-6">
            <button
              type="button"
              onClick={handleClose}
              className={`flex-1 px-4 py-2 rounded-lg transition-colors color-text-secondary color-hover`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={createGroupMutation.isPending || isCreating}
              className="flex-1 px-4 py-2 color-surface rounded-lg transition-colors disabled:opacity-50"
            >
              {createGroupMutation.isPending || isCreating ? 'Creating...' : 'Create Group'}
            </button>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showUserSelectModal && (
        <UserSelectModal
          isOpen={showUserSelectModal}
          onClose={() => setShowUserSelectModal(false)}
          onSelectUser={handleSelectUser}
          groupId=""
          excludeUserIds={selectedUsers.map(u => u.id)}
        />
      )}

      {showAddonSelectModal && (
        <AddonSelectModal
          isOpen={showAddonSelectModal}
          onClose={() => setShowAddonSelectModal(false)}
          onSelectAddon={handleSelectAddon}
          groupId=""
          excludeAddonIds={selectedAddons.map(a => a.id)}
        />
      )}
    </div>,
    document.body
  )
}
