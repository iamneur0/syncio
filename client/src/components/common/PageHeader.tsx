'use client'

import { useState } from 'react'
import { Search, Plus, RefreshCw, Trash2, Grip, List, Square, CheckSquare } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { getTextClasses } from '@/utils/themeUtils'
// Inline search input (replaces deprecated ./Input component)
import { IconButton, ToggleButton } from './MicroUI'
import AccountMenuButton from '../auth/AccountMenuButton'

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
  mounted?: boolean
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
  mounted = true
}: PageHeaderProps) {
  const theme = useTheme()

  const handleSelectToggle = () => {
    if (selectedCount === 0) {
      onSelectAll()
    } else {
      onDeselectAll()
    }
  }

  return (
    <div className="mb-6 sm:mb-8">
      {/* Title and Description */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-4">
        <div>
          <h1 className={`hidden sm:block text-xl sm:text-2xl font-bold ${getTextClasses(theme, 'primary')}`}>
            {title}
          </h1>
          <p className={`text-sm sm:text-base ${getTextClasses(theme, 'secondary')}`}>
            {description}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Desktop account button */}
          <div className="hidden lg:block ml-1">
            <AccountMenuButton />
          </div>
        </div>
      </div>

      {/* Search and Controls */}
      <div className="flex flex-row items-center gap-4">
        {/* Selection Toggle */}
        <IconButton
          onClick={handleSelectToggle}
          title={selectedCount === 0 ? 'Select All' : 'Deselect All'}
        >
          {selectedCount > 0 ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
        </IconButton>
        
        {/* Search Bar */}
        <div className="flex-1">
          <div className="relative">
            <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-9 pr-10 py-2 rounded-lg border bg-white text-gray-900 placeholder-gray-500 border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 dark:border-gray-600 dark:focus:ring-gray-600"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs px-2 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-600 dark:text-white dark:hover:bg-gray-500"
                title="Clear"
              >
                Clear
              </button>
            )}
          </div>
        </div>
        
        {/* Action Buttons */}
        <div className="flex items-center gap-1.5">
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
        
        {/* View Mode Toggle */}
        {mounted && (
          <div className="flex items-center">
            <div className="flex rounded-lg border border-gray-300 dark:border-gray-600">
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
        )}
      </div>
    </div>
  )
}
