import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { getColorHexValue, getThemePalette } from '@/utils/colorMapping'
import { useTheme } from '@/contexts/ThemeContext'
import { useModalState, useFormState } from '@/hooks/useCommonState'
import toast from 'react-hot-toast'

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
  const { isDark, isMono, isModern, isModernDark } = useTheme()
  const { mounted } = useModalState()
  const { formData, updateField, reset } = useFormState({
    groupName: '',
    groupDescription: '',
    colorIndex: 0,
    colorIndexRef: 0
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
    onCreateGroup({
      name: formData.groupName.trim(),
      description: formData.groupDescription.trim() || '',
      restrictions: 'none' as const,
      colorIndex: formData.colorIndexRef
    })
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  if (!isOpen) return null

  if (!mounted || typeof window === 'undefined' || !document.body) {
    return null
  }

  return createPortal(
    <div 
      className="fixed top-0 left-0 right-0 bottom-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-[1000] modal-root"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose()
        }
      }}
    >
      <div className={`rounded-lg max-w-md w-full p-6 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Create New Group</h2>
          <button
            onClick={handleClose}
            className={`w-8 h-8 flex items-center justify-center rounded transition-colors border-0 ${
              isDark ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <form
          className="space-y-4"
          onSubmit={handleSubmit}
        >
          <div>
            <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Group Name</label>
            <input
              type="text"
              placeholder="Group name"
              value={formData.groupName}
              onChange={(e) => updateField('groupName', e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none ${
                isDark 
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              }`}
            />
          </div>
          <div>
            <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Description</label>
            <textarea
              placeholder="Describe the purpose of this group..."
              rows={3}
              value={formData.groupDescription}
              onChange={(e) => updateField('groupDescription', e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none ${
                isDark 
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              }`}
            />
          </div>
          <div>
            <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Color</label>
            <div className="grid grid-cols-5 gap-2">
              {getThemePalette(isMono ? 'mono' : isDark ? 'dark' : 'light').map((colorOption, index) => {
                const actualColorIndex = index
                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() => {
                      updateField('colorIndex', actualColorIndex)
                      updateField('colorIndexRef', actualColorIndex)
                    }}
                    aria-pressed={formData.colorIndex === actualColorIndex}
                    className={`relative w-8 h-8 rounded-full border-2 transition ${formData.colorIndex === actualColorIndex ? 'border-white ring-2 ring-offset-2 ring-stremio-purple' : 'border-gray-300'}`}
                    style={{ 
                      backgroundColor: colorOption.hexValue
                    }}
                  >
                    {formData.colorIndex === actualColorIndex && (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="white" className="w-4 h-4">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-7.25 7.25a1 1 0 01-1.414 0l-3-3a1 1 0 111.414-1.414L8.5 11.586l6.543-6.543a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                isDark 
                  ? 'text-gray-300 hover:text-white hover:bg-gray-700' 
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating}
              className="flex-1 px-4 py-2 accent-bg accent-text rounded-lg transition-colors disabled:opacity-50"
            >
              {isCreating ? 'Creating...' : 'Create Group'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}
