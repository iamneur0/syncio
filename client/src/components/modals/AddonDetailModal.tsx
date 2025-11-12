// backup kept in AddonDetailModal_backup.tsx if needed in the future
'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Puzzle, X, BookOpen, Clapperboard, Tv, Library, Zap, Clipboard, ClipboardList, Users, Copy, Loader2 } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { getEntityColorStyles } from '@/utils/colorMapping'
import { VersionChip } from '@/components/ui'
import AddonIcon from '@/components/entities/AddonIcon'
import { EntityList, InlineEdit, ResourceItem, CatalogItem } from '@/components/entities'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { addonsAPI, groupsAPI } from '@/services/api'
import toast from 'react-hot-toast'

const normalizeManifestUrl = (raw?: string | null): string => {
  if (!raw) return ''
  let sanitized = String(raw).trim()
  if (!sanitized) return ''
  sanitized = sanitized.replace(/^@+/, '')
  if (/^stremio:\/\//i.test(sanitized)) {
    sanitized = sanitized.replace(/^stremio:\/\//i, 'https://')
  }
  return sanitized
}

const urlsMatch = (a?: string | null, b?: string | null): boolean => {
  const left = normalizeManifestUrl(a)
  const right = normalizeManifestUrl(b)
  if (!left || !right) return false
  return left.toLowerCase() === right.toLowerCase()
}

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
  const { hideSensitive, theme } = useTheme()
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

  useEffect(() => {
    if (!isOpen) {
      setPreviewAddon(null)
      setIsPreviewLoading(false)
      setPreviewError(null)
    }
  }, [isOpen])

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

  const handleAddonNameDraftSave = useCallback(async (newName: string) => {
    setEditName(newName.trim())
  }, [])
  
  // Form state
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editGroupIds, setEditGroupIds] = useState<string[]>([])
  const [editResources, setEditResources] = useState<any[]>([])
  const [editCatalogs, setEditCatalogs] = useState<any[]>([])
  const [catalogSearchState, setCatalogSearchState] = useState<Map<string, boolean>>(new Map())
  const [urlCopied, setUrlCopied] = useState(false)
  const [editUrl, setEditUrl] = useState('')
  const [isUrlRevealed, setIsUrlRevealed] = useState(false)
  const [showManifestModal, setShowManifestModal] = useState(false)
  const [showOriginalManifestModal, setShowOriginalManifestModal] = useState(false)
  const [manifestJson, setManifestJson] = useState('')
  const [originalManifestJson, setOriginalManifestJson] = useState('')
const [previewAddon, setPreviewAddon] = useState<any | null>(null)
const [isPreviewLoading, setIsPreviewLoading] = useState(false)
const [previewError, setPreviewError] = useState<string | null>(null)

  // Debug mode check
  const isDebugMode = process.env.NEXT_PUBLIC_DEBUG === 'true' || process.env.NEXT_PUBLIC_DEBUG === '1'
  
  
  const hydrateAddonFromSource = useCallback((sourceAddon: any | null) => {
    if (!sourceAddon) {
      setEditName('')
      setEditDescription('')
      setEditUrl('')
      setEditGroupIds([])
      setEditResources([])
      setEditCatalogs([])
      setCatalogSearchState(new Map())
      return
    }

    setEditName(sourceAddon.name || '')
    // Get description from addon, or from manifest if available
    const manifest = sourceAddon?.manifest || sourceAddon?.originalManifest
    const description = sourceAddon.description || manifest?.description || ''
    setEditDescription(description)
    setEditUrl((prev) => {
      const next = sourceAddon.url || ''
      return prev === next ? prev : next
    })

    try {
      const initialGroupIds = Array.isArray(sourceAddon.groupIds) && sourceAddon.groupIds.length > 0
        ? sourceAddon.groupIds
        : (Array.isArray(sourceAddon.groups) ? sourceAddon.groups.map((g: any) => g.id).filter(Boolean) : [])
      setEditGroupIds(initialGroupIds)
    } catch {
      setEditGroupIds([])
    }

    try {
      const stored = Array.isArray(sourceAddon.resources) ? sourceAddon.resources : null
      const detailManifest: any = sourceAddon.originalManifest || sourceAddon.manifest
      const manifestResources = Array.isArray(detailManifest?.resources) ? detailManifest.resources : []

      const catalogAddons = detailManifest?.catalogs || []
      const hasSearchCatalogs = catalogAddons.some((catalog: any) =>
        catalog.extra?.some((extra: any) => extra.name === 'search')
      )

      const fallback = [...manifestResources]
      if (hasSearchCatalogs && !fallback.includes('search')) {
        fallback.push('search')
      }

      setEditResources(stored !== null ? stored : fallback)
    } catch {
      setEditResources([])
    }

    try {
      let stored = null
      if (Array.isArray(sourceAddon.catalogs)) {
        if (sourceAddon.catalogs.length > 0 && typeof sourceAddon.catalogs[0] === 'object') {
          stored = sourceAddon.catalogs
        } else {
          try {
            stored = JSON.parse(sourceAddon.catalogs)
          } catch {
            stored = sourceAddon.catalogs
          }
        }
      }

      const detailManifest: any = sourceAddon.originalManifest || sourceAddon.manifest
      const fallback = Array.isArray(detailManifest?.catalogs) ? detailManifest.catalogs : []

      if (stored !== null && stored.length > 0) {
        const manifestCatalogs = Array.isArray(detailManifest?.catalogs) ? detailManifest.catalogs : []

        const storedCatalogMap = new Map()
        stored.forEach((storedCatalog: any) => {
          const key = `${storedCatalog.id}:${storedCatalog.type}`
          storedCatalogMap.set(key, storedCatalog)
        })

        const mergedCatalogs = manifestCatalogs
          .map((manifestCatalog: any) => {
            const key = `${manifestCatalog.id}:${manifestCatalog.type}`
            const storedCatalog = storedCatalogMap.get(key)

            if (storedCatalog) {
              const hasSearch = manifestCatalog.extra?.some((extra: any) => extra.name === 'search')
              const hasOtherExtras = manifestCatalog.extra?.some((extra: any) => extra.name !== 'search')
              const isEmbeddedSearch = hasSearch && hasOtherExtras
              const isStandaloneSearch = hasSearch && !hasOtherExtras

              if (isEmbeddedSearch) {
                const storedHasSearch = storedCatalog.search === true
                if (storedHasSearch) {
                  return manifestCatalog
                }
                return {
                  ...manifestCatalog,
                  extra: manifestCatalog.extra?.filter((extra: any) => extra.name !== 'search') || [],
                  extraSupported: manifestCatalog.extraSupported?.filter((extra: any) => extra !== 'search') || []
                }
              } else if (isStandaloneSearch) {
                return storedCatalog.search === true ? manifestCatalog : null
              }

              return manifestCatalog
            }

            return null
          })
          .filter(Boolean)

        const searchStateMap = new Map<string, boolean>()
        stored.forEach((storedCatalog: any) => {
          const key = `${storedCatalog.id}:${storedCatalog.type}`
          searchStateMap.set(key, storedCatalog.search === true)
        })
        setCatalogSearchState(searchStateMap)
        setEditCatalogs(mergedCatalogs as any[])
      } else {
        const manifestCatalogs = Array.isArray(detailManifest?.catalogs) ? detailManifest.catalogs : []
        const searchStateMap = new Map<string, boolean>()
        manifestCatalogs.forEach((catalog: any) => {
          const key = `${catalog.id}:${catalog.type}`
          searchStateMap.set(key, false)
        })

        setCatalogSearchState(searchStateMap)
        setEditCatalogs(fallback)
      }
    } catch {
      setEditCatalogs([])
    }
  }, [])

  useEffect(() => {
    hydrateAddonFromSource(previewAddon || currentAddon || null)
  }, [currentAddon, previewAddon, hydrateAddonFromSource])

  useEffect(() => {
    if (!isOpen || !currentAddon) return

    const trimmed = editUrl.trim()

    if (!trimmed || urlsMatch(trimmed, currentAddon.url)) {
      if (previewAddon) {
        setPreviewAddon(null)
      }
      setPreviewError(null)
      setIsPreviewLoading(false)
      return
    }

    const normalizedInput = normalizeManifestUrl(trimmed)

    if (!/^https?:\/\//i.test(normalizedInput)) {
      setPreviewAddon(null)
      setIsPreviewLoading(false)
      setPreviewError(trimmed ? 'Enter a valid http(s) URL' : null)
      return
    }

    if (previewAddon && urlsMatch(previewAddon.url, normalizedInput)) {
      setPreviewError(null)
      return
    }

    let cancelled = false
    const controller = new AbortController()
    setIsPreviewLoading(true)
    setPreviewError(null)

    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch(normalizedInput, { signal: controller.signal, mode: 'cors' })
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        const manifestData = await response.json()
        if (cancelled) return

        setPreviewAddon({
          ...currentAddon,
          url: normalizedInput,
          version: manifestData?.version || manifestData?.addonVersion || currentAddon.version || null,
          description: manifestData?.description ?? manifestData?.desc ?? currentAddon?.description ?? '',
          iconUrl: manifestData?.logo || currentAddon?.iconUrl || null,
          manifest: manifestData,
          originalManifest: manifestData,
          resources: Array.isArray(manifestData?.resources) ? manifestData.resources : [],
          catalogs: Array.isArray(manifestData?.catalogs) ? manifestData.catalogs : [],
        })
        setPreviewError(null)
      } catch (err: any) {
        if (cancelled) return
        if (err?.name === 'AbortError') return
        console.error('Failed to load manifest preview:', err)
        setPreviewAddon(null)
        setPreviewError('Failed to load manifest from this URL')
      } finally {
        if (!cancelled) {
          setIsPreviewLoading(false)
        }
      }
    }, 500)

    return () => {
      cancelled = true
      controller.abort()
      window.clearTimeout(timeoutId)
    }
  }, [editUrl, currentAddon, isOpen, previewAddon])

  useEffect(() => {
    setIsUrlRevealed(!hideSensitive)
  }, [hideSensitive])




  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const updateData: any = {}
    
    const trimmedName = editName.trim()
    if (trimmedName && trimmedName !== (currentAddon?.name || '').trim()) {
      updateData.name = trimmedName
    }

    const trimmedDescription = editDescription.trim()
    if (trimmedDescription !== (currentAddon?.description || '').trim()) {
      updateData.description = trimmedDescription
    }

    const trimmedUrl = editUrl.trim()
    if (trimmedUrl) {
      const normalizedUrl = normalizeManifestUrl(trimmedUrl)
      if (normalizedUrl && !urlsMatch(normalizedUrl, currentAddon?.url)) {
        updateData.url = normalizedUrl
      }
    }
    
    // Groups are managed via groups API to unify behavior with GroupDetailModal
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

    try {
      // Determine current associated groups from addonData (supports both shapes)
      const currentIds: string[] = (() => {
        try {
          if (Array.isArray(currentAddon?.groupIds) && currentAddon.groupIds.length > 0) return currentAddon.groupIds
          if (Array.isArray(currentAddon?.groups)) return currentAddon.groups.map((g: any) => g.id).filter(Boolean)
        } catch {}
        return []
      })()

      const toAdd = editGroupIds.filter(id => !currentIds.includes(id))
      const toRemove = currentIds.filter(id => !editGroupIds.includes(id))

      // Apply group changes using canonical endpoints
      for (const gid of toAdd) {
        await groupsAPI.addAddon(gid, currentAddon.id)
      }
      for (const gid of toRemove) {
        await groupsAPI.removeAddon(gid, currentAddon.id)
      }

      // Update other addon fields (name/resources/catalogs)
      await updateAddonMutation.mutateAsync({ addonId: currentAddon.id, addonData: updateData })
      onSave(updateData)
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to save changes')
    }
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
    const detailManifest: any = addonManifest
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
    const detailManifest: any = addonManifest
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

  const effectiveAddon = previewAddon || currentAddon
  const originalManifest = React.useMemo(() => {
    if (previewAddon?.originalManifest && typeof previewAddon.originalManifest === 'object') {
      return previewAddon.originalManifest
    }
    if (currentAddon?.originalManifest && typeof currentAddon.originalManifest === 'object') {
      return currentAddon.originalManifest
    }
    return null
  }, [previewAddon, currentAddon])
  const filteredManifest = React.useMemo(() => {
    if (previewAddon?.manifest && typeof previewAddon.manifest === 'object') {
      return previewAddon.manifest
    }
    if (currentAddon?.manifest && typeof currentAddon.manifest === 'object') {
      return currentAddon.manifest
    }
    return null
  }, [previewAddon, currentAddon])
  const addonManifest = originalManifest || filteredManifest || {}
  const addonLogoUrl =
    effectiveAddon?.iconUrl ||
    addonManifest?.logo ||
    addonManifest?.icon ||
    addonManifest?.images?.logo


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
      <div
        className={`relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-lg shadow-xl card`}
        style={{ background: 'var(--color-background)' }}
      >
        <div className="p-6">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between mb-6 gap-4">
            <div className="flex items-center gap-4 relative">
              <AddonIcon
                name={editName || effectiveAddon?.name || addonManifest?.name || 'Addon'}
                iconUrl={addonLogoUrl}
                size="12"
                className="flex-shrink-0"
                colorIndex={1}
              />
              <div className="flex items-center gap-3">
                <InlineEdit
                  value={editName}
                  onSave={handleAddonNameDraftSave}
                  placeholder="Enter addon name..."
                  maxLength={100}
                />
                {effectiveAddon?.version && (
                  <VersionChip version={effectiveAddon.version} />
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className={`w-8 h-8 flex items-center justify-center rounded transition-colors border-0 color-hover`}
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* URL and Description */}
          <div className="p-4 rounded-lg mb-6 section-panel">
            <div className="flex items-center justify-between mb-3">
              <h3 className={`text-lg font-semibold`}>
                Details
            </h3>
              <button
                type="button"
                onClick={handleMasterReset}
                className={`px-3 py-1 text-sm rounded transition-colors color-text-secondary color-hover`}
                title="Reset all resources and catalogs to defaults"
              >
                Reset
              </button>
            </div>
            
            <div className="mb-4">
              <h4 className={`text-sm font-semibold mb-2`}>
                URL
              </h4>
              <div className="flex items-center gap-2">
                <input
                  type={hideSensitive && !isUrlRevealed ? 'password' : 'text'}
                  value={
                    hideSensitive && !isUrlRevealed
                      ? (editUrl ? '\u2022'.repeat(30) : '')
                      : editUrl
                  }
                  onChange={(e) => {
                    if (!(hideSensitive && !isUrlRevealed)) {
                      setEditUrl(e.target.value)
                    }
                  }}
                  onClick={() => {
                    if (hideSensitive && !isUrlRevealed) {
                      setIsUrlRevealed(true)
                    }
                  }}
                  onBlur={() => {
                    if (hideSensitive) {
                      setIsUrlRevealed(false)
                    }
                  }}
                  placeholder="https://example.com/configure"
                  className={`input w-full px-3 py-2 ${hideSensitive && !isUrlRevealed ? 'blur-sm' : ''}`}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={async () => {
                    const urlToCopy = editUrl.trim()
                    if (!urlToCopy) return
                    try {
                      await navigator.clipboard.writeText(urlToCopy)
                      setUrlCopied(true)
                      setTimeout(() => setUrlCopied(false), 1200)
                      toast.success('URL copied to clipboard')
                    } catch (err) {
                      console.error('Failed to copy URL:', err)
                      toast.error('Failed to copy URL')
                    }
                  }}
                  className="w-10 h-10 rounded flex items-center justify-center color-hover"
                  title="Copy URL"
                >
                  {isPreviewLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : urlCopied ? (
                    <ClipboardList className="w-4 h-4" />
                  ) : (
                    <Clipboard className="w-4 h-4" />
                  )}
                </button>
              </div>
              {previewError && (
                <p className="text-xs mt-1 color-negative">
                  {previewError}
                </p>
              )}
            </div>

            <div>
              <h4 className={`text-sm font-semibold mb-2`}>
              Description
              </h4>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="No description available"
                className={`w-full px-3 py-2 rounded-lg input min-h-[80px] resize-y`}
              />
            </div>
          </div>

          {/* Manifest Buttons - Debug Only */}
          {isDebugMode && (
            <div className="p-4 rounded-lg mb-6 section-panel">
              <h3 className={`text-lg font-semibold mb-3`}>
                Manifest (Debug)
              </h3>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (filteredManifest) {
                      try {
                        setManifestJson(JSON.stringify(filteredManifest, null, 2))
                        setShowManifestModal(true)
                      } catch (err) {
                        console.error('Failed to parse manifest:', err)
                      }
                    }
                  }}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors color-surface hover:opacity-90`}
                >
                  View Manifest
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (originalManifest) {
                      try {
                        setOriginalManifestJson(JSON.stringify(originalManifest, null, 2))
                        setShowOriginalManifestModal(true)
                      } catch (err) {
                        console.error('Failed to parse original manifest:', err)
                      }
                    }
                  }}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors color-surface hover:opacity-90`}
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
                    className={`flex items-center justify-between p-3 rounded-lg cursor-pointer card card-selectable color-hover hover:shadow-lg ${
                      isGroupSelected(group) ? 'card-selected' : ''
                    }`}
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
                )}
                emptyIcon={<Users className={`w-12 h-12 mx-auto mb-4 color-text-secondary`} />}
                emptyMessage="No groups associated with this addon"
              />
            )
          })()}

          {/* Resources Section */}
          {(() => {
            // Always get all resources from originalManifest (show all available options)
            const detailManifest: any = addonManifest
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
                emptyIcon={<Puzzle className={`w-12 h-12 mx-auto mb-4 color-text-secondary`} />}
                headerRight={
                  <button
                    type="button"
                    onClick={handleResetResources}
                    className={`px-3 py-1 text-sm rounded transition-colors color-text-secondary color-hover`}
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
            const detailManifest: any = addonManifest
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
                    className={`px-3 py-1 text-sm rounded transition-colors color-text-secondary color-hover`}
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
            const detailManifest: any = addonManifest
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
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors color-text-secondary color-hover`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 color-surface hover:opacity-90"
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
          <div className={`relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-lg shadow-xl card`}>
            <div className="absolute top-4 right-4 flex gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(manifestJson)
                  toast.success('JSON copied to clipboard')
                }}
                className={`p-2 rounded-lg transition-colors color-text-secondary color-hover`}
                title="Copy JSON to clipboard"
              >
                <Copy className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowManifestModal(false)}
                className={`p-2 rounded-lg transition-colors color-text-secondary color-hover`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 pt-12">
              <h3 className={`text-lg font-semibold mb-4`}>
                Manifest JSON
              </h3>
              <pre className={`p-4 rounded-lg overflow-auto text-sm color-surface color-text`}>
                {manifestJson}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Original Manifest JSON Modal */}
      {showOriginalManifestModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[1001] p-4">
          <div className={`relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-lg shadow-xl card`}>
            <div className="absolute top-4 right-4 flex gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(originalManifestJson)
                  toast.success('JSON copied to clipboard')
                }}
                className={`p-2 rounded-lg transition-colors color-text-secondary color-hover`}
                title="Copy JSON to clipboard"
              >
                <Copy className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowOriginalManifestModal(false)}
                className={`p-2 rounded-lg transition-colors color-text-secondary color-hover`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 pt-12">
              <h3 className={`text-lg font-semibold mb-4`}>
                Original Manifest JSON
              </h3>
              <pre className={`p-4 rounded-lg overflow-auto text-sm color-surface color-text`}>
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
