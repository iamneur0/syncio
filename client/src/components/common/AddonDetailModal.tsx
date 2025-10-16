// backup kept in AddonDetailModal_backup.tsx if needed in the future
'use client'

import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Puzzle, X, BookOpen, Clapperboard, Tv, Library, Zap, Clipboard, ClipboardList } from 'lucide-react'
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
  const [urlCopied, setUrlCopied] = useState(false)
  
  
  // Initialize form data when addon changes
  useEffect(() => {
    if (currentAddon) {
      console.log('🔍 AddonDetailModal addon data:', {
        name: currentAddon.name,
        resources: currentAddon.resources,
        manifest: currentAddon.manifest,
        originalManifest: currentAddon.originalManifest,
        manifestResources: currentAddon.manifest?.resources,
        originalManifestResources: currentAddon.originalManifest?.resources,
        catalogs: currentAddon.manifest?.catalogs,
        originalCatalogs: currentAddon.originalManifest?.catalogs
      })
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
        const fallback = Array.isArray(detailManifest?.resources) ? detailManifest.resources : []
        console.log('🔍 Resources initialization:', { stored, fallback, final: stored !== null ? stored : fallback })
        // Use stored resources if explicitly set (including empty array), otherwise use manifest resources
        setEditResources(stored !== null ? stored : fallback)
      } catch (e) { 
        console.log('🔍 Error initializing resources:', e)
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
        console.log('🔍 Catalogs initialization:', { stored, fallback, final: stored !== null ? stored : fallback })
        // Use stored catalogs if explicitly set (including empty array), otherwise use manifest catalogs
        setEditCatalogs(stored !== null ? stored : fallback)
      } catch (e) { 
        console.log('🔍 Error initializing catalogs:', e)
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
    if (Array.isArray(editCatalogs)) updateData.catalogs = editCatalogs

    console.log('🔍 AddonDetailModal submitting data:', updateData)
    console.log('🔍 editCatalogs:', editCatalogs)
    console.log('🔍 editResources:', editResources)

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
        // Store catalog object with id and type only
        const catalogObject = {
          id: catalog?.id || catalog?.name,
          type: catalog?.type || 'unknown'
        }
        return [...prev, catalogObject]
      }
    })
  }

  const handleResetResources = () => {
    const detailManifest: any = currentAddon?.originalManifest || currentAddon?.manifest
    const defaultResources = Array.isArray(detailManifest?.resources) ? detailManifest.resources : []
    setEditResources(defaultResources)
    // Note: Changes will be saved when user clicks "Update" button
  }

  const handleResetCatalogs = () => {
    const detailManifest: any = currentAddon?.originalManifest || currentAddon?.manifest
    const defaultCatalogs = Array.isArray(detailManifest?.catalogs) ? detailManifest.catalogs : []
    // Create full catalog objects with id and type
    const catalogObjects = defaultCatalogs.map((c: any) => ({
      id: c?.id || c?.name,
      type: c?.type || 'unknown'
    }))
    setEditCatalogs(catalogObjects)
    // Note: Changes will be saved when user clicks "Update" button
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
        {/* Fixed close button in top-right */}
        <button
          onClick={onClose}
          className={`absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded transition-colors border-0 ${
            isDark ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
          }`}
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="p-6 pt-12">
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
            <div className="w-8 h-8" />
          </div>

          {/* URL */}
          <div className={`p-4 rounded-lg mb-6 ${isDark ? 'bg-gray-700' : 'bg-gray-50'}`}>
            <h3 className={`text-lg font-semibold mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              URL
            </h3>
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


          {/* Description at top */}
          <div className={`p-4 rounded-lg mb-6 ${isDark ? 'bg-gray-700' : 'bg-gray-50'}`}>
            <h3 className={`text-lg font-semibold mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Description
            </h3>
            <div className={`w-full px-3 py-2 rounded-lg ${
              isMono ? 'bg-black text-white border border-white/20' : (isDark ? 'bg-gray-800 text-white border border-gray-700' : 'bg-gray-100 text-gray-900 border border-gray-300')
            }`}>
              {currentAddon?.description || 'No description available'}
            </div>
          </div>

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
                emptyIcon={null}
                emptyMessage="No groups available. Go to Groups to create your first group."
              />
            )
          })()}

          {/* Resources Section */}
          {(() => {
            // Always get all resources from originalManifest (show all available options)
            const detailManifest: any = currentAddon?.originalManifest || currentAddon?.manifest
            const allResources: any[] = Array.isArray(detailManifest?.resources) ? detailManifest.resources : []
            
            console.log('🔍 Resources debug:', {
              allResources,
              addonResources: currentAddon?.resources,
              detailManifest: detailManifest?.resources
            })
            
            const isSelected = (item: any) => {
              const label = typeof item === 'string' ? item : (item?.name || item?.type || JSON.stringify(item))
              return editResources.some((s) => {
                const sl = typeof s === 'string' ? s : (s?.name || s?.type || JSON.stringify(s))
                return sl === label
              })
            }

            const handleResourceToggle = (resource: any) => {
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

            return (
              <EntityList
                title="Resources"
                count={allResources.length}
                items={allResources}
                layout="grid"
                onClear={handleResetResources}
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
                emptyIcon={<Puzzle className="w-8 h-8" />}
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
            
            return (
              <EntityList
                title="Catalogs"
                count={catalogAddons.length}
                items={catalogAddons}
                layout="grid"
                onClear={handleResetCatalogs}
                getIsSelected={isCatalogSelected}
                renderItem={(catalog: any, index: number) => (
                  <CatalogItem
                    key={index}
                    catalog={catalog}
                    isSelected={isCatalogSelected(catalog)}
                    onToggle={handleCatalogToggle}
                  />
                )}
                emptyMessage="No catalogs available for this addon"
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
    </div>,
    document.body
  )
}
