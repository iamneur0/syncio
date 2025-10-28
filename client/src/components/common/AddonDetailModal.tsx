// backup kept in AddonDetailModal_backup.tsx if needed in the future
'use client'

import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Puzzle, X, BookOpen, Clapperboard, Tv, Library, Zap, Clipboard, ClipboardList, Users, Copy } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { getColorBgClass, getColorTextClass, getColorBorderClass, getColorHexValue } from '@/utils/colorMapping'
import { VersionChip, EntityList, InlineEdit } from './'
import ResourceItem from './ResourceItem'
import CatalogItem from './CatalogItem'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { addonsAPI } from '@/services/api'
import toast from 'react-hot-toast'

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
  const { isDark, isModern, isModernDark, isMono, hideSensitive } = useTheme() as any
  const [mounted, setMounted] = useState(false)

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  useEffect(() => {
    setMounted(true)
  }, [])

  const queryClient = useQueryClient()

  // Fetch addon data using query to ensure it stays updated
  const { data: addonData, isLoading: isLoadingAddon } = useQuery({
    queryKey: ['addon', addon?.id, 'details'],
    queryFn: () => addonsAPI.getById(addon?.id),
    enabled: !!addon?.id && isOpen,
    initialData: addon // Use prop as initial data
  })

  // Use the query data instead of the prop
  const currentAddon = addonData || addon

  // Update addon mutation
  const updateAddonMutation = useMutation({
    mutationFn: ({ addonId, addonData }: { addonId: string; addonData: any }) => 
      addonsAPI.update(addonId, addonData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addon'] })
      queryClient.invalidateQueries({ queryKey: ['addon', currentAddon?.id, 'details'] })
      toast.success('Addon updated successfully')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to update addon')
    }
  })

  // Handle addon name update
  const handleAddonNameUpdate = async (newName: string) => {
    if (currentAddon) {
      await updateAddonMutation.mutateAsync({
        addonId: currentAddon.id,
        addonData: { name: newName }
      })
    }
  }
  
  // Form state
  const [editName, setEditName] = useState('')
  const [editGroupIds, setEditGroupIds] = useState<string[]>([])
  const [editResources, setEditResources] = useState<any[]>([])
  const [editCatalogs, setEditCatalogs] = useState<any[]>([])
  const [catalogSearchState, setCatalogSearchState] = useState<Map<string, boolean>>(new Map())
  const [urlCopied, setUrlCopied] = useState(false)
  const [showManifestModal, setShowManifestModal] = useState(false)
  const [showOriginalManifestModal, setShowOriginalManifestModal] = useState(false)
  const [manifestJson, setManifestJson] = useState('')
  const [originalManifestJson, setOriginalManifestJson] = useState('')

  // Debug mode check
  const isDebugMode = process.env.NEXT_PUBLIC_DEBUG === 'true' || process.env.NEXT_PUBLIC_DEBUG === '1'
  
  
  // Initialize form data when addon changes
  useEffect(() => {
    if (currentAddon) {
      setEditName(currentAddon.name || '')
      // Initialize associated groups by ids (supports both groupIds and groups arrays)
      try {
        const initialGroupIds = Array.isArray(currentAddon.groupIds) && currentAddon.groupIds.length > 0
          ? currentAddon.groupIds
          : (Array.isArray(currentAddon.groups) ? currentAddon.groups.map((g: any) => g.id).filter(Boolean) : [])
        setEditGroupIds(initialGroupIds)
      } catch {
        setEditGroupIds([])
      }
      // Initialize resources selection from addon like the old page did
      try {
        const stored = Array.isArray(currentAddon.resources) ? currentAddon.resources : null
        const detailManifest: any = currentAddon.originalManifest || currentAddon.manifest
        const manifestResources = Array.isArray(detailManifest?.resources) ? detailManifest.resources : []
        
        // Check if there are any search catalogs
        const catalogAddons = detailManifest?.catalogs || []
        const hasSearchCatalogs = catalogAddons.some((catalog: any) => 
          catalog.extra?.some((extra: any) => extra.name === 'search')
        )
        
        // Add "search" resource if there are search catalogs
        const fallback = [...manifestResources]
        if (hasSearchCatalogs && !fallback.includes('search')) {
          fallback.push('search')
        }
        
        // Use stored resources if explicitly set (including empty array), otherwise use manifest resources
        setEditResources(stored !== null ? stored : fallback)
      } catch (e) { 
        setEditResources([]) 
      }

      // Initialize catalogs selection from addon
      try {
        let stored = null
        if (Array.isArray(currentAddon.catalogs)) {
          // If addon.catalogs is already parsed objects, use them
          if (currentAddon.catalogs.length > 0 && typeof currentAddon.catalogs[0] === 'object') {
            stored = currentAddon.catalogs
          } else {
            // If it's a JSON string, parse it
            try {
              stored = JSON.parse(currentAddon.catalogs)
            } catch (e) {
              stored = currentAddon.catalogs
            }
          }
        }
        
        const detailManifest: any = currentAddon.originalManifest || currentAddon.manifest
        const fallback = Array.isArray(detailManifest?.catalogs) ? detailManifest.catalogs : []
        // Use stored catalogs if explicitly set (including empty array), otherwise use manifest catalogs
        // For new addons, always use manifest catalogs as default
        if (stored !== null && stored.length > 0) {
          // If we have stored catalogs, we need to merge them with manifest data to get the full structure
          const manifestCatalogs = Array.isArray(detailManifest?.catalogs) ? detailManifest.catalogs : []
          
          // Create a map of stored catalogs to check for search functionality
          const storedCatalogMap = new Map()
          stored.forEach((storedCatalog: any) => {
            const key = `${storedCatalog.id}:${storedCatalog.type}`
            storedCatalogMap.set(key, storedCatalog)
          })
          
          const mergedCatalogs = manifestCatalogs.map((manifestCatalog: any) => {
            const key = `${manifestCatalog.id}:${manifestCatalog.type}`
            const storedCatalog = storedCatalogMap.get(key)
            
            if (storedCatalog) {
              // Check if this catalog has embedded search functionality in the manifest
              const hasSearch = manifestCatalog.extra?.some((extra: any) => extra.name === 'search')
              const hasOtherExtras = manifestCatalog.extra?.some((extra: any) => extra.name !== 'search')
              const isEmbeddedSearch = hasSearch && hasOtherExtras
              const isStandaloneSearch = hasSearch && !hasOtherExtras
              
              if (isEmbeddedSearch) {
                // For embedded search catalogs, use the database state to determine search functionality
                const storedHasSearch = storedCatalog.search === true
                
                console.log(`🔍 Initializing ${manifestCatalog.id}:${manifestCatalog.type} - storedHasSearch:`, storedHasSearch)
                console.log(`🔍 Stored catalog:`, storedCatalog)
                
                if (storedHasSearch) {
                  // Keep the search functionality from manifest
                  console.log(`🔍 Keeping search for ${manifestCatalog.id}:${manifestCatalog.type}`)
                  return manifestCatalog
                } else {
                  // Remove the search functionality based on database state
                  console.log(`🔍 Removing search for ${manifestCatalog.id}:${manifestCatalog.type}`)
                  return {
                    ...manifestCatalog,
                    extra: manifestCatalog.extra?.filter((extra: any) => extra.name !== 'search') || [],
                    extraSupported: manifestCatalog.extraSupported?.filter((extra: any) => extra !== 'search') || []
                  }
                }
              } else if (isStandaloneSearch) {
                // Standalone search catalog: include only if stored says search=true
                const storedHasSearch = storedCatalog.search === true
                if (storedHasSearch) {
                  return manifestCatalog
                }
                // Unselected in DB → omit from merged list
                return null
              } else {
                // Regular catalog, use as-is
                return manifestCatalog
              }
            } else {
              // Not in stored catalogs - this means it was unselected
              // Return null to indicate it should be filtered out
              console.log(`🔍 Catalog ${manifestCatalog.id}:${manifestCatalog.type} was unselected (not in database)`)
              return null
            }
          }).filter(Boolean) // Remove null entries
          
          // Initialize search state map
          const searchStateMap = new Map<string, boolean>()
          stored.forEach((storedCatalog: any) => {
            const key = `${storedCatalog.id}:${storedCatalog.type}`
            searchStateMap.set(key, storedCatalog.search === true)
          })
          setCatalogSearchState(searchStateMap)
          setEditCatalogs(mergedCatalogs)
        } else {
          // For new addons (stored is null), initialize search state based on manifest
          const manifestCatalogs = Array.isArray(detailManifest?.catalogs) ? detailManifest.catalogs : []
          const searchStateMap = new Map<string, boolean>()
          // For new addons, default all search states to false (unselected) to reflect DB = none
          manifestCatalogs.forEach((catalog: any) => {
            const key = `${catalog.id}:${catalog.type}`
            searchStateMap.set(key, false)
          })
          
          setCatalogSearchState(searchStateMap)
          setEditCatalogs(fallback)
        }
      } catch (e) { 
        setEditCatalogs([]) 
      }
    }
  }, [currentAddon])




  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    const updateData: any = {}
    
    if (editName.trim()) {
      updateData.name = editName.trim()
    }
    
    updateData.groupIds = editGroupIds
    if (Array.isArray(editResources)) updateData.resources = editResources
    
    // Convert catalogs to tuple format: [type, id, search]
    if (Array.isArray(editCatalogs)) {
      updateData.catalogs = editCatalogs.map(catalog => {
        if (typeof catalog === 'string') {
          return [catalog, catalog, false] // [type, id, search] - legacy string format
        } else if (catalog && catalog.id) {
          // Use the search state map to determine if search is enabled
          const key = `${catalog.id}:${catalog.type}`
          const hasSearch = catalogSearchState.get(key) || false
          console.log(`🔍 Converting catalog ${catalog.id}:${catalog.type} - hasSearch:`, hasSearch)
          return [catalog.type || 'unknown', catalog.id, hasSearch]
        }
        return catalog // fallback
      })
    }

    onSave(updateData)
  }

  const handleGroupToggle = (groupId: string) => {
    setEditGroupIds(prev => 
      prev.includes(groupId) 
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    )
    // Do not call onSave here; changes are applied on form submit (Save Changes)
  }

  const handleCatalogToggle = (catalog: any) => {
    setEditCatalogs((prev) => {
      // Always use ID as primary identifier, fallback to name only if no ID
      const catalogId = catalog?.id || catalog?.name
      const catalogType = catalog?.type || 'unknown'
      const exists = prev.some(selected => {
        const selectedId = selected?.id || selected
        const selectedType = selected?.type || 'unknown'
        return selectedId === catalogId && selectedType === catalogType
      })
      
      if (exists) {
        return prev.filter(selected => {
          const selectedId = selected?.id || selected
          const selectedType = selected?.type || 'unknown'
          return !(selectedId === catalogId && selectedType === catalogType)
        })
      } else {
        // Store the full catalog object
        return [...prev, catalog]
      }
    })
  }

  const handleSearchCatalogToggle = (catalog: any) => {
    const catalogId = catalog?.id || catalog?.name
    const catalogType = catalog?.type || 'unknown'
    const key = `${catalogId}:${catalogType}`
    
    setEditCatalogs((prev) => {
      // Check if this is an embedded search catalog (has both search and other extras)
      const hasSearch = catalog?.extra?.some((extra: any) => extra.name === 'search')
      const hasOtherExtras = catalog?.extra?.some((extra: any) => extra.name !== 'search')
      const isEmbeddedSearch = hasSearch && hasOtherExtras
      
      if (isEmbeddedSearch) {
        // For embedded search: manage the search extra in the main catalog
        const mainCatalogIndex = prev.findIndex(selected => {
          const selectedId = selected?.id || selected
          const selectedType = selected?.type || 'unknown'
          return selectedId === catalogId && selectedType === catalogType
        })
        
        if (mainCatalogIndex !== -1) {
          // Main catalog exists, toggle search extra
          const mainCatalog = prev[mainCatalogIndex]
          const hasSearchExtra = mainCatalog.extra?.some((extra: any) => extra.name === 'search')
          
          const updatedMainCatalog = {
            ...mainCatalog,
            extra: hasSearchExtra 
              ? mainCatalog.extra?.filter((extra: any) => extra.name !== 'search') || []
              : [...(mainCatalog.extra || []), { name: 'search' }],
            extraSupported: hasSearchExtra
              ? mainCatalog.extraSupported?.filter((extra: any) => extra !== 'search') || []
              : [...(mainCatalog.extraSupported || []), 'search']
          }
          
          const newCatalogs = [...prev]
          newCatalogs[mainCatalogIndex] = updatedMainCatalog

          // Update search state map synchronously with the modeled state
          const nextEnabled = !hasSearchExtra
          setCatalogSearchState(prevState => {
            const newState = new Map(prevState)
            newState.set(key, nextEnabled)
            return newState
          })
          
          return newCatalogs
        } else {
          // Main catalog doesn't exist, add it with search
          const catalogWithSearch = {
            ...catalog,
            extra: [...(catalog.extra || []), { name: 'search' }],
            extraSupported: [...(catalog.extraSupported || []), 'search']
          }
          
          // Update search state map
          setCatalogSearchState(prevState => {
            const newState = new Map(prevState)
            newState.set(key, true)
            return newState
          })
          
          return [...prev, catalogWithSearch]
        }
      } else {
        // For standalone search: treat like regular catalog
        const exists = prev.some(selected => {
          const selectedId = selected?.id || selected
          const selectedType = selected?.type || 'unknown'
          return selectedId === catalogId && selectedType === catalogType
        })
        
        if (exists) {
          // Remove the catalog
          setCatalogSearchState(prevState => {
            const newState = new Map(prevState)
            newState.set(key, false)
            return newState
          })
          
          return prev.filter(selected => {
            const selectedId = selected?.id || selected
            const selectedType = selected?.type || 'unknown'
            return !(selectedId === catalogId && selectedType === catalogType)
          })
        } else {
          // Add the catalog
          setCatalogSearchState(prevState => {
            const newState = new Map(prevState)
            newState.set(key, true)
            return newState
          })
          
          return [...prev, catalog]
        }
      }
    })
  }

  const handleResetResources = () => {
    // Reset both resources and catalogs (same as master reset)
    const detailManifest: any = currentAddon?.originalManifest || currentAddon?.manifest
    const manifestResources = Array.isArray(detailManifest?.resources) ? detailManifest.resources : []
    const manifestCatalogs = Array.isArray(detailManifest?.catalogs) ? detailManifest.catalogs : []
    
    // Check if there are any search catalogs
    const catalogAddons = detailManifest?.catalogs || []
    const hasSearchCatalogs = catalogAddons.some((catalog: any) => 
      catalog.extra?.some((extra: any) => extra.name === 'search')
    )
    
    // Add "search" resource if there are search catalogs
    const allResources = [...manifestResources]
    if (hasSearchCatalogs && !allResources.includes('search')) {
      allResources.push('search')
    }
    
    // Select ALL resources
    setEditResources(allResources)
    
    // Select ALL catalogs from manifest (both regular and search catalogs)
    const allCatalogs = manifestCatalogs.map((c: any) => ({
      id: c?.id || c?.name,
      type: c?.type || 'unknown'
    }))
    
    setEditCatalogs(allCatalogs)
    
    // Initialize search state for all search catalogs
    const searchStateMap = new Map<string, boolean>()
    manifestCatalogs.forEach((catalog: any) => {
      const hasSearch = catalog.extra?.some((extra: any) => extra.name === 'search')
      if (hasSearch) {
        const key = `${catalog.id}:${catalog.type}`
        searchStateMap.set(key, true) // Enable search for all search catalogs
      }
    })
    setCatalogSearchState(searchStateMap)
  }

  const handleResetCatalogs = () => {
    // Reset both resources and catalogs (same as master reset)
    const detailManifest: any = currentAddon?.originalManifest || currentAddon?.manifest
    const manifestResources = Array.isArray(detailManifest?.resources) ? detailManifest.resources : []
    const manifestCatalogs = Array.isArray(detailManifest?.catalogs) ? detailManifest.catalogs : []
    
    // Check if there are any search catalogs
    const catalogAddons = detailManifest?.catalogs || []
    const hasSearchCatalogs = catalogAddons.some((catalog: any) => 
      catalog.extra?.some((extra: any) => extra.name === 'search')
    )
    
    // Add "search" resource if there are search catalogs
    const allResources = [...manifestResources]
    if (hasSearchCatalogs && !allResources.includes('search')) {
      allResources.push('search')
    }
    
    // Select ALL resources
    setEditResources(allResources)
    
    // Select ALL catalogs from manifest (both regular and search catalogs)
    const allCatalogs = manifestCatalogs.map((c: any) => ({
      id: c?.id || c?.name,
      type: c?.type || 'unknown'
    }))
    
    setEditCatalogs(allCatalogs)
    
    // Initialize search state for all search catalogs
    const searchStateMap = new Map<string, boolean>()
    manifestCatalogs.forEach((catalog: any) => {
      const hasSearch = catalog.extra?.some((extra: any) => extra.name === 'search')
      if (hasSearch) {
        const key = `${catalog.id}:${catalog.type}`
        searchStateMap.set(key, true) // Enable search for all search catalogs
      }
    })
    setCatalogSearchState(searchStateMap)
  }

  const handleMasterReset = () => {
    // Reset both resources and catalogs
    handleResetResources()
    handleResetCatalogs()
  }


  if (!isOpen || !addon) return null

  // Don't render until mounted
  if (!mounted || typeof window === 'undefined' || !document.body) {
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
      <div className={`relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-lg shadow-xl ${
        isDark ? 'bg-gray-800' : 'bg-white'
      }`}>
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
            <div className={`logo-circle-12 mr-0 flex-shrink-0`}>
              {(() => {
                const manifest = currentAddon?.originalManifest || currentAddon?.manifest || {}
                const logoUrl = currentAddon?.iconUrl || manifest?.logo || manifest?.icon || manifest?.images?.logo
                return logoUrl ? (
                  <img
                    src={logoUrl}
                    alt={`${currentAddon?.name || 'Addon'} logo`}
                    className="logo-img-fill"
                    onError={(e) => {
                      // Hide broken image and show puzzle fallback
                      e.currentTarget.style.display = 'none'
                      const nextEl = e.currentTarget.nextElementSibling as HTMLElement | null
                      if (nextEl) {
                        nextEl.style.display = 'block'
                      }
                    }}
                  />
                ) : null
              })()}
              <div className="w-full h-full flex items-center justify-center" style={{ display: currentAddon?.iconUrl || (currentAddon?.originalManifest || currentAddon?.manifest)?.logo ? 'none' : 'flex' }}>
                <Puzzle className={`w-6 h-6 ${isDark ? 'text-gray-300' : 'text-gray-400'}`} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <InlineEdit
                value={currentAddon?.name || ''}
                onSave={handleAddonNameUpdate}
                placeholder="Enter addon name..."
                maxLength={100}
              />
              {currentAddon?.version && (
                <VersionChip version={currentAddon.version} />
              )}
            </div>
            </div>
            <button
              onClick={onClose}
              className={`w-8 h-8 flex items-center justify-center rounded transition-colors border-0 ${
                isDark ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
              }`}
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* URL and Description */}
          <div className={`p-4 rounded-lg mb-6 ${isDark ? 'bg-gray-700' : 'bg-gray-50'}`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Details
              </h3>
              <button
                type="button"
                onClick={handleMasterReset}
                className={`px-3 py-1 text-sm rounded transition-colors ${
                  isDark 
                    ? 'text-gray-300 hover:text-white hover:bg-gray-600' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
                title="Reset all resources and catalogs to defaults"
              >
                Reset
              </button>
            </div>
            
            <div className="mb-4">
              <h4 className={`text-sm font-semibold mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                URL
              </h4>
              <div className="relative">
                <button
                  type="button"
                  onClick={async () => {
                    if (currentAddon?.url) {
                      try {
                        await navigator.clipboard.writeText(addon.url)
                        setUrlCopied(true)
                        setTimeout(() => setUrlCopied(false), 1000)
                      } catch (err) {
                        console.error('Failed to copy URL:', err)
                      }
                    }
                  }}
                  className={`w-full px-3 py-2 pr-10 border rounded-lg text-left transition-all duration-200 hover:opacity-80 ${
                    urlCopied 
                      ? (isMono ? 'bg-transparent border-white/20 text-white' : isDark ? 'bg-green-600 border-green-500 text-white' : 'bg-green-100 border-green-300 text-green-900')
                      : (isMono ? 'bg-transparent border-white/20 text-white hover:bg-white/5' : isDark ? 'bg-gray-600 border-gray-500 text-white hover:bg-gray-550' : 'bg-gray-100 border-gray-300 text-gray-900 hover:bg-gray-200')
                  }`}
                  title={hideSensitive ? '***'.repeat(50) : (currentAddon?.url || 'No URL available')}
                >
                  <span className={`block truncate ${hideSensitive ? 'blur-sm select-none' : ''}`}>
                    {hideSensitive ? '***'.repeat(50) : (currentAddon?.url || 'No URL available')}
                  </span>
                </button>
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  {urlCopied ? (
                    <ClipboardList className={`w-4 h-4 ${isMono ? 'text-white' : isDark ? 'text-white' : 'text-green-600'}`} />
                  ) : (
                    <Clipboard className={`w-4 h-4 ${isMono ? 'text-white/60' : isDark ? 'text-gray-400' : 'text-gray-500'}`} />
                  )}
                </div>
              </div>
            </div>
            
            <div>
              <h4 className={`text-sm font-semibold mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                Description
              </h4>
              <div className={`w-full px-3 py-2 rounded-lg ${
                isMono ? 'bg-black text-white border border-white/20' : (isDark ? 'bg-gray-800 text-white border border-gray-700' : 'bg-gray-100 text-gray-900 border border-gray-300')
              }`}>
                {currentAddon?.description || 'No description available'}
              </div>
            </div>
          </div>

          {/* Manifest Buttons - Debug Only */}
          {isDebugMode && (
            <div className={`p-4 rounded-lg mb-6 ${isDark ? 'bg-gray-700' : 'bg-gray-50'}`}>
              <h3 className={`text-lg font-semibold mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Manifest (Debug)
              </h3>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (currentAddon?.manifest) {
                      try {
                        // manifest is already decrypted by the backend
                        const manifest = typeof currentAddon.manifest === 'string' 
                          ? JSON.parse(currentAddon.manifest) 
                          : currentAddon.manifest
                        setManifestJson(JSON.stringify(manifest, null, 2))
                        setShowManifestModal(true)
                      } catch (err) {
                        console.error('Failed to parse manifest:', err)
                      }
                    }
                  }}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    isDark 
                      ? 'bg-gray-600 text-white hover:bg-gray-550' 
                      : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                  }`}
                >
                  View Manifest
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (currentAddon?.originalManifest) {
                      try {
                        // originalManifest is already decrypted by the backend
                        const originalManifest = typeof currentAddon.originalManifest === 'string' 
                          ? JSON.parse(currentAddon.originalManifest) 
                          : currentAddon.originalManifest
                        setOriginalManifestJson(JSON.stringify(originalManifest, null, 2))
                        setShowOriginalManifestModal(true)
                      } catch (err) {
                        console.error('Failed to parse original manifest:', err)
                      }
                    }
                  }}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    isDark 
                      ? 'bg-gray-600 text-white hover:bg-gray-550' 
                      : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                  }`}
                >
                  View Original Manifest
                </button>
              </div>
            </div>
          )}

          {/* Content */}
          <form onSubmit={handleSubmit} className="space-y-6">
          {/* Associated Groups */}
          {(() => {
            const allGroups = Array.isArray(groups) ? groups : []
            const isGroupSelected = (g: any) => editGroupIds.includes(g.id)
            const handleToggleGroup = (g: any) => {
              setEditGroupIds((prev) => (
                isGroupSelected(g) ? prev.filter((id) => id !== g.id) : [...prev, g.id]
              ))
            }

            return (
              <EntityList
                title="Associated Groups"
                count={allGroups.length}
                items={allGroups}
                layout="grid"
                getIsSelected={isGroupSelected}
                renderItem={(group: any) => (
                  <div
                    key={group.id}
                    onClick={() => handleToggleGroup(group)}
                    className={`flex items-center justify-between p-3 rounded-lg cursor-pointer ${
                      isDark ? 'bg-gray-600 hover:bg-gray-550' : 'bg-white hover:bg-gray-50'
                    } border ${
                      isGroupSelected(group)
                        ? (isMono ? 'ring-2 ring-white/50 border-white/40' : 'ring-2 ring-gray-400 border-gray-400')
                        : 'border-transparent'
                    }`}
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
                )}
                emptyIcon={<Users className={`w-12 h-12 mx-auto mb-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />}
                emptyMessage="No groups associated with this addon"
              />
            )
          })()}

          {/* Resources Section */}
          {(() => {
            // Always get all resources from originalManifest (show all available options)
            const detailManifest: any = currentAddon?.originalManifest || currentAddon?.manifest
            const manifestResources: any[] = Array.isArray(detailManifest?.resources) ? detailManifest.resources : []
            
            // Check if there are any search catalogs
            const catalogAddons = detailManifest?.catalogs || []
            const hasSearchCatalogs = catalogAddons.some((catalog: any) => 
              catalog.extra?.some((extra: any) => extra.name === 'search')
            )
            
            // Add "search" resource if there are search catalogs
            const allResources: any[] = [...manifestResources]
            if (hasSearchCatalogs && !allResources.includes('search')) {
              allResources.push('search')
            }
            
            const isSelected = (item: any) => {
              const label = typeof item === 'string' ? item : (item?.name || item?.type || JSON.stringify(item))
              
              // Special handling for "search" resource - check if any search catalogs are selected
              if (label === 'search') {
                // Check if any search catalogs are currently selected
                const hasSelectedSearchCatalogs = editCatalogs.some((catalog: any) => {
                  const hasSearch = catalog.extra?.some((extra: any) => extra.name === 'search')
                  return hasSearch
                })
                
                // Also check search state map for embedded search catalogs
                const hasSearchStateEnabled = Array.from(catalogSearchState.values()).some(value => value === true)
                
                return hasSelectedSearchCatalogs || hasSearchStateEnabled
              }
              
              return editResources.some((s) => {
                const sl = typeof s === 'string' ? s : (s?.name || s?.type || JSON.stringify(s))
                return sl === label
              })
            }

            const handleResourceToggle = (resource: any) => {
              // Special handling for "search" resource
              if (resource === 'search') {
                const isCurrentlySelected = isSelected(resource)
                
                if (isCurrentlySelected) {
                  // Search resource is being unselected - remove search functionality from search catalogs
                  setEditCatalogs((prev) => {
                    return prev.map((catalog: any) => {
                      const hasSearch = catalog.extra?.some((extra: any) => extra.name === 'search')
                      const hasOtherExtras = catalog.extra?.some((extra: any) => extra.name !== 'search')
                      const isEmbeddedSearch = hasSearch && hasOtherExtras
                      const isStandaloneSearch = hasSearch && !hasOtherExtras
                      
                      if (isStandaloneSearch) {
                        // Remove entire standalone search catalog by returning null
                        return null
                      } else if (isEmbeddedSearch) {
                        // Remove search functionality from embedded search catalogs
                        return {
                          ...catalog,
                          extra: catalog.extra?.filter((extra: any) => extra.name !== 'search') || [],
                          extraSupported: catalog.extraSupported?.filter((extra: any) => extra !== 'search') || []
                        }
                      } else {
                        // Keep regular catalogs as-is
                        return catalog
                      }
                    }).filter(Boolean) // Remove null entries (standalone search catalogs)
                  })
                  
                  // Clear search state for all catalogs
                  setCatalogSearchState((prevState) => {
                    const newState = new Map(prevState)
                    newState.forEach((value, key) => {
                      newState.set(key, false)
                    })
                    return newState
                  })
                  
                  // Remove "search" from resources
                  setEditResources((prev) => {
                    return prev.filter((p) => p !== 'search')
                  })
                } else {
                  // Search resource is being selected - add it to resources and restore search catalogs
                  setEditResources((prev) => {
                    if (!prev.includes('search')) {
                      return [...prev, 'search']
                    }
                    return prev
                  })
                  
                  // Restore search catalogs from the original manifest
                  setEditCatalogs((prev) => {
                    const manifestCatalogs = Array.isArray(detailManifest?.catalogs) ? detailManifest.catalogs : []
                    const searchCatalogs = manifestCatalogs.filter((catalog: any) => {
                      const hasSearch = catalog.extra?.some((extra: any) => extra.name === 'search')
                      return hasSearch
                    })
                    
                    // Add back search catalogs that aren't already in editCatalogs
                    const existingIds = new Set(prev.map((c: any) => `${c.id}:${c.type}`))
                    const newSearchCatalogs = searchCatalogs.filter((catalog: any) => {
                      const key = `${catalog.id}:${catalog.type}`
                      return !existingIds.has(key)
                    })
                    
                    return [...prev, ...newSearchCatalogs]
                  })
                  
                  // Update search state for all search catalogs
                  setCatalogSearchState((prevState) => {
                    const newState = new Map(prevState)
                    const manifestCatalogs = Array.isArray(detailManifest?.catalogs) ? detailManifest.catalogs : []
                    
                    manifestCatalogs.forEach((catalog: any) => {
                      const hasSearch = catalog.extra?.some((extra: any) => extra.name === 'search')
                      if (hasSearch) {
                        const key = `${catalog.id}:${catalog.type}`
                        newState.set(key, true)
                      }
                    })
                    
                    return newState
                  })
                }
              } else {
                // Regular resource handling
                setEditResources((prev) => {
                  const exists = isSelected(resource)
                  if (exists) {
                    const label = typeof resource === 'string' ? resource : (resource?.name || resource?.type || JSON.stringify(resource))
                    return prev.filter((p) => {
                      const pl = typeof p === 'string' ? p : (p?.name || p?.type || JSON.stringify(p))
                      return pl !== label
                    })
                  }
                  return [...prev, resource]
                })
              }
            }

            return (
              <EntityList
                title="Resources"
                count={allResources.length}
                items={allResources}
                layout="grid"
                getIsSelected={isSelected}
                renderItem={(resource: any) => (
                  <ResourceItem
                    key={typeof resource === 'string' ? resource : (resource?.name || resource?.type || JSON.stringify(resource))}
                    resource={resource}
                    isSelected={isSelected(resource)}
                    onToggle={handleResourceToggle}
                  />
                )}
                emptyMessage="No resources available for this addon"
                emptyIcon={<Puzzle className={`w-12 h-12 mx-auto mb-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />}
                headerRight={
                  <button
                    type="button"
                    onClick={handleResetResources}
                    className={`px-3 py-1 text-sm rounded transition-colors ${
                      isDark 
                        ? 'text-gray-300 hover:text-white hover:bg-gray-600' 
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                    title="Reset all resources to defaults"
                  >
                    Reset
                  </button>
                }
              />
            )
          })()}

          {/* Catalogs Section */}
          {(() => {
            const detailManifest: any = currentAddon?.originalManifest || currentAddon?.manifest
            const catalogAddons = detailManifest?.catalogs || []
            
            // Check if catalog resource is enabled
            const isCatalogResourceEnabled = editResources.includes('catalog') || editResources.some(r => 
              (typeof r === 'string' ? r : r?.name || r?.type) === 'catalog'
            )
            
            if (catalogAddons.length === 0 || !isCatalogResourceEnabled) return null

            const isCatalogSelected = (catalog: any) => {
              const catalogId = catalog?.id || catalog?.name
              const catalogType = catalog?.type || 'unknown'
              return editCatalogs.some(selected => {
                const selectedId = selected?.id || selected
                const selectedType = selected?.type || 'unknown'
                return selectedId === catalogId && selectedType === catalogType
              })
            }

            // Filter regular catalogs: show only catalogs that either have no search OR have search + other extras
            const regularCatalogs = catalogAddons.filter((catalog: any) => {
              if (!catalog.extra || !Array.isArray(catalog.extra)) return true // No extras = regular catalog
              
              const hasSearch = catalog.extra.some((extra: any) => extra.name === 'search')
              const hasOtherExtras = catalog.extra.some((extra: any) => extra.name !== 'search')
              
              return !hasSearch || hasOtherExtras // Show if no search OR has search + other extras
            })
            
            return (
              <EntityList
                title="Catalogs"
                count={regularCatalogs.length}
                items={regularCatalogs}
                layout="grid"
                getIsSelected={isCatalogSelected}
                renderItem={(catalog: any, index: number) => (
                  <CatalogItem
                    key={`${catalog?.id || catalog?.name}:${catalog?.type || 'unknown'}`}
                    catalog={catalog}
                    isSelected={isCatalogSelected(catalog)}
                    onToggle={handleCatalogToggle}
                  />
                )}
                emptyMessage="No catalogs available for this addon"
                emptyIcon={<BookOpen className="w-8 h-8" />}
                headerRight={
                  <button
                    type="button"
                    onClick={handleResetCatalogs}
                    className={`px-3 py-1 text-sm rounded transition-colors ${
                      isDark 
                        ? 'text-gray-300 hover:text-white hover:bg-gray-600' 
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                    title="Reset all catalogs to defaults"
                  >
                    Reset
                  </button>
                }
              />
            )
          })()}

          {/* Search Catalogs Section */}
          {(() => {
            const detailManifest: any = currentAddon?.originalManifest || currentAddon?.manifest
            const catalogAddons = detailManifest?.catalogs || []
            
            // Check if catalog resource is enabled
            const isCatalogResourceEnabled = editResources.includes('catalog') || editResources.some(r => 
              (typeof r === 'string' ? r : r?.name || r?.type) === 'catalog'
            )
            
            if (catalogAddons.length === 0 || !isCatalogResourceEnabled) return null

            // Find search catalogs (all catalogs with search in extras)
            const searchCatalogs: any[] = []
            
            catalogAddons.forEach((catalog: any) => {
              // Check if this catalog has search in its extras
              if (catalog.extra && Array.isArray(catalog.extra)) {
                const hasSearch = catalog.extra.some((extra: any) => extra.name === 'search')
                
                if (hasSearch) {
                  searchCatalogs.push({
                    ...catalog,
                    searchRequired: catalog.extra.find((extra: any) => extra.name === 'search')?.isRequired || false
                  })
                }
              }
            })

            if (searchCatalogs.length === 0) return null

            const isSearchCatalogSelected = (catalog: any) => {
              const catalogId = catalog?.id || catalog?.name
              const catalogType = catalog?.type || 'unknown'
              const key = `${catalogId}:${catalogType}`
              // Prefer DB-derived state
              if (catalogSearchState.get(key) === true) return true
              // Optimistic reflect: if the catalog was just toggled on (embedded) and now includes search in editCatalogs
              const existsWithSearch = editCatalogs.some((selected: any) => {
                const selectedId = selected?.id || selected
                const selectedType = selected?.type || 'unknown'
                if (selectedId !== catalogId || selectedType !== catalogType) return false
                return Array.isArray(selected?.extra) && selected.extra.some((e: any) => e?.name === 'search')
              })
              return existsWithSearch
            }

            const isSearchCatalogDisabled = (catalog: any) => {
              // With simplified logic, search catalogs are never disabled
              return false
            }

            return (
              <EntityList
                title="Search Catalogs"
                count={searchCatalogs.length}
                items={searchCatalogs}
                layout="grid"
                getIsSelected={isSearchCatalogSelected}
                renderItem={(searchCatalog: any, index: number) => (
                  <CatalogItem
                    key={`${searchCatalog?.id || searchCatalog?.name}:${searchCatalog?.type || 'unknown'}`}
                    catalog={searchCatalog}
                    isSelected={isSearchCatalogSelected(searchCatalog)}
                    onToggle={handleSearchCatalogToggle}
                    disabled={isSearchCatalogDisabled(searchCatalog)}
                  />
                )}
                emptyMessage="No search catalogs available for this addon"
                emptyIcon={<BookOpen className="w-8 h-8" />}
              />
            )
          })()}

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                isDark 
                  ? 'text-gray-300 hover:text-white hover:bg-gray-700' 
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 accent-bg accent-text hover:opacity-90"
            >
              {isLoading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
          </form>
        </div>
      </div>

      {/* Manifest JSON Modal */}
      {showManifestModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[1001] p-4">
          <div className={`relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-lg shadow-xl ${
            isDark ? 'bg-gray-800' : 'bg-white'
          }`}>
            <div className="absolute top-4 right-4 flex gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(manifestJson)
                  toast.success('JSON copied to clipboard')
                }}
                className={`p-2 rounded-lg transition-colors ${
                  isDark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
                }`}
                title="Copy JSON to clipboard"
              >
                <Copy className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowManifestModal(false)}
                className={`p-2 rounded-lg transition-colors ${
                  isDark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 pt-12">
              <h3 className={`text-lg font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Manifest JSON
              </h3>
              <pre className={`p-4 rounded-lg overflow-auto text-sm ${
                isDark ? 'bg-gray-900 text-gray-100' : 'bg-gray-100 text-gray-900'
              }`}>
                {manifestJson}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Original Manifest JSON Modal */}
      {showOriginalManifestModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[1001] p-4">
          <div className={`relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-lg shadow-xl ${
            isDark ? 'bg-gray-800' : 'bg-white'
          }`}>
            <div className="absolute top-4 right-4 flex gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(originalManifestJson)
                  toast.success('JSON copied to clipboard')
                }}
                className={`p-2 rounded-lg transition-colors ${
                  isDark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
                }`}
                title="Copy JSON to clipboard"
              >
                <Copy className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowOriginalManifestModal(false)}
                className={`p-2 rounded-lg transition-colors ${
                  isDark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 pt-12">
              <h3 className={`text-lg font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Original Manifest JSON
              </h3>
              <pre className={`p-4 rounded-lg overflow-auto text-sm ${
                isDark ? 'bg-gray-900 text-gray-100' : 'bg-gray-100 text-gray-900'
              }`}>
                {originalManifestJson}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  )
}
