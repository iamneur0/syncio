import React, { useState, useEffect } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { getTextClasses, getInputClasses, getButtonClasses } from '@/utils/themeUtils'
import BaseModal from './BaseModal'

interface AddonModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: AddonFormData) => void
  addon?: {
    id: string
    name: string
    description?: string
    manifestUrl: string
    version?: string
    isActive: boolean
    colorIndex?: number
    groupIds?: string[]
  } | null
  groups?: Array<{ id: string; name: string; colorIndex?: number }>
  isLoading?: boolean
}

interface AddonFormData {
  name: string
  description: string
  manifestUrl: string
  version: string
  isActive: boolean
  colorIndex: number
  groupIds: string[]
}

export default function AddonModal({
  isOpen,
  onClose,
  onSave,
  addon,
  groups = [],
  isLoading = false
}: AddonModalProps) {
  const theme = useTheme()
  const isEditing = !!addon
  
  const [formData, setFormData] = useState<AddonFormData>({
    name: '',
    description: '',
    manifestUrl: '',
    version: '',
    isActive: true,
    colorIndex: 0,
    groupIds: []
  })
  
  const [errors, setErrors] = useState<Partial<AddonFormData>>({})
  
  // Initialize form data when addon changes
  useEffect(() => {
    if (addon) {
      setFormData({
        name: addon.name || '',
        description: addon.description || '',
        manifestUrl: addon.manifestUrl || '',
        version: addon.version || '',
        isActive: addon.isActive ?? true,
        colorIndex: addon.colorIndex ?? 0,
        groupIds: addon.groupIds || []
      })
    } else {
      setFormData({
        name: '',
        description: '',
        manifestUrl: '',
        version: '',
        isActive: true,
        colorIndex: 0,
        groupIds: []
      })
    }
    setErrors({})
  }, [addon])
  
  const handleInputChange = (field: keyof AddonFormData, value: string | boolean | number | string[]) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }))
    }
  }
  
  const validateForm = (): boolean => {
    const newErrors: Partial<AddonFormData> = {}
    
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required'
    }
    
    if (!formData.manifestUrl.trim()) {
      newErrors.manifestUrl = 'Manifest URL is required'
    } else {
      try {
        new URL(formData.manifestUrl)
      } catch {
        newErrors.manifestUrl = 'Please enter a valid URL'
      }
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
      title={isEditing ? 'Edit Addon' : 'Add New Addon'}
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
            placeholder="Enter addon name"
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
            placeholder="Enter addon description"
            disabled={isLoading}
          />
        </div>
        
        {/* Manifest URL */}
        <div>
          <label className={`block text-sm font-medium mb-2 ${getTextClasses(theme, 'primary')}`}>
            Manifest URL *
          </label>
          <input
            type="url"
            value={formData.manifestUrl}
            onChange={(e) => handleInputChange('manifestUrl', e.target.value)}
            className={getInputClasses(theme, !!errors.manifestUrl)}
            placeholder="https://example.com/manifest.json"
            disabled={isLoading}
          />
          {errors.manifestUrl && (
            <p className="text-sm text-red-500 mt-1">{errors.manifestUrl}</p>
          )}
        </div>
        
        {/* Version */}
        <div>
          <label className={`block text-sm font-medium mb-2 ${getTextClasses(theme, 'primary')}`}>
            Version
          </label>
          <input
            type="text"
            value={formData.version}
            onChange={(e) => handleInputChange('version', e.target.value)}
            className={getInputClasses(theme, !!errors.version)}
            placeholder="1.0.0"
            disabled={isLoading}
          />
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
            {isLoading ? 'Saving...' : (isEditing ? 'Update Addon' : 'Add Addon')}
          </button>
        </div>
      </form>
    </BaseModal>
  )
}
