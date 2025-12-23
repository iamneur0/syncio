'use client'

import { useState, useRef, useEffect } from 'react'
import { Search, Plus, RefreshCw, Trash2, Grip, List, Square, CheckSquare, Send, Filter, ChevronDown, Users, ThumbsUp, Heart, X, BookmarkPlus, BookmarkMinus, Share2 } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { getTextClasses } from '@/utils/themeUtils'
import { getEntityColorStyles } from '@/utils/colorMapping'
// Inline search input (replaces deprecated ./Input component)
import { IconButton, ToggleButton } from '@/components/ui'
import AccountMenuButton from '../auth/AccountMenuButton'
import UserAvatar from '../ui/UserAvatar'

interface FilterOption {
  value: string
  label: string
  colorIndex?: number | null
  email?: string | null
  username?: string | null
}

// Helper function to get dot color for filter options
const getFilterDotColor = (value: string): string | null => {
  switch (value) {
    case 'synced':
      return '#22c55e' // green
    case 'unsynced':
      return '#ef4444' // red
    case 'stale':
      return '#f59e0b' // amber/yellow
    case 'incomplete':
      return '#ef4444' // red
    case 'full':
      return '#22c55e' // green
    case 'expired':
      return '#ef4444' // red
    case 'active':
    case 'inactive':
    default:
      return null // No dot for active/inactive and other options
  }
}

interface PageHeaderProps {
  title?: string
  description?: string
  searchTerm: string
  onSearchChange: (value: string) => void
  searchPlaceholder: string
  selectedCount: number
  onSelectAll: () => void
  onDeselectAll: () => void
  onAdd: () => void
  onInvite?: () => void
  onReload?: () => void
  onSync?: () => void
  onDelete: () => void
  viewMode: 'card' | 'list'
  onViewModeChange: (mode: 'card' | 'list') => void
  isReloading?: boolean
  isReloadDisabled?: boolean
  isSyncing?: boolean
  isSyncDisabled?: boolean
  isDeleteDisabled?: boolean
  // Optional filter props
  filterOptions?: FilterOption[]
  filterValue?: string
  onFilterChange?: (value: string) => void
  filterPlaceholder?: string
  hideTitle?: boolean
  hideAccountButton?: boolean
  hideSearch?: boolean
  // Optional like/love props
  onLike?: () => void
  onLove?: () => void
  onRemoveLike?: () => void
  isLikeDisabled?: boolean
  isLoveDisabled?: boolean
  isRemoveLikeDisabled?: boolean
  // Optional library toggle props
  onToggleLibrary?: () => void
  isToggleLibraryDisabled?: boolean
  libraryToggleLabel?: string
  // Optional share props
  onShare?: () => void
  isShareDisabled?: boolean
  // Hide specific elements
  hideSelectAll?: boolean
  hideDelete?: boolean
  hideAdd?: boolean
  hideViewMode?: boolean
  // Custom toggle to render next to view mode toggle
  customToggle?: React.ReactNode
}

export default function PageHeader({
  title,
  description,
  searchTerm,
  onSearchChange,
  searchPlaceholder,
  selectedCount,
  onSelectAll,
  onDeselectAll,
  onAdd,
  onInvite,
  onReload,
  onSync,
  onDelete,
  viewMode,
  onViewModeChange,
  isReloading = false,
  isReloadDisabled = false,
  isSyncing = false,
  isSyncDisabled = false,
  isDeleteDisabled = false,
  filterOptions,
  filterValue,
  onFilterChange,
  filterPlaceholder = 'Filter by status',
  hideTitle = false,
  hideAccountButton = false,
  hideSearch = false,
  onLike,
  onLove,
  onRemoveLike,
  isLikeDisabled = false,
  isLoveDisabled = false,
  isRemoveLikeDisabled = false,
  onToggleLibrary,
  isToggleLibraryDisabled = false,
  libraryToggleLabel,
  onShare,
  isShareDisabled = false,
  hideSelectAll = false,
  hideDelete = false,
  hideAdd = false,
  hideViewMode = false,
  customToggle
}: PageHeaderProps) {
  const theme = useTheme()
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)
  const mobileFilterRef = useRef<HTMLDivElement>(null)

  const handleSelectToggle = () => {
    if (selectedCount === 0) {
      onSelectAll()
    } else {
      onDeselectAll()
    }
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const clickedOutsideMobile = mobileFilterRef.current && !mobileFilterRef.current.contains(event.target as Node)
      const clickedOutsideDesktop = filterRef.current && !filterRef.current.contains(event.target as Node)
      
      if (clickedOutsideMobile && clickedOutsideDesktop) {
        setIsFilterOpen(false)
      }
    }

    if (isFilterOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isFilterOpen])

  return (
    <>
    <div className="mb-0 lg:mb-6">
      {/* Title and Description */}
      {!hideTitle && (title || description) && (
      <div className="hidden lg:flex lg:flex-row lg:items-center lg:justify-between mb-2 lg:mb-4 gap-2 lg:gap-4">
        <div>
            {title && (
          <h1 className={`text-2xl font-bold ${getTextClasses(theme, 'primary')}`}>
            {title}
          </h1>
            )}
            {description && (
          <p className={`text-base ${getTextClasses(theme, 'secondary')}`}>
            {description}
          </p>
            )}
        </div>
          {!hideAccountButton && (
        <div className="flex items-center gap-2">
          {/* Desktop account button */}
          <div className="ml-1">
            <AccountMenuButton />
          </div>
        </div>
          )}
      </div>
      )}
      
      {/* Desktop account button - shown even when title is hidden */}
      {hideTitle && !hideAccountButton && (
        <div className="hidden lg:flex lg:justify-end lg:mb-4">
          <AccountMenuButton />
        </div>
      )}

      {/* Search and Controls */}
      <div className="flex flex-col lg:flex-row gap-2 lg:gap-4">
        {/* Mobile: Row with Select All + Search + Toggle | Desktop: Select All (ordered) */}
        <div className="flex flex-row items-center gap-2 lg:contents lg:gap-4">
          {/* Selection Toggle */}
          {!hideSelectAll && (
          <div className="flex-shrink-0 lg:order-1 flex items-center" style={{ height: '2.5rem' }}>
            <IconButton
              onClick={handleSelectToggle}
              title={selectedCount === 0 ? 'Select All' : 'Deselect All'}
            >
              {selectedCount > 0 ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
            </IconButton>
          </div>
          )}

          {/* Search Bar with filter and toggle on right (mobile) */}
          {!hideSearch && (
            <div className="flex-1 min-w-0 lg:order-2 flex items-center gap-2 lg:flex-1 lg:min-w-[200px] lg:max-w-none">
              <div className="flex-1 relative min-w-0 w-full">
                <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 color-text-secondary">
                  <Search className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  placeholder={searchPlaceholder}
                  value={searchTerm}
                  onChange={(e) => onSearchChange(e.target.value)}
                  className="w-full h-10 pl-9 pr-10 rounded-lg input"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => onSearchChange('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs px-2 py-1 rounded color-surface color-text hover:opacity-80"
                    title="Clear"
                  >
                    Clear
                  </button>
                )}
              </div>
              
              {/* Mobile: Filter on right of search */}
              {filterOptions && filterOptions.length > 0 && onFilterChange && (
                <div className="lg:hidden relative" ref={mobileFilterRef}>
                  <button
                    type="button"
                    onClick={() => setIsFilterOpen(!isFilterOpen)}
                    className={`h-10 rounded-lg input cursor-pointer flex items-center justify-center relative transition-all ${
                      isFilterOpen 
                        ? 'pl-3 pr-7 min-w-[120px]' 
                        : 'px-2.5' // Always compact on mobile when closed - just icon
                    }`}
                  >
                    <span className={`flex items-center gap-1.5 ${isFilterOpen ? 'justify-start' : 'justify-center'}`}>
                      {(() => {
                        const selectedOption = filterOptions.find(opt => opt.value === filterValue)
                        const dotColor = filterValue ? getFilterDotColor(filterValue) : null
                        const hasUserAvatar = selectedOption?.colorIndex !== null && selectedOption?.colorIndex !== undefined
                        const isUserFilter = hasUserAvatar && !dotColor
                        
                        // On mobile when closed, show user avatar if selected, otherwise filter icon
                        if (!isFilterOpen) {
                          if (isUserFilter && selectedOption) {
                            return (
                              <UserAvatar
                                email={selectedOption.email}
                                username={selectedOption.username || selectedOption.label}
                                colorIndex={selectedOption.colorIndex}
                                size="xs"
                              />
                            )
                          }
                          return <Filter className="w-4 h-4 color-text-secondary flex-shrink-0" />
                        }
                        
                        // When open, show the selected indicator
                        let indicatorElement = null
                        if (isUserFilter && selectedOption) {
                          indicatorElement = (
                            <div className="flex-shrink-0">
                              <UserAvatar
                                email={selectedOption.email}
                                username={selectedOption.username || selectedOption.label}
                                colorIndex={selectedOption.colorIndex}
                                size="xs"
                              />
                            </div>
                          )
                        } else if (hasUserAvatar && selectedOption) {
                          const colorStyles = getEntityColorStyles(theme.theme, selectedOption.colorIndex)
                          const initial = selectedOption.label ? selectedOption.label.charAt(0).toUpperCase() : 'U'
                          indicatorElement = (
                            <div 
                              className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                              style={{ 
                                background: colorStyles.background, 
                                color: colorStyles.textColor,
                              }}
                            >
                              <span className="text-xs font-semibold" style={{ color: colorStyles.textColor }}>
                                {initial}
                              </span>
                            </div>
                          )
                        } else if (dotColor) {
                          indicatorElement = (
                            <div 
                              className="w-2 h-2 rounded-full flex-shrink-0" 
                              style={{ backgroundColor: dotColor }}
                            />
                          )
                        } else {
                          // Default filter icon when no specific indicator
                          indicatorElement = <Filter className="w-4 h-4 color-text-secondary flex-shrink-0" />
                        }
                        
                        return (
                          <>
                            {indicatorElement}
                            <span className="text-sm whitespace-nowrap">
                              {selectedOption?.label || filterPlaceholder}
                            </span>
                          </>
                        )
                      })()}
                    </span>
                  </button>
                  
                  {isFilterOpen && (
                    <div className="absolute top-full right-0 mt-2 z-50 rounded-lg shadow-lg border min-w-[160px]" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
                      {filterOptions.map((option) => {
                        const dotColor = getFilterDotColor(option.value)
                        const isSelected = option.value === filterValue
                        const hasUserAvatar = option.colorIndex !== null && option.colorIndex !== undefined
                        
                        let avatarElement = null
                        if (hasUserAvatar && (option.email || option.username)) {
                          avatarElement = (
                            <div className="mr-2 flex-shrink-0">
                              <UserAvatar
                                email={option.email}
                                username={option.username || option.label}
                                colorIndex={option.colorIndex}
                                size="sm"
                              />
                            </div>
                          )
                        } else if (hasUserAvatar) {
                          const colorStyles = getEntityColorStyles(theme.theme, option.colorIndex)
                          const initial = option.label ? option.label.charAt(0).toUpperCase() : 'U'
                          avatarElement = (
                            <div 
                              className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mr-2"
                              style={{ 
                                background: colorStyles.background, 
                                color: colorStyles.textColor,
                              }}
                            >
                              <span className="text-xs font-semibold" style={{ color: colorStyles.textColor }}>
                                {initial}
                              </span>
                            </div>
                          )
                        } else {
                          avatarElement = (
                            <div 
                              className="w-2 h-2 rounded-full flex-shrink-0 mr-2" 
                              style={{ 
                                backgroundColor: dotColor || 'transparent',
                                width: '0.5rem',
                                height: '0.5rem',
                                minWidth: '0.5rem',
                                minHeight: '0.5rem'
                              }}
                            />
                          )
                        }
                        
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => {
                              onFilterChange(option.value)
                              setIsFilterOpen(false)
                            }}
                            className={`w-full px-4 py-2 text-sm flex items-center hover:opacity-80 transition-colors ${
                              isSelected ? 'font-medium' : ''
                            }`}
                            style={{
                              color: 'var(--color-text)',
                              backgroundColor: isSelected ? 'var(--color-hover)' : 'transparent',
                              justifyContent: 'flex-start'
                            }}
                          >
                            {avatarElement}
                            <span className="text-left">{option.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
              
              {/* Mobile: View Mode Toggle on right of search/filter */}
              {!hideViewMode && (
                <div className="lg:hidden flex items-center h-10 flex-shrink-0">
                  <div className="flex h-full rounded-lg border color-border overflow-hidden">
                    <button
                      onClick={() => onViewModeChange('card')}
                      className={`p-2 h-full flex items-center justify-center ${viewMode === 'card' ? 'color-surface' : 'color-hover'}`}
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
                      onClick={() => onViewModeChange('list')}
                      className={`p-2 h-full flex items-center justify-center ${viewMode === 'list' ? 'color-surface' : 'color-hover'}`}
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
              )}
            </div>
          )}
          
        </div>

        {/* Custom toggle when view mode is hidden - same position for mobile and desktop */}
        {hideViewMode && customToggle && (
          <div className="flex items-center h-10 gap-2 flex-shrink-0 ml-auto -mr-2 lg:-mr-4">
            {customToggle}
          </div>
        )}

        {/* Filter, Buttons, and View Toggle Row - Desktop only */}
        <div className="hidden lg:flex flex-row items-center justify-end gap-1.5 lg:gap-4 lg:order-3 flex-wrap lg:flex-nowrap">

          {/* Filter Dropdown - Desktop */}
          {filterOptions && filterOptions.length > 0 && onFilterChange && (
            <div className="relative" ref={filterRef} style={{ width: '160px', flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                className="h-10 pl-4 pr-8 rounded-lg input cursor-pointer flex items-center justify-center w-full text-left relative"
                style={{ paddingRight: '2rem', width: '100%' }}
              >
                <span className="flex items-center gap-2 absolute left-4 right-8 justify-center">
                  {(() => {
                    const selectedOption = filterOptions.find(opt => opt.value === filterValue)
                    const dotColor = filterValue ? getFilterDotColor(filterValue) : null
                    const hasUserAvatar = selectedOption?.colorIndex !== null && selectedOption?.colorIndex !== undefined
                    const isUserFilter = hasUserAvatar && !dotColor
                    
                    let indicatorElement = null
                    if (isUserFilter && selectedOption) {
                      indicatorElement = (
                        <div className="flex-shrink-0">
                          <UserAvatar
                            email={selectedOption.email}
                            username={selectedOption.username || selectedOption.label}
                            colorIndex={selectedOption.colorIndex}
                            size="xs"
                          />
                        </div>
                      )
                    } else if (hasUserAvatar && selectedOption) {
                      const colorStyles = getEntityColorStyles(theme.theme, selectedOption.colorIndex)
                      const initial = selectedOption.label ? selectedOption.label.charAt(0).toUpperCase() : 'U'
                      indicatorElement = (
                        <div 
                          className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ 
                            background: colorStyles.background, 
                            color: colorStyles.textColor,
                          }}
                        >
                          <span className="text-xs font-semibold" style={{ color: colorStyles.textColor }}>
                            {initial}
                          </span>
                        </div>
                      )
                    } else if (dotColor) {
                      indicatorElement = (
                        <div 
                          className="w-2 h-2 rounded-full flex-shrink-0" 
                          style={{ backgroundColor: dotColor }}
                        />
                      )
                    } else if (filterValue && filterValue !== 'all') {
                      indicatorElement = <Filter className="w-4 h-4 color-text-secondary flex-shrink-0" />
                    } else {
                      indicatorElement = <Filter className="w-4 h-4 color-text-secondary flex-shrink-0" />
                    }
                    
                    return (
                      <>
                        {indicatorElement}
                        {selectedOption?.label || filterPlaceholder}
                      </>
                    )
                  })()}
                </span>
                <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 color-text-secondary flex-shrink-0">
                  <ChevronDown className={`w-4 h-4 transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} />
                </div>
              </button>
              
              {isFilterOpen && (
                <div className="absolute top-full left-0 mt-2 z-50 rounded-lg shadow-lg border min-w-full" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
                  {filterOptions.map((option) => {
                    const dotColor = getFilterDotColor(option.value)
                    const isSelected = option.value === filterValue
                    const hasUserAvatar = option.colorIndex !== null && option.colorIndex !== undefined
                    
                    // Render user avatar if colorIndex is provided (user filter)
                    let avatarElement = null
                    if (hasUserAvatar && (option.email || option.username)) {
                      // Use UserAvatar component for user filters
                      avatarElement = (
                        <div className="mr-2 flex-shrink-0">
                          <UserAvatar
                            email={option.email}
                            username={option.username || option.label}
                            colorIndex={option.colorIndex}
                            size="sm"
                          />
                        </div>
                      )
                    } else if (hasUserAvatar) {
                      // Fallback to colored circle if no email/username
                      const colorStyles = getEntityColorStyles(theme.theme, option.colorIndex)
                      const initial = option.label ? option.label.charAt(0).toUpperCase() : 'U'
                      avatarElement = (
                        <div 
                          className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mr-2"
                          style={{ 
                            background: colorStyles.background, 
                            color: colorStyles.textColor,
                          }}
                        >
                          <span className="text-xs font-semibold" style={{ color: colorStyles.textColor }}>
                            {initial}
                          </span>
                        </div>
                      )
                    } else {
                      avatarElement = (
                        <div 
                          className="w-2 h-2 rounded-full flex-shrink-0 mr-2" 
                          style={{ 
                            backgroundColor: dotColor || 'transparent',
                            width: '0.5rem',
                            height: '0.5rem',
                            minWidth: '0.5rem',
                            minHeight: '0.5rem'
                          }}
                        />
                      )
                    }
                    
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          onFilterChange(option.value)
                          setIsFilterOpen(false)
                        }}
                        className={`w-full px-4 py-2 text-sm flex items-center hover:opacity-80 transition-colors ${
                          isSelected ? 'font-medium' : ''
                        }`}
                        style={{
                          color: 'var(--color-text)',
                          backgroundColor: isSelected ? 'var(--color-hover)' : 'transparent',
                          justifyContent: 'flex-start'
                        }}
                      >
                        {avatarElement}
                        <span className="text-left">{option.label}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
          
          {/* Action Buttons */}
          <div className="flex items-center gap-1.5 flex-shrink-0 lg:ml-0 ml-auto">
            {title === 'Users' && onInvite && (
              <IconButton
                onClick={() => {
                  onInvite()
                }}
                title="Invite users"
              >
                <Send className="w-5 h-5" />
              </IconButton>
            )}
            {!hideAdd && (
              <IconButton
                onClick={() => {
                  console.log('Add button clicked!', { title, onAdd })
                  console.log('About to call onAdd function')
                  onAdd()
                  console.log('onAdd function called')
                }}
                title="Add new item"
              >
                <Plus className="w-5 h-5" />
              </IconButton>
            )}
            
            {onReload && (
              <IconButton
                onClick={(e) => {
                  e.stopPropagation()
                  onReload()
                }}
                disabled={isReloadDisabled}
                title={selectedCount === 0 ? 'Select items to reload' : `Reload ${selectedCount} selected item${selectedCount > 1 ? 's' : ''}`}
              >
                <RefreshCw className={`w-5 h-5 ${isReloading ? 'animate-spin' : ''}`} />
              </IconButton>
            )}
            
            {onSync && (
              <IconButton
                onClick={(e) => {
                  e.stopPropagation()
                  onSync()
                }}
                disabled={isSyncDisabled}
                title={selectedCount === 0 ? 'Select items to sync' : `Sync ${selectedCount} selected item${selectedCount > 1 ? 's' : ''}`}
              >
                <RefreshCw className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} />
              </IconButton>
            )}
            
            {onLike && (
              <IconButton
                onClick={(e) => {
                  e.stopPropagation()
                  onLike()
                }}
                disabled={isLikeDisabled}
                title={selectedCount === 0 ? 'Select items to like' : `Like ${selectedCount} selected item${selectedCount > 1 ? 's' : ''}`}
              >
                <ThumbsUp className="w-5 h-5" />
              </IconButton>
            )}
            
            {onLove && (
              <IconButton
                onClick={(e) => {
                  e.stopPropagation()
                  onLove()
                }}
                disabled={isLoveDisabled}
                title={selectedCount === 0 ? 'Select items to love' : `Love ${selectedCount} selected item${selectedCount > 1 ? 's' : ''}`}
              >
                <Heart className="w-5 h-5" />
              </IconButton>
            )}
            
            {onRemoveLike && (
              <IconButton
                onClick={(e) => {
                  e.stopPropagation()
                  onRemoveLike()
                }}
                disabled={isRemoveLikeDisabled}
                title={selectedCount === 0 ? 'Select items to remove like/love' : `Remove like/love from ${selectedCount} selected item${selectedCount > 1 ? 's' : ''}`}
              >
                <X className="w-5 h-5" />
              </IconButton>
            )}
            
            {onToggleLibrary && (
              <IconButton
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleLibrary()
                }}
                disabled={isToggleLibraryDisabled}
                title={libraryToggleLabel || (selectedCount === 0 ? 'Select items to toggle library' : `Toggle library for ${selectedCount} selected item${selectedCount > 1 ? 's' : ''}`)}
              >
                {libraryToggleLabel?.toLowerCase().includes('remove') || libraryToggleLabel?.toLowerCase().includes('delete') ? (
                  <BookmarkMinus className="w-5 h-5" />
                ) : (
                  <BookmarkPlus className="w-5 h-5" />
                )}
              </IconButton>
            )}
            
            {onShare && (
              <IconButton
                onClick={(e) => {
                  e.stopPropagation()
                  onShare()
                }}
                disabled={isShareDisabled}
                title={selectedCount === 0 ? 'Select items to share' : `Share ${selectedCount} selected item${selectedCount > 1 ? 's' : ''}`}
              >
                <Share2 className="w-5 h-5" />
              </IconButton>
            )}
            
            {!hideDelete && (
            <IconButton
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              disabled={isDeleteDisabled}
              title={selectedCount === 0 ? 'Select items to delete' : `Delete ${selectedCount} selected item${selectedCount > 1 ? 's' : ''}`}
            >
              <Trash2 className="w-5 h-5" />
            </IconButton>
            )}
          </div>
          
          {/* Desktop: View Mode Toggle */}
          {!hideViewMode && (
            <div className="hidden lg:flex items-center h-10 gap-2">
              <div className="flex h-full rounded-lg border color-border overflow-hidden">
                <button
                  onClick={() => onViewModeChange('card')}
                  className={`p-2 h-full flex items-center justify-center ${viewMode === 'card' ? 'color-surface' : 'color-hover'}`}
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
                  onClick={() => onViewModeChange('list')}
                  className={`p-2 h-full flex items-center justify-center ${viewMode === 'list' ? 'color-surface' : 'color-hover'}`}
                  title="List view"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <line x1="3" y1="6" x2="21" y2="6" strokeWidth="2" />
                    <line x1="3" y1="12" x2="21" y2="12" strokeWidth="2" />
                    <line x1="3" y1="18" x2="21" y2="18" strokeWidth="2" />
                  </svg>
                </button>
              </div>
              {customToggle}
            </div>
          )}
        </div>
      </div>
    </div>

    {/* Floating Add Button - Mobile Only (always visible, bottom right) */}
    {!hideAdd && (
      <div className="lg:hidden fixed bottom-4 right-4 z-50">
        <button
          onClick={() => {
            console.log('Add button clicked!', { title, onAdd })
            console.log('About to call onAdd function')
            onAdd()
            console.log('onAdd function called')
          }}
          className="w-14 h-14 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95 shadow-lg"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text)',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)'
        }}
        title="Add new item"
      >
        <Plus className="w-6 h-6" />
      </button>
      </div>
    )}

    {/* Floating Action Bar - Mobile Only (appears when items are selected) */}
    {selectedCount > 0 && (
      <div className="lg:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-40 px-2 h-14 rounded-full inline-flex items-center justify-center" 
           style={{ 
             background: 'var(--color-surface)', 
             border: '1px solid var(--color-border)',
             boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
             backdropFilter: 'blur(10px)',
             WebkitBackdropFilter: 'blur(10px)',
             maxWidth: 'calc(100% - 80px)' // Leave space for add button (56px button + 16px margin + 8px buffer)
           }}>
        <div className="flex items-center justify-center gap-2">
          {title === 'Users' && onInvite && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onInvite()
              }}
              title="Invite users"
              className="p-2 rounded-full transition-all hover:scale-110 active:scale-95"
              style={{
                background: 'var(--color-hover)',
                color: 'var(--color-text)'
              }}
            >
              <Send className="w-4 h-4" />
            </button>
          )}
          
          {onReload && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onReload()
              }}
              disabled={isReloadDisabled}
              title={selectedCount === 0 ? 'Select items to reload' : `Reload ${selectedCount} selected item${selectedCount > 1 ? 's' : ''}`}
              className="p-2 rounded-full transition-all hover:scale-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: isReloadDisabled ? 'transparent' : 'var(--color-hover)',
                color: 'var(--color-text)'
              }}
            >
              <RefreshCw className={`w-4 h-4 ${isReloading ? 'animate-spin' : ''}`} />
            </button>
          )}
          
          {onSync && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onSync()
              }}
              disabled={isSyncDisabled}
              title={selectedCount === 0 ? 'Select items to sync' : `Sync ${selectedCount} selected item${selectedCount > 1 ? 's' : ''}`}
              className="p-2 rounded-full transition-all hover:scale-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: isSyncDisabled ? 'transparent' : 'var(--color-hover)',
                color: 'var(--color-text)'
              }}
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            </button>
          )}
          
          {onLike && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onLike()
              }}
              disabled={isLikeDisabled}
              title={`Like ${selectedCount} item${selectedCount > 1 ? 's' : ''}`}
              className="p-2 rounded-full transition-all hover:scale-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: isLikeDisabled ? 'transparent' : 'var(--color-hover)',
                color: 'var(--color-text)'
              }}
            >
              <ThumbsUp className="w-4 h-4" />
            </button>
          )}
          
          {onLove && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onLove()
              }}
              disabled={isLoveDisabled}
              title={`Love ${selectedCount} item${selectedCount > 1 ? 's' : ''}`}
              className="p-2 rounded-full transition-all hover:scale-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: isLoveDisabled ? 'transparent' : 'var(--color-hover)',
                color: 'var(--color-text)'
              }}
            >
              <Heart className="w-4 h-4" />
            </button>
          )}
          
          {onRemoveLike && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onRemoveLike()
              }}
              disabled={isRemoveLikeDisabled}
              title={`Remove like from ${selectedCount} item${selectedCount > 1 ? 's' : ''}`}
              className="p-2 rounded-full transition-all hover:scale-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: isRemoveLikeDisabled ? 'transparent' : 'var(--color-hover)',
                color: 'var(--color-text)'
              }}
            >
              <X className="w-4 h-4" />
            </button>
          )}
          
          {onToggleLibrary && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onToggleLibrary()
              }}
              disabled={isToggleLibraryDisabled}
              title={libraryToggleLabel || `Toggle library for ${selectedCount} item${selectedCount > 1 ? 's' : ''}`}
              className="p-2 rounded-full transition-all hover:scale-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: isToggleLibraryDisabled ? 'transparent' : 'var(--color-hover)',
                color: 'var(--color-text)'
              }}
            >
              {libraryToggleLabel?.toLowerCase().includes('remove') || libraryToggleLabel?.toLowerCase().includes('delete') ? (
                <BookmarkMinus className="w-4 h-4" />
              ) : (
                <BookmarkPlus className="w-4 h-4" />
              )}
            </button>
          )}
          
          {onShare && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onShare()
              }}
              disabled={isShareDisabled}
              title={`Share ${selectedCount} item${selectedCount > 1 ? 's' : ''}`}
              className="p-2 rounded-full transition-all hover:scale-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: isShareDisabled ? 'transparent' : 'var(--color-hover)',
                color: 'var(--color-text)'
              }}
            >
              <Share2 className="w-4 h-4" />
            </button>
          )}
          
          {!hideDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              disabled={isDeleteDisabled}
              title={`Delete ${selectedCount} item${selectedCount > 1 ? 's' : ''}`}
              className="p-2 rounded-full transition-all hover:scale-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: isDeleteDisabled ? 'transparent' : 'var(--color-hover)',
                color: 'var(--color-text)'
              }}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    )}
  </>
  )
}
