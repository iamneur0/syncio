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
}: StremioOAuthCardProps) {
  const { isDark } = useTheme()
  const logoSrc = isDark ? '/logo-white.png' : '/logo-black.png'

  const [isCreating, setIsCreating] = useState(false)
  const [isPolling, setIsPolling] = useState(false)
  const [isCompleting, setIsCompleting] = useState(false)
  const [stremioLink, setStremioLink] = useState<string | null>(null)
  const [stremioCode, setStremioCode] = useState('')
  const [stremioExpiresAt, setStremioExpiresAt] = useState<number | null>(null)
  const [stremioError, setStremioError] = useState('')
  const [tick, setTick] = useState(0)

  const resetFlow = useCallback(() => {
    setIsCreating(false)
    setIsPolling(false)
    setIsCompleting(false)
    setStremioLink(null)
    setStremioCode('')
    setStremioExpiresAt(null)
    setStremioError('')
    setTick(0)
  }, [])

  useEffect(() => {
    if (!active) {
      resetFlow()
    }
  }, [active, resetFlow])

  const stremioTimeLeft = useMemo(() => {
    if (!stremioExpiresAt) return null
    const diff = Math.max(0, stremioExpiresAt - Date.now())
    const minutes = Math.floor(diff / 60000)
    const seconds = Math.floor((diff % 60000) / 1000)
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }, [stremioExpiresAt, tick])

  const effectiveDisabled = disabled || isCompleting

  const startStremioFlow = useCallback(async () => {
    if (typeof window === 'undefined') return
    if (!active || effectiveDisabled || isCreating || isCompleting) return
    setIsCreating(true)
    setStremioError('')
    setIsPolling(false)
    setStremioLink(null)
    setStremioCode('')
    setStremioExpiresAt(null)
    setTick(0)

    try {
      const host = window.location?.host || window.location?.hostname || 'syncio.app'
      const res = await fetch('https://link.stremio.com/api/v2/create?type=Create', {
        headers: {
          'X-Requested-With': host,
        },
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
  }, [active, effectiveDisabled, isCompleting, isCreating, onError])

  const completeStremioLogin = useCallback(async (authKey: string) => {
    if (!authKey || isCompleting || disabled) return
    setIsCompleting(true)
    setIsPolling(false)
    setStremioError('')
    try {
      await onAuthKey(authKey.trim())
      resetFlow()
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Failed to complete Stremio login'
      setStremioError(message)
      if (onError) onError(message)
    } finally {
      setIsCompleting(false)
    }
  }, [disabled, isCompleting, onAuthKey, onError, resetFlow])

  // Timer tick
  useEffect(() => {
    if (!active || !stremioExpiresAt) return
    if (typeof window === 'undefined') return
    const timer = window.setInterval(() => {
      setTick((prev) => prev + 1)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [active, stremioExpiresAt])

  // Auto start / refresh when expired
  useEffect(() => {
    if (!active) return
    if (!autoStart) return
    if (isCreating || isCompleting || effectiveDisabled) return
    if (!stremioLink || (stremioExpiresAt && Date.now() >= stremioExpiresAt)) {
      startStremioFlow()
    }
  }, [active, autoStart, effectiveDisabled, isCompleting, isCreating, startStremioFlow, stremioExpiresAt, stremioLink])

  // Polling for auth key
  useEffect(() => {
    if (!active) return
    if (!stremioCode || !isPolling || isCompleting) return
    if (typeof window === 'undefined') return
    let cancelled = false

    const pollOnce = async () => {
      if (cancelled) return
      if (stremioExpiresAt && Date.now() >= stremioExpiresAt) {
        setIsPolling(false)
        setStremioError('Stremio link expired. Generate a new link to continue.')
        if (onError) onError('Stremio link expired. Generate a new link to continue.')
        return
      }
      try {
        const host = window.location?.host || window.location?.hostname || 'syncio.app'
        const res = await fetch(`https://link.stremio.com/api/v2/read?type=Read&code=${encodeURIComponent(stremioCode)}`, {
          headers: {
            'X-Requested-With': host,
          },
        })
        const data = await res.json().catch(() => ({}))
        if (!data || cancelled) return
        if (data?.result?.success && data.result.authKey) {
          await completeStremioLogin(data.result.authKey)
        } else if (data?.error && data.error.code && data.error.code !== 101) {
          const message = data.error.message || 'Stremio reported an error. Try again.'
          setStremioError(message)
          if (onError) onError(message)
        }
      } catch (err: any) {
        if (!cancelled) {
          const message = 'Network error while checking Stremio status'
          setStremioError(message)
          if (onError) onError(message)
        }
      }
    }

    const interval = window.setInterval(pollOnce, 5000)
    pollOnce()
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [active, completeStremioLogin, isCompleting, isPolling, onError, stremioCode, stremioExpiresAt])

  if (!active) return null

  const content = (
    <>
      {showStartButton && (
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
          <button
            type="button"
            onClick={startStremioFlow}
            disabled={effectiveDisabled}
            className="px-2 py-1 rounded color-surface hover:opacity-90 disabled:opacity-70 disabled:cursor-not-allowed transition-colors font-mono"
            title="Refresh link"
          >
            {stremioTimeLeft || refreshLabel}
          </button>
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

