'use client'

import { useState, useEffect, useMemo } from 'react'
import { 
  Plus, 
  Search,
  Puzzle,
  Eye,
  Trash2,
  Edit,
  Users,
  AlertTriangle,
  RotateCcw,
  User
} from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { addonsAPI, groupsAPI, type Addon, type CreateAddonData } from '@/services/api'
import toast from 'react-hot-toast'
import React from 'react'
import ConfirmDialog from '../common/ConfirmDialog'
import { useDebounce } from '../../hooks/useDebounce'

// Canonicalize a manifest URL to detect duplicates locally
function canonicalizeManifestUrl(raw: string): string {
  if (!raw) return ''
  try {
    const s = String(raw).trim()
    let u = s.replace(/^https?:\/\//i, '').toLowerCase()
    u = u.replace(/\/manifest\.json$/i, '')
    u = u.replace(/\/+$/g, '')
    return u
  } catch {
    return String(raw || '').trim().toLowerCase()
  }
}

export default function AddonsPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const debouncedSearchTerm = useDebounce(searchTerm, 300)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newAddonName, setNewAddonName] = useState('')
  const [newAddonUrl, setNewAddonUrl] = useState('')
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([])
  const [newAddonVersion, setNewAddonVersion] = useState<string>('')
  const [urlError, setUrlError] = useState<string>('')
  const [isReloadingAll, setIsReloadingAll] = useState(false)
  
  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingAddonId, setEditingAddonId] = useState<string | null>(null)
  const [editingAddon, setEditingAddon] = useState<any>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editUrl, setEditUrl] = useState('')
  const [editTags, setEditTags] = useState<string[]>([])
  const [editGroupIds, setEditGroupIds] = useState<string[]>([])
  
  const { isDark } = useTheme()
  const queryClient = useQueryClient()


  // Fetch addons from API
  const { data: addons = [], isLoading, error } = useQuery({
    queryKey: ['addons'],
    queryFn: addonsAPI.getAll,
    retry: 1,
  })

  // Fetch groups for carousel selection
  const { data: allGroups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: groupsAPI.getAll,
    retry: 1,
  })

  const safeGroups = useMemo(() => {
    if (Array.isArray(allGroups)) return allGroups
    if (allGroups && typeof allGroups === 'object' && Array.isArray((allGroups as any).data)) return (allGroups as any).data
    return []
  }, [allGroups])

  // Get addon details for editing
  const { data: addonDetail } = useQuery({
    queryKey: ['addon', editingAddonId],
    queryFn: () => addonsAPI.getById(editingAddonId!),
    enabled: !!editingAddonId,
  })

  // When addon detail is loaded, populate editGroupIds so assigned groups show as selected
  useEffect(() => {
    if (!addonDetail) return
    const groupIds = Array.isArray((addonDetail as any)?.groups)
      ? (addonDetail as any).groups.map((g: any) => g.id)
      : []
    setEditGroupIds(groupIds)
  }, [addonDetail])

  // Filter addons locally like groups does
  const filteredAddons = useMemo(() => {
    const base = Array.isArray(addons) ? addons : []
    return base.filter((addon: any) => {
      const name = String(addon.name || '')
      const description = String(addon.description || '')
      const tags = Array.isArray(addon.tags) ? addon.tags.join(' ') : String(addon.tags || '')
      const matchesSearch = name.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
                           description.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
                           tags.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
      return matchesSearch
    })
  }, [addons, debouncedSearchTerm])

  // Create addon mutation
  const createAddonMutation = useMutation({
    mutationFn: (data: CreateAddonData) => addonsAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addons'] })
      setShowAddModal(false)
      setNewAddonUrl('')
      setNewAddonName('')
      setNewAddonVersion('')
      setUrlError('')
      toast.success('Addon added successfully!')
    },
    onError: (error: any) => {
      const status = error?.response?.status
      const rawData = error?.response?.data
      const msg = typeof rawData === 'string' ? rawData : (rawData?.message || '')

      // If backend signals conflict or message hints at existence, show inline
      if (status === 409 || /exists/i.test(msg)) {
        setUrlError('This addon already exists')
        return
      }

      // Fallback: locally detect duplicates by exact URL (after trimming leading @)
      try {
        const trimmed = newAddonUrl.trim().replace(/^@+/, '')
        const already = (Array.isArray(addons) ? addons : []).some((a: any) => a?.url === trimmed)
        if (already) {
          setUrlError('This addon already exists')
          return
        }
      } catch {}

      if (status === 400 && msg) {
        setUrlError(msg)
        return
      }
      toast.error(msg || 'Failed to add addon')
    },
  })

  // Delete addon mutation
  const deleteAddonMutation = useMutation({
    mutationFn: async (id: string) => {
      // Use direct fetch to match working curl behavior
      const res = await fetch(`/api/addons/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `Failed with status ${res.status}`)
      }
      return id
    },
    onSuccess: (deletedId: string) => {
      // Optimistically update cache so UI updates immediately
      queryClient.setQueryData(['addons'], (prev: any) => {
        const arr = Array.isArray(prev) ? prev : (prev?.data && Array.isArray(prev.data) ? prev.data : [])
        return arr.filter((a: any) => a.id !== deletedId)
      })
      toast.success('Addon deleted successfully!')
      // Also refetch to be safe
      queryClient.invalidateQueries({ queryKey: ['addons'] })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to delete addon')
    },
  })

  // Reload addon mutation
  const reloadAddonMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/addons/${id}/reload`, { method: 'POST' })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `Failed with status ${res.status}`)
      }
      return res.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['addons'] })
      toast.success(`Addon "${data.addon.name}" reloaded successfully!`)
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to reload addon')
    },
  })

  // Edit addon functions
  const handleEditAddon = (addon: any) => {
    setEditingAddonId(addon.id)
    setEditingAddon(addon) // Store addon data for placeholders
    // Clear form data so placeholders show
    setEditName('')
    setEditDescription('')
    setEditUrl('')
    // Populate group selections from addon object
    setEditGroupIds(Array.isArray(addon?.groups) ? addon.groups.map((g: any) => g.id) : [])
    setShowEditModal(true)
  }

  const updateAddonMutation = useMutation({
    mutationFn: (payload: { id: string; data: any }) => addonsAPI.update(payload.id, payload.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addons'] })
      setShowEditModal(false)
      setEditingAddonId(null)
      setEditingAddon(null)
      setEditName('')
      setEditDescription('')
      setEditUrl('')
      setEditGroupIds([])
      toast.success('Addon updated successfully!')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to update addon')
    },
  })

  const reloadAllMutation = useMutation({
    mutationFn: async () => {
      setIsReloadingAll(true)
      
      // Get only enabled addons and reload them in parallel
      const addonsToReload = (addons || []).filter((addon: Addon) => addon.status === 'active')
      
      // Create array of reload promises
      const reloadPromises = addonsToReload.map(async (addon: Addon) => {
        try {
          const response = await fetch(`/api/addons/${addon.id}/reload`, { method: 'POST' })
          if (!response.ok) {
            const text = await response.text()
            throw new Error(text || `Failed with status ${response.status}`)
          }
          return { addon, success: true }
        } catch (error: any) {
          console.error(`Failed to reload ${addon.name}:`, error)
          return { addon, success: false, error: error?.message || 'Unknown error' }
        }
      })
      
      // Wait for all reloads to complete (parallel execution)
      const results = await Promise.allSettled(reloadPromises)
      
      // Count successes and failures
      let successCount = 0
      let errorCount = 0
      
      results.forEach((result: any) => {
        if (result.status === 'fulfilled') {
          if (result.value.success) {
            successCount++
          } else {
            errorCount++
          }
        } else {
          errorCount++
        }
      })
      
      return { successCount, errorCount, total: addonsToReload.length }
    },
    onSuccess: (data) => {
      if (data.errorCount === 0) {
        toast.success(`Successfully reloaded all ${data.successCount} addons`)
      } else {
        toast.success(`Reloaded ${data.successCount} addons successfully (${data.errorCount} failed)`)
      }
      // Invalidate queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['addons'] })
    },
    onError: (error: any) => {
      toast.error('Failed to reload addons')
    },
    onSettled: () => {
      setIsReloadingAll(false)
    }
  })

  const handleUpdateAddon = () => {
    if (!editingAddonId) return

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
    
    // Always send groupIds (even if empty) to handle group removal
    updateData.groupIds = editGroupIds

    updateAddonMutation.mutate({
      id: editingAddonId,
      data: updateData
    })
  }

  // Autofill addon name/version from manifest and validate URL
  useEffect(() => {
    let cancelled = false
    setUrlError('')
    setNewAddonVersion('')

    const url = newAddonUrl.trim()
    if (!url) return

    const lower = url.toLowerCase()
    if (lower.startsWith('stremio://')) {
      setUrlError('Invalid URL scheme. Please use http:// or https://')
      return
    }

    // Only fetch if looks like http(s)
    if (!/^https?:\/\//i.test(url)) return

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)

    ;(async () => {
      try {
        const res = await fetch(url, { signal: controller.signal })
        if (!res.ok) {
          setUrlError('Failed to fetch addon manifest')
          return
        }
        const json = await res.json()
        if (cancelled) return
        // Autofill name if user has not typed or matches previous auto name
        if (!newAddonName || newAddonName === 'Torrentio' || newAddonName === '') {
          setNewAddonName(json?.name || newAddonName)
        }
        setNewAddonVersion(json?.version || '')
      } catch (e: any) {
        if (e?.name === 'AbortError') return
        if (!cancelled) setUrlError('Failed to fetch addon manifest')
      } finally {
        clearTimeout(timer)
      }
    })()

    return () => { cancelled = true; controller?.abort() }
  }, [newAddonUrl])

  const handleAddAddon = (e: React.FormEvent) => {
    e.preventDefault()
    if (urlError) {
      toast.error(urlError)
      return
    }
    if (!newAddonName || !newAddonUrl) {
      toast.error('Please fill in all required fields')
      return
    }
    createAddonMutation.mutate({
      name: newAddonName,
      url: newAddonUrl,
    })
  }

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmConfig, setConfirmConfig] = useState<{ title: string; description: string; isDanger?: boolean; onConfirm: () => void }>({ title: '', description: '', isDanger: true, onConfirm: () => {} })

  const openConfirm = (cfg: { title: string; description: string; isDanger?: boolean; onConfirm: () => void }) => {
    setConfirmConfig(cfg)
    setConfirmOpen(true)
  }

  const handleDeleteAddon = (id: string, name: string) => {
    openConfirm({
      title: `Delete addon ${name}`,
      description: 'This action cannot be undone.',
      isDanger: true,
      onConfirm: () => deleteAddonMutation.mutate(id)
    })
  }

  // Close modals on Escape
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showAddModal) setShowAddModal(false)
        if (showEditModal) setShowEditModal(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showAddModal, showEditModal])

  // Ensure displayAddons is always an array
  const displayAddons = useMemo(() => {
    return Array.isArray(filteredAddons) ? filteredAddons : []
  }, [filteredAddons])

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-4">
          <div>
            <h1 className={`hidden sm:block text-xl sm:text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Addons</h1>
            <p className={`text-sm sm:text-base ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Manage Stremio addons for your groups</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <button
              onClick={() => reloadAllMutation.mutate()}
              disabled={reloadAllMutation.isPending || isReloadingAll || reloadAddonMutation.isPending || addons.length === 0}
              className="flex items-center justify-center px-3 py-2 sm:px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm sm:text-base"
            >
              <RotateCcw className={`w-4 h-4 sm:w-5 sm:h-5 mr-2 ${isReloadingAll ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isReloadingAll ? 'Reloading...' : 'Reload All Addons'}</span>
              <span className="sm:hidden">{isReloadingAll ? 'Reloading...' : 'Reload All'}</span>
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center justify-center px-3 py-2 sm:px-4 bg-stremio-purple text-white rounded-lg hover:bg-purple-700 transition-colors text-sm sm:text-base"
            >
              <Plus className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
              <span className="hidden sm:inline">Add Addon</span>
              <span className="sm:hidden">Add</span>
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
            <input
              type="text"
              placeholder="Search addons..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full pl-9 sm:pl-10 pr-4 py-2 sm:py-3 border rounded-lg focus:ring-2 focus:ring-stremio-purple focus:border-transparent text-sm sm:text-base ${
                isDark 
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              }`}
            />
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-stremio-purple"></div>
          <span className={`ml-3 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>Loading addons...</span>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className={`text-center py-12 ${isDark ? 'bg-gray-800' : 'bg-red-50'} rounded-lg border ${isDark ? 'border-gray-700' : 'border-red-200'}`}>
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className={`text-lg font-medium mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>Unable to load addons</h3>
          <p className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            Make sure the backend server is running on port 4000
          </p>
          <button 
            onClick={() => queryClient.invalidateQueries({ queryKey: ['addons'] })}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Addons Grid */}
      {!isLoading && !error && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayAddons.map((addon: any) => (
          <div key={addon.id} className={`rounded-lg shadow-sm border p-6 hover:shadow-md transition-shadow flex flex-col h-full ${
            isDark 
              ? 'bg-gray-800 border-gray-700' 
              : 'bg-white border-gray-200'
          } ${addon.status === 'inactive' ? 'opacity-50' : ''}`}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center flex-1 min-w-0">
                <div className="w-12 h-12 rounded-lg flex items-center justify-center mr-3 flex-shrink-0 overflow-hidden">
                  {addon.iconUrl ? (
                    <img 
                      src={addon.iconUrl} 
                      alt={`${addon.name} logo`}
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        // Fallback to generic icon if image fails to load
                        e.currentTarget.style.display = 'none'
                        const nextElement = e.currentTarget.nextElementSibling as HTMLElement
                        if (nextElement) {
                          nextElement.style.display = 'flex'
                        }
                      }}
                    />
                  ) : null}
                  <div className={`w-full h-full ${addon.iconUrl ? 'hidden' : 'flex'} bg-stremio-purple items-center justify-center`}>
                    <Puzzle className="w-6 h-6 text-white" />
                  </div>
                </div>
                <div className="min-w-0 flex-1 max-w-[calc(100%-120px)]">
                  <div className="flex items-center gap-2">
                    <h3 className={`font-semibold truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>{addon.name}</h3>
                    {addon.version && (
                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium flex-shrink-0 ${
                        isDark ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-800'
                      }`}>
                        v{addon.version}
                      </span>
                    )}
                  </div>
                  {addon.tags && addon.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {addon.tags.map((tag: string, index: number) => (
                        <span
                          key={index}
                          className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                            isDark 
                              ? 'bg-purple-500 text-purple-200' 
                              : 'bg-purple-100 text-purple-800'
                          }`}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {/* Enable/Disable toggle */}
              <button
                onClick={async () => {
                  try {
                    if (addon.status === 'active') {
                      await addonsAPI.disable(addon.id)
                      toast.success(`Disabled "${addon.name}"`)
                    } else {
                      await addonsAPI.enable(addon.id)
                      toast.success(`Enabled "${addon.name}"`)
                    }
                    queryClient.invalidateQueries({ queryKey: ['addons'] })
                  } catch (e: any) {
                    toast.error('Failed to toggle addon')
                  }
                }}
                className={`ml-3 relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  addon.status === 'active' ? 'bg-stremio-purple' : (isDark ? 'bg-gray-700' : 'bg-gray-300')
                }`}
                aria-pressed={addon.status === 'active'}
                title={addon.status === 'active' ? 'Click to disable' : 'Click to enable'}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                    addon.status === 'active' ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>


            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="flex items-center">
                <User className="w-4 h-4 text-gray-400 mr-2" />
                <div>
                  <p className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{addon.users}</p>
                  <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Users</p>
                </div>
              </div>
              <div className="flex items-center">
                <Users className="w-4 h-4 text-gray-400 mr-2" />
                <div>
                  <p className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{addon.groups}</p>
                  <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Groups</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-auto">
              <button 
                onClick={() => handleEditAddon(addon)}
                className={`flex-1 flex items-center justify-center px-3 py-2 text-sm rounded-lg transition-colors ${
                  isDark 
                    ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Eye className="w-4 h-4 mr-1" />
                View
              </button>
              <button 
                onClick={() => reloadAddonMutation.mutate(addon.id)}
                disabled={reloadAddonMutation.isPending}
                className="flex items-center justify-center px-3 py-2 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors disabled:opacity-50"
                title="Reload addon manifest"
              >
                <RotateCcw className={`w-4 h-4 ${reloadAddonMutation.isPending ? 'animate-spin' : ''}`} />
              </button>
              {/* Keep Remove (hard delete) always present */}
              <button 
                onClick={() => handleDeleteAddon(addon.id, addon.name)}
                disabled={deleteAddonMutation.isPending}
                className="flex items-center justify-center px-3 py-2 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors disabled:opacity-50"
                title="Delete addon"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && displayAddons.length === 0 && (
        <div className="text-center py-12">
          <Puzzle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className={`text-lg font-medium mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            {debouncedSearchTerm ? 'No addons found' : 'No addons yet'}
          </h3>
          <p className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            {debouncedSearchTerm 
              ? 'Try adjusting your search criteria' 
              : 'Start by adding your first Stremio addon'
            }
          </p>
          {!debouncedSearchTerm && (
            <div className="mt-6">
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center justify-center px-3 py-2 sm:px-4 bg-stremio-purple text-white rounded-lg hover:bg-purple-700 transition-colors text-sm sm:text-base mx-auto"
              >
                <Plus className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                <span className="hidden sm:inline">Add Your First Addon</span>
                <span className="sm:hidden">Add Addon</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Add Addon Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className={`rounded-lg max-w-md w-full p-6 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Add New Addon</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className={`${isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}
              >
                ×
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
              {/* Groups carousel */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Assign to groups (optional)</label>
                <div className="flex overflow-x-auto gap-2 pb-2">
                  {safeGroups.map((g: any) => {
                    const active = selectedGroupIds.includes(g.id)
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => {
                          setSelectedGroupIds(prev => active ? prev.filter(id => id !== g.id) : [...prev, g.id])
                        }}
                        className={`shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all duration-200 hover:scale-105 hover:shadow-md ${
                          active 
                            ? 'bg-stremio-purple text-white border-stremio-purple shadow-md' 
                            : isDark 
                              ? 'bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600 hover:border-gray-500' 
                              : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200 hover:border-gray-400'
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          isDark ? 'bg-stremio-purple text-white' : 'bg-stremio-purple text-white'
                        }`}>
                          <span className="text-white font-semibold text-sm">
                            {g.name ? g.name.charAt(0).toUpperCase() : 'G'}
                          </span>
                        </div>
                        <span>{g.name}</span>
                        {active && (
                          <div className="w-4 h-4 rounded-full bg-white bg-opacity-20 flex items-center justify-center">
                            <span className="text-xs font-bold">✓</span>
                          </div>
                        )}
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
                  }}
                  disabled={createAddonMutation.isPending}
                  className={`flex-1 px-4 py-2 rounded-lg transition-colors disabled:opacity-50 ${
                    isDark 
                      ? 'text-gray-300 bg-gray-700 hover:bg-gray-600' 
                      : 'text-gray-700 bg-gray-100 hover:bg-gray-200'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createAddonMutation.isPending || !!urlError}
                  className="flex-1 px-4 py-2 bg-stremio-purple text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                >
                  {createAddonMutation.isPending ? 'Adding...' : 'Add Addon'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Addon Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`w-full max-w-md p-6 rounded-lg shadow-xl ${
            isDark ? 'bg-gray-800' : 'bg-white'
          }`}>
            <div className="flex justify-between items-center mb-4">
              <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Edit Addon</h2>
              <button
                onClick={() => setShowEditModal(false)}
                className={`p-1 rounded-lg transition-colors ${
                  isDark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder={editingAddon?.name || ''}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-stremio-purple focus:border-transparent ${
                    isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                  }`}
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Description</label>
                <textarea
                  rows={3}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder={editingAddon?.description || ''}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-stremio-purple focus:border-transparent ${
                    isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                  }`}
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>URL</label>
                <input
                  type="url"
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  placeholder={editingAddon?.url || ''}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-stremio-purple focus:border-transparent ${
                    isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                  }`}
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-3 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Associated Groups
                </label>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-auto">
                  {safeGroups.map((group: any) => {
                    const active = editGroupIds.includes(group.id)
                    return (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => setEditGroupIds(prev => active ? prev.filter(id => id !== group.id) : [...prev, group.id])}
                        className={`group flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all duration-200 hover:scale-105 hover:shadow-md ${
                          active 
                            ? 'bg-stremio-purple text-white border-stremio-purple shadow-md' 
                            : isDark 
                              ? 'bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600 hover:border-gray-500' 
                              : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200 hover:border-gray-400'
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          active
                            ? 'bg-stremio-purple text-white'
                            : isDark
                              ? 'bg-gray-600 text-gray-200'
                              : 'bg-gray-200 text-gray-700'
                        }`}>
                          <span className="text-sm font-semibold">
                            {group.name ? group.name.charAt(0).toUpperCase() : 'G'}
                          </span>
                        </div>
                        <span>{group.name}</span>
                      </button>
                    )
                  })}
                </div>
                {safeGroups.length === 0 && (
                  <p className={`text-sm mt-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    No groups available. Create a group first to associate addons.
                  </p>
                )}
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  disabled={updateAddonMutation.isPending}
                  className={`flex-1 px-4 py-2 rounded-lg transition-colors disabled:opacity-50 ${
                    isDark 
                      ? 'text-gray-300 bg-gray-700 hover:bg-gray-600' 
                      : 'text-gray-700 bg-gray-100 hover:bg-gray-200'
                  }`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateAddon}
                  disabled={updateAddonMutation.isPending}
                  className="flex-1 px-4 py-2 bg-stremio-purple text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                >
                  {updateAddonMutation.isPending ? 'Updating...' : 'Update Addon'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={confirmConfig.title}
        description={confirmConfig.description}
        isDanger={confirmConfig.isDanger}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => { setConfirmOpen(false); confirmConfig.onConfirm?.() }}
      />
    </div>
  )
}