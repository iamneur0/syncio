'use client'

import React, { useState, useMemo, useEffect, useRef } from 'react'
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
  RotateCcw,
  Users,
  Puzzle,
  Unlock,
  LockKeyhole
} from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usersAPI, groupsAPI, type User } from '@/services/api'
import toast from 'react-hot-toast'
import ConfirmDialog from '../common/ConfirmDialog'
import SyncBadge from '../common/SyncBadge'
import { useDebounce } from '../../hooks/useDebounce'

import { fetchManifestCached } from '../../utils/manifestCache'

// Small badge that shows per-user sync status in list view
function UserSyncBadge({ userId, userExcludedSet, userProtectedSet, isSyncing }: { userId: string, userExcludedSet: Set<string>, userProtectedSet: Set<string>, isSyncing?: boolean }) {
  const { isDark } = useTheme()
  const { data: userDetail } = useQuery({
    queryKey: ['user', userId],
    queryFn: async () => usersAPI.getById(userId),
    staleTime: 30_000,
    refetchOnMount: 'always',
  })

  // userExcludedSet and userProtectedSet are now passed as props from parent component

  // Protected addon IDs and URLs - same as main component
  const protectedAddonIds = ['org.stremio.local', 'com.stremio.opensubtitles']
  const protectedManifestUrls = [
    'http://127.0.0.1:11470/local-addon/manifest.json',
    'https://opensubtitles.strem.io/manifest.json'
  ]

  // Check if an addon is protected (built-in + user-defined) - same logic as main component
  const isAddonProtected = (addon: any) => {
    const addonId = addon?.id || addon?.manifest?.id
    const manifestUrl = addon?.manifestUrl || addon?.transportUrl || addon?.url
    
    // Check by ID
    if (addonId && protectedAddonIds.includes(addonId)) return true
    
    // Check by manifest URL
    if (manifestUrl && protectedManifestUrls.includes(manifestUrl)) return true
    
    // Check if manifest URL contains any protected addon ID
    if (manifestUrl && protectedAddonIds.some(id => manifestUrl.includes(id))) return true
    
    // Check if user-protected
    return userProtectedSet.has(manifestUrl || '')
  }

  const handleConnectStremio = () => {
    if (userDetail) {
      // This will be handled by the parent component
      // We'll use a custom event to communicate with the parent
      window.dispatchEvent(new CustomEvent('connectStremio', { detail: userDetail }))
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
    enabled: !!userDetail?.hasStremioConnection, // Only fetch if user is connected to Stremio
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




  const [status, setStatus] = React.useState<'synced' | 'unsynced' | 'stale' | 'connect' | 'syncing' | 'checking'>('checking')
  const [wasSyncing, setWasSyncing] = React.useState(false)

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
    const checkSync = async () => {
      // If currently syncing, show syncing state
      if (isSyncing) {
        setStatus('syncing')
        setWasSyncing(true)
        return
      }

      // If we just finished syncing, show synced immediately
      if (wasSyncing && !isSyncing) {
        setStatus('synced')
        setWasSyncing(false)
        return
      }

      // Check if user was recently synced by looking at recent sync events
      const recentSync = localStorage.getItem(`sfm_user_sync:${userId}`)
      const syncTime = recentSync ? parseInt(recentSync) : 0
      const isRecentlySynced = (Date.now() - syncTime) < 5000 // 5 seconds
      
      if (isRecentlySynced) {
        setStatus('synced')
        return
      }

      // If data is still loading, show checking state
      if (!userDetail || !live) {
        setStatus('checking')
        return
      }

      // If user doesn't have Stremio credentials, show connect button
      if (!userDetail?.hasStremioConnection) {
        setStatus('connect')
        return
      }

      const allGroupAddons = Array.isArray(userDetail?.addons) ? userDetail!.addons : []
      const groupAddons = allGroupAddons.filter((ga: any) => !userExcludedSet.has(ga?.manifestUrl) && ga?.isEnabled !== false)
      const liveList = Array.isArray(live?.addons) ? live!.addons : []
      if (groupAddons.length === 0) { setStatus('synced'); return }
      if (liveList.length === 0) { setStatus('unsynced'); return }

      // Build sets from ALL live addons for presence checks (include protected)
      const allLiveById = new Map<string, any[]>()
      const allLiveUrlSet = new Set<string>()
      for (const a of liveList) {
        const id = a?.id || a?.manifest?.id || ''
        if (id) {
          if (!allLiveById.has(id)) allLiveById.set(id, [])
          allLiveById.get(id)!.push(a)
        }
        const url = a?.manifestUrl || a?.transportUrl || a?.url
        if (url) allLiveUrlSet.add(url.toString().trim().toLowerCase())
      }

      // Use non-protected live only to detect extras that should not be present
      const nonProtectedLive = liveList.filter((a: any) => !isAddonProtected(a))

      // Deep manifest comparison helper reused below
      const liveManifestStrings = new Set<string>()
      const liveUrlSet = new Set<string>()
      const liveById = new Map<string, any[]>() // Track addons by ID for duplicate detection
      
      for (const a of nonProtectedLive) {
        const provided = a?.manifest
        const url = a?.manifestUrl || a?.transportUrl || a?.url
        if (url) liveUrlSet.add(url.toString().trim().toLowerCase())
        const manifest = provided || await fetchManifestCached(url)
        if (manifest) {
          liveManifestStrings.add(JSON.stringify(deepSort(manifest)))
          
          // Track by ID for duplicate detection
          const id = a?.id || a?.manifest?.id || ''
          if (id) {
            if (!liveById.has(id)) liveById.set(id, [])
            liveById.get(id)!.push(a)
          }
        }
      }

      // Check if all group addons exist in live (by ID/URL), allowing them to be protected
      for (const ga of groupAddons) {
        const groupId = ga?.id || ga?.manifest?.id
        const groupUrl = (ga?.manifestUrl || '').toString().trim().toLowerCase()

        if (groupUrl && allLiveUrlSet.has(groupUrl)) {
          continue
        }

        if (groupId && allLiveById.has(groupId)) {
          // If we care about exact manifest match, compare against any instance in the account (protected or not)
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
          if (!foundMatchingManifest) { setStatus('unsynced'); return }
        } else {
          setStatus('unsynced'); return
        }
      }

      // Check order: group addons should appear in the same order in Stremio account
      const groupAddonUrls = groupAddons.map((ga: any) => (ga?.manifestUrl || '').toString().trim().toLowerCase()).filter(Boolean)
      const liveAddonUrls = nonProtectedLive.map((a: any) => (a?.manifestUrl || a?.transportUrl || a?.url || '').toString().trim().toLowerCase()).filter(Boolean)
      
      // Find the positions of group addons in the live addons list
      const groupAddonPositions: number[] = []
      for (const groupUrl of groupAddonUrls) {
        const position = liveAddonUrls.findIndex((liveUrl: string) => liveUrl === groupUrl)
        if (position === -1) { setStatus('unsynced'); return }
        groupAddonPositions.push(position)
      }
      
      // Check if group addons are in the same order (positions should be ascending)
      for (let i = 1; i < groupAddonPositions.length; i++) {
        if (groupAddonPositions[i] <= groupAddonPositions[i - 1]) {
          setStatus('unsynced'); return
        }
      }

      // Extras: only consider non-protected live addons as extraneous
      const groupAddonIds = new Set(groupAddons.map((ga: any) => ga?.id || ga?.manifest?.id).filter(Boolean))
      const groupAddonUrlSet = new Set(groupAddonUrls)
      for (const addon of nonProtectedLive) {
        const addonId = addon?.id || addon?.manifest?.id
        const addonUrl = (addon?.manifestUrl || addon?.transportUrl || addon?.url || '').toString().trim().toLowerCase()
        const isInGroup = (addonId && groupAddonIds.has(addonId)) || (addonUrl && groupAddonUrlSet.has(addonUrl))
        if (!isInGroup) { setStatus('unsynced'); return }
      }

      setStatus('synced')
    }

    checkSync()
  }, [userDetail, live, isDark, userExcludedSet, userProtectedSet, isSyncing, wasSyncing])

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

  return (
    <SyncBadge
      status={status}
      isClickable={status === 'unsynced' || status === 'connect'}
      onClick={status === 'unsynced' ? handleSync : status === 'connect' ? handleConnectStremio : undefined}
      title={getTitle()}
    />
  )
}

export default function StremioUsersPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const debouncedSearchTerm = useDebounce(searchTerm, 300)
  
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
  const [stremioEmail, setStremioEmail] = useState('')
  const [stremioPassword, setStremioPassword] = useState('')
  const [stremioUsername, setStremioUsername] = useState('')
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
  const { isDark } = useTheme()
  const queryClient = useQueryClient()
  
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

  // Fetch user details with Stremio addons
  const { data: userDetailsData, isLoading: isLoadingDetails } = useQuery({
    queryKey: ['user', selectedUser?.id],
    queryFn: async () => {
      if (!selectedUser?.id) return null
      const response = await usersAPI.getById(selectedUser.id)
      return response
    },
    enabled: !!selectedUser?.id
  })

  // Fetch live Stremio addons for the selected user
  const { data: stremioAddonsData, isLoading: isLoadingStremioAddons } = useQuery({
    queryKey: ['user', selectedUser?.id, 'stremio-addons'],
    queryFn: async () => {
      if (!selectedUser?.id) return null
      const response = await fetch(`/api/users/${selectedUser.id}/stremio-addons`)
      if (!response.ok) {
        throw new Error('Failed to fetch Stremio addons')
      }
      return response.json()
    },
    enabled: !!selectedUser?.id && !!selectedUser?.hasStremioConnection
  })

  // Determine sync status by comparing full manifest JSON contents
  const [isUserSynced, setIsUserSynced] = React.useState(false)
  const [hideSensitive, setHideSensitive] = React.useState<boolean>(false)

  // Per-user excluded group addons (manifestUrl) — declare early for effects below
  const [userExcludedSet, setUserExcludedSet] = useState<Set<string>>(new Set())
  useEffect(() => {
    const uid = selectedUser?.id
    if (!uid) { setUserExcludedSet(new Set()); return }
    try {
      const raw = localStorage.getItem(`sfm_user_excluded_addons:${uid}`)
      if (raw) setUserExcludedSet(new Set(JSON.parse(raw)))
      else setUserExcludedSet(new Set())
    } catch {
      setUserExcludedSet(new Set())
    }
  }, [selectedUser?.id])

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
      
      // Load excluded addons
      try {
        const rawExcluded = localStorage.getItem(`sfm_user_excluded_addons:${uid}`)
        if (rawExcluded) {
          newExcludedSets.set(uid, new Set(JSON.parse(rawExcluded)))
        } else {
          newExcludedSets.set(uid, new Set())
        }
      } catch {
        newExcludedSets.set(uid, new Set())
      }
      
      // Load protected addons
      try {
        const rawProtected = localStorage.getItem(`sfm_user_protected_addons:${uid}`)
        if (rawProtected) {
          newProtectedSets.set(uid, new Set(JSON.parse(rawProtected)))
        } else {
          newProtectedSets.set(uid, new Set())
        }
      } catch {
        newProtectedSets.set(uid, new Set())
      }
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

  const toggleUserExcluded = (manifestUrl?: string) => {
    const uid = selectedUser?.id
    if (!uid || !manifestUrl) return
    setUserExcludedSet((prev) => {
      const next = new Set(prev)
      const key = manifestUrl
      if (next.has(key)) next.delete(key)
      else next.add(key)
      try { localStorage.setItem(`sfm_user_excluded_addons:${uid}`, JSON.stringify(Array.from(next))) } catch {}
      
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
      const liveAddonUrls = nonProtectedLive.map((a: any) => (a?.manifestUrl || a?.transportUrl || a?.url || '').toString().trim().toLowerCase()).filter(Boolean)
      
      // Find the positions of group addons in the live addons list
      const groupAddonPositions: number[] = []
      for (const groupUrl of groupAddonUrls) {
        const position = liveAddonUrls.findIndex((liveUrl: string) => liveUrl === groupUrl)
        if (position === -1) { setIsUserSynced(false); return }
        groupAddonPositions.push(position)
      }
      
      // Check if group addons are in the same order (positions should be ascending)
      for (let i = 1; i < groupAddonPositions.length; i++) {
        if (groupAddonPositions[i] <= groupAddonPositions[i - 1]) {
          setIsUserSynced(false); return
        }
      }

      // Extras: only consider non-protected live addons as extraneous
      const groupAddonIds = new Set(groupAddons.map((ga: any) => ga?.id || ga?.manifest?.id).filter(Boolean))
      const groupAddonUrlSet = new Set(groupAddonUrls)
      for (const addon of nonProtectedLive) {
        const addonId = addon?.id || addon?.manifest?.id
        const addonUrl = (addon?.manifestUrl || addon?.transportUrl || addon?.url || '').toString().trim().toLowerCase()
        const isInGroup = (addonId && groupAddonIds.has(addonId)) || (addonUrl && groupAddonUrlSet.has(addonUrl))
        if (!isInGroup) { setIsUserSynced(false); return }
      }

      setIsUserSynced(true)
    }

    run()
    return () => { cancelled = true }
  }, [userDetailsData, stremioAddonsData, userExcludedSet])

  const syncUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const excluded = Array.from(userExcludedSet)
      const syncMode = localStorage.getItem('sfm_sync_mode') || 'normal'
      const res = await fetch(`/api/users/${userId}/sync`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-sync-mode': syncMode
        },
        body: JSON.stringify({ excludedManifestUrls: excluded })
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || 'Failed to sync addons')
      }
      return res.json()
    },
    onSuccess: (data, userId) => {
      // Mark user as recently synced in localStorage
      localStorage.setItem(`sfm_user_sync:${userId}`, Date.now().toString())
      // refresh live addons and users list to reflect counts
      if (selectedUser?.id) {
        queryClient.invalidateQueries({ queryKey: ['user', selectedUser.id, 'stremio-addons'] })
      }
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success(data?.message || 'Synced successfully!')
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to sync addons')
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
        ])
      } catch {}
    }
    window.addEventListener('sfm:tab:activated' as any, onUsersTab as any)
    return () => window.removeEventListener('sfm:tab:activated' as any, onUsersTab as any)
  }, [queryClient])

  // Handle syncUser events from UserSyncBadge
  React.useEffect(() => {
    const handleSyncUser = (event: CustomEvent) => {
      const { userId } = event.detail
      syncUserMutation.mutate(userId)
    }

    window.addEventListener('syncUser', handleSyncUser as EventListener)
    
    return () => {
      window.removeEventListener('syncUser', handleSyncUser as EventListener)
    }
  }, [syncUserMutation])

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
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
    if (!stremioEmail || !stremioPassword || (!editingUser && !stremioUsername)) {
      toast.error('Please fill in all required fields')
      return
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
      groupName: user.groupName || ''
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
    if (tempDetailGroup.trim() !== (userDetailsData?.groupName || 'No group assigned')) {
      // Update user's group
      updateUserMutation.mutate({
        id: selectedUser.id,
        userData: { groupName: tempDetailGroup.trim() }
      })
    }
    setEditingDetailGroup(false)
    setTempDetailGroup('')
  }

  const handleBlurDetailGroup = () => {
    if (tempDetailGroup.trim() !== (userDetailsData?.groupName || 'No group assigned')) {
      // Update user's group
      updateUserMutation.mutate({
        id: selectedUser.id,
        userData: { groupName: tempDetailGroup.trim() }
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


  // User-defined protected addons, persisted per user (by manifestUrl)
  const [userProtectedSet, setUserProtectedSet] = useState<Set<string>>(new Set())
  useEffect(() => {
    const uid = selectedUser?.id
    if (!uid) { setUserProtectedSet(new Set()); return }
    try {
      const raw = localStorage.getItem(`sfm_user_protected_addons:${uid}`)
      if (raw) setUserProtectedSet(new Set(JSON.parse(raw)))
      else setUserProtectedSet(new Set())
    } catch {
      setUserProtectedSet(new Set())
    }
  }, [selectedUser?.id])

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
      try { localStorage.setItem(`sfm_user_protected_addons:${uid}`, JSON.stringify(Array.from(next))) } catch {}
      
      // Update global state for all users
      setGlobalUserProtectedSets(prev => {
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



  // Delete Stremio addon mutation
  const deleteStremioAddonMutation = useMutation({
    mutationFn: async ({ userId, addonId }: { userId: string; addonId: string }) => {
      const encodedAddonId = encodeURIComponent(addonId)
      const response = await fetch(`/api/users/${userId}/stremio-addons/${encodedAddonId}`, {
        method: 'DELETE'
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to delete Stremio addon')
      }
      
      return response.json()
    },
    onSuccess: () => {
      // Invalidate the Stremio addons query to refresh the list
      queryClient.invalidateQueries({ queryKey: ['user', selectedUser?.id, 'stremio-addons'] })
      // Also invalidate users list to update addon counts
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('Addon removed from Stremio account!')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete Stremio addon')
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
    
    // Always send groupName (even if empty) to handle group removal
    userData.groupName = editFormData.groupName.trim()
    
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
  }, [isDetailModalOpen, selectedUser?.id, stremioAddonsData, addonOrder.length, isDragging])

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
              className="flex items-center justify-center px-3 py-2 sm:px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm sm:text-base"
            >
              <RotateCcw className={`w-4 h-4 sm:w-5 sm:h-5 mr-2 ${syncAllUsersMutation.isPending ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{syncAllUsersMutation.isPending ? 'Syncing...' : 'Sync All Users'}</span>
              <span className="sm:hidden">{syncAllUsersMutation.isPending ? 'Syncing...' : 'Sync All'}</span>
            </button>
          <button
            onClick={() => setShowConnectModal(true)}
              className="flex items-center justify-center px-3 py-2 sm:px-4 bg-stremio-purple text-white rounded-lg hover:bg-purple-700 transition-colors text-sm sm:text-base"
          >
              <Link className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
              <span className="hidden sm:inline">Connect Stremio User</span>
              <span className="sm:hidden">Connect User</span>
          </button>
        </div>
        </div>
        {/* Search */}
        <div className="flex flex-col sm:flex-row gap-4">
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
        <div className={`text-center py-12 ${isDark ? 'bg-gray-800' : 'bg-red-50'} rounded-lg border ${isDark ? 'border-gray-700' : 'border-red-200'}`}>
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className={`text-lg font-medium mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>Unable to load users</h3>
          <p className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            Make sure the backend server is running on port 4000
          </p>
          <button 
            onClick={() => queryClient.invalidateQueries({ queryKey: ['users'] })}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Users Grid */}
      {!isLoading && !error && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayUsers.map((user: any) => (
            <div key={user.id} className={`rounded-lg shadow-sm border p-6 hover:shadow-md transition-shadow ${
              isDark 
                ? 'bg-gray-800 border-gray-700' 
                : 'bg-white border-gray-200'
            } ${!user.isActive ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    isDark ? 'bg-stremio-purple text-white' : 'bg-stremio-purple text-white'
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
                        <div className="mt-1">
                          <UserSyncBadge 
                            userId={user.id} 
                            userExcludedSet={globalUserExcludedSets.get(user.id) || new Set()} 
                            userProtectedSet={globalUserProtectedSets.get(user.id) || new Set()} 
                            isSyncing={syncUserMutation.isPending && syncUserMutation.variables === user.id}
                          />
                        </div>
                      </div>
                    ) : (
                      <div>
                        <h3 
                          className={`font-medium cursor-pointer hover:text-stremio-purple transition-colors ${isDark ? 'text-white' : 'text-gray-900'}`}
                          onClick={() => handleStartEditUsername(user.id, user.username || user.email)}
                          title="Click to edit username"
                        >
                          {user.username || user.email}
                        </h3>
                        <div className="mt-1">
                          <UserSyncBadge 
                            userId={user.id} 
                            userExcludedSet={globalUserExcludedSets.get(user.id) || new Set()} 
                            userProtectedSet={globalUserProtectedSets.get(user.id) || new Set()} 
                            isSyncing={syncUserMutation.isPending && syncUserMutation.variables === user.id}
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

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="flex items-center">
                  <Puzzle className="w-4 h-4 text-gray-400 mr-2" />
                  <div>
                    <p className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      {user.stremioAddonsCount || 0}
                    </p>
                    <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Addons</p>
                </div>
                </div>
                <div className="flex items-center">
                  <Users className="w-4 h-4 text-gray-400 mr-2" />
                  <p className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {user.groupName || 'No group'}
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleViewUserDetails(user)}
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
                  onClick={() => syncUserMutation.mutate(user.id)}
                  disabled={syncUserMutation.isPending}
                  className="flex items-center justify-center px-3 py-2 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors disabled:opacity-50"
                  title="Sync user addons"
                >
                  <RotateCcw className={`w-4 h-4 ${syncUserMutation.isPending ? 'animate-spin' : ''}`} />
                </button>
                <button 
                  onClick={() => handleDeleteUser(user.id, user.username)}
                  disabled={deleteUserMutation.isPending}
                  className="flex items-center justify-center px-3 py-2 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
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
                className="flex items-center justify-center px-3 py-2 sm:px-4 bg-stremio-purple text-white rounded-lg hover:bg-purple-700 transition-colors text-sm sm:text-base mx-auto"
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
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
                className={`text-2xl ${isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleConnectStremio} className="p-6 space-y-4">
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
                  className="flex-1 px-4 py-2 bg-stremio-purple text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
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
                  className={`p-2 rounded-lg hover:bg-gray-200 transition-colors ${
                    isDark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500'
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
                      <option key={group.id} value={group.name}>
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
                    className="flex-1 px-4 py-2 bg-stremio-purple text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
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
                              if (e.target.value !== (userDetailsData?.groupName || 'No group assigned')) {
                                updateUserMutation.mutate({
                                  id: selectedUser.id,
                                  userData: { groupName: e.target.value.trim() }
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
                              <option key={group.id} value={group.name}>
                                {group.name}
                              </option>
                            ))}
                          </select>
                </div>
                      ) : (
                        <div 
                          className="flex items-center gap-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-2 py-1 rounded transition-colors"
                          onClick={() => handleStartEditDetailGroup(userDetailsData?.groupName || 'No group assigned')}
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
                    userExcludedSet={userExcludedSet}
                    userProtectedSet={userProtectedSet}
                    isSyncing={syncUserMutation.isPending && syncUserMutation.variables === selectedUser.id}
                  />
                <button
                  onClick={() => setIsDetailModalOpen(false)}
                  className={`p-2 rounded-lg hover:bg-gray-200 transition-colors ${
                    isDark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500'
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
                          return (
                          <div key={index} className={`p-3 rounded-lg border ${
                            isDark ? 'bg-gray-600 border-gray-500' : 'bg-white border-gray-200'
                          }`}>
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <h4 className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                    {addon.name || addon.id || 'Unnamed Addon'}
                                  </h4>
                                  {addon.version && (
                                    <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                                      isDark ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-800'
                                    }`}>
                                      v{addon.version}
                                    </span>
                                  )}
                                </div>
                                {addon.description && (
                                  <p className={`text-sm mt-1 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                                    {addon.description.length > 50 
                                      ? `${addon.description.substring(0, 50)}...` 
                                      : addon.description}
                                  </p>
                                )}
                              </div>
                              <div className="ml-3 p-2 rounded-lg">
                                <button
                                  onClick={() => toggleUserExcluded(addon?.manifestUrl)}
                                  className={`${excluded ? (isDark ? 'text-red-300' : 'text-red-600') : (isDark ? 'text-gray-300' : 'text-gray-500')} ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'} p-2 rounded-lg`}
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
                          <h3 className={`text-lg font-semibold mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                            Stremio Account Addons ({combinedLive.length})
                          </h3>
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
                                
                                return (
                                      <SortableAddon id={murl} index={index}>
                                  <div
                                    key={`${murl}-${index}` || `addon-${index}`}
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
                                        <div className="flex items-center justify-between">
                                          <div className="flex-1 flex items-center gap-3">
                                        <div className="flex-1">
                                          <div className="flex items-center gap-2">
                                            <h4 className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                              {fam?.name || addon.name || addon.id || 'Unnamed Addon'}
                                            </h4>
                                            {addon.version && (
                                              <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                                                    isDark ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-800'
                                              }`}>
                                                v{addon.version}
                                              </span>
                                            )}
                                          </div>
                                          {addon.description && (
                                            <p className={`text-sm mt-1 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                                                  {addon.description.length > 50 ? `${addon.description.substring(0, 50)}...` : addon.description}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2 ml-3">
                                          <button
                                            onClick={() => toggleUserProtected(murl)}
                                              disabled={deleteMode === 'safe' && isBuiltIn}
                                            className={`p-2 rounded-lg transition-colors ${
                                                deleteMode === 'safe' && isBuiltIn
                                                  ? (isDark ? 'text-gray-500 cursor-not-allowed opacity-50' : 'text-gray-400 cursor-not-allowed opacity-50')
                                                  : isProt
                                                  ? (isDark ? 'text-purple-300 hover:bg-purple-900' : 'text-purple-700 hover:bg-purple-100')
                                                : (isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100')
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
                                              className={`p-2 rounded-lg transition-colors ${
                                                deleteMode === 'safe' && isProt
                                                  ? (isDark ? 'text-gray-500 cursor-not-allowed opacity-50' : 'text-gray-400 cursor-not-allowed opacity-50')
                                                  : (isDark ? 'text-red-400 hover:bg-red-900' : 'text-red-600 hover:bg-red-50')
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
                                      <div className="flex items-center justify-between">
                                        <div className="flex-1 flex items-center gap-3">
                                          <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                              <h4 className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                                {fam?.name || activeAddon?.name || activeAddon?.id || 'Addon'}
                                              </h4>
                                              {activeAddon?.version && (
                                                <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                                                  isDark ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-800'
                                                }`}>
                                                  v{activeAddon.version}
                                                </span>
                                              )}
                                            </div>
                                            {activeAddon?.description && (
                                              <p className={`text-sm mt-1 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                                                {activeAddon.description.length > 50 ? `${activeAddon.description.substring(0, 50)}...` : activeAddon.description}
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2 ml-3 opacity-70">
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
