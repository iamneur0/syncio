'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { publicLibraryAPI, usersAPI } from '@/services/api'
import { Plus, Puzzle, Eye, EyeOff, Sparkles, Trash2 } from 'lucide-react'
import { formatDate } from '@/utils/dateUtils'
import { useSyncStatusRefresh } from '@/hooks/useSyncStatusRefresh'
import { EmptyState, VersionChip, SyncBadge } from '@/components/ui'
import UserAvatar from '@/components/ui/UserAvatar'
import AccountMenuButton from '@/components/auth/AccountMenuButton'
import toast from 'react-hot-toast'
import { createPortal } from 'react-dom'
import AddonIcon from '@/components/entities/AddonIcon'
import { getAddonIconUrl } from '@/utils/addonIcon'
import { useUserAuth } from '@/hooks/useUserAuth'

export default function UserHomePage() {
  const { userId, authKey, userInfo } = useUserAuth()
  const queryClient = useQueryClient()
  const { refreshAllSyncStatus } = useSyncStatusRefresh()
  
  const [viewMode, setViewMode] = useState<'card' | 'list'>(() => {
    if (typeof window !== 'undefined') {
      const raw = String(localStorage.getItem('user-addons-view-mode') || 'card').toLowerCase().trim()
      return raw === 'list' ? 'list' : 'card'
    }
    return 'card'
  })
  const [showAddAddonModal, setShowAddAddonModal] = useState(false)
  const [addonUrl, setAddonUrl] = useState('')
  const [manifestData, setManifestData] = useState<any>(null)
  const [isLoadingManifest, setIsLoadingManifest] = useState(false)
  const [urlError, setUrlError] = useState('')
  const [isAddingAddon, setIsAddingAddon] = useState(false)

  // Fetch addons using React Query
  const { data: addonsData, isLoading: isLoadingAddons, isFetching: isFetchingAddons, refetch: refetchAddons } = useQuery({
    queryKey: ['user-addons', userId],
    queryFn: () => userId && authKey ? publicLibraryAPI.getAddons(userId, authKey) : Promise.resolve(null),
    enabled: !!userId && !!authKey
  })

  // Fetch user info to get updated createdAt, expiresAt
  const { data: updatedUserInfo } = useQuery({
    queryKey: ['user-info', userId],
    queryFn: () => userId && authKey ? publicLibraryAPI.getUserInfo(userId, authKey) : Promise.resolve(null),
    enabled: !!userId && !!authKey,
    select: (data) => data ? {
      ...userInfo,
      createdAt: data.createdAt,
      expiresAt: data.expiresAt,
      colorIndex: data.colorIndex || 0
    } : userInfo
  })

  const displayUserInfo = updatedUserInfo || userInfo

  // Load manifest when URL changes
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
    
    const loadManifest = async () => {
      try {
        setIsLoadingManifest(true)
        
        let fetchUrl = addonUrl.trim()
        if (fetchUrl.startsWith('stremio://')) {
          fetchUrl = fetchUrl.replace(/^stremio:\/\//, 'https://')
        }
        
        const response = await fetch(fetchUrl)
        if (!response.ok) {
          throw new Error(`Failed to fetch manifest: ${response.status}`)
        }
        const data = await response.json()
        setManifestData(data)
      } catch (error: any) {
        setUrlError(error?.message || 'Failed to load manifest. Please check the URL.')
        setManifestData(null)
      } finally {
        setIsLoadingManifest(false)
      }
    }

    const timeoutId = setTimeout(loadManifest, 500)
    return () => clearTimeout(timeoutId)
  }, [addonUrl])

  const handleAddAddon = async () => {
    if (!userId || !addonUrl.trim()) return
    
    if (!manifestData) {
      toast.error('Please wait for manifest to load')
      return
    }
    
    setIsAddingAddon(true)
    try {
      await publicLibraryAPI.addAddon(userId, addonUrl.trim(), manifestData)
      toast.success('Addon added successfully and marked as protected!')
      setAddonUrl('')
      setManifestData(null)
      await refetchAddons()
    } catch (error: any) {
      console.error('Failed to add addon:', error)
      const errorMsg = error?.response?.data?.error || error?.response?.data?.message || error?.message || 'Failed to add addon'
      toast.error(`Failed to add addon: ${errorMsg}`)
    } finally {
      setIsAddingAddon(false)
    }
  }

  const handleExcludeAddon = async (addonId: string) => {
    if (!userId) return
    try {
      await publicLibraryAPI.excludeAddon(userId, addonId)
      await usersAPI.sync(userId)
      await new Promise(resolve => setTimeout(resolve, 500))
      await refetchAddons()
    } catch (error: any) {
      console.error('Failed to exclude addon:', error)
      toast.error(error?.response?.data?.message || error?.message || 'Failed to exclude addon')
    }
  }

  const handleIncludeAddon = async (addonId: string) => {
    if (!userId) return
    try {
      await publicLibraryAPI.includeAddon(userId, addonId)
      await usersAPI.sync(userId)
      await new Promise(resolve => setTimeout(resolve, 500))
      await refetchAddons()
    } catch (error: any) {
      console.error('Failed to include addon:', error)
      toast.error(error?.response?.data?.message || error?.message || 'Failed to include addon')
    }
  }

  const handleRemoveAddon = async (addonName: string) => {
    if (!userId) return
    try {
      await publicLibraryAPI.removeStremioAddon(userId, addonName, false)
      toast.success('Addon removed from Stremio account')
      await refetchAddons()
    } catch (error: any) {
      console.error('Failed to remove addon:', error)
      toast.error(error?.response?.data?.message || error?.message || 'Failed to remove addon')
    }
  }

  if (!userId) {
    return null
  }

  return (
    <>
      <div className="p-3 sm:p-4 md:p-6">
        {/* Header Row with Account Button */}
        <div className="mb-0 lg:mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="hidden lg:block text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Home</h1>
              <p className="hidden lg:block text-base color-text-secondary">Overview of your profile and addons</p>
            </div>
            <div className="hidden lg:block">
              <AccountMenuButton />
            </div>
          </div>
        </div>
        <div className="space-y-6 mt-0 lg:mt-0">

          {/* User Profile Section */}
          <div className="rounded-2xl card p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center gap-6">
              {/* Avatar and Basic Info */}
              <div className="flex items-center gap-4">
                <UserAvatar
                  email={displayUserInfo?.email}
                  username={displayUserInfo?.username || displayUserInfo?.stremioUsername}
                  colorIndex={displayUserInfo?.colorIndex || 0}
                  size="lg"
                />
                <div>
                  <h2 className="text-xl font-bold">
                    {displayUserInfo?.username || displayUserInfo?.stremioUsername || 'User'}
                  </h2>
                  <p className="text-sm color-text-secondary">
                    {displayUserInfo?.email || displayUserInfo?.stremioEmail || 'No email'}
                  </p>
                  {userId && (
                    <div className="mt-2">
                      <SyncBadge
                        userId={userId}
                        onSync={async () => {
                          try {
                            toast.loading('Syncing...', { id: 'sync' })
                            await usersAPI.sync(userId)
                            toast.success('Sync completed!', { id: 'sync' })
                            await refetchAddons()
                            refreshAllSyncStatus(undefined, userId)
                            queryClient.invalidateQueries({ queryKey: ['user', userId, 'sync-status'] })
                            queryClient.refetchQueries({ queryKey: ['user', userId, 'sync-status'] })
                          } catch (error: any) {
                            toast.error(error?.message || 'Sync failed', { id: 'sync' })
                          }
                        }}
                        isSyncing={false}
                      />
                    </div>
                  )}
                </div>
              </div>
              
              {/* Stats */}
              <div className="flex-1 grid grid-cols-5 gap-2 sm:gap-3 sm:ml-auto">
                <div className="text-center p-3 flex flex-col items-center justify-center">
                  <p className="text-2xl font-bold">{addonsData?.stremioAddons?.length || 0}</p>
                  <p className="text-xs color-text-secondary">
                    {(addonsData?.stremioAddons?.length || 0) === 1 ? 'Addon' : 'Addons'}
                  </p>
                </div>
                <div 
                  className="text-center p-3 flex flex-col items-center justify-center cursor-default"
                  title={displayUserInfo?.expiresAt ? formatDate(displayUserInfo.expiresAt) : 'Lifetime membership'}
                >
                  <p className="text-2xl font-bold">
                    {displayUserInfo?.expiresAt 
                      ? Math.max(0, Math.ceil((new Date(displayUserInfo.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
                      : '∞'
                    }
                  </p>
                  <p className="text-xs color-text-secondary">
                    {displayUserInfo?.expiresAt 
                      ? (Math.max(0, Math.ceil((new Date(displayUserInfo.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) === 1 ? 'Day Left' : 'Days Left')
                      : 'Expires'
                    }
                  </p>
                </div>
                {/* Placeholder stats - can be enhanced later */}
                <div className="text-center p-3 flex flex-col items-center justify-center" title="Total movies watched">
                  <p className="text-2xl font-bold">-</p>
                  <p className="text-xs color-text-secondary">Movies</p>
                </div>
                <div className="text-center p-3 flex flex-col items-center justify-center" title="Total series watched">
                  <p className="text-2xl font-bold">-</p>
                  <p className="text-xs color-text-secondary">Series</p>
                </div>
                <div className="text-center p-3 flex flex-col items-center justify-center" title="Total watch time">
                  <p className="text-2xl font-bold">-</p>
                  <p className="text-xs color-text-secondary">Hours</p>
                </div>
              </div>
            </div>
          </div>

          {/* Addons Header */}
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Puzzle className="w-5 h-5" />
              Addons
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAddAddonModal(true)}
                className="p-2 rounded-lg color-hover"
                title="Add addon"
              >
                <Plus className="w-5 h-5" />
              </button>
              <div className="flex rounded-lg border color-border overflow-hidden">
                <button
                  onClick={() => {
                    setViewMode('card')
                    if (typeof window !== 'undefined') {
                      localStorage.setItem('user-addons-view-mode', 'card')
                    }
                  }}
                  className={`p-2 ${viewMode === 'card' ? 'color-surface' : 'color-hover'}`}
                  title="Card view"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                </button>
                <button
                  onClick={() => {
                    setViewMode('list')
                    if (typeof window !== 'undefined') {
                      localStorage.setItem('user-addons-view-mode', 'list')
                    }
                  }}
                  className={`p-2 ${viewMode === 'list' ? 'color-surface' : 'color-hover'}`}
                  title="List view"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <line x1="3" y1="6" x2="21" y2="6" strokeWidth="2" />
                    <line x1="3" y1="12" x2="21" y2="12" strokeWidth="2" />
                    <line x1="3" y1="18" x2="21" y2="18" strokeWidth="2" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Addons List */}
          {/* Wait for data to load - no skeletons */}
          {(!userId || !authKey || isLoadingAddons || (isFetchingAddons && !addonsData)) ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-2 text-sm color-text-secondary">
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                <span>Loading...</span>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Group Addons Section */}
              {addonsData?.groupAddons && addonsData.groupAddons.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium color-text-secondary mb-3 uppercase tracking-wide">Group Addons</h4>
                  {viewMode === 'card' ? (
                    <div className="grid [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))] gap-3">
                      {addonsData.groupAddons.map((addon: any, index: number) => {
                        const manifest = addon.manifest || {}
                        const addonId = addon.id || `group-${index}`
                        const addonName = addon.name || manifest.name || addon.transportName || 'Unknown Addon'
                        const iconUrl = getAddonIconUrl({ customLogo: addon.customLogo, iconUrl: addon.iconUrl, manifest })
                        const isExcluded = addonsData.excludedAddonIds?.includes(addonId) || false
                        
                        return (
                          <div
                            key={addonId}
                            className={`relative rounded-xl card p-4 hover:shadow-md transition-all ${isExcluded ? 'opacity-50' : ''}`}
                          >
                            <div className="flex items-center gap-3">
                              <AddonIcon name={addonName} iconUrl={iconUrl} size="10" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-medium truncate text-sm">{addonName}</h4>
                                  {manifest.version && <VersionChip version={manifest.version} size="sm" />}
                                </div>
                              </div>
                              <button
                                onClick={() => isExcluded ? handleIncludeAddon(addonId) : handleExcludeAddon(addonId)}
                                className={`p-2 rounded-lg transition-colors flex-shrink-0 ${
                                  isExcluded ? 'color-text color-hover' : 'color-text-secondary color-hover'
                                }`}
                                title={isExcluded ? 'Include addon' : 'Exclude addon'}
                              >
                                {isExcluded ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {addonsData.groupAddons.map((addon: any, index: number) => {
                        const manifest = addon.manifest || {}
                        const addonId = addon.id || `group-${index}`
                        const addonName = addon.name || manifest.name || addon.transportName || 'Unknown Addon'
                        const iconUrl = getAddonIconUrl({ customLogo: addon.customLogo, iconUrl: addon.iconUrl, manifest })
                        const isExcluded = addonsData.excludedAddonIds?.includes(addonId) || false
                        
                        return (
                          <div
                            key={addonId}
                            className={`relative rounded-lg card p-3 hover:shadow-sm transition-all ${isExcluded ? 'opacity-50' : ''}`}
                          >
                            <div className="flex items-center gap-3">
                              <AddonIcon name={addonName} iconUrl={iconUrl} size="10" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-medium truncate text-sm">{addonName}</h4>
                                  {manifest.version && <VersionChip version={manifest.version} size="sm" />}
                                </div>
                              </div>
                              <button
                                onClick={() => isExcluded ? handleIncludeAddon(addonId) : handleExcludeAddon(addonId)}
                                className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${
                                  isExcluded ? 'color-text color-hover' : 'color-text-secondary color-hover'
                                }`}
                                title={isExcluded ? 'Include addon' : 'Exclude addon'}
                              >
                                {isExcluded ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Your Addons Section */}
              {addonsData?.stremioAddons && addonsData.stremioAddons.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium color-text-secondary mb-3 uppercase tracking-wide flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    Your Addons
                  </h4>
                  {viewMode === 'card' ? (
                    <div className="grid [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))] gap-3">
                      {addonsData.stremioAddons.map((addon: any, index: number) => {
                        const manifest = addon.manifest || {}
                        const extractNameFromUrl = (url: string) => {
                          try {
                            const parsed = new URL(url)
                            const hostname = parsed.hostname.replace(/^(www\.|api\.|addon\.|stremio\.)/, '')
                            return hostname.split('.')[0] || null
                          } catch { return null }
                        }
                        const addonName = manifest.name || manifest.id || addon.transportName || addon.name || extractNameFromUrl(addon.transportUrl) || 'Unknown Addon'
                        const iconUrl = getAddonIconUrl({ customLogo: addon.customLogo, iconUrl: addon.iconUrl, manifest })
                        const normalizeName = (n: string) => String(n || '').trim().toLowerCase()
                        const addonNameNormalized = normalizeName(addonName)
                        const isInGroupAddons = addonsData.groupAddons?.some((ga: any) => {
                          const gaManifest = ga.manifest || {}
                          const gaName = gaManifest.name || gaManifest.id || ga.transportName || ga.name || ''
                          return normalizeName(gaName) === addonNameNormalized
                        }) || false
                        
                        return (
                          <div
                            key={`user-${index}`}
                            className="relative rounded-xl card p-4 hover:shadow-md transition-all"
                          >
                            <div className="flex items-center gap-3">
                              <AddonIcon name={addonName} iconUrl={iconUrl} size="10" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-medium truncate text-sm">{addonName}</h4>
                                  {manifest.version && <VersionChip version={manifest.version} size="sm" />}
                                </div>
                              </div>
                              {!isInGroupAddons && (
                                <button
                                  onClick={() => handleRemoveAddon(addonName)}
                                  className="p-2 rounded-lg transition-colors flex-shrink-0 color-text-secondary color-hover"
                                  title="Delete addon"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {addonsData.stremioAddons.map((addon: any, index: number) => {
                        const manifest = addon.manifest || {}
                        const extractNameFromUrl = (url: string) => {
                          try {
                            const parsed = new URL(url)
                            const hostname = parsed.hostname.replace(/^(www\.|api\.|addon\.|stremio\.)/, '')
                            return hostname.split('.')[0] || null
                          } catch { return null }
                        }
                        const addonName = manifest.name || manifest.id || addon.transportName || addon.name || extractNameFromUrl(addon.transportUrl) || 'Unknown Addon'
                        const iconUrl = getAddonIconUrl({ customLogo: addon.customLogo, iconUrl: addon.iconUrl, manifest })
                        const normalizeName = (n: string) => String(n || '').trim().toLowerCase()
                        const addonNameNormalized = normalizeName(addonName)
                        const isInGroupAddons = addonsData.groupAddons?.some((ga: any) => {
                          const gaManifest = ga.manifest || {}
                          const gaName = gaManifest.name || gaManifest.id || ga.transportName || ga.name || ''
                          return normalizeName(gaName) === addonNameNormalized
                        }) || false
                        
                        return (
                          <div
                            key={`user-${index}`}
                            className="relative rounded-lg card p-3 hover:shadow-sm transition-all"
                          >
                            <div className="flex items-center gap-3">
                              <AddonIcon name={addonName} iconUrl={iconUrl} size="10" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-medium truncate text-sm">{addonName}</h4>
                                  {manifest.version && <VersionChip version={manifest.version} size="sm" />}
                                </div>
                              </div>
                              {!isInGroupAddons && (
                                <button
                                  onClick={() => handleRemoveAddon(addonName)}
                                  className="p-1.5 rounded-lg transition-colors flex-shrink-0 color-text-secondary color-hover"
                                  title="Delete addon"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {(!addonsData?.groupAddons || addonsData.groupAddons.length === 0) && 
               (!addonsData?.stremioAddons || addonsData.stremioAddons.length === 0) && (
                <EmptyState
                  icon={<Puzzle className="w-16 h-16 mx-auto mb-4 color-text-secondary" />}
                  title="No addons found"
                  description="Click the + button to add your first addon!"
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add Addon Modal */}
      {showAddAddonModal && typeof window !== 'undefined' && document.body && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => {
            setShowAddAddonModal(false)
            setAddonUrl('')
            setManifestData(null)
            setUrlError('')
          }} />
          <div className="relative rounded-2xl border p-6 card shadow-lg max-w-lg w-full mx-4">
            <h2 className="text-xl font-bold theme-text-1 mb-4 flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Add New Addon
            </h2>
            <div className="space-y-4">
              <div>
                <input
                  type="text"
                  value={addonUrl}
                  onChange={(e) => setAddonUrl(e.target.value)}
                  placeholder="https://... or stremio://..."
                  className={`w-full px-4 py-3 rounded-xl input theme-text-1 text-base ${
                    urlError ? 'border-red-500' : ''
                  }`}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !isLoadingManifest && manifestData) {
                      handleAddAddon()
                      setShowAddAddonModal(false)
                    }
                  }}
                  autoFocus
                />
                {isLoadingManifest && (
                  <p className="text-xs theme-text-3 mt-1">Loading manifest...</p>
                )}
                {urlError && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">{urlError}</p>
                )}
                {manifestData && !urlError && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                    ✓ {manifestData.name || 'Addon'} ready to add
                  </p>
                )}
              </div>
              <p className="text-sm theme-text-3">
                Addons you add here will be marked as <span className="font-semibold">protected</span> and added directly to your Stremio account.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowAddAddonModal(false)
                    setAddonUrl('')
                    setManifestData(null)
                    setUrlError('')
                  }}
                  className="px-4 py-2 rounded-lg border color-hover theme-text-1"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    await handleAddAddon()
                    setShowAddAddonModal(false)
                  }}
                  disabled={isAddingAddon || !addonUrl.trim() || !manifestData || isLoadingManifest}
                  className="px-4 py-2 rounded-lg border hover:opacity-80 transition-all theme-text-1 flex items-center gap-2 disabled:opacity-50 font-medium bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 border-purple-300 dark:border-purple-700"
                >
                  <Plus className="w-4 h-4" />
                  {isAddingAddon ? 'Adding...' : 'Add'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

