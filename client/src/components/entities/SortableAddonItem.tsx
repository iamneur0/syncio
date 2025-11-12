import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { VersionChip } from '@/components/ui'
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
      className={`relative rounded-lg card card-selectable p-4 hover:shadow-lg transition-all cursor-grab active:cursor-grabbing select-none touch-none ${isDragging ? 'opacity-50' : ''} ${className}`}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center flex-1 min-w-0">
          <AddonIcon name={name} iconUrl={iconUrl} size="10" className="mr-3 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h4 className={`font-medium truncate`}>
                {name}
              </h4>
              {version && (
                <VersionChip version={version} />
              )}
            </div>
            <p className={`text-sm truncate color-text-secondary`}>
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
                  ? 'color-text-secondary cursor-not-allowed'
                  : isProtected
                    ? 'color-text-secondary color-hover'
                    : 'color-text-secondary color-hover'
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
                ? 'color-text-secondary cursor-not-allowed'
                : 'color-text color-hover'
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
