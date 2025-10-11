import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '@/contexts/ThemeContext'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { groupsAPI, usersAPI, addonsAPI } from '@/services/api'
import toast from 'react-hot-toast'
import { VersionChip, SyncBadge } from './'
import { Users, Puzzle, Plus, Edit, Trash2, Copy, Eye } from 'lucide-react'

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
  onUpdate: (groupData: any) => void
  onDelete: (groupId: string) => void
  onClone: (group: any) => void
  onSync: (groupId: string) => void
  isSyncing: boolean
}

export default function GroupDetailModal({
  isOpen,
  onClose,
  group,
  onUpdate,
  onDelete,
  onClone,
  onSync,
  isSyncing
}: GroupDetailModalProps) {
  const theme = useTheme()
  const { isDark, isModern, isModernDark, isMono } = theme
  const queryClient = useQueryClient()

  // Form state
  const [editFormData, setEditFormData] = useState({
    name: '',
    description: '',
    isActive: true,
    colorIndex: 0
  })

  // Initialize form data when group changes
  useEffect(() => {
    if (group) {
      setEditFormData({
        name: group.name || '',
        description: group.description || '',
        isActive: group.isActive ?? true,
        colorIndex: group.colorIndex ?? 0
      })
    }
  }, [group])

  // Fetch group details
  const { data: groupDetails, isLoading: isLoadingGroupDetails } = useQuery({
    queryKey: ['group', group?.id, 'details'],
    queryFn: () => groupsAPI.getById(group!.id),
    enabled: !!group?.id,
  })

  // Fetch users and addons
  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: usersAPI.getAll,
  })

  const { data: addons = [] } = useQuery({
    queryKey: ['addons'],
    queryFn: addonsAPI.getAll,
  })

  // Update group mutation
  const updateGroupMutation = useMutation({
    mutationFn: ({ id, groupData }: { id: string; groupData: any }) => 
      groupsAPI.update(id, groupData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      queryClient.invalidateQueries({ queryKey: ['group', group?.id, 'details'] })
      toast.success('Group updated successfully')
      onClose()
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to update group')
    }
  })

  const handleUpdateGroup = (e: React.FormEvent) => {
    e.preventDefault()
    if (!group) return

    const groupData: any = {}
    
    if (editFormData.name.trim()) {
      groupData.name = editFormData.name.trim()
    }
    
    if (editFormData.description.trim()) {
      groupData.description = editFormData.description.trim()
    }
    
    groupData.isActive = editFormData.isActive
    groupData.colorIndex = editFormData.colorIndex
    
    updateGroupMutation.mutate({
      id: group.id,
      groupData
    })
  }

  const handleDelete = () => {
    if (group) {
      onDelete(group.id)
      onClose()
    }
  }

  const handleClone = () => {
    if (group) {
      onClone(group)
      onClose()
    }
  }

  const handleSync = () => {
    if (group) {
      onSync(group.id)
    }
  }


  if (!isOpen || !group) return null

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
                <div className="flex items-center gap-4">
                  <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {group.name}
                  </h2>
                  <SyncBadge 
                    groupId={group.id} 
                    onSync={handleSync}
                    isSyncing={isSyncing}
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
          <div className={`p-4 rounded-lg mb-6 ${isDark ? 'bg-gray-700' : 'bg-gray-50'}`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Members ({groupDetails?.users?.length || 0})
              </h3>
            </div>
            {isLoadingGroupDetails ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 accent-border"></div>
              </div>
            ) : groupDetails?.users && groupDetails.users.length > 0 ? (
              <div className="space-y-3">
                {groupDetails.users.map((member: any, index: number) => (
                  <div
                    key={member.id || index}
                    className={`relative rounded-lg border p-4 hover:shadow-md transition-all ${
                      isDark 
                        ? 'bg-gray-600 border-gray-500 hover:bg-gray-550' 
                        : 'bg-white border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center flex-1 min-w-0">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 flex-shrink-0 ${
                          isMono ? 'bg-black border border-white/20 text-white' : 'bg-gray-500 text-white'
                        }`}>
                          <span className="text-white font-semibold text-sm">
                            {member.username ? member.username.charAt(0).toUpperCase() : 
                             member.email ? member.email.charAt(0).toUpperCase() : 'U'}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className={`font-medium truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                            {member.username || member.email}
                          </h4>
                          <p className={`text-sm truncate ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            {member.email || 'No email'}
                          </p>
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
          <div className={`p-4 rounded-lg mb-6 ${isDark ? 'bg-gray-700' : 'bg-gray-50'}`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Addons ({groupDetails?.addons?.length || 0})
              </h3>
            </div>
            {isLoadingGroupDetails ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 accent-border"></div>
              </div>
            ) : groupDetails?.addons && groupDetails.addons.length > 0 ? (
              <div className="space-y-3">
                {groupDetails.addons.map((addon: any, index: number) => (
                  <div
                    key={addon.id || index}
                    className={`relative rounded-lg border p-4 hover:shadow-md transition-all ${
                      isDark 
                        ? 'bg-gray-600 border-gray-500 hover:bg-gray-550' 
                        : 'bg-white border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center flex-1 min-w-0">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center mr-3 flex-shrink-0 ${
                          isMono ? 'bg-black border border-white/20 text-white' : 'bg-gray-500 text-white'
                        }`}>
                          <Puzzle className="w-5 h-5 text-white" />
                        </div>
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
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Puzzle className={`w-12 h-12 mx-auto mb-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
                <p className={`${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  No addons in this group
                </p>
              </div>
            )}
          </div>

          {/* Edit Form */}
          <form onSubmit={handleUpdateGroup} className="space-y-4">
            <div>
              <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                Group Name
              </label>
              <input
                type="text"
                value={editFormData.name}
                onChange={(e) => setEditFormData(prev => ({ ...prev, name: e.target.value }))}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-stremio-purple focus:border-transparent ${
                  isDark 
                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                }`}
              />
            </div>

            <div>
              <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                Description
              </label>
              <textarea
                value={editFormData.description}
                onChange={(e) => setEditFormData(prev => ({ ...prev, description: e.target.value }))}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-stremio-purple focus:border-transparent ${
                  isDark 
                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                }`}
                rows={3}
              />
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="isActive"
                checked={editFormData.isActive}
                onChange={(e) => setEditFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                className="mr-3 rounded"
              />
              <label htmlFor="isActive" className={isDark ? 'text-gray-300' : 'text-gray-700'}>
                Active
              </label>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={handleDelete}
                className={`px-4 py-2 border rounded-lg transition-colors ${
                  isDark 
                    ? 'border-red-600 text-red-400 hover:bg-red-900/20' 
                    : 'border-red-300 text-red-600 hover:bg-red-50'
                }`}
              >
                Delete Group
              </button>
              <button
                type="button"
                onClick={handleClone}
                className={`px-4 py-2 border rounded-lg transition-colors ${
                  isDark 
                    ? 'border-blue-600 text-blue-400 hover:bg-blue-900/20' 
                    : 'border-blue-300 text-blue-600 hover:bg-blue-50'
                }`}
              >
                Clone Group
              </button>
              <button
                type="button"
                onClick={handleSync}
                disabled={isSyncing}
                className={`px-4 py-2 border rounded-lg transition-colors disabled:opacity-50 ${
                  isDark 
                    ? 'border-green-600 text-green-400 hover:bg-green-900/20' 
                    : 'border-green-300 text-green-600 hover:bg-green-50'
                }`}
              >
                {isSyncing ? 'Syncing...' : 'Sync Group'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className={`flex-1 px-4 py-2 border rounded-lg transition-colors ${
                  isDark 
                    ? 'border-gray-600 text-gray-300 hover:bg-gray-700' 
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={updateGroupMutation.isPending}
                className={`flex-1 px-4 py-2 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  isModern
                    ? 'bg-gradient-to-br from-purple-600 via-purple-700 to-blue-800 hover:from-purple-700 hover:via-purple-800 hover:to-blue-900'
                    : isModernDark
                    ? 'bg-gradient-to-br from-purple-800 via-purple-900 to-blue-900 hover:from-purple-900 hover:via-purple-950 hover:to-indigo-900'
                    : 'accent-bg accent-text'
                }`}
              >
                {updateGroupMutation.isPending ? 'Updating...' : 'Update Group'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body
  )
}
