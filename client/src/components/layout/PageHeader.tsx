'use client'

import { useState, useRef, useEffect } from 'react'
import { Search, Plus, RefreshCw, Trash2, Grip, List, Square, CheckSquare, Send, Filter, ChevronDown } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { getTextClasses } from '@/utils/themeUtils'
// Inline search input (replaces deprecated ./Input component)
import { IconButton, ToggleButton } from '@/components/ui'
import AccountMenuButton from '../auth/AccountMenuButton'

interface FilterOption {
  value: string
  label: string
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
  title: string
  description: string
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
  filterPlaceholder = 'Filter by status'
}: PageHeaderProps) {
  const theme = useTheme()
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)

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
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setIsFilterOpen(false)
      }
    }

    if (isFilterOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isFilterOpen])

  return (
    <div className="mb-4 lg:mb-6">
      {/* Title and Description */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-4 gap-4">
        <div>
          <h1 className={`hidden lg:block text-2xl font-bold ${getTextClasses(theme, 'primary')}`}>
            {title}
          </h1>
          <p className={`hidden lg:block text-base ${getTextClasses(theme, 'secondary')}`}>
            {description}
          </p>
          <div className={`lg:hidden text-sm ${getTextClasses(theme, 'secondary')}`}>
            {description}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Desktop account button */}
          <div className="hidden lg:block ml-1">
            <AccountMenuButton />
          </div>
        </div>
      </div>

      {/* Search and Controls */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Mobile: Row with Select All + Search + Toggle | Desktop: Select All (ordered) */}
        <div className="flex flex-row items-center gap-4 lg:contents">
          {/* Selection Toggle */}
          <div className="flex-shrink-0 lg:order-1 flex items-center" style={{ height: '2.5rem' }}>
            <IconButton
              onClick={handleSelectToggle}
              title={selectedCount === 0 ? 'Select All' : 'Deselect All'}
            >
              {selectedCount > 0 ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
            </IconButton>
          </div>

          {/* Search Bar with toggle on right (mobile) */}
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
            
            {/* Mobile: View Mode Toggle on right of search */}
            <div className="lg:hidden flex items-center h-10 flex-shrink-0">
              <div className="flex h-full rounded-lg border color-border">
                <ToggleButton
                  isActive={viewMode === 'card'}
                  onClick={() => onViewModeChange('card')}
                  activeIcon={<Grip className="w-4 h-4" />}
                  inactiveIcon={<Grip className="w-4 h-4" />}
                  className="rounded-l-lg border-0 border-r-0"
                  title="Card view"
                />
                <ToggleButton
                  isActive={viewMode === 'list'}
                  onClick={() => onViewModeChange('list')}
                  activeIcon={<List className="w-4 h-4" />}
                  inactiveIcon={<List className="w-4 h-4" />}
                  className="rounded-r-lg border-0 border-l-0"
                  title="List view"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Filter, Buttons, and View Toggle Row */}
        <div className="flex flex-row items-center justify-between lg:justify-start gap-2 lg:gap-4 lg:order-3 flex-wrap lg:flex-nowrap">

          {/* Filter Dropdown */}
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
                    return (
                      <>
                        {dotColor && (
                          <div 
                            className="w-2 h-2 rounded-full flex-shrink-0" 
                            style={{ backgroundColor: dotColor }}
                          />
                        )}
                        {!dotColor && filterValue && filterValue !== 'all' && <div className="w-2 h-2 flex-shrink-0" />}
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
          </div>
          
          {/* Desktop: View Mode Toggle */}
          <div className="hidden lg:flex items-center h-10">
            <div className="flex h-full rounded-lg border color-border">
              <ToggleButton
                isActive={viewMode === 'card'}
                onClick={() => onViewModeChange('card')}
                activeIcon={<Grip className="w-4 h-4" />}
                inactiveIcon={<Grip className="w-4 h-4" />}
                className="rounded-l-lg border-0 border-r-0"
                title="Card view"
              />
              <ToggleButton
                isActive={viewMode === 'list'}
                onClick={() => onViewModeChange('list')}
                activeIcon={<List className="w-4 h-4" />}
                inactiveIcon={<List className="w-4 h-4" />}
                className="rounded-r-lg border-0 border-l-0"
                title="List view"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
