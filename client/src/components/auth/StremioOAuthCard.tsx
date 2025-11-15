import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'

interface StremioOAuthCardProps {
  active?: boolean
  autoStart?: boolean
  onAuthKey: (authKey: string) => Promise<void> | void
  disabled?: boolean
  className?: string
  withContainer?: boolean
  startButtonLabel?: string
  authorizeLabel?: string
  refreshLabel?: string
  instructionPrefix?: string
  instructionLinkHref?: string
  instructionLinkLabel?: string
  instructionSuffixBeforeLink?: string
  instructionSuffixAfterLink?: string
  showStartButton?: boolean
  onError?: (message: string) => void
  showSubmitButton?: boolean
  onSubmit?: () => void
  isSubmitting?: boolean
  initialLink?: string | null // Initial OAuth link (from admin-generated link)
  initialCode?: string | null // Initial OAuth code (from admin-generated link)
  initialExpiresAt?: number | null // Initial expiration time
}

const DEFAULT_INSTRUCTION_PREFIX = 'Copy the code'
const DEFAULT_INSTRUCTION_SUFFIX_BEFORE = 'and paste it'
const DEFAULT_INSTRUCTION_SUFFIX_AFTER = '.'

export function StremioOAuthCard({
  active = true,
  autoStart = true,
  onAuthKey,
  disabled = false,
  className = '',
  withContainer = true,
  startButtonLabel = 'Sign in with Stremio',
  authorizeLabel = 'Authorize Syncio',
  refreshLabel = 'Refresh',
  instructionPrefix = DEFAULT_INSTRUCTION_PREFIX,
  instructionLinkHref = 'https://link.stremio.com',
  instructionLinkLabel = 'here',
  instructionSuffixBeforeLink = DEFAULT_INSTRUCTION_SUFFIX_BEFORE,
  instructionSuffixAfterLink = DEFAULT_INSTRUCTION_SUFFIX_AFTER,
  showStartButton = true,
  onError,
  showSubmitButton = false,
  onSubmit,
  isSubmitting = false,
  initialLink = null,
  initialCode = null,
  initialExpiresAt = null,
}: StremioOAuthCardProps) {
  console.log('🔵🔵🔵 [StremioOAuthCard] COMPONENT RENDERED', {
    active,
    hasInitialLink: !!initialLink,
    hasInitialCode: !!initialCode,
    initialExpiresAt,
    disabled,
    timestamp: new Date().toISOString()
  })
  
  const { isDark } = useTheme()
  const logoSrc = isDark ? '/logo-white.png' : '/logo-black.png'

  const [isCreating, setIsCreating] = useState(false)
  const [isPolling, setIsPolling] = useState(false)
  const [isCompleting, setIsCompleting] = useState(false)
  const [stremioLink, setStremioLink] = useState<string | null>(initialLink)
  const [stremioCode, setStremioCode] = useState(initialCode || '')
  const [stremioExpiresAt, setStremioExpiresAt] = useState<number | null>(initialExpiresAt)
  const [stremioError, setStremioError] = useState('')
  const [tick, setTick] = useState(0)
  const [isOAuthUsed, setIsOAuthUsed] = useState(false) // Track if OAuth code has been used

  // Update state when initial props change (e.g., admin refreshes OAuth link)
  useEffect(() => {
    console.log('[StremioOAuthCard] Initial props effect:', {
      initialLink: initialLink ? 'present' : 'null',
      initialCode: initialCode ? initialCode.substring(0, 4) + '...' : 'null',
      initialExpiresAt,
      currentLink: stremioLink ? 'present' : 'null',
      currentCode: stremioCode ? stremioCode.substring(0, 4) + '...' : 'null',
      currentExpiresAt: stremioExpiresAt,
      isPolling
    })
    
    let hasChanges = false
    
    // Always update if initialLink is provided and different from current
    if (initialLink !== null && initialLink !== undefined) {
      if (initialLink !== stremioLink) {
        console.log('[StremioOAuthCard] Setting initialLink and starting polling')
        setStremioLink(initialLink)
        setIsPolling(true)
        setStremioError('') // Clear any errors when link changes
        hasChanges = true
      }
    }
    // Always update if initialCode is provided and different from current
    if (initialCode !== null && initialCode !== undefined) {
      if (initialCode !== stremioCode) {
        console.log('[StremioOAuthCard] Setting initialCode and starting polling')
        setStremioCode(initialCode)
        setIsPolling(true) // Restart polling with new code
        hasChanges = true
      }
    }
    // Always update if initialExpiresAt is provided and different from current
    if (initialExpiresAt !== null && initialExpiresAt !== undefined) {
      if (initialExpiresAt !== stremioExpiresAt) {
        console.log('[StremioOAuthCard] Setting initialExpiresAt')
        setStremioExpiresAt(initialExpiresAt)
        setTick(0) // Reset timer when expiration changes
        hasChanges = true
      }
    }
    
    // If any OAuth data changed, ensure polling is active
    if (hasChanges && initialLink && initialCode) {
      console.log('[StremioOAuthCard] OAuth data changed, ensuring polling is active')
      setIsPolling(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLink, initialCode, initialExpiresAt])

  const resetFlow = useCallback(() => {
    setIsCreating(false)
    setIsPolling(false)
    setIsCompleting(false)
    setStremioLink(null)
    setStremioCode('')
    setStremioExpiresAt(null)
    setStremioError('')
    setTick(0)
    setIsOAuthUsed(false)
  }, [])

  useEffect(() => {
    if (!active) {
      resetFlow()
    }
  }, [active, resetFlow])

  // Check if OAuth is expired (time-based or used but not completed)
  const isOAuthExpired = isOAuthUsed || (stremioExpiresAt && stremioExpiresAt < Date.now())
  
  const stremioTimeLeft = useMemo(() => {
    if (!stremioExpiresAt || isOAuthExpired) return null
    const diff = Math.max(0, stremioExpiresAt - Date.now())
    const minutes = Math.floor(diff / 60000)
    const seconds = Math.floor((diff % 60000) / 1000)
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }, [stremioExpiresAt, tick, isOAuthExpired])

  const effectiveDisabled = disabled || isCompleting

  const startStremioFlow = useCallback(async () => {
    if (typeof window === 'undefined') return
    if (!active || effectiveDisabled || isCreating || isCompleting) return
    // Don't allow refreshing if initial link is provided (admin-generated link)
    if (initialLink) return
    setIsCreating(true)
    setStremioError('')
    setIsPolling(false)
    setStremioLink(null)
    setStremioCode('')
    setStremioExpiresAt(null)
    setTick(0)

    try {
      // Use full origin for localhost to ensure Stremio recognizes it
      const host = window.location?.host || window.location?.hostname || 'syncio.app'
      const origin = window.location?.origin || `http://${host}`
      console.log('[StremioOAuthCard] Creating Stremio OAuth link with host:', host, 'origin:', origin)
      const res = await fetch('https://link.stremio.com/api/v2/create?type=Create', {
        headers: {
          'X-Requested-With': host,
          'Origin': origin,
        },
        referrerPolicy: 'no-referrer',
      })
      if (!res.ok) {
        throw new Error(`Stremio responded with ${res.status}`)
      }
      const data = await res.json()
      const result = data?.result
      if (result?.success && result?.code && result?.link) {
        setStremioLink(result.link)
        setStremioCode(result.code)
        setStremioExpiresAt(Date.now() + 5 * 60 * 1000)
        setTick(0)
        setIsPolling(true)
      } else {
        const message = data?.error?.message || 'Failed to create Stremio link'
        throw new Error(message)
      }
    } catch (err: any) {
      const message = err?.message || 'Failed to start Stremio login'
      setStremioError(message)
      if (onError) onError(message)
    } finally {
      setIsCreating(false)
    }
  }, [active, effectiveDisabled, isCompleting, isCreating, onError, initialLink])

  const completeStremioLogin = useCallback(async (authKey: string) => {
    if (!authKey || isCompleting || disabled) return
    console.log('[StremioOAuthCard] completeStremioLogin called with authKey:', authKey ? 'present' : 'missing')
    setIsCompleting(true)
    setIsPolling(false)
    setStremioError('')
    try {
      console.log('[StremioOAuthCard] Calling onAuthKey callback')
      await onAuthKey(authKey.trim())
      console.log('[StremioOAuthCard] onAuthKey callback completed successfully')
      resetFlow()
    } catch (err: any) {
      console.error('[StremioOAuthCard] Error in completeStremioLogin:', err)
      const message = err?.response?.data?.message || err?.message || 'Failed to complete Stremio login'
      setStremioError(message)
      if (onError) onError(message)
    } finally {
      setIsCompleting(false)
    }
  }, [disabled, isCompleting, onAuthKey, onError, resetFlow])

  // Timer tick - stop if OAuth is expired
  useEffect(() => {
    if (!active || !stremioExpiresAt || isOAuthExpired) return
    if (typeof window === 'undefined') return
    const timer = window.setInterval(() => {
      setTick((prev) => prev + 1)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [active, stremioExpiresAt, isOAuthExpired])

  // Auto start (but don't auto-refresh when expired, and don't start if initial link is provided)
  useEffect(() => {
    if (!active) return
    if (!autoStart) return
    if (isCreating || isCompleting || effectiveDisabled) return
    // Only auto-start if there's no link yet and no initial link was provided
    // Don't auto-refresh when expired
    if (!stremioLink && !initialLink) {
      startStremioFlow()
    }
  }, [active, autoStart, effectiveDisabled, isCompleting, isCreating, startStremioFlow, stremioLink, initialLink])

  // Polling for auth key
  useEffect(() => {
    if (!active) {
      console.log('[StremioOAuthCard] Polling not active')
      return
    }
    if (!stremioCode) {
      console.log('[StremioOAuthCard] No stremioCode, skipping poll')
      return
    }
    if (!isPolling) {
      console.log('[StremioOAuthCard] Not polling, isPolling:', isPolling)
      return
    }
    if (isCompleting) {
      console.log('[StremioOAuthCard] Already completing, skipping poll')
      return
    }
    if (typeof window === 'undefined') return
    
    console.log('[StremioOAuthCard] Starting OAuth polling with code:', stremioCode.substring(0, 4) + '...')
    let cancelled = false

    const pollOnce = async () => {
      if (cancelled) {
        console.log('[StremioOAuthCard] Poll cancelled')
        return
      }
      if (stremioExpiresAt && Date.now() >= stremioExpiresAt) {
        console.log('[StremioOAuthCard] OAuth link expired')
        setIsPolling(false)
        setStremioError('Stremio link expired. Generate a new link to continue.')
        if (onError) onError('Stremio link expired. Generate a new link to continue.')
        return
      }
      try {
        // Use full origin for localhost to ensure Stremio recognizes it
        const host = window.location?.host || window.location?.hostname || 'syncio.app'
        const origin = window.location?.origin || `http://${host}`
        console.log('[StremioOAuthCard] Polling Stremio with host:', host, 'origin:', origin, 'code:', stremioCode.substring(0, 4) + '...')
        const res = await fetch(`https://link.stremio.com/api/v2/read?type=Read&code=${encodeURIComponent(stremioCode)}`, {
          headers: {
            'X-Requested-With': host,
            'Origin': origin,
          },
          referrerPolicy: 'no-referrer',
        })
        console.log('[StremioOAuthCard] Stremio response status:', res.status)
        const data = await res.json().catch(() => ({}))
        console.log('[StremioOAuthCard] Stremio response data:', {
          success: data?.result?.success,
          hasAuthKey: !!data?.result?.authKey,
          error: data?.error
        })
        if (!data || cancelled) return
        if (data?.result?.success && data.result.authKey) {
          console.log('[StremioOAuthCard] OAuth completed! AuthKey detected, calling completeStremioLogin')
          // OAuth code was used - try to complete login
          // If completion fails (e.g., email mismatch), mark as used/expired
          try {
            await completeStremioLogin(data.result.authKey)
            console.log('[StremioOAuthCard] completeStremioLogin finished successfully')
          } catch (err: any) {
            console.error('[StremioOAuthCard] completeStremioLogin failed:', err)
            // If completion fails, mark OAuth as used/expired
            setIsOAuthUsed(true)
            setIsPolling(false)
            const errorCode = err?.response?.data?.error
            if (errorCode === 'EMAIL_MISMATCH') {
              setStremioError('Stremio account email does not match your request email.')
            } else {
              setStremioError('Stremio link expired. Generate a new link to continue.')
            }
            if (onError) onError('Stremio link expired. Generate a new link to continue.')
          }
        } else if (data?.error && data.error.code && data.error.code !== 101) {
          console.log('[StremioOAuthCard] Stremio returned error:', data.error)
          const message = data.error.message || 'Stremio reported an error. Try again.'
          setStremioError(message)
          if (onError) onError(message)
        } else {
          console.log('[StremioOAuthCard] OAuth not completed yet (code 101 = pending)')
        }
      } catch (err: any) {
        console.error('[StremioOAuthCard] Polling error:', err)
        if (!cancelled) {
          const message = 'Network error while checking Stremio status'
          setStremioError(message)
          if (onError) onError(message)
        }
      }
    }

    const interval = window.setInterval(pollOnce, 5000)
    console.log('[StremioOAuthCard] Polling interval set, calling pollOnce immediately')
    pollOnce()
    return () => {
      console.log('[StremioOAuthCard] Cleaning up polling interval')
      cancelled = true
      window.clearInterval(interval)
    }
  }, [active, completeStremioLogin, isCompleting, isPolling, onError, stremioCode, stremioExpiresAt])

  if (!active) {
    console.log('🔴 [StremioOAuthCard] Component not active, returning null')
    return null
  }
  
  console.log('🟢 [StremioOAuthCard] Component is active, rendering. State:', {
    stremioCode: stremioCode ? stremioCode.substring(0, 4) + '...' : 'null',
    isPolling,
    isCompleting,
    hasLink: !!stremioLink,
    hasInitialLink: !!initialLink
  })

  const content = (
    <>
      {showStartButton && !initialLink && (
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={startStremioFlow}
            disabled={effectiveDisabled}
            className="flex-1 text-center font-medium px-3 py-2 rounded-md color-surface hover:opacity-90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isCreating ? (
              <span className="inline-flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating link...
              </span>
            ) : (
              startButtonLabel
            )}
          </button>
        </div>
      )}
      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => {
            if (!stremioLink || effectiveDisabled) return
            try { window.open(stremioLink, '_blank', 'noopener,noreferrer') } catch {}
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium color-surface hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!stremioLink || effectiveDisabled}
        >
          {isCompleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <img
              src={logoSrc}
              alt="Syncio"
              className="h-4 w-4"
              onError={(e) => {
                e.currentTarget.src = '/favicon-32x32.png'
              }}
            />
          )}
          {authorizeLabel}
        </button>
        <div className="text-xs uppercase color-text-secondary">or</div>
        <div className="text-sm color-text-secondary text-center">
          {instructionPrefix}
          <button
            type="button"
            onClick={() => {
              if (!stremioCode) return
              try { navigator.clipboard.writeText(stremioCode) } catch {}
            }}
            disabled={!stremioCode}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-sm font-medium color-surface hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ml-1"
            title="Copy code"
          >
            {stremioCode || '----'}
          </button>
          {instructionSuffixBeforeLink ? ` ${instructionSuffixBeforeLink}` : ''}
          {' '}
          <a href={instructionLinkHref} target="_blank" rel="noopener noreferrer" className="underline hover:no-underline">
            {instructionLinkLabel}
          </a>
          {instructionSuffixAfterLink}
        </div>
        <div className="flex items-center text-xs color-text-secondary whitespace-nowrap mt-1">
          <span className="px-2 py-1 rounded font-mono">
            {isOAuthExpired ? 'Expired' : (stremioTimeLeft || refreshLabel)}
          </span>
        </div>
        {stremioError && (
          <div className="text-sm color-text text-center">
            {stremioError}
          </div>
        )}
      </div>
    </>
  )

  if (!withContainer) {
    return <div className={`space-y-4 ${className}`}>{content}</div>
  }

  return (
    <div className={`p-4 border rounded-lg space-y-4 color-surface ${className}`}>
      {content}
      {showSubmitButton && onSubmit && (
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onSubmit}
            disabled={effectiveDisabled || isSubmitting}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium color-surface hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing…
              </>
            ) : (
              'Add User'
            )}
          </button>
        </div>
      )}
    </div>
  )
}

export default StremioOAuthCard

