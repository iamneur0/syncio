import React from 'react'
import { Puzzle, Eye, EyeOff, ShieldCheck, Trash2, LockKeyhole, Unlock } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'

interface AddonListProps {
  addons: Array<{
    id: string
    name?: string
    description?: string
    version?: string
    iconUrl?: string
    manifest?: {
      name?: string
      logo?: string
    }
  }>
  title: string
  count?: number
  isLoading?: boolean
  emptyMessage?: string
  className?: string
  children?: React.ReactNode // For custom addon rendering (e.g., with drag and drop)
  type?: 'group' | 'stremio' // Type of addon list
  onExclude?: (addonId: string) => void // For group addons
  onProtect?: (addonId: string) => void // For Stremio addons
  onDelete?: (addonId: string) => void // For Stremio addons
  excludedAddons?: Set<string> // Set of excluded addon IDs
  protectedAddons?: Set<string> // Set of protected addon IDs
  deleteMode?: 'safe' | 'unsafe' // Delete mode for Stremio addons
}

export default function AddonList({
  addons,
  title,
  count,
  isLoading = false,
  emptyMessage = 'No addons',
  className = '',
  children,
  type = 'group',
  onExclude,
  onProtect,
  onDelete,
  excludedAddons = new Set(),
  protectedAddons = new Set(),
  deleteMode = 'safe'
}: AddonListProps) {
  const theme = useTheme()
  const { isDark } = theme

  if (isLoading) {
    return (
      <div className={`p-4 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-gray-50'} ${className}`}>
        <h3 className={`text-lg font-semibold mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
          {title} {count !== undefined && `(${count})`}
        </h3>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 accent-border"></div>
        </div>
      </div>
    )
  }

  return (
    <div className={`p-4 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-gray-50'} ${className}`}>
      <h3 className={`text-lg font-semibold mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
        {title} {count !== undefined && `(${count})`}
      </h3>
      {children ? (
        children
      ) : addons && addons.length > 0 ? (
        <div className="space-y-3">
          {addons.map((addon: any, index: number) => {
            const iconUrl = addon.iconUrl || addon?.manifest?.logo
            const addonName = addon.name || addon?.manifest?.name || addon.id
            const isExcluded = type === 'group' && excludedAddons.has(addon.id)
            return (
              <div key={addon.id || index} className={`p-3 rounded-lg border ${
                isDark ? 'bg-gray-600 border-gray-500' : 'bg-white border-gray-200'
              } ${isExcluded ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center flex-1 min-w-0">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center mr-3 flex-shrink-0 overflow-hidden border-0">
                        {iconUrl ? (
                          <img
                            src={iconUrl}
                            alt={`${addonName} logo`}
                            className="w-full h-full object-contain"
                            onError={(e: any) => { e.currentTarget.style.display = 'none' }}
                          />
                        ) : null}
                        <div className={`w-full h-full ${iconUrl ? 'hidden' : 'flex'} bg-stremio-purple items-center justify-center border-0`}>
                          <Puzzle className="w-5 h-5 text-white" />
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col min-[480px]:flex-row min-[480px]:items-center min-[480px]:gap-2">
                          <h4 className={`font-medium truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                            {addonName || 'Unnamed Addon'}
                          </h4>
                          {addon.version && (
                            <div className={`px-2 py-1 rounded text-xs font-medium mt-1 min-[480px]:mt-0 ${
                              isDark ? 'bg-gray-500 text-gray-200' : 'bg-gray-200 text-gray-700'
                            }`}>
                              v{addon.version}
                            </div>
                          )}
                        </div>
                        <p className={`text-sm mt-1 truncate ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                          {addon.description || 'No description'}
                        </p>
                      </div>
                    </div>
                  </div>
                  {type === 'group' && onExclude && (
                    <div className="ml-1 p-2 rounded-lg">
                      <button
                        onClick={() => onExclude(addon.id)}
                        className={`flex items-center justify-center h-8 w-8 text-sm rounded transition-colors focus:outline-none ${
                          excludedAddons.has(addon.id)
                            ? (isDark ? 'text-red-300 hover:text-red-400' : 'text-red-600 hover:text-red-700')
                            : (isDark ? 'text-gray-300 hover:text-red-400' : 'text-gray-600 hover:text-red-600')
                        }`}
                        title={excludedAddons.has(addon.id) ? 'Include for this user' : 'Exclude for this user'}
                      >
                        {excludedAddons.has(addon.id) ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  )}
                  {type === 'stremio' && (onProtect || onDelete) && (
                    <div className="flex items-center gap-2 ml-1">
                      {onProtect && (
                        <button
                          onClick={() => onProtect(addon.id)}
                          className={`flex items-center justify-center h-8 w-8 text-sm rounded transition-colors focus:outline-none ${
                            protectedAddons.has(addon.id)
                              ? (isDark ? 'text-yellow-300 hover:text-yellow-400' : 'text-yellow-600 hover:text-yellow-700')
                              : (isDark ? 'text-gray-300 hover:text-yellow-400' : 'text-gray-600 hover:text-yellow-600')
                          }`}
                          title={protectedAddons.has(addon.id) ? 'Unprotect' : 'Protect'}
                        >
                          {protectedAddons.has(addon.id) ? <LockKeyhole className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                        </button>
                      )}
                      {onDelete && (
                        <button
                          onClick={() => onDelete(addon.id)}
                          disabled={deleteMode === 'safe' && protectedAddons.has(addon.id)}
                          className={`flex items-center justify-center h-8 w-8 text-sm rounded transition-colors focus:outline-none ${
                            deleteMode === 'safe' && protectedAddons.has(addon.id)
                              ? (isDark ? 'text-gray-500 cursor-not-allowed opacity-50' : 'text-gray-400 cursor-not-allowed opacity-50')
                              : (isDark ? 'text-gray-300 hover:text-red-400' : 'text-gray-600 hover:text-red-600')
                          }`}
                          title={
                            deleteMode === 'safe' && protectedAddons.has(addon.id)
                              ? 'Cannot delete protected addons in safe mode'
                              : 'Remove this addon from Stremio account'
                          }
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-8">
          <Puzzle className={`w-12 h-12 mx-auto mb-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
          <p className={`${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            {emptyMessage}
          </p>
        </div>
      )}
    </div>
  )
}
