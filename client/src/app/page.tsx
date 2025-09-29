'use client'

import { useState, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import api, { publicAuthAPI, addonsAPI, usersAPI, groupsAPI } from '@/services/api'
import Head from 'next/head'
import { 
  Users, 
  User,
  Puzzle, 
  Settings, 
  Menu, 
  X
} from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import UserMenuButton from '@/components/auth/UserMenuButton'

// Import page components
import AddonsPage from '@/components/pages/AddonsPage'
import UsersPage from '@/components/pages/UsersPage'
import GroupsPage from '@/components/pages/GroupsPage'
import SettingsPage from '@/components/pages/SettingsPage'

const navigation = [
  { name: 'Addons', icon: Puzzle, id: 'addons' },
  { name: 'Users', icon: User, id: 'users' },
  { name: 'Groups', icon: Users, id: 'groups' },
  { name: 'Settings', icon: Settings, id: 'settings' },
]

export default function HomePage() {
  const AUTH_ENABLED = process.env.NEXT_PUBLIC_AUTH_ENABLED === 'true'
  const [activeTab, setActiveTab] = useState('addons')
  // Force remount of a page component when its tab is clicked to refresh queries/status
  const [tabKeys, setTabKeys] = useState<{ [key: string]: number }>({ addons: 0, users: 0, groups: 0, settings: 0 })
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const { theme, toggleTheme, isDark, isModern, isModernDark, isMono, isLoading } = useTheme()
  const queryClient = useQueryClient()
  const [authed, setAuthed] = useState<boolean>(() => !AUTH_ENABLED ? true : false)
  const [authReady, setAuthReady] = useState<boolean>(() => !AUTH_ENABLED)
  const [authMode, setAuthMode] = useState<'login'|'register'>('login')
  const [loginUuid, setLoginUuid] = useState('')
  const [registerUuid, setRegisterUuid] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const mainRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const handler = (e: any) => setAuthed(!!e?.detail?.authed)
    window.addEventListener('sfm:auth:changed', handler as any)
    if (AUTH_ENABLED) {
      ;(async () => {
        try {
          const me = await publicAuthAPI.me()
          const ok = !!me?.account
          setAuthed(ok)
          try { window.dispatchEvent(new CustomEvent('sfm:auth:changed', { detail: { authed: ok } })) } catch {}
          if (ok) {
            try {
              await Promise.all([
                queryClient.fetchQuery({ queryKey: ['addons'], queryFn: addonsAPI.getAll }),
                queryClient.fetchQuery({ queryKey: ['users'], queryFn: usersAPI.getAll }),
                queryClient.fetchQuery({ queryKey: ['groups'], queryFn: groupsAPI.getAll }),
              ])
            } catch {}
          }
        } catch {
          setAuthed(false)
          try { window.dispatchEvent(new CustomEvent('sfm:auth:changed', { detail: { authed: false } })) } catch {}
        } finally { setAuthReady(true) }
      })()
    }
    return () => window.removeEventListener('sfm:auth:changed', handler as any)
  }, [])

  // Suggest UUID when switching to register
  useEffect(() => {
    if (!AUTH_ENABLED) return
    if (authMode === 'register' && !registerUuid) {
      try {
        const local = (globalThis as any)?.crypto?.randomUUID?.()
        if (local) { setRegisterUuid(local); return }
      } catch {}
      ;(async () => {
        try {
          const res = await fetch('/api/public-auth/suggest-uuid').then(r => r.json())
          if (res?.uuid) setRegisterUuid(res.uuid)
        } catch {}
      })()
    }
  }, [authMode, registerUuid])

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError(null)
    try {
      const currentUuid = authMode === 'login' ? loginUuid : registerUuid
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      if (!uuidRegex.test(currentUuid.trim())) { setAuthError('Invalid UUID format'); return }
      if (password.length < 4) { setAuthError('Enter UUID and a password (min 4 chars)'); return }
      const res = authMode === 'login'
        ? await publicAuthAPI.login({ uuid: currentUuid.trim(), password })
        : await publicAuthAPI.register({ uuid: currentUuid.trim(), password })
      // Ensure cookies are set and session is valid before enabling queries
      try {
        await publicAuthAPI.me()
        try {
          await Promise.all([
            queryClient.fetchQuery({ queryKey: ['addons'], queryFn: addonsAPI.getAll }),
            queryClient.fetchQuery({ queryKey: ['users'], queryFn: usersAPI.getAll }),
            queryClient.fetchQuery({ queryKey: ['groups'], queryFn: groupsAPI.getAll }),
          ])
        } catch {}
      } catch {} finally { setAuthReady(true) }
      setAuthed(true)
      setPassword('')
      try { window.dispatchEvent(new CustomEvent('sfm:auth:changed', { detail: { authed: true } })) } catch {}
    } catch (err: any) {
      const backendMsg = err?.response?.data?.message
      setAuthError(backendMsg || err?.message || 'Authentication failed')
    }
  }

  // Defer readiness check until after all hooks are declared to keep hook order stable

  const activateTab = (id: string, closeSidebar?: boolean) => {
    if (AUTH_ENABLED && !authed) {
      try { (window as any).__sfmAuth?.open?.('login') } catch {}
      return
    }
    setActiveTab(id)
    setTabKeys(prev => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }))
    try {
      // Reset scroll position of the main content when switching tabs
      if (mainRef.current) {
        // Use rAF to ensure DOM has applied the change
        requestAnimationFrame(() => {
          try { mainRef.current?.scrollTo({ top: 0, left: 0, behavior: 'instant' as any }) } catch {
            try { (mainRef.current as any).scrollTop = 0 } catch {}
          }
        })
      }
    } catch {}
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('sfm:tab:activated' as any, { detail: { id } }))
      } catch {}
    }
    if (closeSidebar) setSidebarOpen(false)
  }

  // Ensure scroll position resets to top whenever the visible tab changes
  useEffect(() => {
    try {
      requestAnimationFrame(() => {
        try {
          if (mainRef.current) mainRef.current.scrollTop = 0
          if (typeof window !== 'undefined') window.scrollTo(0, 0)
        } catch {}
      })
    } catch {}
  }, [activeTab])

  // Early-out for loading/auth states after hooks are mounted
  if (isLoading || (AUTH_ENABLED && !authReady)) {
    return null
  }

  const renderContent = () => {
    if (AUTH_ENABLED && !authed) {
      return (
        <div className="flex items-center justify-center py-16 px-4">
          <div className={`w-full max-w-3xl rounded-2xl overflow-hidden ${
            isMono ? 'bg-black border border-white/20' : (isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200')
          }`}>
            <div className={`${isModern ? 'bg-gradient-to-r from-purple-600 to-indigo-600' : isModernDark ? 'bg-gradient-to-r from-purple-800 to-indigo-800' : isDark ? 'bg-gray-900' : 'bg-gray-50'} p-8` }>
              <div className="flex items-center gap-4">
                <img src={(isDark || isMono) ? "/logo-white.png" : "/logo-black.png"} alt="Syncio" className="w-16 h-16" onError={(e)=>{(e.currentTarget as any).src='/favicon-32x32.png'}} />
                <div>
                  <h2 className={`text-2xl font-bold ${isModern || isModernDark ? 'text-white' : (isDark ? 'text-white' : 'text-gray-900')}`}>Welcome to Syncio</h2>
                  <p className={`${isModern || isModernDark ? 'text-white/90' : (isDark ? 'text-gray-300' : 'text-gray-600')} text-sm`}>Sign in to access your private workspace. New here? Register in seconds.</p>
                </div>
              </div>
            </div>
            <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <div className="flex gap-2 text-sm mb-4">
                  <button type="button" className={`px-3 py-1 rounded ${authMode==='login'?'bg-stremio-purple text-white':'bg-transparent border ' + (isDark||isMono?'border-gray-700 text-gray-200':'border-gray-300 text-gray-700')}`} onClick={()=>setAuthMode('login')}>Login</button>
                  <button type="button" className={`px-3 py-1 rounded ${authMode==='register'?'bg-stremio-purple text-white':'bg-transparent border ' + (isDark||isMono?'border-gray-700 text-gray-200':'border-gray-300 text-gray-700')}`} onClick={()=>setAuthMode('register')}>Register</button>
                </div>
                <form onSubmit={handleAuthSubmit} className="space-y-3">
                  <div>
                    <label className={`block text-sm mb-1 ${isDark||isMono?'text-gray-200':'text-gray-700'}`}>UUID</label>
                    {authMode === 'register' ? (
                      <input value={registerUuid} readOnly placeholder={'Generated UUID'} className={`w-full px-3 py-2 rounded border cursor-not-allowed opacity-90 focus:ring-0 ${isDark||isMono?'bg-gray-700 border-gray-600 text-white':'bg-gray-50 border-gray-300 text-gray-900'}`} />
                    ) : (
                      <input value={loginUuid} onChange={(e)=>setLoginUuid(e.target.value)} placeholder={'Your UUID'} className={`w-full px-3 py-2 rounded border focus:ring-2 focus:ring-stremio-purple focus:border-transparent ${isDark||isMono?'bg-gray-700 border-gray-600 text-white':'bg-white border-gray-300 text-gray-900'}`} />
                    )}
                  </div>
                  <div>
                    <label className={`block text-sm mb-1 ${isDark||isMono?'text-gray-200':'text-gray-700'}`}>Password</label>
                    <input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="Password (min 4 chars)" className={`w-full px-3 py-2 rounded border focus:ring-2 focus:ring-stremio-purple focus:border-transparent ${isDark||isMono?'bg-gray-700 border-gray-600 text-white':'bg-white border-gray-300 text-gray-900'}`} />
                  </div>
                  {authError && <p className="text-sm text-red-500">{authError}</p>}
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={()=>{setLoginUuid(''); setRegisterUuid(''); setPassword(''); setAuthError(null); setAuthMode('login')}} className={`${isDark||isMono?'text-gray-300 bg-gray-700 hover:bg-gray-600':'text-gray-700 bg-gray-100 hover:bg-gray-200'} px-4 py-2 rounded-lg flex-1`}>Clear</button>
                    <button type="submit" className="px-4 py-2 rounded-lg text-white bg-stremio-purple hover:bg-purple-700 flex-1">{authMode==='login'?'Login':'Register'}</button>
                  </div>
                </form>
              </div>
              <div className={`rounded-lg p-4 ${isDark||isMono?'bg-gray-900/50 border border-gray-800':'bg-gray-50 border border-gray-200'}`}>
                <h3 className={`text-sm font-semibold mb-2 ${isDark||isMono?'text-white':'text-gray-900'}`}>What is Syncio?</h3>
                <ul className={`text-sm space-y-1 ${isDark||isMono?'text-gray-300':'text-gray-700'}`}>
                  <li>• Manage Stremio users, groups, and addons.</li>
                  <li>• Keep accounts in sync with your curated groups.</li>
                  <li>• Import addons from Stremio accounts instantly.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )
    }
    switch (activeTab) {
      case 'addons':
        return <AddonsPage key={`addons-${tabKeys.addons}`} />
      case 'users':
        return <UsersPage key={`users-${tabKeys.users}`} />
      case 'groups':
        return <GroupsPage key={`groups-${tabKeys.groups}`} />
      case 'settings':
        return <SettingsPage key={`settings-${tabKeys.settings}`} />
      default:
        return <AddonsPage key={`addons-${tabKeys.addons}`} />
    }
  }

  return (
    <div>
      <Head>
        <title>Syncio</title>
        <meta name="description" content="Syncio - Stremio Group Manager" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* Mobile browser UI theme colors */}
        <meta name="theme-color" content="#f9fafb" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#111827" media="(prefers-color-scheme: dark)" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div className={`min-h-screen flex overscroll-none ${
        isModern
          ? 'bg-gradient-to-br from-purple-100 via-blue-100 to-indigo-100'
          : isModernDark
          ? 'bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900'
          : isMono
          ? 'bg-black text-white'
          : isDark ? 'bg-gray-900' : 'bg-gray-50'
      }`}>
      {/* Mobile sidebar */}
      <div className={`fixed inset-0 z-40 lg:hidden ${sidebarOpen ? '' : 'pointer-events-none'}`}>
        <div className={`fixed inset-0 bg-gray-600 transition-opacity ${sidebarOpen ? 'opacity-75' : 'opacity-0'}`} onClick={() => setSidebarOpen(false)} />
        <div className={`fixed inset-y-0 left-0 flex flex-col w-72 ${
          isMono
            ? 'bg-black'
            : isDark ? 'bg-gray-800' : 'bg-white'
        } shadow-xl transform transition-transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className={`flex items-center h-16 px-3 relative ${
            isMono ? 'bg-black' : ''
          }`}>
            <div className="flex items-center justify-center w-8 h-8 flex-shrink-0 absolute left-6 top-1/2 transform -translate-y-1/2">
              <img 
                src={(isDark || isMono) ? "/logo-white.png" : "/logo-black.png"} 
                alt="Syncio Logo" 
                className="w-8 h-8"
                onError={(e) => {
                  // Fallback to favicon if theme logo fails to load
                  e.currentTarget.src = "/favicon-32x32.png"
                }}
              />
            </div>
            <h1 className={`text-xl font-bold absolute left-1/2 transform -translate-x-1/2 ${
              isDark ? 'text-white' : 'text-gray-900'
            }`}>Syncio</h1>
            <button onClick={() => setSidebarOpen(false)} className={`p-1 absolute right-4 ${
              isDark ? 'text-white hover:text-gray-200' : 'text-gray-900 hover:text-gray-700'
            }`}>
              <X className="w-6 h-6" />
            </button>
          </div>
          <nav className="flex-1 px-3 py-4 space-y-2">
            {navigation.map((item) => {
              const disabled = AUTH_ENABLED && !authed
              const isActive = !disabled && activeTab === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => activateTab(item.id, true)}
                  disabled={disabled}
                  className={`w-full flex items-center px-4 py-4 text-left rounded transition-all duration-200 focus:outline-none focus:ring-0 focus:border-0 active:outline-none active:ring-0 active:border-0 ${
                    isActive
                      ? (isDark || isMono)
                        ? 'text-white font-bold'
                        : 'text-gray-900 font-bold'
                      : isDark 
                        ? `text-gray-300 ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-600 hover:text-white'} font-medium` 
                        : `text-gray-700 ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100 hover:text-gray-900'} font-medium`
                  }`}
                >
                  <item.icon className={`w-5 h-5 mr-3 flex-shrink-0 transition-all duration-200 ${
                    isActive ? 'fill-current' : ''
                  }`} />
                  <span className={`text-sm transition-all duration-200 ${
                    isActive ? 'font-bold' : 'font-medium'
                  }`}>{item.name}</span>
                </button>
              )})}
          </nav>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className={`hidden lg:flex lg:flex-col transition-all duration-300 ${sidebarCollapsed ? 'lg:w-16' : 'lg:w-64'} ${
        isDark ? 'lg:bg-gray-800 lg:border-gray-700' : 'lg:bg-white lg:border-gray-200'
      } ${isMono ? '' : 'lg:border-r'}`}>
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className={`w-full flex items-center justify-center h-16 px-4 ${
            isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
          } transition-colors relative`}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <div className="flex items-center justify-center w-8 h-8 flex-shrink-0 absolute left-4 top-1/2 transform -translate-y-1/2">
            <img 
              src={(isDark || isMono) ? "/logo-white.png" : "/logo-black.png"} 
              alt="Syncio Logo" 
              className="w-8 h-8"
              onError={(e) => {
                // Fallback to favicon if theme logo fails to load
                e.currentTarget.src = "/favicon-32x32.png"
              }}
            />
          </div>
          {!sidebarCollapsed && <h1 className={`text-xl font-bold absolute left-20 top-1/2 transform -translate-y-1/2 ${
            isDark ? 'text-white' : 'text-gray-900'
          }`}>Syncio</h1>}
        </button>
        <nav className="flex-1 px-3 py-4 space-y-2">
          {navigation.map((item) => {
            const disabled = AUTH_ENABLED && !authed
            const isActive = !disabled && activeTab === item.id
            return (
              <button
                key={item.id}
                onClick={() => activateTab(item.id)}
                disabled={disabled}
                className={`w-full flex items-center py-5 pl-4 pr-6 text-left rounded transition-all duration-200 relative focus:outline-none focus:ring-0 focus:border-0 active:outline-none active:ring-0 active:border-0 ${
                  isActive
                    ? (isDark || isMono)
                      ? 'text-white font-bold'
                      : 'text-gray-900 font-bold'
                    : isDark 
                      ? `text-gray-300 ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-600 hover:text-white'} font-medium` 
                      : `text-gray-700 ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100 hover:text-gray-900'} font-medium`
                }`}
                title={sidebarCollapsed ? item.name : ''}
              >
                <div className="flex items-center justify-center w-8 h-8 flex-shrink-0 absolute left-1 top-1/2 transform -translate-y-1/2">
                  <item.icon className={`w-5 h-5 transition-all duration-200 ${
                    isActive ? 'fill-current' : ''
                  }`} />
                </div>
                {!sidebarCollapsed && <span className={`absolute left-11 top-1/2 transform -translate-y-1/2 text-sm transition-all duration-200 ${
                  isActive ? 'font-bold' : 'font-medium'
                }`}>{item.name}</span>}
              </button>
            )})}
        </nav>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden lg:overflow-visible">
        {/* Mobile header */}
        <div className={`lg:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between h-16 px-4 ${
          isModern
            ? 'bg-gradient-to-r from-purple-50/90 to-blue-50/90 border-purple-200/50'
            : isModernDark
            ? 'bg-gradient-to-r from-purple-800/90 to-blue-800/90 border-purple-600/50'
            : isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        } border-b`}>
          <button
            onClick={() => setSidebarOpen(true)}
            className={`${
              isModern
                ? 'text-purple-600 hover:text-purple-800'
                : isModernDark
                ? 'text-purple-300 hover:text-purple-100'
                : isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Menu className="w-6 h-6" />
          </button>
          <h1 className={`text-lg font-semibold ${
            isModern
              ? 'text-purple-800'
              : isModernDark
              ? 'text-purple-100'
              : isDark ? 'text-white' : 'text-gray-900'
          }`}>
            {(AUTH_ENABLED && !authed) ? 'Welcome' : navigation.find(item => item.id === activeTab)?.name}
          </h1>
          {/* Mobile account button on the right */}
          <div className="flex items-center justify-center">
            <UserMenuButton />
          </div>
        </div>

        {/* Page content */}
        <main ref={mainRef as any} className={`flex-1 overflow-auto overscroll-contain pt-16 lg:pt-0 bg-transparent`} style={{
          height: 'calc(100dvh - 4rem)'
        }}>
          {renderContent()}
        </main>
        {AUTH_ENABLED && !authed ? null : activeTab !== 'users' && (
          <div className="absolute -left-[99999px] -top-[99999px] w-0 h-0 overflow-hidden">
            <UsersPage key={`users-${tabKeys.users}-hidden`} />
          </div>
        )}
      </div>
    </div>
    </div>
  )
}