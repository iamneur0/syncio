import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Search, Puzzle } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { useQuery } from '@tanstack/react-query'
import { addonsAPI } from '@/services/api'
import EntityList from './EntityList'
import AddonIcon from './AddonIcon'

interface AddonSelectModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectAddon: (addon: any) => void
  groupId: string
  excludeAddonIds?: string[]
}

export default function AddonSelectModal({ 
  isOpen, 
  onClose, 
  onSelectAddon,
  groupId,
  excludeAddonIds = []
}: AddonSelectModalProps) {
  const { isDark, isMono } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([])

  useEffect(() => {
    setMounted(true)
  }, [])

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        e.stopPropagation()
        e.preventDefault()
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape, { capture: true })
      return () => document.removeEventListener('keydown', handleEscape, { capture: true })
    }
  }, [isOpen, onClose])

  // Fetch all addons
  const { data: addons = [], isLoading } = useQuery({
    queryKey: ['addons'],
    queryFn: () => addonsAPI.getAll(),
    enabled: isOpen
  })

  // Filter addons based on search term and exclude already added addons
  const filteredAddons = addons.filter((addon: any) => {
    const matchesSearch = !searchTerm || 
      addon.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      addon.description?.toLowerCase().includes(searchTerm.toLowerCase())
    
    const notExcluded = !excludeAddonIds.includes(addon.id)
    
    return matchesSearch && notExcluded
  })

  const handleSelect = async () => {
    if (selectedAddonIds.length > 0) {
      const selectedAddons = addons.filter((a: any) => selectedAddonIds.includes(a.id))
      
      // Process all addons sequentially to avoid race conditions
      for (const addon of selectedAddons) {
        await onSelectAddon(addon)
      }
      
      onClose()
    }
  }

  const handleItemClick = (addonId: string) => {
    setSelectedAddonIds(prev => {
      if (prev.includes(addonId)) {
        // If already selected, remove it
        return prev.filter(id => id !== addonId)
      } else {
        // If not selected, add it
        return [...prev, addonId]
      }
    })
  }

  if (!isOpen || !mounted || typeof window === 'undefined' || !document.body) {
    return null
  }

  const renderAddonItem = (addon: any) => (
    <div 
      className={`p-3 rounded-lg cursor-pointer transition-colors ${
        isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-white hover:bg-gray-50'
      }`}
      onClick={() => handleItemClick(addon.id)}
    >
      <div className="flex items-center gap-3">
        <AddonIcon name={addon.name || 'Addon'} iconUrl={addon.iconUrl} size="10" className="flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h4 className={`font-medium truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
            {addon.name || 'Unknown Addon'}
          </h4>
          <p className={`text-sm truncate ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            {addon.description || 'No description'}
          </p>
        </div>
      </div>
    </div>
  )

  return createPortal(
    <div 
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[1000] p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div className={`w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-lg shadow-xl ${
        isDark ? 'bg-gray-800' : 'bg-white'
      }`}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Add Addon to Group
            </h2>
            <button
              onClick={onClose}
              className={`w-8 h-8 flex items-center justify-center rounded transition-colors border-0 ${
                isDark ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${
              isDark ? 'text-gray-400' : 'text-gray-500'
            }`} />
            <input
              type="text"
              placeholder="Search addons..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none ${
                isDark 
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              }`}
            />
          </div>

          {/* EntityList */}
          <div className="max-h-96 overflow-y-auto">
            <EntityList
              title=""
              count={filteredAddons.length}
              items={filteredAddons}
              isLoading={isLoading}
              renderItem={renderAddonItem}
              emptyIcon={<Puzzle className={`w-12 h-12 mx-auto mb-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />}
              emptyMessage={searchTerm ? 'No addons found matching your search' : 'No addons available to add'}
              getIsSelected={(addon) => selectedAddonIds.includes(addon.id)}
              onClearSelection={() => setSelectedAddonIds([])}
              layout="vertical"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={onClose}
              className={`px-4 py-2 rounded-lg transition-colors ${
                isDark 
                  ? 'text-gray-300 hover:text-white hover:bg-gray-700' 
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              Cancel
            </button>
            <button
              onClick={handleSelect}
              disabled={selectedAddonIds.length === 0}
              className={`px-4 py-2 rounded-lg transition-colors ${
                selectedAddonIds.length > 0
                  ? (isMono ? 'bg-white text-black hover:bg-gray-200' : 'accent-bg accent-text')
                  : (isDark ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'bg-gray-300 text-gray-500 cursor-not-allowed')
              }`}
            >
              Add to Group {selectedAddonIds.length > 0 && `(${selectedAddonIds.length})`}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
