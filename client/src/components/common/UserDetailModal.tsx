import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '@/contexts/ThemeContext'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usersAPI, groupsAPI } from '@/services/api'
import toast from 'react-hot-toast'
import { VersionChip } from './'

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
  onDelete: (userId: string) => void
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
  onDelete,
  onSync,
  userExcludedSet,
  userProtectedSet,
  isSyncing
}: UserDetailModalProps) {
  const theme = useTheme()
  const { isDark, isModern, isModernDark, isMono } = theme
  const queryClient = useQueryClient()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Form state
  const [editFormData, setEditFormData] = useState({
    username: '',
    email: '',
    password: '',
    groupName: ''
  })

  // Stremio validation state
  const [isValidatingStremio, setIsValidatingStremio] = useState(false)
  const [stremioValidationError, setStremioValidationError] = useState<string | null>(null)
  const [isStremioValid, setIsStremioValid] = useState(true)

  // Initialize form data when user changes
  useEffect(() => {
    if (user) {
      setEditFormData({
        username: user.username || user.stremioUsername || '',
        email: user.email || user.stremioEmail || '',
        password: '',
        groupName: user.groupName || user.groups?.[0]?.name || ''
      })
    }
    setStremioValidationError(null)
    setIsStremioValid(true)
  }, [user])

  // Fetch user details
  const { data: editUserDetails } = useQuery({
    queryKey: ['user', user?.id],
    queryFn: () => usersAPI.getById(user!.id),
    enabled: !!user?.id,
  })

  // Fetch groups
  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: groupsAPI.getAll,
  })

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: ({ id, userData }: { id: string; userData: any }) => 
      usersAPI.update(id, userData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['user', user?.id] })
      toast.success('User updated successfully')
      onClose()
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to update user')
    }
  })

  // Check if credentials are changing
  const isChangingCredentials = editFormData.email !== (user?.email || user?.stremioEmail || '') || 
                               editFormData.password !== ''

  // Validate Stremio credentials when they change
  useEffect(() => {
    if (!isChangingCredentials || !editFormData.email || !editFormData.password) {
      setIsStremioValid(true)
      setStremioValidationError(null)
      return
    }

    const validateCredentials = async () => {
      setIsValidatingStremio(true)
      setStremioValidationError(null)
      
      try {
        // Simulate validation - in real app, this would call an API
        await new Promise(resolve => setTimeout(resolve, 1000))
        setIsStremioValid(true)
      } catch (error) {
        setIsStremioValid(false)
        setStremioValidationError('Invalid Stremio credentials')
      } finally {
        setIsValidatingStremio(false)
      }
    }

    const timeoutId = setTimeout(validateCredentials, 500)
    return () => clearTimeout(timeoutId)
  }, [editFormData.email, editFormData.password, isChangingCredentials])

  const handleUpdateUser = (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    if (!isStremioValid) {
      toast.error('Please fix Stremio credential errors before updating')
      return
    }

    const userData: any = {}
    
    if (editFormData.username.trim()) {
      userData.username = editFormData.username.trim()
    }
    
    if (editFormData.email.trim()) {
      userData.email = editFormData.email.trim()
    }
    
    if (editFormData.password.trim()) {
      userData.password = editFormData.password.trim()
    }
    
    userData.groupId = editFormData.groupName.trim()
    
    updateUserMutation.mutate({
      id: user.id,
      userData
    })
  }

  const handleDelete = () => {
    if (user) {
      onDelete(user.id)
      onClose()
    }
  }

  const handleSync = () => {
    if (user) {
      onSync(user.id)
    }
  }


  if (!isOpen || !user) return null

  // Don't render until mounted
  if (!mounted) {
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
      <div className={`w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg shadow-xl ${
        isDark ? 'bg-gray-800' : 'bg-white'
      }`}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Edit User: {user.username || user.stremioUsername}
            </h2>
            <button
              onClick={onClose}
              className={`w-8 h-8 flex items-center justify-center rounded transition-colors border-0 ${
                isDark ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
              }`}
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleUpdateUser} className="space-y-4">
            <div>
              <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                Username
              </label>
              <input
                type="text"
                value={editFormData.username}
                onChange={(e) => setEditFormData(prev => ({ ...prev, username: e.target.value }))}
                placeholder={user?.username || user?.stremioUsername || ''}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-stremio-purple focus:border-transparent ${
                  isDark 
                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                }`}
              />
            </div>

            <div>
              <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                Email
              </label>
              <input
                type="email"
                value={editFormData.email}
                onChange={(e) => {
                  setEditFormData(prev => ({ ...prev, email: e.target.value }))
                  setIsStremioValid(true)
                  setStremioValidationError(null)
                }}
                placeholder={user?.email || user?.stremioEmail || ''}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-stremio-purple focus:border-transparent ${
                  !isStremioValid && (editFormData.email || editFormData.password)
                    ? 'border-red-500 focus:ring-red-500'
                    : isDark 
                      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                }`}
              />
              {stremioValidationError && isChangingCredentials && (
                <p className="mt-1 text-sm text-red-600">{stremioValidationError}</p>
              )}
              {isValidatingStremio && (
                <p className="mt-1 text-sm text-blue-600">Validating Stremio credentials...</p>
              )}
            </div>

            <div>
              <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                Password (leave empty to keep current)
              </label>
              <input
                type="password"
                value={editFormData.password}
                onChange={(e) => {
                  setEditFormData(prev => ({ ...prev, password: e.target.value }))
                  setIsStremioValid(true)
                  setStremioValidationError(null)
                }}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-stremio-purple focus:border-transparent ${
                  !isStremioValid && (editFormData.email || editFormData.password)
                    ? 'border-red-500 focus:ring-red-500'
                    : isDark 
                      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                }`}
              />
            </div>

            <div>
              <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                Group
              </label>
              <select
                value={editFormData.groupName}
                onChange={(e) => setEditFormData(prev => ({ ...prev, groupName: e.target.value }))}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-stremio-purple focus:border-transparent ${
                  isDark 
                    ? 'bg-gray-700 border-gray-600 text-white' 
                    : 'bg-white border-gray-300 text-gray-900'
                }`}
              >
                <option value="">No group</option>
                {groups.map((group: any) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </div>

            {/* User's Addons Section */}
            {editUserDetails && (editUserDetails as any).addons && (editUserDetails as any).addons.length > 0 && (
              <div>
                <h3 className={`text-lg font-semibold mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  User's Addons ({(editUserDetails as any).addons.length})
                </h3>
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {(editUserDetails as any).addons.map((addon: any, index: number) => (
                    <div key={index} className={`p-3 rounded-lg border ${
                      isDark ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                            {addon.name || addon.manifest?.name || 'Unknown Addon'}
                          </h4>
                          {addon.manifest?.description && (
                            <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                              {addon.manifest.description.length > 50 
                                ? `${addon.manifest.description.substring(0, 50)}...` 
                                : addon.manifest.description}
                            </p>
                          )}
                        </div>
                        <div className={`px-2 py-1 rounded text-xs font-medium ${
                          isDark ? 'bg-green-900 text-green-200' : 'bg-green-100 text-green-800'
                        }`}>
                          Active
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
                Delete User
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
                {isSyncing ? 'Syncing...' : 'Sync User'}
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
                disabled={updateUserMutation.isPending || !isStremioValid || isValidatingStremio}
                className={`flex-1 px-4 py-2 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  isModern
                    ? 'bg-gradient-to-br from-purple-600 via-purple-700 to-blue-800 hover:from-purple-700 hover:via-purple-800 hover:to-blue-900'
                    : isModernDark
                    ? 'bg-gradient-to-br from-purple-800 via-purple-900 to-blue-900 hover:from-purple-900 hover:via-purple-950 hover:to-indigo-900'
                    : 'accent-bg accent-text'
                }`}
              >
                {updateUserMutation.isPending ? 'Updating...' : 
                 isValidatingStremio ? 'Validating...' :
                 !isStremioValid ? 'Fix Credentials First' : 'Update User'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body
  )
}
