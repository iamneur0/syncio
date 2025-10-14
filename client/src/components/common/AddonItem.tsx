import React from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { VersionChip } from './'
import { Puzzle, X } from 'lucide-react'

interface AddonItemProps {
  addon: {
    id: string
    name?: string
    description?: string
    version?: string
    iconUrl?: string
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
  const { isDark, isMono } = useTheme()

  const containerProps = {
    ...dragProps,
    ...(isDraggable ? dragListeners : {}),
    className: `relative rounded-lg border p-4 hover:shadow-md transition-all ${
      isDraggable ? 'cursor-grab' : ''
    } ${
      isDark 
        ? 'bg-gray-600 border-gray-500 hover:bg-gray-550' 
        : 'bg-white border-gray-200 hover:bg-gray-50'
    }`
  }

  return (
    <div {...containerProps}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center flex-1 min-w-0">
          <div className="logo-circle-10 mr-3 flex-shrink-0">
            {addon.iconUrl ? (
              <img 
                src={addon.iconUrl} 
                alt={addon.name || 'Addon icon'} 
                className="logo-img-fill"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                  e.currentTarget.nextElementSibling.style.display = 'block'
                }}
              />
            ) : null}
            <div className={`logo-circle-10 ${
              isMono ? 'bg-black text-white' : 'bg-gray-500 text-white'
            }`} style={{ display: addon.iconUrl ? 'none' : 'flex' }}>
              <Puzzle className="w-5 h-5 text-white" />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h4 className={`font-medium truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {addon.name || 'Unknown Addon'}
              </h4>
              {addon.version && (
                <VersionChip version={addon.version} />
              )}
            </div>
            <p className={`text-sm truncate ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
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
          className={`p-2 rounded-lg transition-colors ${
            isDark 
              ? 'text-red-400 hover:bg-red-900/20' 
              : 'text-red-600 hover:bg-red-50'
          }`}
          title="Remove addon from group"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
