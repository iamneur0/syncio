import React from 'react'
import { VersionChip } from '@/components/ui'
import AddonIcon from './AddonIcon'
import { Puzzle, X } from 'lucide-react'
import { getAddonIconUrl } from '@/utils/addonIcon'

interface AddonItemProps {
  addon: {
    id: string
    name?: string
    description?: string
    version?: string
    iconUrl?: string
    customLogo?: string
  }
  onRemove: (id: string) => void
  isDraggable?: boolean
  dragProps?: any
  dragListeners?: any
}

export default function AddonItem({ 
  addon, 
  onRemove, 
  isDraggable = false,
  dragProps,
  dragListeners
}: AddonItemProps) {
  // Theme not needed for this component

  const containerProps = {
    ...dragProps,
    ...(isDraggable ? dragListeners : {}),
    className: `relative rounded-lg card card-selectable p-4 hover:shadow-lg transition-all ${
      isDraggable ? 'cursor-grab' : ''
    }`
  }

  return (
    <div {...containerProps}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center flex-1 min-w-0">
          <AddonIcon name={addon.name || 'Addon'} iconUrl={getAddonIconUrl({ customLogo: addon.customLogo, iconUrl: addon.iconUrl })} size="10" className="mr-3 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h4 className={`font-medium truncate`}>
                {addon.name || 'Unknown Addon'}
              </h4>
              {addon.version && (
                <VersionChip version={addon.version} />
              )}
            </div>
            <p className={`text-sm truncate`}>
              {addon.description || 'No description'}
            </p>
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove(addon.id)
          }}
          onPointerDown={(e) => {
            e.stopPropagation()
          }}
          className={`p-2 rounded-lg transition-colors color-text color-hover`}
          title="Remove addon from group"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
