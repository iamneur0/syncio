'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTheme } from '@/contexts/ThemeContext'
import { useDebounce } from '../../hooks/useDebounce'
import { addonsAPI, groupsAPI, type CreateAddonData } from '@/services/api'
import api from '@/services/api'
import toast from 'react-hot-toast'
import { Star, ExternalLink, X } from 'lucide-react'
import { getColorBgClass, getColorOptions } from '@/utils/colorMapping'

// Helper functions
function getGroupColorClass(colorIndex: number): string {
  const colors = ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose']
  return colors[(colorIndex - 1) % colors.length] || 'gray'
}

function getColorValue(colorClass: string): string {
  const colorMap: { [key: string]: string } = {
    red: '#ef4444', orange: '#f97316', amber: '#f59e0b', yellow: '#eab308', lime: '#84cc16', green: '#22c55e', emerald: '#10b981', teal: '#14b8a6', cyan: '#06b6d4', sky: '#0ea5e9', blue: '#3b82f6', indigo: '#6366f1', violet: '#8b5cf6', purple: '#a855f7', fuchsia: '#d946ef', pink: '#ec4899', rose: '#f43f5e'
  }
  return colorMap[colorClass] || '#6b7280'
}

// Components
import PageHeader from '../common/PageHeader'
import EntityCard from '../common/EntityCard'
import AddonModal from '../common/AddonModal'
import AddonDetailModal from '../common/AddonDetailModal'
import { LoadingSkeleton, EmptyState, ConfirmDialog } from '../common'

// Discovery card component
function DiscoveryCard({ isDark, isModern, isModernDark, isMono, viewMode }: { isDark: boolean; isModern: boolean; isModernDark: boolean; isMono: boolean; viewMode: 'card' | 'list' }) {
  const [showDiscovery, setShowDiscovery] = useState(false)
  
  const addonProjects = [
    {
      name: "AIOMetadata",
      description: "The Ultimate Stremio Metadata Addon",
      icon: "/assets/aiometadata.png",
      projectUrl: "https://github.com/cedya77/aiometadata",
      category: "Metadata",
      providers: [
        { name: "Omni", url: "https://aiometadata.12312023.xyz/" },
        { name: "Yeb", url: "https://aiometadatafortheweak.nhyira.dev/" },
        { name: "Midnight", url: "https://aiometadatafortheweebs.midnightignite.me/" },
        { name: "Viren", url: "https://aiometadata.viren070.me/" }
      ]
    },
    {
      name: "AIOStreams",
      description: "Consolidates multiple Stremio addons and debrid services into a single, highly customisable super-addon.",
      icon: "/assets/aiostreams.ico",
      projectUrl: "https://github.com/Viren070/AIOStreams",
      category: "Streaming",
      providers: [
        { name: "Elf", url: "https://aiostreams.elfhosted.com/" },
        { name: "Yeb", url: "https://aiostreamsfortheweak.nhyira.dev/" },
        { name: "Midnight", url: "https://aiostreams.midnightignite.me/" },
        { name: "Viren", url: "https://aiostreams.viren070.me/" }
      ]
    }
  ]

  return (
    <div 
      className={`rounded-lg border ${viewMode === 'list' ? 'cursor-pointer' : 'cursor-default'} ${
        viewMode === 'list' 
          ? `p-4 ${
              isMono
                ? 'bg-black border-white/20 shadow-none'
                : isModern
                ? 'bg-gradient-to-r from-purple-50/90 to-blue-50/90 border-purple-200/50 shadow-md shadow-purple-100/20'
                : isModernDark
                ? 'bg-gradient-to-r from-purple-800/40 to-blue-800/40 border-purple-600/50 shadow-md shadow-purple-900/20'
                : isDark 
                ? 'bg-gradient-to-br from-purple-900/20 to-blue-900/20 border-purple-700/50 hover:shadow-md' 
                : 'bg-gradient-to-br from-purple-50 to-blue-50 border-purple-200 hover:shadow-md'
            }`
          : `p-6 flex flex-col ${
              isMono
                ? 'bg-black border-white/20 shadow-none'
                : isModern
                ? 'bg-gradient-to-br from-purple-100/90 to-blue-100/90 border-purple-300/60 shadow-lg shadow-purple-100/50 hover:shadow-md'
                : isModernDark
                ? 'bg-gradient-to-br from-purple-800/50 to-blue-800/50 border-purple-600/60 shadow-lg shadow-purple-900/50 hover:shadow-md'
                : isDark 
                ? 'bg-gradient-to-br from-purple-900/20 to-blue-900/20 border-purple-700/50 hover:shadow-md' 
                : 'bg-gradient-to-br from-purple-50 to-blue-50 border-purple-200 hover:shadow-md'
            } ${showDiscovery ? '' : 'h-full'}`
      }`}
      onClick={(e) => {
        e.stopPropagation();
        // Only allow expansion in list mode
        if (viewMode === 'list') {
        setShowDiscovery(!showDiscovery);
        }
      }}
    >
      {viewMode === 'list' ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center flex-1 min-w-0">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center mr-3 flex-shrink-0 ${isMono ? 'bg-black border border-white/20 text-white' : 'bg-gradient-to-br from-purple-500 to-blue-500 text-white'}`}>
              <Star className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className={`font-semibold truncate ${
                  isMono
                    ? 'text-white'
                    : isModern 
                    ? 'text-purple-800' 
                    : isModernDark
                    ? 'text-purple-100'
                    : isDark ? 'text-white' : 'text-gray-900'
                }`}>
                  Discover Addons
                </h3>
              </div>
              <p className={`hidden sm:block text-sm truncate ${
                isMono
                  ? 'text-white/70'
                  : isModern 
                  ? 'text-purple-600' 
                  : isModernDark
                  ? 'text-purple-300'
                  : isDark ? 'text-gray-400' : 'text-gray-600'
              }`}>
                Popular addon projects with multiple providers
              </p>
            </div>
          </div>
          {/* Placeholder for toggle switch area to match other cards */}
          <div className="w-9 h-5 flex-shrink-0"></div>
        </div>
      ) : (
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center">
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center mr-3 ${isMono ? 'bg-black border border-white/20 text-white' : 'bg-gradient-to-br from-purple-500 to-blue-500 text-white'}`}>
              <Star className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className={`text-lg font-semibold ${
                  isMono
                    ? 'text-white'
                    : isModern 
                    ? 'text-purple-800' 
                    : isModernDark
                    ? 'text-purple-100'
                    : isDark ? 'text-white' : 'text-gray-900'
                }`}>
                  Discover Addons
                </h3>
              </div>
              <p className={`text-sm ${
                isMono
                  ? 'text-white/70'
                  : isModern 
                  ? 'text-purple-600' 
                  : isModernDark
                  ? 'text-purple-300'
                  : isDark ? 'text-gray-400' : 'text-gray-600'
              }`}>
                Popular addon projects with multiple providers
              </p>
            </div>
          </div>
          {/* Placeholder for toggle switch area to match other cards */}
          <div className="w-9 h-5"></div>
        </div>
      )}

      {showDiscovery && viewMode === 'list' && (
        <div className="space-y-3 mt-4 max-h-96 overflow-y-auto">
          {addonProjects.map((project, index) => (
                       <div
                         key={index}
                         className={`p-4 rounded-lg border ${
                           isMono
                             ? 'bg-black border-white/20 shadow-none'
                             : isModern
                             ? 'bg-purple-50/80 border-purple-200/60 shadow-md shadow-purple-100/30'
                             : isModernDark
                  ? 'bg-purple-800/30 border-purple-600/40 shadow-md shadow-purple-900/30'
                             : isDark 
                  ? 'bg-gray-700 border-gray-600' 
                  : 'bg-white border-gray-200'
                         }`}
                       >
              <div className="flex items-start gap-3">
                  <img 
                    src={project.icon} 
                    alt={project.name}
                  className="w-10 h-10 rounded-lg flex-shrink-0"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className={`font-semibold truncate ${
                               isMono
                                 ? 'text-white'
                                 : isModern 
                                 ? 'text-purple-800' 
                                 : isModernDark
                                 ? 'text-purple-100'
                                 : isDark ? 'text-white' : 'text-gray-900'
                             }`}>
                               {project.name}
                             </h4>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      isMono
                        ? 'bg-white/20 text-white'
                        : isModern
                        ? 'bg-purple-100 text-purple-700'
                        : isModernDark
                        ? 'bg-purple-700 text-purple-100'
                        : isDark 
                        ? 'bg-gray-600 text-gray-200' 
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {project.category}
                    </span>
                  </div>
                  <p className={`text-sm mb-3 ${
                               isMono
                                 ? 'text-white/70'
                                 : isModern 
                                 ? 'text-purple-600' 
                                 : isModernDark
                                 ? 'text-purple-300'
                                 : isDark ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                               {project.description}
                             </p>
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {project.providers.map((provider, providerIndex) => (
                        <a
                          key={providerIndex}
                          href={provider.url}
                  target="_blank"
                  rel="noopener noreferrer"
                          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    isMono
                              ? 'bg-white/10 text-white hover:bg-white/20'
                              : isModern
                              ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                              : isModernDark
                              ? 'bg-purple-700 text-purple-100 hover:bg-purple-600'
                      : isDark
                              ? 'bg-gray-600 text-gray-200 hover:bg-gray-500' 
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                          onClick={(e) => e.stopPropagation()}
                >
                          {provider.name}
                </a>
                      ))}
              </div>
                  <a
                      href={project.projectUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                      className={`inline-flex items-center gap-1 text-xs font-medium ${
                                 isMono
                          ? 'text-white/70 hover:text-white'
                                   : isModern
                          ? 'text-purple-600 hover:text-purple-700' 
                                   : isModernDark
                          ? 'text-purple-300 hover:text-purple-100'
                          : isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-600 hover:text-gray-700'
                      }`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="w-3 h-3" />
                      View Project
                    </a>
              </div>
            </div>
          </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AddonsPageSimple() {
  const { isDark, isModern, isModernDark, isMono } = useTheme()
  const queryClient = useQueryClient()
  
  // State
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState<'card' | 'list'>(() => {
    if (typeof window !== 'undefined') {
      const raw = String(localStorage.getItem('global-view-mode') || 'card').toLowerCase().trim()
      return raw === 'list' ? 'list' : 'card'
    }
    return 'card'
  })
  const [selectedAddons, setSelectedAddons] = useState<string[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedAddon, setSelectedAddon] = useState<any>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [addonToDelete, setAddonToDelete] = useState<{ id: string; name: string } | null>(null)
  
  // Add modal state
  const [newAddonName, setNewAddonName] = useState('')
  const [newAddonUrl, setNewAddonUrl] = useState('')
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([])
  const [newAddonVersion, setNewAddonVersion] = useState<string>('')
  const [urlError, setUrlError] = useState<string>('')
  const [isLoadingManifest, setIsLoadingManifest] = useState(false)
  const [manifestData, setManifestData] = useState<any>(null)

  // Escape key handling for modals
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showAddModal) {
          setShowAddModal(false)
          setIsLoadingManifest(false)
          setManifestData(null)
        } else if (showDetailModal) {
          setShowDetailModal(false)
          setSelectedAddon(null)
        }
      }
    }
    
    if (showAddModal || showDetailModal) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [showAddModal, showDetailModal])

  // Add modal-open class to body when modals are open
  useEffect(() => {
    if (showAddModal || showDetailModal) {
      document.body.classList.add('modal-open')
    } else {
      document.body.classList.remove('modal-open')
    }
    
    // Cleanup on unmount
    return () => {
      document.body.classList.remove('modal-open')
    }
  }, [showAddModal, showDetailModal])

  const debouncedSearchTerm = useDebounce(searchTerm, 300)

  // Persist view mode to localStorage
  useEffect(() => {
    localStorage.setItem('global-view-mode', viewMode)
  }, [viewMode])

  // Clear selection when switching view modes
  useEffect(() => {
    setSelectedAddons([])
  }, [viewMode])

  // Load manifest when URL changes
  useEffect(() => {
    if (!newAddonUrl.trim()) {
      setUrlError('')
      setIsLoadingManifest(false)
      setManifestData(null)
      setNewAddonVersion('')
      return
    }

    const loadManifest = async () => {
      setIsLoadingManifest(true)
      setUrlError('')
      setManifestData(null)
      setNewAddonVersion('')

      try {
        const response = await fetch(newAddonUrl)
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }
        
        const manifest = await response.json()
        
        if (!manifest.id || !manifest.version) {
          throw new Error('Invalid manifest: missing required fields')
        }

        setManifestData(manifest)
        setNewAddonVersion(manifest.version)
        
        if (!newAddonName.trim()) {
          setNewAddonName(manifest.name || manifest.id || 'Unnamed Addon')
        }
        
        setUrlError('')
      } catch (error: any) {
        console.error('Error loading manifest:', error)
        setUrlError(error.message || 'Failed to load manifest')
        setManifestData(null)
        setNewAddonVersion('')
      } finally {
        setIsLoadingManifest(false)
      }
    }

    const timeoutId = setTimeout(loadManifest, 500)
    return () => clearTimeout(timeoutId)
  }, [newAddonUrl, newAddonName])

  // Fetch data
  const {
    data: addons,
    isLoading: addonsLoading,
    error: addonsError
  } = useQuery({
    queryKey: ['addons'],
    queryFn: () => addonsAPI.getAll(),
    retry: 1,
    enabled: true,
  })

  const {
    data: groups,
    isLoading: groupsLoading,
    error: groupsError
  } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsAPI.getAll(),
    retry: 1,
    enabled: true,
  })

  // Mutations
  const createAddonMutation = useMutation({
    mutationFn: (data: CreateAddonData) => addonsAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addons'] })
      toast.success('Addon created successfully')
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || error?.message || 'Failed to create addon'
      toast.error(message)
    }
  })

  const deleteAddonMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => addonsAPI.delete(id),
    onSuccess: (_, { name }) => {
      queryClient.invalidateQueries({ queryKey: ['addons'] })
      toast.success(`"${name}" deleted successfully`)
    },
    onError: (error: any, { name }) => {
      const message = error?.response?.data?.error || error?.message || 'Failed to delete addon'
      toast.error(`Failed to delete "${name}": ${message}`)
    }
  })

  const updateAddonMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => addonsAPI.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addons'] })
      toast.success('Addon updated successfully')
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || error?.message || 'Failed to update addon'
      toast.error(message)
    }
  })

  const reloadAddonMutation = useMutation({
    mutationFn: (id: string) => addonsAPI.reload(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addons'] })
      toast.success('Addon reloaded successfully')
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || error?.message || 'Failed to reload addon'
      toast.error(message)
    }
  })

  const reloadAllMutation = useMutation({
    mutationFn: () => Promise.resolve(), // Placeholder - no reloadAll API
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addons'] })
      toast.success('All addons reloaded successfully')
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || error?.message || 'Failed to reload addons'
      toast.error(message)
    }
  })

  // Filter addons based on search
  const displayAddons = useMemo(() => {
    if (!Array.isArray(addons)) return []
    
    const filtered = addons.filter((addon: any) => {
      const searchLower = debouncedSearchTerm.toLowerCase()
      return (
        addon.name?.toLowerCase().includes(searchLower) ||
        addon.description?.toLowerCase().includes(searchLower) ||
        addon.manifestUrl?.toLowerCase().includes(searchLower)
      )
    })
    
    return Array.isArray(filtered) ? filtered : []
  }, [addons, debouncedSearchTerm])

  // Selection handlers
  const handleSelectAll = () => {
    setSelectedAddons(displayAddons.map((addon: any) => addon.id))
  }

  const handleDeselectAll = () => {
    setSelectedAddons([])
  }

  const handleAddonToggle = (addonId: string) => {
    setSelectedAddons((prev: string[]) => 
      prev.includes(addonId) 
        ? prev.filter((id: string) => id !== addonId)
        : [...prev, addonId]
    )
  }

  const handleToggleAddonStatus = (addonId: string, currentStatus: boolean) => {
    console.log('🔄 Toggle addon status:', { addonId, currentStatus })
    const addon = addons?.find(a => a.id === addonId)
    const addonName = addon?.name || 'Addon'
    api.patch(`/addons/${addonId}/toggle-status`, { isActive: !currentStatus })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['addons'] })
        toast.success(`${addonName} ${!currentStatus ? 'enabled' : 'disabled'}`)
      })
      .catch((error: any) => {
        console.error('❌ Toggle addon error:', error)
        toast.error(error?.message || 'Failed to toggle addon status')
      })
  }

  // Action handlers

  const handleDeleteAddon = (id: string, name: string) => {
    setAddonToDelete({ id, name })
    setShowDeleteConfirm(true)
  }

  const confirmDeleteAddon = () => {
    if (addonToDelete) {
      deleteAddonMutation.mutate({ id: addonToDelete.id, name: addonToDelete.name })
      setShowDeleteConfirm(false)
      setAddonToDelete(null)
    }
  }

  const cancelDeleteAddon = () => {
    setShowDeleteConfirm(false)
    setAddonToDelete(null)
  }

  const handleViewAddon = (addon: any) => {
    setSelectedAddon(addon)
    setShowDetailModal(true)
  }

  const handleCloseDetailModal = () => {
    setShowDetailModal(false)
    setSelectedAddon(null)
  }

  const handleReloadAddon = (addonId: string) => {
    reloadAddonMutation.mutate(addonId)
  }

  const handleBulkDelete = () => {
    if (selectedAddons.length === 0) {
      toast.error('No addons selected')
      return
    }
    // Implement bulk delete logic
  }

  const handleViewModeChange = (mode: 'card' | 'list') => {
    setViewMode(mode)
    localStorage.setItem('global-view-mode', mode)
  }

  // Modal handlers
  const handleAddAddon = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!newAddonName.trim() || !newAddonUrl.trim()) {
      toast.error('Please fill in all required fields')
          return
        }

    if (urlError) {
      toast.error('Please fix the URL error before adding the addon')
      return
    }

    if (!manifestData) {
      toast.error('Please wait for the manifest to load')
      return
    }

    try {
      const addonData: CreateAddonData = {
        name: newAddonName.trim(),
        url: newAddonUrl.trim(),
        description: manifestData.description || '',
        groupIds: selectedGroupIds,
        manifestData: manifestData
      }

      await createAddonMutation.mutateAsync(addonData)
      
      // Reset form
      setNewAddonName('')
      setNewAddonUrl('')
      setSelectedGroupIds([])
      setNewAddonVersion('')
      setUrlError('')
      setIsLoadingManifest(false)
      setManifestData(null)
      setShowAddModal(false)
      
      toast.success('Addon added successfully!')
    } catch (error) {
      console.error('Error adding addon:', error)
      toast.error('Failed to add addon')
    }
  }


  const isLoading = addonsLoading || groupsLoading
  const error = addonsError || groupsError

  // Only show loading state if data is actually taking time to load
  const [showLoading, setShowLoading] = useState(false)
  
  useEffect(() => {
    if (isLoading) {
      const timer = setTimeout(() => setShowLoading(true), 200) // 200ms delay
      return () => clearTimeout(timer)
    } else {
      setShowLoading(false)
    }
  }, [isLoading])

  // Loading state
  if (isLoading && showLoading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <LoadingSkeleton key={i} className="h-48 opacity-60" />
          ))}
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <EmptyState
        icon="⚠️"
        title="Failed to load addons"
        description="There was an error loading the addons. Please try again."
      />
    )
  }

  // Empty state
  if (!isLoading && Array.isArray(addons) && addons.length === 0) {
    return (
      <EmptyState
        icon="🧩"
        title="No addons yet"
        description="Add your first addon to get started."
        action={{
          label: "Add Addon",
          onClick: () => setShowAddModal(true)
        }}
      />
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Addons"
        description="Manage your Stremio addons"
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search addons..."
        selectedCount={selectedAddons.length}
        onSelectAll={handleSelectAll}
        onDeselectAll={handleDeselectAll}
        onAdd={() => setShowAddModal(true)}
        onReload={() => reloadAllMutation.mutate()}
        onDelete={handleBulkDelete}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        isReloading={reloadAllMutation.isPending}
        isReloadDisabled={selectedAddons.length === 0 || reloadAllMutation.isPending}
        isDeleteDisabled={selectedAddons.length === 0}
        mounted={true}
      />

      {/* Content */}
          {viewMode === 'card' ? (
            /* Card Grid View */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
              {displayAddons.map((addon: any) => (
            <EntityCard
              key={addon.id}
              variant="addon"
              entity={{
                ...addon,
                isActive: addon.status === 'active'
              }}
              isSelected={selectedAddons.includes(addon.id)}
              onSelect={handleAddonToggle}
              onToggle={handleToggleAddonStatus}
              onDelete={(id) => handleDeleteAddon(id, addon.name)}
              onView={handleViewAddon}
              onReload={handleReloadAddon}
              userProtectedSet={new Set()}
              isReloading={reloadAddonMutation.isPending && reloadAddonMutation.variables === addon.id}
            />
          ))}
          
          {/* Discovery Card */}
          <DiscoveryCard 
            isDark={isDark} 
            isModern={isModern} 
            isModernDark={isModernDark} 
            isMono={isMono} 
            viewMode="card" 
          />
            </div>
          ) : (
            /* List View */
            <div className="space-y-3">
              {displayAddons.map((addon: any) => (
            <EntityCard
                  key={addon.id}
              variant="addon"
              entity={{
                ...addon,
                isActive: addon.status === 'active'
              }}
              isSelected={selectedAddons.includes(addon.id)}
              onSelect={handleAddonToggle}
              onToggle={handleToggleAddonStatus}
              onDelete={(id) => handleDeleteAddon(id, addon.name)}
              onView={handleViewAddon}
              onReload={handleReloadAddon}
              userProtectedSet={new Set()}
              isReloading={reloadAddonMutation.isPending && reloadAddonMutation.variables === addon.id}
              isListMode={true}
            />
          ))}
          
          {/* Discovery Card */}
          <DiscoveryCard 
            isDark={isDark} 
            isModern={isModern} 
            isModernDark={isModernDark} 
            isMono={isMono} 
            viewMode="list" 
          />
            </div>
      )}

      {/* Add Addon Modal - Original Complex Implementation */}
      {showAddModal && (
        <div 
          className="fixed top-0 left-0 right-0 bottom-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-[1000]"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowAddModal(false)
              setIsLoadingManifest(false)
              setManifestData(null)
            }
          }}
        >
          <div className={`rounded-lg max-w-md w-full p-6 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Add New Addon</h2>
              <button
                onClick={() => {
                  setShowAddModal(false)
                  setIsLoadingManifest(false)
                  setManifestData(null)
                }}
                className={`w-8 h-8 flex items-center justify-center rounded transition-colors border-0 ${
                  isDark ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddAddon} className="space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Addon Name *
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newAddonName}
                    onChange={(e) => setNewAddonName(e.target.value)}
                    placeholder="Torrentio"
                    required
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-stremio-purple focus:border-transparent ${
                      isDark 
                        ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                    }`}
                  />
                  {newAddonVersion && (
                    <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${
                      isDark ? 'bg-blue-500 text-blue-100' : 'bg-blue-100 text-blue-800'
                    }`}>v{newAddonVersion}</span>
                  )}
                </div>
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Addon URL *
                </label>
                <input
                  type="url"
                  value={newAddonUrl}
                  onChange={(e) => setNewAddonUrl(e.target.value)}
                  placeholder="https://torrentio.stremio.com/configure"
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
              {/* Groups selection */}
              <div>
                <label className={`block text-sm font-medium mb-3 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Assign to groups (optional)
                </label>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-auto">
                  {groups?.map((group: any) => {
                    const active = selectedGroupIds.includes(group.id)
                    return (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => {
                          setSelectedGroupIds(prev => active ? prev.filter(id => id !== group.id) : [...prev, group.id])
                        }}
                        className={`group flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all duration-200 ${
                          active 
                            ? `accent-bg accent-text border accent-border ${isMono ? '' : 'shadow-md'}` 
                            : isDark 
                              ? `bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600 hover:border-gray-500 ${isMono ? '' : ''}` 
                              : `bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200 hover:border-gray-400 ${isMono ? '' : ''}`
                        }`}
                      >
                        <div 
                          className={`w-10 h-10 rounded-lg flex items-center justify-center text-white ${!isMono ? getGroupColorClass(group?.colorIndex) : ''}`}
                          style={isMono ? { backgroundColor: getColorValue(getGroupColorClass(group?.colorIndex)) } : undefined}
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
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false)
                    setNewAddonName('')
                    setNewAddonUrl('')
                    setSelectedGroupIds([])
                    setIsLoadingManifest(false)
                    setManifestData(null)
                  }}
                  disabled={createAddonMutation.isPending}
                  className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                    isDark 
                      ? 'text-gray-300 bg-gray-700 hover:bg-gray-600' 
                      : 'text-gray-700 bg-gray-100 hover:bg-gray-200'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createAddonMutation.isPending || !!urlError || isLoadingManifest || !manifestData}
                  className="flex-1 px-4 py-2 accent-bg accent-text rounded-lg transition-colors disabled:opacity-50"
                >
                  {createAddonMutation.isPending ? 'Adding...' : isLoadingManifest ? 'Loading manifest...' : 'Add Addon'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AddonDetailModal
        isOpen={showDetailModal}
        onClose={handleCloseDetailModal}
        onSave={() => {}} // View-only modal, no save functionality needed
        addon={selectedAddon}
        groups={groups || []}
      />

      <ConfirmDialog
        open={false} // Add state for bulk delete confirmation
        title="Delete addons"
        description="Are you sure you want to delete the selected addons?"
        isDanger={true}
        onCancel={() => {}}
        onConfirm={() => {}}
      />

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Addon"
        description={`Are you sure you want to delete "${addonToDelete?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        isDanger={true}
        onConfirm={confirmDeleteAddon}
        onCancel={cancelDeleteAddon}
      />
    </div>
  )
}
