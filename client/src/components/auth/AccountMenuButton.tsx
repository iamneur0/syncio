'use client'

import React from 'react'
import { User as UserIcon, Users as GroupsIcon, User as UsersIcon, Puzzle as AddonsIcon, Mail, Link2, Unlink } from 'lucide-react'
import api, { publicAuthAPI, addonsAPI, usersAPI, groupsAPI, invitationsAPI } from '@/services/api'
import toast from 'react-hot-toast'
import { StremioOAuthCard } from '@/components/auth/StremioOAuthCard'

type Props = {
  className?: string
}

export default function AccountMenuButton({ className = '' }: Props) {
  const AUTH_ENABLED = process.env.NEXT_PUBLIC_AUTH_ENABLED === 'true'
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
  const [stats, setStats] = React.useState<{ addons: number; users: number; groups: number; invites: number } | null>(null)
  const [statsLoading, setStatsLoading] = React.useState(false)
  const [accountUuid, setAccountUuid] = React.useState<string | null>(null)
  const [accountEmail, setAccountEmail] = React.useState<string | null>(null)
  const [showStremioLink, setShowStremioLink] = React.useState(false)
  const [isLinkingStremio, setIsLinkingStremio] = React.useState(false)
  const [isUnlinkingStremio, setIsUnlinkingStremio] = React.useState(false)

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
          // Check if private auth is enabled
          try {
            const me = await publicAuthAPI.me()
            // If /me succeeds, we're authenticated (private auth enabled)
            setAuthState('authed')
            setIsPrivateAuth(true)
            if (typeof window !== 'undefined') (window as any).__SYNCIO_AUTHED = true
          } catch (err: any) {
            // If /me fails with 401, private auth is enabled but not authenticated
            if (err?.response?.status === 401) {
              setAuthState('guest')
              setIsPrivateAuth(true)
              if (typeof window !== 'undefined') (window as any).__SYNCIO_AUTHED = false
            } else {
              // Other error or no auth - assume no auth needed
              const info = await api.get('/settings/account-info')
              setAuthState('authed')
              setIsPrivateAuth(false)
              if (typeof window !== 'undefined') (window as any).__SYNCIO_AUTHED = true
            }
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
        const [addons, users, groups, invites, accountInfo] = await Promise.all([
          addonsAPI.getAll().catch(() => []),
          usersAPI.getAll().catch(() => []),
          groupsAPI.getAll().catch(() => []),
          invitationsAPI.getAll().catch(() => []),
          AUTH_ENABLED ? publicAuthAPI.me().catch(() => null) : api.get('/settings/account-info').catch(() => null),
        ])
        if (!cancelled) {
          // Active invites: isActive && not expired && not full (same logic as Invites page)
          const now = new Date()
          const activeInvites = (invites || []).filter((inv: any) => {
            if (!inv) return false
            const isExpired = inv.expiresAt && new Date(inv.expiresAt) < now
            const isFull = inv.maxUses != null && inv.currentUses >= inv.maxUses
            return inv.isActive && !isExpired && !isFull
          }).length

          setStats({ addons: addons.length, users: users.length, groups: groups.length, invites: activeInvites })
          if (AUTH_ENABLED && accountInfo?.account) {
            const acct = accountInfo.account
            setAccountUuid(acct?.uuid || null)
            setAccountEmail(acct?.email || null)
          }
        }
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
    // cookie-based logout is handled server-side - do this first
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

  if ((AUTH_ENABLED || isPrivateAuth) && authState === 'guest') return null

  const btnClasses = `h-10 px-3 rounded-lg flex items-center justify-center focus:outline-none focus:ring-0 color-surface color-hover ${className}`

  const menuClasses = `absolute right-0 mt-2 w-72 rounded-xl shadow-xl p-3 text-sm border z-[400] card`

  return (
    <div className="relative z-[10]" ref={wrapperRef}>
      <button className={btnClasses} onClick={() => setShowMenu((s) => !s)} title="Account">
        <UserIcon size={18} />
      </button>
      {showMenu && (
        <div className={menuClasses}>
          {AUTH_ENABLED && (accountUuid || accountEmail) && (
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
          {AUTH_ENABLED && !accountEmail && (
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
          <div className={`mb-1 rounded overflow-hidden border color-border`}>
            {[
              ['Addons', stats?.addons, <AddonsIcon key="a" className="w-4 h-4" />],
              ['Users', stats?.users, <UsersIcon key="u" className="w-4 h-4" />],
              ['Groups', stats?.groups, <GroupsIcon key="g" className="w-4 h-4" />],
              ['Invites', stats?.invites, <Mail key="i" className="w-4 h-4" />],
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
          {AUTH_ENABLED && (
            <button
              onClick={handleLogout}
              className={`color-surface color-hover color-text w-full text-center px-3 py-2 rounded`}
            >
              Logout
            </button>
          )}
        </div>
      )}
    </div>
  )
}
