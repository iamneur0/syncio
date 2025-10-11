'use client'

import { useState } from 'react'
import { Search, Plus, RefreshCw, Trash2, Grip, List, Square, CheckSquare } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { getTextClasses } from '@/utils/themeUtils'
import { SearchInput } from './Input'
import { IconButton, ToggleButton } from './MicroUI'
import UserMenuButton from '../auth/UserMenuButton'

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
  onDelete: () => void
  viewMode: 'card' | 'list'
  onViewModeChange: (mode: 'card' | 'list') => void
  isReloading?: boolean
  isReloadDisabled?: boolean
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
  onDelete,
  viewMode,
  onViewModeChange,
  isReloading = false,
  isReloadDisabled = false,
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
            <UserMenuButton />
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
          <SearchInput
            placeholder={searchPlaceholder}
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            showClear={!!searchTerm}
            onClear={() => onSearchChange('')}
          />
        </div>
        
        {/* Action Buttons */}
        <div className="flex items-center gap-1.5">
          <IconButton
            onClick={onAdd}
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
