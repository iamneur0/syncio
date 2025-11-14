import React, { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { getEntityColorStyles } from '@/utils/colorMapping'
import { ColorPicker } from '@/components/layout'
import { StremioOAuthCard } from '@/components/auth/StremioOAuthCard'
import { usersAPI } from '@/services/api'

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
  const [stremioAuthKey, setStremioAuthKey] = useState('')
  const [stremioUsername, setStremioUsername] = useState('')
  const [authMode, setAuthMode] = useState<'oauth' | 'credentials'>('oauth')
  const [oauthAuthKey, setOauthAuthKey] = useState<string | null>(null)
  const [oauthVerified, setOauthVerified] = useState(false)
  const [isVerifyingOAuth, setIsVerifyingOAuth] = useState(false)
  const [usernameManuallyEdited, setUsernameManuallyEdited] = useState(false)
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
      setAuthMode('credentials') // Default to credentials mode for reconnection
      setStremioRegisterNew(false) // Hide register option for reconnection
      setIsCreatingNewGroup(false)
      setOauthAuthKey(null)
      setOauthVerified(false)
      setUsernameManuallyEdited(false)
      
    } else {
      // Reset form when not editing
      setStremioEmail('')
      setStremioPassword('')
      setStremioAuthKey('')
      setStremioUsername('')
      setAuthMode('oauth')
      setSelectedGroup('')
      setNewGroupName('')
      setStremioRegisterNew(false)
      setColorIndex(0)
      setColorIndexRef(0)
      setIsCreatingNewGroup(false)
      setOauthAuthKey(null)
      setOauthVerified(false)
      setUsernameManuallyEdited(false)
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
      setStremioAuthKey('')
      setStremioUsername('')
      setSelectedGroup('')
      setNewGroupName('')
      setStremioRegisterNew(false)
      setAuthMode('oauth')
      setIsCreatingNewGroup(false)
      setOauthAuthKey(null)
      setOauthVerified(false)
      setUsernameManuallyEdited(false)
    }
  }, [isOpen, editingUser])

  const handleOAuthAuthKey = async (authKey: string) => {
    try {
      setIsVerifyingOAuth(true)
      setOauthAuthKey(authKey)
      
      // Verify the auth key and get user info
      const verification = await usersAPI.verifyAuthKey({ authKey })
      
      if (verification?.user) {
        const verifiedUser = verification.user
        const email = verifiedUser.email || ''
        const username = verifiedUser.username || email.split('@')[0] || ''
        
        // Only auto-fill if username hasn't been manually edited
        if (!usernameManuallyEdited) {
          // Capitalize first letter if auto-filling
          const capitalizedUsername = username.charAt(0).toUpperCase() + username.slice(1)
          setStremioUsername(capitalizedUsername)
        }
        
        setStremioEmail(email)
        setOauthVerified(true)
      }
    } catch (error: any) {
      console.error('OAuth verification error:', error)
      setOauthAuthKey(null)
      setOauthVerified(false)
    } finally {
      setIsVerifyingOAuth(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    // For OAuth mode, we need the authKey
    if (authMode === 'oauth') {
      if (!oauthAuthKey || !stremioUsername.trim()) {
        return
      }
      
      // Backend expects groupName (optional). Prefer newGroupName; otherwise map selectedGroup id to its name.
      const selectedGroupName = selectedGroup ? (groups.find((g: any) => g.id === selectedGroup)?.name || undefined) : undefined
      const finalGroupName = (newGroupName.trim() || selectedGroupName) || undefined

      const submitData = {
        authKey: oauthAuthKey,
        username: stremioUsername.trim(),
        email: stremioEmail.trim(),
        groupName: finalGroupName,
        colorIndex: colorIndexRef,
      }

      try {
        ;(onAddUser as any)(submitData)
      } catch (error) {
        console.error('🔍 Error calling onAddUser:', error)
      }
      return
    }
    
    // For credentials mode - check if using email/password or auth key
    const hasAuthKey = stremioAuthKey.trim().length > 0
    const hasEmailPassword = stremioEmail.trim().length > 0 && stremioPassword.trim().length > 0
    
    if (!stremioUsername.trim() || (!hasAuthKey && !hasEmailPassword)) {
      return
    }

    // Backend expects groupName (optional). Prefer newGroupName; otherwise map selectedGroup id to its name.
    const selectedGroupName = selectedGroup ? (groups.find((g: any) => g.id === selectedGroup)?.name || undefined) : undefined
    const finalGroupName = (newGroupName.trim() || selectedGroupName) || undefined

    const submitData: any = {
      username: stremioUsername.trim(),
      groupName: finalGroupName,
      colorIndex: colorIndexRef,
    }
    
    if (hasAuthKey) {
      submitData.authKey = stremioAuthKey.trim()
      submitData.email = stremioEmail.trim() || stremioUsername.trim() + '@stremio.local'
    } else {
      submitData.email = stremioEmail.trim()
      submitData.password = stremioPassword.trim()
    }

    try {
      ;(onAddUser as any)(submitData)
    } catch (error) {
      console.error('🔍 Error calling onAddUser:', error)
    }
  }

  const handleClose = () => {
    setStremioEmail('')
    setStremioPassword('')
    setStremioAuthKey('')
    setStremioUsername('')
    setSelectedGroup('')
    setNewGroupName('')
    setStremioRegisterNew(false)
    setIsCreatingNewGroup(false)
    setOauthAuthKey(null)
    setOauthVerified(false)
    setUsernameManuallyEdited(false)
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
      <div 
        className={`w-full max-w-md rounded-lg shadow-lg card`}
        style={{ background: 'var(--color-background)' }}
      >
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
                onChange={(e) => {
                  setStremioUsername(e.target.value)
                  setUsernameManuallyEdited(true)
                }}
                placeholder="Username *"
                required
                readOnly={!!editingUser}
                className={`text-lg font-semibold bg-transparent border-none focus:outline-none focus:ring-0 p-0 m-0 ${
                  editingUser ? 'cursor-not-allowed opacity-80 color-text-secondary' : 'color-text'
                }`}
              />
              <span className="text-sm color-text-secondary">
                {authMode === 'oauth'
                  ? (oauthVerified ? (stremioEmail.trim() || 'user') : (stremioEmail.trim() || 'Authenticate with Stremio OAuth'))
                  : authMode === 'credentials'
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
                onClick={() => setAuthMode('oauth')}
                className={`w-full py-3 px-4 rounded-lg cursor-pointer card card-selectable color-hover hover:shadow-lg transition-all ${
                  authMode === 'oauth' ? 'card-selected' : ''
                }`}
              >
                <span className="text-sm font-medium">Stremio OAuth</span>
              </button>
              <button
                type="button"
                onClick={() => setAuthMode('credentials')}
                className={`w-full py-3 px-4 rounded-lg cursor-pointer card card-selectable color-hover hover:shadow-lg transition-all ${
                  authMode === 'credentials' ? 'card-selected' : ''
                }`}
              >
                <span className="text-sm font-medium">Credentials</span>
              </button>
            </div>
          </div>
          {authMode === 'oauth' ? (
            <>
              <div className={oauthVerified ? 'hidden' : ''}>
                <StremioOAuthCard
                  active={authMode === 'oauth' && !oauthVerified}
                  autoStart={true}
                  onAuthKey={handleOAuthAuthKey}
                  disabled={isCreating || isVerifyingOAuth}
                  showSubmitButton={false}
                />
              </div>
            </>
          ) : authMode === 'credentials' ? (
            <>
          <div>
            <input
              type="email"
              value={stremioEmail}
              onChange={(e) => setStremioEmail(e.target.value)}
              placeholder="Email"
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
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none input`}
            />
          </div>
          <div className="text-center text-sm color-text-secondary">or</div>
          <div>
            <input
              type="text"
              value={stremioAuthKey}
              onChange={(e) => setStremioAuthKey(e.target.value)}
              placeholder="Stremio Auth Key"
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
          ) : null}
            
            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={handleClose}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors color-text-secondary color-hover`}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCreating || isVerifyingOAuth || (authMode === 'oauth' && (!oauthAuthKey || !oauthVerified))}
                onClick={() => {}}
                className="px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 color-surface hover:opacity-90"
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
