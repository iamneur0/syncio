import React from 'react'
import { User as UserIcon, Users as GroupIcon, Eye, Edit, Trash2, Copy, Download, RefreshCw, Puzzle } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { getColorBgClass, getColorTextClass, getColorBorderClass, getColorHexValue } from '@/utils/colorMapping'
import AddonIcon from './AddonIcon'
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
  manifestUrl?: string
  // For group/user cards, these are direct counts
  users?: Array<{ id: string; name: string }>
  addons?: Array<{ id: string; name: string }>
  groups?: Array<{ id: string; name: string; colorIndex?: number }>
  hasStremioConnection?: boolean
  // User specific
  stremioAddonsCount?: number
  groupName?: string
  groupId?: string
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
  
  const iconBorder = getColorBorderClass(entity.colorIndex, isMono ? 'mono' : isDark ? 'dark' : 'light')

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

  const groupUsersCount = variant === 'group' ? (
    typeof (entity as any).users === 'number' ? (entity as any).users :
    Array.isArray((entity as any).users) ? (entity as any).users.length :
    typeof (entity as any).usersCount === 'number' ? (entity as any).usersCount :
    // Fallback to backend 'users' field from /api/groups
    typeof (entity as any).users === 'number' ? (entity as any).users : 0
  ) : 0

  const groupAddonsCount = variant === 'group' ? (
    typeof (entity as any).addons === 'number' ? (entity as any).addons :
    Array.isArray((entity as any).addons) ? (entity as any).addons.length :
    typeof (entity as any).addonsCount === 'number' ? (entity as any).addonsCount : 0
  ) : 0

  return (
    <div 
      onClick={handleCardClick}
      className={isListMode ? 
        `rounded-lg border p-4 hover:shadow-md transition-all flex items-center justify-between relative group ${
          isModern
            ? 'bg-gradient-to-r from-purple-50/90 to-blue-50/90 backdrop-blur-sm border-purple-200/60'
            : isModernDark
            ? 'bg-gradient-to-r from-purple-800/40 to-blue-800/40 backdrop-blur-sm border-purple-600/50'
            : isDark 
            ? 'bg-gray-800 border-gray-700 hover:bg-gray-750' 
            : 'bg-white border-gray-200 hover:bg-gray-50'
        } ${!entity.isActive ? 'opacity-50' : ''} cursor-pointer min-w-[320px] ${
          isSelected 
            ? (isMono ? 'ring-2 ring-white/50 border-white/40' : 'ring-2 ring-gray-400 border-gray-400') 
            : ''
        }` :
        `rounded-lg shadow-sm border p-6 hover:shadow-md transition-all flex flex-col h-full relative group min-w-[320px] ${
          isModern
            ? 'bg-gradient-to-br from-purple-50/90 to-blue-50/90 backdrop-blur-sm border-purple-200/60'
            : isModernDark
            ? 'bg-gradient-to-br from-purple-800/40 to-blue-800/40 backdrop-blur-sm border-purple-600/50'
            : isDark 
            ? 'bg-gray-800 border-gray-700 hover:bg-gray-750' 
            : 'bg-white border-gray-200 hover:bg-gray-50'
        } ${!entity.isActive ? 'opacity-50' : ''} cursor-pointer ${
          isSelected 
            ? (isMono ? 'ring-2 ring-white/50 border-white/40' : 'ring-2 ring-gray-400 border-gray-400') 
            : ''
        }`
      }
    >
      {isListMode ? (
        // List mode layout
        <div className="w-full flex flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            {variant === 'addon' ? (
              <div className="flex-shrink-0">
                <AddonIcon name={entity.name} iconUrl={(entity as any).iconUrl} size="12" />
              </div>
            ) : (
              <div 
                className={`logo-circle-12 flex-shrink-0 ${
                  isMono
                    ? `${iconBg} border ${iconBorder} text-white`
                    : isModern
                    ? 'bg-gradient-to-br from-purple-600 to-blue-800 text-white'
                    : isModernDark
                    ? 'bg-gradient-to-br from-purple-800 to-blue-900 text-white'
                    : `${iconBg} border ${iconBorder} text-white`
                }`}
                style={{ backgroundColor: getColorHexValue(entity.colorIndex, isMono ? 'mono' : isDark ? 'dark' : 'light') }}
              >
                <span className="text-white font-semibold text-lg">
                  {getAvatarText()}
                </span>
              </div>
            )}
            
            <div className="flex-1 min-w-0 overflow-hidden">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
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
                    groupId={(entity as any).groupId}
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
              <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'} truncate` }>
                {subtitle}
              </p>

              {/* Stats under name on < md screens */}
              <div className="mt-2 flex items-center gap-3 md:hidden">
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
                    <AddonIcon name="Addon" className="w-4 h-4" />
                    <span>{groupAddonsCount}</span>
                  </div>
                )}
                {variant === 'group' && (
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <UserIcon className="w-4 h-4" />
                    <span>{groupUsersCount}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Right column: stats (desktop) + toggle + actions */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Desktop stats on >= md; on < md they appear under the name */}
            <div className="hidden md:flex items-center gap-3">
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
                  <Puzzle className="w-4 h-4" />
                  <span>{groupAddonsCount}</span>
                </div>
              )}
              {variant === 'group' && (
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <UserIcon className="w-4 h-4" />
                  <span>{groupUsersCount}</span>
                </div>
              )}
            </div>
            
            {/* Toggle is always visible; does not wrap into the button grid */}
            <ToggleSwitch
              checked={entity.isActive}
              onChange={() => handleToggle({} as React.MouseEvent)}
              size="sm"
            />
            
            {/* Actions: inline until < sm, stack 2x2 only on extra-small */}
            <div className="grid grid-cols-2 gap-1 xs:grid-cols-2 sm:flex sm:items-center sm:gap-1 flex-shrink-0 [@media(min-width:640px)]:grid-cols-1">
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
              
                {variant === 'group' && onReload && (
                  <button
                    onClick={handleReload}
                    disabled={isReloading}
                    className={`p-2 rounded transition-colors ${isDark ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-600'} ${isReloading ? 'opacity-50' : ''}`}
                    title="Reload group addons"
                  >
                    <RefreshCw className={`w-4 h-4 ${isReloading ? 'animate-spin' : ''}`} />
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
              
              {variant === 'addon' && onClone && (
                <button
                  onClick={handleClone}
                  className={`p-2 rounded transition-colors ${isDark ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-600'}`}
                  title="Clone addon"
                >
                  <Copy className="w-4 h-4" />
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
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div 
            className={`logo-circle-12 flex-shrink-0 ${
              variant === 'addon' && (entity as any).iconUrl
                ? `border-0 ${(!isDark && !isMono && !isModern && !isModernDark) ? 'accent-bg' : ''}`
                : variant === 'addon'
                ? 'accent-bg accent-text'
                : isMono
                ? `${iconBg} border ${iconBorder} text-white`
                : isModern
                ? 'bg-gradient-to-br from-purple-600 to-blue-800 text-white'
                : isModernDark
                ? 'bg-gradient-to-br from-purple-800 to-blue-900 text-white'
                : `${iconBg} border ${iconBorder} text-white`
            }`}
            style={{ backgroundColor: (variant === 'addon' && (entity as any).iconUrl && (isDark || isMono || isModern || isModernDark)) ? 'transparent' : undefined }}
          >
            {variant === 'addon' && (entity as any).iconUrl ? (
              <img 
                src={(entity as any).iconUrl} 
                alt={entity.name}
                className="logo-img"
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
          <div className="min-w-0 flex-1">
            <h3 className={`font-medium cursor-pointer transition-colors ${
              isModern ? 'text-purple-800 hover:text-purple-900' : 
              isModernDark ? 'text-purple-200 hover:text-purple-100' : 
              (isDark ? 'text-white hover:text-gray-300' : 'text-gray-900 hover:text-gray-700')
            } truncate`} title={displayName}>
              {displayName}
            </h3>
            {/* Inline Sync Badge for groups next to name */}
            {variant === 'group' && onSync && (
              <div className="mt-1 mb-0">
                <SyncBadge
                  groupId={entity.id}
                  onSync={onSync}
                  isSyncing={isSyncing || false}
                />
              </div>
            )}
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
            {/* Sync Badge for users */}
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
          </div>
        </div>
        
        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
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
              <Puzzle className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
              <div className="min-w-0">
                <p className={`text-lg font-semibold ${
                  isModern ? 'text-purple-100' : isModernDark ? 'text-purple-100' : (isDark ? 'text-white' : 'text-gray-900')
                }`}>
                  {(entity as any).addons || 0}
                </p>
                <p className={`text-xs ${
                  isModern ? 'text-purple-300' : isModernDark ? 'text-purple-300' : (isDark ? 'text-gray-400' : 'text-gray-500')
                }`}>{(entity as any).addons === 1 ? 'Addon' : 'Addons'}</p>
              </div>
            </div>
            <div className="flex items-center">
              <UserIcon className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
              <div className="min-w-0">
                <p className={`text-lg font-semibold ${
                  isModern ? 'text-purple-100' : isModernDark ? 'text-purple-100' : (isDark ? 'text-white' : 'text-gray-900')
                }`}>
                  {groupUsersCount}
                </p>
                <p className={`text-xs ${
                  isModern ? 'text-purple-300' : isModernDark ? 'text-purple-300' : (isDark ? 'text-gray-400' : 'text-gray-500')
                }`}>{groupUsersCount === 1 ? 'User' : 'Users'}</p>
              </div>
            </div>
          </>
        )}
        {variant === 'user' && (
          <>
            <div className="flex items-center">
              <Puzzle className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
              <div className="min-w-0">
                <p className={`text-lg font-semibold ${
                  isModern ? 'text-purple-100' : isModernDark ? 'text-purple-100' : (isDark ? 'text-white' : 'text-gray-900')
                }`}>
                  {(entity as any).stremioAddonsCount || 0}
                </p>
                <p className={`text-xs ${
                  isModern ? 'text-purple-300' : isModernDark ? 'text-purple-300' : (isDark ? 'text-gray-400' : 'text-gray-500')
                }`}>{(entity as any).stremioAddonsCount === 1 ? 'Addon' : 'Addons'}</p>
              </div>
            </div>
            <div className="flex items-center">
              <UserIcon className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
              <div className="min-w-0">
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
              <UserIcon className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
              <div className="min-w-0">
                <p className={`text-lg font-semibold ${
                  isModern ? 'text-purple-100' : isModernDark ? 'text-purple-100' : (isDark ? 'text-white' : 'text-gray-900')
                }`}>{addonUsersCount}</p>
                <p className={`text-xs ${
                  isModern ? 'text-purple-300' : isModernDark ? 'text-purple-300' : (isDark ? 'text-gray-400' : 'text-gray-500')
                }`}>{addonUsersCount === 1 ? 'User' : 'Users'}</p>
              </div>
            </div>
            <div className="flex items-center">
              <GroupIcon className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
              <div className="min-w-0">
                <p className={`text-lg font-semibold ${
                  isModern ? 'text-purple-100' : isModernDark ? 'text-purple-100' : (isDark ? 'text-white' : 'text-gray-900')
                }`}>{addonGroupsCount}</p>
                <p className={`text-xs ${
                  isModern ? 'text-purple-300' : isModernDark ? 'text-purple-300' : (isDark ? 'text-gray-400' : 'text-gray-500')
                }`}>{addonGroupsCount === 1 ? 'Group' : 'Groups'}</p>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex gap-2">
        {onView && (
          <button
            onClick={handleView}
            className="flex-1 flex items-center justify-center px-3 py-2 h-8 min-h-8 max-h-8 text-sm rounded transition-colors hover:font-semibold accent-bg accent-text hover:opacity-90"
          >
            <Eye className="w-4 h-4 mr-1" />
            View
          </button>
        )}
        
        {variant === 'user' && onImport && (
          <button
            onClick={handleImport}
            disabled={isImporting}
            className="flex items-center justify-center px-3 py-2 h-8 min-h-8 max-h-8 text-sm rounded transition-colors disabled:opacity-50 accent-bg accent-text hover:opacity-90"
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
            className="flex items-center justify-center px-3 py-2 h-8 min-h-8 max-h-8 text-sm rounded transition-colors disabled:opacity-50 accent-bg accent-text hover:opacity-90"
            title="Reload user addons"
          >
            <RefreshCw className={`w-4 h-4 ${isReloading ? 'animate-spin' : ''}`} />
          </button>
        )}
        
        {variant === 'group' && onClone && (
          <button
            onClick={handleClone}
            className="flex items-center justify-center px-3 py-2 h-8 min-h-8 max-h-8 text-sm rounded transition-colors accent-bg accent-text hover:opacity-90"
            title="Clone this group"
          >
            <Copy className="w-4 h-4" />
          </button>
        )}
        
        {variant === 'group' && onReload && (
          <button
            onClick={handleReload}
            disabled={isReloading}
            className="flex items-center justify-center px-3 py-2 h-8 min-h-8 max-h-8 text-sm rounded transition-colors disabled:opacity-50 accent-bg accent-text hover:opacity-90"
            title="Reload group addons"
          >
            <RefreshCw className={`w-4 h-4 ${isReloading ? 'animate-spin' : ''}`} />
          </button>
        )}
        
        
        {variant === 'addon' && onClone && (
          <button
            onClick={handleClone}
            className="flex items-center justify-center px-3 py-2 h-8 min-h-8 max-h-8 text-sm rounded transition-colors accent-bg accent-text hover:opacity-90"
            title="Clone addon"
          >
            <Copy className="w-4 h-4" />
          </button>
        )}
        
        {variant === 'addon' && onReload && (
          <button
            onClick={handleReload}
            disabled={isReloading}
            className="flex items-center justify-center px-3 py-2 h-8 min-h-8 max-h-8 text-sm rounded transition-colors disabled:opacity-50 accent-bg accent-text hover:opacity-90"
            title="Reload addon"
          >
            <RefreshCw className={`w-4 h-4 ${isReloading ? 'animate-spin' : ''}`} />
          </button>
        )}
        
        <button 
          onClick={handleDelete}
          disabled={false}
          className="flex items-center justify-center px-3 py-2 h-8 min-h-8 max-h-8 text-sm rounded transition-colors disabled:opacity-50 accent-bg accent-text hover:opacity-90"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
        </div>
      )}
    </div>
  )
}