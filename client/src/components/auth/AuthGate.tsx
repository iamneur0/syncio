'use client'

import React, { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTheme } from '@/contexts/ThemeContext'
import api, { publicAuthAPI } from '@/services/api'
import { Eye, EyeOff, LogIn, User, Lock } from 'lucide-react'

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const AUTH_ENABLED = process.env.NEXT_PUBLIC_AUTH_ENABLED === 'true'
  const { isDark, isModernDark, isMono } = useTheme()
  const queryClient = useQueryClient()

  const [authed, setAuthed] = useState(false)
  const [accountUuid, setAccountUuid] = useState('')

  useEffect(() => {
    if (!AUTH_ENABLED) return
    ;(async () => {
      try {
        const me = await publicAuthAPI.me()
        setAuthed(!!me?.account)
        setAccountUuid(me?.account?.uuid || '')
        try { window.dispatchEvent(new CustomEvent('sfm:auth:changed', { detail: { authed: true } })) } catch {}
      } catch {
        setAuthed(false)
        setAccountUuid('')
        try { window.dispatchEvent(new CustomEvent('sfm:auth:changed', { detail: { authed: false } })) } catch {}
      }
    })()
  }, [])

  useEffect(() => {
    const onAuthChanged = (e: any) => {
      const next = !!e?.detail?.authed
      setAuthed(next)
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
  
  if (!authed) {
    return <LoginForm />
  }
  
  return <>{children}</>
}

function LoginForm() {
  const { isDark, isMono } = useTheme()
  const [uuid, setUuid] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [isRegisterMode, setIsRegisterMode] = useState(false)

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
        response = await publicAuthAPI.register({ uuid: uuid.trim(), password })
      } else {
        response = await publicAuthAPI.login({ uuid: uuid.trim(), password })
      }
      
      if (response.success || response.message) {
        // Trigger auth change event
        window.dispatchEvent(new CustomEvent('sfm:auth:changed', { detail: { authed: true } }))
        // Also update local state immediately
        setAuthed(true)
      } else {
        setError(response.message || `${isRegisterMode ? 'Registration' : 'Login'} failed`)
      }
    } catch (err: any) {
      setError(err.message || `${isRegisterMode ? 'Registration' : 'Login'} failed`)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={`min-h-screen flex items-center justify-center ${
      isMono ? 'bg-black text-white' : isDark ? 'bg-gray-900' : 'bg-gray-50'
    }`}>
      <div className={`max-w-md w-full mx-4 ${
        isMono ? 'bg-black border-white/20' : isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      } border rounded-lg shadow-lg p-8`}>
        {/* Logo and Title */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <img 
              src={(isDark || isMono) ? "/logo-white.png" : "/logo-black.png"} 
              alt="Syncio Logo" 
              className="w-16 h-16"
              onError={(e) => {
                e.currentTarget.src = "/favicon-32x32.png"
              }}
            />
          </div>
          <h1 className={`text-2xl font-bold ${
            isDark ? 'text-white' : 'text-gray-900'
          }`}>
            Welcome to Syncio
          </h1>
          <p className={`mt-2 ${
            isDark ? 'text-gray-300' : 'text-gray-600'
          }`}>
            {isRegisterMode ? 'Create a new account to get started' : 'Enter your account credentials to continue'}
          </p>
        </div>

        {/* Login/Register Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* UUID Field */}
          <div>
            <label htmlFor="uuid" className={`block text-sm font-medium ${
              isDark ? 'text-gray-200' : 'text-gray-700'
            }`}>
              Account UUID
            </label>
            <div className="mt-1 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User className={`h-5 w-5 ${
                  isDark ? 'text-gray-400' : 'text-gray-400'
                }`} />
              </div>
              <input
                id="uuid"
                name="uuid"
                type="text"
                required
                value={uuid}
                onChange={(e) => setUuid(e.target.value)}
                className={`block w-full pl-10 pr-3 py-2 border rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-2 sm:text-sm ${
                  isDark 
                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:ring-purple-500 focus:border-purple-500' 
                    : 'border-gray-300 text-gray-900 placeholder-gray-400 focus:ring-purple-500 focus:border-purple-500'
                }`}
                placeholder="Enter your account UUID"
              />
            </div>
          </div>

          {/* Password Field */}
          <div>
            <label htmlFor="password" className={`block text-sm font-medium ${
              isDark ? 'text-gray-200' : 'text-gray-700'
            }`}>
              Password
            </label>
            <div className="mt-1 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className={`h-5 w-5 ${
                  isDark ? 'text-gray-400' : 'text-gray-400'
                }`} />
              </div>
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`block w-full pl-10 pr-10 py-2 border rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-2 sm:text-sm ${
                  isDark 
                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:ring-purple-500 focus:border-purple-500' 
                    : 'border-gray-300 text-gray-900 placeholder-gray-400 focus:ring-purple-500 focus:border-purple-500'
                }`}
                placeholder="Enter your password"
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOff className={`h-5 w-5 ${
                    isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-400 hover:text-gray-500'
                  }`} />
                ) : (
                  <Eye className={`h-5 w-5 ${
                    isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-400 hover:text-gray-500'
                  }`} />
                )}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className={`text-sm ${
              isDark ? 'text-red-400' : 'text-red-600'
            }`}>
              {error}
            </div>
          )}

          {/* Login Button */}
          <div>
            <button
              type="submit"
              disabled={isLoading}
              className={`group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 ${
                isLoading
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-purple-600 hover:bg-purple-700'
              }`}
            >
              {isLoading ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
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
        <div className={`mt-6 text-center text-sm ${
          isDark ? 'text-gray-400' : 'text-gray-500'
        }`}>
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
              className={`underline hover:no-underline ${
                isDark ? 'text-purple-400 hover:text-purple-300' : 'text-purple-600 hover:text-purple-500'
              }`}
            >
              {isRegisterMode ? 'Login here' : 'Register here'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}


