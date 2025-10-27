import React from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { VersionChip } from './'
import AddonIcon from './AddonIcon'
import { X, LockKeyhole, Unlock } from 'lucide-react'

interface SortableAddonItemProps {
  addon: any
  onRemove: (id: string) => void
  onProtect?: (id: string) => void
  isProtected?: boolean
  isDefault?: boolean
  isUnsafeMode?: boolean
  showProtectButton?: boolean
  className?: string
  uniqueId?: string // Override the generated ID to ensure uniqueness
}

export default function SortableAddonItem({ 
  addon, 
  onRemove, 
  onProtect,
  isProtected = false,
  isDefault = false,
  isUnsafeMode = false,
  showProtectButton = false,
  className = '',
  uniqueId
}: SortableAddonItemProps) {
  const { isDark, isMono } = useTheme()

  // Extract data from the addon format (handles both Stremio and group addon formats)
  const manifest = addon?.manifest || addon
  // For group addons, use database ID; for Stremio addons, use transportUrl (this is what the protect function expects)
  const addonId = uniqueId || addon?.id || addon?.transportUrl || addon?.manifestUrl || addon?.url || manifest?.id || 'unknown'
  
  // Use database fields for display (name, description, version, iconUrl)
  const name = addon?.name || manifest?.name || addon?.transportName || 'Unknown'
  const version = addon?.version || manifest?.version
  const description = addon?.description || manifest?.description || 'No description'
  const iconUrl = addon?.iconUrl || manifest?.logo || manifest?.icon || null

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: addonId })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const handleProtect = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onProtect && (!isDefault || isUnsafeMode)) {
      onProtect(addonId)
    }
  }

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isDefault || isUnsafeMode) {
      onRemove(addonId)
    }
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation()
  }

  const isRemoveDisabled = isDefault && !isUnsafeMode
  const isProtectDisabled = isDefault && !isUnsafeMode

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative rounded-lg border p-4 hover:shadow-md transition-all cursor-grab active:cursor-grabbing select-none touch-none ${
        isDark
          ? 'bg-gray-600 border-gray-500 hover:bg-gray-550'
          : 'bg-white border-gray-200 hover:bg-gray-50'
      } ${isDragging ? 'opacity-50' : ''} ${className}`}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center flex-1 min-w-0">
          <AddonIcon name={name} iconUrl={iconUrl} size="10" className="mr-3 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h4 className={`font-medium truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {name}
              </h4>
              {version && (
                <VersionChip version={version} />
              )}
            </div>
            <p className={`text-sm truncate ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              {description}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {showProtectButton && onProtect && (
            <button
              onClick={handleProtect}
              onPointerDown={handlePointerDown}
              disabled={isProtectDisabled}
              className={`p-2 rounded-lg transition-colors ${
                isProtectDisabled
                  ? ((isMono || isDark) ? 'text-gray-500 cursor-not-allowed' : 'text-gray-500 cursor-not-allowed')
                  : isProtected
                    ? ((isMono || isDark) ? 'text-green-400 hover:bg-green-900/20' : 'text-green-600 hover:bg-green-50')
                    : ((isMono || isDark) ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100')
              }`}
              title={
                isProtectDisabled
                  ? "Default addon - cannot be unprotected in safe mode"
                  : isProtected
                    ? "Unprotect addon"
                    : "Protect addon"
              }
            >
              {isProtected ? <LockKeyhole className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
            </button>
          )}
          <button
            onClick={handleRemove}
            onPointerDown={handlePointerDown}
            disabled={isRemoveDisabled}
            className={`p-2 rounded-lg transition-colors ${
              isRemoveDisabled
                ? ((isMono || isDark) ? 'text-gray-500 cursor-not-allowed' : 'text-gray-500 cursor-not-allowed')
                : ((isMono || isDark) ? 'text-red-400 hover:bg-red-900/20' : 'text-red-600 hover:bg-red-50')
            }`}
            title={
              isRemoveDisabled
                ? "Default addon - cannot be deleted in safe mode"
                : "Delete addon"
            }
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
