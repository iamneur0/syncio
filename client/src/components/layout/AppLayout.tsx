'use client'

import React, { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTheme } from '@/contexts/ThemeContext'
import { 
  Users, 
  User,
  Puzzle, 
  Settings, 
  Menu, 
  X,
  ScrollText,
  ListTodo,
  Mail,
  Activity,
  Github,
  BarChart3,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import AccountMenuButton from '@/components/auth/AccountMenuButton'

export interface NavigationItem {
  name: string
  icon: LucideIcon
  id: string
  path: string
}

interface AppLayoutProps {
  children: React.ReactNode
  navigation?: NavigationItem[]
  onTabChange?: (id: string) => void // If provided, use client-side tab switching instead of routing
  activeTabId?: string // Active tab ID when using client-side switching
}

const defaultNavigation: NavigationItem[] = [
  { name: 'Users', icon: User, id: 'users', path: '/users' },
  { name: 'Groups', icon: Users, id: 'groups', path: '/groups' },
  { name: 'Addons', icon: Puzzle, id: 'addons', path: '/addons' },
  { name: 'Activity', icon: Activity, id: 'activity', path: '/activity' },
  { name: 'Metrics', icon: BarChart3, id: 'metrics', path: '/metrics' },
  { name: 'Invites', icon: Mail, id: 'invitations', path: '/invitations' },
  { name: 'Tasks', icon: ListTodo, id: 'tasks', path: '/tasks' },
  { name: 'Settings', icon: Settings, id: 'settings', path: '/settings' },
]

export default function AppLayout({ children, navigation = defaultNavigation, onTabChange, activeTabId }: AppLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const appVersion = (process.env.NEXT_PUBLIC_APP_VERSION as string) || 'dev'
  const { isDark } = useTheme()
  const logoSrc = isDark ? '/logo-white.png' : '/logo-black.png'

  // Determine active tab - use activeTabId if provided (client-side), otherwise use pathname (routing)
  // Sort by path length (longest first) to match more specific paths before general ones
  const sortedNavigation = [...navigation].sort((a, b) => b.path.length - a.path.length)
  const activeTab = activeTabId || sortedNavigation.find(item => pathname?.startsWith(item.path))?.id || navigation[0]?.id || ''
  
  // Handle tab click - use client-side switching if onTabChange is provided, otherwise use routing
  const handleTabClick = (item: NavigationItem, e: React.MouseEvent) => {
    if (onTabChange) {
      e.preventDefault()
      onTabChange(item.id)
      setSidebarOpen(false)
    }
    // Otherwise, let Link handle navigation normally
  }

  // Check if app is up to date
  const isUpToDate = appVersion === 'dev' || true // Simplified for now

  const handleChangelog = () => {
    router.push('/changelog')
  }

  return (
    <div className="min-h-screen flex overscroll-none">
      {/* Mobile sidebar overlay */}
      <div className={`fixed inset-0 z-40 lg:hidden ${sidebarOpen ? '' : 'pointer-events-none'}`}>
        <div className={`fixed inset-0 theme-bg-4 transition-opacity ${sidebarOpen ? 'opacity-75' : 'opacity-0'}`} onClick={() => setSidebarOpen(false)} />
        <div className={`fixed inset-y-0 left-0 flex flex-col w-72 color-background border-r color-border shadow-xl transform transition-transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          {/* Mobile header with close button */}
          <div className="flex items-center h-16 px-3 relative">
            <div className="flex items-center justify-center w-8 h-8 flex-shrink-0 absolute left-6 top-1/2 transform -translate-y-1/2">
              <img 
                src={logoSrc}
                alt="Syncio Logo" 
                className="w-8 h-8"
                onError={(e) => {
                  e.currentTarget.src = '/favicon-32x32.png'
                }}
              />
            </div>
            <h1 className={`text-xl font-bold absolute left-1/2 transform -translate-x-1/2 theme-text-1`}>Syncio</h1>
            <button onClick={() => setSidebarOpen(false)} className={`p-1 absolute right-4 theme-text-1 hover:opacity-80`}>
              <X className="w-6 h-6" />
            </button>
          </div>
          {/* Reuse desktop navigation with mobile styling */}
          <nav className="flex-1 px-3 py-4 space-y-2">
            {navigation.map((item) => {
              const isActive = activeTab === item.id
              const className = `w-full flex items-center py-5 pl-4 pr-6 text-left rounded border-0 transition-all duration-200 relative focus:outline-none focus:ring-0 focus:border-0 active:outline-none active:ring-0 active-border-0 color-hover ${isActive ? 'is-active' : ''} ${
                isActive
                  ? 'theme-text-1 font-bold'
                  : 'theme-text-3 hover-accent font-medium'
              }`
              
              if (onTabChange) {
                return (
                  <button
                    key={item.id}
                    onClick={(e: React.MouseEvent) => handleTabClick(item, e)}
                    className={className}
                  >
                  <div className="flex items-center justify-center w-8 h-8 flex-shrink-0 absolute left-1 top-1/2 transform -translate-y-1/2">
                    {item.id === 'invitations' && isActive ? (
                      <item.icon className="w-5 h-5 transition-all duration-200 [&>path:nth-child(2)]:fill-current" />
                    ) : (
                      <item.icon className={`w-5 h-5 transition-all duration-200 ${
                        isActive ? 'fill-current' : ''
                      }`} />
                    )}
                  </div>
                  <span className={`absolute left-11 top-1/2 transform -translate-y-1/2 text-sm transition-all duration-200 ${
                    isActive ? 'font-bold' : 'font-medium'
                  }`}>{item.name}</span>
                  </button>
                )
              } else {
                return (
                  <Link
                    key={item.id}
                    href={item.path}
                    onClick={() => setSidebarOpen(false)}
                    className={className}
                  >
                    <div className="flex items-center justify-center w-8 h-8 flex-shrink-0 absolute left-1 top-1/2 transform -translate-y-1/2">
                      {item.id === 'invitations' && isActive ? (
                        <item.icon className="w-5 h-5 transition-all duration-200 [&>path:nth-child(2)]:fill-current" />
                      ) : (
                        <item.icon className={`w-5 h-5 transition-all duration-200 ${
                          isActive ? 'fill-current' : ''
                        }`} />
                      )}
                    </div>
                    <span className={`absolute left-11 top-1/2 transform -translate-y-1/2 text-sm transition-all duration-200 ${
                      isActive ? 'font-bold' : 'font-medium'
                    }`}>{item.name}</span>
                  </Link>
                )
              }
            })}
          </nav>
        {/* Version badge */}
        <div className="px-3 pb-0 mt-auto">
          <div className="flex items-center justify-center gap-2 py-2">
            <button
              onClick={handleChangelog}
              className="flex items-center gap-1.5 hover:opacity-80 transition-opacity theme-text-3"
              title="What's New"
            >
              {appVersion !== 'dev' && (
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: isUpToDate ? '#22c55e' : '#ef4444' }} />
              )}
              <span className="text-xs font-medium">v{appVersion}</span>
              <ScrollText className="w-4 h-4" />
            </button>
            <a
              href="https://github.com/iamneur0/syncio"
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 hover:opacity-80 transition-opacity theme-text-3"
              title="GitHub Repository"
            >
              <Github className="w-4 h-4" />
            </a>
          </div>
        </div>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className={`hidden lg:flex lg:flex-col lg:h-[100dvh] lg:sticky lg:top-0 transition-all duration-300 ${sidebarCollapsed ? 'lg:w-16' : 'lg:w-64'} color-background border-r color-border`}>
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className={`w-full flex items-center justify-center h-16 px-4 flex-shrink-0 hover-accent transition-colors relative`}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <div className="flex items-center justify-center w-8 h-8 flex-shrink-0 absolute left-4 top-1/2 transform -translate-y-1/2">
            <img 
              src={logoSrc}
              alt="Syncio Logo" 
              className="w-8 h-8"
              onError={(e) => {
                e.currentTarget.src = '/favicon-32x32.png'
              }}
            />
          </div>
          {!sidebarCollapsed && <h1 className={`text-xl font-bold absolute left-20 top-1/2 transform -translate-y-1/2 theme-text-1`}>Syncio</h1>}
        </button>
        <nav className="flex-1 px-3 py-4 space-y-2 overflow-y-auto scrollbar-hide">
          {navigation.map((item) => {
            const isActive = activeTab === item.id
            const className = `w-full flex items-center py-5 pl-4 pr-6 text-left rounded border-0 transition-all duration-200 relative focus:outline-none focus:ring-0 focus-border-0 active:outline-none active-ring-0 active-border-0 color-hover ${isActive ? 'is-active' : ''} ${
              isActive
                ? 'theme-text-1 font-bold'
                : 'theme-text-3 hover-accent font-medium'
            }`
            
            if (onTabChange) {
              return (
                <button
                  key={item.id}
                  onClick={(e: React.MouseEvent) => handleTabClick(item, e)}
                  className={className}
                  title={sidebarCollapsed ? item.name : ''}
                >
                <div className="flex items-center justify-center w-8 h-8 flex-shrink-0 absolute left-1 top-1/2 transform -translate-y-1/2">
                  {item.id === 'invitations' && isActive ? (
                    <item.icon className="w-5 h-5 transition-all duration-200 [&>path:nth-child(2)]:fill-current" />
                  ) : (
                    <item.icon className={`w-5 h-5 transition-all duration-200 ${
                      isActive ? 'fill-current' : ''
                    }`} />
                  )}
                </div>
                  {!sidebarCollapsed && <span className={`absolute left-11 top-1/2 transform -translate-y-1/2 text-sm transition-all duration-200 ${
                    isActive ? 'font-bold' : 'font-medium'
                  }`}>{item.name}</span>}
                </button>
              )
            } else {
              return (
                <Link
                  key={item.id}
                  href={item.path}
                  className={className}
                  title={sidebarCollapsed ? item.name : ''}
                >
                  <div className="flex items-center justify-center w-8 h-8 flex-shrink-0 absolute left-1 top-1/2 transform -translate-y-1/2">
                    {item.id === 'invitations' && isActive ? (
                      <item.icon className="w-5 h-5 transition-all duration-200 [&>path:nth-child(2)]:fill-current" />
                    ) : (
                      <item.icon className={`w-5 h-5 transition-all duration-200 ${
                        isActive ? 'fill-current' : ''
                      }`} />
                    )}
                  </div>
                  {!sidebarCollapsed && <span className={`absolute left-11 top-1/2 transform -translate-y-1/2 text-sm transition-all duration-200 ${
                    isActive ? 'font-bold' : 'font-medium'
                  }`}>{item.name}</span>}
                </Link>
              )
            }
          })}
        </nav>
        {/* Version badge */}
        <div className={`${sidebarCollapsed ? 'px-1' : 'px-3'} pb-0 flex-shrink-0 mt-auto`}>
          {sidebarCollapsed ? (
            <div className="flex flex-col items-center gap-1 py-1">
              <button
                onClick={handleChangelog}
                className="flex flex-col items-center gap-1 hover:opacity-80 transition-opacity theme-text-3"
                title="What's New"
              >
                {appVersion !== 'dev' && (
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: isUpToDate ? '#22c55e' : '#ef4444' }} />
                )}
                <span className="text-xs font-medium leading-tight break-all text-center">v{appVersion}</span>
                <ScrollText className="w-4 h-4" />
              </button>
              <a
                href="https://github.com/iamneur0/syncio"
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 hover:opacity-80 transition-opacity theme-text-3"
                title="GitHub Repository"
              >
                <Github className="w-4 h-4" />
              </a>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 py-2">
              <button
                onClick={handleChangelog}
                className="flex items-center gap-1.5 hover:opacity-80 transition-opacity theme-text-3"
                title="What's New"
              >
                {appVersion !== 'dev' && (
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: isUpToDate ? '#22c55e' : '#ef4444' }} />
                )}
                <span className="text-xs font-medium">v{appVersion}</span>
                <ScrollText className="w-4 h-4" />
              </button>
              <a
                href="https://github.com/iamneur0/syncio"
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 hover:opacity-80 transition-opacity theme-text-3"
                title="GitHub Repository"
              >
                <Github className="w-4 h-4" />
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden lg:overflow-visible">
        {/* Mobile header */}
        <div className="lg:hidden fixed top-0 left-0 right-0 z-[100] flex items-center justify-between h-16 px-4" style={{ background: 'var(--color-background)' }}>
          <button
            onClick={() => setSidebarOpen(true)}
            className="theme-text-3 hover:opacity-80"
          >
            <Menu className="w-6 h-6" />
          </button>
          <h1 className={`text-lg font-semibold theme-text-1`}>
            {navigation.find(item => (activeTabId ? item.id === activeTabId : pathname?.startsWith(item.path)))?.name || 'Syncio'}
          </h1>
          <AccountMenuButton className="theme-text-3 hover:opacity-80" />
        </div>

        {/* Page content */}
        <main className={`flex-1 overflow-auto overscroll-contain pt-16 lg:pt-0 bg-transparent scrollbar-stable`} style={{
          height: 'calc(100dvh - 4rem)'
        }}>
          {children}
        </main>
      </div>
    </div>
  )
}


