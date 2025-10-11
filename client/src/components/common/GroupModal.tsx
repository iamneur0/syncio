import React, { useState, useEffect } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { getTextClasses, getInputClasses, getButtonClasses } from '@/utils/themeUtils'
import BaseModal from './BaseModal'

interface GroupModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: GroupFormData) => void
  group?: {
    id: string
    name: string
    description?: string
    isActive: boolean
    colorIndex?: number
    memberIds?: string[]
    addonIds?: string[]
  } | null
  users?: Array<{ id: string; name: string; colorIndex?: number }>
  addons?: Array<{ id: string; name: string; colorIndex?: number }>
  isLoading?: boolean
}

interface GroupFormData {
  name: string
  description: string
  isActive: boolean
  colorIndex: number
  memberIds: string[]
  addonIds: string[]
}

export default function GroupModal({
  isOpen,
  onClose,
  onSave,
  group,
  users = [],
  addons = [],
  isLoading = false
}: GroupModalProps) {
  const theme = useTheme()
  const isEditing = !!group
  
  const [formData, setFormData] = useState<GroupFormData>({
    name: '',
    description: '',
    isActive: true,
    colorIndex: 0,
    memberIds: [],
    addonIds: []
  })
  
  const [errors, setErrors] = useState<Partial<GroupFormData>>({})
  
  // Initialize form data when group changes
  useEffect(() => {
    if (group) {
      setFormData({
        name: group.name || '',
        description: group.description || '',
        isActive: group.isActive ?? true,
        colorIndex: group.colorIndex ?? 0,
        memberIds: group.memberIds || [],
        addonIds: group.addonIds || []
      })
    } else {
      setFormData({
        name: '',
        description: '',
        isActive: true,
        colorIndex: 0,
        memberIds: [],
        addonIds: []
      })
    }
    setErrors({})
  }, [group])
  
  const handleInputChange = (field: keyof GroupFormData, value: string | boolean | number | string[]) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }))
    }
  }
  
  const validateForm = (): boolean => {
    const newErrors: Partial<GroupFormData> = {}
    
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required'
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
  
  const handleMemberToggle = (userId: string) => {
    setFormData(prev => ({
      ...prev,
      memberIds: prev.memberIds.includes(userId)
        ? prev.memberIds.filter(id => id !== userId)
        : [...prev.memberIds, userId]
    }))
  }
  
  const handleAddonToggle = (addonId: string) => {
    setFormData(prev => ({
      ...prev,
      addonIds: prev.addonIds.includes(addonId)
        ? prev.addonIds.filter(id => id !== addonId)
        : [...prev.addonIds, addonId]
    }))
  }
  
  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Group' : 'Add New Group'}
      size="lg"
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
            placeholder="Enter group name"
            disabled={isLoading}
          />
          {errors.name && (
            <p className="text-sm text-red-500 mt-1">{errors.name}</p>
          )}
        </div>
        
        {/* Description */}
        <div>
          <label className={`block text-sm font-medium mb-2 ${getTextClasses(theme, 'primary')}`}>
            Description
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => handleInputChange('description', e.target.value)}
            className={getInputClasses(theme, !!errors.description) + ' min-h-[80px] resize-none'}
            placeholder="Enter group description"
            disabled={isLoading}
          />
        </div>
        
        {/* Members */}
        {users.length > 0 && (
          <div>
            <label className={`block text-sm font-medium mb-2 ${getTextClasses(theme, 'primary')}`}>
              Members
            </label>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {users.map((user) => (
                <label key={user.id} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.memberIds.includes(user.id)}
                    onChange={() => handleMemberToggle(user.id)}
                    className="mr-3 rounded"
                    disabled={isLoading}
                  />
                  <span className={getTextClasses(theme, 'secondary')}>
                    {user.name}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
        
        {/* Addons */}
        {addons.length > 0 && (
          <div>
            <label className={`block text-sm font-medium mb-2 ${getTextClasses(theme, 'primary')}`}>
              Addons
            </label>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {addons.map((addon) => (
                <label key={addon.id} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.addonIds.includes(addon.id)}
                    onChange={() => handleAddonToggle(addon.id)}
                    className="mr-3 rounded"
                    disabled={isLoading}
                  />
                  <span className={getTextClasses(theme, 'secondary')}>
                    {addon.name}
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
            {isLoading ? 'Saving...' : (isEditing ? 'Update Group' : 'Add Group')}
          </button>
        </div>
      </form>
    </BaseModal>
  )
}
