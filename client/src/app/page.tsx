'use client'

import { useState } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { 
  Users, 
  User,
  Puzzle, 
  Settings, 
  Menu, 
  X,
  ScrollText,
  ListTodo
} from 'lucide-react'

// Import page components
import AddonsPage from '@/components/pages/AddonsPage'
import UsersPage from '@/components/pages/UsersPage'
import GroupsPage from '@/components/pages/GroupsPage'
import SettingsPage from '@/components/pages/SettingsPage'
import ChangelogPage, { LATEST_VERSION } from '@/components/pages/ChangelogPage'
import TasksPage from '@/components/pages/TasksPage'
import AccountMenuButton from '@/components/auth/AccountMenuButton'

const navigation = [
  { name: 'Users', icon: User, id: 'users' },
  { name: 'Groups', icon: Users, id: 'groups' },
  { name: 'Addons', icon: Puzzle, id: 'addons' },
  { name: 'Tasks', icon: ListTodo, id: 'tasks' },
  { name: "What's New", icon: ScrollText, id: 'changelog' },
  { name: 'Settings', icon: Settings, id: 'settings' },
]

export default function HomePage() {
  const [activeTab, setActiveTab] = useState('users')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const { isDark, isMono } = useTheme()
  const appVersion = (process.env.NEXT_PUBLIC_APP_VERSION as string) || 'dev'
  const isUpToDate = appVersion === LATEST_VERSION || appVersion === 'dev'

  const activateTab = (id: string, closeSidebar?: boolean) => {
    setActiveTab(id)
    if (closeSidebar) setSidebarOpen(false)
    
    // Dispatch tab activation event for components to listen to
    try {
      window.dispatchEvent(new CustomEvent('sfm:tab:activated', { detail: { id } }))
    } catch (e) {
      // Ignore if window is not available
    }
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'addons':
        return <AddonsPage />
      case 'users':
        return <UsersPage />
      case 'groups':
        return <GroupsPage />
      case 'changelog':
        return <ChangelogPage />
      case 'tasks':
        return <TasksPage />
      case 'settings':
        return <SettingsPage />
      default:
        return <UsersPage />
    }
  }

  return (
    <div className={`min-h-screen flex overscroll-none ${
      isMono ? 'bg-black text-white' : isDark ? 'bg-gray-900' : 'bg-gray-50'
    }`}>
      {/* Mobile sidebar overlay */}
      <div className={`fixed inset-0 z-40 lg:hidden ${sidebarOpen ? '' : 'pointer-events-none'}`}>
        <div className={`fixed inset-0 bg-gray-600 transition-opacity ${sidebarOpen ? 'opacity-75' : 'opacity-0'}`} onClick={() => setSidebarOpen(false)} />
        <div className={`fixed inset-y-0 left-0 flex flex-col w-72 ${
          isMono ? 'bg-black' : isDark ? 'bg-gray-800' : 'bg-white'
        } shadow-xl transform transition-transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          {/* Mobile header with close button */}
          <div className={`flex items-center h-16 px-3 relative ${
            isMono ? 'bg-black' : ''
          }`}>
            <div className="flex items-center justify-center w-8 h-8 flex-shrink-0 absolute left-6 top-1/2 transform -translate-y-1/2">
              <img 
                src={(isDark || isMono) ? "/logo-white.png" : "/logo-black.png"} 
                alt="Syncio Logo" 
                className="w-8 h-8"
                onError={(e) => {
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
          {/* Reuse desktop navigation with mobile styling */}
        <nav className="flex-1 px-3 py-4 space-y-2">
          {navigation.map((item) => {
            const isActive = activeTab === item.id
            return (
              <button
                key={item.id}
                onClick={() => activateTab(item.id, true)}
                className={`w-full flex items-center py-5 pl-4 pr-6 text-left rounded transition-all duration-200 relative focus:outline-none focus:ring-0 focus:border-0 active:outline-none active:ring-0 active:border-0 ${
                  isActive
                    ? (isDark || isMono)
                      ? 'text-white font-bold'
                      : 'text-gray-900 font-bold'
                    : isDark 
                      ? 'text-gray-300 hover:bg-gray-600 hover:text-white font-medium'
                      : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900 font-medium'
                }`}
              >
                <div className="flex items-center justify-center w-8 h-8 flex-shrink-0 absolute left-1 top-1/2 transform -translate-y-1/2">
                  <item.icon className={`w-5 h-5 transition-all duration-200 ${
                    isActive ? 'fill-current' : ''
                  }`} />
                </div>
                <span className={`absolute left-11 top-1/2 transform -translate-y-1/2 text-sm transition-all duration-200 ${
                  isActive ? 'font-bold' : 'font-medium'
                }`}>{item.name}</span>
              </button>
            )})}
        </nav>
        {/* Version badge */}
        <div className="px-3 pb-0 mt-auto">
          <button
            onClick={() => activateTab('changelog', true)}
            className={`text-xs font-medium w-full py-2 hover:opacity-80 transition-opacity flex items-center justify-center gap-1.5 ${
              isDark || isMono ? 'text-gray-400' : 'text-gray-500'
            }`}
            title={isUpToDate ? 'Up to date' : 'Update available'}
          >
            {appVersion !== 'dev' && (
              <div className={`w-2 h-2 rounded-full ${isUpToDate ? 'bg-green-500' : 'bg-red-500'}`} />
            )}
            v{appVersion}
          </button>
        </div>
        </div>
      </div>

        {/* Desktop sidebar */}
      <div className={`hidden lg:flex lg:flex-col lg:h-[100dvh] lg:sticky lg:top-0 transition-all duration-300 ${sidebarCollapsed ? 'lg:w-16' : 'lg:w-64'} ${
        isDark ? 'lg:bg-gray-800 lg:border-gray-700' : 'lg:bg-white lg:border-gray-200'
      } ${isMono ? '' : (!sidebarCollapsed ? 'lg:border-r' : '')}`}>
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className={`w-full flex items-center justify-center h-16 px-4 flex-shrink-0 ${
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
                e.currentTarget.src = "/favicon-32x32.png"
              }}
            />
          </div>
          {!sidebarCollapsed && <h1 className={`text-xl font-bold absolute left-20 top-1/2 transform -translate-y-1/2 ${
            isDark ? 'text-white' : 'text-gray-900'
          }`}>Syncio</h1>}
        </button>
        <nav className="flex-1 px-3 py-4 space-y-2 overflow-y-auto scrollbar-hide">
          {navigation.map((item) => {
            const isActive = activeTab === item.id
            return (
              <button
                key={item.id}
                onClick={() => activateTab(item.id)}
                className={`w-full flex items-center py-5 pl-4 pr-6 text-left rounded transition-all duration-200 relative focus:outline-none focus:ring-0 focus:border-0 active:outline-none active:ring-0 active:border-0 ${
                  isActive
                    ? (isDark || isMono)
                      ? 'text-white font-bold'
                      : 'text-gray-900 font-bold'
                    : isDark 
                      ? 'text-gray-300 hover:bg-gray-600 hover:text-white font-medium'
                      : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900 font-medium'
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
        {/* Version badge */}
        <div className={`${sidebarCollapsed ? 'px-1' : 'px-3'} pb-0 flex-shrink-0 mt-auto`}>
          <button
            onClick={() => activateTab('changelog')}
            className={`text-xs font-medium w-full ${sidebarCollapsed ? 'py-1' : 'py-2'} hover:opacity-80 transition-opacity flex items-center justify-center ${
              sidebarCollapsed ? 'flex-col gap-1' : 'gap-1.5'
            } ${isDark || isMono ? 'text-gray-400' : 'text-gray-500'}`}
            title={isUpToDate ? 'Up to date' : 'Update available'}
          >
            {sidebarCollapsed ? (
              <>
                {appVersion !== 'dev' && (
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isUpToDate ? 'bg-green-500' : 'bg-red-500'}`} />
                )}
                <span className="leading-tight break-all text-center">v{appVersion}</span>
              </>
            ) : (
              <>
                {appVersion !== 'dev' && (
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isUpToDate ? 'bg-green-500' : 'bg-red-500'}`} />
                )}
                <span>v{appVersion}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden lg:overflow-visible">
        {/* Mobile header */}
        <div className={`lg:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between h-16 px-4 ${
          isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        } border-b`}>
          <button
            onClick={() => setSidebarOpen(true)}
            className={isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}
          >
            <Menu className="w-6 h-6" />
          </button>
          <h1 className={`text-lg font-semibold ${
            isDark ? 'text-white' : 'text-gray-900'
          }`}>
            {navigation.find(item => item.id === activeTab)?.name}
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                // Trigger the UserMenuButton click programmatically
                const userMenuButton = document.querySelector('[data-user-menu-button]') as HTMLButtonElement
                if (userMenuButton) {
                  userMenuButton.click()
                }
              }}
              className={isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}
              title="Account"
            >
              <User className="w-6 h-6" />
            </button>
            {/* Hidden AccountMenuButton for the menu functionality */}
            <div className="hidden">
              <AccountMenuButton data-user-menu-button />
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className={`flex-1 overflow-auto overscroll-contain pt-16 lg:pt-0 bg-transparent`} style={{
          height: 'calc(100dvh - 4rem)'
        }}>
          {renderContent()}
        </main>
      </div>
    </div>
  )
}