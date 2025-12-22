'use client'

import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { publicLibraryAPI, usersAPI } from '@/services/api'
import { Film, Tv, X, Share2, Bookmark, ThumbsUp, Heart, Play, Trash2 } from 'lucide-react'
import { EmptyState } from '@/components/ui'
import UserAvatar from '@/components/ui/UserAvatar'
import toast from 'react-hot-toast'
import PageHeader from '@/components/layout/PageHeader'
import { useUserAuth } from '@/hooks/useUserAuth'

export default function UserSharesPage() {
  const { userId, authKey } = useUserAuth()
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState<'card' | 'list'>(() => {
    if (typeof window !== 'undefined') {
      const raw = String(localStorage.getItem('user-shares-view-mode') || 'card').toLowerCase().trim()
      return raw === 'list' ? 'list' : 'card'
    }
    return 'card'
  })

  // Fetch users for avatar data (email, colorIndex)
  const { data: allGroupUsers } = useQuery({
    queryKey: ['group-members', userId],
    queryFn: () => userId ? usersAPI.getGroupMembers(userId) : Promise.resolve({ members: [] }),
    enabled: !!userId,
    select: (data) => data?.members || []
  })

  // Create user map for quick lookup by username
  const userMap = useMemo(() => {
    if (!allGroupUsers || !Array.isArray(allGroupUsers)) return new Map()
    const map = new Map()
    allGroupUsers.forEach((user: any) => {
      const username = user.username || user.email
      if (username) {
        map.set(username, {
          id: user.id,
          username: user.username,
          email: user.email,
          colorIndex: user.colorIndex || 0
        })
      }
    })
    return map
  }, [allGroupUsers])

  const [selectedShares, setSelectedShares] = useState<string[]>([])
  const [sharesUserFilter, setSharesUserFilter] = useState<string>('all')
  const [isDeleting, setIsDeleting] = useState(false)

  // Fetch shares using React Query (like admin pages)
  const { data: sharesData, isLoading: isLoadingShares, isFetching: isFetchingShares, refetch: refetchShares } = useQuery({
    queryKey: ['user-shares', userId],
    queryFn: () => userId ? usersAPI.getShares(userId) : Promise.resolve({ sent: [], received: [] }),
    enabled: !!userId
  })

  // Fetch library data to check if items are in library
  const { data: libraryData } = useQuery({
    queryKey: ['user-shares-library', userId],
    queryFn: async () => {
      if (!userId) return null
      const data = await publicLibraryAPI.getLibrary(userId)
      return data?.library || (Array.isArray(data) ? data : [])
    },
    enabled: !!userId,
    select: (data) => data ? { library: Array.isArray(data) ? data : (data.library || []) } : null
  })

  const handleShareToggle = (shareId: string) => {
    if (!shareId) return
    setSelectedShares(prev => 
      prev.includes(shareId) 
        ? prev.filter(id => id !== shareId)
        : [...prev, shareId]
    )
  }

  const handleSelectAllShares = () => {
    if (!sharesData) return
    const allShareIds = [
      ...sharesData.received.map((s: any) => s.id),
      ...sharesData.sent.map((s: any) => s.id)
    ].filter((id): id is string => !!id)
    setSelectedShares(allShareIds)
  }

  const handleDeselectAllShares = () => {
    setSelectedShares([])
  }

  const handleBulkDeleteShares = async () => {
    if (selectedShares.length === 0 || !userId) return
    setIsDeleting(true)
    try {
      await Promise.all(selectedShares.map(shareId => 
        usersAPI.removeShare(userId, shareId)
      ))
      toast.success(`${selectedShares.length} share${selectedShares.length > 1 ? 's' : ''} removed`)
      setSelectedShares([])
      await refetchShares()
    } catch (error: any) {
      console.error('Failed to delete shares:', error)
      toast.error(error?.response?.data?.message || error?.message || 'Failed to delete shares')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleBulkAddToLibrary = async () => {
    if (selectedShares.length === 0 || !userId || !sharesData) return
    const receivedToAdd = sharesData.received.filter((s: any) => selectedShares.includes(s.id))
    if (receivedToAdd.length === 0) {
      toast.error('No received shares selected to add')
      return
    }
    setIsDeleting(true)
    try {
      await Promise.all(receivedToAdd.map((share: any) => handleAddSharedToLibrary(share)))
      toast.success(`${receivedToAdd.length} item${receivedToAdd.length > 1 ? 's' : ''} added to library`)
      setSelectedShares([])
    } catch (error: any) {
      console.error('Failed to add items to library:', error)
      toast.error(error?.response?.data?.message || error?.message || 'Failed to add items')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleAddSharedToLibrary = async (share: any) => {
    if (!userId) return
    try {
      await usersAPI.toggleLibraryItems(userId, [{
        itemId: share.itemId,
        itemType: share.itemType || 'movie',
        itemName: share.itemName,
        poster: share.poster,
        addToLibrary: true
      }])
      toast.success(`Added "${share.itemName}" to your library`)
    } catch (error: any) {
      console.error('Failed to add shared item to library:', error)
      toast.error(error?.response?.data?.message || error?.message || 'Failed to add to library')
    }
  }

  const isItemInLibrary = (itemId: string) => {
    if (!libraryData?.library) return false
    const baseId = itemId?.split(':')[0]
    return libraryData.library.some((item: any) => {
      const id = item._id || item.id
      if (item.removed === true) return false
      if (id === itemId) return true
      if (baseId && id?.startsWith(baseId)) return true
      return false
    })
  }

  const handleSingleDeleteShare = async (shareId: string) => {
    if (!userId || !shareId) return
    try {
      await usersAPI.removeShare(userId, shareId)
      toast.success('Share removed')
      await refetchShares()
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to remove share')
    }
  }

  const extractMediaId = (itemId: string): string | null => {
    if (!itemId) return null
    if (itemId.startsWith('tt')) {
      return itemId
    }
    return null
  }

  const handleSingleLike = async (item: any) => {
    if (!userId) return
    const mediaId = extractMediaId(item._id || item.id)
    if (!mediaId) {
      toast.error('Unsupported ID format')
      return
    }
    try {
      await usersAPI.updateLikeStatus(userId, mediaId, item.type, 'liked')
      toast.success('Liked')
    } catch (error: any) {
      toast.error('Failed to like')
    }
  }

  const handleSingleLove = async (item: any) => {
    if (!userId) return
    const mediaId = extractMediaId(item._id || item.id)
    if (!mediaId) {
      toast.error('Unsupported ID format')
      return
    }
    try {
      await usersAPI.updateLikeStatus(userId, mediaId, item.type, 'loved')
      toast.success('Loved')
    } catch (error: any) {
      toast.error('Failed to love')
    }
  }

  const handleSingleRemoveLike = async (item: any) => {
    if (!userId) return
    const mediaId = extractMediaId(item._id || item.id)
    if (!mediaId) {
      toast.error('Unsupported ID format')
      return
    }
    try {
      await usersAPI.updateLikeStatus(userId, mediaId, item.type, null)
      toast.success('Status removed')
    } catch (error: any) {
      toast.error('Failed to remove status')
    }
  }

  const handleSingleShare = (item: any) => {
    // Share functionality - could open share modal
    toast('Share feature coming soon', { icon: 'ℹ️' })
  }

  const handleSingleToggleLibrary = async (item: any) => {
    if (!userId) return
    const itemId = item._id || item.id
    const currentlyInLibrary = isItemInLibrary(itemId)
    const addToLibrary = !currentlyInLibrary
    try {
      await usersAPI.toggleLibraryItems(userId, [{
        itemId,
        itemType: item.type,
        itemName: item.name || 'Unknown',
        poster: item.poster || '',
        addToLibrary
      }])
      toast.success(addToLibrary ? 'Added to library' : 'Removed from library')
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to toggle library')
    }
  }

  const renderActionBar = (item: any, isInLibrary: boolean, isListMode: boolean = false, shareId?: string) => {
    const buttonClass = isListMode 
      ? 'p-2 rounded surface-interactive color-text'
      : 'flex-1 py-2 rounded-none color-text hover:opacity-70 flex items-center justify-center'
    
    return (
      <div className={isListMode 
        ? 'grid grid-cols-3 gap-1 sm:flex sm:items-center sm:gap-1 flex-shrink-0 mr-2 sm:mr-3' 
        : 'flex items-stretch w-full -mx-0'
      }>
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleSingleToggleLibrary(item)
          }}
          className={buttonClass}
          title={isInLibrary ? 'Remove from library' : 'Add to library'}
        >
          <Bookmark className={`w-4 h-4 ${isInLibrary ? 'fill-current' : ''}`} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleSingleLike(item)
          }}
          className={buttonClass}
          title="Like"
        >
          <ThumbsUp className="w-4 h-4" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleSingleLove(item)
          }}
          className={buttonClass}
          title="Love"
        >
          <Heart className="w-4 h-4" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleSingleRemoveLike(item)
          }}
          className={buttonClass}
          title="Remove status"
        >
          <X className="w-4 h-4" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleSingleShare(item)
          }}
          className={buttonClass}
          title="Share"
        >
          <Share2 className="w-4 h-4" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (shareId) {
              handleSingleDeleteShare(shareId)
            }
          }}
          className={buttonClass}
          title="Remove share"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    )
  }

  if (!userId) {
    return null
  }

  // Filter shares based on user filter
  const filteredReceived = sharesData && sharesUserFilter === 'all' 
    ? sharesData.received 
    : sharesData?.received.filter(s => s.sharedByUsername === sharesUserFilter) || []
  const filteredSent = sharesData && sharesUserFilter === 'all'
    ? sharesData.sent
    : sharesData?.sent.filter(s => s.sharedWithUsername === sharesUserFilter) || []

  const filterOptions = sharesData && (sharesData.received.length > 0 || sharesData.sent.length > 0) ? (() => {
    const uniqueUsers = new Map<string, { username: string; email: string | null; colorIndex: number }>()
    sharesData.received.forEach((s: any) => {
      if (!uniqueUsers.has(s.sharedByUsername)) {
        const userInfo = userMap.get(s.sharedByUsername)
        uniqueUsers.set(s.sharedByUsername, { 
          username: s.sharedByUsername, 
          email: userInfo?.email || null,
          colorIndex: userInfo?.colorIndex ?? s.sharedByColorIndex ?? 0 
        })
      }
    })
    sharesData.sent.forEach((s: any) => {
      if (!uniqueUsers.has(s.sharedWithUsername)) {
        const userInfo = userMap.get(s.sharedWithUsername)
        uniqueUsers.set(s.sharedWithUsername, { 
          username: s.sharedWithUsername, 
          email: userInfo?.email || null,
          colorIndex: userInfo?.colorIndex ?? s.sharedWithColorIndex ?? 0 
        })
      }
    })
    const userList = Array.from(uniqueUsers.values()).sort((a, b) => a.username.localeCompare(b.username))
    
    return [
      { value: 'all', label: 'All Users' },
      ...userList.map(user => ({
        value: user.username,
        label: user.username,
        username: user.username,
        email: user.email,
        colorIndex: user.colorIndex
      }))
    ]
  })() : undefined

  return (
    <>
      <div className="p-3 sm:p-4 md:p-6">
      <PageHeader
        title="Shares"
        description="Shared items"
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search by title..."
        selectedCount={selectedShares.length}
        onSelectAll={handleSelectAllShares}
        onDeselectAll={handleDeselectAllShares}
        onAdd={() => {}}
        onDelete={handleBulkDeleteShares}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        isDeleteDisabled={selectedShares.length === 0 || isDeleting}
        onToggleLibrary={handleBulkAddToLibrary}
        isToggleLibraryDisabled={selectedShares.length === 0 || isDeleting}
        libraryToggleLabel="Add to Library"
        filterOptions={filterOptions}
        filterValue={sharesUserFilter}
        onFilterChange={setSharesUserFilter}
        filterPlaceholder="Filter by user"
      />
      
      {/* Wait for data to load - no skeletons */}
      {isLoadingShares && !sharesData ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-2 text-sm color-text-secondary">
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            <span>Loading...</span>
          </div>
        </div>
      ) : (!sharesData || (sharesData.received.length === 0 && sharesData.sent.length === 0)) ? (
        <EmptyState
          icon={<Share2 className="w-12 h-12 mx-auto mb-4 color-text-secondary" />}
          title="No shares found"
          description="Items shared with you or by you will appear here"
        />
      ) : (
        <div className="space-y-6 mt-6 relative">
          {/* Received Shares */}
          {filteredReceived.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold theme-text-1 sticky top-0 bg-opacity-95 py-2 z-10">Shared with You</h3>
              <div className={viewMode === 'card' 
                ? 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-1.5 sm:gap-2 md:gap-3'
                : 'space-y-2 sm:space-y-3'}>
                {filteredReceived.map((share: any) => {
                  const isSelected = selectedShares.includes(share.id)
                  const shareDate = share.createdAt ? new Date(share.createdAt) : null
                  const formattedDate = shareDate ? shareDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' + shareDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''
                  const stremioLink = share.itemId ? `stremio://detail/${share.itemType || 'movie'}/${share.itemId}` : null
                  const shareItem = {
                    _id: share.itemId,
                    id: share.itemId,
                    type: share.itemType || 'movie',
                    name: share.itemName,
                    poster: share.poster
                  }
                  const shareItemInLibrary = isItemInLibrary(share.itemId)
                  const isMovie = share.itemType === 'movie'

                  if (viewMode === 'list') {
                    return (
                      <div
                        key={share.id}
                        onClick={() => handleShareToggle(share.id)}
                        className={`rounded-lg border overflow-hidden hover:shadow-md transition-all card card-selectable cursor-pointer relative group ${
                          isSelected ? 'card-selected' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-stretch flex-1 min-w-0">
                            {share.poster && (
                              <div className="relative flex-shrink-0 w-20 sm:w-24">
                                <img
                                  src={share.poster}
                                  alt={share.itemName}
                                  className="w-full h-full object-cover"
                                  style={{ minHeight: '100px' }}
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none'
                                  }}
                                />
                                {stremioLink && (
                                  <a
                                    href={stremioLink}
                                    onClick={(e) => e.stopPropagation()}
                                    className="absolute top-1 right-1 rounded-full p-1 hover:opacity-80 transition-opacity"
                                    style={{ backgroundColor: 'var(--color-text-secondary)' }}
                                    title="Open in Stremio"
                                  >
                                    <Play className="w-3 h-3" fill="var(--color-surface)" style={{ color: 'var(--color-surface)' }} />
                                  </a>
                                )}
                              </div>
                            )}
                            <div className="flex-1 min-w-0 flex flex-col justify-center px-2 sm:px-4 py-2 sm:py-3">
                              <div className="flex items-center gap-1 sm:gap-2">
                                {isMovie ? (
                                  <Film className="w-3 h-3 sm:w-4 sm:h-4 color-text-secondary flex-shrink-0" />
                                ) : (
                                  <Tv className="w-3 h-3 sm:w-4 sm:h-4 color-text-secondary flex-shrink-0" />
                                )}
                                <h4 className="font-medium truncate text-sm sm:text-base">{share.itemName}</h4>
                              </div>
                              <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm color-text-secondary mt-0.5 sm:mt-1">
                                {sharesUserFilter === 'all' && (() => {
                                  const userInfo = userMap.get(share.sharedByUsername)
                                  return (
                                    <span className="truncate flex items-center gap-1">
                                      <UserAvatar 
                                        username={share.sharedByUsername} 
                                        email={userInfo?.email || null}
                                        colorIndex={userInfo?.colorIndex ?? share.sharedByColorIndex ?? 0}
                                        size="xs" 
                                      />
                                      <span>{share.sharedByUsername}</span>
                                    </span>
                                  )
                                })()}
                                {formattedDate && (
                                  <span className="truncate">{formattedDate}</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                            {renderActionBar(shareItem, shareItemInLibrary, true, share.id)}
                          </div>
                        </div>
                      </div>
                    )
                  }

                  return (
                    <div
                      key={share.id}
                      onClick={() => handleShareToggle(share.id)}
                      className={`rounded-lg overflow-hidden hover:shadow-md transition-all relative group card-selectable cursor-pointer ${
                        isSelected ? 'card-selected' : ''
                      }`}
                      style={{ width: '100%' }}
                    >
                      <div className="w-full rounded-t overflow-hidden flex items-center justify-center bg-gray-100 dark:bg-gray-800 relative aspect-[2/3]">
                        {share.poster && (
                          <img
                            src={share.poster}
                            alt={share.itemName}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none'
                            }}
                          />
                        )}
                        {stremioLink && (
                          <a
                            href={stremioLink}
                            onClick={(e) => e.stopPropagation()}
                            className="absolute top-1 right-1 sm:top-2 sm:right-2 rounded-full p-1 sm:p-1.5 hover:opacity-80 transition-opacity"
                            style={{ backgroundColor: 'var(--color-text-secondary)' }}
                            title="Open in Stremio"
                          >
                            <Play className="w-3 h-3 sm:w-4 sm:h-4" fill="var(--color-surface)" style={{ color: 'var(--color-surface)' }} />
                          </a>
                        )}
                      </div>
                      {renderActionBar(shareItem, shareItemInLibrary, false, share.id)}
                      <div className="pb-1 sm:pb-2 text-center">
                        {sharesUserFilter === 'all' && (() => {
                          const userInfo = userMap.get(share.sharedByUsername)
                          return (
                            <p className="text-[10px] sm:text-xs color-text-secondary truncate px-1 flex items-center justify-center gap-1">
                              <UserAvatar 
                                username={share.sharedByUsername} 
                                email={userInfo?.email || null}
                                colorIndex={userInfo?.colorIndex ?? share.sharedByColorIndex ?? 0}
                                size="sm" 
                              />
                              <span>{share.sharedByUsername}</span>
                            </p>
                          )
                        })()}
                        {formattedDate && (
                          <p className="text-[10px] sm:text-xs color-text-secondary mt-0.5">{formattedDate}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Sent Shares */}
          {filteredSent.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold theme-text-1 sticky top-0 bg-opacity-95 py-2 z-10">Shared by You</h3>
              <div className={viewMode === 'card' 
                ? 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-1.5 sm:gap-2 md:gap-3'
                : 'space-y-2 sm:space-y-3'}>
                {filteredSent.map((share: any) => {
                  const isSelected = selectedShares.includes(share.id)
                  const shareDate = share.createdAt ? new Date(share.createdAt) : null
                  const formattedDate = shareDate ? shareDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' + shareDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''
                  const stremioLink = share.itemId ? `stremio://detail/${share.itemType || 'movie'}/${share.itemId}` : null
                  const shareItem = {
                    _id: share.itemId,
                    id: share.itemId,
                    type: share.itemType || 'movie',
                    name: share.itemName,
                    poster: share.poster
                  }
                  const shareItemInLibrary = isItemInLibrary(share.itemId)
                  const isMovie = share.itemType === 'movie'

                  if (viewMode === 'list') {
                    return (
                      <div
                        key={share.id}
                        onClick={() => handleShareToggle(share.id)}
                        className={`rounded-lg border overflow-hidden hover:shadow-md transition-all card card-selectable cursor-pointer relative group ${
                          isSelected ? 'card-selected' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-stretch flex-1 min-w-0">
                            {share.poster && (
                              <div className="relative flex-shrink-0 w-20 sm:w-24">
                                <img
                                  src={share.poster}
                                  alt={share.itemName}
                                  className="w-full h-full object-cover"
                                  style={{ minHeight: '100px' }}
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none'
                                  }}
                                />
                                {stremioLink && (
                                  <a
                                    href={stremioLink}
                                    onClick={(e) => e.stopPropagation()}
                                    className="absolute top-1 right-1 rounded-full p-1 hover:opacity-80 transition-opacity"
                                    style={{ backgroundColor: 'var(--color-text-secondary)' }}
                                    title="Open in Stremio"
                                  >
                                    <Play className="w-3 h-3" fill="var(--color-surface)" style={{ color: 'var(--color-surface)' }} />
                                  </a>
                                )}
                              </div>
                            )}
                            <div className="flex-1 min-w-0 flex flex-col justify-center px-2 sm:px-4 py-2 sm:py-3">
                              <div className="flex items-center gap-1 sm:gap-2">
                                {isMovie ? (
                                  <Film className="w-3 h-3 sm:w-4 sm:h-4 color-text-secondary flex-shrink-0" />
                                ) : (
                                  <Tv className="w-3 h-3 sm:w-4 sm:h-4 color-text-secondary flex-shrink-0" />
                                )}
                                <h4 className="font-medium truncate text-sm sm:text-base">{share.itemName}</h4>
                              </div>
                              <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm color-text-secondary mt-0.5 sm:mt-1">
                                {sharesUserFilter === 'all' && (() => {
                                  const userInfo = userMap.get(share.sharedWithUsername)
                                  return (
                                    <span className="truncate flex items-center gap-1">
                                      <UserAvatar 
                                        username={share.sharedWithUsername} 
                                        email={userInfo?.email || null}
                                        colorIndex={userInfo?.colorIndex ?? share.sharedWithColorIndex ?? 0}
                                        size="xs" 
                                      />
                                      <span>{share.sharedWithUsername}</span>
                                    </span>
                                  )
                                })()}
                                {formattedDate && (
                                  <span className="truncate">{formattedDate}</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                            {renderActionBar(shareItem, shareItemInLibrary, true, share.id)}
                          </div>
                        </div>
                      </div>
                    )
                  }

                  return (
                    <div
                      key={share.id}
                      onClick={() => handleShareToggle(share.id)}
                      className={`rounded-lg overflow-hidden hover:shadow-md transition-all relative group card-selectable cursor-pointer ${
                        isSelected ? 'card-selected' : ''
                      }`}
                      style={{ width: '100%' }}
                    >
                      <div className="w-full rounded-t overflow-hidden flex items-center justify-center bg-gray-100 dark:bg-gray-800 relative aspect-[2/3]">
                        {share.poster && (
                          <img
                            src={share.poster}
                            alt={share.itemName}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none'
                            }}
                          />
                        )}
                        {stremioLink && (
                          <a
                            href={stremioLink}
                            onClick={(e) => e.stopPropagation()}
                            className="absolute top-1 right-1 sm:top-2 sm:right-2 rounded-full p-1 sm:p-1.5 hover:opacity-80 transition-opacity"
                            style={{ backgroundColor: 'var(--color-text-secondary)' }}
                            title="Open in Stremio"
                          >
                            <Play className="w-3 h-3 sm:w-4 sm:h-4" fill="var(--color-surface)" style={{ color: 'var(--color-surface)' }} />
                          </a>
                        )}
                      </div>
                      {renderActionBar(shareItem, shareItemInLibrary, false, share.id)}
                      <div className="pb-1 sm:pb-2 text-center">
                        {sharesUserFilter === 'all' && (() => {
                          const userInfo = userMap.get(share.sharedWithUsername)
                          return (
                            <p className="text-[10px] sm:text-xs color-text-secondary truncate px-1 flex items-center justify-center gap-1">
                              <UserAvatar 
                                username={share.sharedWithUsername} 
                                email={userInfo?.email || null}
                                colorIndex={userInfo?.colorIndex ?? share.sharedWithColorIndex ?? 0}
                                size="sm" 
                              />
                              <span>{share.sharedWithUsername}</span>
                            </p>
                          )
                        })()}
                        {formattedDate && (
                          <p className="text-[10px] sm:text-xs color-text-secondary mt-0.5">{formattedDate}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
      </div>
    </>
  )
}

