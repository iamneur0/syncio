'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { publicAuthAPI, publicLibraryAPI } from '@/services/api'

export default function HomePage() {
  const router = useRouter()
  // Check localStorage synchronously first to avoid flickering
  const [hasUserAuth, setHasUserAuth] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('public-library-user')
      if (stored) {
        try {
          const data = JSON.parse(stored)
          return !!(data.userId && data.authKey)
        } catch {}
      }
    }
    return false
  })
  const [checking, setChecking] = useState(true)
  const [showLogin, setShowLogin] = useState(false)

  useEffect(() => {
    const checkAuth = async () => {
      // Check admin auth first
      try {
        const me = await publicAuthAPI.me()
        if (me?.account) {
          router.replace('/users')
          return
        }
      } catch {}

      // If admin not authenticated, check user auth
      if (hasUserAuth && typeof window !== 'undefined') {
        const stored = localStorage.getItem('public-library-user')
        if (stored) {
          try {
            const data = JSON.parse(stored)
            if (data.userId && data.authKey) {
              // Validate user before redirecting
              try {
                await publicLibraryAPI.validate(data.authKey, data.userId)
                // Valid - redirect to user home
                router.replace('/user/home')
                return
              } catch (error) {
                // Invalid - clear and continue to login
                localStorage.removeItem('public-library-user')
                setHasUserAuth(false)
              }
            }
          } catch {}
        }
      }

      // No valid auth - redirect to login
      router.replace('/login')
    }

    checkAuth()
  }, [router, hasUserAuth])

  // Show nothing while checking
  return <div className="min-h-screen" />
}
