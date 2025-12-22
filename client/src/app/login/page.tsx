'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useEffect, Suspense, useState } from 'react'
import LoginForm from '@/components/auth/LoginPage'
import { publicAuthAPI, publicLibraryAPI } from '@/services/api'

function LoginContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [mode, setMode] = useState<'admin' | 'user' | null>(() => {
    // Default to 'user' if no mode specified in URL
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search)
      return (urlParams.get('mode') as 'admin' | 'user' | null) || 'user'
    }
    return 'user'
  })
  const [isReady, setIsReady] = useState(false)
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false)

  useEffect(() => {
    // Get mode from URL params, default to 'user' if not specified
    const urlMode = searchParams.get('mode') as 'admin' | 'user' | null
    setMode(urlMode || 'user')
    setIsReady(true)

    // Only check auth once on mount, not on every render
    if (hasCheckedAuth) return
    setHasCheckedAuth(true)

    // Check auth and redirect: for bare /login only (no explicit mode)
    const checkAuth = async () => {
      const urlMode = searchParams.get('mode') as 'admin' | 'user' | null

      // If a specific mode is requested (e.g. /login?mode=admin), do NOT auto-redirect.
      // We want to always show the requested login form so the user can switch accounts.
      if (urlMode) {
        return
      }

      // For plain /login, keep the existing behavior:
      // try user auth first, then admin, then fall back to showing the login page.

      // Check user auth first
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('public-library-user')
        if (stored) {
          try {
            const data = JSON.parse(stored)
            if (data.userId && data.authKey) {
              // Validate user before redirecting
              try {
                await publicLibraryAPI.validate(data.authKey, data.userId)
                // Valid - redirect to user home
                window.location.href = '/user/home'
                return
              } catch (error) {
                // Invalid - clear and continue to check admin
                localStorage.removeItem('public-library-user')
              }
            }
          } catch (e) {
            // Invalid stored data
          }
        }
      }

      // Check admin auth
      try {
        const me = await publicAuthAPI.me()
        if (me?.account) {
          // Already logged in as admin, redirect
          window.location.href = '/users'
          return
        }
      } catch {
        // Not logged in, show login page - this is expected
      }
    }

    checkAuth()
  }, [searchParams, router, hasCheckedAuth])

  const handleAdminLogin = () => {
    // Always redirect to /users for admin - use window.location for reliable redirect
    window.location.href = '/users'
  }

  const handleUserLogin = (userId: string, authKey: string, userInfo: any) => {
    // Always redirect to /user/home for user - use window.location for reliable redirect
    window.location.href = '/user/home'
  }

  // Show loading state while determining mode
  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ 
        background: 'var(--color-background, #0f172a)', 
        color: 'var(--color-text, #e2e8f0)' 
      }}>
        <div>Loading...</div>
      </div>
    )
  }

  return (
    <LoginForm
      initialMode={mode || undefined}
      onAdminLogin={handleAdminLogin}
      onUserLogin={handleUserLogin}
    />
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ 
        background: 'var(--color-background, #0f172a)', 
        color: 'var(--color-text, #e2e8f0)' 
      }}>
        <div>Loading...</div>
      </div>
    }>
      <LoginContent />
    </Suspense>
  )
}

