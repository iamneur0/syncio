'use client'

import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { publicLibraryAPI, usersAPI } from '@/services/api'
import { Film, Tv, Clock, X, Share2, Bookmark, ThumbsUp, Heart, Play, Trash2 } from 'lucide-react'
import { EmptyState } from '@/components/ui'
import UserAvatar from '@/components/ui/UserAvatar'
import toast from 'react-hot-toast'
import { ConfirmDialog, ShareModal } from '@/components/modals'
import PageHeader from '@/components/layout/PageHeader'
import { useUserAuth } from '@/hooks/useUserAuth'

export default function UserLibraryPage() {
  const { userId, authKey } = useUserAuth()
  const [searchTerm, setSearchTerm] = useState('')
  const [userFilter, setUserFilter] = useState<string>('all')
  const [selectedItems, setSelectedItems] = useState<string[]>([])
  const [viewMode, setViewMode] = useState<'card' | 'list'>(() => {
    if (typeof window !== 'undefined') {
      const raw = String(localStorage.getItem('user-library-view-mode') || 'card').toLowerCase().trim()
      return raw === 'list' ? 'list' : 'card'
    }
    return 'card'
  })
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)

  // Fetch users for avatar data (email, colorIndex)
  const { data: allGroupUsers } = useQuery({
    queryKey: ['group-members', userId],
    queryFn: () => userId ? usersAPI.getGroupMembers(userId) : Promise.resolve({ members: [] }),
    enabled: !!userId,
    select: (data) => data?.members || []
  })

  // Filter to only public users
  const publicUsers = useMemo(() => {
    if (!allGroupUsers || !Array.isArray(allGroupUsers)) return []
    return allGroupUsers.filter((user: any) => user.activityVisibility === 'public')
  }, [allGroupUsers])

  // Create stable user IDs array for query key
  const publicUserIds = useMemo(() => {
    return publicUsers.map((u: any) => u.id).sort().join(',')
  }, [publicUsers])

  // Fetch combined library from all public users (or just current user if filter is set)
  const { data: libraryData, isLoading: isLoadingLibrary, isFetching: isFetchingLibrary, refetch: refetchLibrary } = useQuery({
    queryKey: ['user-library', userId, userFilter, publicUserIds],
    queryFn: async () => {
      if (!userId) return null
      
      // If filtering by a specific user, just fetch that user's library
      if (userFilter !== 'all') {
        const data = await publicLibraryAPI.getLibrary(userFilter, userId)
        if (data && !data.library && Array.isArray(data)) {
          return { library: data }
        }
        return data
      }
      
      // Otherwise, fetch all public users' libraries and combine them
      const allLibraries: any[] = []
      
      // Always include current user's library (no requestingUserId needed for own library)
      try {
        const currentUserData = await publicLibraryAPI.getLibrary(userId)
        const currentLibrary = currentUserData?.library || (Array.isArray(currentUserData) ? currentUserData : [])
        allLibraries.push(...currentLibrary.map((item: any) => ({
          ...item,
          _userId: userId
        })))
      } catch (e) {
        console.error('Error fetching current user library:', e)
      }
      
      // Fetch other public users' libraries (pass requestingUserId for security check)
      for (const user of publicUsers) {
        if (user.id === userId) continue // Already fetched
        try {
          const userData = await publicLibraryAPI.getLibrary(user.id, userId)
          const userLibrary = userData?.library || (Array.isArray(userData) ? userData : [])
          allLibraries.push(...userLibrary.map((item: any) => ({
            ...item,
            _userId: user.id,
            _username: user.username || user.email,
            _userColorIndex: user.colorIndex || 0
          })))
        } catch (e) {
          console.error(`Error fetching library for user ${user.id}:`, e)
        }
      }
      
      return { library: allLibraries }
    },
    enabled: !!userId,
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

  // Filter for Library (watched items only)
  const { filteredItems, groupedByDate } = useMemo(() => {
    if (!libraryData?.library || !Array.isArray(libraryData.library)) {
      return { filteredItems: [], groupedByDate: new Map() }
    }
    
    let filtered = libraryData.library.filter((item: any) => {
      const itemId = item._id || item.id
      return typeof itemId === 'string' && itemId.startsWith('tt')
    })
    
    // Library mode: only show items that are in library (removed: false)
    filtered = filtered.filter((item: any) => {
      return item.removed === false || item.removed === undefined || item.removed === null
    })
    
    // Apply user filter
    if (userFilter !== 'all') {
      const filterUserId = String(userFilter).trim()
      filtered = filtered.filter((item: any) => {
        const itemUserId = String(item._userId || '').trim()
        return itemUserId === filterUserId
      })
    }
    
    // Apply search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase()
      filtered = filtered.filter((item: any) => 
        item.name?.toLowerCase().includes(searchLower)
      )
    }
    
    // Group by date
    const getDateKey = (date: Date): string => {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }

    const getWatchDate = (item: any): Date | null => {
      const dates: number[] = []
      if (item._mtime) {
        const d = new Date(item._mtime).getTime()
        if (!isNaN(d)) dates.push(d)
      }
      if (item.state?.lastWatched) {
        const d = new Date(item.state.lastWatched).getTime()
        if (!isNaN(d)) dates.push(d)
      }
      if (dates.length === 0) return null
      return new Date(Math.min(...dates))
    }

    const grouped = new Map<string, any[]>()
    for (const item of filtered) {
      const watchDate = getWatchDate(item)
      if (!watchDate) {
        const unknownKey = 'unknown'
        if (!grouped.has(unknownKey)) {
          grouped.set(unknownKey, [])
        }
        grouped.get(unknownKey)!.push(item)
        continue
      }
      
      const dateKey = getDateKey(watchDate)
      if (!grouped.has(dateKey)) {
        grouped.set(dateKey, [])
      }
      grouped.get(dateKey)!.push(item)
    }

    return { filteredItems: filtered, groupedByDate: grouped }
  }, [libraryData?.library, searchTerm, userFilter])

  const selectedItemsData = useMemo(() => {
    if (!libraryData?.library || selectedItems.length === 0) return []
    return libraryData.library.filter((item: any) => {
      const itemId = item._id || item.id
      return selectedItems.includes(itemId)
    })
  }, [libraryData?.library, selectedItems])

  const handleSelectAll = () => {
    const allIds = filteredItems.map((item: any) => {
      const itemId = item._id || item.id
      return itemId
    }).filter((id: any): id is string => id !== null && id !== undefined)
    setSelectedItems(allIds)
  }

  const handleDeselectAll = () => {
    setSelectedItems([])
  }

  // Create filter options from public users
  const filterOptions = useMemo(() => {
    if (!publicUsers || !Array.isArray(publicUsers)) return []
    
    const options = publicUsers.map((user: any) => ({
      value: user.id,
      label: user.username || user.email,
      colorIndex: user.colorIndex || 0,
      email: user.email,
      username: user.username,
      userId: user.id
    }))
    
    return [
      { value: 'all', label: 'All Users', colorIndex: null },
      ...options
    ]
  }, [publicUsers])

  // Clear selection when filter changes
  React.useEffect(() => {
    setSelectedItems([])
  }, [userFilter, searchTerm])

  const handleItemToggle = (item: any, itemId: string) => {
    if (!itemId) return
    setSelectedItems(prev => 
      prev.includes(itemId) 
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    )
  }

  const handleDeleteClick = () => {
    if (selectedItems.length === 0) return
    setShowDeleteConfirm(true)
  }

  const confirmDeleteItem = async () => {
    if (!userId || selectedItems.length === 0) return

    setIsDeleting(true)
    setShowDeleteConfirm(false)
    
    try {
      const deletePromises = selectedItems.map(async (itemId) => {
        try {
          await publicLibraryAPI.deleteLibraryItem(userId, itemId)
        } catch (error: any) {
          console.error(`Failed to delete item ${itemId}:`, error)
          throw error
        }
      })

      await Promise.all(deletePromises)
      toast.success(`${selectedItems.length} item${selectedItems.length > 1 ? 's' : ''} deleted successfully`)
      setSelectedItems([])
      await refetchLibrary()
    } catch (error: any) {
      console.error('Failed to delete items:', error)
      toast.error(error?.response?.data?.message || error?.message || 'Failed to delete items')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleShareClick = () => {
    if (selectedItems.length === 0) return
    setShowShareModal(true)
  }

  const handleShareComplete = () => {
    setShowShareModal(false)
  }

  const itemsToShare = useMemo(() => {
    return selectedItemsData.map((item: any) => ({
      itemId: item._id || item.id,
      itemName: item.name,
      itemType: item.type,
      poster: item.poster
    }))
  }, [selectedItemsData])

  // Extract media ID for like/love API
  const extractMediaId = (itemId: string): string | null => {
    if (!itemId) return null
    if (itemId.startsWith('tt')) {
      return itemId
    }
    return null
  }

  const handleLikeSelected = async () => {
    if (selectedItems.length === 0 || !userId) return
    const itemsToUpdate = selectedItemsData.filter((item: any) => {
      const mediaId = extractMediaId(item._id || item.id)
      return !!mediaId
    })
    if (itemsToUpdate.length === 0) {
      toast.error('No items with supported ID format selected')
      return
    }
    let successCount = 0
    for (const item of itemsToUpdate) {
      const mediaId = extractMediaId(item._id || item.id)!
      try {
        await usersAPI.updateLikeStatus(userId, mediaId, item.type, 'liked')
        successCount++
      } catch (error: any) {
        console.error(`Failed to like item ${mediaId}:`, error)
      }
    }
    if (successCount > 0) {
      toast.success(`Liked ${successCount} item${successCount > 1 ? 's' : ''}`)
    }
  }

  const handleLoveSelected = async () => {
    if (selectedItems.length === 0 || !userId) return
    const itemsToUpdate = selectedItemsData.filter((item: any) => {
      const mediaId = extractMediaId(item._id || item.id)
      return !!mediaId
    })
    if (itemsToUpdate.length === 0) {
      toast.error('No items with supported ID format selected')
      return
    }
    let successCount = 0
    for (const item of itemsToUpdate) {
      const mediaId = extractMediaId(item._id || item.id)!
      try {
        await usersAPI.updateLikeStatus(userId, mediaId, item.type, 'loved')
        successCount++
      } catch (error: any) {
        console.error(`Failed to love item ${mediaId}:`, error)
      }
    }
    if (successCount > 0) {
      toast.success(`Loved ${successCount} item${successCount > 1 ? 's' : ''}`)
    }
  }

  const handleRemoveLikeSelected = async () => {
    if (selectedItems.length === 0 || !userId) return
    const itemsToUpdate = selectedItemsData.filter((item: any) => {
      const mediaId = extractMediaId(item._id || item.id)
      return !!mediaId
    })
    if (itemsToUpdate.length === 0) {
      toast.error('No items with supported ID format selected')
      return
    }
    let successCount = 0
    for (const item of itemsToUpdate) {
      const mediaId = extractMediaId(item._id || item.id)!
      try {
        await usersAPI.updateLikeStatus(userId, mediaId, item.type, null)
        successCount++
      } catch (error: any) {
        console.error(`Failed to remove like/love from item ${mediaId}:`, error)
      }
    }
    if (successCount > 0) {
      toast.success(`Removed like/love from ${successCount} item${successCount > 1 ? 's' : ''}`)
    }
  }

  const handleToggleLibrary = async () => {
    if (selectedItems.length === 0 || !userId) return
    const allSelectedInLibrary = selectedItemsData.every((item: any) => 
      item.removed === false || item.removed === undefined || item.removed === null
    )
    const addToLibrary = !allSelectedInLibrary
    const itemsToToggle = selectedItemsData.filter((item: any) => {
      const isInLibrary = item.removed === false || item.removed === undefined || item.removed === null
      return addToLibrary ? !isInLibrary : isInLibrary
    })
    if (itemsToToggle.length === 0) {
      toast(`All selected items are already ${addToLibrary ? 'in' : 'out of'} the library`, { icon: 'ℹ️' })
      return
    }
    const toggleItems = itemsToToggle.map((item: any) => ({
      itemId: item._id || item.id,
      itemType: item.type,
      itemName: item.name || 'Unknown',
      poster: item.poster || '',
      addToLibrary
    }))
    try {
      const result = await usersAPI.toggleLibraryItems(userId, toggleItems)
      toast.success(`${addToLibrary ? 'Added' : 'Removed'} ${result.successCount || toggleItems.length} item${toggleItems.length > 1 ? 's' : ''} ${addToLibrary ? 'to' : 'from'} library`)
      await refetchLibrary()
    } catch (error: any) {
      console.error('Failed to toggle library:', error)
      toast.error(error?.response?.data?.message || error?.message || 'Failed to toggle library')
    }
  }

  // Single item action handlers
  const handleSingleToggleLibrary = async (item: any) => {
    if (!userId) return
    const itemId = item._id || item.id
    const isItemInLibrary = (id: string) => {
      if (!libraryData?.library) return false
      const baseId = id?.split(':')[0]
      return libraryData.library.some((libItem: any) => {
        const libId = libItem._id || libItem.id
        if (libItem.removed === true) return false
        if (libId === id) return true
        if (baseId && libId?.startsWith(baseId)) return true
        return false
      })
    }
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
      await refetchLibrary()
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to toggle library')
    }
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
    const itemId = item._id || item.id
    setSelectedItems([itemId])
    setShowShareModal(true)
  }

  const handleSingleDelete = async (item: any) => {
    if (!userId) return
    const itemId = item._id || item.id
    try {
      await publicLibraryAPI.deleteLibraryItem(userId, itemId)
      toast.success('Item deleted')
      await refetchLibrary()
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to delete')
    }
  }

  const formatShortDate = (date: Date) => {
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' + date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  }

  const formatDateHeader = (dateKey: string): string => {
    if (dateKey === 'unknown') return 'Unknown Date'
    const today = new Date()
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`

    if (dateKey === todayKey) return 'Today'
    if (dateKey === yesterdayKey) return 'Yesterday'
    
    const date = new Date(dateKey + 'T00:00:00')
    return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  }

  const formatYear = (year: string | null | undefined): string | null => {
    if (!year) return null
    const yearStr = String(year).trim()
    const cleaned = yearStr.replace(/–\s*$/, '').replace(/-\s*$/, '')
    return cleaned || null
  }

  const getWatchDate = (item: any): Date | null => {
    const dates: number[] = []
    if (item._mtime) {
      const d = new Date(item._mtime).getTime()
      if (!isNaN(d)) dates.push(d)
    }
    if (item.state?.lastWatched) {
      const d = new Date(item.state.lastWatched).getTime()
      if (!isNaN(d)) dates.push(d)
    }
    if (dates.length === 0) return null
    return new Date(Math.min(...dates))
  }

  const renderActionBar = (item: any, isInLibrary: boolean, isListMode: boolean = false) => {
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
            handleSingleDelete(item)
          }}
          className={buttonClass}
          title="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    )
  }

  const renderLibraryItem = (item: any, index: number) => {
    const isMovie = item.type === 'movie'
    const watchDate = getWatchDate(item)
    const formattedYear = formatYear(item.year)
    const itemKey = `${item._id || item.id || index}`
    const itemId = item._id || item.id
    const isSelected = itemId && selectedItems.includes(itemId)
    const isInLibrary = item.removed === false || item.removed === undefined || item.removed === null
    const stremioLink = itemId ? `stremio://detail/${item.type || 'movie'}/${itemId}` : null

    if (viewMode === 'list') {
      return (
        <div
          key={itemKey}
          onClick={() => handleItemToggle(item, itemId)}
          className={`rounded-lg border overflow-hidden hover:shadow-md transition-all card card-selectable cursor-pointer relative group ${
            isSelected ? 'card-selected' : ''
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-stretch flex-1 min-w-0">
            {item.poster && (
                <div className="relative flex-shrink-0 w-20 sm:w-24">
                <img
                  src={item.poster}
                  alt={item.name}
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
                  <h4 className="font-medium truncate text-sm sm:text-base">{item.name}</h4>
                {formattedYear && (
                    <span className="text-xs sm:text-sm color-text-secondary hidden sm:inline">({formattedYear})</span>
                )}
              </div>
                <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm color-text-secondary mt-0.5 sm:mt-1">
                {watchDate && (
                  <div className="flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                      <span className="truncate">{formatShortDate(watchDate)}</span>
                  </div>
                )}
                </div>
              </div>
            </div>
            <div className="flex items-center flex-shrink-0" onClick={(e) => e.stopPropagation()}>
              {renderActionBar(item, isInLibrary, true)}
            </div>
          </div>
        </div>
      )
    }

    // Card view
    return (
      <div
        key={itemKey}
        onClick={() => handleItemToggle(item, itemId)}
        className={`rounded-lg overflow-hidden hover:shadow-md transition-all card-selectable cursor-pointer relative group ${
          isSelected ? 'card-selected' : ''
        }`}
        style={{ width: '100%' }}
      >
        <div className="w-full rounded-t overflow-hidden flex items-center justify-center bg-gray-100 dark:bg-gray-800 relative aspect-[2/3]">
          {item.poster && (
            <img
              src={item.poster}
              alt={item.name}
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
        {renderActionBar(item, isInLibrary)}
        <div className="pb-1 sm:pb-2 text-center">
          {watchDate && (
            <div className="text-[10px] sm:text-xs color-text-secondary">
              {formatShortDate(watchDate)}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (!userId) {
    return null
  }

  return (
    <>
      <div className="p-3 sm:p-4 md:p-6">
      <PageHeader
        title="Library"
        description="Your watch Library"
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search by title..."
        selectedCount={selectedItems.length}
        onSelectAll={handleSelectAll}
        onDeselectAll={handleDeselectAll}
        onAdd={() => {}}
        onDelete={handleDeleteClick}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        isDeleteDisabled={selectedItems.length === 0 || isDeleting}
        onShare={handleShareClick}
        isShareDisabled={selectedItems.length === 0 || !userId}
        onLike={handleLikeSelected}
        onLove={handleLoveSelected}
        filterOptions={filterOptions}
        filterValue={userFilter}
        onFilterChange={setUserFilter}
        filterPlaceholder="Filter by user"
        onRemoveLike={handleRemoveLikeSelected}
        isLikeDisabled={selectedItems.length === 0 || isDeleting}
        isLoveDisabled={selectedItems.length === 0 || isDeleting}
        isRemoveLikeDisabled={selectedItems.length === 0 || isDeleting}
        onToggleLibrary={handleToggleLibrary}
        isToggleLibraryDisabled={selectedItems.length === 0 || isDeleting}
        libraryToggleLabel={(() => {
          if (selectedItems.length === 0) return undefined
          const allInLibrary = selectedItemsData.every((item: any) => 
            item.removed === false || item.removed === undefined || item.removed === null
          )
          return allInLibrary ? 'Remove from Library' : 'Add to Library'
        })()}
      />
      
      {/* Wait for data to load - no skeletons */}
      {isLoadingLibrary && !libraryData ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-2 text-sm color-text-secondary">
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            <span>Loading...</span>
          </div>
        </div>
      ) : filteredItems.length === 0 ? (
        <EmptyState
          icon={<Film className="w-12 h-12 mx-auto mb-4 color-text-secondary" />}
          title="No watch Library found"
          description={searchTerm ? 'Try adjusting your search terms' : 'No library items to display'}
        />
      ) : (
        <div className="space-y-6 mt-6 relative">
          {Array.from(groupedByDate.entries())
            .sort(([dateKeyA], [dateKeyB]) => {
              if (dateKeyA === 'unknown') return 1
              if (dateKeyB === 'unknown') return -1
              return dateKeyB.localeCompare(dateKeyA)
            })
            .map(([dateKey, items]) => (
              <div key={dateKey} className="space-y-3">
                <h3 className="text-lg font-semibold theme-text-1 sticky top-0 bg-opacity-95 py-2 z-10">
                  {dateKey === 'unknown' ? 'Unknown Date' : formatDateHeader(dateKey)}
                </h3>
                <div className={viewMode === 'card' 
                  ? 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-1.5 sm:gap-2 md:gap-3 items-start max-w-full' 
                  : 'space-y-2 sm:space-y-3'}>
                  {items.map((item: any, index: number) => renderLibraryItem(item, index))}
                </div>
              </div>
            ))}
        </div>
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={confirmDeleteItem}
        title="Delete Items"
        description={`Are you sure you want to delete ${selectedItems.length} item${selectedItems.length > 1 ? 's' : ''}? This action cannot be undone.`}
      />

      {showShareModal && userId && (
        <ShareModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          onShareComplete={handleShareComplete}
          items={itemsToShare}
          userId={userId}
        />
      )}
      </div>
    </>
  )
}

