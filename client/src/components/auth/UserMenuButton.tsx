'use client'

import React from 'react'
import { User as UserIcon, Users as GroupsIcon, User as UsersIcon, Puzzle as AddonsIcon } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import api, { publicAuthAPI, addonsAPI, usersAPI, groupsAPI } from '@/services/api'

type Props = {
  className?: string
}

export default function UserMenuButton({ className = '' }: Props) {
  const AUTH_ENABLED = process.env.NEXT_PUBLIC_AUTH_ENABLED === 'true'
  const { isDark, isModernDark, isMono } = useTheme()
  const [authed, setAuthed] = React.useState<boolean>(() => !AUTH_ENABLED ? true : false)
  const [showMenu, setShowMenu] = React.useState(false)
  const wrapperRef = React.useRef<HTMLDivElement | null>(null)
  const [accountUuid, setAccountUuid] = React.useState('')
  const [stats, setStats] = React.useState<{ addons: number; users: number; groups: number } | null>(null)
  const [statsLoading, setStatsLoading] = React.useState(false)
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    const onAuthChanged = async (e: any) => {
      const next = !!e?.detail?.authed
      setAuthed(next)
      if (next) {
        try {
          const me = await publicAuthAPI.me()
          setAccountUuid(me?.account?.uuid || '')
        } catch {}
      } else {
        setAccountUuid('')
      }
    }
    if (AUTH_ENABLED) setAuthed(false)
    // On mount, restore session directly from /me so the button shows after refresh
    ;(async () => {
      try {
        const me = await publicAuthAPI.me()
        const ok = !!me?.account
        setAuthed(ok)
        setAccountUuid(ok ? (me?.account?.uuid || '') : '')
      } catch {
        setAuthed(false)
        setAccountUuid('')
      }
    })()
    window.addEventListener('sfm:auth:changed', onAuthChanged as any)
    return () => window.removeEventListener('sfm:auth:changed', onAuthChanged as any)
  }, [])

  React.useEffect(() => {
    if (!AUTH_ENABLED || !authed) return
    ;(async () => {
      try {
        const me = await publicAuthAPI.me()
        setAccountUuid(me?.account?.uuid || '')
      } catch {}
    })()
  }, [authed])

  React.useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!AUTH_ENABLED || !authed || !showMenu) return
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
  }, [showMenu, authed])

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
    setAuthed(false)
    setShowMenu(false)
    setAccountUuid('')
    try { window.dispatchEvent(new CustomEvent('sfm:auth:changed', { detail: { authed: false } })) } catch {}
    try { await publicAuthAPI.logout() } catch {}
  }

  if (!AUTH_ENABLED || !authed) return null

  const btnClasses = `h-10 px-3 rounded-lg flex items-center justify-center transition-colors focus:outline-none focus:ring-0 ${
    isMono ? 'bg-black text-white hover:bg-white/10' : (isDark || isModernDark) ? 'bg-gray-800 text-gray-100 hover:bg-gray-700' : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
  } ${className}`

  const menuClasses = `absolute right-0 mt-2 w-72 rounded-xl shadow-xl p-3 text-sm border z-[400] ${
    isMono ? 'bg-black border-white/20 text-white' : (isDark || isModernDark) ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-200 text-gray-900'
  }`

  return (
    <div className="relative z-[300]" ref={wrapperRef}>
      <button className={btnClasses} onClick={() => setShowMenu((s) => !s)} title="Account">
        <UserIcon size={18} />
      </button>
      {showMenu && (
        <div className={menuClasses}>
          <button
            type="button"
            onClick={async ()=>{ if(accountUuid){ await navigator.clipboard.writeText(accountUuid); setCopied(true); setTimeout(()=>setCopied(false), 1200) } }}
            className={`mb-3 w-full flex items-center gap-3 px-3 py-2 rounded border ${
              isMono ? 'bg-black/60 hover:bg-white/10 border-white/20' : (isDark||isModernDark) ? 'bg-gray-900/40 hover:bg-gray-700 border-gray-700' : 'bg-gray-50 hover:bg-gray-100 border-gray-200'
            }`}
            title="Click to copy"
          >
            <span className={`break-all font-mono text-xs flex-1 ${isDark||isModernDark||isMono ? 'text-white' : 'text-gray-900'}`}>{accountUuid || '—'}</span>
            <span className={`text-[10px] w-12 text-right flex-shrink-0 ${copied ? (isDark||isModernDark||isMono ? 'text-green-400' : 'text-green-600') : (isDark||isModernDark||isMono ? 'text-gray-400' : 'text-gray-500')}`}>{copied ? 'Copied' : 'Copy'}</span>
          </button>
          <div className={`mb-1 rounded overflow-hidden border ${isMono ? 'border-white/20' : (isDark||isModernDark) ? 'border-gray-700' : 'border-gray-200'}`}>
            {[
              ['Addons', stats?.addons, <AddonsIcon key="a" className="w-4 h-4" />],
              ['Users', stats?.users, <UsersIcon key="u" className="w-4 h-4" />],
              ['Groups', stats?.groups, <GroupsIcon key="g" className="w-4 h-4" />],
            ].map(([label, value, IconEl], idx) => (
              <div key={label as string} className={`flex items-center justify-between px-3 py-2 ${idx>0 ? (isMono ? 'border-t border-white/10' : (isDark||isModernDark) ? 'border-t border-gray-700' : 'border-t border-gray-200') : ''}`}>
                <span className={`flex items-center gap-2 ${isDark||isModernDark||isMono ? 'text-gray-300' : 'text-gray-600'}`}>
                  {IconEl as any}
                  {label}
                </span>
                <span className={`${isDark||isModernDark||isMono ? 'text-gray-100' : 'text-gray-900'} font-medium`}>{statsLoading ? '…' : (value ?? '—')}</span>
              </div>
            ))}
          </div>
          {/* Export/Delete actions moved to Settings */}
          <button
            onClick={handleLogout}
            className={`${isMono ? 'bg-white/10 hover:bg-white/20 text-white' : (isDark||isModernDark) ? 'bg-gray-700 hover:bg-gray-600 text-gray-100' : 'bg-gray-100 hover:bg-gray-200 text-gray-900'} w-full text-center px-3 py-2 rounded`}
          >
            Logout
          </button>
        </div>
      )}
    </div>
  )
}


