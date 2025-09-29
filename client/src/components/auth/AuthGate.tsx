'use client'

import React, { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTheme } from '@/contexts/ThemeContext'
import api, { publicAuthAPI } from '@/services/api'

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
  return <>{children}</>
}


