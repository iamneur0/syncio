'use client'

import React from 'react'
import { User as UserIcon, Users as GroupsIcon, User as UsersIcon, Puzzle as AddonsIcon } from 'lucide-react'
import api, { publicAuthAPI, addonsAPI, usersAPI, groupsAPI } from '@/services/api'

type Props = {
  className?: string
}

export default function AccountMenuButton({ className = '' }: Props) {
  const AUTH_ENABLED = process.env.NEXT_PUBLIC_AUTH_ENABLED === 'true'
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
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    const onAuthChanged = async (e: any) => {
      const next = !!e?.detail?.authed
      const nextState: AuthState = next ? 'authed' : 'guest'
      setAuthState(nextState)
      if (typeof window !== 'undefined') (window as any).__SYNCIO_AUTHED = next
      if (next) {
        try {
          await publicAuthAPI.me()
        } catch {}
      }
    }
    if (AUTH_ENABLED && authState === 'unknown') setAuthState('unknown')
    // On mount, restore session directly from /me so the button shows after refresh
    ;(async () => {
      try {
        if (!AUTH_ENABLED) {
          const info = await api.get('/settings/account-info')
          setAuthState('authed')
          if (typeof window !== 'undefined') (window as any).__SYNCIO_AUTHED = true
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
        await publicAuthAPI.me()
      } catch {}
    })()
  }, [authState])

  React.useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!showMenu) return
      if (AUTH_ENABLED && authState !== 'authed') return
      setStatsLoading(true)
      try {
        const [addons, users, groups] = await Promise.all([
          addonsAPI.getAll().catch(() => []),
          usersAPI.getAll().catch(() => []),
          groupsAPI.getAll().catch(() => []),
        ])
        if (!cancelled) setStats({ addons: addons.length, users: users.length, groups: groups.length })
      } finally {
        if (!cancelled) setStatsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [showMenu, authState])

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
    // cookie-based logout is handled server-side
    try { delete (api as any).defaults.headers.Authorization } catch {}
    setAuthState('guest')
    if (typeof window !== 'undefined') (window as any).__SYNCIO_AUTHED = false
    setShowMenu(false)
    try { window.dispatchEvent(new CustomEvent('sfm:auth:changed', { detail: { authed: false } })) } catch {}
    try { await publicAuthAPI.logout() } catch {}
  }

  if (AUTH_ENABLED && authState === 'guest') return null

  const btnClasses = `h-10 px-3 rounded-lg flex items-center justify-center focus:outline-none focus:ring-0 color-surface color-hover ${className}`

  const menuClasses = `absolute right-0 mt-2 w-72 rounded-xl shadow-xl p-3 text-sm border z-[400] card`

  return (
    <div className="relative z-[10]" ref={wrapperRef}>
      <button className={btnClasses} onClick={() => setShowMenu((s) => !s)} title="Account">
        <UserIcon size={18} />
      </button>
      {showMenu && (
        <div className={menuClasses}>
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
          {/* Export/Delete actions moved to Settings */}
          <button
            onClick={handleLogout}
            className={`color-surface color-hover color-text w-full text-center px-3 py-2 rounded`}
          >
            Logout
          </button>
        </div>
      )}
    </div>
  )
}


