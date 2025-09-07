'use client'

import { useState } from 'react'
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

// Import page components
import AddonsPage from '@/components/pages/AddonsPage'
import StremioUsersPage from '@/components/pages/StremioUsersPage'
import GroupsPage from '@/components/pages/GroupsPage'
import SettingsPage from '@/components/pages/SettingsPage'

const navigation = [
  { name: 'Addons', icon: Puzzle, id: 'addons' },
  { name: 'Users', icon: User, id: 'users' },
  { name: 'Groups', icon: Users, id: 'groups' },
  { name: 'Settings', icon: Settings, id: 'settings' },
]

export default function HomePage() {
  const [activeTab, setActiveTab] = useState('addons')
  // Force remount of a page component when its tab is clicked to refresh queries/status
  const [tabKeys, setTabKeys] = useState<{ [key: string]: number }>({ addons: 0, users: 0, groups: 0, settings: 0 })
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const { theme, toggleTheme, isDark } = useTheme()

  const activateTab = (id: string, closeSidebar?: boolean) => {
    setActiveTab(id)
    setTabKeys(prev => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }))
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('sfm:tab:activated' as any, { detail: { id } }))
      } catch {}
    }
    if (closeSidebar) setSidebarOpen(false)
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'addons':
        return <AddonsPage key={`addons-${tabKeys.addons}`} />
      case 'users':
        return <StremioUsersPage key={`users-${tabKeys.users}`} />
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
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div className={`h-screen flex ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
      {/* Mobile sidebar */}
      <div className={`fixed inset-0 z-40 lg:hidden ${sidebarOpen ? '' : 'pointer-events-none'}`}>
        <div className={`fixed inset-0 bg-gray-600 transition-opacity ${sidebarOpen ? 'opacity-75' : 'opacity-0'}`} onClick={() => setSidebarOpen(false)} />
        <div className={`fixed inset-y-0 left-0 flex flex-col w-72 ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-xl transform transition-transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="flex items-center justify-between h-16 px-4 bg-stremio-purple">
            <div className="flex items-center gap-3">
              <img 
                src="/favicon-32x32.png" 
                alt="Syncio Logo" 
                className="w-8 h-8"
                onError={(e) => {
                  // Fallback to text if image fails to load
                  e.currentTarget.style.display = 'none'
                }}
              />
              <h1 className="text-xl font-bold text-white">Syncio</h1>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="text-white hover:text-gray-200 p-1">
              <X className="w-6 h-6" />
            </button>
          </div>
          <nav className="flex-1 px-3 py-4 space-y-2">
            {navigation.map((item) => (
              <button
                key={item.id}
                onClick={() => activateTab(item.id, true)}
                className={`w-full flex items-center px-4 py-4 text-left rounded-lg transition-colors font-medium ${
                  activeTab === item.id
                    ? 'bg-stremio-purple text-white shadow-lg'
                    : isDark 
                      ? 'text-gray-300 hover:bg-gray-700' 
                      : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <item.icon className="w-5 h-5 mr-3 flex-shrink-0" />
                <span className="text-sm font-medium">{item.name}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className={`hidden lg:flex lg:flex-col transition-all duration-300 ${sidebarCollapsed ? 'lg:w-16' : 'lg:w-64'} ${isDark ? 'lg:bg-gray-800' : 'lg:bg-white'} lg:border-r ${isDark ? 'lg:border-gray-700' : 'lg:border-gray-200'}`}>
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className={`w-full flex items-center justify-center h-16 px-4 bg-stremio-purple hover:bg-purple-600 transition-colors relative`}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <div className="flex items-center justify-center w-8 h-8 flex-shrink-0 absolute left-4 top-1/2 transform -translate-y-1/2">
            <img 
              src="/favicon-32x32.png" 
              alt="Syncio Logo" 
              className="w-8 h-8"
              onError={(e) => {
                // Fallback to text if image fails to load
                e.currentTarget.style.display = 'none'
              }}
            />
          </div>
          {!sidebarCollapsed && <h1 className="text-xl font-bold text-white absolute left-20 top-1/2 transform -translate-y-1/2">Syncio</h1>}
        </button>
        <nav className="flex-1 px-3 py-4 space-y-2">
          {navigation.map((item) => (
            <button
              key={item.id}
              onClick={() => activateTab(item.id)}
              className={`w-full flex items-center py-5 pl-4 pr-6 text-left rounded-lg transition-colors relative font-medium ${
                activeTab === item.id
                  ? 'bg-stremio-purple text-white shadow-lg'
                  : isDark 
                    ? 'text-gray-300 hover:bg-gray-700' 
                    : 'text-gray-700 hover:bg-gray-100'
              }`}
              title={sidebarCollapsed ? item.name : ''}
            >
              <div className="flex items-center justify-center w-8 h-8 flex-shrink-0 absolute left-1 top-1/2 transform -translate-y-1/2">
                <item.icon className="w-5 h-5" />
              </div>
              {!sidebarCollapsed && <span className="absolute left-11 top-1/2 transform -translate-y-1/2 text-sm font-medium">{item.name}</span>}
            </button>
          ))}
        </nav>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header */}
        <div className={`lg:hidden flex items-center justify-between h-16 px-4 ${isDark ? 'bg-gray-800' : 'bg-white'} border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
          <button
            onClick={() => setSidebarOpen(true)}
            className={`${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Menu className="w-6 h-6" />
          </button>
          <h1 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            {navigation.find(item => item.id === activeTab)?.name}
          </h1>
          <div className="w-6 h-6"></div>
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {renderContent()}
        </main>
      </div>
    </div>
    </div>
  )
}