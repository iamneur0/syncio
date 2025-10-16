import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { getColorHexValue, getThemePalette } from '@/utils/colorMapping'

interface UserAddModalProps {
  isOpen: boolean
  onClose: () => void
  onAddUser: (userData: {
    username: string
    email: string
    password: string
    groupId?: string
    newGroupName?: string
    registerNew: boolean
    colorIndex: number
  }) => void
  isCreating: boolean
  groups?: any[]
}

export default function UserAddModal({ 
  isOpen, 
  onClose, 
  onAddUser, 
  isCreating,
  groups = []
}: UserAddModalProps) {
  const { isDark, isMono } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [stremioEmail, setStremioEmail] = useState('')
  const [stremioPassword, setStremioPassword] = useState('')
  const [stremioUsername, setStremioUsername] = useState('')
  const [authMode, setAuthMode] = useState<'email' | 'authkey'>('email')
  const [selectedGroup, setSelectedGroup] = useState('')
  const [newGroupName, setNewGroupName] = useState('')
  const [stremioRegisterNew, setStremioRegisterNew] = useState(false)
  const [colorIndex, setColorIndex] = useState(0)
  const [colorIndexRef, setColorIndexRef] = useState(0)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        e.preventDefault()
        handleClose()
      }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true } as any)
  }, [isOpen])

  // Reset form fields whenever the modal is opened, to avoid stale values on reopen
  useEffect(() => {
    if (isOpen) {
      setStremioEmail('')
      setStremioPassword('')
      setStremioUsername('')
      setSelectedGroup('')
      setNewGroupName('')
      setStremioRegisterNew(false)
      setAuthMode('email')
    }
  }, [isOpen])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!stremioUsername.trim() || !stremioPassword.trim()) {
      return
    }

    // Backend expects groupName (optional). Prefer newGroupName; otherwise map selectedGroup id to its name.
    const selectedGroupName = selectedGroup ? (groups.find((g: any) => g.id === selectedGroup)?.name || undefined) : undefined
    const finalGroupName = (newGroupName.trim() || selectedGroupName) || undefined

    // Single call including groupName so backend assigns user to group
    ;(onAddUser as any)({
      username: stremioUsername.trim(),
      email: authMode === 'email' ? stremioEmail.trim() : stremioUsername.trim() + '@stremio.local',
      password: stremioPassword.trim(),
      groupName: finalGroupName,
      colorIndex: colorIndexRef,
    })
  }

  const handleClose = () => {
    setStremioEmail('')
    setStremioPassword('')
    setStremioUsername('')
    setSelectedGroup('')
    setNewGroupName('')
    setStremioRegisterNew(false)
    onClose()
  }

  if (!isOpen) return null

  if (!mounted || typeof window === 'undefined' || !document.body) {
    return null
  }

  return createPortal(
    <div 
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-[1000]"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose()
        }
      }}
    >
      <div className={`w-full max-w-md rounded-lg shadow-lg ${
        isDark ? 'bg-gray-800' : 'bg-white'
      }`}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Add New User
          </h3>
          <button
            onClick={handleClose}
            className={`w-8 h-8 flex items-center justify-center rounded transition-colors border-0 focus:outline-none ring-0 focus:ring-0 ${
              isMono ? 'text-white hover:text-white/80 hover:bg-white/10' : (isDark ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100')
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Auth method toggle */}
          <div className="w-full mb-2 flex justify-center">
            <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
              <button
                type="button"
                onClick={() => setAuthMode('email')}
                className={`w-full py-2 text-sm font-medium rounded-md border ${authMode==='email' ? 'accent-bg accent-text accent-border' : (isDark ? 'text-gray-300 border-gray-600' : 'text-gray-700 border-gray-300')}`}
              >
                Email & Password
              </button>
              <button
                type="button"
                onClick={() => setAuthMode('authkey')}
                className={`w-full py-2 text-sm font-medium rounded-md border ${authMode==='authkey' ? 'accent-bg accent-text accent-border' : (isDark ? 'text-gray-300 border-gray-600' : 'text-gray-700 border-gray-300')}`}
              >
                Auth Key
              </button>
            </div>
          </div>
          <div>
            <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Username *
            </label>
            <input
              type="text"
              value={stremioUsername}
              onChange={(e) => setStremioUsername(e.target.value)}
              placeholder="Enter username"
              required
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none ${
                isDark 
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              }`}
            />
          </div>
          {authMode === 'email' ? (
            <>
          <div>
            <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Stremio Email *
            </label>
            <input
              type="email"
              value={stremioEmail}
              onChange={(e) => setStremioEmail(e.target.value)}
              placeholder="your@stremio-email.com"
              required
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none ${
                isDark 
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              }`}
            />
          </div>
          <div>
            <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Stremio Password *
            </label>
            <input
              type="password"
              value={stremioPassword}
              onChange={(e) => setStremioPassword(e.target.value)}
              placeholder="Enter your Stremio password"
              required
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none ${
                isDark 
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              }`}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="stremio-register-new"
              type="checkbox"
              checked={stremioRegisterNew}
              onChange={(e) => setStremioRegisterNew(e.target.checked)}
              className={`h-4 w-4 rounded border ${isDark ? 'border-gray-600 bg-gray-700' : 'border-gray-300'} accent-text focus:ring-0`}
            />
            <label htmlFor="stremio-register-new" className={`${isDark ? 'text-gray-300' : 'text-gray-700'} text-sm`}>
              Register new Stremio account with these credentials
            </label>
          </div>
            </>
          ) : (
            <div>
              <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                Stremio Auth Key *
              </label>
              <input
                type="text"
                value={stremioPassword}
                onChange={(e) => setStremioPassword(e.target.value)}
                placeholder="Enter your Stremio auth key"
                required
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none ${
                  isDark 
                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                }`}
              />
            </div>
          )}
            <div>
              <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
            Assign to group (optional)
              </label>
            <div className="space-y-2">
                <select
                  value={selectedGroup}
                  onChange={(e) => setSelectedGroup(e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none ${
                    isDark 
                      ? 'bg-gray-700 border-gray-600 text-white' 
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                >
                <option value="">Select a group (optional)</option>
                {groups?.map((group: any) => (
                  <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              <div className="text-center text-sm text-gray-500">or</div>
                  <input
                    type="text"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Create new group"
                    className={`w-full px-3 py-2 border rounded-lg focus:outline-none ${
                      isDark 
                        ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                    }`}
                  />
                </div>
            </div>
            
            {/* Color Selection */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                User Color
              </label>
            <div className="grid grid-cols-5 gap-2">
              {getThemePalette(isMono ? 'mono' : isDark ? 'dark' : 'light').map((colorOption, index) => {
                const actualColorIndex = index
                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() => {
                      setColorIndex(actualColorIndex)
                      setColorIndexRef(actualColorIndex)
                    }}
                    aria-pressed={colorIndex === actualColorIndex}
                    className={`relative w-8 h-8 rounded-full border-2 transition ${colorIndex === actualColorIndex ? 'border-white ring-2 ring-offset-2 ring-stremio-purple' : 'border-gray-300'}`}
                    style={{
                      backgroundColor: colorOption.hexValue
                    }}
                  >
                    {colorIndex === actualColorIndex && (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="white" className="w-4 h-4">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            </div>
            
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={handleClose}
                className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                  isDark 
                    ? 'text-gray-300 hover:text-white hover:bg-gray-700' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCreating}
                className="flex-1 px-4 py-2 accent-bg accent-text rounded-lg transition-colors disabled:opacity-50"
              >
                {isCreating ? (stremioRegisterNew ? 'Registering...' : 'Adding...') : (stremioRegisterNew ? 'Register & Connect' : 'Add User')}
              </button>
            </div>
        </form>
      </div>
    </div>,
    document.body
  )
}
