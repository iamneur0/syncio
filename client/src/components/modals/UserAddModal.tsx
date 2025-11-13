import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { getEntityColorStyles } from '@/utils/colorMapping'
import { ColorPicker } from '@/components/layout'
import StremioOAuthCard from '@/components/auth/StremioOAuthCard'
import { usersAPI } from '@/services/api'
import toast from 'react-hot-toast'

interface UserAddModalProps {
  isOpen: boolean
  onClose: () => void
  onAddUser: (userData: {
    username?: string
    email?: string
    password?: string
    authKey?: string
    groupName?: string
    groupId?: string
    newGroupName?: string
    registerNew?: boolean
    colorIndex?: number
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
  const [usernameTouched, setUsernameTouched] = useState(false)
  const [authMode, setAuthMode] = useState<'credentials' | 'oauth'>('oauth')
  // Using email/password as primary credentials, auth key as optional fallback
  const [selectedGroup, setSelectedGroup] = useState('')
  const [newGroupName, setNewGroupName] = useState('')
  const [isCreatingNewGroup, setIsCreatingNewGroup] = useState(false)
  const [stremioRegisterNew, setStremioRegisterNew] = useState(false)
  const [colorIndex, setColorIndex] = useState(0)
  const [colorIndexRef, setColorIndexRef] = useState(0)
  const trimmedAuthKey = useMemo(() => stremioAuthKey.trim(), [stremioAuthKey])
  const isOauthVerified = useMemo(() => authMode === 'oauth' && !!trimmedAuthKey, [authMode, trimmedAuthKey])

  const colorStyles = useMemo(
    () => getEntityColorStyles(theme, colorIndex),
    [theme, colorIndex]
  )

  const maybeCapitalizeFirst = useCallback((value: string) => {
    if (!value) return ''
    return value.charAt(0).toUpperCase() + value.slice(1)
  }, [])

  const getFinalGroupName = useCallback(() => {
    const selectedGroupName = selectedGroup ? (groups.find((g: any) => g.id === selectedGroup)?.name || undefined) : undefined
    return (newGroupName.trim() || selectedGroupName) || undefined
  }, [selectedGroup, newGroupName, groups])

  const handleAuthKey = useCallback(async (incomingAuthKey: string) => {
    const trimmed = incomingAuthKey.trim()
    if (!trimmed) return
    try {
      const result = await usersAPI.verifyAuthKey({
        authKey: trimmed,
        username: stremioUsername || undefined,
        email: stremioEmail || undefined,
      })

      const resolvedAuthKey = (result.authKey || trimmed || '').trim()
      const responseEmail = result.user?.email?.trim() || ''
      const responseUsername = result.user?.username?.trim() || ''
      const derivedUsername =
        responseUsername ||
        (responseEmail ? responseEmail.split('@')[0]?.trim() || '' : '')

      setStremioAuthKey(resolvedAuthKey)
      if (responseEmail) {
        setStremioEmail(responseEmail)
      }
      setStremioUsername((prev) => {
        if (usernameTouched) return prev
        if (!derivedUsername) return prev
        return maybeCapitalizeFirst(derivedUsername)
      })
      toast.success('Stremio account verified')
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || 'Failed to verify Stremio account'
      toast.error(message)
    }
  }, [maybeCapitalizeFirst, stremioEmail, usernameTouched])

  useEffect(() => {
    if (authMode === 'oauth') {
      setStremioPassword('')
      setStremioAuthKey('')
    }
  }, [authMode])

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
      setAuthMode('oauth') // Default to oauth mode for reconnection
      setStremioAuthKey('')
      setStremioRegisterNew(false) // Hide register option for reconnection
      setIsCreatingNewGroup(false)
      setUsernameTouched(true)
      
    } else {
      // Reset form when not editing
      setStremioEmail('')
      setStremioPassword('')
      setStremioAuthKey('')
      setStremioUsername('')
      setUsernameTouched(false)
      setAuthMode('oauth')
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
      setStremioAuthKey('')
      setStremioUsername('')
      setUsernameTouched(false)
      setSelectedGroup('')
      setNewGroupName('')
      setStremioRegisterNew(false)
      setAuthMode('oauth')
      setIsCreatingNewGroup(false)
    }
  }, [isOpen, editingUser])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const finalGroupName = getFinalGroupName()

    if (authMode === 'oauth') {
      const finalEmail = stremioEmail.trim()
      const finalUsernameRaw = stremioUsername.trim() || (finalEmail ? finalEmail.split('@')[0]?.trim() || '' : '')
      if (!trimmedAuthKey || !finalUsernameRaw) {
        return
      }

      const submitData: any = {
        username: finalUsernameRaw,
        authKey: trimmedAuthKey,
        groupName: finalGroupName,
        colorIndex: colorIndexRef,
      }

      if (finalEmail) {
        submitData.email = finalEmail
      }

      try {
        ;(onAddUser as any)(submitData)
      } catch (error) {
        console.error('🔍 Error calling onAddUser (oauth):', error)
      }
      return
    }

    const finalUsername = stremioUsername.trim()
    if (!finalUsername) {
      return
    }

    const submitData: any = {
      username: finalUsername,
      groupName: finalGroupName,
      colorIndex: colorIndexRef,
    }

    if (stremioAuthKey.trim()) {
      submitData.authKey = stremioAuthKey.trim()
      if (stremioEmail.trim()) {
        submitData.email = stremioEmail.trim()
      }
    } else {
      if (!stremioEmail.trim() || !stremioPassword.trim()) {
        return
      }
      submitData.email = stremioEmail.trim()
      submitData.password = stremioPassword.trim()
      submitData.registerNew = stremioRegisterNew
    }

    try {
      ;(onAddUser as any)(submitData)
    } catch (error) {
      console.error('🔍 Error calling onAddUser (credentials):', error)
    }
  }

  const handleClose = () => {
    setStremioEmail('')
    setStremioPassword('')
    setStremioAuthKey('')
    setStremioUsername('')
    setUsernameTouched(false)
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
                onChange={(e) => {
                  setUsernameTouched(true)
                  setStremioUsername(e.target.value)
                }}
                placeholder="Username *"
                required
                readOnly={!!editingUser}
                className={`text-lg font-semibold bg-transparent border-none focus:outline-none focus:ring-0 p-0 m-0 ${
                  editingUser ? 'cursor-not-allowed opacity-80 color-text-secondary' : 'color-text'
                }`}
              />
              <span className="text-sm color-text-secondary">
                {authMode === 'credentials'
                  ? stremioAuthKey.trim()
                    ? 'Provide Stremio Auth Key'
                    : (stremioEmail.trim() || 'Provide credentials below')
                  : (
                    stremioEmail.trim()
                      ? stremioEmail.trim()
                      : (isOauthVerified
                          ? `Account of ${stremioUsername || 'Stremio user'} verified`
                          : 'Authenticate with Stremio OAuth')
                  )}
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
                onClick={() => {
                  setAuthMode('credentials')
                  setStremioAuthKey('')
                }}
                className={`w-full py-3 px-4 rounded-lg cursor-pointer card card-selectable color-hover hover:shadow-lg transition-all ${
                  authMode === 'credentials' ? 'card-selected' : ''
                }`}
              >
                <span className="text-sm font-medium">Credentials</span>
              </button>
            </div>
          </div>
          {authMode === 'credentials' ? (
            <>
              <div>
                <input
                  type="email"
                  value={stremioEmail}
                  onChange={(e) => {
                    const value = e.target.value
                    setStremioEmail(value)
                    if (!editingUser && !usernameTouched) {
                      const localPart = value.split('@')[0]?.trim() || ''
                      setStremioUsername(localPart ? maybeCapitalizeFirst(localPart) : '')
                    }
                  }}
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
                  className="w-full px-3 py-2 border rounded-lg focus-outline-none input"
                />
              </div>
              <div className="flex items-center justify-center text-xs uppercase color-text-secondary">
                <span className="h-px flex-1 bg-color-border" />
                <span className="px-2">or</span>
                <span className="h-px flex-1 bg-color-border" />
              </div>
              <div>
                <input
                  type="text"
                  value={stremioAuthKey}
                  onChange={(e) => setStremioAuthKey(e.target.value)}
                  placeholder="Stremio Auth Key"
                  className="w-full px-3 py-2 border rounded-lg focus-outline-none input"
                />
              </div>
            </>
          ) : (
            <>
              <StremioOAuthCard
                active={authMode === 'oauth'}
                onAuthKey={handleAuthKey}
                disabled={isCreating || (isOauthVerified && !!trimmedAuthKey)}
                startButtonLabel={
                  isOauthVerified
                    ? `Account of ${stremioUsername || 'Stremio user'} verified`
                    : 'Sign in with Stremio'
                }
                authorizeLabel="Authorize Syncio"
              />
            </>
          )}

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
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none input"
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
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none input mt-2"
                    autoFocus
                  />
                )}
              </div>
              {authMode === 'credentials' && !stremioAuthKey.trim() && (
                <div className="flex items-center gap-2">
                  <input
                    id="stremio-register-new"
                    type="checkbox"
                    checked={stremioRegisterNew}
                    onChange={(e) => setStremioRegisterNew(e.target.checked)}
                    className="control-radio"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <label
                    htmlFor="stremio-register-new"
                    className="text-sm cursor-pointer"
                    onClick={() => setStremioRegisterNew(!stremioRegisterNew)}
                  >
                    Register
                  </label>
                </div>
              )}
            </>
          )}

          <div className={`flex gap-3 pt-4`}>
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-2 rounded-lg transition-colors color-text-secondary color-hover"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating || (authMode === 'oauth' && !isOauthVerified)}
              className="flex-1 px-4 py-2 color-surface rounded-lg transition-colors disabled:opacity-50"
            >
              {isCreating
                ? (authMode === 'oauth'
                    ? 'Connecting...'
                    : (stremioAuthKey.trim()
                        ? (editingUser ? 'Reconnecting...' : 'Connecting...')
                        : (stremioRegisterNew ? 'Registering...' : (editingUser ? 'Reconnecting...' : 'Adding...'))))
                : (authMode === 'oauth'
                    ? (editingUser ? 'Reconnect User' : 'Add User')
                    : (stremioAuthKey.trim()
                        ? (editingUser ? 'Reconnect User' : 'Connect User')
                        : (stremioRegisterNew ? 'Register & Connect' : (editingUser ? 'Reconnect User' : 'Add User'))))}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}
