'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/contexts/ThemeContext'
import { publicAuthAPI, publicLibraryAPI } from '@/services/api'
import StremioOAuthCard from './StremioOAuthCard'
import { Eye, EyeOff, LogIn, User, Lock, Settings, Users } from 'lucide-react'
import Image from 'next/image'
import toast from 'react-hot-toast'
import { ConfirmDialog } from '@/components/modals'

type LoginMode = 'admin' | 'user'

interface LoginPageProps {
  onAdminLogin?: () => void
  onUserLogin?: (userId: string, authKey: string, userInfo: any) => void
  isPrivateAuth?: boolean
  initialMode?: LoginMode // If set, use as initial mode but still show toggle
}

export default function LoginPage({ 
  onAdminLogin, 
  onUserLogin,
  isPrivateAuth = false,
  initialMode
}: LoginPageProps) {
  const { isDark } = useTheme()
  const router = useRouter()
  const AUTH_ENABLED = process.env.NEXT_PUBLIC_AUTH_ENABLED === 'true'
  const [detectedPrivateAuth, setDetectedPrivateAuth] = useState<boolean | null>(null)
  const [hasPrivateAuthCredentials, setHasPrivateAuthCredentials] = useState<boolean | null>(null)
  const [mode, setMode] = useState<LoginMode>(initialMode || 'user')
  const [uuid, setUuid] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [isRegisterMode, setIsRegisterMode] = useState(false)
  const [showUuidNotice, setShowUuidNotice] = useState(false)
  const [showStremioLogin, setShowStremioLogin] = useState(false)

  // Detect mode: Public, Private (no auth), Private (with auth)
  // AUTH_ENABLED=true → Public
  // AUTH_ENABLED=false + SYNCIO_PRIVATE_USERNAME + SYNCIO_PRIVATE_PASSWORD → Private with auth
  // AUTH_ENABLED=false → Private with no auth
  useEffect(() => {
    ;(async () => {
      if (AUTH_ENABLED) {
        // Public mode
        setDetectedPrivateAuth(false)
        setHasPrivateAuthCredentials(false)
      } else {
        // Private instance - check if auth is required
        setDetectedPrivateAuth(true)
        try {
          const meResponse = await publicAuthAPI.me()
          // If /me returns "Auth disabled" → Private with no auth
          // Otherwise → Private with auth (credentials configured)
          setHasPrivateAuthCredentials(meResponse?.message !== 'Auth disabled')
        } catch (err: any) {
          // 401 means Private with auth (not logged in)
          // Other errors fallback to no auth
          setHasPrivateAuthCredentials(err?.response?.status === 401)
        }
      }
    })()
  }, [AUTH_ENABLED])

  // Use detected private auth if not explicitly provided
  // Wait for detection to complete before rendering (avoid flash of wrong form)
  const isPrivateMode = isPrivateAuth !== false 
    ? isPrivateAuth 
    : (detectedPrivateAuth === true)
  
  // Check if private mode has credentials configured
  const privateModeHasCredentials = hasPrivateAuthCredentials === true
  
  // Don't render admin form until we know the mode (avoid flash of wrong form)
  const isDetectingMode = mode === 'admin' && detectedPrivateAuth === null && isPrivateAuth === false

  const handleToggleStremio = () => {
    setShowStremioLogin((prev) => !prev)
  }

  const handleStremioAuth = useCallback(async (authKey: string) => {
    try {
      if (mode === 'admin') {
        // Admin mode: use publicAuthAPI
        await publicAuthAPI.loginWithStremio({ authKey })
        window.dispatchEvent(new CustomEvent('sfm:auth:changed', { detail: { authed: true } }))
        if (onAdminLogin) {
          onAdminLogin()
        } else {
          // Always redirect to admin page
          router.replace('/users')
        }
      } else {
        // User mode: use publicLibraryAPI
        try {
          console.log('[LoginPage] Attempting to authenticate user with authKey:', authKey ? 'present' : 'missing')
          const result = await publicLibraryAPI.authenticate(authKey)
          console.log('[LoginPage] Authenticate result:', JSON.stringify(result, null, 2))
          
          // Check if result indicates failure FIRST (before checking success)
          if (!result) {
            console.error('[LoginPage] Authentication failed - no result')
            toast.error('Authentication failed: No response from server')
            throw new Error('AUTHENTICATION_FAILED')
          }
          
          // Check for error in result (even if status is 200) - THIS MUST BE CHECKED FIRST
          if (result.error) {
            console.error('[LoginPage] Authentication failed - error in result:', result)
            const errorCode = result.error
            const errorMessage = result.message
            
            if (errorCode === 'USER_NOT_FOUND' || errorMessage?.includes('not registered')) {
              toast.error(errorMessage || 'Your account is not registered with Syncio. Please contact an administrator to be added to a Syncio group first.', { duration: 6000 })
              throw new Error('USER_NOT_FOUND')
            } else if (errorCode === 'USER_NOT_ACTIVE' || errorMessage?.includes('disabled')) {
              toast.error(errorMessage || 'Your account has been disabled. Please contact an administrator to reactivate your account.', { duration: 6000 })
              throw new Error('USER_NOT_ACTIVE')
            } else if (errorCode === 'USER_NOT_IN_GROUP' || errorMessage?.includes('not part of any')) {
              toast.error(errorMessage || 'Your account is not part of any Syncio group. Please contact an administrator to be added to a group first.', { duration: 6000 })
              throw new Error('USER_NOT_IN_GROUP')
            } else {
              toast.error(errorMessage || 'Authentication failed')
              throw new Error('AUTHENTICATION_FAILED')
            }
          }
          
          // Only proceed if we have success AND user data - DOUBLE CHECK
          if (!result.success) {
            console.error('[LoginPage] Authentication failed - result.success is false:', result)
            toast.error('Authentication failed: Invalid response from server')
            throw new Error('AUTHENTICATION_FAILED')
          }
          
          if (!result.user) {
            console.error('[LoginPage] Authentication failed - no user in result:', result)
            toast.error('Authentication failed: No user data received')
            throw new Error('AUTHENTICATION_FAILED')
          }
          
          // FINAL CHECK - only show success if we have both success and user
          console.log('[LoginPage] Authentication successful, user:', result.user.id)
          // Store in localStorage FIRST
          if (typeof window !== 'undefined') {
            const userData = {
              userId: result.user.id,
              authKey: authKey,
              userInfo: result.user
            }
            localStorage.setItem('public-library-user', JSON.stringify(userData))
            console.log('[LoginPage] Stored in localStorage:', userData)
          }
          
          // Small delay to ensure localStorage is written
          await new Promise(resolve => setTimeout(resolve, 100))
          
          // Show success message first
          toast.success('Welcome! You\'re now connected.')
          
          // Then handle redirect - callback should handle it
          if (onUserLogin) {
            console.log('[LoginPage] Calling onUserLogin callback')
            onUserLogin(result.user.id, authKey, result.user)
            // Callback handles redirect - it will use window.location.href
          } else {
            // No callback provided, redirect directly
            window.location.href = '/user/home'
          }
        } catch (authErr: any) {
          // Handle authentication errors (403, 401, etc.)
          console.error('[LoginPage] Authentication error caught:', {
            message: authErr?.message,
            response: authErr?.response,
            status: authErr?.response?.status,
            data: authErr?.response?.data
          })
          
          // If error was already handled (toast shown), don't show it again
          const errorData = authErr?.response?.data
          const errorCode = errorData?.error || authErr?.message
          const errorMessage = errorData?.message || authErr?.message
          
          // Only show error if we haven't already shown it above
          if (authErr?.message !== 'USER_NOT_FOUND' && authErr?.message !== 'USER_NOT_ACTIVE' && authErr?.message !== 'USER_NOT_IN_GROUP' && authErr?.message !== 'AUTHENTICATION_FAILED') {
            if (errorCode === 'USER_NOT_FOUND' || errorMessage?.includes('not registered')) {
              toast.error(errorMessage || 'Your account is not registered with Syncio. Please contact an administrator to be added to a Syncio group first.', { duration: 6000 })
            } else if (errorCode === 'USER_NOT_ACTIVE' || errorMessage?.includes('disabled')) {
              toast.error(errorMessage || 'Your account has been disabled. Please contact an administrator to reactivate your account.', { duration: 6000 })
            } else if (errorCode === 'USER_NOT_IN_GROUP' || errorMessage?.includes('not part of any')) {
              toast.error(errorMessage || 'Your account is not part of any Syncio group. Please contact an administrator to be added to a group first.', { duration: 6000 })
            } else {
              toast.error(errorMessage || 'Authentication failed')
            }
          }
          
          // Always rethrow the error so StremioOAuthCard can handle it properly
          throw authErr
        }
      }
    } catch (err: any) {
      console.error('Stremio login error (outer catch):', err)
      // Check if this is a user authentication error that was already handled
      const errorData = err?.response?.data
      const errorCode = errorData?.error
      const errorMessage = errorData?.message || err?.message
      
      // Only show generic error if it's not already handled in the inner catch
      if (errorCode !== 'USER_NOT_FOUND' && errorCode !== 'USER_NOT_ACTIVE' && !errorMessage?.includes('not registered') && !errorMessage?.includes('disabled')) {
        if (err?.response?.status !== 403) {
          toast.error(errorMessage || 'Authentication failed')
        }
      }
    }
  }, [mode, onAdminLogin, onUserLogin, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (mode === 'user') {
      // User mode only supports Stremio OAuth
      return
    }

    // Admin mode
    if (isPrivateMode) {
      if (!username.trim() || !password.trim()) {
        setError('Please enter both username and password')
        return
      }
    } else {
      if (!uuid.trim() || !password.trim()) {
        setError('Please enter both UUID and password')
        return
      }
    }

    setIsLoading(true)
    setError('')

    try {
      let response
      if (isPrivateMode) {
        response = await publicAuthAPI.privateLogin({ username: username.trim(), password })
      } else if (isRegisterMode) {
        // Do NOT register yet; show UUID save dialog first
        setShowUuidNotice(true)
        setIsLoading(false)
        return
      } else {
        response = await publicAuthAPI.login({ uuid: uuid.trim(), password })
      }
      
      if (response.message) {
        if (isRegisterMode) {
          // Registration deferred; handled on confirm
        } else {
          // Trigger auth change event
          window.dispatchEvent(new CustomEvent('sfm:auth:changed', { detail: { authed: true } }))
          if (onAdminLogin) {
            onAdminLogin()
          } else {
            // Always redirect to admin page
            router.replace('/users')
          }
        }
      } else {
        setError(response.message || `${isRegisterMode ? 'Registration' : 'Login'} failed`)
      }
    } catch (err: any) {
      const status = err?.response?.status
      const apiMsg = err?.response?.data?.message
      if (!isRegisterMode && status === 401) {
        setError('Wrong credentials')
      } else {
        setError(apiMsg || err?.message || `${isRegisterMode ? 'Registration' : 'Login'} failed`)
      }
    } finally {
      setIsLoading(false)
    }
  }

  // Show loading while detecting private mode (admin mode only)
  if (isDetectingMode) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ 
        background: 'linear-gradient(135deg, var(--color-background, #0f172a) 0%, color-mix(in srgb, var(--color-background, #0f172a) 95%, var(--color-text, #e2e8f0)) 100%)',
        minHeight: '100vh'
      }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-current mx-auto mb-4 color-text"></div>
          <div className="text-sm color-text-secondary">Loading...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ 
      background: 'linear-gradient(135deg, var(--color-background, #0f172a) 0%, color-mix(in srgb, var(--color-background, #0f172a) 95%, var(--color-text, #e2e8f0)) 100%)',
      minHeight: '100vh'
    }}>
      <div className="max-w-md w-full">
        {/* Logo and Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-6 overflow-hidden" style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            boxShadow: '0 10px 40px rgba(102, 126, 234, 0.3)'
          }}>
            <Image 
              src="/logo-white.png" 
              alt="Syncio" 
              width={40} 
              height={40} 
              className="object-contain"
              style={{ filter: 'brightness(0) invert(1)' }}
            />
          </div>
          <h1 className="text-5xl font-bold theme-text-1 mb-6 bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent leading-tight">
            Welcome to Syncio
          </h1>
          <p className="text-xl theme-text-3">
            {mode === 'admin' ? 'Enter your account credentials to continue' : 'Manage your Stremio library and addons'}
          </p>
        </div>

        {/* Mode Toggle - Always show */}
        <div className="mb-6">
          <div className="flex rounded-lg overflow-hidden p-1">
            <button
              type="button"
              onClick={() => {
                // Check if user is already logged in (same logic as User Panel button)
                if (typeof window !== 'undefined') {
                  const stored = localStorage.getItem('public-library-user')
                  if (stored) {
                    try {
                      const data = JSON.parse(stored)
                      if (data.userId && data.authKey) {
                        // User is logged in, go to user home (same as User Panel button)
                        router.push('/user/home')
                        return
                      }
                    } catch (e) {
                      // Invalid stored data, continue with mode switch
                    }
                  }
                }
                
                // Not logged in, just switch mode (no redirect, no refresh)
                setError('')
                setShowStremioLogin(false)
                setMode('user')
              }}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md transition-all ${
                mode === 'user' 
                  ? 'color-surface font-medium' 
                  : 'color-hover'
              }`}
            >
              <Users className="w-4 h-4" />
              User
            </button>
            <button
              type="button"
              onClick={async () => {
                setError('')
                setShowStremioLogin(false)
                
                // Check if admin is already logged in
                try {
                  const me = await publicAuthAPI.me()
                  if (me?.account) {
                    // Admin is logged in, redirect to admin page
                    // Use window.location for reliable redirect
                    window.location.href = '/users'
                    return
                  }
                } catch {
                  // Not logged in, continue with mode switch
                }
                
                // Not logged in, just switch mode (no redirect, no refresh)
                setMode('admin')
              }}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md transition-all ${
                mode === 'admin' 
                  ? 'color-surface font-medium' 
                  : 'color-hover'
              }`}
            >
              <Settings className="w-4 h-4" />
              Admin
            </button>
          </div>
        </div>

        <div className="card rounded-2xl p-8 shadow-2xl border-2" style={{
          background: 'var(--color-surface)',
          borderColor: 'var(--color-border)'
        }}>
          {/* Stremio OAuth Section - Only in public mode */}
          {mode === 'admin' && !isPrivateMode && (
            <div className="space-y-4 mb-6">
              <div className="p-4 border rounded-lg space-y-4 color-surface">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleToggleStremio}
                    className="flex-1 text-center font-medium px-3 py-2 rounded-md color-surface hover:opacity-90 transition-colors"
                  >
                    Sign in with Stremio
                  </button>
                </div>
                {showStremioLogin && (
                  <StremioOAuthCard
                    active={showStremioLogin}
                    withContainer={false}
                    showStartButton={false}
                    className="mt-4"
                    onAuthKey={handleStremioAuth}
                  />
                )}
              </div>
              <div className="flex items-center gap-3 text-xs uppercase justify-center color-text-secondary">
                <span className="h-px flex-1 bg-color-border" />
                or
                <span className="h-px flex-1 bg-color-border" />
              </div>
            </div>
          )}

          {mode === 'user' && (
            <div className="mb-6">
              <p className="text-sm theme-text-3 mb-4 text-center">
                Connect with Stremio to get started
              </p>
              <StremioOAuthCard
                active={true}
                autoStart={true}
                onAuthKey={handleStremioAuth}
                withContainer={false}
              />
            </div>
          )}

          {/* Admin Login Form or Direct Access Button */}
          {mode === 'admin' && isPrivateMode && hasPrivateAuthCredentials === false ? (
            <div className="space-y-4">
              <p className="text-sm theme-text-3 mb-4 text-center">
                No admin authentication required. Click below to access the admin panel.
              </p>
              <button
                type="button"
                onClick={() => {
                  window.location.href = '/users'
                }}
                className="w-full flex justify-center py-2 px-4 text-sm font-medium rounded-md color-text color-surface hover:opacity-90 focus:outline-none"
              >
                <div className="flex items-center">
                  <LogIn className="h-4 w-4 mr-2" />
                  Go to Admin Panel
                </div>
              </button>
            </div>
          ) : mode === 'admin' && (
            <form onSubmit={handleSubmit} className="space-y-4" autoComplete="on">
              {/* Username/UUID Field */}
              <div>
                <label htmlFor={isPrivateMode ? "username" : "uuid"} className="block text-sm font-medium">
                  {isPrivateMode ? 'Username' : 'Account UUID'}
                </label>
                <div className="mt-1 relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 color-text-secondary" />
                  </div>
                  {isPrivateMode ? (
                    <input
                      id="username"
                      name="username"
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      autoComplete="username"
                      className="block w-full pl-10 pr-3 py-2 rounded-md shadow-sm input sm:text-sm"
                      placeholder="Enter your username"
                    />
                  ) : (
                    <input
                      id="uuid"
                      name="username"
                      type="text"
                      required
                      value={uuid}
                      onChange={(e) => setUuid(e.target.value)}
                      autoComplete="username"
                      className="block w-full pl-10 pr-3 py-2 rounded-md shadow-sm input sm:text-sm"
                      placeholder="Enter your account UUID"
                    />
                  )}
                </div>
              </div>

              {/* Password Field */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium">
                  Password
                </label>
                <div className="mt-1 relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 color-text-secondary" />
                  </div>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={isRegisterMode ? 'new-password' : 'current-password'}
                    className="block w-full pl-10 pr-10 py-2 rounded-md shadow-sm input sm:text-sm"
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5 color-text-secondary color-hover" />
                    ) : (
                      <Eye className="h-5 w-5 color-text-secondary color-hover" />
                    )}
                  </button>
                </div>
              </div>

              {/* Error Message */}
              <div className="text-sm color-text min-h-[1.5rem]">
                {error && <span>{error}</span>}
              </div>

              {/* Login Button */}
              <div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className={`group relative w-full flex justify-center py-2 px-4 text-sm font-medium rounded-md color-text focus:outline-none ${
                    isLoading ? 'color-surface cursor-not-allowed' : 'color-surface hover:opacity-90'
                  }`}
                >
                  {isLoading ? (
                    <div className="flex items-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 color-border mr-2"></div>
                      {isRegisterMode ? 'Creating account...' : 'Signing in...'}
                    </div>
                  ) : (
                    <div className="flex items-center">
                      <LogIn className="h-4 w-4 mr-2" />
                      {isRegisterMode ? 'Register' : 'Sign In'}
                    </div>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Footer - Only for Admin mode in public mode (no registration in private mode) */}
          {mode === 'admin' && !isPrivateMode && (
            <div className="mt-6 text-center text-sm color-text-secondary">
              <p>
                {isRegisterMode ? 'Already have an account?' : "Don't have an account?"}{' '}
                <button
                  type="button"
                  onClick={() => {
                    if (isRegisterMode) {
                      setIsRegisterMode(false)
                      setError('')
                      setUuid('')
                    } else {
                      setIsRegisterMode(true)
                      setError('')
                      
                      publicAuthAPI.generateUuid()
                        .then(response => {
                          if (response.success) {
                            setUuid(response.uuid)
                          } else {
                            setError(response.message || 'Failed to generate UUID')
                          }
                        })
                        .catch(err => {
                          console.error('UUID generation error:', err)
                          setError('Failed to generate UUID')
                        })
                    }
                  }}
                  className="underline hover:no-underline color-text color-hover"
                >
                  {isRegisterMode ? 'Login here' : 'Register here'}
                </button>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* UUID Save Notice */}
      <ConfirmDialog
        open={showUuidNotice}
        title="Save your UUID"
        body={(
          <div>
            <p>Please save your UUID now, it cannot be retrieved later.</p>
            <div className="mt-3">
              <code
                onClick={() => { try { navigator.clipboard.writeText(uuid) } catch {} }}
                className="px-1 py-0.5 color-surface rounded cursor-pointer hover:opacity-80 transition-opacity"
                title="Click to copy UUID"
              >
                {uuid}
              </code>
            </div>
          </div>
        )}
        confirmText="I saved it"
        cancelText="Copy UUID"
        isDanger={false}
        onCancel={(reason) => {
          if (reason === 'cancel') {
            try { navigator.clipboard.writeText(uuid) } catch {}
            return
          }
          setShowUuidNotice(false)
        }}
        onConfirm={async () => {
          setShowUuidNotice(false)
          try {
            const response = await publicAuthAPI.register({ uuid: uuid.trim(), password })
            if (response?.message) {
              window.dispatchEvent(new CustomEvent('sfm:auth:changed', { detail: { authed: true } }))
              if (onAdminLogin) {
                onAdminLogin()
              } else {
                // Always redirect to admin page
                router.replace('/users')
              }
            } else {
              setError(response?.message || 'Registration failed')
            }
          } catch (err: any) {
            setError(err?.response?.data?.message || err?.message || 'Registration failed')
          }
        }}
      />
    </div>
  )
}

