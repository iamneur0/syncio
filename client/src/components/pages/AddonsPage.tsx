'use client'

import { useState, useEffect, useMemo, useLayoutEffect } from 'react'
import { 
  Plus, 
  Search,
  Puzzle,
  Eye,
  Trash2,
  Edit,
  Users,
  AlertTriangle,
  RefreshCw,
  User,
  Settings,
  Grid3X3,
  List,
  ExternalLink,
  Star
} from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import UserMenuButton from '@/components/auth/UserMenuButton'
import { getColorBgClass } from '@/utils/colorMapping'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { addonsAPI, groupsAPI, type Addon, type CreateAddonData } from '@/services/api'
import toast from 'react-hot-toast'
import React from 'react'
import ConfirmDialog from '../common/ConfirmDialog'
import { useDebounce } from '../../hooks/useDebounce'
import { debug } from '../../utils/debug'

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
      className={`rounded-lg border cursor-pointer ${
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
        setShowDiscovery(!showDiscovery);
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


      {showDiscovery && (
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
                             ? 'bg-purple-800/40 border-purple-600/60 shadow-md shadow-purple-900/30'
                             : isDark 
                             ? 'bg-gray-800/50 border-gray-700' 
                             : 'bg-white/50 border-gray-200'
                         }`}
                       >
              <div className="flex items-start space-x-3 mb-3">
                <div className="w-8 h-8 rounded flex-shrink-0 flex items-center justify-center bg-black text-white">
                  <img 
                    src={project.icon} 
                    alt={project.name}
                    className="w-8 h-8 rounded"
                    onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                      e.currentTarget.style.display = 'none'
                      const sib = e.currentTarget.nextElementSibling as HTMLElement | null
                      if (sib) sib.style.display = 'flex'
                    }}
                  />
                  <div className="w-8 h-8 rounded flex items-center justify-center bg-black text-white hidden">
                    <span className="text-xs font-bold">
                      {project.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                             <h4 className={`font-medium ${
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
                             <p className={`text-sm ${
                               isMono
                                 ? 'text-white/70'
                                 : isModern 
                                 ? 'text-purple-600' 
                                 : isModernDark
                                 ? 'text-purple-300'
                                 : isDark ? 'text-gray-400' : 'text-gray-600'
                             } mb-2`}>
                               {project.description}
                             </p>
                  <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                    isMono
                      ? 'bg-white/10 text-white border border-white/20'
                      : isModern
                      ? 'bg-gradient-to-r from-purple-200 to-blue-200 text-purple-800 shadow-sm'
                      : isModernDark
                      ? 'bg-gradient-to-r from-purple-700/50 to-blue-700/50 text-purple-200 shadow-sm'
                      : isDark 
                      ? 'bg-purple-900/50 text-purple-300' 
                      : 'bg-purple-100 text-purple-700'
                  }`}>
                    {project.category}
                  </span>
                </div>
                <a
                  href={project.projectUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className={`p-1 rounded ${
                    isMono
                      ? 'hover:bg-white/10 text-white/70 hover:text-white'
                      : isDark
                      ? 'hover:bg-gray-600 text-gray-400 hover:text-white' 
                      : 'hover:bg-gray-200 text-gray-500 hover:text-gray-700'
                  }`}
                  title="Visit project page"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
              
              <div className="grid grid-cols-2 gap-1.5">
                {project.providers.map((provider, providerIndex) => (
                  <a
                    key={providerIndex}
                    href={provider.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                               className={`p-1.5 rounded text-xs font-medium text-center ${
                                 isMono
                                   ? 'bg-black border border-white/20 text-white hover:bg-white/10'
                                   : isModern
                                   ? 'bg-gradient-to-r from-purple-100 to-blue-100 hover:from-purple-200 hover:to-blue-200 text-purple-800 shadow-sm'
                                   : isModernDark
                                   ? 'bg-gradient-to-r from-purple-700/50 to-blue-700/50 hover:from-purple-600/50 hover:to-blue-600/50 text-purple-200 shadow-sm'
                                   : isDark 
                                   ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' 
                                   : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                               }`}
                    title={`Visit ${provider.name} addon`}
                  >
                    {provider.name}
                  </a>
                ))}
              </div>
            </div>
          ))}
          
                     <div className={`mt-4 p-3 rounded-lg border ${
                       isMono
                         ? 'bg-black border-white/20 shadow-none'
                         : isModern
                         ? 'bg-purple-50/70 border-purple-200/60 shadow-sm'
                         : isModernDark
                         ? 'bg-purple-800/30 border-purple-600/60 shadow-sm'
                         : isDark 
                         ? 'bg-gray-800/30 border-gray-700' 
                         : 'bg-gray-50 border-gray-200'
                     }`}>
                       <p className={`text-sm ${
                         isMono
                           ? 'text-white/70'
                           : isModern 
                           ? 'text-purple-600' 
                           : isModernDark
                           ? 'text-purple-300'
                           : isDark ? 'text-gray-400' : 'text-gray-600'
                       }`}>
              💡 <strong>Tip:</strong> Click on any provider button to visit their addon page, then copy the manifest URL to install it.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AddonsPage() {
  const AUTH_ENABLED = process.env.NEXT_PUBLIC_AUTH_ENABLED === 'true'
  const [authed, setAuthed] = useState<boolean>(() => !AUTH_ENABLED ? true : false)
  const queryClient = useQueryClient()
  
  useEffect(() => {
    const handler = (e: any) => {
      const next = !!(e?.detail?.authed)
      setAuthed(next)
      if (!next) {
        // Clear all cached data when not authenticated
        queryClient.setQueryData(['addons'], [] as any)
        queryClient.setQueryData(['groups'], [] as any)
        queryClient.setQueryData(['users'], [] as any)
        queryClient.clear() // Clear all cached data on logout
      }
    }
    window.addEventListener('sfm:auth:changed', handler as any)
    // ensure initial state
    if (AUTH_ENABLED) setAuthed(false)
    return () => window.removeEventListener('sfm:auth:changed', handler as any)
  }, [queryClient])

  // Check authentication on mount and when tab becomes visible
  useEffect(() => {
    if (AUTH_ENABLED) {
      const checkAuth = async () => {
        try {
          const response = await addonsAPI.getAll()
          debug.log('🔄 Auth check successful, user is authenticated')
          setAuthed(true)
        } catch (error: any) {
          // Only set authed to false if it's actually an authentication error
          if (error?.response?.status === 401 || error?.response?.status === 403) {
            debug.log('🔄 Auth check failed - authentication required:', error)
            setAuthed(false)
            // Clear all cached data when not authenticated
            queryClient.setQueryData(['addons'], [] as any)
            queryClient.setQueryData(['groups'], [] as any)
            queryClient.setQueryData(['users'], [] as any)
          } else {
            // For other errors (like network issues), keep current auth state
            debug.log('🔄 Auth check failed but not an auth error, keeping current state:', error)
          }
        }
      }
      
      // Check auth on mount
      checkAuth()
      
      // Check auth when tab becomes visible again
      const handleVisibilityChange = () => {
        if (!document.hidden) {
          debug.log('🔄 Tab became visible, checking authentication...')
          checkAuth()
        }
      }
      
      document.addEventListener('visibilitychange', handleVisibilityChange)
      
      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      }
    }
  }, [AUTH_ENABLED])

  // Clear addons data when not authenticated
  useEffect(() => {
    if (AUTH_ENABLED && !authed) {
      queryClient.setQueryData(['addons'], [] as any)
      queryClient.setQueryData(['groups'], [] as any)
      queryClient.setQueryData(['users'], [] as any)
    }
  }, [AUTH_ENABLED, authed, queryClient])

  const [searchTerm, setSearchTerm] = useState('')
  const debouncedSearchTerm = useDebounce(searchTerm, 300)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newAddonName, setNewAddonName] = useState('')
  const [newAddonUrl, setNewAddonUrl] = useState('')
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([])
  const [newAddonVersion, setNewAddonVersion] = useState<string>('')
  const [urlError, setUrlError] = useState<string>('')
  const [isLoadingManifest, setIsLoadingManifest] = useState(false)
  const [manifestData, setManifestData] = useState<any>(null)
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
  const [editResources, setEditResources] = useState<any[]>([])
  
  // View mode state (card or list)
  const [viewMode, setViewMode] = useState<'card' | 'list'>(() => {
    if (typeof window !== 'undefined') {
      const raw = String(localStorage.getItem('global-view-mode') || 'card').toLowerCase().trim()
      return raw === 'list' ? 'list' : 'card'
    }
    return 'card'
  })
  // Ensure highlight persists after refresh/hydration
  useLayoutEffect(() => {
    try {
      const raw = String(localStorage.getItem('global-view-mode') || 'card').toLowerCase().trim()
      const stored = raw === 'list' ? 'list' : 'card'
      setViewMode(stored)
    } catch {}
  }, [])
  
  const { isDark, isModern, isModernDark, isMono } = useTheme()

  // Helper function to get group color class
  const getGroupColorClass = (colorIndex: number | null | undefined) => {
    const theme = isMono ? 'mono' : isModern ? 'modern' : isModernDark ? 'modern-dark' : isDark ? 'dark' : 'light'
    return getColorBgClass(colorIndex, theme)
  }

  // Helper function to convert Tailwind classes to actual color values
  const getColorValue = (tailwindClass: string): string => {
    const colorMap: Record<string, string> = {
      'bg-black': '#000000',
      'bg-gray-800': '#1f2937',
      'bg-gray-600': '#4b5563',
      'bg-gray-400': '#9ca3af',
      'bg-gray-300': '#d1d5db',
      'bg-blue-500': '#3b82f6',
      'bg-green-500': '#10b981',
      'bg-purple-500': '#8b5cf6',
      'bg-orange-500': '#f97316',
      'bg-red-500': '#ef4444',
      // Add gradient classes for modern themes
      'bg-gradient-to-br from-blue-500 to-blue-600': '#3b82f6',
      'bg-gradient-to-br from-green-500 to-green-600': '#10b981',
      'bg-gradient-to-br from-purple-500 to-purple-600': '#8b5cf6',
      'bg-gradient-to-br from-orange-500 to-orange-600': '#f97316',
      'bg-gradient-to-br from-red-500 to-red-600': '#ef4444',
      'bg-gradient-to-br from-blue-600 to-blue-700': '#2563eb',
      'bg-gradient-to-br from-green-600 to-green-700': '#059669',
      'bg-gradient-to-br from-purple-600 to-purple-700': '#7c3aed',
      'bg-gradient-to-br from-orange-600 to-orange-700': '#ea580c',
      'bg-gradient-to-br from-red-600 to-red-700': '#dc2626'
    }
    return colorMap[tailwindClass] || '#000000'
  }

  const [mounted, setMounted] = useState(false)
  const [hasLoadedData, setHasLoadedData] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  
  // Derive an auth-scoping key so cache is isolated per signed-in account/session
  const authScopeKey = React.useMemo(() => {
    if (!AUTH_ENABLED) return 'public'
    try {
      const token = typeof window !== 'undefined' ? (localStorage.getItem('sfm_token') || '') : ''
      const uuid  = typeof window !== 'undefined' ? (localStorage.getItem('sfm_account_uuid') || '') : ''
      // Prefer explicit account UUID; fall back to token to vary cache on account switch
      return uuid || token || 'authed'
    } catch {
      return 'authed'
    }
  }, [AUTH_ENABLED, authed])

  // Fetch addons from API (cache scoped to current account)
  const { data: addons = [], isLoading, error, isSuccess, isFetching } = useQuery({
    queryKey: ['addons', authScopeKey],
    queryFn: addonsAPI.getAll,
    retry: 1,
    enabled: !AUTH_ENABLED || authed,
  })
  
  // Track when we've successfully loaded data to prevent empty state flash
  useEffect(() => {
    if (isSuccess && Array.isArray(addons) && addons.length > 0) {
      setHasLoadedData(true)
    }
  }, [isSuccess, addons])
  // Clear cached addons on any auth change (logout/login/account switch)
  useEffect(() => {
    const handler = (e: any) => {
      // Always nuke addons cache on auth changes to avoid cross-account leakage
      queryClient.removeQueries({ queryKey: ['addons'], exact: false })
      queryClient.invalidateQueries({ queryKey: ['addons'], exact: false })
    }
    window.addEventListener('sfm:auth:changed', handler as any)
    // ensure initial state
    if (AUTH_ENABLED) setAuthed(false)
    return () => window.removeEventListener('sfm:auth:changed', handler as any)
  }, [queryClient])

  // Clear addons data when not authenticated
  useEffect(() => {
    if (AUTH_ENABLED && !authed) {
      queryClient.setQueryData(['addons'], [] as any)
      queryClient.setQueryData(['groups'], [] as any)
      queryClient.setQueryData(['users'], [] as any)
    }
  }, [AUTH_ENABLED, authed, queryClient])

  // Fetch groups for carousel selection
  const { data: allGroups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: groupsAPI.getAll,
    retry: 1,
    enabled: !AUTH_ENABLED || authed,
  })
  // Clear cached groups on logout
  useEffect(() => {
    const handler = (e: any) => {
      const isAuthed = !!e?.detail?.authed
      if (!isAuthed) {
        queryClient.setQueryData(['groups'], [] as any)
      } else {
        queryClient.invalidateQueries({ queryKey: ['groups'] })
      }
    }
    window.addEventListener('sfm:auth:changed', handler as any)
    return () => window.removeEventListener('sfm:auth:changed', handler as any)
  }, [queryClient])

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
    if (!addonDetail) {
      // Clear group selections when addonDetail is not available
      setEditGroupIds([])
      setEditResources([])
      return
    }
    const groupIds = Array.isArray((addonDetail as any)?.groups)
      ? (addonDetail as any).groups.map((g: any) => g.id)
      : []
    setEditGroupIds(groupIds)
    // Initialize resources selection from addonDetail
    try {
      const stored = Array.isArray((addonDetail as any)?.resources) ? (addonDetail as any).resources : []
      const detailManifest: any = (addonDetail as any)?.manifest
      const fallback = Array.isArray(detailManifest?.resources) ? detailManifest.resources : []
      setEditResources(stored.length > 0 ? stored : fallback)
    } catch { setEditResources([]) }
  }, [addonDetail])

  // Filter addons locally like groups does
  const filteredAddons = useMemo(() => {
    const base = Array.isArray(addons) ? addons : []
    return base.filter((addon: any) => {
      const name = String(addon.name || '')
      const description = String(addon.description || '')
      const matchesSearch = name.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
                           description.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
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
      setIsLoadingManifest(false)
      setManifestData(null)
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
      await addonsAPI.delete(id)
      return id
    },
    onSuccess: (deletedId: string) => {
      // Optimistically update cache so UI updates immediately
      queryClient.setQueryData(['addons'], (prev: any) => {
        const arr = Array.isArray(prev) ? prev : (prev?.data && Array.isArray(prev.data) ? prev.data : [])
        return arr.filter((a: any) => a.id !== deletedId)
      })
      
      // Clear user sync status cache since deleting an addon affects all users
      // This ensures GroupSyncBadge will re-check sync status
      const keys = Object.keys(localStorage)
      keys.forEach(key => {
        if (key.startsWith('sfm_user_sync_status:')) {
          localStorage.removeItem(key)
        }
      })
      
      // Invalidate all user and group sync status queries
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      queryClient.invalidateQueries({ queryKey: ['user'] })
      queryClient.invalidateQueries({ queryKey: ['group'] })
      
      // Notify GroupSyncBadge components to re-check their status
      try {
        window.dispatchEvent(new CustomEvent('sfm:addon:deleted', { 
          detail: { addonId: deletedId } 
        }))
      } catch (e) {
        debug.warn('Failed to dispatch addon deleted event:', e)
      }
      
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
      const addon = await addonsAPI.reload(id)
      return addon
    },
    onSuccess: (addon) => {
      // Reload-only: update addons list, do not touch any sync-related caches or events
      queryClient.invalidateQueries({ queryKey: ['addons'] })
      toast.success(`Addon "${addon.name}" reloaded successfully!`)
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to reload addon')
    },
  })

  // Edit addon functions
  const handleEditAddon = (addon: any) => {
    setEditingAddonId(addon.id)
    setEditingAddon(addon) // Store addon data for placeholders
    // Initialize form data with actual addon data
    setEditName(addon.name || '')
    setEditDescription(addon.description || '')
    setEditUrl(addon.url || '')
    // Don't clear group selections here - let the useEffect handle it when addonDetail loads
    // This prevents the visual bug where groups appear unselected briefly
    setShowEditModal(true)
  }

  const updateAddonMutation = useMutation({
    mutationFn: (payload: { id: string; data: any }) => addonsAPI.update(payload.id, payload.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addons'] })
      queryClient.invalidateQueries({ queryKey: ['addon', editingAddonId] })
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
          await addonsAPI.reload(addon.id)
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
      // Clear cache and invalidate queries to refresh the UI
      queryClient.clear() // Clear all cached data
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
    if (updateAddonMutation.isPending) return

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
    
    // Always send groupIds to preserve existing associations or handle group changes
    updateData.groupIds = editGroupIds
    // Send resources if user adjusted them
    if (Array.isArray(editResources)) updateData.resources = editResources

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
    setManifestData(null)
    setIsLoadingManifest(false)

    const url = newAddonUrl.trim()
    if (!url) return

    const lower = url.toLowerCase()
    if (lower.startsWith('stremio://')) {
      setUrlError('Invalid URL scheme. Please use http:// or https://')
      return
    }

    // Only fetch if looks like http(s)
    if (!/^https?:\/\//i.test(url)) return

    setIsLoadingManifest(true)
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
        // Store the full manifest data for sending to backend
        setManifestData(json)
        // Autofill name if user has not typed or matches previous auto name
        if (!newAddonName || newAddonName === 'Torrentio' || newAddonName === '') {
          setNewAddonName(json?.name || newAddonName)
        }
        setNewAddonVersion(json?.version || '')
      } catch (e: any) {
        if (e?.name === 'AbortError') return
        if (!cancelled) setUrlError('Failed to fetch addon manifest')
      } finally {
        if (!cancelled) setIsLoadingManifest(false)
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
    if (!manifestData) {
      toast.error('Please wait for manifest to load')
      return
    }
        createAddonMutation.mutate({
          name: newAddonName,
          url: newAddonUrl,
          manifestData: manifestData,
          groupIds: selectedGroupIds.length > 0 ? selectedGroupIds : undefined,
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

  // Handle view mode change and persist to localStorage
  const handleViewModeChange = (mode: 'card' | 'list') => {
    setViewMode(mode)
    if (typeof window !== 'undefined') {
      localStorage.setItem('global-view-mode', mode)
    }
  }

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-4">
          <div>
            <h1 className={`hidden sm:block text-xl sm:text-2xl font-bold ${
              isModern 
                ? 'text-purple-800' 
                : isModernDark
                ? 'text-purple-100'
                : isDark ? 'text-white' : 'text-gray-900'
            }`}>Addons</h1>
            <p className={`text-sm sm:text-base ${
              isModern 
                ? 'text-purple-600' 
                : isModernDark
                ? 'text-purple-300'
                : isDark ? 'text-gray-400' : 'text-gray-600'
            }`}>Manage Stremio addons for your groups</p>
          </div>
          <div className="flex flex-row flex-wrap sm:flex-row gap-2 sm:gap-3 items-center">
            <button
              onClick={() => reloadAllMutation.mutate()}
              disabled={reloadAllMutation.isPending || isReloadingAll || reloadAddonMutation.isPending || addons.length === 0}
              className={`flex items-center justify-center px-3 py-2 sm:px-4 text-white rounded-lg transition-colors disabled:opacity-50 text-sm sm:text-base ${
                isModern
                  ? 'bg-gradient-to-br from-purple-600 via-purple-700 to-blue-800 hover:from-purple-700 hover:via-purple-800 hover:to-blue-900'
                  : isModernDark
                  ? 'bg-gradient-to-br from-purple-800 via-purple-900 to-blue-900 hover:from-purple-900 hover:via-purple-950 hover:to-indigo-900'
                  : isMono
                  ? 'bg-black hover:bg-gray-800'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              <RefreshCw className={`w-4 h-4 sm:w-5 sm:h-5 mr-2 ${isReloadingAll ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isReloadingAll ? 'Reloading...' : 'Reload All Addons'}</span>
              <span className="sm:hidden">{isReloadingAll ? 'Reloading...' : 'Reload All'}</span>
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className={`flex items-center justify-center px-3 py-2 sm:px-4 text-white rounded-lg transition-colors text-sm sm:text-base ${
                isModern
                  ? 'bg-gradient-to-br from-purple-600 via-purple-700 to-blue-800 hover:from-purple-700 hover:via-purple-800 hover:to-blue-900'
                  : isModernDark
                  ? 'bg-gradient-to-br from-purple-800 via-purple-900 to-blue-900 hover:from-purple-900 hover:via-purple-950 hover:to-indigo-900'
                  : isMono
                  ? 'bg-black hover:bg-gray-800'
                  : 'bg-stremio-purple hover:bg-purple-700'
              }`}
            >
              <Plus className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
              <span className="hidden sm:inline">Add Addon</span>
              <span className="sm:hidden">Add</span>
            </button>
            {/* Desktop account button (mobile version is in the topbar) */}
            <div className="hidden lg:block ml-1">
              <UserMenuButton />
            </div>
          </div>
        </div>

        {/* Search and View Toggle */}
        <div className="flex flex-row items-center gap-4">
          <div className="relative flex-1">
            <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 ${
              isModern 
                ? 'text-purple-500' 
                : isModernDark
                ? 'text-purple-400'
                : isDark ? 'text-gray-400' : 'text-gray-500'
            }`} />
            <input
              type="text"
              placeholder="Search addons..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full pl-9 sm:pl-10 pr-4 py-2 sm:py-3 border rounded-lg focus:ring-2 focus:ring-stremio-purple focus:border-transparent text-sm sm:text-base ${
                isModern
                  ? 'bg-purple-50/80 border-purple-300/50 text-purple-900 placeholder-purple-500 focus:ring-purple-500'
                  : isModernDark
                  ? 'bg-purple-800/30 border-purple-600/50 text-purple-100 placeholder-purple-400 focus:ring-purple-500'
                  : isDark 
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              }`}
            />
          </div>
          
          {/* View Mode Toggle */}
          {mounted && (
            <div className="flex items-center">
              <div className={`flex rounded-lg border ${
                isMono
                  ? 'border-white/20'
                  : isModern 
                  ? 'border-purple-300/50' 
                  : isModernDark
                  ? 'border-purple-600/50'
                  : isDark ? 'border-gray-600' : 'border-gray-300'
              }`}>
                <button
                  onClick={() => handleViewModeChange('card')}
                  className={`flex items-center gap-2 px-3 py-2 sm:py-3 text-sm transition-colors h-10 sm:h-12 ${
                    isMono 
                      ? 'rounded-l-lg !border-0 !border-r-0 !rounded-r-none' 
                      : 'rounded-l-lg border-0 border-r-0'
                  } ${
                    viewMode === 'card'
                      ? isMono
                        ? '!bg-white/10 text-white'
                        : isModern
                        ? 'bg-stremio-purple text-white'
                        : isModernDark
                        ? 'bg-stremio-purple text-white'
                        : isDark
                        ? 'bg-purple-600 text-white'
                        : 'bg-stremio-purple text-white'
                      : isMono
                        ? 'text-white/70 hover:bg-white/10'
                        : isModern
                        ? 'text-purple-700 hover:bg-purple-100/50'
                        : isModernDark
                        ? 'text-purple-300 hover:bg-purple-700/50'
                        : isDark
                        ? 'text-gray-300 hover:bg-gray-700'
                        : 'text-gray-700 hover:bg-gray-100'
                  }`}
                  title="Card view"
                >
                  <Grid3X3 className="w-4 h-4" />
                  <span className="hidden sm:inline">Cards</span>
                </button>
                <button
                  onClick={() => handleViewModeChange('list')}
                  className={`flex items-center gap-2 px-3 py-2 sm:py-3 text-sm transition-colors h-10 sm:h-12 ${
                    isMono 
                      ? 'rounded-r-lg !border-0 !border-l-0 !rounded-l-none' 
                      : 'rounded-r-lg border-0 border-l-0'
                  } ${
                    viewMode === 'list'
                      ? isMono
                        ? '!bg-white/10 text-white'
                        : isModern
                        ? 'bg-stremio-purple text-white'
                        : isModernDark
                        ? 'bg-stremio-purple text-white'
                        : isDark
                        ? 'bg-purple-600 text-white'
                        : 'bg-stremio-purple text-white'
                      : isMono
                        ? 'text-white/70 hover:bg-white/10'
                        : isModern
                        ? 'text-purple-700 hover:bg-purple-100/50'
                        : isModernDark
                        ? 'text-purple-300 hover:bg-purple-700/50'
                        : isDark
                        ? 'text-gray-300 hover:bg-gray-700'
                        : 'text-gray-700 hover:bg-gray-100'
                  }`}
                  title="List view"
                >
                  <List className="w-4 h-4" />
                  <span className="hidden sm:inline">List</span>
                </button>
              </div>
            </div>
          )}
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
        <div className={`text-center py-12 ${
          isMono 
            ? 'bg-black border border-white/20' 
            : isDark 
            ? 'bg-gray-800 border-gray-700' 
            : 'bg-red-50 border-red-200'
        } rounded-lg border`}>
          <AlertTriangle className={`w-12 h-12 mx-auto mb-4 ${
            isMono ? 'text-white' : 'text-red-500'
          }`} />
          <h3 className={`text-lg font-medium mb-2 ${
            isMono ? 'text-white' : isDark ? 'text-white' : 'text-gray-900'
          }`}>Unable to load addons</h3>
          <p className={`${
            isMono ? 'text-white/70' : isDark ? 'text-gray-400' : 'text-gray-600'
          }`}>
            Make sure the backend server is running on port 4000
          </p>
          <button 
            onClick={() => {
              queryClient.clear() // Clear all cached data
              queryClient.invalidateQueries({ queryKey: ['addons'] })
            }}
            className={`mt-4 px-4 py-2 text-white rounded-lg transition-colors ${
              isMono
                ? 'bg-black hover:bg-gray-800 border border-white/20'
                : isModern
                ? 'bg-gradient-to-br from-purple-600 via-purple-700 to-blue-800 hover:from-purple-700 hover:via-purple-800 hover:to-blue-900'
                : isModernDark
                ? 'bg-gradient-to-br from-purple-800 via-purple-900 to-blue-900 hover:from-purple-900 hover:via-purple-950 hover:to-indigo-900'
                : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            Try Again
          </button>
        </div>
      )}

      {/* Addons Display */}
      {!isLoading && !error && (
        <>
          {viewMode === 'card' ? (
            /* Card Grid View */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
              {displayAddons.map((addon: any) => (
                <div key={addon.id} className={`rounded-lg shadow-sm border p-6 hover:shadow-md transition-shadow flex flex-col self-start ${
                  isModern
                    ? 'bg-gradient-to-br from-purple-50/90 to-blue-50/90 border-purple-200/50 shadow-lg shadow-purple-100/30'
                    : isModernDark
                    ? 'bg-gradient-to-br from-purple-800/40 to-blue-800/40 border-purple-600/50 shadow-lg shadow-purple-900/30'
                    : isDark 
                    ? 'bg-gray-800 border-gray-700' 
                    : 'bg-white border-gray-200'
                } ${addon.status === 'inactive' ? 'opacity-50' : ''}`}>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center flex-1 min-w-0">
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center mr-3 flex-shrink-0 overflow-hidden ${
                        isMono ? 'border border-white/20' : ''
                      }`}>
                        {addon.iconUrl ? (
                          <img 
                            src={addon.iconUrl} 
                            alt={`${addon.name} logo`}
                            className="w-full h-full object-contain"
                            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                              // Fallback to generic icon if image fails to load
                              e.currentTarget.style.display = 'none'
                              const sib = e.currentTarget.nextElementSibling as HTMLElement | null
                              if (sib) sib.style.display = 'flex'
                            }}
                          />
                        ) : null}
                        <div className={`w-full h-full ${addon.iconUrl ? 'hidden' : 'flex'} bg-stremio-purple items-center justify-center`}>
                          <Puzzle className="w-5 h-5 text-white" />
                        </div>
                      </div>
                      <div className="min-w-0 flex-1 max-w-[calc(100%-120px)]">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <h3 className={`font-semibold truncate ${
                              isModern 
                                ? 'text-purple-800' 
                                : isModernDark
                                ? 'text-purple-100'
                                : isDark ? 'text-white' : 'text-gray-900'
                            }`}>{addon.name}</h3>
                          </div>
                          {addon.version && (
                            <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium w-fit ${
                              isDark ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-800'
                            }`}>
                              v{addon.version}
                            </span>
                          )}
                        </div>
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
                        addon.status === 'active' ? (isMono ? 'bg-white/30 border border-white/20' : 'bg-stremio-purple') : (isMono ? 'bg-white/15 border border-white/20' : (isDark ? 'bg-gray-700' : 'bg-gray-300'))
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

                  <div className="grid grid-cols-2 gap-4 mb-4 items-start">
                    <div className="flex items-center">
                      <User className="w-4 h-4 text-gray-400 mr-2" />
                      <div>
                        <p className={`text-lg font-semibold ${
                          isModern ? 'text-purple-100' : isModernDark ? 'text-purple-100' : (isDark ? 'text-white' : 'text-gray-900')
                        }`}>{addon.users}</p>
                        <p className={`text-xs ${
                          isModern ? 'text-purple-300' : isModernDark ? 'text-purple-300' : (isDark ? 'text-gray-400' : 'text-gray-500')
                        }`}>{addon.users === 1 ? 'User' : 'Users'}</p>
                      </div>
                    </div>
                    <div className="flex items-center">
                      <Users className="w-4 h-4 text-gray-400 mr-2" />
                      <div>
                        <p className={`text-lg font-semibold ${
                          isModern ? 'text-purple-100' : isModernDark ? 'text-purple-100' : (isDark ? 'text-white' : 'text-gray-900')
                        }`}>{addon.groups}</p>
                        <p className={`text-xs ${
                          isModern ? 'text-purple-300' : isModernDark ? 'text-purple-300' : (isDark ? 'text-gray-400' : 'text-gray-500')
                        }`}>{addon.groups === 1 ? 'Group' : 'Groups'}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-auto">
                    <button 
                      onClick={() => handleEditAddon(addon)}
                      className={`flex-1 flex items-center justify-center px-3 py-2 h-8 min-h-8 max-h-8 text-sm rounded transition-colors hover:font-semibold ${
                        isModern
                          ? 'bg-gradient-to-r from-purple-100 to-blue-100 text-purple-800 hover:from-purple-200 hover:to-blue-200'
                          : isModernDark
                          ? 'bg-gradient-to-r from-purple-800 to-blue-800 text-purple-100 hover:from-purple-700 hover:to-blue-700'
                          : isMono
                          ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          : isDark
                          ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      View
                    </button>
                    {/* Settings: open configure URL in new tab */}
                    <button
                      onClick={() => {
                        try {
                          const raw = addon.url || addon.manifestUrl || ''
                          if (!raw) return
                          const configureUrl = raw.replace(/manifest\.json$/i, 'configure')
                          window.open(configureUrl, '_blank', 'noreferrer')
                        } catch {}
                      }}
                      className={`flex items-center justify-center px-3 py-2 h-8 min-h-8 max-h-8 text-sm rounded transition-colors disabled:opacity-50 ${
                        isModern
                          ? 'bg-gradient-to-br from-purple-100 to-blue-100 text-purple-800 hover:from-purple-200 hover:to-blue-200'
                          : isModernDark
                          ? 'bg-gradient-to-br from-purple-800 to-blue-800 text-purple-100 hover:from-purple-700 hover:to-blue-700'
                          : isMono
                          ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                      }`}
                      title="Open addon settings"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => reloadAddonMutation.mutate(addon.id)}
                      disabled={reloadAddonMutation.isPending && reloadAddonMutation.variables === addon.id}
                      className={`flex items-center justify-center px-3 py-2 h-8 min-h-8 max-h-8 text-sm rounded transition-colors disabled:opacity-50 ${
                        isModern
                          ? 'bg-gradient-to-br from-purple-100 to-blue-100 text-purple-800 hover:from-purple-200 hover:to-blue-200'
                          : isModernDark
                          ? 'bg-gradient-to-br from-purple-800 to-blue-800 text-purple-100 hover:from-purple-700 hover:to-blue-700'
                          : isMono
                          ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          : 'bg-green-100 text-green-700 hover:bg-green-200'
                      }`}
                      title="Reload addon manifest"
                    >
                      <RefreshCw className={`w-4 h-4 ${reloadAddonMutation.isPending && reloadAddonMutation.variables === addon.id ? 'animate-spin' : ''}`} />
                    </button>
                    {/* Keep Remove (hard delete) always present */}
                    <button 
                      onClick={() => handleDeleteAddon(addon.id, addon.name)}
                      disabled={deleteAddonMutation.isPending}
                      className={`flex items-center justify-center px-3 py-2 h-8 min-h-8 max-h-8 text-sm rounded transition-colors disabled:opacity-50 ${
                        isModern
                          ? 'bg-gradient-to-br from-purple-100 to-blue-100 text-purple-800 hover:from-purple-200 hover:to-blue-200'
                          : isModernDark
                          ? 'bg-gradient-to-br from-purple-800 to-blue-800 text-purple-100 hover:from-purple-700 hover:to-blue-700'
                          : isMono
                          ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          : 'bg-red-100 text-red-700 hover:bg-red-200'
                      }`}
                      title="Delete addon"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              
              {/* Discovery Card at the end */}
              <DiscoveryCard isDark={isDark} isModern={isModern} isModernDark={isModernDark} isMono={isMono} viewMode="card" />
            </div>
          ) : (
            /* List View */
            <div className="space-y-3">
              {displayAddons.map((addon: any) => (
                <div
                  key={addon.id}
                  className={`rounded-lg border p-4 hover:shadow-md transition-shadow cursor-pointer ${
                  isModern
                    ? 'bg-gradient-to-r from-purple-50/90 to-blue-50/90 border-purple-200/50 shadow-md shadow-purple-100/20'
                    : isModernDark
                    ? 'bg-gradient-to-r from-purple-800/40 to-blue-800/40 border-purple-600/50 shadow-md shadow-purple-900/20'
                    : isMono
                    ? 'bg-black border-white/20 shadow-none'
                    : isDark 
                    ? 'bg-gray-800 border-gray-700' 
                    : 'bg-white border-gray-200'
                } ${addon.status === 'inactive' ? 'opacity-50' : ''}`}
                  onClick={() => handleEditAddon(addon)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center flex-1 min-w-0 max-w-[calc(100%-200px)]">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center mr-3 flex-shrink-0 overflow-hidden ${
                        isMono ? 'border border-white/20' : ''
                      }`}>
                        {addon.iconUrl ? (
                          <img 
                            src={addon.iconUrl} 
                            alt={`${addon.name} logo`}
                            className="w-full h-full object-contain"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none'
                              const nextElement = e.currentTarget.nextElementSibling as HTMLElement
                              if (nextElement) {
                                nextElement.style.display = 'flex'
                              }
                            }}
                          />
                        ) : null}
                        <div className={`w-full h-full ${addon.iconUrl ? 'hidden' : 'flex'} bg-stremio-purple items-center justify-center`}>
                          <Puzzle className="w-5 h-5 text-white" />
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col min-[480px]:flex-row min-[480px]:items-center min-[480px]:gap-2">
                          <h3 className={`font-semibold truncate ${
                            isModern 
                              ? 'text-purple-800' 
                              : isModernDark
                              ? 'text-purple-100'
                              : isDark ? 'text-white' : 'text-gray-900'
                          }`}>{addon.name}</h3>
                          {addon.version && (
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium w-fit mt-1 min-[480px]:mt-0 ${
                              isDark ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-800'
                            }`}>
                              v{addon.version}
                            </span>
                          )}
                        </div>
                        {/* Mobile stats */}
                        <div className="flex min-[480px]:hidden items-center gap-3 text-sm mt-1">
                          <div className="flex items-center gap-1">
                            <User className="w-3 h-3 text-gray-400" />
                            <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                              {addon.users}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Users className="w-3 h-3 text-gray-400" />
                            <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                              {addon.groups}
                            </span>
                          </div>
                        </div>
                        {addon.description && (
                          <p className={`hidden sm:block text-sm truncate max-w-[250px] lg:max-w-[300px] ${
                            isModern 
                              ? 'text-purple-600' 
                              : isModernDark
                              ? 'text-purple-300'
                              : isDark ? 'text-gray-400' : 'text-gray-600'
                          }`}>
                            {addon.description}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {/* Desktop stats */}
                      <div className="hidden min-[480px]:flex items-center gap-4 text-sm mr-3">
                        <div className="flex items-center gap-1">
                          <User className="w-4 h-4 text-gray-400" />
                          <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{addon.users}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Users className="w-4 h-4 text-gray-400" />
                          <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{addon.groups}</span>
                        </div>
                      </div>
                      
                      {/* Enable/Disable toggle */}
                      <button
                        onClick={async (e) => {
                          e.stopPropagation()
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
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          addon.status === 'active' ? 'bg-stremio-purple' : (isDark ? 'bg-gray-700' : 'bg-gray-300')
                        }`}
                        aria-pressed={addon.status === 'active'}
                        title={addon.status === 'active' ? 'Click to disable' : 'Click to enable'}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            addon.status === 'active' ? 'translate-x-4' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                      
                      {/* Action buttons */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation();
                            try {
                              const raw = addon.url || addon.manifestUrl || ''
                              if (!raw) return
                              const configureUrl = raw.replace(/manifest\.json$/i, 'configure')
                              window.open(configureUrl, '_blank', 'noreferrer')
                            } catch {}
                          }}
                          className={`flex items-center justify-center h-8 w-8 text-sm rounded transition-colors focus:outline-none ${
                            isDark ? 'text-gray-300 hover:text-blue-400' : 'text-gray-600 hover:text-blue-600'
                          }`}
                          title="Open addon settings"
                        >
                          <Settings className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); reloadAddonMutation.mutate(addon.id) }}
                          disabled={reloadAddonMutation.isPending && reloadAddonMutation.variables === addon.id}
                          className={`flex items-center justify-center h-8 w-8 text-sm rounded transition-colors disabled:opacity-50 focus:outline-none ${
                            isDark ? 'text-gray-300 hover:text-green-400' : 'text-gray-600 hover:text-green-600'
                          }`}
                          title="Reload addon manifest"
                        >
                          <RefreshCw className={`w-4 h-4 ${isReloadingAll || (reloadAddonMutation.isPending && reloadAddonMutation.variables === addon.id) ? 'animate-spin' : ''}`} />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDeleteAddon(addon.id, addon.name) }}
                          disabled={deleteAddonMutation.isPending}
                          className={`flex items-center justify-center h-8 w-8 text-sm rounded transition-colors disabled:opacity-50 focus:outline-none ${
                            isDark ? 'text-gray-300 hover:text-red-400' : 'text-gray-600 hover:text-red-600'
                          }`}
                          title="Delete addon"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              
              {/* Discovery Card at the end */}
              <DiscoveryCard isDark={isDark} isModern={isModern} isModernDark={isModernDark} isMono={isMono} viewMode="list" />
            </div>
          )}
        </>
      )}


      {/* Empty State - Only show when we have data but no filtered results */}
      {isSuccess && !error && !isFetching && !isLoading && Array.isArray(addons) && addons.length > 0 && displayAddons.length === 0 && (
        <div className="text-center py-12">
          <Puzzle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className={`text-lg font-medium mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            No addons found
          </h3>
          <p className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            Try adjusting your search criteria
          </p>
        </div>
      )}

      {/* True Empty State - when there are actually no addons */}
      {isSuccess && !error && !isFetching && !isLoading && Array.isArray(addons) && addons.length === 0 && !debouncedSearchTerm && !hasLoadedData && (
        <div className="text-center py-12">
          <Puzzle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className={`text-lg font-medium mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            No addons yet
          </h3>
          <p className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            Start by adding your first Stremio addon
          </p>
          <div className="mt-6">
            <button
              onClick={() => setShowAddModal(true)}
              className={`flex items-center justify-center px-3 py-2 sm:px-4 text-white rounded-lg transition-colors text-sm sm:text-base mx-auto ${
                isModern
                  ? 'bg-gradient-to-br from-purple-600 via-purple-700 to-blue-800 hover:from-purple-700 hover:via-purple-800 hover:to-blue-900'
                  : isModernDark
                  ? 'bg-gradient-to-br from-purple-800 via-purple-900 to-blue-900 hover:from-purple-900 hover:via-purple-950 hover:to-indigo-900'
                  : isMono
                  ? 'bg-black hover:bg-gray-800'
                  : 'bg-stremio-purple hover:bg-purple-700'
              }`}
            >
              <Plus className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
              <span className="hidden sm:inline">Add Your First Addon</span>
              <span className="sm:hidden">Add Addon</span>
            </button>
          </div>
        </div>
      )}

      {/* Add Addon Modal */}
      {showAddModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
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
                ✕
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
                  {safeGroups.map((group: any) => {
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
                            ? `bg-stremio-purple text-white border-stremio-purple ${isMono ? '' : 'shadow-md'}` 
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
                  className="flex-1 px-4 py-2 bg-stremio-purple text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                >
                  {createAddonMutation.isPending ? 'Adding...' : isLoadingManifest ? 'Loading manifest...' : 'Add Addon'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Addon Modal */}
      {showEditModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowEditModal(false)
            }
          }}
        >
          <div className={`w-full max-w-md p-6 rounded-lg shadow-xl ${
            isDark ? 'bg-gray-800' : 'bg-white'
          }`}>
            <div className="flex justify-between items-center mb-4">
              <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Edit Addon</h2>
              <button
                onClick={() => setShowEditModal(false)}
                className={`w-8 h-8 flex items-center justify-center rounded transition-colors border-0 ${
                  isDark ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                }`}
              >
                ✕
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handleUpdateAddon(); }} className="space-y-4">
              {/* Manifest resources (selectable) */}
              {(() => {
                const storedResources: any[] = Array.isArray((addonDetail as any)?.resources) ? (addonDetail as any).resources : []
                const detailManifest: any = (addonDetail as any)?.originalManifest || (addonDetail as any)?.manifest
                const allResources: any[] = Array.isArray(detailManifest?.resources) ? detailManifest.resources : (storedResources || [])
                if (!Array.isArray(allResources) || allResources.length === 0) return null
                const isSelected = (item: any) => {
                  const label = typeof item === 'string' ? item : (item?.name || item?.type || JSON.stringify(item))
                  return editResources.some((s) => {
                    const sl = typeof s === 'string' ? s : (s?.name || s?.type || JSON.stringify(s))
                    return sl === label
                  })
                }
                return (
                  <div>
                    <label className={`${isDark ? 'text-gray-300' : 'text-gray-700'} block text-sm font-medium mb-2`}>Resources</label>
                    <div className="flex flex-wrap gap-2">
                      {allResources.map((res: any, idx: number) => {
                        const label = typeof res === 'string' ? res : (res?.name || res?.type || JSON.stringify(res))
                        const selected = isSelected(res)
                        return (
                          <button
                            type="button"
                            key={idx}
                            onClick={() => {
                              setEditResources((prev) => {
                                const exists = isSelected(res)
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
                                ? (isDark ? 'bg-purple-600 text-white border-purple-600' : 'bg-stremio-purple text-white border-stremio-purple')
                                : (isDark ? 'bg-gray-700 text-gray-200 border-gray-600' : 'bg-gray-100 text-gray-800 border-gray-300')
                            }`}
                            title={typeof res === 'string' ? res : JSON.stringify(res)}
                          >
                            {label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

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
                        className={`group flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all duration-200 ${
                          active 
                            ? `bg-stremio-purple text-white border-stremio-purple ${isMono ? '' : 'shadow-md'}` 
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
                  type="submit"
                  disabled={updateAddonMutation.isPending}
                  className={`flex-1 px-4 py-2 text-white rounded-lg transition-colors disabled:opacity-50 ${
                    isModern
                      ? 'bg-gradient-to-br from-purple-600 via-purple-700 to-blue-800 hover:from-purple-700 hover:via-purple-800 hover:to-blue-900'
                      : isModernDark
                      ? 'bg-gradient-to-br from-purple-800 via-purple-900 to-blue-900 hover:from-purple-900 hover:via-purple-950 hover:to-indigo-900'
                      : 'bg-stremio-purple hover:bg-purple-700'
                  }`}
                >
                  {updateAddonMutation.isPending ? 'Updating...' : 'Update Addon'}
                </button>
              </div>
            </form>
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