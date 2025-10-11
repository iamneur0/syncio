import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { addonsAPI } from '@/services/api'

export default function useAuth() {
  const AUTH_ENABLED = process.env.NEXT_PUBLIC_AUTH_ENABLED === 'true'
  const [authed, setAuthed] = useState<boolean>(() => !AUTH_ENABLED ? true : false)
  const queryClient = useQueryClient()
  
  useEffect(() => {
    const handler = (e: any) => {
      const next = !!(e?.detail?.authed)
      setAuthed(next)
      if (!next) {
        // Clear all cached data when not authenticated
        queryClient.setQueryData(['addons'], [] as any)
        queryClient.setQueryData(['groups'], [] as any)
        queryClient.setQueryData(['users'], [] as any)
        queryClient.clear()
      }
    }
    window.addEventListener('sfm:auth:changed', handler as any)
    if (AUTH_ENABLED) setAuthed(false)
    return () => window.removeEventListener('sfm:auth:changed', handler as any)
  }, [queryClient])

  // Check authentication on mount and when tab becomes visible
  useEffect(() => {
    if (AUTH_ENABLED) {
      const checkAuth = async () => {
        try {
          await addonsAPI.getAll()
          setAuthed(true)
        } catch (error: any) {
          if (error?.response?.status === 401 || error?.response?.status === 403) {
            setAuthed(false)
            queryClient.setQueryData(['addons'], [] as any)
            queryClient.setQueryData(['groups'], [] as any)
            queryClient.setQueryData(['users'], [] as any)
          }
        }
      }
      
      checkAuth()
      
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          checkAuth()
        }
      }
      
      document.addEventListener('visibilitychange', handleVisibilityChange)
      return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [queryClient])

  return { authed }
}
