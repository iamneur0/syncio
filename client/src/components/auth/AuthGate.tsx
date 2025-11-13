'use client'

import React, { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import api, { publicAuthAPI } from '@/services/api'
import { ConfirmDialog } from '@/components/modals'
import { useTheme } from '@/contexts/ThemeContext'
import { Eye, EyeOff, LogIn, User, Lock } from 'lucide-react'
import StremioOAuthCard from './StremioOAuthCard'

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const AUTH_ENABLED = process.env.NEXT_PUBLIC_AUTH_ENABLED === 'true'
  const queryClient = useQueryClient()

  const [authState, setAuthState] = useState<'loading' | 'authed' | 'guest'>(AUTH_ENABLED ? 'loading' : 'authed')
  const [accountUuid, setAccountUuid] = useState('')

  useEffect(() => {
    if (!AUTH_ENABLED) return
    ;(async () => {
      try {
        const me = await publicAuthAPI.me()
        setAuthState(me?.account ? 'authed' : 'guest')
        setAccountUuid(me?.account?.uuid || '')
        try { window.dispatchEvent(new CustomEvent('sfm:auth:changed', { detail: { authed: true } })) } catch {}
      } catch {
        setAuthState('guest')
        setAccountUuid('')
        try { window.dispatchEvent(new CustomEvent('sfm:auth:changed', { detail: { authed: false } })) } catch {}
      }
    })()
  }, [AUTH_ENABLED])

  useEffect(() => {
    const onAuthChanged = (e: any) => {
      const next = !!e?.detail?.authed
      setAuthState(next ? 'authed' : 'guest')
      if (!next) {
        setAccountUuid('')
        queryClient.setQueryData(['addons'], [])
        queryClient.setQueryData(['users'], [])
        queryClient.setQueryData(['groups'], [])
      } else {
        ;(async () => {
          try {
            const me = await publicAuthAPI.me()
            setAccountUuid(me?.account?.uuid || '')
          } catch {}
        })()
      }
    }
    window.addEventListener('sfm:auth:changed', onAuthChanged as any)
    return () => window.removeEventListener('sfm:auth:changed', onAuthChanged as any)
  }, [queryClient])

  if (!AUTH_ENABLED) return <>{children}</>
  
  if (authState === 'loading') {
    return <div className="min-h-screen" />
  }

  if (authState !== 'authed') {
    return <LoginForm setAuthState={setAuthState} />
  }
  
  return <>{children}</>
}

function LoginForm({ setAuthState }: { setAuthState: (state: 'loading' | 'authed' | 'guest') => void }) {
  const { isDark } = useTheme()
  const logoSrc = isDark ? '/logo-white.png' : '/logo-black.png'
  const [uuid, setUuid] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [isRegisterMode, setIsRegisterMode] = useState(false)
  const [showUuidNotice, setShowUuidNotice] = useState(false)
  const [showStremioLogin, setShowStremioLogin] = useState(false)

  const handleToggleStremio = () => {
    setShowStremioLogin((prev) => !prev)
  }

  const handleStremioAuth = React.useCallback(async (authKey: string) => {
    await publicAuthAPI.loginWithStremio({ authKey })
    try {
      window.dispatchEvent(new CustomEvent('sfm:auth:changed', { detail: { authed: true } }))
    } catch {}
    setAuthState('authed')
  }, [setAuthState])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!uuid.trim() || !password.trim()) {
      setError(`Please enter both UUID and password`)
      return
    }

    setIsLoading(true)
    setError('')

    try {
      let response
      if (isRegisterMode) {
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
        // Also update local state immediately
        setAuthState('authed')
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

  return (
    <div className={`min-h-screen flex items-center justify-center`}>
      <div className={`max-w-md w-full mx-4 card shadow-lg p-8`}>
        {/* Logo and Title */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <img 
              src={logoSrc} 
              alt="Syncio Logo" 
              className="w-16 h-16"
              onError={(e) => {
                e.currentTarget.src = "/favicon-32x32.png"
              }}
            />
          </div>
          <h1 className={`text-2xl font-bold`}>
            Welcome to Syncio
          </h1>
          <p className={`mt-2`}>
            {isRegisterMode ? 'Create a new account to get started' : 'Enter your account credentials to continue'}
          </p>
        </div>

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

        {/* Login/Register Form */}
        <form onSubmit={handleSubmit} className="space-y-6" autoComplete="on">
          {/* UUID Field */}
          <div>
            <label htmlFor="uuid" className={`block text-sm font-medium`}>
              Account UUID
            </label>
            <div className="mt-1 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User className={`h-5 w-5 color-text-secondary`} />
              </div>
              <input
                id="uuid"
                name="username"
                type="text"
                required
                value={uuid}
                onChange={(e) => setUuid(e.target.value)}
                autoComplete="username"
                className={`block w-full pl-10 pr-3 py-2 rounded-md shadow-sm input sm:text-sm`}
                placeholder="Enter your account UUID"
              />
            </div>
          </div>

          {/* Password Field */}
          <div>
            <label htmlFor="password" className={`block text-sm font-medium`}>
              Password
            </label>
            <div className="mt-1 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className={`h-5 w-5 color-text-secondary`} />
              </div>
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isRegisterMode ? 'new-password' : 'current-password'}
                className={`block w-full pl-10 pr-10 py-2 rounded-md shadow-sm input sm:text-sm`}
                placeholder="Enter your password"
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOff className={`h-5 w-5 color-text-secondary color-hover`} />
                ) : (
                  <Eye className={`h-5 w-5 color-text-secondary color-hover`} />
                )}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className={`text-sm color-text`}>
              {error}
            </div>
          )}

          {/* Login Button */}
          <div>
            <button
              type="submit"
              disabled={isLoading}
              className={`group relative w-full flex justify-center py-2 px-4 text-sm font-medium rounded-md color-text focus:outline-none ${isLoading ? 'color-surface cursor-not-allowed' : 'color-surface hover:opacity-90'}`}
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

        {/* Footer */}
        <div className={`mt-6 text-center text-sm color-text-secondary`}>
          <p>
            {isRegisterMode ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              type="button"
              onClick={() => {
                if (isRegisterMode) {
                  // Switch to login mode - clear UUID field
                  setIsRegisterMode(false)
                  setError('')
                  setUuid('')
                } else {
                  // Switch to register mode and generate a unique UUID from backend
                  setIsRegisterMode(true)
                  setError('')
                  
                  // Generate UUID asynchronously
                  publicAuthAPI.generateUuid()
                    .then(response => {
                      console.log('UUID generation response:', response)
                      if (response.success) {
                        setUuid(response.uuid)
                        console.log('UUID set to:', response.uuid)
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
              className={`underline hover:no-underline color-text color-hover`}
            >
              {isRegisterMode ? 'Login here' : 'Register here'}
            </button>
          </p>
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
                className={`px-1 py-0.5 color-surface rounded cursor-pointer hover:opacity-80 transition-opacity`}
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
            // Keep dialog open after copying
            return
          }
          // Close on escape/backdrop
          setShowUuidNotice(false)
        }}
        onConfirm={async () => {
          setShowUuidNotice(false)
          // Complete registration after acknowledgement
          try {
            const response = await publicAuthAPI.register({ uuid: uuid.trim(), password })
            if (response?.message) {
              window.dispatchEvent(new CustomEvent('sfm:auth:changed', { detail: { authed: true } }))
              setAuthState('authed')
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


