'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { publicLibraryAPI } from '@/services/api'

export default function UserAuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [status, setStatus] = useState<'checking' | 'authed' | 'guest'>('checking')

  useEffect(() => {
    ;(async () => {
      if (typeof window === 'undefined') {
        setStatus('guest')
        return
      }

      const stored = localStorage.getItem('public-library-user')
      if (!stored) {
        setStatus('guest')
        return
      }

      try {
        const data = JSON.parse(stored)
        if (!data.userId || !data.authKey) {
          setStatus('guest')
          return
        }

        try {
          await publicLibraryAPI.validate(data.authKey, data.userId)
          setStatus('authed')
        } catch (error: any) {
          // Auth failed - clear and redirect
          localStorage.removeItem('public-library-user')
          setStatus('guest')
        }
      } catch {
        // Corrupt localStorage – clear and treat as guest
        localStorage.removeItem('public-library-user')
        setStatus('guest')
      }
    })()
  }, [])

  // Don't render anything until we've checked auth status
  if (status === 'checking') {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  }

  if (status !== 'authed') {
    // Redirect to user login page
    router.replace('/login?mode=user')
    return <div className="min-h-screen" />
  }

  return <>{children}</>
}


