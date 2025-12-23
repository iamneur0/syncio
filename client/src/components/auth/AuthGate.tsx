'use client'

import React, { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { usePathname, useRouter } from 'next/navigation'
import api, { publicAuthAPI } from '@/services/api'
import LoginPage from './LoginPage'

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const AUTH_ENABLED = process.env.NEXT_PUBLIC_AUTH_ENABLED === 'true'
  const queryClient = useQueryClient()
  const pathname = usePathname()
  const router = useRouter()
  
  // Check if current path is an invite route, login page, or user route (public, no admin auth required)
  const isInviteRoute = pathname?.startsWith('/invite/')
  const isLoginRoute = pathname === '/login'
  const isUserRoute = pathname?.startsWith('/user/')

  const [authState, setAuthState] = useState<'loading' | 'authed' | 'guest'>('loading')
  const [accountUuid, setAccountUuid] = useState('')
  const [isPrivateAuth, setIsPrivateAuth] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    ;(async () => {
      if (AUTH_ENABLED) {
        // Public auth mode
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
      } else {
        // Private instance - check if auth is required
        try {
          const me = await publicAuthAPI.me()
          // If /me succeeds, no auth needed
          setAuthState('authed')
          setIsPrivateAuth(false)
        } catch (err: any) {
          // If /me fails with 401, private auth is enabled
          if (err?.response?.status === 401) {
            setAuthState('guest')
            setIsPrivateAuth(true)
          } else {
            // Other error - assume no auth needed
            setAuthState('authed')
            setIsPrivateAuth(false)
          }
        }
      }
      setAuthChecked(true)
    })()
  }, [AUTH_ENABLED])

  useEffect(() => {
    const onAuthChanged = async (e: any) => {
      const next = !!e?.detail?.authed
      if (!next) {
        // Logging out - clear data immediately
        setAccountUuid('')
        queryClient.setQueryData(['addons'], [])
        queryClient.setQueryData(['users'], [])
        queryClient.setQueryData(['groups'], [])
        
        // If private auth was enabled, keep it enabled and show login form
        if (!AUTH_ENABLED && isPrivateAuth) {
          setAuthState('guest')
          // Keep isPrivateAuth true so login form shows
        } else if (AUTH_ENABLED) {
          setAuthState('guest')
        } else {
          // No auth needed
          setAuthState('authed')
          setIsPrivateAuth(false)
        }
      } else {
        setAuthState('authed')
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
  }, [queryClient, AUTH_ENABLED, isPrivateAuth])

  // Invite routes, login page, and user routes are public - no admin auth required
  // User routes have their own authentication logic in UserLoginPage
  if (isInviteRoute || isLoginRoute || isUserRoute) {
    return <>{children}</>
  }

  // Don't render anything until we've checked auth status
  if (!authChecked) {
    return <div className="min-h-screen" />
  }

  if (!AUTH_ENABLED && !isPrivateAuth) return <>{children}</>
  
  if (authState === 'loading') {
    return <div className="min-h-screen" />
  }

  if (authState !== 'authed') {
    // Redirect to admin login page (AuthGate protects admin pages)
    router.replace('/login?mode=admin')
    return <div className="min-h-screen" />
  }
  
  return <>{children}</>
}
