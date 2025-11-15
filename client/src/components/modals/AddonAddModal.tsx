import React, { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { getEntityColorStyles } from '@/utils/colorMapping'
import { addonsAPI } from '@/services/api'
import { VersionChip } from '@/components/ui'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { AddonIcon, InlineEdit } from '@/components/entities'

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
  const [mounted, setMounted] = useState(false)
  const { theme } = useTheme()
  
  useBodyScrollLock(isOpen)
  
  const [addonName, setAddonName] = useState('')
  const [addonUrl, setAddonUrl] = useState('')
  const [addonDescription, setAddonDescription] = useState('')
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([])
  const [urlError, setUrlError] = useState<string>('')
  const [nameError, setNameError] = useState<string>('')
  const [isLoadingManifest, setIsLoadingManifest] = useState(false)
  const [isCheckingName, setIsCheckingName] = useState(false)
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

    const urlPattern = /^@?(https?|stremio):\/\/.+\.json$/
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
        
        // Convert stremio:// URLs to https:// for fetching
        let fetchUrl = addonUrl.trim()
        if (fetchUrl.startsWith('stremio://')) {
          fetchUrl = fetchUrl.replace(/^stremio:\/\//, 'https://')
        }
        
        const response = await fetch(fetchUrl)
        if (!response.ok) {
          throw new Error('Failed to fetch manifest')
        }
        const data = await response.json()
        setManifestData(data)
        if (data.name && !addonName.trim()) {
          setAddonName(data.name)
        }
        // Always set description, even if empty, to populate the field
        setAddonDescription(data.description || '')
      } catch (error) {
        setUrlError('Failed to load manifest. Please check the URL.')
        setManifestData(null)
      } finally {
        setIsLoadingManifest(false)
      }
    }

    const timeoutId = setTimeout(loadManifest, 500)
    return () => clearTimeout(timeoutId)
  }, [addonUrl])

  // Validate addon name for duplicates
  useEffect(() => {
    if (!addonName.trim()) {
      setNameError('')
      return
    }

    const checkNameAvailability = async () => {
      try {
        setIsCheckingName(true)
        // Clear error immediately when name changes
        setNameError('')
        
        // Get all existing addons
        const existingAddons = await addonsAPI.getAll()
        const currentName = addonName.toLowerCase().trim()
        const duplicateAddon = existingAddons.find(addon => 
          addon.name.toLowerCase().trim() === currentName
        )
        
        if (duplicateAddon) {
          setNameError(`An addon named "${duplicateAddon.name}" already exists`)
        } else {
          // Explicitly clear error if no duplicate found
          setNameError('')
        }
      } catch (error) {
        console.error('Error checking addon name:', error)
        // Don't show error to user for validation checks
        setNameError('')
      } finally {
        setIsCheckingName(false)
      }
    }

    const timeoutId = setTimeout(checkNameAvailability, 300)
    return () => {
      clearTimeout(timeoutId)
      // Clear error when effect is cleaned up (name changed)
      setNameError('')
    }
  }, [addonName])

  // Memoize version tag to prevent unnecessary re-renders
  const versionTag = useMemo(() => {
    if (!manifestData?.version) return null
    
    return <VersionChip version={manifestData.version} size="sm" />
  }, [manifestData?.version])

  // Get addon icon URL from manifest
  const addonIconUrl = useMemo(() => {
    if (!manifestData) return null
    return manifestData.logo || manifestData.icon || manifestData.images?.logo || null
  }, [manifestData])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!addonName.trim() || !addonUrl.trim()) {
      return
    }

    if (urlError || nameError) {
      return
    }

    if (!manifestData) {
      return
    }

    onAddAddon({
      name: addonName.trim(),
      url: addonUrl.trim(),
      description: addonDescription.trim() || manifestData.description || '',
      groupIds: selectedGroupIds,
      manifestData: manifestData
    })
  }

  const handleClose = () => {
    setAddonName('')
    setAddonUrl('')
    setAddonDescription('')
    setSelectedGroupIds([])
    setIsLoadingManifest(false)
    setIsCheckingName(false)
    setManifestData(null)
    setUrlError('')
    setNameError('')
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
      <div 
        className={`rounded-lg max-w-md w-full card`}
        style={{ background: 'var(--color-background)' }}
      >
        <div className="flex items-center justify-between p-6 border-b color-border">
          <div className="flex items-center gap-4 relative flex-1">
            <AddonIcon
              name={addonName || 'Addon'}
              iconUrl={addonIconUrl || undefined}
              size="12"
              className="flex-shrink-0"
              colorIndex={1}
            />
            <div className="flex flex-col flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <InlineEdit
                  value={addonName}
                  onSave={async (newValue) => {
                    // Update state immediately for real-time duplicate checking
                    setAddonName(newValue)
                  }}
                  placeholder="Addon Name *"
                  className="text-lg font-semibold"
                />
                {versionTag}
              </div>
              {nameError && (
                <p className={`text-xs mt-1 color-text`}>
                  {nameError}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center rounded transition-colors border-0 focus:outline-none ring-0 focus:ring-0 color-text-secondary color-hover"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className={`block text-sm font-medium mb-1`}>
              Addon URL *
            </label>
            <input
              type="url"
              value={addonUrl}
              onChange={(e) => setAddonUrl(e.target.value)}
              placeholder="https://v3-cinemeta.strem.io/manifest.json"
              required
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none input`}
            />
            <p className={`text-xs mt-1 min-h-[1rem] ${urlError ? 'color-text' : 'color-text-secondary'}`}>
              {urlError ? urlError : 'Enter the full URL to the Stremio addon manifest'}
            </p>
          </div>
          <div>
            <label className={`block text-sm font-medium mb-1`}>
              Description
            </label>
            <textarea
              value={addonDescription}
              onChange={(e) => setAddonDescription(e.target.value)}
              placeholder="Addon description"
              rows={3}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none input resize-none`}
            />
          </div>
          {/* Groups selection - match AddonDetailModal style */}
          <div>
            <label className={`block text-sm font-medium mb-3`}>
              Assign to groups (optional)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {groups?.map((group: any) => {
                const active = selectedGroupIds.includes(group.id)
                return (
                  <div 
                    key={group.id}
                    className={`flex items-center justify-between p-3 rounded-lg cursor-pointer card card-selectable color-hover hover:shadow-lg ${
                      active ? 'card-selected' : ''
                    }`}
                    onClick={() => {
                      setSelectedGroupIds(prev => active ? prev.filter(id => id !== group.id) : [...prev, group.id])
                    }}
                  >
                    <div className="flex items-center flex-1 min-w-0">
                      {(() => {
                        const colorStyles = getEntityColorStyles(theme, group?.colorIndex || 0)
                        return (
                      <div 
                            className="w-8 h-8 rounded-full flex items-center justify-center mr-3 flex-shrink-0"
                            style={{
                              background: colorStyles.background,
                              color: colorStyles.textColor,
                            }}
                      >
                            <span className="text-sm font-semibold" style={{ color: colorStyles.textColor }}>
                          {group.name ? group.name.charAt(0).toUpperCase() : 'G'}
                        </span>
                      </div>
                        )
                      })()}
                      <div className="min-w-0 flex-1">
                        <h4 className={`font-medium text-sm`}>
                          {group.name}
                        </h4>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={isCreating}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors color-text-secondary color-hover`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating || !!urlError || !!nameError || isLoadingManifest || isCheckingName || !manifestData}
              className="px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 color-surface hover:opacity-90"
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
