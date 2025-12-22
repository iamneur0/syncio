'use client'

import React from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { User as UserIcon, Link2, Unlink, Puzzle as AddonsIcon, Users as GroupsIcon, Mail as InvitesIcon, Settings, Home, LogOut } from 'lucide-react'
import api, { publicAuthAPI, addonsAPI, usersAPI, groupsAPI, invitationsAPI } from '@/services/api'
import toast from 'react-hot-toast'
import { StremioOAuthCard } from '@/components/auth/StremioOAuthCard'
import UserAvatar from '@/components/ui/UserAvatar'

type Props = {
  className?: string
}

export default function AccountMenuButton({ className = '' }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const AUTH_ENABLED = process.env.NEXT_PUBLIC_AUTH_ENABLED === 'true'
  const isUserPage = pathname?.startsWith('/user/') || pathname === '/user'
  const [isPrivateAuth, setIsPrivateAuth] = React.useState(false)
  type AuthState = 'unknown' | 'authed' | 'guest'
  const initialState: AuthState = (() => {
    if (!AUTH_ENABLED) return 'authed'
    if (typeof window !== 'undefined' && (window as any).__SYNCIO_AUTHED !== undefined) {
      return (window as any).__SYNCIO_AUTHED ? 'authed' : 'guest'
    }
    return 'unknown'
  })()
  const [authState, setAuthState] = React.useState<AuthState>(initialState)
  const [showMenu, setShowMenu] = React.useState(false)
  const wrapperRef = React.useRef<HTMLDivElement | null>(null)
  const [accountUuid, setAccountUuid] = React.useState<string | null>(null)
  const [accountEmail, setAccountEmail] = React.useState<string | null>(null)
  const [showStremioLink, setShowStremioLink] = React.useState(false)
  const [isLinkingStremio, setIsLinkingStremio] = React.useState(false)
  const [isUnlinkingStremio, setIsUnlinkingStremio] = React.useState(false)
  const [stats, setStats] = React.useState<{ users?: number; groups?: number; addons?: number; invites?: number } | null>(null)
  const [statsLoading, setStatsLoading] = React.useState(false)
  const [userInfo, setUserInfo] = React.useState<any>(null)
  const [hasPrivateAuthCredentials, setHasPrivateAuthCredentials] = React.useState<boolean | null>(null)

  React.useEffect(() => {
    const onAuthChanged = async (e: any) => {
      const next = !!e?.detail?.authed
      const nextState: AuthState = next ? 'authed' : 'guest'
      setAuthState(nextState)
      if (typeof window !== 'undefined') (window as any).__SYNCIO_AUTHED = next
      if (next) {
        try {
          const info = await publicAuthAPI.me()
          const acct = info?.account
          setAccountUuid(acct?.uuid || null)
          setAccountEmail(acct?.email || null)
        } catch {}
      } else {
        setAccountUuid(null)
        setAccountEmail(null)
      }
    }
    if (AUTH_ENABLED && authState === 'unknown') setAuthState('unknown')
    // On mount, restore session directly from /me so the button shows after refresh
    ;(async () => {
      try {
        if (!AUTH_ENABLED) {
          // Private instance - check if auth is required
          setIsPrivateAuth(true)
          try {
            const me = await publicAuthAPI.me()
            // If /me returns "Auth disabled" → Private with no auth
            // Otherwise → Private with auth (credentials configured)
            const hasAuth = me?.message !== 'Auth disabled'
            setHasPrivateAuthCredentials(hasAuth)
            setAuthState('authed')
            if (typeof window !== 'undefined') (window as any).__SYNCIO_AUTHED = true
          } catch (err: any) {
            // 401 means Private with auth (not logged in)
            // Other errors fallback to no auth
            const hasAuth = err?.response?.status === 401
            setHasPrivateAuthCredentials(hasAuth)
            setAuthState(hasAuth ? 'guest' : 'authed')
            setIsPrivateAuth(hasAuth)
            if (typeof window !== 'undefined') (window as any).__SYNCIO_AUTHED = !hasAuth
          }
        } else {
        const me = await publicAuthAPI.me()
        const ok = !!me?.account
        const nextState: AuthState = ok ? 'authed' : 'guest'
        setAuthState(nextState)
        if (typeof window !== 'undefined') (window as any).__SYNCIO_AUTHED = ok
        }
      } catch {
        if (!AUTH_ENABLED) {
          setAuthState('authed')
          setIsPrivateAuth(false)
          setHasPrivateAuthCredentials(false)
          if (typeof window !== 'undefined') (window as any).__SYNCIO_AUTHED = true
        } else {
        setAuthState('guest')
        if (typeof window !== 'undefined') (window as any).__SYNCIO_AUTHED = false
        }
      }
    })()
    window.addEventListener('sfm:auth:changed', onAuthChanged as any)
    return () => window.removeEventListener('sfm:auth:changed', onAuthChanged as any)
  }, [])

  React.useEffect(() => {
    if (!AUTH_ENABLED || authState !== 'authed') return
    ;(async () => {
      try {
        const info = await publicAuthAPI.me()
        const acct = info?.account
        setAccountUuid(acct?.uuid || null)
        setAccountEmail(acct?.email || null)
      } catch {}
    })()
  }, [authState])

  const refreshAccountInfo = React.useCallback(async () => {
    if (!AUTH_ENABLED) return
    try {
      const info = await publicAuthAPI.me()
      const acct = info?.account
      setAccountUuid(acct?.uuid || null)
      setAccountEmail(acct?.email || null)
    } catch {
      setAccountUuid(null)
      setAccountEmail(null)
    }
  }, [AUTH_ENABLED])

  React.useEffect(() => {
    if (!AUTH_ENABLED) return
    if (authState !== 'authed') return
    refreshAccountInfo()
  }, [AUTH_ENABLED, authState, refreshAccountInfo])

  React.useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!showMenu) return
      if (AUTH_ENABLED && authState !== 'authed') return
      setStatsLoading(true)
      try {
        const [users, groups, addons, invites, accountInfo] = await Promise.all([
          usersAPI.getAll().catch(() => []),
          groupsAPI.getAll().catch(() => []),
          addonsAPI.getAll().catch(() => []),
          invitationsAPI.getAll().catch(() => []),
          AUTH_ENABLED ? publicAuthAPI.me().catch(() => null) : api.get('/settings/account-info').catch(() => null),
        ])
        if (!cancelled) {
          // Filter to only count enabled items
          const enabledUsers = (users || []).filter((u: any) => u.isActive === true)
          const enabledGroups = (groups || []).filter((g: any) => g.isActive === true)
          const enabledAddons = (addons || []).filter((a: any) => a.isActive !== false && a.status !== 'inactive')
          
          // Filter active invites: isActive && not expired && not full
          const now = new Date()
          const activeInvites = (invites || []).filter((inv: any) => {
            if (!inv || !inv.isActive) return false
            const isExpired = inv.expiresAt && new Date(inv.expiresAt) < now
            const isFull = inv.maxUses != null && inv.currentUses >= inv.maxUses
            return !isExpired && !isFull
          })
          
          setStats({ 
            users: enabledUsers.length, 
            groups: enabledGroups.length, 
            addons: enabledAddons.length,
            invites: activeInvites.length
          })
          if (AUTH_ENABLED && accountInfo?.account) {
            const acct = accountInfo.account
            setAccountUuid(acct?.uuid || null)
            setAccountEmail(acct?.email || null)
          }
        }
      } catch (error) {
        // Silently fail
      } finally {
        if (!cancelled) setStatsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [showMenu, authState, AUTH_ENABLED])

  // Close menu on click outside
  React.useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!showMenu) return
      const el = wrapperRef.current
      if (el && !el.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [showMenu])

  // Close on Escape
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowMenu(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const handleLogout = async () => {
    setShowMenu(false)
    
    // Helper function to logout from Stremio by clearing localStorage
    // StremioAPIStore uses localStorage to persist user and addon data
    const logoutFromStremio = () => {
      if (typeof window === 'undefined') return
      
      // Clear StremioAPIStore localStorage keys
      // Based on stremio-api-client implementation, it stores data with these keys:
      localStorage.removeItem('stremio_user')
      localStorage.removeItem('stremio_addons')
      localStorage.removeItem('stremio_auth_key')
      
      // Also clear any other Stremio-related keys
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && (key.startsWith('stremio_') || key.includes('stremio'))) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key))
    }

    if (isUserPage) {
      // User mode: Use StremioAPIStore.logout()
      await logoutFromStremio()
      
      // Clear user-specific localStorage items
      if (typeof window !== 'undefined') {
        localStorage.removeItem('public-library-user')
        localStorage.removeItem('stremio_auth_key')
        localStorage.removeItem('syncio_user_info')
        localStorage.removeItem('user-activity-view-type')
        localStorage.removeItem('user-activity-view-mode')
        localStorage.removeItem('user-addons-view-mode')
      }
      
      toast.success('Logged out successfully')
      // Redirect to user login page
      window.location.href = '/login?mode=user'
      return
    }
    
    // Admin mode: Check if logged in with Stremio or UUID/password
    const hasStremioAuth = accountEmail !== null
    
    if (hasStremioAuth) {
      // Admin logged in with Stremio: Use StremioAPIStore.logout()
      await logoutFromStremio()
    }
    
    // Admin UUID/password logout: cookie-based logout handled server-side
    try { 
      await publicAuthAPI.logout()
    } catch {}
    try { delete (api as any).defaults.headers.Authorization } catch {}
    setAuthState('guest')
    if (typeof window !== 'undefined') (window as any).__SYNCIO_AUTHED = false
    setAccountUuid(null)
    setAccountEmail(null)
    // Dispatch event after logout completes
    try { window.dispatchEvent(new CustomEvent('sfm:auth:changed', { detail: { authed: false } })) } catch {}
    
    // Redirect to admin login page
    window.location.href = '/login?mode=admin'
  }

  const handleCopyUuid = async () => {
    if (!accountUuid) return
    try {
      await navigator.clipboard.writeText(accountUuid)
      toast.success('UUID copied to clipboard')
    } catch (err) {
      console.error('Failed to copy UUID:', err)
      toast.error('Failed to copy UUID')
    }
  }

  const handleStremioAuthKey = async (authKey: string) => {
    setIsLinkingStremio(true)
    try {
      await publicAuthAPI.loginWithStremio({ authKey })
      toast.success('Stremio account linked successfully!')
      setShowStremioLink(false)
      await refreshAccountInfo()
      // Refresh the page to update the UI
      window.location.reload()
    } catch (err: any) {
      const errorCode = err?.response?.data?.error
      const msg = err?.response?.data?.message || err?.message || 'Failed to link Stremio account'
      
      const errorMessages: Record<string, string> = {
        EMAIL_ALREADY_LINKED: 'This Stremio account is already linked to another Syncio account. Please use a different Stremio account or log in with the account that owns this Stremio email.',
        ACCOUNT_ALREADY_LINKED: 'Your account is already linked to a different Stremio account.',
        STORED_AUTHKEY_EMAIL_MISMATCH: 'A user with this email already exists in your account, but their Stremio authentication does not match. Please contact support.',
        NO_USER_WITH_EMAIL: 'No user found with this email address. Please create a user with this email first before linking your Stremio account.',
        USER_NO_STREMIO_AUTH: 'User exists but has no Stremio authentication. Please connect the user to Stremio first before linking the account.',
        INVALID_STORED_AUTHKEY: 'User exists but the stored Stremio authentication is invalid or expired. Please reconnect the user to Stremio first.'
      }
      
      if (errorCode && errorMessages[errorCode]) {
        toast.error(errorMessages[errorCode])
        setShowStremioLink(false)
      } else {
        toast.error(msg)
      }
    } finally {
      setIsLinkingStremio(false)
    }
  }

  const handleUnlinkStremio = async () => {
    setIsUnlinkingStremio(true)
    try {
      await publicAuthAPI.unlinkStremio()
      toast.success('Stremio account unlinked successfully')
      await refreshAccountInfo()
      // Refresh the page to update the UI
      window.location.reload()
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to unlink Stremio account'
      toast.error(msg)
    } finally {
      setIsUnlinkingStremio(false)
    }
  }

  // Load user info for user pages
  React.useEffect(() => {
    if (isUserPage && typeof window !== 'undefined') {
      const stored = localStorage.getItem('public-library-user')
      if (stored) {
        try {
          const data = JSON.parse(stored)
          setUserInfo(data.userInfo || null)
        } catch {}
      }
    }
  }, [isUserPage])

  // For admin/private-auth pages we hide the button when not authenticated,
  // but on user pages we always show it so users can access their own menu/logout.
  if (!isUserPage && (AUTH_ENABLED || isPrivateAuth) && authState === 'guest') return null

  const btnClasses = `h-10 px-2 rounded-lg flex items-center justify-center focus:outline-none focus:ring-0 color-surface color-hover ${className}`

  const menuClasses = `absolute right-0 mt-2 w-64 rounded-xl shadow-xl p-3 text-sm border z-[400] card`

  return (
    <div className="relative z-[10]" ref={wrapperRef}>
      <button className={btnClasses} onClick={() => setShowMenu((s) => !s)} title="Account">
        <UserIcon size={18} />
      </button>
      {showMenu && (
        <div className={menuClasses}>
          {/* Top bar with User/Admin Panel button (left) and Logout button (right) */}
          <div className="flex justify-between items-center mb-3">
            {/* User Panel / Admin Panel button - top left, icon only */}
            {isUserPage ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowMenu(false)
                  // Check if admin is logged in
                  if (authState === 'authed') {
                    router.push('/users')
                  } else {
                    // Not logged in as admin, go to login page with forced admin mode
                    router.push('/login?mode=admin')
                  }
                }}
                className="p-2 rounded color-surface color-hover color-text"
                title="Admin Panel"
              >
                <Settings className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowMenu(false)
                  // Check if user is logged in
                  if (typeof window !== 'undefined') {
                    const stored = localStorage.getItem('public-library-user')
                    if (stored) {
                      try {
                        const data = JSON.parse(stored)
                        if (data.userId && data.authKey) {
                          // User is logged in, go to user home
                          router.push('/user/home')
                          return
                        }
                      } catch (e) {
                        // Invalid stored data
                      }
                    }
                  }
                  // Not logged in as user, go to login page with forced user mode
                  router.push('/login?mode=user')
                }}
                className="p-2 rounded color-surface color-hover color-text"
                title="User Panel"
              >
                <Home className="w-4 h-4" />
              </button>
            )}
            
            {/* Logout button - top right corner, icon only */}
            {/* Hide logout in private mode without credentials (no login = no logout) */}
            {!(isPrivateAuth && hasPrivateAuthCredentials === false) && (
              <button
                onClick={handleLogout}
                className="p-2 rounded color-surface color-hover color-text"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
          
          {/* User mode: Show user name and avatar */}
          {isUserPage && userInfo && (
            <div className="mb-2 px-3 py-2 rounded border color-border flex items-center gap-2">
              <UserAvatar
                email={userInfo.email}
                username={userInfo.username}
                colorIndex={userInfo.colorIndex || 0}
                size="sm"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium color-text truncate">
                  {userInfo.username || userInfo.email || 'User'}
                </div>
                {userInfo.email && userInfo.username && (
                  <div className="text-xs color-text-secondary truncate">
                    {userInfo.email}
                  </div>
                )}
              </div>
            </div>
          )}
          {/* Admin-only: UUID, Email, and Stremio linking - HIDDEN in user mode */}
          {!isUserPage && AUTH_ENABLED && (accountUuid || accountEmail) && (
            <div 
              className={`mb-2 px-3 py-2 rounded border color-border cursor-pointer`} 
              onClick={handleCopyUuid} 
              title="Click to copy UUID"
            >
              {accountEmail && (
                <div className="mb-1">
                  <div className="text-xs color-text-secondary text-center mb-1">Email</div>
                  <div className="flex items-center justify-center gap-2">
                    <div className="text-xs color-text text-center break-all flex-1">{accountEmail}</div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleUnlinkStremio()
                      }}
                      disabled={isUnlinkingStremio}
                      className="p-1 rounded color-hover flex-shrink-0"
                      title="Unlink Stremio account"
                    >
                      <Unlink className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
              <div className={`text-center mb-1`}>
                <span className={`text-xs color-text-secondary`}>UUID</span>
              </div>
              <code className={`text-xs color-text break-all block text-center`}>
                {accountUuid || '—'}
              </code>
            </div>
          )}
          {!isUserPage && (
            <div className={`mb-1 rounded overflow-hidden border color-border`}>
              {[
                ['Users', stats?.users, <UserIcon key="u" className="w-4 h-4" />],
                ['Groups', stats?.groups, <GroupsIcon key="g" className="w-4 h-4" />],
                ['Addons', stats?.addons, <AddonsIcon key="a" className="w-4 h-4" />],
                ['Invites', stats?.invites, <InvitesIcon key="i" className="w-4 h-4" />],
              ].map(([label, value, IconEl], idx) => (
                <div key={label as string} className={`flex items-center justify-between px-3 py-2 ${idx>0 ? 'border-t color-border' : ''}`}>
                  <span className={`flex items-center gap-2 color-text-secondary`}>
                    {IconEl as any}
                    {label}
                  </span>
                  <span className={`color-text font-medium`}>{statsLoading ? '…' : (value ?? '—')}</span>
                </div>
              ))}
            </div>
          )}
          {/* Admin-only: Stremio linking - HIDDEN in user mode */}
          {!isUserPage && AUTH_ENABLED && !accountEmail && (
            <div className="mb-2 p-3 rounded border color-border">
              {!showStremioLink ? (
                <button
                  onClick={() => setShowStremioLink(true)}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded color-surface color-hover"
                  disabled={isLinkingStremio}
                >
                  <Link2 className="w-4 h-4" />
                  Link Stremio Account
                </button>
              ) : (
                <div className="space-y-2">
                  <StremioOAuthCard
                    active={true}
                    autoStart={true}
                    onAuthKey={handleStremioAuthKey}
                    disabled={isLinkingStremio}
                    showSubmitButton={false}
                    withContainer={false}
                    className="text-sm"
                  />
                  <button
                    onClick={() => setShowStremioLink(false)}
                    className="w-full px-3 py-2 rounded color-surface color-hover text-sm"
                    disabled={isLinkingStremio}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
