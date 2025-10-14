import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { getColorBgClass, getColorHexValue } from '@/utils/colorMapping'

interface AddonAddModalProps {
  isOpen: boolean
  onClose: () => void
  onAddAddon: (addonData: {
    name: string
    url: string
    description: string
    groupIds: string[]
    manifestData: any
  }) => void
  isCreating: boolean
  groups?: any[]
}

export default function AddonAddModal({ 
  isOpen, 
  onClose, 
  onAddAddon, 
  isCreating,
  groups = []
}: AddonAddModalProps) {
  const { isDark, isMono } = useTheme()
  const [mounted, setMounted] = useState(false)
  
  // Debug modal props
  useEffect(() => {
    console.log('AddonAddModal - isOpen changed:', isOpen, 'mounted:', mounted)
  }, [isOpen, mounted])
  const [addonName, setAddonName] = useState('')
  const [addonUrl, setAddonUrl] = useState('')
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([])
  const [urlError, setUrlError] = useState<string>('')
  const [isLoadingManifest, setIsLoadingManifest] = useState(false)
  const [manifestData, setManifestData] = useState<any>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

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

  // Validate URL and load manifest
  useEffect(() => {
    if (!addonUrl.trim()) {
      setUrlError('')
      setManifestData(null)
      return
    }

    const urlPattern = /^https?:\/\/.+\.json$/
    if (!urlPattern.test(addonUrl.trim())) {
      setUrlError('URL must be a valid JSON manifest URL')
      setManifestData(null)
      return
    }

    setUrlError('')
    
    // Load manifest
    const loadManifest = async () => {
      try {
        setIsLoadingManifest(true)
        const response = await fetch(addonUrl)
        if (!response.ok) {
          throw new Error('Failed to fetch manifest')
        }
        const data = await response.json()
        setManifestData(data)
        if (data.name && !addonName.trim()) {
          setAddonName(data.name)
        }
      } catch (error) {
        setUrlError('Failed to load manifest. Please check the URL.')
        setManifestData(null)
      } finally {
        setIsLoadingManifest(false)
      }
    }

    const timeoutId = setTimeout(loadManifest, 500)
    return () => clearTimeout(timeoutId)
  }, [addonUrl, addonName])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!addonName.trim() || !addonUrl.trim()) {
      return
    }

    if (urlError) {
      return
    }

    if (!manifestData) {
      return
    }

    onAddAddon({
      name: addonName.trim(),
      url: addonUrl.trim(),
      description: manifestData.description || '',
      groupIds: selectedGroupIds,
      manifestData: manifestData
    })
  }

  const handleClose = () => {
    setAddonName('')
    setAddonUrl('')
    setSelectedGroupIds([])
    setIsLoadingManifest(false)
    setManifestData(null)
    setUrlError('')
    onClose()
  }

  if (!isOpen) return null

  if (!mounted || typeof window === 'undefined' || !document.body) {
    return null
  }

  return createPortal(
    <div 
      className="fixed top-0 left-0 right-0 bottom-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-[1000]"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose()
        }
      }}
    >
      <div className={`rounded-lg max-w-md w-full p-6 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Add New Addon</h2>
          <button
            onClick={handleClose}
            className={`w-8 h-8 flex items-center justify-center rounded transition-colors border-0 ${
              isDark ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Addon Name *
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={addonName}
                onChange={(e) => setAddonName(e.target.value)}
                placeholder="Cinemeta"
                required
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-stremio-purple focus:border-transparent ${
                  isDark 
                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                }`}
              />
              {manifestData?.version && (
                <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${
                  isDark ? 'bg-blue-500 text-blue-100' : 'bg-blue-100 text-blue-800'
                }`}>v{manifestData.version}</span>
              )}
            </div>
          </div>
          <div>
            <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Addon URL *
            </label>
            <input
              type="url"
              value={addonUrl}
              onChange={(e) => setAddonUrl(e.target.value)}
              placeholder="https://v3-cinemeta.strem.io/manifest.json"
              required
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-stremio-purple focus:border-transparent ${
                isDark 
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              }`}
            />
            <p className={`text-xs mt-1 ${urlError ? 'text-red-500' : (isDark ? 'text-gray-400' : 'text-gray-500')}`}>
              {urlError ? urlError : 'Enter the full URL to the Stremio addon manifest'}
            </p>
          </div>
          {/* Groups selection - match AddonDetailModal style */}
          <div>
            <label className={`block text-sm font-medium mb-3 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Assign to groups (optional)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {groups?.map((group: any) => {
                const active = selectedGroupIds.includes(group.id)
                return (
                  <div 
                    key={group.id}
                    className={`flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer ${
                      active
                        ? (isDark ? 'bg-gray-600 border-gray-300' : 'bg-white border-gray-300')
                        : (isDark ? 'bg-gray-700 border-gray-600 hover:bg-gray-600' : 'bg-white border-gray-200 hover:bg-gray-50')
                    }`}
                    onClick={() => {
                      setSelectedGroupIds(prev => active ? prev.filter(id => id !== group.id) : [...prev, group.id])
                    }}
                  >
                    <div className="flex items-center flex-1 min-w-0">
                      <div 
                        className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 flex-shrink-0 ${
                          getColorBgClass(group?.colorIndex || 0, isMono ? 'mono' : isDark ? 'dark' : 'light')
                        }`}
                        style={{ backgroundColor: getColorHexValue(group?.colorIndex || 0, isMono ? 'mono' : isDark ? 'dark' : 'light') }}
                      >
                        <span className="text-white text-sm font-semibold">
                          {group.name ? group.name.charAt(0).toUpperCase() : 'G'}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className={`font-medium text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          {group.name}
                        </h4>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={isCreating}
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
              disabled={isCreating || !!urlError || isLoadingManifest || !manifestData}
              className="flex-1 px-4 py-2 accent-bg accent-text rounded-lg transition-colors disabled:opacity-50"
            >
              {isCreating ? 'Adding...' : isLoadingManifest ? 'Loading manifest...' : 'Add Addon'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}
