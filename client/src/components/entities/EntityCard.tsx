import React, { useMemo, useState } from 'react'
import { User as UserIcon, Users as GroupIcon, Eye, Edit, Trash2, Copy, Download, RefreshCw, Puzzle, Mail } from 'lucide-react'
import AddonIcon from './AddonIcon'
import { SyncBadge, ToggleSwitch, VersionChip } from '@/components/ui'
import { ConfirmDialog } from '@/components/modals'
import { groupsAPI } from '@/services/api'
import { useTheme } from '@/contexts/ThemeContext'
import { getEntityColorStyles } from '@/utils/colorMapping'
// ToggleSwitch and VersionChip are imported from '@/components/ui' above

const MANIFEST_SUFFIX_REGEX = /\/manifest(\.[^/?#]+)?$/i

const normalizeBaseUrl = (raw?: string | null): string | null => {
  if (typeof raw !== 'string') return null
  let candidate = raw.trim()
  if (!candidate) return null
  candidate = candidate.replace(/\?.*$/, '').replace(/#.*$/, '')
  candidate = candidate.replace(/\/configure\/?$/i, '')
  candidate = candidate.replace(MANIFEST_SUFFIX_REGEX, '')
  try {
    const parsed = new URL(candidate)
    let pathname = parsed.pathname
    if (pathname.endsWith('/') && pathname !== '/') {
      pathname = pathname.slice(0, -1)
    }
    return pathname && pathname !== '/' ? `${parsed.origin}${pathname}` : parsed.origin
  } catch {
    return candidate || null
  }
}

const extractOrigin = (url: string): string | null => {
  try {
    return new URL(url).origin
  } catch {
    const match = url.match(/^https?:\/\/[^/]+/i)
    return match ? match[0] : null
  }
}

const appendConfigure = (baseUrl: string | null): string | null => {
  if (!baseUrl) return null
  return baseUrl.endsWith('/') ? `${baseUrl}configure` : `${baseUrl}/configure`
}

const buildCandidateUrls = (addon: Record<string, any>): string[] => {
  const manifest =
    (addon.originalManifest as Record<string, any> | undefined) ||
    (addon.manifest as Record<string, any> | undefined) ||
    {}

  const baseCandidates = [
    addon.configureUrl,
    addon.configure,
    addon.manifestUrl,
    addon.transportUrl,
    addon.url,
    manifest?.configureUrl,
    manifest?.configure,
    manifest?.configUrl,
    manifest?.manifestUrl,
    manifest?.transportUrl,
  ]

  const seen = new Set<string>()
  const result: string[] = []

  const push = (value: string | null | undefined) => {
    if (!value) return
    const trimmed = value.trim()
    if (!trimmed || !trimmed.startsWith('http')) return
    const normalized = trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
    if (seen.has(normalized)) return
    seen.add(normalized)
    result.push(normalized)
  }

  for (const candidate of baseCandidates) {
    const baseUrl = normalizeBaseUrl(candidate as string | undefined)
    if (!baseUrl) continue
    push(appendConfigure(baseUrl))
    push(baseUrl)
    push(extractOrigin(baseUrl))
  }

  return result
}

type Variant = 'user' | 'group' | 'addon' | 'invitation'

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
  // Invitation specific
  inviteCode?: string
  maxUses?: number
  currentUses?: number
  expiresAt?: string | null
  requests?: Array<any>
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
  // Invitation specific handlers
  onRefreshOAuth?: (entity: BaseEntity) => void
  isRefreshingOAuth?: boolean
  // Custom badge component for invitations
  customBadge?: React.ReactNode
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
  isListMode,
  onRefreshOAuth,
  isRefreshingOAuth,
  customBadge
}: EntityCardProps) {
  const { theme } = useTheme()
  const avatarColorStyles = useMemo(
    () => getEntityColorStyles(theme, entity.colorIndex ?? 0),
    [theme, entity.colorIndex]
  )
  const isAddon = variant === 'addon'
  const addonCandidateUrls = useMemo(
    () => (isAddon ? buildCandidateUrls(entity as Record<string, any>) : []),
    [entity, isAddon],
  )
  const hasAddonLink = isAddon && addonCandidateUrls.length > 0

  const handleCardClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onSelect(entity.id)
  }

  const handleToggle = (e?: React.MouseEvent) => {
    try {
      if (e && typeof e.stopPropagation === 'function') {
        e.stopPropagation()
      }
      onToggle(entity.id, entity.isActive)
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

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingSync, setPendingSync] = useState<string | null>(null)

  const handleSync = async (e?: React.MouseEvent) => {
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation()
    // Group card: confirm when no addons
    if (variant === 'group') {
      const addonsCount = groupAddonsCount
      if (addonsCount === 0) {
        setPendingSync(entity.id)
        setConfirmOpen(true)
        return
      }
      onSync?.(entity.id)
      return
    }
    // User card: confirm when user's group has zero addons
    if (variant === 'user') {
      const gid = (entity as any).groupId
      if (!gid) {
        setPendingSync(entity.id)
        setConfirmOpen(true)
        return
      }
      try {
        const resp = await groupsAPI.getGroupAddons(gid)
        const count = Array.isArray(resp?.addons) ? resp.addons.length : 0
        if (count === 0) {
          setPendingSync(entity.id)
          setConfirmOpen(true)
          return
        }
      } catch {}
      onSync?.(entity.id)
      return
    }
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

  const handleOpenConfigure = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!addonCandidateUrls.length) return

    const openUrl = (url: string) => {
      if (!url || typeof window === 'undefined') return false
      window.open(url, '_blank', 'noopener,noreferrer')
      return true
    }

    for (const candidate of addonCandidateUrls) {
      try {
        const response = await fetch(candidate, {
          method: 'GET',
          mode: 'cors',
          cache: 'no-cache',
        })
        if (response.ok && response.status < 400) {
          openUrl(candidate)
          return
        }
      } catch {
        // continue to next candidate
      }
    }

    // As a final fallback, just open the first candidate even if the GET failed (covers cases where CORS blocks the probe)
    openUrl(addonCandidateUrls[0])
  }

  // Get display name and subtitle
  const displayName = variant === 'user' 
    ? (entity.username || entity.email || 'Unknown User')
    : variant === 'invitation'
    ? (entity.inviteCode || entity.name || 'Invitation')
    : entity.name

  const subtitle = variant === 'user' 
    ? '' // Never show group name in subtitle for users
    : variant === 'group'
    ? '' // Never show description for groups
    : variant === 'addon'
    ? '' // Never show description for addons
    : variant === 'invitation'
    ? '' // Never show description for invitations
    : ''

  // Get avatar text
  const getAvatarText = () => {
    if (variant === 'user') {
      return (entity.username || entity.email || 'U').charAt(0).toUpperCase()
    } else if (variant === 'group') {
      return entity.name ? entity.name.charAt(0).toUpperCase() : 'G'
    } else if (variant === 'invitation') {
      return entity.inviteCode ? entity.inviteCode.charAt(0).toUpperCase() : 'I'
    } else {
      return entity.name ? entity.name.charAt(0).toUpperCase() : 'A'
    }
  }

  const renderAvatar = () => {
    if (variant === 'addon') {
      return (
        <AddonIcon
          name={entity.name}
          iconUrl={(entity as any).iconUrl}
          size="12"
        />
      )
    }

    return (
      <div
        className="logo-circle-12 flex items-center justify-center"
        style={{
          background: avatarColorStyles.background,
          color: avatarColorStyles.textColor,
        }}
      >
        <span
          className="font-semibold text-lg"
          style={{ color: avatarColorStyles.textColor }}
        >
          {getAvatarText()}
        </span>
      </div>
    )
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
    <>
    <div 
      onClick={handleCardClick}
      className={isListMode ? 
        `card card-selectable p-4 hover:shadow-lg transition-all flex items-center justify-between relative group ${(!entity.isActive || (variant === 'invitation' && ((entity.maxUses != null && entity.currentUses != null && entity.currentUses >= entity.maxUses) || (entity.expiresAt && new Date(entity.expiresAt) < new Date())))) ? 'opacity-50' : ''} cursor-pointer min-w-[320px] ${
          isSelected 
            ? 'card-selected' 
            : ''
        }` :
        `card card-selectable p-6 hover:shadow-lg transition-all flex flex-col h-full relative group min-w-[320px] ${(!entity.isActive || (variant === 'invitation' && ((entity.maxUses != null && entity.currentUses != null && entity.currentUses >= entity.maxUses) || (entity.expiresAt && new Date(entity.expiresAt) < new Date())))) ? 'opacity-50' : ''} cursor-pointer ${
          isSelected 
            ? 'card-selected' 
            : ''
        }`
      }
    >
      {isListMode ? (
        // List mode layout
        <div className="w-full flex flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <div className="flex-shrink-0">
            {renderAvatar()}
            </div>
            
            <div className="flex-1 min-w-0 overflow-hidden">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h3 className="font-medium truncate">
                  {hasAddonLink ? (
                    <button
                      type="button"
                      onClick={handleOpenConfigure}
                      className="truncate text-left color-hover cursor-pointer hover:underline underline-offset-2 focus:outline-none bg-transparent border-0 p-0"
                      title="Open configure page"
                    >
                  {displayName}
                    </button>
                  ) : (
                    <span className="truncate color-hover">{displayName}</span>
                  )}
                </h3>
                {variant === 'addon' && (entity as any).version && (
                  <VersionChip version={(entity as any).version} size="sm" />
                )}
                {/* Sync Badge next to name for users and groups */}
                {variant === 'user' && userExcludedSet && userProtectedSet && onSync && (
                  <SyncBadge
                    userId={entity.id}
                    groupId={(entity as any).groupId}
                    onSync={() => handleSync()}
                    isSyncing={isSyncing || false}
                    userExcludedSet={userExcludedSet}
                    userProtectedSet={userProtectedSet}
                    isListMode={true}
                  />
                )}
                {variant === 'group' && onSync && (
                  <SyncBadge
                    groupId={entity.id}
                    onSync={() => handleSync()}
                    isSyncing={isSyncing || false}
                    isListMode={true}
                  />
                )}
                {variant === 'invitation' && customBadge && customBadge}
              </div>
              <p className={`text-sm color-text-secondary truncate` }>
                {subtitle}
              </p>

              {/* Stats under name on < md screens */}
              <div className="mt-2 flex items-center gap-3 md:hidden">
                {variant === 'addon' && (
                  <div className="flex items-center gap-1 text-xs color-text-secondary">
                    <UserIcon className="w-4 h-4" />
                    <span>{addonUsersCount}</span>
                  </div>
                )}
                {variant === 'addon' && (
                  <div className="flex items-center gap-1 text-xs color-text-secondary">
                    <GroupIcon className="w-4 h-4" />
                    <span>{addonGroupsCount}</span>
                  </div>
                )}
                {variant === 'user' && (
                  <div className="flex items-center gap-1 text-xs color-text-secondary">
                    <Puzzle className="w-4 h-4" />
                    <span>{(entity as any).stremioAddonsCount || 0}</span>
                  </div>
                )}
                {variant === 'user' && (
                  <div className="flex items-center gap-1 text-xs color-text-secondary">
                    <GroupIcon className="w-4 h-4" />
                    <span>{(entity as any).groupName || ((entity as any).groups && (entity as any).groups.length > 0) ? ((entity as any).groupName || (entity as any).groups[0].name) : 'No Group'}</span>
                  </div>
                )}
                {variant === 'group' && (
                  <div className="flex items-center gap-1 text-xs color-text-secondary">
                    <Puzzle className="w-4 h-4" />
                    <span>{groupAddonsCount}</span>
                  </div>
                )}
                {variant === 'group' && (
                  <div className="flex items-center gap-1 text-xs color-text-secondary">
                    <UserIcon className="w-4 h-4" />
                    <span>{groupUsersCount}</span>
                  </div>
                )}
                {variant === 'invitation' && (
                  <div className="flex items-center gap-1 text-xs color-text-secondary">
                    <Mail className="w-4 h-4" />
                    <span>{entity.currentUses || 0} / {entity.maxUses || 0}</span>
                  </div>
                )}
                {variant === 'invitation' && (
                  <div className="flex items-center gap-1 text-xs color-text-secondary">
                    <GroupIcon className="w-4 h-4" />
                    <span>{entity.groupName || 'No group'}</span>
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
                <div className="flex items-center gap-1 text-xs color-text-secondary">
                  <UserIcon className="w-4 h-4" />
                  <span>{addonUsersCount}</span>
                </div>
              )}
              {variant === 'addon' && (
                <div className="flex items-center gap-1 text-xs color-text-secondary">
                  <GroupIcon className="w-4 h-4" />
                  <span>{addonGroupsCount}</span>
                </div>
              )}
              {variant === 'user' && (
                <div className="flex items-center gap-1 text-xs color-text-secondary">
                  <Puzzle className="w-4 h-4" />
                  <span>{(entity as any).stremioAddonsCount || 0}</span>
                </div>
              )}
              {variant === 'user' && (
                <div className="flex items-center gap-1 text-xs color-text-secondary">
                  <GroupIcon className="w-4 h-4" />
                  <span>{(entity as any).groupName || ((entity as any).groups && (entity as any).groups.length > 0) ? ((entity as any).groupName || (entity as any).groups[0].name) : 'No Group'}</span>
                </div>
              )}
              {variant === 'group' && (
                <div className="flex items-center gap-1 text-xs color-text-secondary">
                  <Puzzle className="w-4 h-4" />
                  <span>{groupAddonsCount}</span>
                </div>
              )}
              {variant === 'group' && (
                <div className="flex items-center gap-1 text-xs color-text-secondary">
                  <UserIcon className="w-4 h-4" />
                  <span>{groupUsersCount}</span>
                </div>
              )}
              {variant === 'invitation' && (
                <div className="flex items-center gap-1 text-xs color-text-secondary">
                  <Mail className="w-4 h-4" />
                  <span>{entity.currentUses || 0} / {entity.maxUses || 0}</span>
                </div>
              )}
              {variant === 'invitation' && (
                <div className="flex items-center gap-1 text-xs color-text-secondary">
                  <GroupIcon className="w-4 h-4" />
                  <span>{entity.groupName || 'No group'}</span>
                </div>
              )}
            </div>
            
            {/* Toggle is always visible; does not wrap into the button grid */}
            {!(variant === 'invitation' && ((entity.maxUses != null && entity.currentUses != null && entity.currentUses >= entity.maxUses) || (entity.expiresAt && new Date(entity.expiresAt) < new Date()))) && (
              <ToggleSwitch
                checked={entity.isActive}
                onChange={() => handleToggle({} as React.MouseEvent)}
                size="sm"
                title={entity.isActive ? 'Click to disable' : 'Click to enable'}
              />
            )}
            
            {/* Actions: inline until < sm, stack 2x2 only on extra-small */}
            <div className="grid grid-cols-2 gap-1 xs:grid-cols-2 sm:flex sm:items-center sm:gap-1 flex-shrink-0 [@media(min-width:640px)]:grid-cols-1">
              {onView && (
                <button
                  onClick={handleView}
                  className={`p-2 rounded surface-interactive color-text`}
                  title="View details"
                >
                  <Eye className="w-4 h-4" />
                </button>
              )}
              
              {onEdit && (
                <button
                  onClick={handleEdit}
                  className={`p-2 rounded surface-interactive color-text`}
                  title="Edit"
                >
                  <Edit className="w-4 h-4" />
                </button>
              )}
              
              {variant === 'group' && onClone && (
                <button
                  onClick={handleClone}
                  className={`p-2 rounded surface-interactive color-text`}
                  title="Clone"
                >
                  <Copy className="w-4 h-4" />
                </button>
              )}
              
                {variant === 'group' && onReload && (
                  <button
                    onClick={handleReload}
                    disabled={isReloading}
                    className={`p-2 rounded surface-interactive color-text ${isReloading ? 'opacity-50' : ''}`}
                    title="Reload group addons"
                  >
                    <RefreshCw className={`w-4 h-4 ${isReloading ? 'animate-spin' : ''}`} />
                  </button>
                )}
              
              {variant === 'user' && onImport && (
                <button
                  onClick={handleImport}
                  disabled={isImporting}
                  className={`p-2 rounded surface-interactive color-text ${isImporting ? 'opacity-50' : ''}`}
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
                  className={`p-2 rounded surface-interactive color-text ${isReloading ? 'opacity-50' : ''}`}
                  title="Reload user addons"
                >
                  <RefreshCw className={`w-4 h-4 ${isReloading ? 'animate-spin' : ''}`} />
                </button>
              )}
              
              {variant === 'addon' && onClone && (
                <button
                  onClick={handleClone}
                  className={`p-2 rounded surface-interactive color-text`}
                  title="Clone addon"
                >
                  <Copy className="w-4 h-4" />
                </button>
              )}
              
              {variant === 'addon' && onReload && (
                <button
                  onClick={handleReload}
                  disabled={isReloading}
                  className={`p-2 rounded surface-interactive color-text ${isReloading ? 'opacity-50' : ''}`}
                  title="Reload"
                >
                  <RefreshCw className={`w-4 h-4 ${isReloading ? 'animate-spin' : ''}`} />
                </button>
              )}
              
              {variant === 'invitation' && onRefreshOAuth && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onRefreshOAuth(entity)
                  }}
                  disabled={isRefreshingOAuth || !(entity.requests && entity.requests.filter((req: any) => req.status === 'accepted' && req.oauthCode && req.oauthLink).length > 0)}
                  className={`p-2 rounded surface-interactive color-text ${isRefreshingOAuth ? 'opacity-50' : ''}`}
                  title="Clear OAuth links (users can generate new ones)"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshingOAuth ? 'animate-spin' : ''}`} />
                </button>
              )}
              
              <button
                onClick={handleDelete}
                className={`p-2 rounded surface-interactive color-text`}
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
          <div className="flex-shrink-0">
            {renderAvatar()}
          </div>
          <div className="min-w-0 flex-1">
            <h3
              className={`font-medium transition-colors truncate ${!hasAddonLink ? 'cursor-pointer color-hover' : ''}`}
              title={displayName}
            >
              {hasAddonLink ? (
                <button
                  type="button"
                  onClick={handleOpenConfigure}
                  className="truncate text-left color-hover cursor-pointer hover:underline underline-offset-2 focus:outline-none bg-transparent border-0 p-0"
                  title={displayName}
                >
              {displayName}
                </button>
              ) : (
                <span className="truncate">{displayName}</span>
              )}
            </h3>
            {/* Inline Sync Badge for groups next to name */}
            {variant === 'group' && onSync && (
              <div className="mt-1 mb-0">
                <SyncBadge
                  groupId={entity.id}
                  onSync={() => handleSync()}
                  isSyncing={isSyncing || false}
                />
              </div>
            )}
            <p className={`text-sm color-text-secondary`}>
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
                  onSync={() => handleSync()}
                  isSyncing={isSyncing || false}
                  userExcludedSet={userExcludedSet}
                  userProtectedSet={userProtectedSet}
                />
              </div>
            )}
            {/* Custom Badge for invitations */}
            {variant === 'invitation' && customBadge && (
              <div className="mt-1 mb-0">
                {customBadge}
              </div>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
          {!(variant === 'invitation' && ((entity.maxUses != null && entity.currentUses != null && entity.currentUses >= entity.maxUses) || (entity.expiresAt && new Date(entity.expiresAt) < new Date()))) && (
            <ToggleSwitch
              checked={!!entity.isActive}
              onChange={() => handleToggle({} as React.MouseEvent)}
              size="md"
              title={entity.isActive ? 'Click to disable' : 'Click to enable'}
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4 items-start">
        {variant === 'group' && (
          <>
            <div className="flex items-center">
              <Puzzle className="w-4 h-4 color-text-secondary mr-2 flex-shrink-0" />
              <div className="min-w-0">
                <p className={`text-lg font-semibold`}>
                  {(entity as any).addons || 0}
                </p>
                <p className={`text-xs color-text-secondary`}>{(entity as any).addons === 1 ? 'Addon' : 'Addons'}</p>
              </div>
            </div>
            <div className="flex items-center">
              <UserIcon className="w-4 h-4 color-text-secondary mr-2 flex-shrink-0" />
              <div className="min-w-0">
                <p className={`text-lg font-semibold`}>
                  {groupUsersCount}
                </p>
                <p className={`text-xs color-text-secondary`}>{groupUsersCount === 1 ? 'User' : 'Users'}</p>
              </div>
            </div>
          </>
        )}
        {variant === 'user' && (
          <>
            <div className="flex items-center">
              <Puzzle className="w-4 h-4 color-text-secondary mr-2 flex-shrink-0" />
              <div className="min-w-0">
                <p className={`text-lg font-semibold`}>
                  {(entity as any).stremioAddonsCount || 0}
                </p>
                <p className={`text-xs color-text-secondary`}>{(entity as any).stremioAddonsCount === 1 ? 'Addon' : 'Addons'}</p>
              </div>
            </div>
            <div className="flex items-center min-w-0">
              <GroupIcon className="w-4 h-4 color-text-secondary mr-2 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className={`text-lg font-semibold truncate`}>
                  {(entity as any).groupName || 'No group'}
                </p>
                <p className={`text-xs color-text-secondary`}>Group</p>
              </div>
            </div>
          </>
        )}
        {variant === 'addon' && (
          <>
            <div className="flex items-center">
              <UserIcon className="w-4 h-4 color-text-secondary mr-2 flex-shrink-0" />
              <div className="min-w-0">
                <p className={`text-lg font-semibold`}>{addonUsersCount}</p>
                <p className={`text-xs color-text-secondary`}>{addonUsersCount === 1 ? 'User' : 'Users'}</p>
              </div>
            </div>
            <div className="flex items-center">
              <GroupIcon className="w-4 h-4 color-text-secondary mr-2 flex-shrink-0" />
              <div className="min-w-0">
                <p className={`text-lg font-semibold`}>{addonGroupsCount}</p>
                <p className={`text-xs color-text-secondary`}>{addonGroupsCount === 1 ? 'Group' : 'Groups'}</p>
              </div>
            </div>
          </>
        )}
        {variant === 'invitation' && (
          <>
            <div className="flex items-center">
              <Mail className="w-4 h-4 color-text-secondary mr-2 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-lg font-semibold">
                  {entity.currentUses || 0} / {entity.maxUses || 0}
                </p>
                <p className="text-xs color-text-secondary">Uses</p>
              </div>
            </div>
            <div className="flex items-center min-w-0">
              <GroupIcon className="w-4 h-4 color-text-secondary mr-2 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold truncate">
                  {entity.groupName || 'No group'}
                </p>
                <p className="text-xs color-text-secondary">Group</p>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex gap-2 mt-auto">
        {onView && (
          <button
            onClick={handleView}
            className="flex-1 flex items-center justify-center px-3 py-2 h-8 min-h-8 max-h-8 text-sm rounded font-medium color-text color-hover"
          >
            <Eye className="w-4 h-4 mr-1" />
            View
          </button>
        )}
        
        {variant === 'user' && onImport && (
          <button
            onClick={handleImport}
            disabled={isImporting}
            className="flex items-center justify-center px-3 py-2 h-8 min-h-8 max-h-8 text-sm rounded disabled:opacity-50 color-text color-hover"
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
            className="flex items-center justify-center px-3 py-2 h-8 min-h-8 max-h-8 text-sm rounded disabled:opacity-50 color-text color-hover"
            title="Reload user addons"
          >
            <RefreshCw className={`w-4 h-4 ${isReloading ? 'animate-spin' : ''}`} />
          </button>
        )}
        
        {variant === 'group' && onClone && (
          <button
            onClick={handleClone}
            className="flex items-center justify-center px-3 py-2 h-8 min-h-8 max-h-8 text-sm rounded color-text color-hover"
            title="Clone this group"
          >
            <Copy className="w-4 h-4" />
          </button>
        )}
        
        {variant === 'group' && onReload && (
          <button
            onClick={handleReload}
            disabled={isReloading}
            className="flex items-center justify-center px-3 py-2 h-8 min-h-8 max-h-8 text-sm rounded disabled:opacity-50 color-text color-hover"
            title="Reload group addons"
          >
            <RefreshCw className={`w-4 h-4 ${isReloading ? 'animate-spin' : ''}`} />
          </button>
        )}
        
        
        {variant === 'addon' && onClone && (
          <button
            onClick={handleClone}
            className="flex items-center justify-center px-3 py-2 h-8 min-h-8 max-h-8 text-sm rounded color-text color-hover"
            title="Clone addon"
          >
            <Copy className="w-4 h-4" />
          </button>
        )}
        
        {variant === 'addon' && onReload && (
          <button
            onClick={handleReload}
            disabled={isReloading}
            className="flex items-center justify-center px-3 py-2 h-8 min-h-8 max-h-8 text-sm rounded disabled:opacity-50 color-text color-hover"
            title="Reload addon"
          >
            <RefreshCw className={`w-4 h-4 ${isReloading ? 'animate-spin' : ''}`} />
          </button>
        )}
        
        {variant === 'invitation' && onRefreshOAuth && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRefreshOAuth(entity)
            }}
            disabled={isRefreshingOAuth || !(entity.requests && entity.requests.filter((req: any) => req.status === 'accepted' && req.oauthCode && req.oauthLink).length > 0)}
            className="flex items-center justify-center px-3 py-2 h-8 min-h-8 max-h-8 text-sm rounded color-text color-hover disabled:opacity-50 disabled:cursor-not-allowed"
            title="Clear OAuth links (users can generate new ones)"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshingOAuth ? 'animate-spin' : ''}`} />
          </button>
        )}
        
        <button 
          onClick={handleDelete}
          disabled={false}
          className="flex items-center justify-center px-3 py-2 h-8 min-h-8 max-h-8 text-sm rounded disabled:opacity-50 color-text color-hover"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
        </div>
      )}
    </div>
    <ConfirmDialog
      open={confirmOpen}
      title={variant === 'group' ? "Sync will remove all users' addons" : "Sync will remove all this user's addons"}
      description={variant === 'group' ? "This group has no addons. Syncing will delete all Stremio addons from its users. Continue?" : "This user belongs to a group with no addons. Syncing will delete all addons from this user's Stremio account. Continue?"}
      confirmText="Delete all and Sync"
      cancelText="Cancel"
      isDanger={true}
      onCancel={() => { setConfirmOpen(false); setPendingSync(null) }}
      onConfirm={() => { if (pendingSync) onSync?.(pendingSync); setConfirmOpen(false); setPendingSync(null) }}
    />
    </>
  )
}