import React, { useState, useEffect } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { getTextClasses, getInputClasses, getButtonClasses } from '@/utils/themeUtils'
import BaseModal from './BaseModal'

interface UserModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: UserFormData) => void
  user?: {
    id: string
    name: string
    email?: string
    isActive: boolean
    colorIndex?: number
    groupIds?: string[]
  } | null
  groups?: Array<{ id: string; name: string; colorIndex?: number }>
  isLoading?: boolean
}

interface UserFormData {
  name: string
  email: string
  isActive: boolean
  colorIndex: number
  groupIds: string[]
}

export default function UserModal({
  isOpen,
  onClose,
  onSave,
  user,
  groups = [],
  isLoading = false
}: UserModalProps) {
  const theme = useTheme()
  const isEditing = !!user
  
  const [formData, setFormData] = useState<UserFormData>({
    name: '',
    email: '',
    isActive: true,
    colorIndex: 0,
    groupIds: []
  })
  
  const [errors, setErrors] = useState<Partial<UserFormData>>({})
  
  // Initialize form data when user changes
  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        email: user.email || '',
        isActive: user.isActive ?? true,
        colorIndex: user.colorIndex ?? 0,
        groupIds: user.groupIds || []
      })
    } else {
      setFormData({
        name: '',
        email: '',
        isActive: true,
        colorIndex: 0,
        groupIds: []
      })
    }
    setErrors({})
  }, [user])
  
  const handleInputChange = (field: keyof UserFormData, value: string | boolean | number | string[]) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }))
    }
  }
  
  const validateForm = (): boolean => {
    const newErrors: Partial<UserFormData> = {}
    
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required'
    }
    
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address'
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (validateForm()) {
      onSave(formData)
    }
  }
  
  const handleGroupToggle = (groupId: string) => {
    setFormData(prev => ({
      ...prev,
      groupIds: prev.groupIds.includes(groupId)
        ? prev.groupIds.filter(id => id !== groupId)
        : [...prev.groupIds, groupId]
    }))
  }
  
  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit User' : 'Add New User'}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Name */}
        <div>
          <label className={`block text-sm font-medium mb-2 ${getTextClasses(theme, 'primary')}`}>
            Name *
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => handleInputChange('name', e.target.value)}
            className={getInputClasses(theme, !!errors.name)}
            placeholder="Enter user name"
            disabled={isLoading}
          />
          {errors.name && (
            <p className="text-sm text-red-500 mt-1">{errors.name}</p>
          )}
        </div>
        
        {/* Email */}
        <div>
          <label className={`block text-sm font-medium mb-2 ${getTextClasses(theme, 'primary')}`}>
            Email
          </label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => handleInputChange('email', e.target.value)}
            className={getInputClasses(theme, !!errors.email)}
            placeholder="Enter email address"
            disabled={isLoading}
          />
          {errors.email && (
            <p className="text-sm text-red-500 mt-1">{errors.email}</p>
          )}
        </div>
        
        {/* Groups */}
        {groups.length > 0 && (
          <div>
            <label className={`block text-sm font-medium mb-2 ${getTextClasses(theme, 'primary')}`}>
              Groups
            </label>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {groups.map((group) => (
                <label key={group.id} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.groupIds.includes(group.id)}
                    onChange={() => handleGroupToggle(group.id)}
                    className="mr-3 rounded"
                    disabled={isLoading}
                  />
                  <span className={getTextClasses(theme, 'secondary')}>
                    {group.name}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
        
        {/* Active Status */}
        <div className="flex items-center">
          <input
            type="checkbox"
            id="isActive"
            checked={formData.isActive}
            onChange={(e) => handleInputChange('isActive', e.target.checked)}
            className="mr-3 rounded"
            disabled={isLoading}
          />
          <label htmlFor="isActive" className={getTextClasses(theme, 'primary')}>
            Active
          </label>
        </div>
        
        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-2 rounded transition-colors ${getButtonClasses(theme, 'secondary')}`}
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={`px-4 py-2 rounded transition-colors ${getButtonClasses(theme, 'primary')}`}
            disabled={isLoading}
          >
            {isLoading ? 'Saving...' : (isEditing ? 'Update User' : 'Add User')}
          </button>
        </div>
      </form>
    </BaseModal>
  )
}
