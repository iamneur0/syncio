'use client'

import React, { useState, useMemo, useEffect, useRef, useLayoutEffect } from 'react'
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { 
  Plus, 
  Search,
  Eye,
  EyeOff,
  Trash2,
  Edit,
  ShieldCheck,
  UserCircle,
  AlertTriangle,
  Link,
  CheckCircle,
  RefreshCw,
  Users,
  Puzzle,
  Unlock,
  LockKeyhole,
  Grid3X3,
  List,
  Import,
  Copy,
  Download
} from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { getColorBgClass, getColorTextClass, getColorOptions } from '@/utils/colorMapping'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usersAPI, groupsAPI, type User } from '@/services/api'
import toast from 'react-hot-toast'
import ConfirmDialog from '../common/ConfirmDialog'
import SyncBadge from '../common/SyncBadge'
import { useDebounce } from '../../hooks/useDebounce'
import { debug } from '../../utils/debug'

import { fetchManifestCached } from '../../utils/manifestCache'

// Small badge that shows per-user sync status in list view
function UserSyncBadge({ userId, userExcludedSet, userProtectedSet, isSyncing, location = 'unknown', isListMode = false }: { userId: string, userExcludedSet: Set<string>, userProtectedSet: Set<string>, isSyncing?: boolean, location?: string, isListMode?: boolean }) {
  const { isDark, isModern, isModernDark, isMono } = useTheme()
  const { data: syncStatus } = useQuery({
    queryKey: ['user', userId, 'sync-status'],
    queryFn: async () => usersAPI.getSyncStatus(userId),
    staleTime: 30_000,
    refetchOnMount: 'always',
  })

  // userExcludedSet and userProtectedSet are now passed as props from parent component
  const [status, setStatus] = React.useState<'synced' | 'unsynced' | 'stale' | 'connect' | 'syncing' | 'checking'>('checking')
  const [manuallySet, setManuallySet] = React.useState(false)
  const currentUserIdRef = React.useRef<string | null>(null)

  // Use sync status from API
  React.useEffect(() => {
    if (!syncStatus) return

    if (!manuallySet) {
      setStatus(syncStatus.status || 'checking')
    }
  }, [syncStatus, manuallySet])

  // Protected addon IDs and URLs - same as main component
  const protectedAddonIds = ['org.stremio.local', 'com.stremio.opensubtitles']
  const protectedManifestUrls = [
    'http://127.0.0.1:11470/local-addon/manifest.json',
    'https://opensubtitles.strem.io/manifest.json'
  ]

  // Check if an addon is built-in protected (Stremio default)
  const isAddonProtectedBuiltIn = (addon: any) => {
    const addonId = addon?.id || addon?.manifest?.id
    const manifestUrl = addon?.manifestUrl || addon?.transportUrl || addon?.url
    
    // Check by ID
    if (addonId && protectedAddonIds.includes(addonId)) return true
    
    // Check by manifest URL
    if (manifestUrl && protectedManifestUrls.includes(manifestUrl)) return true
    
    // Check if manifest URL contains any protected addon ID
    if (manifestUrl && protectedAddonIds.some(id => manifestUrl.includes(id))) return true
    
    return false
  }

  // Check if an addon is protected (built-in + user-defined) - same logic as main component
  const isAddonProtected = (addon: any) => {
    const manifestUrl = addon?.manifestUrl || addon?.transportUrl || addon?.url
    
    // Check if built-in protected
    if (isAddonProtectedBuiltIn(addon)) return true
    
    // Check if user-protected
    return userProtectedSet.has(manifestUrl || '')
  }

  const handleConnectStremio = () => {
    if (syncStatus) {
      // This will be handled by the parent component
      // We'll use a custom event to communicate with the parent
      window.dispatchEvent(new CustomEvent('connectStremio', { detail: { id: userId } }))
    }
  }
  const { data: live } = useQuery({
    queryKey: ['user', userId, 'stremio-addons'],
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}/stremio-addons`)
      if (!res.ok) return { addons: [] }
      return res.json()
    },
    staleTime: 60_000, // 1 minute
    refetchOnMount: 'always',
    refetchInterval: 120_000, // 2 minutes
    enabled: !!syncStatus && syncStatus.status !== 'connect', // Only fetch if user is connected to Stremio
  })

  // Listen for Users tab activation and force a re-check
  React.useEffect(() => {
    const onTab = (e: CustomEvent) => {
      if (e.detail?.id === 'users') {
        setStatus('checking')
      }
    }
    window.addEventListener('sfm:tab:activated' as any, onTab as any)
    return () => window.removeEventListener('sfm:tab:activated' as any, onTab as any)
  }, [])

  // Listen for user status changes (e.g., when addon is deleted)
  React.useEffect(() => {
    const onUserStatus = (e: CustomEvent) => {
      debug.log(`UserSyncBadge [${location}] received sfm:user-status event:`, e.detail, 'for userId:', userId)
      if (e.detail?.userId === userId) {
        debug.log(`UserSyncBadge [${location}] setting status to:`, e.detail.status)
        setStatus(e.detail.status)
        
        // Only set manual flag for unsynced status, and clear it after a short delay
        if (e.detail.status === 'unsynced') {
          debug.log(`UserSyncBadge [${location}] setting unsynced with temporary manual flag`)
          setManuallySet(true)
          // Clear the manual flag after 1 second to allow normal sync checking
          setTimeout(() => {
            debug.log(`UserSyncBadge [${location}] clearing manual flag`)
            setManuallySet(false)
          }, 1000)
        }
      }
    }
    window.addEventListener('sfm:user-status' as any, onUserStatus as any)
    return () => window.removeEventListener('sfm:user-status' as any, onUserStatus as any)
  }, [userId, location])

  const deepSort = (obj: any): any => {
    if (Array.isArray(obj)) return obj.map(deepSort)
    if (obj && typeof obj === 'object') {
      return Object.keys(obj).sort().reduce((acc: any, key: string) => {
        acc[key] = deepSort(obj[key])
        return acc
      }, {} as any)
    }
    return obj
  }




  // Remove duplicate - already defined above

  // Reset status when userId changes to avoid showing stale data
  React.useLayoutEffect(() => {
    if (currentUserIdRef.current !== userId) {
      currentUserIdRef.current = userId
      setStatus('checking')
      setManuallySet(false)
    }
  }, [userId])

  // Persist last-known user sync status for cross-tab consumers (e.g., Groups page)
  React.useEffect(() => {
    if (status === 'synced' || status === 'unsynced') {
      try {
        localStorage.setItem(`sfm_user_sync_status:${userId}`, status)
        window.dispatchEvent(new CustomEvent('sfm:user-status' as any, { detail: { userId, status } }))
      } catch {}
    }
  }, [status, userId])

  React.useEffect(() => {
    const checkSync = () => {
      debug.log(`UserSyncBadge [${location}] checkSync running for userId:`, userId)
      debug.log(`UserSyncBadge [${location}] isSyncing:`, isSyncing, 'manuallySet:', manuallySet)
      
      // Skip if this is not the current user (avoid stale data)
      if (currentUserIdRef.current !== userId) {
        debug.log(`UserSyncBadge [${location}] skipping checkSync - userId mismatch`)
        return
      }
      
      // Skip checkSync if status was manually set recently
      if (manuallySet) {
        debug.log(`UserSyncBadge [${location}] skipping checkSync - status was manually set`)
        return
      }
      
      // If currently syncing, show syncing state
      if (isSyncing) {
        debug.log('Setting status to syncing (currently syncing)')
        setStatus('syncing')
        return
      }

      // If data is still loading, show checking state
      if (!syncStatus) {
        console.log('Setting status to checking (data loading)')
        setStatus('checking')
        return
      }

      // Use the status from the API
      setStatus(syncStatus.status || 'checking')
    }

    checkSync()
  }, [syncStatus, isSyncing, manuallySet])

  const handleSync = () => {
    // Trigger sync for this user
    window.dispatchEvent(new CustomEvent('syncUser', { detail: { userId } }))
  }

  const getTitle = () => {
    switch (status) {
      case 'synced':
        return 'User is synced'
      case 'unsynced':
        return 'Click to sync user'
      case 'stale':
        return 'User is stale'
      case 'connect':
        return 'Click to connect Stremio'
      case 'syncing':
        return 'Syncing user...'
      case 'checking':
        return 'Checking sync status...'
      default:
        return ''
    }
  }

  // Only render if this is the current user (avoid showing stale data)
  if (currentUserIdRef.current !== userId) {
    return (
      <SyncBadge
        status="checking"
        isClickable={false}
        title="Checking sync status..."
        isListMode={isListMode}
      />
    )
  }

  return (
    <SyncBadge
      status={status}
      isClickable={status === 'unsynced' || status === 'connect'}
      onClick={status === 'unsynced' ? handleSync : status === 'connect' ? handleConnectStremio : undefined}
      title={getTitle()}
      isListMode={isListMode}
    />
  )
}

export default function UsersPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const debouncedSearchTerm = useDebounce(searchTerm, 300)
  
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
  
  // Protected addon lists
  const protectedAddonIds = [
    'com.linvo.cinemeta', // Cinemeta
    'org.stremio.local', // Local Files
    'com.stremio.opensubtitles', // OpenSubtitles (if present)
    'com.stremio.youtube', // YouTube (if present)
  ]

  const protectedManifestUrls = [
    'https://v3-cinemeta.strem.io/manifest.json',
    'http://127.0.0.1:11470/local-addon/manifest.json',
    'https://v3-opensubtitles.strem.io/manifest.json',
    'https://v3-youtube.strem.io/manifest.json',
  ]

  // Check if an addon is protected (built-in list)
  const isAddonProtectedBuiltIn = (addon: any) => {
    const addonId = addon?.id || addon?.manifest?.id
    const manifestUrl = addon?.manifestUrl || addon?.transportUrl || addon?.url
    
    // Check by ID
    if (addonId && protectedAddonIds.includes(addonId)) return true
    
    // Check by manifest URL
    if (manifestUrl && protectedManifestUrls.includes(manifestUrl)) return true
    
    // Check if manifest URL contains any protected IDs (for cases where URL contains the ID)
    if (manifestUrl) {
      return protectedAddonIds.some((id: string) => manifestUrl.includes(id)) ||
             protectedManifestUrls.some((url: string) => manifestUrl.includes(url))
    }
    
    return false
  }

  // Check if an addon is protected (built-in + user-defined)
  const isAddonProtected = (addon: any) => isAddonProtectedBuiltIn(addon) || userProtectedSet.has(addon?.manifestUrl || addon?.transportUrl || addon?.url || '')
  
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [authMode, setAuthMode] = useState<'email' | 'authkey'>('email')
  const [stremioEmail, setStremioEmail] = useState('')
  const [stremioPassword, setStremioPassword] = useState('')
  const [stremioUsername, setStremioUsername] = useState('')
  const [stremioAuthKey, setStremioAuthKey] = useState('')
  const [selectedGroup, setSelectedGroup] = useState('')
  const [newGroupName, setNewGroupName] = useState('')
  
  // Edit user modal state
  const [editingUser, setEditingUser] = useState<any>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editFormData, setEditFormData] = useState({
    username: '',
    email: '',
    password: '',
    groupName: ''
  })
  const [editingUsername, setEditingUsername] = useState<string | null>(null)
  const [tempUsername, setTempUsername] = useState<string>('')
  
  // User detail modal state
  const [selectedUser, setSelectedUser] = useState<any>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  
  // Detailed view editing state
  const [editingDetailUsername, setEditingDetailUsername] = useState<string | null>(null)
  const [tempDetailUsername, setTempDetailUsername] = useState<string>('')
  const [editingDetailGroup, setEditingDetailGroup] = useState<boolean>(false)
  const [tempDetailGroup, setTempDetailGroup] = useState<string>('')
  const { isDark, isModern, isModernDark, isMono } = useTheme()
  const queryClient = useQueryClient()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  
  // Delete mode state
  const [deleteMode, setDeleteMode] = useState<'safe' | 'unsafe'>('safe')
  
  // Load delete mode from localStorage
  useEffect(() => {
    const savedDeleteMode = localStorage.getItem('sfm_delete_mode') as 'safe' | 'unsafe' | null
    if (savedDeleteMode) {
      setDeleteMode(savedDeleteMode)
    }
  }, [])
  
  // Listen for delete mode changes from settings
  useEffect(() => {
    const handleDeleteModeChange = () => {
      const savedDeleteMode = localStorage.getItem('sfm_delete_mode') as 'safe' | 'unsafe' | null
      if (savedDeleteMode) {
        setDeleteMode(savedDeleteMode)
      }
    }
    
    window.addEventListener('sfm:settings:changed', handleDeleteModeChange)
    return () => window.removeEventListener('sfm:settings:changed', handleDeleteModeChange)
  }, [])
  
  // Listen for user detail view requests from other components (like GroupsPage)
  useEffect(() => {
    const handleViewUserDetails = (e: CustomEvent) => {
      const { user } = e.detail || {}
      if (user) {
        setSelectedUser(user)
        setIsDetailModalOpen(true)
        // Reset editing states when opening detail view
        setEditingDetailUsername(null)
        setTempDetailUsername('')
        setEditingDetailGroup(false)
        setTempDetailGroup('')
      }
    }
    
    window.addEventListener('sfm:view-user-details', handleViewUserDetails as any)
    return () => {
      window.removeEventListener('sfm:view-user-details', handleViewUserDetails as any)
    }
  }, [])
  
  // Backend restart detection
  const [lastServerStartTime, setLastServerStartTime] = useState<string | null>(null)
  
  // Check for backend restarts and refresh data if needed
  useEffect(() => {
    const checkBackendRestart = async () => {
      try {
        const response = await fetch('http://localhost:4000/health')
        if (response.ok) {
          const health = await response.json()
          if (lastServerStartTime && health.serverStartTime !== lastServerStartTime) {
            // Backend restarted, refresh all user data
            // Invalidate all queries to ensure fresh data
            queryClient.invalidateQueries()
            // Also clear the cache to force refetch
            queryClient.clear()
            toast.success('Backend restarted - data refreshed')
          }
          setLastServerStartTime(health.serverStartTime)
        }
      } catch (error) {
        // Health check failed - backend might be down
      }
    }
    
    // Check immediately and then every 5 seconds
    checkBackendRestart()
    const interval = setInterval(checkBackendRestart, 5000)
    
    return () => clearInterval(interval)
  }, [lastServerStartTime, queryClient])

  // Listen for settings changes
  useEffect(() => {
    const handleSettingsChange = () => {
      const savedDeleteMode = localStorage.getItem('sfm_delete_mode')
      setDeleteMode(savedDeleteMode === 'unsafe' ? 'unsafe' : 'safe')
    }
    
    // Load initial delete mode
    handleSettingsChange()
    
    // Listen for changes
    window.addEventListener('sfm:settings:changed', handleSettingsChange)
    
    return () => {
      window.removeEventListener('sfm:settings:changed', handleSettingsChange)
    }
  }, [])


  // Fetch users from API
  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const result = await usersAPI.getAll()
      
      // Handle case where result might be wrapped in an axios response
      if (result && typeof result === 'object' && 'data' in result && Array.isArray((result as any).data)) {
        return (result as any).data
      }
      
      // If result is already an array, return it
      if (Array.isArray(result)) {
        return result
      }
      
      return []
    },
    retry: 1,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  })

  // Fetch user details (without Stremio addons to avoid duplicate API calls)
  const { data: userDetailsData, isLoading: isLoadingDetails } = useQuery({
    queryKey: ['user', selectedUser?.id, 'basic'],
    queryFn: async () => {
      if (!selectedUser?.id) return null
      const response = await fetch(`/api/users/${selectedUser.id}?basic=true`)
      if (!response.ok) throw new Error('Failed to fetch user details')
      return response.json()
    },
    enabled: !!selectedUser?.id
  })

  // Fetch live Stremio addons for the selected user (this will be the single source of truth)
  const { data: stremioAddonsData, isLoading: isLoadingStremioAddons } = useQuery({
    queryKey: ['user', selectedUser?.id, 'stremio-addons'],
    queryFn: async () => {
      if (!selectedUser?.id) return null
      const response = await fetch(`/api/users/${selectedUser.id}/stremio-addons`)
      if (!response.ok) {
        // If user is not connected to Stremio, return empty addons instead of throwing
        if (response.status === 400) {
          return { addons: [] }
        }
        throw new Error('Failed to fetch Stremio addons')
      }
      return response.json()
    },
    enabled: !!selectedUser?.id && !!selectedUser?.hasStremioConnection,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchOnMount: false, // Don't refetch on mount if we have cached data
    refetchOnWindowFocus: false
  })

  // Calculate sync status from cached Stremio addons data (no additional API call needed)
  const [isUserSynced, setIsUserSynced] = React.useState<boolean>(false)
  
  const [hideSensitive, setHideSensitive] = React.useState<boolean>(false)

  // Per-user excluded group addons (manifestUrl) — now from database
  const [userExcludedSet, setUserExcludedSet] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (userDetailsData?.excludedAddons) {
      setUserExcludedSet(new Set(userDetailsData.excludedAddons))
    } else {
      setUserExcludedSet(new Set())
    }
  }, [userDetailsData?.excludedAddons])

  // Global states for all users (used by UserSyncBadge components)
  const [globalUserExcludedSets, setGlobalUserExcludedSets] = useState<Map<string, Set<string>>>(new Map())
  const [globalUserProtectedSets, setGlobalUserProtectedSets] = useState<Map<string, Set<string>>>(new Map())

  // Load excluded and protected sets for all users
  useEffect(() => {
    if (!users) return
    
    const newExcludedSets = new Map<string, Set<string>>()
    const newProtectedSets = new Map<string, Set<string>>()
    
    users.forEach((user: any) => {
      const uid = user.id
      if (!uid) return
      
      // Load excluded and protected addons from user data
      const excludedAddons = user.excludedAddons || []
      const protectedAddons = user.protectedAddons || []
      
      newExcludedSets.set(uid, new Set(excludedAddons))
      newProtectedSets.set(uid, new Set(protectedAddons))
    })
    
    // Only update state if the data has actually changed
    setGlobalUserExcludedSets(prev => {
      // Check if the new data is different from current data
      if (prev.size !== newExcludedSets.size) return newExcludedSets
      
      for (const [key, value] of Array.from(newExcludedSets.entries())) {
        const prevValue = prev.get(key)
        if (!prevValue || prevValue.size !== value.size || 
            !Array.from(value).every(item => prevValue.has(item))) {
          return newExcludedSets
        }
      }
      
      return prev // No change, return same reference
    })
    
    setGlobalUserProtectedSets(prev => {
      // Check if the new data is different from current data
      if (prev.size !== newProtectedSets.size) return newProtectedSets
      
      for (const [key, value] of Array.from(newProtectedSets.entries())) {
        const prevValue = prev.get(key)
        if (!prevValue || prevValue.size !== value.size || 
            !Array.from(value).every(item => prevValue.has(item))) {
          return newProtectedSets
        }
      }
      
      return prev // No change, return same reference
    })
  }, [users])

  const toggleUserExcluded = async (manifestUrl?: string) => {
    const uid = selectedUser?.id
    if (!uid || !manifestUrl) return
    
    setUserExcludedSet((prev) => {
      const next = new Set(prev)
      const key = manifestUrl
      if (next.has(key)) next.delete(key)
      else next.add(key)
      
      // Update database
      fetch(`/api/users/${uid}/excluded-addons`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ excludedAddons: Array.from(next) })
      }).then(() => {
        // Update global sets for this user
        setGlobalUserExcludedSets(prev => {
          const newMap = new Map(prev)
          newMap.set(uid, next)
          return newMap
        })
        
        // Invalidate queries to update sync badges
        queryClient.invalidateQueries({ queryKey: ['user', uid] })
        queryClient.invalidateQueries({ queryKey: ['user', uid, 'stremio-addons'] })
      }).catch(error => console.error('Failed to update excluded addons:', error))
      
      // Update global state for all users
      setGlobalUserExcludedSets(prev => {
        const newGlobal = new Map(prev)
        newGlobal.set(uid, next)
        return newGlobal
      })
      
      // Invalidate user queries to update sync badges in general view
      queryClient.invalidateQueries({ queryKey: ['user', uid] })
      queryClient.invalidateQueries({ queryKey: ['users'] })
      
      return next
    })
  }

  React.useEffect(() => {
    const read = () => {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('sfm_hide_sensitive') : null
      setHideSensitive(saved === '1')
    }
    read()
    const onChanged = () => read()
    window.addEventListener('sfm:settings:changed' as any, onChanged)
    return () => window.removeEventListener('sfm:settings:changed' as any, onChanged)
  }, [])

  // Handle connectStremio events from UserSyncBadge
  React.useEffect(() => {
    const handleConnectStremio = (event: CustomEvent) => {
      const userDetail = event.detail
      handleConnectExistingUserToStremio(userDetail)
    }

    window.addEventListener('connectStremio', handleConnectStremio as EventListener)
    
    return () => {
      window.removeEventListener('connectStremio', handleConnectStremio as EventListener)
    }
  }, [])

  React.useEffect(() => {
    let cancelled = false

    const run = async () => {
      if (!userDetailsData) { setIsUserSynced(false); return }
      const allGroupAddons = Array.isArray(userDetailsData.addons) ? userDetailsData.addons : []
      const groupAddons = allGroupAddons.filter((ga: any) => !userExcludedSet.has(ga?.manifestUrl) && ga?.isEnabled !== false)
      if (groupAddons.length === 0) { setIsUserSynced(true); return }
      const live = Array.isArray(stremioAddonsData?.addons) ? stremioAddonsData.addons : []
      if (live.length === 0) { setIsUserSynced(false); return }

      // Build sets from ALL live addons for presence checks (include protected)
      const allLiveById = new Map<string, any[]>()
      const allLiveUrlSet = new Set<string>()
      for (const a of live) {
        const id = a?.id || a?.manifest?.id || ''
        if (id) {
          if (!allLiveById.has(id)) allLiveById.set(id, [])
          allLiveById.get(id)!.push(a)
        }
        const url = a?.manifestUrl || a?.transportUrl || a?.url
        if (url) allLiveUrlSet.add(url.toString().trim().toLowerCase())
      }

      // Use non-protected live only to detect extras that should not be present
      const nonProtectedLive = live.filter((addon: any) => !isAddonProtected(addon))

      const deepSort = (obj: any): any => {
        if (Array.isArray(obj)) return obj.map(deepSort)
        if (obj && typeof obj === 'object') {
          return Object.keys(obj).sort().reduce((acc: any, key: string) => {
            acc[key] = deepSort(obj[key])
            return acc
          }, {} as any)
        }
        return obj
      }

      // Ensure every group addon exists in the account (protected or not)
      for (const ga of groupAddons) {
        const groupId = ga?.id || ga?.manifest?.id
        const groupUrl = (ga?.manifestUrl || '').toString().trim().toLowerCase()
        if (groupUrl && allLiveUrlSet.has(groupUrl)) {
          continue
        }
        if (groupId && allLiveById.has(groupId)) {
          const userAddonsWithId = allLiveById.get(groupId) || []
          let foundMatchingManifest = false
          for (const userAddon of userAddonsWithId) {
            try {
              const groupManifest = await fetchManifestCached(ga?.manifestUrl)
              const userManifest = userAddon?.manifest
              if (groupManifest && userManifest) {
                const groupKey = JSON.stringify(deepSort(groupManifest))
                const userKey = JSON.stringify(deepSort(userManifest))
                if (groupKey === userKey) { foundMatchingManifest = true; break }
              }
            } catch {}
          }
          if (!foundMatchingManifest) { setIsUserSynced(false); return }
        } else {
          setIsUserSynced(false); return
        }
      }

      // Check order: group addons should appear in the same order in Stremio account
      const groupAddonUrls = groupAddons.map((ga: any) => (ga?.manifestUrl || '').toString().trim().toLowerCase()).filter(Boolean)
      
      // For order checking, we need to consider ALL live addons (including protected ones)
      // because protected addons that are in the group should be treated as group addons
      const allLiveAddonUrls = live.map((a: any) => (a?.manifestUrl || a?.transportUrl || a?.url || '').toString().trim().toLowerCase()).filter(Boolean)
      
      console.log('🔍 Sync Status Debug for neur0:')
      console.log('Group addon URLs:', groupAddonUrls)
      console.log('Live addon URLs:', allLiveAddonUrls)
      console.log('User protected set:', Array.from(userProtectedSet))
      console.log('Live addons details:', live.map((a: any) => ({ 
        name: a?.manifest?.name, 
        url: a?.manifestUrl, 
        protected: isAddonProtected(a),
        builtInProtected: isAddonProtectedBuiltIn(a),
        userProtected: userProtectedSet.has(a?.manifestUrl || a?.transportUrl || a?.url || '')
      })))
      
      // Find the positions of group addons in the live addons list
      const groupAddonPositions: number[] = []
      for (const groupUrl of groupAddonUrls) {
        const position = allLiveAddonUrls.findIndex((liveUrl: string) => liveUrl === groupUrl)
        console.log(`Looking for group addon "${groupUrl}" in live addons, found at position:`, position)
        if (position === -1) { 
          console.log('❌ Group addon not found in live addons')
          setIsUserSynced(false); return 
        }
        groupAddonPositions.push(position)
      }
      
      console.log('Group addon positions:', groupAddonPositions)
      
      // Check if group addons are in the same order (positions should be ascending)
      for (let i = 1; i < groupAddonPositions.length; i++) {
        if (groupAddonPositions[i] <= groupAddonPositions[i - 1]) {
          console.log(`❌ Order check failed: position ${i} (${groupAddonPositions[i]}) <= position ${i-1} (${groupAddonPositions[i-1]})`)
          setIsUserSynced(false); return
        }
      }
      
      console.log('✅ Order check passed')

      // Extras: check for addons that shouldn't be there
      const groupAddonIds = new Set(groupAddons.map((ga: any) => ga?.id || ga?.manifest?.id).filter(Boolean))
      const groupAddonUrlSet = new Set(groupAddonUrls)
      
      // Check non-protected addons - they should all be in the group
      console.log('🔍 Checking non-protected addons:')
      console.log('Non-protected live addons:', nonProtectedLive.map((a: any) => ({ 
        name: a?.manifest?.name, 
        url: a?.manifestUrl 
      })))
      
      for (const addon of nonProtectedLive) {
        const addonId = addon?.id || addon?.manifest?.id
        const addonUrl = (addon?.manifestUrl || addon?.transportUrl || addon?.url || '').toString().trim().toLowerCase()
        const isInGroup = (addonId && groupAddonIds.has(addonId)) || (addonUrl && groupAddonUrlSet.has(addonUrl))
        console.log(`  ${addon?.manifest?.name || addon?.name} (${addonUrl}): in group = ${isInGroup}`)
        if (!isInGroup) { 
          console.log('❌ Non-protected addon not in group')
          setIsUserSynced(false); return 
        }
      }
      
      // Check protected addons - they should either be in the group OR be personal protected addons
      // If a protected addon is in the group, it should be treated as a group addon
      // If a protected addon is NOT in the group, it should be ignored (personal addon)
      const protectedLive = live.filter((addon: any) => isAddonProtected(addon))
      console.log('🔍 Checking protected addons:')
      console.log('Protected live addons:', protectedLive.map((a: any) => ({ 
        name: a?.manifest?.name, 
        url: a?.manifestUrl,
        userProtected: userProtectedSet.has(a?.manifestUrl || a?.transportUrl || a?.url || '')
      })))
      
      for (const addon of protectedLive) {
        const addonId = addon?.id || addon?.manifest?.id
        const addonUrl = (addon?.manifestUrl || addon?.transportUrl || addon?.url || '').toString().trim().toLowerCase()
        const isInGroup = (addonId && groupAddonIds.has(addonId)) || (addonUrl && groupAddonUrlSet.has(addonUrl))
        console.log(`  ${addon?.manifest?.name || addon?.name} (${addonUrl}): in group = ${isInGroup} - ${isInGroup ? 'treated as group addon' : 'personal addon (ignored)'}`)
        
        // If protected addon is in group, it should be treated as a group addon (already checked above)
        // If protected addon is NOT in group, it's a personal addon and should be ignored
        // So we don't need to do anything here - personal protected addons are allowed
      }

      console.log('✅ All checks passed - setting synced to true')
      setIsUserSynced(true)
    }

    run()
    return () => { cancelled = true }
  }, [userDetailsData, stremioAddonsData, userExcludedSet])


  // Reload user addons mutation
  const reloadUserAddonsMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/users/${userId}/reload-addons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || 'Failed to reload user addons')
      }
      return res.json()
    },
    onSuccess: (data, userId) => {
      // Reload-only: refresh user's live stremio addons panel; do not change sync views
      queryClient.invalidateQueries({ queryKey: ['user', userId, 'stremio-addons'] })
      queryClient.invalidateQueries({ queryKey: ['user', userId] })

      // Force refetch the live addons immediately
      queryClient.refetchQueries({ queryKey: ['user', userId, 'stremio-addons'] })
      queryClient.refetchQueries({ queryKey: ['user', userId] })

      toast.success(data?.message || 'User addons reloaded successfully!')
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to reload user addons')
    }
  })

  // Sync user mutation (triggered by the sync badge)
  const syncUserMutation = useMutation({
    mutationFn: async ({ userId, excluded }: { userId: string; excluded: string[] }) => {
      // Use normal mode unless advanced is explicitly needed
      return usersAPI.sync(userId, excluded, 'normal')
    },
    onSuccess: (_data, variables) => {
      const userId = variables.userId
      // Refresh only the user's sync status and basic data
      queryClient.invalidateQueries({ queryKey: ['user', userId, 'sync-status'] })
      queryClient.invalidateQueries({ queryKey: ['user', userId] })
      queryClient.refetchQueries({ queryKey: ['user', userId, 'sync-status'] })
      toast.success('User synced successfully')
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to sync user')
    }
  })

  // Force-refetch users and per-user data when Users tab is activated
  React.useEffect(() => {
    const onUsersTab = async (e: CustomEvent) => {
      if (e.detail?.id !== 'users') return
      try {
        // Refetch whether mounted or not so next mount shows fresh data
        await Promise.all([
          queryClient.refetchQueries({ queryKey: ['users'] as any, type: 'all' }),
          queryClient.refetchQueries({ queryKey: ['user'] as any, type: 'all' }),
          // Also refresh groups in the background so their badges are fresh when switching back
          queryClient.refetchQueries({ queryKey: ['groups'] as any, type: 'all' }),
        ])
        // Nudge group badges to recompute immediately from cached user statuses
        try {
          window.dispatchEvent(new CustomEvent('sfm:groups:recheck' as any, { detail: { source: 'users-tab' } }))
        } catch {}
      } catch {}
    }
    window.addEventListener('sfm:tab:activated' as any, onUsersTab as any)
    return () => window.removeEventListener('sfm:tab:activated' as any, onUsersTab as any)
  }, [queryClient])

  // Handle syncUser events from UserSyncBadge
  React.useEffect(() => {
    const handleSyncUser = (event: CustomEvent) => {
      const { userId } = event.detail
      const excluded = Array.from((globalUserExcludedSets.get(userId) || new Set<string>()).values())
      syncUserMutation.mutate({ userId, excluded })
    }

    window.addEventListener('syncUser', handleSyncUser as EventListener)
    
    return () => {
      window.removeEventListener('syncUser', handleSyncUser as EventListener)
    }
  }, [syncUserMutation, globalUserExcludedSets])

  // Fetch groups for the dropdown
  const { data: groupsRaw = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: async () => {
      const result = await groupsAPI.getAll()
      
      // Handle case where result might be wrapped in an axios response
      if (result && typeof result === 'object' && 'data' in result && Array.isArray((result as any).data)) {
        return (result as any).data
      }
      
      // If result is already an array, return it
      if (Array.isArray(result)) {
        return result
      }
      
      return []
    },
    retry: 1,
  })

  const groups = React.useMemo(() => {
    if (Array.isArray(groupsRaw)) return groupsRaw
    if (groupsRaw && typeof groupsRaw === 'object' && Array.isArray((groupsRaw as any).data)) return (groupsRaw as any).data
    return []
  }, [groupsRaw])

  // Filter users locally like groups does
  const filteredUsers = useMemo(() => {
    const base = Array.isArray(users) ? users : []
    return base.filter((user: any) => {
      const username = String(user.username || '')
      const email = String(user.email || '')
      const groupName = String(user.groupName || '')
      const matchesSearch = username.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
                           email.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
                           groupName.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
      return matchesSearch
    })
  }, [users, debouncedSearchTerm])

  // Connect Stremio user mutation
  const connectStremioMutation = useMutation({
    mutationFn: async (userData: { email: string; password: string; username: string; groupName?: string; userId?: string }) => {
      // If userId is provided, connect existing user to Stremio
      if (userData.userId) {
        const response = await fetch(`/api/users/${userData.userId}/connect-stremio`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: userData.email,
            password: userData.password,
            username: userData.username
          })
        })
        
        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.message || 'Failed to connect to Stremio')
        }
        
        return response.json()
      } else {
        // Create new user with Stremio credentials
        const response = await fetch('/api/stremio/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(userData)
        })
        
        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.message || 'Failed to connect to Stremio')
        }
        
        return response.json()
      }
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      // Also invalidate the specific user detail query to update the sync badge
      if (variables.userId) {
        queryClient.invalidateQueries({ queryKey: ['user', variables.userId] })
        queryClient.invalidateQueries({ queryKey: ['user', variables.userId, 'stremio-addons'] })
      }
      setShowConnectModal(false)
      setStremioEmail('')
      setStremioPassword('')
      setStremioUsername('')
      setSelectedGroup('')
      setNewGroupName('')
      setEditingUser(null)
      toast.success(`Connected to Stremio! Found ${data.addonsCount || 0} addons`)
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to connect to Stremio')
    },
  })

  // Connect Stremio using authKey mutation
  const connectStremioWithAuthKeyMutation = useMutation({
    mutationFn: async (payload: { authKey: string; username?: string; groupName?: string; userId?: string }) => {
      if (payload.userId) {
        const resp = await fetch(`/api/users/${payload.userId}/connect-stremio-authkey`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ authKey: payload.authKey })
        })
        if (!resp.ok) throw new Error((await resp.json()).message || 'Failed to connect with auth key')
        return resp.json()
      } else {
        const resp = await fetch('/api/stremio/connect-authkey', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ authKey: payload.authKey, username: payload.username, displayName: payload.username, groupName: payload.groupName })
        })
        if (!resp.ok) throw new Error((await resp.json()).message || 'Failed to connect with auth key')
        return resp.json()
      }
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      if (variables.userId) queryClient.invalidateQueries({ queryKey: ['user', variables.userId] })
      setShowConnectModal(false)
      setStremioAuthKey('')
      setStremioEmail(''); setStremioPassword(''); setStremioUsername('')
      setSelectedGroup(''); setNewGroupName(''); setEditingUser(null)
      toast.success('Connected to Stremio via auth key')
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to connect with auth key')
  })

  // Delete user mutation (inline fetch with better error details)
  const deleteUserMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `Failed to delete user (status ${res.status})`)
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('User deleted successfully!')
    },
    onError: (error: any) => {
      const msg = typeof error?.message === 'string' ? error.message : (error?.response?.data?.message || 'Failed to delete user')
      toast.error(msg)
    },
  })

  // Import addons from user mutation
  const importUserAddonsMutation = useMutation({
    mutationFn: async (userId: string) => {
      // Prefer live Stremio addons first
      let addonsSource: any[] = []
      try {
        const liveRes = await fetch(`/api/users/${userId}/stremio-addons`)
        if (liveRes.ok) {
          const liveData = await liveRes.json()
          const liveAddons = Array.isArray(liveData?.addons) ? liveData.addons : []
          if (liveAddons.length > 0) {
            addonsSource = liveAddons
          }
        }
      } catch {}

      // If live is empty, try forcing a reload then re-fetch live once
      if (addonsSource.length === 0) {
        try {
          await fetch(`/api/users/${userId}/reload-addons`, { method: 'POST' })
          const liveRetry = await fetch(`/api/users/${userId}/stremio-addons`)
          if (liveRetry.ok) {
            const liveData = await liveRetry.json()
            const liveAddons = Array.isArray(liveData?.addons) ? liveData.addons : []
            if (liveAddons.length > 0) {
              addonsSource = liveAddons
            }
          }
        } catch {}
      }

      // Fallback to persisted user endpoint if still empty
      if (addonsSource.length === 0) {
        const userRes = await fetch(`/api/users/${userId}`)
        if (!userRes.ok) throw new Error('Failed to fetch user data')
        const userData = await userRes.json()
        const persisted = Array.isArray(userData?.stremioAddons) ? userData.stremioAddons : []
        addonsSource = persisted
      }

      if (!Array.isArray(addonsSource) || addonsSource.length === 0) {
        throw new Error('No Stremio addons available to import')
      }

      const addons = addonsSource.map((addon: any) => ({
        manifestUrl: addon.manifestUrl || addon.transportUrl || addon.url,
        name: addon.name || addon.manifest?.name,
        description: addon.description || addon.manifest?.description,
        version: addon.version || addon.manifest?.version,
        iconUrl: addon.iconUrl || addon.manifest?.logo
      }))

      const res = await fetch(`/api/users/${userId}/import-addons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addons })
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || 'Failed to import addons')
      }

      return res.json()
    },
    onSuccess: (data) => {
      toast.success(`Successfully imported ${data.addonCount} addons to group "${data.groupName}"`)
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to import addons')
    }
  })

  // Wipe user addons mutation
  const wipeUserAddonsMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await fetch(`/api/users/${userId}/stremio-addons/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || 'Failed to wipe addons')
      }
      return response.json()
    },
    // Optimistic UI update to immediately clear addons and set unsynced status
    onMutate: async (userId) => {
      await queryClient.cancelQueries({ queryKey: ['user', userId, 'stremio-addons'] })
      const prev = queryClient.getQueryData<any>(['user', userId, 'stremio-addons'])
      if (prev && Array.isArray(prev.addons)) {
        const next = { ...prev, addons: [] }
        queryClient.setQueryData(['user', userId, 'stremio-addons'], next)
      }
      // Immediately set to unsynced - any change means unsynced
      try {
        localStorage.setItem(`sfm_user_sync_status:${userId}`, 'unsynced')
        console.log('Dispatching sfm:user-status event for userId:', userId, 'status: unsynced')
        window.dispatchEvent(new CustomEvent('sfm:user-status' as any, { detail: { userId, status: 'unsynced' } }))
      } catch {}
      return { prev }
    },
    onSuccess: () => {
      toast.success('All addons wiped successfully')
    },
    onError: (error: any, vars, context) => {
      // Rollback on error
      if (context?.prev) {
        queryClient.setQueryData(['user', selectedUser?.id, 'stremio-addons'], context.prev)
        toast.error(error?.message || 'Failed to wipe addons')
      }
    },
    onSettled: (data, error, variables) => {
      // After any change, invalidate queries to trigger re-evaluation
      console.log('Wipe operation settled, invalidating queries for userId:', variables)
      queryClient.invalidateQueries({ queryKey: ['user', variables, 'stremio-addons'] })
      queryClient.invalidateQueries({ queryKey: ['user', variables] })
      queryClient.invalidateQueries({ queryKey: ['users'] })
      // Don't dispatch checking status - let the normal sync evaluation handle it
    }
  })

  // Update username mutation
  const updateUsernameMutation = useMutation({
    mutationFn: async ({ userId, username }: { userId: string; username: string }) => {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || 'Failed to update username')
      }
      return response.json()
    },
    onSuccess: (data, variables) => {
      toast.success('Username updated successfully')
      queryClient.invalidateQueries({ queryKey: ['users'] })
      // Also invalidate user details query to refresh detailed view
      if (variables.userId) {
        queryClient.invalidateQueries({ queryKey: ['user', variables.userId] })
      }
      setEditingUsername(null)
      setTempUsername('')
      // Note: Detailed view editing states are now handled locally in the handlers
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to update username')
    }
  })

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: async ({ id, userData }: { id: string; userData: any }) => {
      
      // Use inline API call to bypass import issues
      const response = await fetch(`/api/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ Update failed:', response.status, errorText)
        let errorMessage = 'Failed to update user'
        try {
          const error = JSON.parse(errorText)
          errorMessage = error.message || errorMessage
        } catch {
          errorMessage = errorText || errorMessage
        }
        throw new Error(errorMessage)
      }
      
      const result = await response.json()
      
      // Handle axios-style response wrapper if present
      if (result && typeof result === 'object' && result.data) {
        return result.data
      }
      return result
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      // Also invalidate user details query to refresh detailed view
      if (variables.id) {
        queryClient.invalidateQueries({ queryKey: ['user', variables.id] })
        queryClient.invalidateQueries({ queryKey: ['user', variables.id, 'sync-status'] })
      }
      // Invalidate groups query to refresh group details
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      setIsEditModalOpen(false)
      setEditingUser(null)
      setEditFormData({ username: '', email: '', password: '', groupName: '' })
      setIsStremioValid(true)
      setStremioValidationError(null)
      setIsValidatingStremio(false)
      // Also reset detailed view editing states
      setEditingDetailGroup(false)
      setTempDetailGroup('')
      toast.success('User updated successfully!')
    },
    onError: (error: any) => {
      console.error('Update user error:', error)
      toast.error(error.response?.data?.message || 'Failed to update user')
    }
  })

  // Toggle user status mutation
  const toggleUserStatusMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const response = await fetch(`/api/users/${id}/toggle-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !isActive })
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = 'Failed to toggle user status'
        try {
          const error = JSON.parse(errorText)
          errorMessage = error.message || errorMessage
        } catch {
          errorMessage = errorText || errorMessage
        }
        throw new Error(errorMessage)
      }
      
      return await response.json()
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      // If user was enabled, refresh their sync status
      if (variables.isActive) {
        queryClient.invalidateQueries({ queryKey: ['user', variables.id, 'sync-status'] })
        queryClient.refetchQueries({ queryKey: ['user', variables.id, 'sync-status'] })
      }
      toast.success('User status updated successfully!')
    },
    onError: (error: any) => {
      console.error('Toggle user status error:', error)
      toast.error(error.message || 'Failed to toggle user status')
    }
  })

  // Sync all users mutation
  const syncAllUsersMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/users/sync-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to sync all users')
      }
      
      return response.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['user'] })
      toast.success(data.message || 'All users synced successfully')
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to sync all users')
    },
  })

  // Handle toggle user status
  const handleToggleUserStatus = (userId: string, currentStatus: boolean) => {
    toggleUserStatusMutation.mutate({ id: userId, isActive: !currentStatus })
  }

  // Get user details query (for edit modal)
  const { data: editUserDetails } = useQuery({
    queryKey: ['user', editingUser?.id],
    queryFn: () => usersAPI.getById(editingUser.id),
    enabled: !!editingUser?.id,
  })

  // Update form data when user details are loaded (only for groupName)
  React.useEffect(() => {
    if (editUserDetails) {
      setEditFormData(prev => ({
        ...prev,
        groupName: editUserDetails.groupName || editUserDetails.groups?.[0]?.name || ''
      }))
    }
  }, [editUserDetails])

  // State for Stremio validation
  const [isValidatingStremio, setIsValidatingStremio] = useState(false)
  const [stremioValidationError, setStremioValidationError] = useState<string | null>(null)
  const [isStremioValid, setIsStremioValid] = useState(true)

  const handleConnectStremio = (e: React.FormEvent) => {
    e.preventDefault()
    if (authMode === 'authkey') {
      if (!stremioAuthKey || (!editingUser && !stremioUsername)) {
        toast.error('Please provide auth key and username')
        return
      }
      const groupToAssign = selectedGroup === 'new' ? newGroupName : selectedGroup
      connectStremioWithAuthKeyMutation.mutate({ authKey: stremioAuthKey.trim(), username: stremioUsername, groupName: groupToAssign || undefined, userId: editingUser?.id })
      return
    } else {
    if (!stremioEmail || !stremioPassword || (!editingUser && !stremioUsername)) {
      toast.error('Please fill in all required fields')
      return
      }
    }
    // Handle group assignment
    const groupToAssign = selectedGroup === 'new' ? newGroupName : selectedGroup

    connectStremioMutation.mutate({
      email: stremioEmail,
      password: stremioPassword,
      username: stremioUsername,
      groupName: groupToAssign || undefined,
      userId: editingUser?.id || undefined, // Include user ID if connecting existing user
    })
  }

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmConfig, setConfirmConfig] = useState<{ title: string; description: string; isDanger?: boolean; onConfirm: () => void }>({ title: '', description: '', isDanger: true, onConfirm: () => {} })

  const openConfirm = (cfg: { title: string; description: string; isDanger?: boolean; onConfirm: () => void }) => {
    setConfirmConfig(cfg)
    setConfirmOpen(true)
  }

  const handleDeleteUser = (id: string, username: string) => {
    openConfirm({
      title: `Delete user ${username}`,
      description: 'This action cannot be undone.',
      isDanger: true,
      onConfirm: () => deleteUserMutation.mutate(id)
    })
  }

  const getUserColorClass = (colorIndex: number | null | undefined) => {
    const theme = isMono ? 'mono' : isModern ? 'modern' : isModernDark ? 'modern-dark' : isDark ? 'dark' : 'light'
    return getColorBgClass(colorIndex, theme)
  }

  const handleStartEditUsername = (userId: string, currentUsername: string) => {
    setEditingUsername(userId)
    setTempUsername(currentUsername)
  }

  const handleSaveUsername = (userId: string, originalUsername: string) => {
    if (tempUsername.trim()) {
      // Only update if the username actually changed
      if (tempUsername.trim() !== originalUsername) {
        updateUsernameMutation.mutate({ userId, username: tempUsername.trim() })
      } else {
        // No change, just exit edit mode
        setEditingUsername(null)
        setTempUsername('')
      }
    } else {
      setEditingUsername(null)
      setTempUsername('')
    }
  }

  const handleBlurUsername = (userId: string, originalUsername: string) => {
    if (tempUsername.trim()) {
      // Only update if the username actually changed
      if (tempUsername.trim() !== originalUsername) {
        updateUsernameMutation.mutate({ userId, username: tempUsername.trim() })
      } else {
        // No change, just exit edit mode
        setEditingUsername(null)
        setTempUsername('')
      }
    } else {
      // If empty, revert to original and exit edit mode
      setEditingUsername(null)
      setTempUsername('')
    }
  }

  const handleEditUser = (user: any) => {
    // Clear form data so only placeholders show
    setEditFormData({
      username: '',
      email: '',
      password: '',
      groupName: user.groupId || ''
    })
    setEditingUser(user)
    setIsEditModalOpen(true)
  }

  const handleViewUserDetails = (user: any) => {
    setSelectedUser(user)
    setIsDetailModalOpen(true)
    // Reset editing states when opening detail view
    setEditingDetailUsername(null)
    setTempDetailUsername('')
    setEditingDetailGroup(false)
    setTempDetailGroup('')
  }

  // Detailed view editing handlers
  const handleStartEditDetailUsername = (currentUsername: string) => {
    setEditingDetailUsername(selectedUser?.id)
    setTempDetailUsername(currentUsername)
  }

  const handleSaveDetailUsername = (originalUsername: string) => {
    if (tempDetailUsername.trim()) {
      // Only update if the username actually changed
      if (tempDetailUsername.trim() !== originalUsername) {
        // Optimistically update the cache immediately
        queryClient.setQueryData(['user', selectedUser.id], (oldData: any) => {
          if (oldData) {
            return {
              ...oldData,
              username: tempDetailUsername.trim()
            }
          }
          return oldData
        })
        
        // Also update the selectedUser object for immediate UI update
        if (selectedUser) {
          selectedUser.username = tempDetailUsername.trim()
        }
        
        updateUsernameMutation.mutate({ 
          userId: selectedUser.id, 
          username: tempDetailUsername.trim() 
        }, {
          onSuccess: () => {
            // Reset editing state after successful update
            setEditingDetailUsername(null)
            setTempDetailUsername('')
          },
          onError: () => {
            // Revert optimistic update on error
            queryClient.setQueryData(['user', selectedUser.id], (oldData: any) => {
              if (oldData) {
                return {
                  ...oldData,
                  username: originalUsername
                }
              }
              return oldData
            })
            // Also revert the selectedUser object
            if (selectedUser) {
              selectedUser.username = originalUsername
            }
            // Keep editing state on error so user can try again
          }
        })
      } else {
        // No change, just exit edit mode
        setEditingDetailUsername(null)
        setTempDetailUsername('')
      }
    } else {
      setEditingDetailUsername(null)
      setTempDetailUsername('')
    }
  }

  const handleBlurDetailUsername = (originalUsername: string) => {
    if (tempDetailUsername.trim()) {
      // Only update if the username actually changed
      if (tempDetailUsername.trim() !== originalUsername) {
        // Optimistically update the cache immediately
        queryClient.setQueryData(['user', selectedUser.id], (oldData: any) => {
          if (oldData) {
            return {
              ...oldData,
              username: tempDetailUsername.trim()
            }
          }
          return oldData
        })
        
        // Also update the selectedUser object for immediate UI update
        if (selectedUser) {
          selectedUser.username = tempDetailUsername.trim()
        }
        
        updateUsernameMutation.mutate({ 
          userId: selectedUser.id, 
          username: tempDetailUsername.trim() 
        }, {
          onSuccess: () => {
            // Reset editing state after successful update
            setEditingDetailUsername(null)
            setTempDetailUsername('')
          },
          onError: () => {
            // Revert optimistic update on error
            queryClient.setQueryData(['user', selectedUser.id], (oldData: any) => {
              if (oldData) {
                return {
                  ...oldData,
                  username: originalUsername
                }
              }
              return oldData
            })
            // Also revert the selectedUser object
            if (selectedUser) {
              selectedUser.username = originalUsername
            }
            // Keep editing state on error so user can try again
          }
        })
      } else {
        // No change, just exit edit mode
        setEditingDetailUsername(null)
        setTempDetailUsername('')
      }
    } else {
      // If empty, revert to original and exit edit mode
      setEditingDetailUsername(null)
      setTempDetailUsername('')
    }
  }

  const handleStartEditDetailGroup = (currentGroup: string) => {
    setEditingDetailGroup(true)
    setTempDetailGroup(currentGroup)
  }

  const handleSaveDetailGroup = () => {
    if (tempDetailGroup.trim() !== (userDetailsData?.groupId || '')) {
      // Update user's group
      updateUserMutation.mutate({
        id: selectedUser.id,
        userData: { groupId: tempDetailGroup.trim() }
      })
    }
    setEditingDetailGroup(false)
    setTempDetailGroup('')
  }

  const handleBlurDetailGroup = () => {
    if (tempDetailGroup.trim() !== (userDetailsData?.groupId || '')) {
      // Update user's group
      updateUserMutation.mutate({
        id: selectedUser.id,
        userData: { groupId: tempDetailGroup.trim() }
      })
    }
    setEditingDetailGroup(false)
    setTempDetailGroup('')
  }

  const handleConnectExistingUserToStremio = (user: any) => {
    // Set the user ID and pre-fill email, then open the connect modal
    setEditingUser(user)
    setStremioEmail(user.stremioEmail || user.email || '')
    setShowConnectModal(true)
  }


  // User-defined protected addons, persisted per user (by manifestUrl) — now from database
  const [userProtectedSet, setUserProtectedSet] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (userDetailsData?.protectedAddons) {
      setUserProtectedSet(new Set(userDetailsData.protectedAddons))
    } else {
      setUserProtectedSet(new Set())
    }
  }, [userDetailsData?.protectedAddons])

  // Update global sets when userDetailsData changes
  useEffect(() => {
    if (userDetailsData?.id) {
      const uid = userDetailsData.id
      
      // Update excluded addons
      setGlobalUserExcludedSets(prev => {
        const newMap = new Map(prev)
        newMap.set(uid, userExcludedSet)
        return newMap
      })
      
      // Update protected addons
      setGlobalUserProtectedSets(prev => {
        const newMap = new Map(prev)
        newMap.set(uid, userProtectedSet)
        return newMap
      })
    }
  }, [userDetailsData?.id, userExcludedSet, userProtectedSet])

  const toggleUserProtected = (manifestUrl?: string) => {
    if (!manifestUrl) return
    
    // In unsafe mode, allow toggling protection for any addon
    if (deleteMode === 'unsafe') {
      // No restrictions in unsafe mode
    } else {
      // Safe mode: check if this is a Stremio-protected addon (built-in/system)
      const isStremioProtected = protectedAddonIds.some(id => manifestUrl.includes(id)) ||
                                protectedManifestUrls.some(url => manifestUrl.includes(url))
      
      // In safe mode, only allow toggling user-protected addons, not Stremio-protected ones
      if (isStremioProtected) {
        toast.error('Cannot toggle protection for Stremio-protected addons in safe mode. Enable unsafe mode in settings.')
        return
      }
    }
    
    const uid = selectedUser?.id
    if (!uid) return
    setUserProtectedSet((prev) => {
      const next = new Set(prev)
      const key = manifestUrl
      if (next.has(key)) next.delete(key)
      else next.add(key)
      
      // Update database
      fetch(`/api/users/${uid}/protected-addons`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ protectedAddons: Array.from(next) })
      }).then(() => {
        // Update global sets for this user
        setGlobalUserProtectedSets(prev => {
          const newMap = new Map(prev)
          newMap.set(uid, next)
          return newMap
        })
        
        // Invalidate queries to update sync badges
        queryClient.invalidateQueries({ queryKey: ['user', uid] })
        queryClient.invalidateQueries({ queryKey: ['user', uid, 'stremio-addons'] })
      }).catch(error => console.error('Failed to update protected addons:', error))
      
      // Update global state for all users
      setGlobalUserProtectedSets(prev => {
        const newGlobal = new Map(prev)
        newGlobal.set(uid, next)
        return newGlobal
      })
      
      // Invalidate user queries to update sync badges in general view
      queryClient.invalidateQueries({ queryKey: ['user', uid] })
      queryClient.invalidateQueries({ queryKey: ['users'] })
      // Invalidate Stremio addons query to update sync status immediately
      queryClient.invalidateQueries({ queryKey: ['user', uid, 'stremio-addons'] })
      
      return next
    })
  }



  // Delete Stremio addon mutation
  const deleteStremioAddonMutation = useMutation({
    mutationFn: async ({ userId, addonId }: { userId: string; addonId: string }) => {
      const encodedAddonId = encodeURIComponent(addonId)
      const res = await fetch(`/api/users/${userId}/stremio-addons/${encodedAddonId}`, { method: 'DELETE' })
      // Treat 200/204 as success; don't require a JSON body
      if (res.status === 200 || res.status === 204) return { ok: true }
      const text = await res.text().catch(() => '')
      const err: any = new Error(text || `HTTP ${res.status}`)
      err.status = res.status
      throw err
    },
    // Optimistic UI update to avoid stale item lingering if proxy returns 502
    onMutate: async ({ userId, addonId }) => {
      await queryClient.cancelQueries({ queryKey: ['user', userId, 'stremio-addons'] })
      const prev = queryClient.getQueryData<any>(['user', userId, 'stremio-addons'])
      if (prev && Array.isArray(prev.addons)) {
        const next = { ...prev, addons: prev.addons.filter((a: any) => (a?.manifestUrl || a?.transportUrl || a?.url) !== addonId) }
        queryClient.setQueryData(['user', userId, 'stremio-addons'], next)
      }
      // Immediately set to unsynced - any change means unsynced
      try {
        localStorage.setItem(`sfm_user_sync_status:${userId}`, 'unsynced')
        console.log('Dispatching sfm:user-status event for userId:', userId, 'status: unsynced')
        window.dispatchEvent(new CustomEvent('sfm:user-status' as any, { detail: { userId, status: 'unsynced' } }))
      } catch {}
      return { prev }
    },
    onSuccess: () => {},
    onError: (error: any, vars, context) => {
      // Only rollback on definitive server errors; ignore proxy/transport glitches
      const isTransport = !error?.status || error?.status === 502
      if (!isTransport && context?.prev) {
        queryClient.setQueryData(['user', selectedUser?.id, 'stremio-addons'], context.prev)
        toast.error(error?.message || 'Failed to delete addon')
      }
    },
    onSettled: (data, error, variables) => {
      // After any change, invalidate queries to trigger re-evaluation
      console.log('Delete operation settled, invalidating queries for userId:', variables.userId)
      queryClient.invalidateQueries({ queryKey: ['user', variables.userId, 'stremio-addons'] })
      queryClient.invalidateQueries({ queryKey: ['user', variables.userId] })
      // Don't dispatch checking status - let the normal sync evaluation handle it
    },
  })

  const handleDeleteStremioAddon = (addonId: string, addonName: string) => {
    // In unsafe mode, allow deletion of any addon
    if (deleteMode === 'unsafe') {
      // No restrictions in unsafe mode
    } else {
      // Safe mode: check if this is a protected addon
      const isStremioProtected = protectedAddonIds.some(id => addonId.includes(id)) || 
                                protectedManifestUrls.some(url => addonId.includes(url))
      const isUserProtected = userProtectedSet.has(addonId)
      const isProtected = isStremioProtected || isUserProtected
      
      if (isProtected) {
        toast.error('Cannot delete protected addon in safe mode. Enable unsafe mode in settings to delete protected addons.')
        return
      }
    }
    
    openConfirm({
      title: 'Remove addon?',
      description: `Remove the addon "${addonName}" from this Stremio account?`,
      isDanger: true,
      onConfirm: () => deleteStremioAddonMutation.mutate({
        userId: selectedUser.id,
        addonId: addonId
      })
    })
  }

  // Validate Stremio credentials when email/password changes
  const validateStremioCredentials = async (email: string, password: string) => {
    // If both fields are empty, user isn't changing credentials - allow update
    if (!email && !password) {
      setIsStremioValid(true)
      setStremioValidationError(null)
      return
    }

    // If only one field is provided, require both for validation
    if (!email || !password) {
      setIsStremioValid(false)
      setStremioValidationError('Both email and password are required when updating Stremio credentials')
      return
    }

    setIsValidatingStremio(true)
    setStremioValidationError(null)

    try {
      const response = await fetch('/api/stremio/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      
      const result = await response.json()
      
      if (response.ok && result.valid) {
        setIsStremioValid(true)
        setStremioValidationError(null)
      } else {
        setIsStremioValid(false)
        setStremioValidationError(result.error || 'Invalid Stremio credentials')
      }
    } catch (error) {
      setIsStremioValid(false)
      setStremioValidationError('Failed to validate credentials')
    } finally {
      setIsValidatingStremio(false)
    }
  }

  // Check if user is changing credentials from original values
  const originalEmail = editUserDetails?.stremioEmail || editUserDetails?.email || ''
  const isEmailChanged = editFormData.email.trim() !== '' && editFormData.email !== originalEmail
  const isPasswordChanged = editFormData.password.trim() !== ''
  const isChangingCredentials = isEmailChanged || isPasswordChanged

  // Debounce validation only when user is actually changing credentials
  React.useEffect(() => {
    if (isChangingCredentials && editFormData.email && editFormData.password) {
      const timer = setTimeout(() => {
        validateStremioCredentials(editFormData.email, editFormData.password)
      }, 1000)
      return () => clearTimeout(timer)
    } else if (!isChangingCredentials) {
      // Not changing credentials, so validation is not needed
      setIsStremioValid(true)
      setStremioValidationError(null)
      setIsValidatingStremio(false)
    } else if (isChangingCredentials && (!editFormData.email || !editFormData.password)) {
      // Changing credentials but missing email or password
      setIsStremioValid(false)
      setStremioValidationError('Both email and password are required when updating Stremio credentials')
      setIsValidatingStremio(false)
    }
  }, [editFormData.email, editFormData.password, isChangingCredentials, originalEmail])

  const handleUpdateUser = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingUser) return

    // Don't allow update if Stremio credentials are invalid
    if (!isStremioValid) {
      toast.error('Please fix Stremio credential errors before updating')
      return
    }

    // Clean up the data - only send non-empty values
    const userData: any = {}
    
    if (editFormData.username.trim()) {
      userData.username = editFormData.username.trim()
    }
    
    if (editFormData.email.trim()) {
      userData.email = editFormData.email.trim()
    }
    
    if (editFormData.password.trim()) {
      userData.password = editFormData.password.trim()
    }
    
    // Always send groupId (even if empty) to handle group removal
    userData.groupId = editFormData.groupName.trim()
    
    updateUserMutation.mutate({
      id: editingUser.id,
      userData
    })
  }

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false)
    setEditingUser(null)
    setEditFormData({ username: '', email: '', password: '', groupName: '' })
    setIsStremioValid(true)
    setStremioValidationError(null)
    setIsValidatingStremio(false)
  }

  // Ensure displayUsers is always an array
  const displayUsers = useMemo(() => {
    return Array.isArray(filteredUsers) ? filteredUsers : []
  }, [filteredUsers])

  // Handle view mode change and persist to localStorage
  const handleViewModeChange = (mode: 'card' | 'list') => {
    setViewMode(mode)
    if (typeof window !== 'undefined') {
      localStorage.setItem('global-view-mode', mode)
    }
  }

  // Close modals on Escape
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showConnectModal) setShowConnectModal(false)
        if (isEditModalOpen) setIsEditModalOpen(false)
        if (isDetailModalOpen) setIsDetailModalOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showConnectModal, isEditModalOpen, isDetailModalOpen])

  // Local state to manage drag-and-drop addon order
  const [addonOrder, setAddonOrder] = useState<string[]>([])
  const draggingIdRef = React.useRef<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const justReorderedRef = React.useRef(false)
  
  // Touch drag and drop refs
  const touchStartPos = React.useRef<{ x: number; y: number } | null>(null)
  const touchStartIndex = React.useRef<number | null>(null)
  const isTouchDragging = React.useRef(false)

  // Create preview order that shows the dragged item in its new position
  const previewOrder = React.useMemo(() => {
    if (!isDragging || !draggingIdRef.current || dragOverIndex === null) return addonOrder
    
    const fromId = draggingIdRef.current
    const currentIndex = addonOrder.indexOf(fromId)
    if (currentIndex === -1 || currentIndex === dragOverIndex) return addonOrder
    
    const next = [...addonOrder]
    // Move the dragged item to the target position
    const [moved] = next.splice(currentIndex, 1)
    next.splice(dragOverIndex, 0, moved)
    
    return next
  }, [isDragging, draggingIdRef.current, dragOverIndex, addonOrder])

  // Use preview order while dragging, otherwise use current order
  const orderAddons = React.useCallback((arr: any[]) => {
    const orderToUse = isDragging ? previewOrder : addonOrder
    const pos = new Map(orderToUse.map((u, i) => [u, i]))
    const mapIdForAddon = (addon: any) => (addon.manifestUrl || addon.transportUrl || addon.url || '').toString().trim()
    return [...arr].sort((a, b) => (pos.get(mapIdForAddon(a)) ?? 1e9) - (pos.get(mapIdForAddon(b)) ?? 1e9))
  }, [isDragging, previewOrder, addonOrder])

  // Initialize/refresh local addon order whenever detail modal opens or live addons change
  React.useEffect(() => {
    if (!isDetailModalOpen) return
    const liveAll = Array.isArray(stremioAddonsData?.addons) ? stremioAddonsData.addons : []
    
    // Preserve the original order from Stremio instead of separating protected/unprotected
    const urls = liveAll.map((a: any) => (a.manifestUrl || a.transportUrl || a.url || '').toString().trim())
    
    // Only update addonOrder if it's empty, not dragging, and we haven't just reordered
    // This prevents the UI from reverting during drag operations or immediately after reorders
    if (addonOrder.length === 0 || (!isDragging && !justReorderedRef.current)) {
      setAddonOrder(urls)
    }
    
    // Reset the reorder flag after a short delay
    if (justReorderedRef.current) {
      setTimeout(() => {
        justReorderedRef.current = false
      }, 1000)
    }
  }, [isDetailModalOpen, selectedUser?.id, stremioAddonsData, isDragging])

  const reorderMutation = useMutation({
    mutationFn: async (orderedManifestUrls: string[]) => {
      if (!selectedUser?.id) throw new Error('No user selected')
      const res = await fetch(`/api/users/${selectedUser.id}/stremio-addons/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedManifestUrls })
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || 'Failed to reorder addons')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Addon order updated')
      // Small delay to ensure backend has processed the change
      setTimeout(() => {
        if (selectedUser?.id) {
          queryClient.invalidateQueries({ queryKey: ['user', selectedUser.id, 'stremio-addons'] })
          queryClient.invalidateQueries({ queryKey: ['user', selectedUser.id, 'sync-status'] })
          queryClient.invalidateQueries({ queryKey: ['users'] })
        }
      }, 500)
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to update addon order')
    }
  })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } })
  )
  const [activeId, setActiveId] = useState<string | null>(null)
  const SortableAddon: React.FC<{ id: string; index: number; children: React.ReactNode }> = ({ id, index, children }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : undefined,
    } as React.CSSProperties
  return (
      <div ref={setNodeRef} style={style} data-addon-index={index} {...attributes} {...listeners}>
        {children}
      </div>
    )
  }
  const [isDndActive, setIsDndActive] = React.useState(false)
  const handleDragStartDnd = (event: any) => {
    setActiveId(event.active?.id || null)
    setIsDndActive(true)
    try { document.body.style.overflow = 'hidden' } catch {}
  }
  const handleDragEndDnd = (event: any) => {
    const { active, over } = event
    setActiveId(null)
    setIsDndActive(false)
    try { document.body.style.overflow = '' } catch {}
    if (!active?.id || !over?.id || active.id === over.id) return
    const from = addonOrder.indexOf(active.id)
    const to = addonOrder.indexOf(over.id)
    if (from === -1 || to === -1) return
    const next = [...addonOrder]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setAddonOrder(next)
    reorderMutation.mutate(next)
  }

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-4">
          <div>
            <h1 className={`hidden sm:block text-xl sm:text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Users</h1>
            <p className={`text-sm sm:text-base ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Manage Stremio users for your group</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <button
              onClick={() => syncAllUsersMutation.mutate()}
              disabled={syncAllUsersMutation.isPending || users.length === 0}
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
              <RefreshCw className={`w-4 h-4 sm:w-5 sm:h-5 mr-2 ${syncAllUsersMutation.isPending ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{syncAllUsersMutation.isPending ? 'Syncing...' : 'Sync All Users'}</span>
              <span className="sm:hidden">{syncAllUsersMutation.isPending ? 'Syncing...' : 'Sync All'}</span>
            </button>
          <button
            onClick={() => setShowConnectModal(true)}
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
              <Link className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
              <span className="hidden sm:inline">Connect Stremio User</span>
              <span className="sm:hidden">Connect User</span>
          </button>
        </div>
        </div>
        {/* Search and View Toggle */}
        <div className="flex flex-row items-center gap-4">
          <div className="relative flex-1">
            <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full pl-9 sm:pl-10 pr-4 py-2 sm:py-3 border rounded-lg focus:ring-2 focus:ring-stremio-purple focus:border-transparent text-sm sm:text-base ${
                isDark 
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              }`}
            />
          </div>
          
          {/* View Mode Toggle */}
          {mounted && (
            <div className="flex items-center">
              <div className={`flex rounded-lg border ${isMono ? 'border-white/20' : (isDark ? 'border-gray-600' : 'border-gray-300')}`}>
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
                        : isDark
                        ? 'bg-purple-600 text-white'
                        : 'bg-stremio-purple text-white'
                      : isMono
                        ? 'text-white/70 hover:bg-white/10'
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
                        : isDark
                        ? 'bg-purple-600 text-white'
                        : 'bg-stremio-purple text-white'
                      : isMono
                        ? 'text-white/70 hover:bg-white/10'
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

      {/* Controls removed per request */}

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-stremio-purple"></div>
          <span className={`ml-3 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>Loading users...</span>
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
          }`}>Unable to load users</h3>
          <p className={`${
            isMono ? 'text-white/70' : isDark ? 'text-gray-400' : 'text-gray-600'
          }`}>
            Make sure the backend server is running on port 4000
          </p>
          <button 
            onClick={() => queryClient.invalidateQueries({ queryKey: ['users'] })}
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

      {/* Users Display */}
      {!isLoading && !error && (
        <>
          {viewMode === 'card' ? (
            /* Card Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch">
          {displayUsers.map((user: any) => (
            <div key={user.id} className={`rounded-lg shadow-sm border p-6 hover:shadow-md transition-shadow flex flex-col h-full ${
              isModern
                ? 'bg-gradient-to-br from-purple-50/90 to-blue-50/90 backdrop-blur-sm border-purple-200/60'
                : isModernDark
                ? 'bg-gradient-to-br from-purple-800/40 to-blue-800/40 backdrop-blur-sm border-purple-600/50'
                : isDark 
                ? 'bg-gray-800 border-gray-700' 
                : 'bg-white border-gray-200'
                } ${!user.isActive ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    isMono
                      ? 'bg-black border border-white/20 text-white'
                      : isModern
                      ? 'bg-gradient-to-br from-purple-600 to-blue-800 text-white'
                      : isModernDark
                      ? 'bg-gradient-to-br from-purple-800 to-blue-900 text-white'
                      : getUserColorClass(user?.colorIndex)
                  }`}>
                        <span className="text-white font-semibold text-lg">
                          {user.username ? user.username.charAt(0).toUpperCase() : 
                           user.email ? user.email.charAt(0).toUpperCase() : 'U'}
                        </span>
                  </div>
                      <div className="ml-3">
                    {editingUsername === user.id ? (
                          <div>
                        <input
                          type="text"
                          value={tempUsername}
                          onChange={(e) => setTempUsername(e.target.value)}
                          onBlur={() => handleBlurUsername(user.id, user.username || user.email)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleSaveUsername(user.id, user.username || user.email)
                            } else if (e.key === 'Escape') {
                              setEditingUsername(null)
                              setTempUsername('')
                            }
                          }}
                          placeholder={user.username || user.email}
                          className={`px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-stremio-purple focus:border-transparent ${
                            isDark 
                              ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                              : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                          }`}
                          autoFocus
                        />
                            <div className="mt-1 mb-0">
                              <UserSyncBadge 
                                userId={user.id} 
                                userExcludedSet={globalUserExcludedSets.get(user.id) || new Set()} 
                                userProtectedSet={globalUserProtectedSets.get(user.id) || new Set()} 
                                isSyncing={false}
                              />
                            </div>
                      </div>
                    ) : (
                          <div>
                        <h3 
                          className={`font-medium cursor-pointer transition-colors ${
                            isModern ? 'text-purple-800 hover:text-purple-900' : isModernDark ? 'text-purple-200 hover:text-purple-100' : (isDark ? 'text-white hover:text-stremio-purple' : 'text-gray-900 hover:text-stremio-purple')
                          }`}
                          onClick={() => handleStartEditUsername(user.id, user.username || user.email)}
                          title="Click to edit username"
                        >
                          {user.username || user.email}
                        </h3>
                            <div className="mt-1 mb-0">
                              <UserSyncBadge 
                                userId={user.id} 
                                userExcludedSet={globalUserExcludedSets.get(user.id) || new Set()} 
                                userProtectedSet={globalUserProtectedSets.get(user.id) || new Set()} 
                                isSyncing={false}
                              />
                            </div>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleUserStatus(user.id, user.isActive)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          user.isActive ? 'bg-stremio-purple' : (isDark ? 'bg-gray-700' : 'bg-gray-300')
                    }`}
                        aria-pressed={user.isActive}
                        title={user.isActive ? 'Click to disable' : 'Click to enable'}
                  >
                    <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                        user.isActive ? 'translate-x-5' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

                  <div className="grid grid-cols-2 gap-4 mb-4 items-start">
                    <div className="flex items-center">
                      <Puzzle className="w-4 h-4 text-gray-400 mr-2" />
                      <div>
                        <p className={`text-lg font-semibold ${
                          isModern ? 'text-purple-100' : isModernDark ? 'text-purple-100' : (isDark ? 'text-white' : 'text-gray-900')
                        }`}>
                          {user.stremioAddonsCount || 0}
                        </p>
                        <p className={`text-xs ${
                          isModern ? 'text-purple-300' : isModernDark ? 'text-purple-300' : (isDark ? 'text-gray-400' : 'text-gray-500')
                        }`}>Addons</p>
                </div>
                </div>
                    <div className="flex items-center">
                      <Users className="w-4 h-4 text-gray-400 mr-2" />
                      <p className={`text-lg font-semibold ${
                        isModern ? 'text-purple-100' : isModernDark ? 'text-purple-100' : (isDark ? 'text-white' : 'text-gray-900')
                      }`}>
                        {user.groupName || 'No group'}
                      </p>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleViewUserDetails(user)}
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
                <button
                  onClick={() => importUserAddonsMutation.mutate(user.id)}
                  disabled={importUserAddonsMutation.isPending}
                  className={`flex items-center justify-center px-3 py-2 h-8 min-h-8 max-h-8 text-sm rounded transition-colors disabled:opacity-50 ${
                    isModern
                      ? 'bg-gradient-to-br from-purple-100 to-blue-100 text-purple-800 hover:from-purple-200 hover:to-blue-200'
                      : isModernDark
                      ? 'bg-gradient-to-br from-purple-800 to-blue-800 text-purple-100 hover:from-purple-700 hover:to-blue-700'
                      : isMono
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  }`}
                  title="Import user's addons to a new group"
                >
                  {importUserAddonsMutation.isPending ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                </button>
                <button
                  onClick={() => reloadUserAddonsMutation.mutate(user.id)}
                  disabled={reloadUserAddonsMutation.isPending && reloadUserAddonsMutation.variables === user.id}
                  className={`flex items-center justify-center px-3 py-2 h-8 min-h-8 max-h-8 text-sm rounded transition-colors disabled:opacity-50 ${
                    isModern
                      ? 'bg-gradient-to-br from-green-100 to-green-200 text-green-800 hover:from-green-200 hover:to-green-300'
                      : isModernDark
                      ? 'bg-gradient-to-br from-green-800 to-green-900 text-green-100 hover:from-green-700 hover:to-green-800'
                      : isMono
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      : 'bg-green-100 text-green-700 hover:bg-green-200'
                  }`}
                  title="Reload user addons"
                >
                      <RefreshCw className={`w-4 h-4 ${reloadUserAddonsMutation.isPending && reloadUserAddonsMutation.variables === user.id ? 'animate-spin' : ''}`} />
                </button>
                <button 
                  onClick={() => handleDeleteUser(user.id, user.username)}
                  disabled={deleteUserMutation.isPending}
                  className={`flex items-center justify-center px-3 py-2 h-8 min-h-8 max-h-8 text-sm rounded transition-colors disabled:opacity-50 ${
                    isModern
                      ? 'bg-gradient-to-br from-purple-100 to-blue-100 text-purple-800 hover:from-purple-200 hover:to-blue-200'
                      : isModernDark
                      ? 'bg-gradient-to-br from-purple-800 to-blue-800 text-purple-100 hover:from-purple-700 hover:to-blue-700'
                      : isMono
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      : 'bg-red-100 text-red-700 hover:bg-red-200'
                  }`}
                >
                      <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
          ) : (
            /* List View */
            <div className="space-y-3">
              {displayUsers.map((user: any) => (
                <div
                  key={user.id}
                  className={`rounded-lg border p-4 hover:shadow-md transition-shadow cursor-pointer ${
                  isDark 
                    ? 'bg-gray-800 border-gray-700' 
                    : 'bg-white border-gray-200'
                } ${!user.isActive ? 'opacity-50' : ''}`}
                  onClick={() => handleViewUserDetails(user)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center flex-1 min-w-0">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 flex-shrink-0 ${
                        isMono ? 'bg-black border border-white/20 text-white' : getUserColorClass(user?.colorIndex)
                      }`}>
                        <span className="text-white font-semibold text-sm">
                          {user.username ? user.username.charAt(0).toUpperCase() : 
                           user.email ? user.email.charAt(0).toUpperCase() : 'U'}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className={`font-semibold truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                            {user.username || user.email}
                          </h3>
                          <UserSyncBadge 
                            userId={user.id} 
                            userExcludedSet={globalUserExcludedSets.get(user.id) || new Set()} 
                            userProtectedSet={globalUserProtectedSets.get(user.id) || new Set()} 
                            isSyncing={false}
                            isListMode={true}
                          />
                        </div>
                        {/* Mobile stats */}
                        <div className="flex min-[480px]:hidden items-center gap-3 text-sm mt-1">
                          <div className="flex items-center gap-1">
                            <Puzzle className="w-3 h-3 text-gray-400" />
                            <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                              {user.stremioAddonsCount || 0}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Users className="w-3 h-3 text-gray-400" />
                            <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                              {user.groupName || 'No group'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {/* Desktop stats */}
                      <div className="hidden min-[480px]:flex items-center gap-4 text-sm mr-3">
                        <div className="flex items-center gap-1">
                          <Puzzle className="w-4 h-4 text-gray-400" />
                          <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{user.stremioAddonsCount || 0}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Users className="w-4 h-4 text-gray-400" />
                          <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{user.groupName || 'No group'}</span>
                        </div>
                      </div>
                      
                      {/* Enable/Disable toggle */}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleToggleUserStatus(user.id, user.isActive) }}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          user.isActive ? (isMono ? 'bg-white/30 border border-white/20' : 'bg-stremio-purple') : (isMono ? 'bg-white/15 border border-white/20' : (isDark ? 'bg-gray-700' : 'bg-gray-300'))
                        }`}
                        aria-pressed={user.isActive}
                        title={user.isActive ? 'Click to disable' : 'Click to enable'}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            user.isActive ? 'translate-x-4' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                      
                      {/* Action buttons */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); importUserAddonsMutation.mutate(user.id) }}
                          disabled={importUserAddonsMutation.isPending}
                          className={`flex items-center justify-center h-8 w-8 text-sm rounded transition-colors disabled:opacity-50 focus:outline-none ${
                            isDark ? 'text-gray-300 hover:text-blue-400' : 'text-gray-600 hover:text-blue-600'
                          }`}
                          title="Import user's addons to a new group"
                        >
                          {importUserAddonsMutation.isPending ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); reloadUserAddonsMutation.mutate(user.id) }}
                          disabled={reloadUserAddonsMutation.isPending}
                          className={`flex items-center justify-center h-8 w-8 text-sm rounded transition-colors disabled:opacity-50 focus:outline-none ${
                            isDark ? 'text-gray-300 hover:text-green-400' : 'text-gray-600 hover:text-green-600'
                          }`}
                          title="Reload user addons"
                        >
                          <RefreshCw className={`w-4 h-4 ${reloadUserAddonsMutation.isPending ? 'animate-spin' : ''}`} />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDeleteUser(user.id, user.username) }}
                          disabled={deleteUserMutation.isPending}
                          className={`flex items-center justify-center h-8 w-8 text-sm rounded transition-colors disabled:opacity-50 focus:outline-none ${
                            isDark ? 'text-gray-300 hover:text-red-400' : 'text-gray-600 hover:text-red-600'
                          }`}
                          title="Delete user"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
              </div>
            </div>
          ))}
        </div>
          )}
        </>
      )}

      {/* Empty State */}
      {!isLoading && !error && displayUsers.length === 0 && (
        <div className="text-center py-12">
          <UserCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className={`text-lg font-medium mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            {debouncedSearchTerm ? 'No users found' : 'No users yet'}
          </h3>
          <p className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            {debouncedSearchTerm 
              ? 'Try adjusting your search criteria' 
              : 'Start by connecting your first Stremio user'
            }
          </p>
          {!debouncedSearchTerm && (
            <div className="mt-6">
            <button
              onClick={() => setShowConnectModal(true)}
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
                <span className="hidden sm:inline">Connect Your First User</span>
                <span className="sm:hidden">Connect User</span>
            </button>
            </div>
          )}
        </div>
      )}

      {/* Connect Stremio User Modal */}
      {showConnectModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowConnectModal(false)
            }
          }}
        >
          <div className={`w-full max-w-md rounded-lg shadow-lg ${
            isDark ? 'bg-gray-800' : 'bg-white'
          }`}>
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {editingUser ? `Connect ${editingUser.username} to Stremio` : 'Connect Stremio User'}
              </h3>
              <button
                onClick={() => {
                  setShowConnectModal(false)
                  setStremioEmail('')
                  setStremioPassword('')
                  setStremioUsername('')
                  setSelectedGroup('')
                  setNewGroupName('')
                  setEditingUser(null)
                }}
                className={`w-8 h-8 flex items-center justify-center rounded transition-colors border-0 ${
                  isDark ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                }`}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleConnectStremio} className="p-6 space-y-4">
              {/* Auth method toggle */}
              <div className="w-full mb-2 flex justify-center">
                <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
                  <button
                    type="button"
                    onClick={() => setAuthMode('email')}
                    className={`w-full py-2 text-sm font-medium rounded-md border ${authMode==='email' ? 'bg-stremio-purple text-white border-stremio-purple' : (isDark ? 'text-gray-300 border-gray-600' : 'text-gray-700 border-gray-300')}`}
                  >
                    Email & Password
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthMode('authkey')}
                    className={`w-full py-2 text-sm font-medium rounded-md border ${authMode==='authkey' ? 'bg-stremio-purple text-white border-stremio-purple' : (isDark ? 'text-gray-300 border-gray-600' : 'text-gray-700 border-gray-300')}`}
                  >
                    Auth Key
                  </button>
                </div>
              </div>
              {!editingUser && (
                <div>
                  <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    Username *
                  </label>
                  <input
                    type="text"
                    value={stremioUsername}
                    onChange={(e) => setStremioUsername(e.target.value)}
                    placeholder="Enter username"
                    required
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-stremio-purple focus:border-transparent ${
                      isDark 
                        ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                    }`}
                  />
                </div>
              )}
              {authMode === 'email' ? (
                <>
              <div>
                <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Stremio Email *
                </label>
                <input
                  type="email"
                  value={stremioEmail}
                  onChange={(e) => setStremioEmail(e.target.value)}
                  placeholder="your@stremio-email.com"
                  required
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-stremio-purple focus:border-transparent ${
                    isDark 
                      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                  }`}
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Stremio Password *
                </label>
                <input
                  type="password"
                  value={stremioPassword}
                  onChange={(e) => setStremioPassword(e.target.value)}
                  placeholder="Your Stremio password"
                  required
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-stremio-purple focus:border-transparent ${
                    isDark 
                      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                  }`}
                />
              </div>
                </>
              ) : (
                <div>
                  <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    Stremio Auth Key *
                  </label>
                  <input
                    type="text"
                    value={stremioAuthKey}
                    onChange={(e) => setStremioAuthKey(e.target.value)}
                    placeholder="Paste your auth key"
                    required
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-stremio-purple focus:border-transparent ${
                      isDark 
                        ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                    }`}
                  />
                  <div className={`mt-1 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Go to{' '}
                    <a href="https://web.stremio.com/" target="_blank" rel="noreferrer" className="underline text-stremio-purple">web.stremio.com</a>
                    , open the console and paste{' '}
                    <button
                      type="button"
                      onClick={() => {
                        const snippet = 'JSON.parse(localStorage.getItem("profile")).auth.key'
                        try { navigator.clipboard.writeText(snippet); toast.success('Snippet copied') } catch {}
                      }}
                      className={`underline text-stremio-purple hover:opacity-80`}
                      title="Click to copy snippet"
                    >
                      this
                    </button>
                    .
                  </div>
                </div>
              )}
              {!editingUser && (
                <>
                  <div>
                    <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                      Assign to Group
                    </label>
                    <select
                      value={selectedGroup}
                      onChange={(e) => setSelectedGroup(e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-stremio-purple focus:border-transparent ${
                        isDark 
                          ? 'bg-gray-700 border-gray-600 text-white' 
                          : 'bg-white border-gray-300 text-gray-900'
                      }`}
                    >
                      <option value="">No group</option>
                      {groups.map((group: any) => (
                        <option key={group.id} value={group.name}>
                          {group.name}
                        </option>
                      ))}
                      <option value="new">+ Create new group</option>
                    </select>
                  </div>
                  {selectedGroup === 'new' && (
                    <div>
                      <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        New Group Name
                      </label>
                      <input
                        type="text"
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        placeholder="Enter group name"
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-stremio-purple focus:border-transparent ${
                          isDark 
                            ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                            : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                        }`}
                      />
                    </div>
                  )}
                </>
              )}
              <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                We'll securely connect to your Stremio account and sync your addons
              </p>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowConnectModal(false)
                    setStremioEmail('')
                    setStremioPassword('')
                    setStremioUsername('')
                    setSelectedGroup('')
                    setNewGroupName('')
                  }}
                  disabled={connectStremioMutation.isPending}
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
                  disabled={connectStremioMutation.isPending}
                  className={`flex-1 px-4 py-2 text-white rounded-lg transition-colors disabled:opacity-50 ${
                    isModern
                      ? 'bg-gradient-to-br from-purple-600 via-purple-700 to-blue-800 hover:from-purple-700 hover:via-purple-800 hover:to-blue-900'
                      : isModernDark
                      ? 'bg-gradient-to-br from-purple-800 via-purple-900 to-blue-900 hover:from-purple-900 hover:via-purple-950 hover:to-indigo-900'
                      : 'bg-stremio-purple hover:bg-purple-700'
                  }`}
                >
                  {connectStremioMutation.isPending ? 'Connecting...' : 'Connect to Stremio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {isEditModalOpen && editingUser && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsEditModalOpen(false)
            }
          }}
        >
          <div className={`w-full max-w-2xl max-h-[90vh] ${isDndActive ? 'overflow-hidden' : 'overflow-y-auto'} rounded-lg shadow-xl ${
            isDark ? 'bg-gray-800' : 'bg-white'
          }`}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Edit User: {editingUser.username}
                </h2>
                <button
                  onClick={handleCloseEditModal}
                  className={`w-8 h-8 flex items-center justify-center rounded transition-colors border-0 ${
                    isDark ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleUpdateUser} className="space-y-4">
                <div>
                  <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    Username
                  </label>
                  <input
                    type="text"
                    value={editFormData.username}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, username: e.target.value }))}
                    placeholder={editingUser?.username || editingUser?.stremioUsername || ''}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-stremio-purple focus:border-transparent ${
                      isDark 
                        ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                    }`}
                  />
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    Email
                  </label>
                  <input
                    type="email"
                    value={editFormData.email}
                    onChange={(e) => {
                      setEditFormData(prev => ({ ...prev, email: e.target.value }))
                      setIsStremioValid(true) // Reset validation when typing
                      setStremioValidationError(null)
                    }}
                    placeholder={editingUser?.email || editingUser?.stremioEmail || ''}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-stremio-purple focus:border-transparent ${
                      !isStremioValid && (editFormData.email || editFormData.password)
                        ? 'border-red-500 focus:ring-red-500'
                        : isDark 
                          ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                          : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                    }`}
                  />
                  {stremioValidationError && isChangingCredentials && (
                    <p className="mt-1 text-sm text-red-600">{stremioValidationError}</p>
                  )}
                  {isValidatingStremio && (
                    <p className="mt-1 text-sm text-blue-600">Validating Stremio credentials...</p>
                  )}
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    Password (leave empty to keep current)
                  </label>
                  <input
                    type="password"
                    value={editFormData.password}
                    onChange={(e) => {
                      setEditFormData(prev => ({ ...prev, password: e.target.value }))
                      setIsStremioValid(true) // Reset validation when typing
                      setStremioValidationError(null)
                    }}

                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-stremio-purple focus:border-transparent ${
                      !isStremioValid && (editFormData.email || editFormData.password)
                        ? 'border-red-500 focus:ring-red-500'
                        : isDark 
                          ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                          : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                    }`}
                  />
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    Group
                  </label>
                  <select
                    value={editFormData.groupName}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, groupName: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-stremio-purple focus:border-transparent ${
                      isDark 
                        ? 'bg-gray-700 border-gray-600 text-white' 
                        : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  >
                    <option value="">No group</option>
                    {groups.map((group: any) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* User's Addons Section */}
                {editUserDetails && (editUserDetails as any).addons && (editUserDetails as any).addons.length > 0 && (
                  <div>
                    <h3 className={`text-lg font-semibold mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      User's Addons ({(editUserDetails as any).addons.length})
                    </h3>
                    <div className="max-h-48 overflow-y-auto space-y-2">
                      {(editUserDetails as any).addons.map((addon: any, index: number) => (
                        <div key={index} className={`p-3 rounded-lg border ${
                          isDark ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'
                        }`}>
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                {addon.name || addon.manifest?.name || 'Unknown Addon'}
                              </h4>
                              {addon.manifest?.description && (
                                <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                                  {addon.manifest.description.length > 50 
                                    ? `${addon.manifest.description.substring(0, 50)}...` 
                                    : addon.manifest.description}
                                </p>
                              )}
                            </div>
                            <div className={`px-2 py-1 rounded text-xs font-medium ${
                              isDark ? 'bg-green-900 text-green-200' : 'bg-green-100 text-green-800'
                            }`}>
                              Active
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={handleCloseEditModal}
                    className={`flex-1 px-4 py-2 border rounded-lg transition-colors ${
                      isDark 
                        ? 'border-gray-600 text-gray-300 hover:bg-gray-700' 
                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={updateUserMutation.isPending || !isStremioValid || isValidatingStremio}
                    className={`flex-1 px-4 py-2 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      isModern
                        ? 'bg-gradient-to-br from-purple-600 via-purple-700 to-blue-800 hover:from-purple-700 hover:via-purple-800 hover:to-blue-900'
                        : isModernDark
                        ? 'bg-gradient-to-br from-purple-800 via-purple-900 to-blue-900 hover:from-purple-900 hover:via-purple-950 hover:to-indigo-900'
                        : 'bg-stremio-purple hover:bg-purple-700'
                    }`}
                  >
                    {updateUserMutation.isPending ? 'Updating...' : 
                     isValidatingStremio ? 'Validating...' :
                     !isStremioValid ? 'Fix Credentials First' : 'Update User'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* User Detail Modal */}
      {isDetailModalOpen && selectedUser && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsDetailModalOpen(false)
            }
          }}
        >
          <div className={`w-full max-w-4xl max-h-[90vh] ${isDndActive ? 'overflow-hidden' : 'overflow-y-auto'} rounded-lg shadow-xl ${
            isDark ? 'bg-gray-800' : 'bg-white'
          }`}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-start gap-4">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-4">
                      {editingDetailUsername === selectedUser.id ? (
                        <input
                          type="text"
                          value={tempDetailUsername}
                          onChange={(e) => setTempDetailUsername(e.target.value)}
                          onBlur={() => handleBlurDetailUsername(selectedUser.username || selectedUser.email)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleSaveDetailUsername(selectedUser.username || selectedUser.email)
                            } else if (e.key === 'Escape') {
                              setEditingDetailUsername(null)
                              setTempDetailUsername('')
                            }
                          }}
                          placeholder={selectedUser.username || selectedUser.email}
                          className={`px-2 py-1 text-xl font-bold border rounded focus:ring-2 focus:ring-stremio-purple focus:border-transparent ${
                            isDark 
                              ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                              : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                          }`}
                          autoFocus
                        />
                      ) : (
                        <h2 
                          className={`text-xl font-bold cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-2 py-1 rounded transition-colors ${isDark ? 'text-white' : 'text-gray-900'}`}
                          onClick={() => handleStartEditDetailUsername(selectedUser.username || selectedUser.email)}
                          title="Click to edit username"
                        >
                          {selectedUser.username || selectedUser.email}
                  </h2>
                      )}
                      {editingDetailGroup ? (
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-gray-400" />
                          <select
                            value={tempDetailGroup}
                            onChange={(e) => {
                              setTempDetailGroup(e.target.value)
                              // Immediately apply the change when a new group is selected
                              if (e.target.value !== (userDetailsData?.groupId || '')) {
                                updateUserMutation.mutate({
                                  id: selectedUser.id,
                                  userData: { groupId: e.target.value.trim() }
                                })
                                setEditingDetailGroup(false)
                                setTempDetailGroup('')
                              }
                            }}
                            onBlur={handleBlurDetailGroup}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleSaveDetailGroup()
                              } else if (e.key === 'Escape') {
                                setEditingDetailGroup(false)
                                setTempDetailGroup('')
                              }
                            }}
                            className={`px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-stremio-purple focus:border-transparent ${
                              isDark 
                                ? 'bg-gray-700 border-gray-600 text-white' 
                                : 'bg-white border-gray-300 text-gray-900'
                            }`}
                            autoFocus
                          >
                            <option value="">No group assigned</option>
                            {groups.map((group: any) => (
                              <option key={group.id} value={group.id}>
                                {group.name}
                              </option>
                            ))}
                          </select>
                </div>
                      ) : (
                        <div 
                          className="flex items-center gap-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-2 py-1 rounded transition-colors"
                          onClick={() => handleStartEditDetailGroup(userDetailsData?.groupId || '')}
                          title="Click to change group"
                        >
                          <Users className="w-4 h-4 text-gray-400" />
                          <span className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                            {userDetailsData?.groupName || 'No group assigned'}
                          </span>
                        </div>
                      )}
                    </div>
                    <p className={`text-sm mt-1 px-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      {hideSensitive ? '••••••••@••••' : selectedUser.email}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <UserSyncBadge 
                    userId={selectedUser.id} 
                    userExcludedSet={globalUserExcludedSets.get(selectedUser.id) || new Set()}
                    userProtectedSet={globalUserProtectedSets.get(selectedUser.id) || new Set()}
                    isSyncing={false}
                    location="detailed-view"
                  />
                <button
                  onClick={() => setIsDetailModalOpen(false)}
                  className={`w-8 h-8 flex items-center justify-center rounded transition-colors border-0 ${
                    isDark ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  ✕
                </button>
                </div>
              </div>

              {isLoadingDetails ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-stremio-purple"></div>
                </div>
              ) : userDetailsData ? (
                <div className="space-y-6">

                  {/* Group Addons (from user's group) */}
                  <div className={`p-4 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-gray-50'}`}>
                    <h3 className={`text-lg font-semibold mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      {userDetailsData?.groupName || 'No Group'} Addons ({userDetailsData.addons?.filter((addon: any) => addon.isEnabled !== false).length || 0})
                    </h3>
                    {userDetailsData.addons && userDetailsData.addons.length > 0 ? (
                      <div className="space-y-3">
                        {userDetailsData.addons
                          .filter((addon: any) => addon.isEnabled !== false)
                          .map((addon: any, index: number) => {
                          const excluded = userExcludedSet.has(addon?.manifestUrl)
                          // Get icon from Stremio addons data if available
                          const stremioAddon = Array.isArray(stremioAddonsData?.addons) 
                            ? stremioAddonsData.addons.find((sa: any) => 
                                (sa?.manifestUrl || '').toString().trim().toLowerCase() === (addon?.manifestUrl || '').toString().trim().toLowerCase()
                              ) 
                            : null
                          // Debug logging - focused on the issue
                          if (addon.name === 'AIOStreams') {
                            console.log('🔍 User AIOStreams Debug:', {
                              addonName: addon.name,
                              manifestUrl: addon?.manifestUrl,
                              iconUrl: addon.iconUrl,
                              finalIconUrl: addon.iconUrl || addon?.manifest?.logo || stremioAddon?.iconUrl || stremioAddon?.manifest?.logo,
                              hasStremioData: !!stremioAddon
                            })
                          }
                          
                          const iconUrl = addon.iconUrl || addon?.manifest?.logo || stremioAddon?.iconUrl || stremioAddon?.manifest?.logo
                          const addonName = addon.name || addon?.manifest?.name || stremioAddon?.name || stremioAddon?.manifest?.name || addon.id
                          return (
                          <div key={index} className={`p-3 rounded-lg border ${
                            isDark ? 'bg-gray-600 border-gray-500' : 'bg-white border-gray-200'
                          }`}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center flex-1 min-w-0">
                                  <div className="w-10 h-10 rounded-lg flex items-center justify-center mr-3 flex-shrink-0 overflow-hidden">
                                    {iconUrl ? (
                                      <img
                                        src={iconUrl}
                                        alt={`${addonName} logo`}
                                        className="w-full h-full object-contain"
                                        onError={(e: any) => { e.currentTarget.style.display = 'none' }}
                                      />
                                    ) : null}
                                    <div className={`w-full h-full ${iconUrl ? 'hidden' : 'flex'} bg-stremio-purple items-center justify-center`}>
                                      <Puzzle className="w-5 h-5 text-white" />
                                    </div>
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-col min-[480px]:flex-row min-[480px]:items-center min-[480px]:gap-2">
                                      <h4 className={`font-medium truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                        {addonName || 'Unnamed Addon'}
                                      </h4>
                                      {addon.version && (
                                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium w-fit mt-1 min-[480px]:mt-0 ${
                                          isDark ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-800'
                                        }`}>
                                          v{addon.version}
                                        </span>
                                      )}
                                    </div>
                                    {addon.description && (
                                      <p className={`hidden sm:block text-sm mt-1 truncate ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                                        {addon.description}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="ml-1 p-2 rounded-lg">
                                <button
                                  onClick={() => toggleUserExcluded(addon?.manifestUrl)}
                                  className={`flex items-center justify-center h-8 w-8 text-sm rounded transition-colors focus:outline-none ${
                                    excluded 
                                      ? (isDark ? 'text-red-300 hover:text-red-400' : 'text-red-600 hover:text-red-700')
                                      : (isDark ? 'text-gray-300 hover:text-red-400' : 'text-gray-600 hover:text-red-600')
                                  }`}
                                  title={excluded ? 'Include for this user' : 'Exclude for this user'}
                                >
                                  {excluded ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                              </div>
                            </div>
                          </div>
                          )
                        })}
                      </div>
                    ) : (
                      <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        No group addons assigned to this user's group.
                      </p>
                    )}
                  </div>

                  {(() => {
                    const liveAll = Array.isArray(stremioAddonsData?.addons) ? stremioAddonsData!.addons : []
                    const groupByUrl = new Map<string, any>((userDetailsData.addons || []).map((ga: any) => [
                      (ga?.manifestUrl || '').toString().trim().toLowerCase(), ga
                    ]))
                    // Use the original order from Stremio instead of separating protected/unprotected
                    const combinedLive = liveAll

                    // Initialize local order from live data when it changes
                    // (moved to top-level useEffect to satisfy React Hooks rules)


                    const handleDragStart = (id: string, e?: React.DragEvent) => {
                      draggingIdRef.current = id
                      setIsDragging(true)
                      // Suppress default drag image to avoid layout jitter
                      try {
                        const img = new Image()
                        img.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='
                        e?.dataTransfer?.setDragImage(img, 0, 0)
                      } catch {}
                    }

                    // Touch handlers for mobile drag and drop
                    const handleTouchStart = (id: string, index: number, e: React.TouchEvent) => {
                      // Don't start drag if touching a button or interactive element
                      const target = e.target as HTMLElement
                      if (target.tagName === 'BUTTON' || target.closest('button')) {
                        // Don't prevent default for buttons - let them work normally
                        return
                      }
                      
                      const touch = e.touches[0]
                      touchStartPos.current = { x: touch.clientX, y: touch.clientY }
                      touchStartIndex.current = index
                      isTouchDragging.current = false
                      draggingIdRef.current = id
                      // Do not prevent default on touchstart; let taps generate clicks on mobile
                    }

                    const handleTouchMove = (e: React.TouchEvent) => {
                      if (!touchStartPos.current || !draggingIdRef.current) return
                      
                      const touch = e.touches[0]
                      const deltaX = Math.abs(touch.clientX - touchStartPos.current.x)
                      const deltaY = Math.abs(touch.clientY - touchStartPos.current.y)
                      
                      // Start dragging if moved more than 10px in any direction
                      if (!isTouchDragging.current && (deltaX > 10 || deltaY > 10)) {
                        isTouchDragging.current = true
                        setIsDragging(true)
                        // Prevent scrolling when drag starts
                        document.body.style.overflow = 'hidden'
                      }
                      
                      if (isTouchDragging.current) {
                        // Only prevent defaults once we've actually started dragging
                        e.preventDefault()
                        e.stopPropagation()
                        // Find the element under the touch point
                        const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY)
                        if (elementBelow) {
                          const addonElement = elementBelow.closest('[data-addon-index]')
                          if (addonElement) {
                            const targetIndex = parseInt(addonElement.getAttribute('data-addon-index') || '0')
                            if (targetIndex !== touchStartIndex.current) {
                              setDragOverIndex(targetIndex)
                            }
                          }
                        }
                      }
                    }

                    const handleTouchEnd = (e: React.TouchEvent) => {
                      if (isTouchDragging.current && draggingIdRef.current && touchStartIndex.current !== null) {
                        const targetIndex = dragOverIndex !== null ? dragOverIndex : touchStartIndex.current
                        handleDrop(targetIndex)
                      }
                      
                      // Reset all touch state
                      touchStartPos.current = null
                      touchStartIndex.current = null
                      isTouchDragging.current = false
                      setIsDragging(false)
                      setDragOverIndex(null)
                      draggingIdRef.current = null
                      // Restore scrolling
                      document.body.style.overflow = ''
                      // Only suppress default if we were dragging; simple taps should click
                      if (isTouchDragging.current) {
                        e.preventDefault()
                        e.stopPropagation()
                      }
                    }
                    const handleDragOver = (e: React.DragEvent, targetIndex: number) => {
                      e.preventDefault()
                      setDragOverIndex(targetIndex)
                    }
                    const handleDragLeave = () => { 
                      setDragOverIndex(null)
                    }
                    const handleDragEnd = () => { 
                      draggingIdRef.current = null
                      setIsDragging(false)
                      setDragOverIndex(null)
                    }
                    const handleDrop = (targetIndex: number) => {
                      const fromId = draggingIdRef.current
                      if (!fromId) { 
                        setDragOverIndex(null)
                        setIsDragging(false)
                        return 
                      }
                      
                      // Use the preview order as the final order
                      const currentIndex = addonOrder.indexOf(fromId)
                      if (currentIndex === -1 || currentIndex === targetIndex) {
                        setDragOverIndex(null)
                        setIsDragging(false)
                        draggingIdRef.current = null
                        return
                      }
                      
                      // The preview order already has the correct final arrangement
                      setAddonOrder(previewOrder)
                      setDragOverIndex(null)
                      setIsDragging(false)
                      draggingIdRef.current = null
                      
                      // Set flag to prevent UI reversion
                      justReorderedRef.current = true
                      
                      reorderMutation.mutate(previewOrder)
                    }

                    const mapIdForAddon = (addon: any) => (addon.manifestUrl || addon.transportUrl || addon.url || '').toString().trim()

                    return (
                      <>
                        {/* Stremio Account Addons (non-protected) */}
                        <div className={`p-4 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-gray-50'}`}>
                          <div className="flex items-center justify-between mb-3">
                            <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                              Stremio Account Addons ({combinedLive.length})
                            </h3>
                            <button
                              onClick={() => wipeUserAddonsMutation.mutate(selectedUser.id)}
                              disabled={wipeUserAddonsMutation.isPending}
                              className={`flex items-center justify-center w-[84px] h-8 min-h-8 max-h-8 text-sm rounded-lg transition-colors border disabled:opacity-50 ${
                                isMono
                                  ? 'bg-black border-white/20 text-white hover:bg-white/10'
                                  : (isDark
                                      ? 'bg-gray-600 border-gray-500 text-white hover:bg-gray-500'
                                      : 'bg-white border-gray-200 text-gray-900 hover:bg-gray-50')
                              }`}
                              title="Clear all addons from user's Stremio account"
                            >
                              {wipeUserAddonsMutation.isPending ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                              ) : (
                                'Clear'
                              )}
                            </button>
                          </div>
                          {combinedLive.length > 0 ? (
                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStartDnd} onDragEnd={handleDragEndDnd} modifiers={[restrictToVerticalAxis]}>
                              <SortableContext items={addonOrder} strategy={verticalListSortingStrategy}>
                            <div className="space-y-2">
                              {orderAddons(combinedLive).map((addon: any, index: number) => {
                                const murl = mapIdForAddon(addon)
                                const fam = groupByUrl.get((murl || '').toString().trim().toLowerCase())
                                const isBuiltIn = isAddonProtectedBuiltIn(addon)
                                const isUserProt = userProtectedSet.has(murl || '')
                                    // In unsafe mode, only show user-protected addons as protected (visually)
                                    // In safe mode, show both Stremio-protected and user-protected as protected
                                    const isProt = deleteMode === 'unsafe' ? isUserProt : isAddonProtected(addon)
                                const isDragged = isDragging && draggingIdRef.current === murl
                                    const isActive = activeId === murl
                                
                                // Debug: Log addon data structure
                                if (index === 0) {
                                  console.log('🔍 Stremio addon data structure:', addon)
                                  console.log('🔍 Available icon fields:', {
                                    iconUrl: addon?.iconUrl,
                                    manifestLogo: addon?.manifest?.logo,
                                    manifestIcon: addon?.manifest?.icon
                                  })
                                }
                                
                                return (
                                      <SortableAddon key={`${murl}-${index}` || `addon-${index}`} id={murl} index={index}>
                                  <div
                                    className={`relative p-3 pl-8 rounded-lg border transition-all duration-200 select-none touch-none ${
                                      isDark ? 'bg-gray-600 border-gray-500' : 'bg-white border-gray-200'
                                        } ${isDragged ? (isDark ? 'ring-2 ring-blue-500 opacity-50' : 'ring-2 ring-blue-400 opacity-50') : ''} ${isActive && isDragging ? 'opacity-0' : ''}`}
                                    title="Drag to reorder"
                                  >
                                    {/* Full-height grab handle on far left, seamless */}
                                    <div
                                      className="absolute inset-y-0 left-0 w-6 flex items-center justify-center cursor-grab active:cursor-grabbing"
                                      title="Drag to reorder"
                                    >
                                      <div className={`grid grid-cols-2 gap-0.5 ${isDark ? 'text-gray-400' : 'text-gray-400'}`}>
                                        <span className="w-1 h-1 rounded-full bg-current block" />
                                        <span className="w-1 h-1 rounded-full bg-current block" />
                                        <span className="w-1 h-1 rounded-full bg-current block" />
                                        <span className="w-1 h-1 rounded-full bg-current block" />
                                        <span className="w-1 h-1 rounded-full bg-current block" />
                                        <span className="w-1 h-1 rounded-full bg-current block" />
                                      </div>
                                    </div>
                                        <div className="flex items-center justify-between gap-3">
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center flex-1 min-w-0">
                                              <div className={`w-10 h-10 rounded-lg flex items-center justify-center mr-3 flex-shrink-0 overflow-hidden ${
                                                isMono ? 'border border-white/20' : ''
                                              }`}>
                                                {(addon.iconUrl || addon?.manifest?.logo) ? (
                                                  <img
                                                    src={addon.iconUrl || addon?.manifest?.logo}
                                                    alt={`${addon.name || addon?.manifest?.name || addon.id || 'Addon'} logo`}
                                                    className="w-full h-full object-contain"
                                                    onError={(e: any) => { e.currentTarget.style.display = 'none' }}
                                                  />
                                                ) : null}
                                                <div className={`w-full h-full ${(addon.iconUrl || addon?.manifest?.logo) ? 'hidden' : 'flex'} bg-stremio-purple items-center justify-center`}>
                                                  <Puzzle className="w-5 h-5 text-white" />
                                                </div>
                                              </div>
                                              <div className="min-w-0 flex-1">
                                                <div className="flex flex-col min-[480px]:flex-row min-[480px]:items-center min-[480px]:gap-2">
                                                  <h4 className={`font-medium truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                                    {fam?.name || addon.name || addon.id || 'Unnamed Addon'}
                                                  </h4>
                                                  {addon.version && (
                                                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium w-fit mt-1 min-[480px]:mt-0 ${
                                                      isDark ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-800'
                                                    }`}>
                                                      v{addon.version}
                                                    </span>
                                                  )}
                                                </div>
                                                {addon.description && (
                                                  <p className={`hidden sm:block text-sm mt-1 truncate ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                                                    {addon.description}
                                                  </p>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-2 ml-1">
                                          <button
                                            onClick={() => toggleUserProtected(murl)}
                                              disabled={deleteMode === 'safe' && isBuiltIn}
                                            className={`flex items-center justify-center h-8 w-8 text-sm rounded transition-colors focus:outline-none ${
                                                deleteMode === 'safe' && isBuiltIn
                                                  ? (isDark ? 'text-gray-500 cursor-not-allowed opacity-50' : 'text-gray-400 cursor-not-allowed opacity-50')
                                                  : isProt
                                                  ? (isDark ? 'text-yellow-300 hover:text-yellow-400' : 'text-yellow-600 hover:text-yellow-700')
                                                : (isDark ? 'text-gray-300 hover:text-yellow-400' : 'text-gray-600 hover:text-yellow-600')
                                            }`}
                                              title={
                                                deleteMode === 'safe' && isBuiltIn
                                                  ? 'Cannot unprotect Stremio-protected addons in safe mode'
                                                  : isProt ? 'Unprotect' : 'Protect'
                                              }
                                            >
                                              {isProt ? <LockKeyhole className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                                          </button>
                                        <button
                                          onClick={() => handleDeleteStremioAddon(addon.manifestUrl, addon.name)}
                                              disabled={deleteMode === 'safe' && isProt}
                                              className={`flex items-center justify-center h-8 w-8 text-sm rounded transition-colors focus:outline-none ${
                                                deleteMode === 'safe' && isProt
                                                  ? (isDark ? 'text-gray-500 cursor-not-allowed opacity-50' : 'text-gray-400 cursor-not-allowed opacity-50')
                                                  : (isDark ? 'text-gray-300 hover:text-red-400' : 'text-gray-600 hover:text-red-600')
                                              }`}
                                              title={
                                                deleteMode === 'safe' && isProt
                                                  ? 'Cannot delete protected addons in safe mode'
                                                  : 'Remove this addon from Stremio account'
                                              }
                                            >
                                              <Trash2 className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                      </SortableAddon>
                                )
                              })}
                            </div>
                              </SortableContext>
                              <DragOverlay dropAnimation={null}>
                                {activeId ? (() => {
                                  const activeAddon = orderAddons(combinedLive).find((a: any) => mapIdForAddon(a) === activeId)
                                  const fam = groupByUrl.get((activeId || '').toString().trim().toLowerCase()) as any
                                  return (
                                    <div className={`p-3 pl-8 rounded-lg border ${isDark ? 'bg-gray-600 border-gray-500' : 'bg-white border-gray-200'} shadow-xl`}> 
                                      <div className="flex items-center justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center flex-1 min-w-0">
                                            <div className="w-10 h-10 rounded-lg flex items-center justify-center mr-3 flex-shrink-0 overflow-hidden">
                                              {(activeAddon?.iconUrl || activeAddon?.manifest?.logo) ? (
                                                <img
                                                  src={activeAddon?.iconUrl || activeAddon?.manifest?.logo}
                                                  alt={`${activeAddon?.name || activeAddon?.manifest?.name || activeAddon?.id || 'Addon'} logo`}
                                                  className="w-full h-full object-contain"
                                                  onError={(e: any) => { e.currentTarget.style.display = 'none' }}
                                                />
                                              ) : null}
                                              <div className={`w-full h-full ${(activeAddon?.iconUrl || activeAddon?.manifest?.logo) ? 'hidden' : 'flex'} bg-stremio-purple items-center justify-center`}>
                                                <Puzzle className="w-5 h-5 text-white" />
                                              </div>
                                            </div>
                                            <div className="min-w-0 flex-1">
                                              <div className="flex items-center gap-2">
                                                <h4 className={`font-medium truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                                  {fam?.name || activeAddon?.name || activeAddon?.id || 'Addon'}
                                                </h4>
                                                {activeAddon?.version && (
                                                  <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium flex-shrink-0 ${
                                                    isDark ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-800'
                                                  }`}>
                                                    v{activeAddon.version}
                                                  </span>
                                                )}
                                              </div>
                                              {activeAddon?.description && (
                                                <p className={`text-sm mt-1 truncate ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                                                  {activeAddon.description}
                                                </p>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2 ml-1 opacity-70">
                                          <span className={`p-2 rounded-lg ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>
                                            <LockKeyhole className="w-4 h-4" />
                                          </span>
                                          <span className={`p-2 rounded-lg ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                                            <Trash2 className="w-4 h-4" />
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  )
                                })() : null}
                              </DragOverlay>
                            </DndContext>
                          ) : (
                            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                              No addons found in this user's Stremio account.
                            </p>
                          )}
                        </div>

                        {/* Protected Stremio Addons */}
                        {/* Removed: merged into single list above */}
                      </>
                    )
                  })()}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Failed to load user details.
                  </p>
                </div>
              )}
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