'use client'

import React from 'react'
import { LogOut } from 'lucide-react'
import toast from 'react-hot-toast'

type Props = {
  className?: string
}

export default function UserLogoutButton({ className = '' }: Props) {
  const [showMenu, setShowMenu] = React.useState(false)
  const wrapperRef = React.useRef<HTMLDivElement | null>(null)

  // Close menu on click outside
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Close on Escape
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowMenu(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const handleLogout = () => {
    setShowMenu(false)
    // Clear user-specific localStorage items
    if (typeof window !== 'undefined') {
      localStorage.removeItem('stremio_auth_key')
      localStorage.removeItem('syncio_user_info')
      localStorage.removeItem('user-activity-view-type')
      localStorage.removeItem('user-activity-view-mode')
      localStorage.removeItem('user-addons-view-mode')
    }
    toast.success('Logged out successfully')
    // Redirect to login page
    window.location.href = '/'
  }

  const btnClasses = `h-10 px-3 rounded-lg flex items-center justify-center focus:outline-none focus:ring-0 color-surface color-hover ${className}`

  return (
    <div className="relative z-[10]" ref={wrapperRef}>
      <button className={btnClasses} onClick={() => setShowMenu((s) => !s)} title="Account">
        <LogOut size={18} />
      </button>
      {showMenu && (
        <div className="absolute right-0 mt-2 w-48 rounded-xl shadow-xl p-2 text-sm border z-[400] card">
          <button
            onClick={handleLogout}
            className="color-surface color-hover color-text w-full text-center px-3 py-2 rounded flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      )}
    </div>
  )
}



