'use client'

import React from 'react'
import { User as UserIcon, Users as GroupsIcon, User as UsersIcon, Puzzle as AddonsIcon } from 'lucide-react'
import api, { publicAuthAPI, addonsAPI, usersAPI, groupsAPI } from '@/services/api'
import toast from 'react-hot-toast'

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
  const [stats, setStats] = React.useState<{ addons: number; users: number; groups: number } | null>(null)
  const [statsLoading, setStatsLoading] = React.useState(false)
  const [accountUuid, setAccountUuid] = React.useState<string | null>(null)
  const [accountEmail, setAccountEmail] = React.useState<string | null>(null)

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
        const [addons, users, groups, accountInfo] = await Promise.all([
          addonsAPI.getAll().catch(() => []),
          usersAPI.getAll().catch(() => []),
          groupsAPI.getAll().catch(() => []),
          AUTH_ENABLED ? publicAuthAPI.me().catch(() => null) : api.get('/settings/account-info').catch(() => null),
        ])
        if (!cancelled) {
          setStats({ addons: addons.length, users: users.length, groups: groups.length })
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
                  <div className="text-xs color-text-secondary text-center">Email</div>
                  <div className="text-xs color-text text-center break-all">{accountEmail}</div>
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
          <div className={`mb-1 rounded overflow-hidden border color-border`}>
            {[
              ['Addons', stats?.addons, <AddonsIcon key="a" className="w-4 h-4" />],
              ['Users', stats?.users, <UsersIcon key="u" className="w-4 h-4" />],
              ['Groups', stats?.groups, <GroupsIcon key="g" className="w-4 h-4" />],
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
          {(AUTH_ENABLED || isPrivateAuth) && (
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


