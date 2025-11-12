import React, { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { getEntityColorStyles } from '@/utils/colorMapping'
import { ColorPicker } from '@/components/layout'

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
  // For editing existing users
  editingUser?: {
    id: string
    username: string
    email: string
    groupId?: string
    colorIndex: number
  }
}

export default function UserAddModal({ 
  isOpen, 
  onClose, 
  onAddUser, 
  isCreating,
  groups = [],
  editingUser
}: UserAddModalProps) {
  const { theme } = useTheme()
  const logoRef = useRef<HTMLDivElement>(null)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [stremioEmail, setStremioEmail] = useState('')
  const [stremioPassword, setStremioPassword] = useState('')
  const [stremioUsername, setStremioUsername] = useState('')
  const [authMode, setAuthMode] = useState<'email' | 'authkey'>('email')
  const [selectedGroup, setSelectedGroup] = useState('')
  const [newGroupName, setNewGroupName] = useState('')
  const [isCreatingNewGroup, setIsCreatingNewGroup] = useState(false)
  const [stremioRegisterNew, setStremioRegisterNew] = useState(false)
  const [colorIndex, setColorIndex] = useState(0)
  const [colorIndexRef, setColorIndexRef] = useState(0)
  const colorStyles = useMemo(
    () => getEntityColorStyles(theme, colorIndex),
    [theme, colorIndex]
  )

  useEffect(() => {
    setMounted(true)
  }, [])

  // Populate form when editing a user
  useEffect(() => {
    if (editingUser) {
      setStremioUsername(editingUser.username || '')
      setStremioEmail(editingUser.email || '')
      setSelectedGroup(editingUser.groupId || '')
      setColorIndex(editingUser.colorIndex || 0)
      setColorIndexRef(editingUser.colorIndex || 0)
      setAuthMode('authkey') // Default to authkey mode for reconnection
      setStremioRegisterNew(false) // Hide register option for reconnection
      setIsCreatingNewGroup(false)
      
    } else {
      // Reset form when not editing
      setStremioEmail('')
      setStremioPassword('')
      setStremioUsername('')
      setAuthMode('email')
      setSelectedGroup('')
      setNewGroupName('')
      setStremioRegisterNew(false)
      setColorIndex(0)
      setColorIndexRef(0)
      setIsCreatingNewGroup(false)
    }
  }, [editingUser])

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
  // But only if we're not editing a user (editingUser is null)
  useEffect(() => {
    if (isOpen && !editingUser) {
      setStremioEmail('')
      setStremioPassword('')
      setStremioUsername('')
      setSelectedGroup('')
      setNewGroupName('')
      setStremioRegisterNew(false)
      setAuthMode('email')
      setIsCreatingNewGroup(false)
    }
  }, [isOpen, editingUser])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    
    if (!stremioUsername.trim() || !stremioPassword.trim()) {
      return
    }

    // Backend expects groupName (optional). Prefer newGroupName; otherwise map selectedGroup id to its name.
    const selectedGroupName = selectedGroup ? (groups.find((g: any) => g.id === selectedGroup)?.name || undefined) : undefined
    const finalGroupName = (newGroupName.trim() || selectedGroupName) || undefined

    const submitData = {
      username: stremioUsername.trim(),
      email: authMode === 'email' ? stremioEmail.trim() : stremioUsername.trim() + '@stremio.local',
      password: stremioPassword.trim(),
      groupName: finalGroupName,
      colorIndex: colorIndexRef,
    }

    
    // Single call including groupName so backend assigns user to group
    try {
      ;(onAddUser as any)(submitData)
    } catch (error) {
      console.error('🔍 Error calling onAddUser:', error)
    }
  }

  const handleClose = () => {
    setStremioEmail('')
    setStremioPassword('')
    setStremioUsername('')
    setSelectedGroup('')
    setNewGroupName('')
    setStremioRegisterNew(false)
    setIsCreatingNewGroup(false)
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
      <div className={`w-full max-w-md rounded-lg shadow-lg card`}>
        <div className="flex items-center justify-between p-6 border-b color-border">
          <div className="flex items-center gap-4 relative">
            <div
              ref={logoRef}
              onClick={() => setShowColorPicker((prev) => !prev)}
              className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 cursor-pointer transition-all hover:scale-105"
              style={{
                background: colorStyles.background,
                color: colorStyles.textColor,
              }}
              title="Click to change color"
            >
              <span className="font-semibold text-lg" style={{ color: colorStyles.textColor }}>
                {(stremioUsername || 'User').charAt(0).toUpperCase()}
              </span>
            </div>
            <ColorPicker
              currentColorIndex={colorIndex}
              onColorChange={(next) => {
                setColorIndex(next)
                setColorIndexRef(next)
                setShowColorPicker(false)
              }}
              isOpen={showColorPicker}
              onClose={() => setShowColorPicker(false)}
              triggerRef={logoRef}
            />
            <div className="flex flex-col">
              <label className="sr-only" htmlFor="stremio-username-input">
                Stremio Username
              </label>
              <input
                id="stremio-username-input"
                type="text"
                value={stremioUsername}
                onChange={(e) => setStremioUsername(e.target.value)}
                placeholder="Username *"
                required
                readOnly={!!editingUser}
                className={`text-lg font-semibold bg-transparent border-none focus:outline-none focus:ring-0 p-0 m-0 ${
                  editingUser ? 'cursor-not-allowed opacity-80 color-text-secondary' : 'color-text'
                }`}
              />
              <span className="text-sm color-text-secondary">
                {authMode === 'email'
                  ? (stremioEmail.trim() || 'Provide credentials below')
                  : 'Authenticate with an Auth Key'}
              </span>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center rounded transition-colors border-0 focus:outline-none ring-0 focus:ring-0 color-text-secondary color-hover"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Auth method toggle */}
          <div className="w-full">
            <div className="grid grid-cols-2 gap-2 w-full">
              <button
                type="button"
                onClick={() => setAuthMode('email')}
                className={`w-full py-3 px-4 rounded-lg cursor-pointer card card-selectable color-hover hover:shadow-lg transition-all ${
                  authMode === 'email' ? 'card-selected' : ''
                }`}
              >
                <span className="text-sm font-medium">Email & Password</span>
              </button>
              <button
                type="button"
                onClick={() => setAuthMode('authkey')}
                className={`w-full py-3 px-4 rounded-lg cursor-pointer card card-selectable color-hover hover:shadow-lg transition-all ${
                  authMode === 'authkey' ? 'card-selected' : ''
                }`}
              >
                <span className="text-sm font-medium">Auth Key</span>
              </button>
            </div>
          </div>
          {authMode === 'email' ? (
            <>
          <div>
            <input
              type="email"
              value={stremioEmail}
              onChange={(e) => setStremioEmail(e.target.value)}
              placeholder="Email"
              required
              readOnly={!!editingUser}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none ${editingUser ? 'input cursor-not-allowed opacity-80' : 'input'}`}
            />
          </div>
          <div>
            <input
              type="password"
              value={stremioPassword}
              onChange={(e) => setStremioPassword(e.target.value)}
              placeholder="Password"
              required
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none input`}
            />
          </div>
          {!editingUser && (
            <>
              <div>
                <select
                  value={isCreatingNewGroup ? '__create_new__' : selectedGroup}
                  onChange={(e) => {
                    if (e.target.value === '__create_new__') {
                      setIsCreatingNewGroup(true)
                      setSelectedGroup('')
                      setNewGroupName('')
                    } else {
                      setIsCreatingNewGroup(false)
                      setSelectedGroup(e.target.value)
                      setNewGroupName('')
                    }
                  }}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none input`}
                >
                  <option value="">Group (optional)</option>
                  {groups?.map((group: any) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                  <option value="__create_new__">+ Create new group...</option>
                </select>
                {isCreatingNewGroup && (
                  <input
                    type="text"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="Enter new group name"
                    className={`w-full px-3 py-2 border rounded-lg focus:outline-none input mt-2`}
                    autoFocus
                  />
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="stremio-register-new"
                  type="checkbox"
                  checked={stremioRegisterNew}
                  onChange={(e) => setStremioRegisterNew(e.target.checked)}
                  className="control-radio"
                  onClick={(e) => e.stopPropagation()}
                />
                <label htmlFor="stremio-register-new" className={`text-sm cursor-pointer`} onClick={() => setStremioRegisterNew(!stremioRegisterNew)}>
                  Register
                </label>
              </div>
            </>
          )}
            </>
          ) : (
            <div>
              <input
                type="text"
                value={stremioPassword}
                onChange={(e) => setStremioPassword(e.target.value)}
                placeholder="Auth Key"
                required
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none input`}
              />
            </div>
          )}
            
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={handleClose}
                className={`flex-1 px-4 py-2 rounded-lg transition-colors color-text-secondary color-hover`}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCreating}
                onClick={() => {}}
                className="flex-1 px-4 py-2 color-surface rounded-lg transition-colors disabled:opacity-50"
              >
                {isCreating ? (stremioRegisterNew ? 'Registering...' : (editingUser ? 'Reconnecting...' : 'Adding...')) : (stremioRegisterNew ? 'Register & Connect' : (editingUser ? 'Reconnect User' : 'Add User'))}
              </button>
            </div>
        </form>
      </div>
    </div>,
    document.body
  )
}
