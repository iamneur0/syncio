'use client'

import { useState, useEffect } from 'react'
import { publicLibraryAPI } from '@/services/api'

export function useUserAuth() {
  const [authKey, setAuthKey] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('public-library-user')
      if (stored) {
        try {
          const data = JSON.parse(stored)
          return data.authKey || null
        } catch {}
      }
    }
    return null
  })
  
  const [userId, setUserId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('public-library-user')
      if (stored) {
        try {
          const data = JSON.parse(stored)
          return data.userId || null
        } catch {}
      }
    }
    return null
  })
  
  const [userInfo, setUserInfo] = useState<any>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('public-library-user')
      if (stored) {
        try {
          const data = JSON.parse(stored)
          return data.userInfo || null
        } catch {}
      }
    }
    return null
  })

  // Load user info on mount if we have userId and authKey
  useEffect(() => {
    if (userId && authKey && !userInfo) {
      publicLibraryAPI.getUserInfo(userId, authKey)
        .then((data) => {
          setUserInfo(data)
          // Update localStorage
          if (typeof window !== 'undefined') {
            const stored = localStorage.getItem('public-library-user')
            if (stored) {
              try {
                const existing = JSON.parse(stored)
                localStorage.setItem('public-library-user', JSON.stringify({
                  ...existing,
                  userInfo: data
                }))
              } catch {}
            }
          }
        })
        .catch((error) => {
          console.error('Failed to load user info:', error)
        })
    }
  }, [userId, authKey, userInfo])

  return { authKey, userId, userInfo, setAuthKey, setUserId, setUserInfo }
}

