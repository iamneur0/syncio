'use client'

import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usersAPI } from '@/services/api'
import PageHeader from '@/components/layout/PageHeader'
import { Film, Tv, Clock, BookOpen, Bookmark, ThumbsUp, Heart, BookmarkPlus, BookmarkMinus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { formatDate, formatDateSeparate } from '@/utils/dateUtils'
import { EmptyState, ToggleButton } from '@/components/ui'
import { useTheme } from '@/contexts/ThemeContext'
import { getEntityColorStyles } from '@/utils/colorMapping'
import UserAvatar from '@/components/ui/UserAvatar'
import ConfirmDialog from '@/components/modals/ConfirmDialog'
import { createPortal } from 'react-dom'

export default function ActivityPage() {
  const { theme } = useTheme()
  const [searchTerm, setSearchTerm] = useState('')
  const [userFilter, setUserFilter] = useState<string>('all')
  const [selectedItems, setSelectedItems] = useState<string[]>([])
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [likeStatus, setLikeStatus] = useState<Map<string, 'liked' | 'loved' | null>>(new Map())
  const [updatingLike, setUpdatingLike] = useState<Set<string>>(new Set())
  const [viewType, setViewType] = useState<'library' | 'history'>(() => {
    if (typeof window !== 'undefined') {
      const raw = String(localStorage.getItem('activity-view-type') || 'history').toLowerCase().trim()
      return raw === 'library' ? 'library' : 'history'
    }
    return 'history'
  })
  const [viewMode, setViewMode] = useState<'card' | 'list'>(() => {
    if (typeof window !== 'undefined') {
      const raw = String(localStorage.getItem('activity-view-mode') || 'card').toLowerCase().trim()
      return raw === 'list' ? 'list' : 'card'
    }
    return 'card'
  })

  // Fetch combined library/watch history from all users
  const { data: libraryData, isLoading: isLoadingLibrary, isFetching: isFetchingLibrary, refetch: refetchLibrary } = useQuery({
    queryKey: ['activity', 'library'],
    queryFn: () => usersAPI.getActivityLibrary(),
  })

  // Get selected items data
  // selectedItems contains composite keys: `${userId}-${itemId}`
  const selectedItemsData = useMemo(() => {
    if (!libraryData?.library || selectedItems.length === 0) return []
    return libraryData.library.filter((item: any) => {
      const itemId = item._id || item.id
      const userId = item._userId
      if (!itemId || !userId) return false
      const compositeKey = `${userId}-${itemId}`
      return selectedItems.includes(compositeKey)
    })
  }, [libraryData?.library, selectedItems])

  // Toggle item selection using composite key (userId-itemId) to handle same show watched by multiple users
  const handleItemToggle = (item: any, itemId: string) => {
    if (!itemId) return
    const userId = item._userId
    if (!userId) return
    
    const compositeKey = `${userId}-${itemId}`
    setSelectedItems(prev => {
      const newSelection = prev.includes(compositeKey) 
        ? prev.filter(id => id !== compositeKey)
        : [...prev, compositeKey]
      return newSelection
    })
  }

  // Select all visible items
  const handleSelectAll = () => {
    const allIds = filteredItems.map((item: any) => {
      const itemId = item._id || item.id
      const userId = item._userId
      if (!itemId || !userId) return null
      return `${userId}-${itemId}`
    }).filter((id): id is string => id !== null)
    setSelectedItems(allIds)
  }

  // Deselect all items
  const handleDeselectAll = () => {
    setSelectedItems([])
  }

  // Handle delete button click
  const handleDeleteClick = () => {
    if (selectedItems.length === 0) return
    setShowDeleteConfirm(true)
  }

  // Confirm delete
  const handleConfirmDelete = async () => {
    if (selectedItems.length === 0) return

    setIsDeleting(true)
    setShowDeleteConfirm(false)

    try {
      // Delete all selected items
      const deletePromises = selectedItemsData.map(async (item: any) => {
        if (!item._userId || !item._id) {
          console.warn('Skipping item with missing user or item ID:', item)
          return
        }
        const itemId = item._id || item.id
        if (!itemId) {
          console.warn('Skipping item with missing item ID:', item)
          return
        }
        try {
          await usersAPI.deleteLibraryItem(item._userId, itemId)
        } catch (error: any) {
          console.error(`Failed to delete item ${itemId}:`, error)
          throw error
        }
      })

      await Promise.all(deletePromises)
      toast.success(`Deleted ${selectedItems.length} item${selectedItems.length > 1 ? 's' : ''} successfully`)
      setSelectedItems([])
      await refetchLibrary()
    } catch (error: any) {
      console.error('Failed to delete items:', error)
      toast.error(error?.response?.data?.message || error?.message || 'Failed to delete items')
    } finally {
      setIsDeleting(false)
    }
  }

  // Fetch users for filter dropdown
  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: usersAPI.getAll,
  })

  // Create user map for quick lookup (keyed by both ID and username/email)
  const userMap = useMemo(() => {
    if (!users || !Array.isArray(users)) return new Map()
    const map = new Map()
    users.forEach((user: any) => {
      const username = user.username || user.email
      const userInfo = {
        id: user.id,
        username: user.username,
        email: user.email,
        colorIndex: user.colorIndex || 0
      }
      // Map by ID (primary key)
      map.set(user.id, userInfo)
      // Also map by username/email for backward compatibility
      map.set(username, userInfo)
    })
    return map
  }, [users])

  // Create filter options from users
  const filterOptions = useMemo(() => {
    if (!users || !Array.isArray(users)) return []
    
    // Get unique user IDs from library items (more reliable than usernames)
    const userIdsInLibrary = new Set<string>()
    if (libraryData?.library) {
      libraryData.library.forEach((item: any) => {
        if (item._userId) {
          userIdsInLibrary.add(item._userId)
        }
      })
    }
    
    // Create filter options from users that have activity
    const options = users
      .filter((user: any) => {
        return userIdsInLibrary.has(user.id)
      })
      .map((user: any) => ({
        value: user.id, // Use user ID as the filter value
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
  }, [users, libraryData?.library])

  // Helper to render user avatar
  const renderUserAvatar = (username: string, colorIndex: number | null | undefined, size: 'sm' | 'md' = 'md') => {
    const userInfo = username ? userMap.get(username) : null
    const idx = colorIndex !== null && colorIndex !== undefined ? colorIndex : (userInfo?.colorIndex || 0)
    const email = userInfo?.email || null
    
    return (
      <UserAvatar
        email={email}
        username={username}
        colorIndex={idx}
        size={size}
      />
    )
  }

  // Helper to get watch date from item
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

  // Helper to format date for grouping (returns date key like "2025-12-14")
  const getDateKey = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // Helper to format date header (Today, Yesterday, or formatted date)
  const formatDateHeader = (dateKey: string): string => {
    const today = new Date()
    const todayKey = getDateKey(today)
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayKey = getDateKey(yesterday)

    if (dateKey === todayKey) return 'Today'
    if (dateKey === yesterdayKey) return 'Yesterday'
    
    const date = new Date(dateKey + 'T00:00:00')
    return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  }

  // Helper function to check if an item has been watched
  // An item is considered "watched" if it has watch data:
  // - Has _ctime (creation time = first watch time)
  // - OR has lastWatched in state
  // - OR has timesWatched > 0
  // - OR has overallTimeWatched > 0
  // - OR has video_id (episode watched)
  // - OR has watched string (watch progress)
  // temp: true also indicates watched (for items not in library)
  const isItemWatched = (item: any): boolean => {
    // temp: true = watched but not in library
    if (item.temp === true) return true
    
    // Check for watch data indicators
    const hasCtime = item._ctime && item._ctime.trim() !== ''
    const hasLastWatched = item.state?.lastWatched && item.state.lastWatched.trim() !== ''
    const hasTimesWatched = (item.state?.timesWatched || 0) > 0
    const hasOverallTimeWatched = (item.state?.overallTimeWatched || 0) > 0
    const hasVideoId = item.state?.video_id && item.state.video_id.trim() !== ''
    const hasWatchedString = item.state?.watched && item.state.watched.trim() !== ''
    
    return hasCtime || hasLastWatched || hasTimesWatched || hasOverallTimeWatched || hasVideoId || hasWatchedString
  }

  // Filter and search library items, then group by date
  const { filteredItems, groupedByDate } = useMemo(() => {
    if (!libraryData?.library || !Array.isArray(libraryData.library)) return { filteredItems: [], groupedByDate: new Map() }
    
    // Only keep items whose ID starts with an IMDb id ("tt...")
    let filtered = libraryData.library.filter((item: any) => {
      const itemId = item._id || item.id
      return typeof itemId === 'string' && itemId.startsWith('tt')
    })
    
    // Apply view type filter (Library vs History)
    if (viewType === 'history') {
      // History mode: show ALL watched items (regardless of removed status)
      // removed only indicates if item is in library, not watch status
      filtered = filtered.filter((item: any) => {
        return isItemWatched(item)
      })
    } else {
      // Library mode: only show items that are in library (removed: false)
      // removed: false = in library, removed: true = not in library
      filtered = filtered.filter((item: any) => {
        return item.removed === false || item.removed === undefined || item.removed === null;
      })
    }
    
    // Apply user filter - match by user ID (exact match from cached library files)
    if (userFilter !== 'all') {
      const filterUserId = String(userFilter).trim()
      
      filtered = filtered.filter((item: any) => {
        // Match by _userId which comes from the cached library files
        const itemUserId = String(item._userId || '').trim()
        return itemUserId === filterUserId
      })
    }
    
    // Apply search filter (only by title)
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase()
      filtered = filtered.filter((item: any) => {
        const name = (item.name || '').toLowerCase()
        return name.includes(searchLower)
      })
    }
    
    // Sort filtered results by watch date (most recent first)
    const sorted = [...filtered].sort((a: any, b: any) => {
      const dateA = getWatchDate(a)
      const dateB = getWatchDate(b)
      
      if (!dateA && !dateB) return 0
      if (!dateA) return 1
      if (!dateB) return -1
      
      return dateB.getTime() - dateA.getTime()
    })
    
    // Group by date
    const grouped = new Map<string, any[]>()
    for (const item of sorted) {
      const watchDate = getWatchDate(item)
      if (!watchDate) {
        // Items without dates go into "Unknown" group
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
    
    return { filteredItems: sorted, groupedByDate: grouped }
  }, [libraryData?.library, searchTerm, userFilter, viewType])

  const handleViewModeChange = (mode: 'card' | 'list') => {
    setViewMode(mode)
    if (typeof window !== 'undefined') {
      localStorage.setItem('activity-view-mode', mode)
    }
  }

  const handleViewTypeChange = (type: 'library' | 'history') => {
    setViewType(type)
    if (typeof window !== 'undefined') {
      localStorage.setItem('activity-view-type', type)
    }
  }

  // Clear selection when filter changes
  React.useEffect(() => {
    setSelectedItems([])
  }, [userFilter, searchTerm, viewType])

  // Extract IMDB ID from item._id (e.g., "tt26350277" from "tt26350277" or "tt26350277:5:8")
  const extractMediaId = (itemId: string): string | null => {
    if (!itemId) return null
    // If it starts with "tt", extract the base ID (before any colons)
    if (itemId.startsWith('tt')) {
      return itemId.split(':')[0]
    }
    return null
  }


  // Fetch like/love status for an item
  const fetchLikeStatus = async (item: any) => {
    if (!item._userId) return

    const mediaId = extractMediaId(item._id)
    if (!mediaId) return

    const mediaType = item.type
    const itemKey = `${item._userId}-${item._id}`

    // Don't fetch if we already have the status
    if (likeStatus.has(itemKey)) return

    try {
      const result = await usersAPI.getLikeStatus(item._userId, mediaId, mediaType)
      setLikeStatus(prev => {
        const next = new Map(prev)
        if (result.status) {
          next.set(itemKey, result.status)
        } else {
          // Store null explicitly so we don't fetch again
          next.set(itemKey, null)
        }
        return next
      })
    } catch (error: any) {
      console.error('Failed to fetch like/love status:', error)
      // Don't show error toast, just log it
    }
  }

  // Handle item click - fetch status if not already loaded
  const handleItemClick = (item: any, itemId: string) => {
    // Fetch like status when item is clicked
    if (item._userId && extractMediaId(item._id)) {
      fetchLikeStatus(item)
    }
    // Also toggle selection
    handleItemToggle(item, itemId)
  }

  // Handle like/love for selected items
  const handleLikeSelected = async () => {
    if (selectedItems.length === 0) return

    // Process only items that match the selected item IDs (each item has its own _id and _userId)
    // Don't process items for other users who happen to have the same show
    const itemsToUpdate = selectedItemsData.filter((item: any) => {
      if (!item._userId) return false
      const mediaId = extractMediaId(item._id)
      if (!mediaId) return false
      return true
    })

    if (itemsToUpdate.length === 0) {
      toast.error('No items with supported ID format selected')
      return
    }

    let successCount = 0
    let errorCount = 0

    for (const item of itemsToUpdate) {
      const mediaId = extractMediaId(item._id)!
      const mediaType = item.type
      const itemKey = `${item._userId}-${mediaId}`

      setUpdatingLike(prev => new Set(prev).add(itemKey))

      try {
        await usersAPI.updateLikeStatus(item._userId, mediaId, mediaType, 'liked')
        setLikeStatus(prev => {
          const next = new Map(prev)
          next.set(itemKey, 'liked')
          return next
        })
        successCount++
      } catch (error: any) {
        console.error(`Failed to like item ${mediaId}:`, error)
        errorCount++
      } finally {
        setUpdatingLike(prev => {
          const next = new Set(prev)
          next.delete(itemKey)
          return next
        })
      }
    }

    if (successCount > 0) {
      toast.success(`Liked ${successCount} item${successCount > 1 ? 's' : ''}`)
    }
    if (errorCount > 0) {
      toast.error(`Failed to update ${errorCount} item${errorCount > 1 ? 's' : ''}`)
    }
  }

  const handleLoveSelected = async () => {
    if (selectedItems.length === 0) return

    // Process only items that match the selected item IDs (each item has its own _id and _userId)
    const itemsToUpdate = selectedItemsData.filter((item: any) => {
      if (!item._userId) return false
      const mediaId = extractMediaId(item._id)
      if (!mediaId) return false
      return true
    })

    if (itemsToUpdate.length === 0) {
      toast.error('No items with supported ID format selected')
      return
    }

    let successCount = 0
    let errorCount = 0

    for (const item of itemsToUpdate) {
      const mediaId = extractMediaId(item._id)!
      const mediaType = item.type
      const itemKey = `${item._userId}-${mediaId}`

      setUpdatingLike(prev => new Set(prev).add(itemKey))

      try {
        await usersAPI.updateLikeStatus(item._userId, mediaId, mediaType, 'loved')
        setLikeStatus(prev => {
          const next = new Map(prev)
          next.set(itemKey, 'loved')
          return next
        })
        successCount++
      } catch (error: any) {
        console.error(`Failed to love item ${item._id}:`, error)
        errorCount++
      } finally {
        setUpdatingLike(prev => {
          const next = new Set(prev)
          next.delete(itemKey)
          return next
        })
      }
    }

    if (successCount > 0) {
      toast.success(`Loved ${successCount} item${successCount > 1 ? 's' : ''}`)
    }
    if (errorCount > 0) {
      toast.error(`Failed to update ${errorCount} item${errorCount > 1 ? 's' : ''}`)
    }
  }

  const handleRemoveLikeSelected = async () => {
    if (selectedItems.length === 0) return

    // Process only items that match the selected item IDs (each item has its own _id and _userId)
    const itemsToUpdate = selectedItemsData.filter((item: any) => {
      if (!item._userId) return false
      const mediaId = extractMediaId(item._id)
      if (!mediaId) return false
      return true
    })

    if (itemsToUpdate.length === 0) {
      toast.error('No items with supported ID format selected')
      return
    }

    let successCount = 0
    let errorCount = 0

    for (const item of itemsToUpdate) {
      const mediaId = extractMediaId(item._id)!
      const mediaType = item.type
      const itemKey = `${item._userId}-${mediaId}`

      setUpdatingLike(prev => new Set(prev).add(itemKey))

      try {
        await usersAPI.updateLikeStatus(item._userId, mediaId, mediaType, null)
        setLikeStatus(prev => {
          const next = new Map(prev)
          next.set(itemKey, null)
          return next
        })
        successCount++
      } catch (error: any) {
        console.error(`Failed to remove like/love from item ${mediaId}:`, error)
        errorCount++
      } finally {
        setUpdatingLike(prev => {
          const next = new Set(prev)
          next.delete(itemKey)
          return next
        })
      }
    }

    if (successCount > 0) {
      toast.success(`Removed like/love from ${successCount} item${successCount > 1 ? 's' : ''}`)
    }
    if (errorCount > 0) {
      toast.error(`Failed to update ${errorCount} item${errorCount > 1 ? 's' : ''}`)
    }
  }

  // Handle library toggle (add/remove from library)
  const handleToggleLibrary = async () => {
    if (selectedItems.length === 0) return

    // Determine action based on ALL selected items (across all users):
    // If at least one item is NOT in library → add only items that are NOT in library
    // Only if ALL items are in library → remove only items that ARE in library
    const allSelectedInLibrary = selectedItemsData.every((item: any) => 
      item.removed === false || item.removed === undefined || item.removed === null
    )
    const addToLibrary = !allSelectedInLibrary // If all are in library, remove. Otherwise, add.
    const wasAdding = addToLibrary

    // Group items by user, filtering to only include items that need to be changed
    const itemsByUser = new Map<string, any[]>()
    for (const item of selectedItemsData) {
      if (!item._userId) continue
      
      // Check if this item needs to be changed
      const isInLibrary = item.removed === false || item.removed === undefined || item.removed === null
      const needsChange = addToLibrary ? !isInLibrary : isInLibrary
      
      if (!needsChange) continue // Skip items that don't need to be changed
      
      if (!itemsByUser.has(item._userId)) {
        itemsByUser.set(item._userId, [])
      }
      itemsByUser.get(item._userId)!.push(item)
    }

    // If no items need to be changed, show a message and return
    if (itemsByUser.size === 0) {
      toast(`All selected items are already ${addToLibrary ? 'in' : 'out of'} the library`, { icon: 'ℹ️' })
      return
    }

    let totalSuccess = 0
    let totalError = 0

    for (const [userId, items] of Array.from(itemsByUser.entries())) {
      const toggleItems = items.map((item: any) => ({
        itemId: item._id || item.id,
        itemType: item.type,
        itemName: item.name || 'Unknown',
        poster: item.poster || '',
        addToLibrary
      }))

      try {
        const result = await usersAPI.toggleLibraryItems(userId, toggleItems)
        totalSuccess += result.successCount || toggleItems.length
        totalError += result.errorCount || 0
      } catch (error: any) {
        console.error(`Failed to toggle library for user ${userId}:`, error)
        totalError += toggleItems.length
      }
    }

    if (totalSuccess > 0) {
      toast.success(`${wasAdding ? 'Added' : 'Removed'} ${totalSuccess} item${totalSuccess > 1 ? 's' : ''} ${wasAdding ? 'to' : 'from'} library`)
      await refetchLibrary()
    }
    if (totalError > 0) {
      toast.error(`Failed to update ${totalError} item${totalError > 1 ? 's' : ''}`)
    }
  }

  const formatYear = (year: string | null | undefined): string | null => {
    if (!year) return null
    const yearStr = String(year).trim()
    const cleaned = yearStr.replace(/–\s*$/, '').replace(/-\s*$/, '')
    return cleaned || null
  }

  // Individual item action handlers
  const handleLikeItem = async (item: any, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!item._userId) return
    const mediaId = extractMediaId(item._id)
    if (!mediaId) return
    
    const itemKey = `${item._userId}-${mediaId}`
    setUpdatingLike(prev => new Set(prev).add(itemKey))
    
    try {
      await usersAPI.updateLikeStatus(item._userId, mediaId, item.type, 'liked')
      setLikeStatus(prev => {
        const next = new Map(prev)
        next.set(itemKey, 'liked')
        return next
      })
      toast.success('Item liked')
    } catch (error: any) {
      console.error('Failed to like item:', error)
      toast.error('Failed to like item')
    } finally {
      setUpdatingLike(prev => {
        const next = new Set(prev)
        next.delete(itemKey)
        return next
      })
    }
  }

  const handleLoveItem = async (item: any, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!item._userId) return
    const mediaId = extractMediaId(item._id)
    if (!mediaId) return
    
    const itemKey = `${item._userId}-${mediaId}`
    setUpdatingLike(prev => new Set(prev).add(itemKey))
    
    try {
      await usersAPI.updateLikeStatus(item._userId, mediaId, item.type, 'loved')
      setLikeStatus(prev => {
        const next = new Map(prev)
        next.set(itemKey, 'loved')
        return next
      })
      toast.success('Item loved')
    } catch (error: any) {
      console.error('Failed to love item:', error)
      toast.error('Failed to love item')
    } finally {
      setUpdatingLike(prev => {
        const next = new Set(prev)
        next.delete(itemKey)
        return next
      })
    }
  }

  const handleToggleLibraryItem = async (item: any, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!item._userId) return
    
    const isInLibrary = item.removed === false || item.removed === undefined || item.removed === null
    const addToLibrary = !isInLibrary
    
    const toggleItem = {
      itemId: item._id || item.id,
      itemType: item.type,
      itemName: item.name || 'Unknown',
      poster: item.poster || '',
      addToLibrary
    }

    try {
      await usersAPI.toggleLibraryItems(item._userId, [toggleItem])
      toast.success(addToLibrary ? 'Added to library' : 'Removed from library')
      await refetchLibrary()
    } catch (error: any) {
      console.error('Failed to toggle library:', error)
      toast.error('Failed to update library')
    }
  }

  const handleDeleteItem = async (item: any, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!item._userId || !item._id) return
    
    try {
      await usersAPI.deleteLibraryItem(item._userId, item._id)
      toast.success('Item deleted')
      await refetchLibrary()
    } catch (error: any) {
      console.error('Failed to delete item:', error)
      toast.error('Failed to delete item')
    }
  }

  const renderItem = (item: any, index: number) => {
    const isMovie = item.type === 'movie'
    // Get watch date: min of _mtime vs lastWatched
    const watchDate = getWatchDate(item)

    const formattedYear = formatYear(item.year)
    
    // Create unique key that includes user filter to force re-render when filter changes
    const itemKey = `${userFilter}-${item._userId || 'unknown'}-${item._id || item.id || index}`
    const itemId = item._id || item.id
    const userId = item._userId
    const compositeKey = userId && itemId ? `${userId}-${itemId}` : null
    const isSelected = compositeKey ? selectedItems.includes(compositeKey) : false

    if (viewMode === 'list') {
      const mediaId = extractMediaId(item._id)
      const itemLikeKey = item._userId && mediaId ? `${item._userId}-${mediaId}` : null
      const currentLikeStatus = itemLikeKey ? likeStatus.get(itemLikeKey) : null
      const isUpdatingLike = itemLikeKey ? updatingLike.has(itemLikeKey) : false
      const isInLibrary = item.removed === false || item.removed === undefined || item.removed === null

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
                <div className="relative flex-shrink-0 w-12 sm:w-16">
                <img
                  src={item.poster}
                  alt={item.name}
                  className="w-full h-full object-cover"
                    style={{ minHeight: '60px' }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
                {/* Show library icon in History view if item is in library */}
                  {viewType === 'history' && isInLibrary && (
                    <div className="absolute top-0.5 right-0.5 sm:top-1 sm:right-1 rounded-full p-0.5 sm:p-1" style={{ backgroundColor: 'var(--color-text-secondary)' }}>
                      <Bookmark className="w-2 h-2 sm:w-3 sm:h-3" fill="var(--color-surface)" style={{ color: 'var(--color-surface)' }} />
                  </div>
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
                      <span className="truncate">{formatDate(watchDate.toISOString())}</span>
                  </div>
                )}
                {item._username && userFilter === 'all' && (
                    <div className="hidden sm:flex items-center gap-1.5 text-xs">
                    {renderUserAvatar(item._username, item._userColorIndex, 'sm')}
                    <span>{item._username}</span>
                  </div>
                )}
              </div>
              </div>
            </div>
            
            {/* Action buttons - matching EntityCard list mode style */}
            <div className="flex items-center gap-1 px-2 sm:px-3 flex-shrink-0">
              <button
                onClick={(e) => handleLikeItem(item, e)}
                disabled={isUpdatingLike}
                className={`p-2 rounded surface-interactive color-text ${isUpdatingLike ? 'opacity-50' : ''}`}
                title="Like"
              >
                <ThumbsUp className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => handleLoveItem(item, e)}
                disabled={isUpdatingLike}
                className={`p-2 rounded surface-interactive color-text ${isUpdatingLike ? 'opacity-50' : ''}`}
                title="Love"
              >
                <Heart className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => handleToggleLibraryItem(item, e)}
                className="p-2 rounded surface-interactive color-text"
                title={isInLibrary ? 'Remove from Library' : 'Add to Library'}
              >
                {isInLibrary ? (
                  <BookmarkMinus className="w-4 h-4" />
                ) : (
                  <BookmarkPlus className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={(e) => handleDeleteItem(item, e)}
                className="p-2 rounded surface-interactive color-text"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )
    }

    // Card view
    return (
      <div
        key={itemKey}
        onClick={() => handleItemClick(item, itemId)}
        className={`rounded-lg overflow-hidden hover:shadow-md transition-all card-selectable cursor-pointer relative group ${
          isSelected ? 'card-selected' : ''
        }`}
        style={{ width: '100%' }}
      >
        {item.poster && (
          <div className="w-full rounded-t overflow-hidden flex items-center justify-center bg-gray-100 dark:bg-gray-800 relative aspect-[2/3]">
            <img
              src={item.poster}
              alt={item.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none'
              }}
            />
            {/* Show library icon in History view if item is in library */}
            {viewType === 'history' && (item.removed === false || item.removed === undefined || item.removed === null) && (
              <div className="absolute top-1 right-1 sm:top-2 sm:right-2 rounded-full p-1 sm:p-1.5" style={{ backgroundColor: 'var(--color-text-secondary)' }}>
                <Bookmark className="w-3 h-3 sm:w-4 sm:h-4" fill="var(--color-surface)" style={{ color: 'var(--color-surface)' }} />
              </div>
            )}
          </div>
        )}
        <div className="p-1 sm:p-2 text-center">
          {watchDate && (
            <div className="text-[10px] sm:text-xs color-text-secondary">
              <div>{formatDateSeparate(watchDate.toISOString()).date}</div>
              <div className="hidden sm:block">{formatDateSeparate(watchDate.toISOString()).time}</div>
            </div>
          )}
          {item._username && userFilter === 'all' && (
            <div className="flex items-center justify-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs mt-0.5 sm:mt-1">
              {renderUserAvatar(item._username, item._userColorIndex, 'sm')}
              <span className="color-text-secondary truncate max-w-[60px] sm:max-w-none">{item._username}</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="p-3 sm:p-4 md:p-6">
      <PageHeader
        title="Activity"
        description={viewType === 'history' ? 'Watch history from all users' : 'Library items from all users'}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search by title..."
        selectedCount={selectedItems.length}
        onSelectAll={handleSelectAll}
        onDeselectAll={handleDeselectAll}
        onAdd={() => {}}
        onDelete={handleDeleteClick}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        isDeleteDisabled={selectedItems.length === 0 || isDeleting}
        filterOptions={filterOptions}
        filterValue={userFilter}
        onFilterChange={setUserFilter}
        filterPlaceholder="Filter by user"
        onLike={handleLikeSelected}
        onLove={handleLoveSelected}
        onRemoveLike={handleRemoveLikeSelected}
        isLikeDisabled={selectedItems.length === 0 || isDeleting}
        isLoveDisabled={selectedItems.length === 0 || isDeleting}
        isRemoveLikeDisabled={selectedItems.length === 0 || isDeleting}
        onToggleLibrary={handleToggleLibrary}
        isToggleLibraryDisabled={selectedItems.length === 0 || isDeleting}
        libraryToggleLabel={(() => {
          if (selectedItems.length === 0) return undefined
          // If at least one item is NOT in library → show "Add to Library"
          // Only if ALL items are in library → show "Remove from Library"
          const allInLibrary = selectedItemsData.every((item: any) => 
            item.removed === false || item.removed === undefined || item.removed === null
          )
          return allInLibrary ? 'Remove from Library' : 'Add to Library'
        })()}
      />
      
      {/* View Type Toggle (Library/History) */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 rounded-lg border color-border">
          <ToggleButton
            isActive={viewType === 'history'}
            onClick={() => handleViewTypeChange('history')}
            activeIcon={<Clock className="w-4 h-4" />}
            inactiveIcon={<Clock className="w-4 h-4" />}
            className="rounded-l-lg border-0 border-r-0"
            title="History"
          />
          <ToggleButton
            isActive={viewType === 'library'}
            onClick={() => handleViewTypeChange('library')}
            activeIcon={<BookOpen className="w-4 h-4" />}
            inactiveIcon={<BookOpen className="w-4 h-4" />}
            className="rounded-r-lg border-0 border-l-0"
            title="Library"
          />
        </div>
        <span className="text-sm color-text-secondary">
          {viewType === 'history' ? 'Showing watched items only' : 'Showing all library items'}
        </span>
      </div>

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
          title={viewType === 'history' ? 'No watch history found' : 'No library items found'}
          description={searchTerm ? 'Try adjusting your search terms' : (viewType === 'history' ? 'No watched items to display' : 'No library items to display')}
        />
      ) : (
        <div className="space-y-6">
          {Array.from(groupedByDate.entries())
            .sort(([dateKeyA], [dateKeyB]) => {
              if (dateKeyA === 'unknown') return 1
              if (dateKeyB === 'unknown') return -1
              return dateKeyB.localeCompare(dateKeyA) // Most recent first
            })
            .map(([dateKey, items]) => (
              <div key={dateKey} className="space-y-3">
                <h3 className="text-lg font-semibold theme-text-1 sticky top-0 bg-opacity-95 py-2 z-10">
                  {dateKey === 'unknown' ? 'Unknown Date' : formatDateHeader(dateKey)}
                </h3>
                <div className={viewMode === 'card' 
                  ? 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-1.5 sm:gap-2 md:gap-3 items-start max-w-full' 
                  : 'space-y-2 sm:space-y-3'}>
                  {items.map((item: any, index: number) => renderItem(item, index))}
                </div>
              </div>
            ))}
        </div>
      )}

      {typeof window !== 'undefined' && document.body && createPortal(
        <ConfirmDialog
          open={showDeleteConfirm}
          title={`Delete ${selectedItems.length} item${selectedItems.length > 1 ? 's' : ''}`}
          description={`Are you sure you want to delete ${selectedItems.length} selected item${selectedItems.length > 1 ? 's' : ''} from ${selectedItemsData.length > 0 && selectedItemsData[0]._username ? `${selectedItemsData[0]._username}'s` : 'the'} library? This action cannot be undone.`}
          confirmText="Delete"
          cancelText="Cancel"
          isDanger={true}
          onConfirm={handleConfirmDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />,
        document.body
      )}
    </div>
  )
}







