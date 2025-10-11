import React from 'react'
import { User as UserIcon, Users as GroupIcon, Puzzle as AddonIcon, Eye, Edit, Trash2, Copy, Download, RefreshCw, Puzzle } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { getColorBgClass, getColorTextClass, getColorBorderClass } from '@/utils/colorMapping'
import SyncBadge from './SyncBadge'
import { ToggleSwitch, VersionChip } from './MicroUI'

type Variant = 'user' | 'group' | 'addon'

interface BaseEntity {
  id: string
  name: string
  isActive: boolean
  colorIndex?: number
  // user
  email?: string
  username?: string
  // group
  description?: string
  // common
  syncStatus?: any
  // addon
  version?: string
  users?: Array<{ id: string; name: string }>
  manifestUrl?: string
  // For group/user cards, these are direct counts
  members?: Array<{ id: string; name: string }>
  addons?: Array<{ id: string; name: string }>
  groups?: Array<{ id: string; name: string; colorIndex?: number }>
  hasStremioConnection?: boolean
  // User specific
  stremioAddonsCount?: number
  groupName?: string
}

interface EntityCardProps {
  variant: Variant
  entity: BaseEntity
  isSelected: boolean
  onSelect: (id: string) => void
  onToggle: (id: string, isActive: boolean) => void
  onEdit?: (entity: any) => void
  onDelete: (id: string) => void
  onView?: (entity: BaseEntity) => void
  onClone?: (entity: BaseEntity) => void // group only
  onSync?: (id: string) => void
  // user-only SyncBadge context
  userExcludedSet?: Set<string>
  userProtectedSet?: Set<string>
  isSyncing?: boolean
  // addon-only badges
  isProtectedAddon?: boolean
  // Additional handlers for user actions
  onImport?: (id: string) => void
  onReload?: (id: string) => void
  isImporting?: boolean
  // List mode styling
  isListMode?: boolean
  isReloading?: boolean
}

export default function EntityCard({
  variant,
  entity,
  isSelected,
  onSelect,
  onToggle,
  onEdit,
  onDelete,
  onView,
  onClone,
  onSync,
  userExcludedSet,
  userProtectedSet,
  isSyncing,
  isProtectedAddon,
  onImport,
  onReload,
  isImporting,
  isReloading,
  isListMode
}: EntityCardProps) {
  const theme = useTheme()
  const { isDark, isModern, isModernDark, isMono } = theme

  const handleCardClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onSelect(entity.id)
  }

  const handleToggle = (e?: React.MouseEvent) => {
    try {
      console.log('🔄 EntityCard toggle clicked:', { id: entity.id, isActive: entity.isActive })
      if (e && typeof e.stopPropagation === 'function') {
        e.stopPropagation()
      }
      console.log('🔄 Calling onToggle with:', { id: entity.id, isActive: entity.isActive })
      onToggle(entity.id, entity.isActive)
      console.log('🔄 onToggle called successfully')
    } catch (error) {
      console.error('❌ Error in handleToggle:', error)
    }
  }

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    onEdit?.(entity)
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDelete(entity.id)
  }

  const handleView = (e: React.MouseEvent) => {
    e.stopPropagation()
    onView?.(entity)
  }

  const handleClone = (e: React.MouseEvent) => {
    e.stopPropagation()
    onClone?.(entity)
  }

  const handleSync = (e: React.MouseEvent) => {
    e.stopPropagation()
    onSync?.(entity.id)
  }

  const handleImport = (e: React.MouseEvent) => {
    e.stopPropagation()
    onImport?.(entity.id)
  }

  const handleReload = (e: React.MouseEvent) => {
    e.stopPropagation()
    onReload?.(entity.id)
  }

  const iconBg = getColorBgClass(
    entity.colorIndex,
    isMono ? 'mono' : isModern ? 'modern' : isModernDark ? 'modern-dark' : isDark ? 'dark' : 'light'
  )
  
  const iconBorder = getColorBorderClass(entity.colorIndex)

  // Get display name and subtitle
  const displayName = variant === 'user' 
    ? (entity.username || entity.email || 'Unknown User')
    : entity.name

  const subtitle = variant === 'user' 
    ? '' // Never show group name in subtitle for users
    : variant === 'group'
    ? '' // Never show description for groups
    : variant === 'addon'
    ? '' // Never show description for addons
    : ''

  // Get avatar text
  const getAvatarText = () => {
    if (variant === 'user') {
      return (entity.username || entity.email || 'U').charAt(0).toUpperCase()
    } else if (variant === 'group') {
      return entity.name ? entity.name.charAt(0).toUpperCase() : 'G'
    } else {
      return entity.name ? entity.name.charAt(0).toUpperCase() : 'A'
    }
  }

  // Normalize counts
  const addonGroupsCount = variant === 'addon' ? (
    Array.isArray((entity as any).groups) ? (entity as any).groups.length :
    typeof (entity as any).groups === 'number' ? (entity as any).groups :
    typeof (entity as any).groupsCount === 'number' ? (entity as any).groupsCount :
    typeof (entity as any).addonsCount === 'number' ? (entity as any).addonsCount : 0
  ) : 0

  const addonUsersCount = variant === 'addon' ? (
    Array.isArray((entity as any).users) ? (entity as any).users.length :
    typeof (entity as any).users === 'number' ? (entity as any).users :
    typeof (entity as any).usersCount === 'number' ? (entity as any).usersCount : 0
  ) : 0

  const userGroupsCount = variant === 'user' ? (
    Array.isArray((entity as any).groups) ? (entity as any).groups.length :
    typeof (entity as any).groups === 'number' ? (entity as any).groups :
    typeof (entity as any).groupsCount === 'number' ? (entity as any).groupsCount : 0
  ) : 0

  const groupMembersCount = variant === 'group' ? (
    Array.isArray((entity as any).members) ? (entity as any).members.length :
    typeof (entity as any).members === 'number' ? (entity as any).members :
    typeof (entity as any).membersCount === 'number' ? (entity as any).membersCount : 0
  ) : 0

  const groupAddonsCount = variant === 'group' ? (
    Array.isArray((entity as any).addons) ? (entity as any).addons.length :
    typeof (entity as any).addons === 'number' ? (entity as any).addons :
    typeof (entity as any).addonsCount === 'number' ? (entity as any).addonsCount : 0
  ) : 0

  return (
    <div 
      onClick={handleCardClick}
      className={isListMode ? 
        `rounded-lg border p-4 hover:shadow-md transition-shadow flex items-center justify-between relative group ${
          isModern
            ? 'bg-gradient-to-r from-purple-50/90 to-blue-50/90 backdrop-blur-sm border-purple-200/60'
            : isModernDark
            ? 'bg-gradient-to-r from-purple-800/40 to-blue-800/40 backdrop-blur-sm border-purple-600/50'
            : isDark 
            ? 'bg-gray-800 border-gray-700' 
            : 'bg-white border-gray-200'
        } ${!entity.isActive ? 'opacity-50' : ''} cursor-pointer ${
          isSelected 
            ? (isMono ? 'ring-2 ring-white/50 border-white/40' : 'ring-2 ring-gray-400 border-gray-400') 
            : ''
        }` :
        `rounded-lg shadow-sm border p-6 hover:shadow-md transition-shadow flex flex-col h-full relative group ${
          isModern
            ? 'bg-gradient-to-br from-purple-50/90 to-blue-50/90 backdrop-blur-sm border-purple-200/60'
            : isModernDark
            ? 'bg-gradient-to-br from-purple-800/40 to-blue-800/40 backdrop-blur-sm border-purple-600/50'
            : isDark 
            ? 'bg-gray-800 border-gray-700' 
            : 'bg-white border-gray-200'
        } ${!entity.isActive ? 'opacity-50' : ''} cursor-pointer ${
          isSelected 
            ? (isMono ? 'ring-2 ring-white/50 border-white/40' : 'ring-2 ring-gray-400 border-gray-400') 
            : ''
        }`
      }
    >
      {isListMode ? (
        // List mode layout
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
              variant === 'addon' && (entity as any).iconUrl 
                ? 'border-0' 
                : isMono
                ? 'bg-black border border-white/20 text-white'
                : isModern
                ? 'bg-gradient-to-br from-purple-600 to-blue-800 text-white'
                : isModernDark
                ? 'bg-gradient-to-br from-purple-800 to-blue-900 text-white'
                : `${iconBg} border ${iconBorder} text-white`
            }`}>
              {variant === 'addon' && (entity as any).iconUrl ? (
                <img 
                  src={(entity as any).iconUrl} 
                  alt={entity.name}
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    const target = e.currentTarget as HTMLImageElement
                    const nextElement = target.nextElementSibling as HTMLElement
                    target.style.display = 'none'
                    if (nextElement) nextElement.style.display = 'block'
                  }}
                />
              ) : null}
              <span className={`text-white font-semibold text-lg ${variant === 'addon' && (entity as any).iconUrl ? 'hidden' : ''}`}>
                {getAvatarText()}
              </span>
            </div>
            
            <div className="flex-1 min-w-0 overflow-hidden">
              <div className="flex items-center gap-2 mb-1">
                <h3 className={`font-medium truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {displayName}
                </h3>
                {variant === 'addon' && (entity as any).version && (
                  <VersionChip version={(entity as any).version} size="sm" />
                )}
                {/* Sync Badge next to name for users and groups */}
                {variant === 'user' && userExcludedSet && userProtectedSet && onSync && (
                  <SyncBadge
                    userId={entity.id}
                    onSync={onSync}
                    isSyncing={isSyncing || false}
                    userExcludedSet={userExcludedSet}
                    userProtectedSet={userProtectedSet}
                    isListMode={true}
                  />
                )}
                {variant === 'group' && onSync && (
                  <SyncBadge
                    groupId={entity.id}
                    onSync={onSync}
                    isSyncing={isSyncing || false}
                    isListMode={true}
                  />
                )}
              </div>
              <p className={`text-sm truncate ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                {subtitle}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              {/* Stats for list mode - always show like card mode */}
              {variant === 'addon' && (
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <UserIcon className="w-4 h-4" />
                  <span>{addonUsersCount}</span>
                </div>
              )}
              {variant === 'addon' && (
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <GroupIcon className="w-4 h-4" />
                  <span>{addonGroupsCount}</span>
                </div>
              )}
              {variant === 'user' && (
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Puzzle className="w-4 h-4" />
                  <span>{(entity as any).stremioAddonsCount || 0}</span>
                </div>
              )}
              {variant === 'user' && (
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <GroupIcon className="w-4 h-4" />
                  <span>{(entity as any).groupName || ((entity as any).groups && (entity as any).groups.length > 0) ? ((entity as any).groupName || (entity as any).groups[0].name) : 'No Group'}</span>
                </div>
              )}
              {variant === 'group' && (
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <AddonIcon className="w-4 h-4" />
                  <span>{groupAddonsCount}</span>
                </div>
              )}
              {variant === 'group' && (
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <UserIcon className="w-4 h-4" />
                  <span>{groupMembersCount}</span>
                </div>
              )}
            </div>
            
            <ToggleSwitch
              checked={entity.isActive}
              onChange={() => handleToggle({} as React.MouseEvent)}
              size="sm"
            />
            
            <div className="flex items-center gap-1">
              {onView && (
                <button
                  onClick={handleView}
                  className={`p-2 rounded transition-colors ${isDark ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-600'}`}
                  title="View details"
                >
                  <Eye className="w-4 h-4" />
                </button>
              )}
              
              {onEdit && (
                <button
                  onClick={handleEdit}
                  className={`p-2 rounded transition-colors ${isDark ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-600'}`}
                  title="Edit"
                >
                  <Edit className="w-4 h-4" />
                </button>
              )}
              
              {variant === 'group' && onClone && (
                <button
                  onClick={handleClone}
                  className={`p-2 rounded transition-colors ${isDark ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-600'}`}
                  title="Clone"
                >
                  <Copy className="w-4 h-4" />
                </button>
              )}
              
              {variant === 'user' && onImport && (
                <button
                  onClick={handleImport}
                  disabled={isImporting}
                  className={`p-2 rounded transition-colors ${isDark ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-600'} ${isImporting ? 'opacity-50' : ''}`}
                  title="Import user's addons to a new group"
                >
                  {isImporting ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                </button>
              )}
              
              {variant === 'user' && onReload && (
                <button
                  onClick={handleReload}
                  disabled={isReloading}
                  className={`p-2 rounded transition-colors ${isDark ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-600'} ${isReloading ? 'opacity-50' : ''}`}
                  title="Reload user addons"
                >
                  <RefreshCw className={`w-4 h-4 ${isReloading ? 'animate-spin' : ''}`} />
                </button>
              )}
              
              {variant === 'addon' && onReload && (
                <button
                  onClick={handleReload}
                  disabled={isReloading}
                  className={`p-2 rounded transition-colors ${isDark ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-600'} ${isReloading ? 'opacity-50' : ''}`}
                  title="Reload"
                >
                  <RefreshCw className={`w-4 h-4 ${isReloading ? 'animate-spin' : ''}`} />
                </button>
              )}
              
              <button
                onClick={handleDelete}
                className={`p-2 rounded transition-colors ${isDark ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-600'}`}
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        // Card mode layout
        <div className="flex flex-col h-full">
          <div className="flex items-start justify-between mb-4">
        <div className="flex items-center">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
            variant === 'addon' && (entity as any).iconUrl 
              ? 'border-0' 
              : isMono
              ? 'bg-black border border-white/20 text-white'
              : isModern
              ? 'bg-gradient-to-br from-purple-600 to-blue-800 text-white'
              : isModernDark
              ? 'bg-gradient-to-br from-purple-800 to-blue-900 text-white'
              : `${iconBg} border ${iconBorder} text-white`
          }`}>
            {variant === 'addon' && (entity as any).iconUrl ? (
              <img 
                src={(entity as any).iconUrl} 
                alt={entity.name}
                className="w-full h-full rounded object-contain"
                onError={(e) => {
                  // Fallback to letter if image fails to load
                  const target = e.currentTarget as HTMLImageElement
                  const nextElement = target.nextElementSibling as HTMLElement
                  target.style.display = 'none'
                  if (nextElement) nextElement.style.display = 'block'
                }}
              />
            ) : null}
            <span className={`text-white font-semibold text-lg ${variant === 'addon' && (entity as any).iconUrl ? 'hidden' : ''}`}>
              {getAvatarText()}
            </span>
          </div>
          <div className="ml-3">
            <h3 className={`font-medium cursor-pointer transition-colors ${
              isModern ? 'text-purple-800 hover:text-purple-900' : 
              isModernDark ? 'text-purple-200 hover:text-purple-100' : 
              (isDark ? 'text-white hover:text-gray-300' : 'text-gray-900 hover:text-gray-700')
            }`}>
              {displayName}
            </h3>
            <p className={`text-sm ${
              isModern ? 'text-purple-600' : 
              isModernDark ? 'text-purple-300' : 
              (isDark ? 'text-gray-400' : 'text-gray-500')
            }`}>
              {subtitle}
            </p>
            {/* Version Chip for addons */}
            {variant === 'addon' && (entity as any).version && (
              <div className="mt-1">
                <VersionChip version={(entity as any).version} size="sm" />
              </div>
            )}
            {/* Sync Badge for users and groups */}
            {variant === 'user' && userExcludedSet && userProtectedSet && onSync && (
              <div className="mt-1 mb-0">
                <SyncBadge
                  userId={entity.id}
                  onSync={onSync}
                  isSyncing={isSyncing || false}
                  userExcludedSet={userExcludedSet}
                  userProtectedSet={userProtectedSet}
                />
              </div>
            )}
            {variant === 'group' && onSync && (
              <div className="mt-1 mb-0">
                <SyncBadge
                  groupId={entity.id}
                  onSync={onSync}
                  isSyncing={isSyncing || false}
                />
              </div>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <ToggleSwitch
            checked={!!entity.isActive}
            onChange={() => handleToggle({} as React.MouseEvent)}
            size="md"
            title={entity.isActive ? 'Click to disable' : 'Click to enable'}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4 items-start">
        {variant === 'group' && (
          <>
            <div className="flex items-center">
              <Puzzle className="w-4 h-4 text-gray-400 mr-2" />
              <div>
                <p className={`text-lg font-semibold ${
                  isModern ? 'text-purple-100' : isModernDark ? 'text-purple-100' : (isDark ? 'text-white' : 'text-gray-900')
                }`}>
                  {(entity as any).addons || 0}
                </p>
                <p className={`text-xs ${
                  isModern ? 'text-purple-300' : isModernDark ? 'text-purple-300' : (isDark ? 'text-gray-400' : 'text-gray-500')
                }`}>Addons</p>
              </div>
            </div>
            <div className="flex items-center">
              <UserIcon className="w-4 h-4 text-gray-400 mr-2" />
              <div>
                <p className={`text-lg font-semibold ${
                  isModern ? 'text-purple-100' : isModernDark ? 'text-purple-100' : (isDark ? 'text-white' : 'text-gray-900')
                }`}>
                  {(entity as any).members || 0}
                </p>
                <p className={`text-xs ${
                  isModern ? 'text-purple-300' : isModernDark ? 'text-purple-300' : (isDark ? 'text-gray-400' : 'text-gray-500')
                }`}>Members</p>
              </div>
            </div>
          </>
        )}
        {variant === 'user' && (
          <>
            <div className="flex items-center">
              <Puzzle className="w-4 h-4 text-gray-400 mr-2" />
              <div>
                <p className={`text-lg font-semibold ${
                  isModern ? 'text-purple-100' : isModernDark ? 'text-purple-100' : (isDark ? 'text-white' : 'text-gray-900')
                }`}>
                  {(entity as any).stremioAddonsCount || 0}
                </p>
                <p className={`text-xs ${
                  isModern ? 'text-purple-300' : isModernDark ? 'text-purple-300' : (isDark ? 'text-gray-400' : 'text-gray-500')
                }`}>Addons</p>
              </div>
            </div>
            <div className="flex items-center">
              <UserIcon className="w-4 h-4 text-gray-400 mr-2" />
              <div>
                <p className={`text-lg font-semibold ${
                  isModern ? 'text-purple-100' : isModernDark ? 'text-purple-100' : (isDark ? 'text-white' : 'text-gray-900')
                }`}>
                  {(entity as any).groupName || 'No group'}
                </p>
              </div>
            </div>
          </>
        )}
        {variant === 'addon' && (
          <>
            <div className="flex items-center">
              <UserIcon className="w-4 h-4 text-gray-400 mr-2" />
              <div>
                <p className={`text-lg font-semibold ${
                  isModern ? 'text-purple-100' : isModernDark ? 'text-purple-100' : (isDark ? 'text-white' : 'text-gray-900')
                }`}>{addonUsersCount}</p>
                <p className={`text-xs ${
                  isModern ? 'text-purple-300' : isModernDark ? 'text-purple-300' : (isDark ? 'text-gray-400' : 'text-gray-500')
                }`}>Users</p>
              </div>
            </div>
            <div className="flex items-center">
              <GroupIcon className="w-4 h-4 text-gray-400 mr-2" />
              <div>
                <p className={`text-lg font-semibold ${
                  isModern ? 'text-purple-100' : isModernDark ? 'text-purple-100' : (isDark ? 'text-white' : 'text-gray-900')
                }`}>{addonGroupsCount}</p>
                <p className={`text-xs ${
                  isModern ? 'text-purple-300' : isModernDark ? 'text-purple-300' : (isDark ? 'text-gray-400' : 'text-gray-500')
                }`}>Groups</p>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex gap-2">
        {onView && (
          <button
            onClick={handleView}
            className={`flex-1 flex items-center justify-center px-3 py-2 h-8 min-h-8 max-h-8 text-sm rounded transition-colors hover:font-semibold ${
              isModern
                ? 'bg-gradient-to-r from-purple-100 to-blue-100 text-purple-800 hover:from-purple-200 hover:to-blue-200'
                : isModernDark
                ? 'bg-gradient-to-r from-purple-800 to-blue-800 text-purple-100 hover:from-purple-700 hover:to-blue-700'
                : isMono
                ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                : isDark
                ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Eye className="w-4 h-4 mr-1" />
            View
          </button>
        )}
        
        {variant === 'user' && onImport && (
          <button
            onClick={handleImport}
            disabled={isImporting}
            className={`flex items-center justify-center px-3 py-2 h-8 min-h-8 max-h-8 text-sm rounded transition-colors disabled:opacity-50 ${
              isModern
                ? 'bg-gradient-to-br from-purple-100 to-blue-100 text-purple-800 hover:from-purple-200 hover:to-blue-200'
                : isModernDark
                ? 'bg-gradient-to-br from-purple-800 to-blue-800 text-purple-100 hover:from-purple-700 hover:to-blue-700'
                : isMono
                ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
            }`}
            title="Import user's addons to a new group"
          >
            {isImporting ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
            ) : (
              <Download className="w-4 h-4" />
            )}
          </button>
        )}
        
        {variant === 'user' && onReload && (
          <button
            onClick={handleReload}
            disabled={isReloading}
            className={`flex items-center justify-center px-3 py-2 h-8 min-h-8 max-h-8 text-sm rounded transition-colors disabled:opacity-50 ${
              isModern
                ? 'bg-gradient-to-br from-green-100 to-green-200 text-green-800 hover:from-green-200 hover:to-green-300'
                : isModernDark
                ? 'bg-gradient-to-br from-green-800 to-green-900 text-green-100 hover:from-green-700 hover:to-green-800'
                : isMono
                ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                : 'bg-green-100 text-green-700 hover:bg-green-200'
            }`}
            title="Reload user addons"
          >
            <RefreshCw className={`w-4 h-4 ${isReloading ? 'animate-spin' : ''}`} />
          </button>
        )}
        
        {variant === 'group' && onSync && (
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className={`flex items-center justify-center px-3 py-2 h-8 min-h-8 max-h-8 text-sm rounded transition-colors disabled:opacity-50 ${
              isModern
                ? 'bg-gradient-to-br from-green-100 to-green-200 text-green-800 hover:from-green-200 hover:to-green-300'
                : isModernDark
                ? 'bg-gradient-to-br from-green-800 to-green-900 text-green-100 hover:from-green-700 hover:to-green-800'
                : isMono
                ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                : 'bg-green-100 text-green-700 hover:bg-green-200'
            }`}
            title="Sync all users in this group"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
          </button>
        )}
        
        {variant === 'group' && onClone && (
          <button
            onClick={handleClone}
            className={`flex items-center justify-center px-3 py-2 h-8 min-h-8 max-h-8 text-sm rounded transition-colors ${
              isModern
                ? 'bg-gradient-to-br from-purple-100 to-blue-100 text-purple-800 hover:from-purple-200 hover:to-blue-200'
                : isModernDark
                ? 'bg-gradient-to-br from-purple-800 to-blue-800 text-purple-100 hover:from-purple-700 hover:to-blue-700'
                : isMono
                ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
            }`}
            title="Clone this group"
          >
            <Copy className="w-4 h-4" />
          </button>
        )}
        
        
        {variant === 'addon' && onReload && (
          <button
            onClick={handleReload}
            disabled={isReloading}
            className={`flex items-center justify-center px-3 py-2 h-8 min-h-8 max-h-8 text-sm rounded transition-colors disabled:opacity-50 ${
              isModern
                ? 'bg-gradient-to-br from-green-100 to-green-200 text-green-800 hover:from-green-200 hover:to-green-300'
                : isModernDark
                ? 'bg-gradient-to-br from-green-800 to-green-900 text-green-100 hover:from-green-700 hover:to-green-800'
                : isMono
                ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                : 'bg-green-100 text-green-700 hover:bg-green-200'
            }`}
            title="Reload addon"
          >
            <RefreshCw className={`w-4 h-4 ${isReloading ? 'animate-spin' : ''}`} />
          </button>
        )}
        
        <button 
          onClick={handleDelete}
          disabled={false}
          className={`flex items-center justify-center px-3 py-2 h-8 min-h-8 max-h-8 text-sm rounded transition-colors disabled:opacity-50 ${
            isModern
              ? 'bg-gradient-to-br from-purple-100 to-blue-100 text-purple-800 hover:from-purple-200 hover:to-blue-200'
              : isModernDark
              ? 'bg-gradient-to-br from-purple-800 to-blue-800 text-purple-100 hover:from-purple-700 hover:to-blue-700'
              : isMono
              ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              : 'bg-red-100 text-red-700 hover:bg-red-200'
          }`}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
        </div>
      )}
    </div>
  )
}