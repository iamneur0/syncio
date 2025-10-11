'use client'

import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Puzzle } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { getColorBgClass, getColorTextClass, getColorBorderClass } from '@/utils/colorMapping'
import { VersionChip } from './MicroUI'

interface AddonDetailModalProps {
  isOpen: boolean
  onClose: () => void
  addon: any
  groups: Array<{ id: string; name: string; colorIndex?: number }>
  onSave: (data: any) => void
  isLoading?: boolean
}

export default function AddonDetailModal({
  isOpen,
  onClose,
  addon,
  groups = [],
  onSave,
  isLoading = false
}: AddonDetailModalProps) {
  const { isDark, isModern, isModernDark, isMono } = useTheme()
  
  // Form state
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editUrl, setEditUrl] = useState('')
  const [editGroupIds, setEditGroupIds] = useState<string[]>([])
  const [editResources, setEditResources] = useState<any[]>([])
  
  // Inline editing state
  const [editingDetailAddonName, setEditingDetailAddonName] = useState<string | null>(null)
  const [tempDetailAddonName, setTempDetailAddonName] = useState('')
  
  // Initialize form data when addon changes
  useEffect(() => {
    if (addon) {
      setEditName(addon.name || '')
      setEditDescription(addon.description || '')
      setEditUrl(addon.manifestUrl || addon.url || '')
      setEditGroupIds(addon.groupIds || [])
      setEditResources(addon.resources || [])
    }
  }, [addon])

  // Helper function to get group color class
  const getGroupColorClass = (colorIndex: number | null | undefined) => {
    return getColorBgClass(colorIndex, isMono ? 'mono' : isModern ? 'modern' : isModernDark ? 'modern-dark' : isDark ? 'dark' : 'light')
  }

  // Helper function to get group border class
  const getGroupBorderClass = (colorIndex: number | null | undefined) => {
    return getColorBorderClass(colorIndex)
  }

  // Helper function to convert Tailwind classes to actual color values
  const getColorValue = (tailwindClass: string): string => {
    const colorMap: { [key: string]: string } = {
      'bg-red-500': '#ef4444',
      'bg-orange-500': '#f97316',
      'bg-yellow-500': '#eab308',
      'bg-green-500': '#22c55e',
      'bg-blue-500': '#3b82f6',
      'bg-purple-500': '#a855f7',
      'bg-pink-500': '#ec4899',
      'bg-indigo-500': '#6366f1',
      'bg-teal-500': '#14b8a6',
      'bg-cyan-500': '#06b6d4',
      'bg-lime-500': '#84cc16',
      'bg-amber-500': '#f59e0b',
      'bg-emerald-500': '#10b981',
      'bg-sky-500': '#0ea5e9',
      'bg-violet-500': '#8b5cf6',
      'bg-fuchsia-500': '#d946ef',
      'bg-rose-500': '#f43f5e',
    }
    return colorMap[tailwindClass] || '#6b7280'
  }

  // Inline editing handlers
  const handleStartEditDetailAddonName = (currentName: string) => {
    setTempDetailAddonName(currentName)
    setEditingDetailAddonName(addon?.id || null)
  }

  const handleBlurDetailAddonName = (originalName: string) => {
    if (tempDetailAddonName.trim()) {
      if (tempDetailAddonName.trim() !== originalName) {
        const newName = tempDetailAddonName.trim()
        setEditName(newName)
      }
    }
    setEditingDetailAddonName(null)
    setTempDetailAddonName('')
  }

  const handleSaveDetailAddonName = (originalName: string) => {
    if (tempDetailAddonName.trim()) {
      if (tempDetailAddonName.trim() !== originalName) {
        const newName = tempDetailAddonName.trim()
        setEditName(newName)
      }
    }
    setEditingDetailAddonName(null)
    setTempDetailAddonName('')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    const updateData: any = {}
    
    if (editName.trim()) {
      updateData.name = editName.trim()
    }
    
    if (editDescription.trim()) {
      updateData.description = editDescription.trim()
    }
    
    if (editUrl.trim()) {
      updateData.url = editUrl.trim()
    }
    
    updateData.groupIds = editGroupIds
    if (Array.isArray(editResources)) updateData.resources = editResources

    onSave(updateData)
  }

  const handleGroupToggle = (groupId: string) => {
    setEditGroupIds(prev => 
      prev.includes(groupId) 
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    )
  }


  if (!isOpen || !addon) return null

  return createPortal(
    <div 
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[1000]"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div className={`w-full max-w-md p-6 rounded-lg shadow-xl ${
        isDark ? 'bg-gray-800' : 'bg-white'
      }`}>
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-4 flex-1 mr-4">
            {/* Addon Logo */}
            <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden ${
              isMono ? '' : ''
            }`}>
              {addon.iconUrl ? (
                <img 
                  src={addon.iconUrl} 
                  alt={`${addon.name} logo`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Puzzle className={`w-6 h-6 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
              )}
            </div>
            
            {/* Editable Addon Name and Version */}
            <div className="flex-1">
              <div className="flex items-center gap-4">
                {editingDetailAddonName === addon.id ? (
                  <input
                    type="text"
                    value={tempDetailAddonName}
                    onChange={(e) => setTempDetailAddonName(e.target.value)}
                    onBlur={() => handleBlurDetailAddonName(addon?.name || '')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveDetailAddonName(addon?.name || '')
                      } else if (e.key === 'Escape') {
                        setEditingDetailAddonName(null)
                        setTempDetailAddonName('')
                      }
                    }}
                    placeholder={addon?.name || ''}
                    className={`px-2 py-1 text-xl font-bold border rounded focus:ring-2 focus:ring-stremio-purple focus:border-transparent w-48 ${
                      isDark 
                        ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                    }`}
                    autoFocus
                  />
                ) : (
                  <h2 
                    className={`text-xl font-bold cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-2 py-1 rounded transition-colors ${isDark ? 'text-white' : 'text-gray-900'}`}
                    onClick={() => handleStartEditDetailAddonName(editName || addon?.name || '')}
                    title="Click to edit addon name"
                  >
                    {editName || addon?.name || 'Unnamed Addon'}
                  </h2>
                )}
                
                {/* Version Tag */}
                {addon?.version && (
                  <VersionChip version={addon.version} />
                )}
              </div>
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
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Resources Section */}
          {addon.resources && Array.isArray(addon.resources) && addon.resources.length > 0 && (
            <div>
              <label className={`${isDark ? 'text-gray-300' : 'text-gray-700'} block text-sm font-medium mb-2`}>
                Resources
              </label>
              <div className="flex flex-wrap gap-2">
                {addon.resources.map((res: any, idx: number) => {
                  const label = typeof res === 'string' ? res : (res?.name || res?.type || JSON.stringify(res))
                  const selected = editResources.some((s) => {
                    const sl = typeof s === 'string' ? s : (s?.name || s?.type || JSON.stringify(s))
                    return sl === label
                  })
                  
                  return (
                    <button
                      type="button"
                      key={idx}
                      onClick={() => {
                        setEditResources((prev) => {
                          const exists = selected
                          if (exists) {
                            return prev.filter((p) => {
                              const pl = typeof p === 'string' ? p : (p?.name || p?.type || JSON.stringify(p))
                              return pl !== label
                            })
                          }
                          return [...prev, res]
                        })
                      }}
                      className={`px-3 py-1 rounded-full text-xs font-medium border ${
                        selected
                          ? 'accent-bg accent-text border accent-border'
                          : (isDark ? 'bg-gray-700 text-gray-200 border-gray-600' : 'bg-gray-100 text-gray-800 border-gray-300')
                      }`}
                      title={typeof res === 'string' ? res : (res?.name || res?.type || 'Resource')}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Description
            </label>
            <textarea
              rows={3}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder={addon?.description || ''}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-stremio-purple focus:border-transparent ${
                isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              }`}
            />
          </div>

          {/* URL */}
          <div>
            <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              URL
            </label>
            <input
              type="url"
              value={editUrl}
              onChange={(e) => setEditUrl(e.target.value)}
              placeholder={addon?.url || ''}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-stremio-purple focus:border-transparent ${
                isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              }`}
            />
          </div>

          {/* Associated Groups */}
          <div>
            <label className={`block text-sm font-medium mb-3 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Associated Groups
            </label>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-auto">
              {groups.map((group: any) => {
                const active = editGroupIds.includes(group.id)
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => handleGroupToggle(group.id)}
                    className={`group flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all duration-200 ${
                      active 
                        ? `accent-bg accent-text border accent-border ${isMono ? '' : 'shadow-md'}` 
                        : isDark 
                          ? `bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600 hover:border-gray-500 ${isMono ? '' : ''}` 
                          : `bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200 hover:border-gray-400 ${isMono ? '' : ''}`
                    }`}
                  >
                    <div 
                      className={`w-10 h-10 rounded-lg flex items-center justify-center text-white border ${!isMono ? `${getGroupColorClass(group?.colorIndex)} ${getGroupBorderClass(group?.colorIndex)}` : ''}`}
                      style={isMono ? { backgroundColor: getColorValue(getGroupColorClass(group?.colorIndex)), borderColor: getColorValue(getGroupBorderClass(group?.colorIndex)) } : undefined}
                    >
                      <span className="text-sm font-semibold">
                        {group.name ? group.name.charAt(0).toUpperCase() : 'G'}
                      </span>
                    </div>
                    <span>{group.name}</span>
                  </button>
                )
              })}
            </div>
            {groups.length === 0 && (
              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                No groups available
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                isDark 
                  ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${
                isModern
                  ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700'
                  : isModernDark
                  ? 'bg-gradient-to-r from-purple-700 to-blue-700 text-white hover:from-purple-800 hover:to-blue-800'
                  : isMono
                  ? 'bg-white text-black hover:bg-gray-100'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {isLoading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}
