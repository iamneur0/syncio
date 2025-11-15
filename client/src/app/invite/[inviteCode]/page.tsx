'use client'

import React from 'react'
import { useParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { XCircle, CheckCircle, Clock } from 'lucide-react'
import { invitationsAPI, usersAPI } from '@/services/api'
import { InvitePageLayout } from './components/InvitePageLayout'
import { RequestAccessForm } from './components/RequestAccessForm'
import { RequestAcceptedPage } from './components/RequestAcceptedPage'
import { StatusPage } from './components/StatusPage'

export default function InviteRequestPage() {
  const params = useParams()
  const inviteCode = params?.inviteCode as string
  const queryClient = useQueryClient()

  // Get localStorage key for this invitation
  const storageKey = `invite_request_${inviteCode}`

  // Initialize state consistently for SSR (always start with empty/default values)
  // Read from localStorage synchronously on client side to prevent flashing
  const getInitialState = () => {
    if (typeof window === 'undefined') {
      return {
        email: '',
        username: '',
        requestSubmitted: false,
        emailMismatchError: false
      }
    }
    const saved = localStorage.getItem(storageKey)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        // Restore email/username
        const restoredEmail = parsed.email || ''
        const restoredUsername = parsed.username || ''
        // Only restore requestSubmitted if we have both email and username AND submitted flag is true
        // This allows refresh to restore the correct page, but prevents auto-redirect while typing
        const shouldRestoreSubmitted = restoredEmail && restoredUsername && parsed.submitted === true
        return {
          email: restoredEmail,
          username: restoredUsername,
          requestSubmitted: shouldRestoreSubmitted,
          emailMismatchError: parsed.emailMismatchError === true || false
        }
      } catch {
        // Ignore parse errors
      }
    }
    return {
      email: '',
      username: '',
      requestSubmitted: false,
      emailMismatchError: false
    }
  }

  const initialState = getInitialState()
  const [email, setEmail] = React.useState(initialState.email)
  const [username, setUsername] = React.useState(initialState.username)
  const [requestSubmitted, setRequestSubmitted] = React.useState(initialState.requestSubmitted)
  const [isMounted, setIsMounted] = React.useState(false)
  const [isInvitationDisabled, setIsInvitationDisabled] = React.useState(true) // Start as true (pessimistic) until we verify it's active
  const [isCheckingInvitation, setIsCheckingInvitation] = React.useState(true)
  const [isInvitationNotFound, setIsInvitationNotFound] = React.useState(false) // Start as false (optimistic) until we confirm it doesn't exist
  
  // Validation state
  const [emailError, setEmailError] = React.useState<string | null>(null)
  const [usernameError, setUsernameError] = React.useState<string | null>(null)
  const [isCheckingEmail, setIsCheckingEmail] = React.useState(false)
  const [isCheckingUsername, setIsCheckingUsername] = React.useState(false)
  
  // Email mismatch error state - initialized from localStorage synchronously
  const [emailMismatchError, setEmailMismatchError] = React.useState(initialState.emailMismatchError)
  
  // Debounce timers
  const emailCheckTimerRef = React.useRef<NodeJS.Timeout | null>(null)
  const usernameCheckTimerRef = React.useRef<NodeJS.Timeout | null>(null)

  // Mark as mounted (state already initialized from localStorage synchronously)
  React.useEffect(() => {
    setIsMounted(true)
    // Only update state if localStorage has changed (e.g., from another tab)
    // requestSubmitted is already restored in getInitialState() if email/username and submitted flag exist
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          // Only update if values differ (to avoid unnecessary re-renders)
          if (parsed.email && parsed.email !== email) setEmail(parsed.email)
          if (parsed.username && parsed.username !== username) setUsername(parsed.username)
          // Restore requestSubmitted if we have email/username and submitted flag (for cross-tab sync)
          if (parsed.submitted === true && parsed.email && parsed.username && !requestSubmitted) {
            setRequestSubmitted(true)
          }
          // Only restore emailMismatchError if email and username match what's stored
          if (parsed.emailMismatchError === true && !emailMismatchError &&
              parsed.email === email.trim() && parsed.username === username.trim()) {
            setEmailMismatchError(true)
          }
        } catch {
          // Ignore parse errors
        }
      }
    }
  }, [storageKey, email, username, emailMismatchError, requestSubmitted])

  // Check if invitation is disabled on page load
  React.useEffect(() => {
    if (!isMounted || !inviteCode) {
      setIsCheckingInvitation(false)
      return
    }
    
    setIsCheckingInvitation(true)
    // Check if invitation is active without creating a request
    invitationsAPI.checkInvitation(inviteCode)
      .then((data) => {
        // Invitation exists, so it's not "not found"
        setIsInvitationNotFound(false)
        // Set to disabled if invitation is inactive OR if it has reached max uses OR if it has expired
        const isMaxUsesReached = data.maxUses != null && data.currentUses >= data.maxUses
        const isExpired = data.expiresAt && new Date(data.expiresAt) < new Date()
        setIsInvitationDisabled(!data.isActive || isMaxUsesReached || isExpired)
      })
      .catch((error: any) => {
        // Check if invitation not found (404)
        if (error?.response?.status === 404) {
          setIsInvitationNotFound(true)
          setIsInvitationDisabled(false) // Don't show disabled message for not found
        } else {
          // Other errors, treat as disabled (but invitation exists)
          setIsInvitationNotFound(false) // Invitation exists, just error checking it
          setIsInvitationDisabled(true)
        }
      })
      .finally(() => {
        setIsCheckingInvitation(false)
      })
  }, [isMounted, inviteCode])

  const [authKey, setAuthKey] = React.useState<string | null>(null)
  const [oauthLinkGenerated, setOauthLinkGenerated] = React.useState(false)
  const [isGeneratingOAuth, setIsGeneratingOAuth] = React.useState(false)
  const [lastOAuthLink, setLastOAuthLink] = React.useState<string | null>(null)
  const [lastOAuthCode, setLastOAuthCode] = React.useState<string | null>(null)
  const [oauthKeyVersion, setOauthKeyVersion] = React.useState(0) // Track OAuth link/code changes for key
  const oauthPollerRef = React.useRef<number | null>(null)
  const [isCreatingUser, setIsCreatingUser] = React.useState(false)
  const hasAttemptedCreationRef = React.useRef<Set<string>>(new Set()) // Track which OAuth codes we've already tried
  const verificationFailureCountRef = React.useRef<Map<string, number>>(new Map()) // Track verification failures per OAuth code

  // check request status
  const { data: status, dataUpdatedAt, refetch: refetchStatus, error: statusError, isLoading: isLoadingStatus } = useQuery({
    queryKey: ['invite-status', inviteCode, email, username],
    queryFn: () => invitationsAPI.checkStatus(inviteCode, email, username),
    enabled:
      isMounted &&
      requestSubmitted &&
      !!email &&
      !!username &&
      !isInvitationNotFound,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      const queryData = query.state?.data as any
      if (queryData?.status === 'completed') {
        return false
      }
      return 2000
    }
  })

  // handle oauth link when status changes
  React.useEffect(() => {
    if (status && (status as any).status === 'accepted') {
      if ((status as any).oauthLink) {
        setOauthLinkGenerated(true)
        if (!lastOAuthLink && (status as any).oauthLink) {
          setLastOAuthLink((status as any).oauthLink)
        }
        if (!lastOAuthCode && (status as any).oauthCode) {
          setLastOAuthCode((status as any).oauthCode)
        }
      } else {
        // OAuth link was cleared - reset state and clear email mismatch error
        setOauthLinkGenerated(false)
        setEmailMismatchError(false)
        // Clear from localStorage
        if (typeof window !== 'undefined') {
          const saved = localStorage.getItem(storageKey)
          if (saved) {
            try {
              const parsed = JSON.parse(saved)
              localStorage.setItem(storageKey, JSON.stringify({
                ...parsed,
                emailMismatchError: false
              }))
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    }
  }, [status, lastOAuthLink, lastOAuthCode, storageKey])

  // handle status errors
  React.useEffect(() => {
    if (statusError && (statusError as any)?.response?.status === 404) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(storageKey)
      }
      setRequestSubmitted(false)
      setEmail('')
      setUsername('')
      setOauthLinkGenerated(false)
    }
  }, [statusError, storageKey])

  // detect oauth link/code changes
  const prevDataUpdatedAtRef = React.useRef<number>(0)
  const prevLinkRef = React.useRef<string | null>(null)
  const prevCodeRef = React.useRef<string | null>(null)
  const prevStatusRef = React.useRef<string | null>(null)
  
  React.useEffect(() => {
    if (!status || !dataUpdatedAt) return
    
    if (dataUpdatedAt <= prevDataUpdatedAtRef.current) return
    
    const statusData = status as any
    const currentLink = statusData.oauthLink || null
    const currentCode = statusData.oauthCode || null
    const currentStatus = statusData.status || null
    const prevLink = prevLinkRef.current
    const prevCode = prevCodeRef.current
    const prevStatus = prevStatusRef.current
    
    const linkChanged = currentLink !== null && currentLink !== prevLink
    const codeChanged = currentCode !== null && currentCode !== prevCode
    const statusChanged = currentStatus !== prevStatus
    
    // Detect when OAuth link is cleared (was present, now null)
    const linkCleared = prevLink !== null && currentLink === null
    
    // Reset oauthLinkGenerated when OAuth link is cleared
    if (linkCleared) {
      setOauthLinkGenerated(false)
      setLastOAuthLink(null)
      setLastOAuthCode(null)
      setOauthKeyVersion(prev => prev + 1) // Force OAuth card to re-render
      // Update refs so next comparison works correctly
      prevLinkRef.current = currentLink
      prevCodeRef.current = currentCode
    }
    
    if (linkChanged || codeChanged) {
      if (linkChanged) {
        setLastOAuthLink(currentLink)
        prevLinkRef.current = currentLink
      }
      if (codeChanged) {
        setLastOAuthCode(currentCode)
        prevCodeRef.current = currentCode
      }
      
      // Increment version to force remount with new link/code
      setOauthKeyVersion(prev => prev + 1)
    }
    
    // Update status ref
    if (statusChanged) {
      prevStatusRef.current = currentStatus
    }
    
    // Update refs for next comparison
    prevDataUpdatedAtRef.current = dataUpdatedAt
    if (!linkChanged && currentLink !== null) prevLinkRef.current = currentLink
    if (!codeChanged && currentCode !== null) prevCodeRef.current = currentCode
  }, [status, dataUpdatedAt])

  // Submit request mutation
  const submitMutation = useMutation({
    mutationFn: () => invitationsAPI.submitRequest(inviteCode, email, username),
    onSuccess: () => {
      setRequestSubmitted(true)
      // Save to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem(storageKey, JSON.stringify({
          email,
          username,
          submitted: true
        }))
      }
      toast.success('Request submitted successfully')
      refetchStatus()
    },
    onError: async (error: any) => {
      // If duplicate request (409), check status and show existing request
      if (error?.response?.status === 409) {
        setRequestSubmitted(true)
        // Save to localStorage
        if (typeof window !== 'undefined') {
          localStorage.setItem(storageKey, JSON.stringify({
            email,
            username,
            submitted: true
          }))
        }
        // Check status to get the existing request
        await refetchStatus()
        return
      }
      
      const errorMessage = error?.response?.data?.error || 'Failed to submit request'
      // Check if invitation is disabled
      if (errorMessage.toLowerCase().includes('not active') || (error?.response?.status === 400 && errorMessage.toLowerCase().includes('invitation'))) {
        setIsInvitationDisabled(true)
      }
      toast.error(errorMessage)
    }
  })

  const completeMutation = useMutation({
    mutationFn: (authKey: string) => {
      const statusData = status as any
      const groupName = statusData?.groupName || undefined
      return invitationsAPI.complete(inviteCode, email, username, authKey, groupName)
    },
    onSuccess: async (response) => {
      toast.success('Account created successfully! You can now log in.')
      
      // Invalidate the status query cache to force a fresh fetch
      await queryClient.invalidateQueries({ 
        queryKey: ['invite-status', inviteCode, email, username] 
      })
      
      // Immediately refetch status with fresh data
      await refetchStatus()
      
      // Keep polling for a bit to ensure we get the updated status (in case of any delay)
      let pollCount = 0
      const pollInterval = setInterval(async () => {
        pollCount++
        // Invalidate and refetch to ensure fresh data
        await queryClient.invalidateQueries({ 
          queryKey: ['invite-status', inviteCode, email, username] 
        })
        const result = await refetchStatus()
        if (result.data?.status === 'completed') {
          clearInterval(pollInterval)
        }
        // Stop polling after 10 attempts (10 seconds)
        if (pollCount >= 10) {
          clearInterval(pollInterval)
        }
      }, 1000)
    },
    onError: (error: any) => {
      const errorCode = error?.response?.data?.error
      if (errorCode === 'EMAIL_MISMATCH') {
        setEmailMismatchError(true)
        setIsCreatingUser(false)
        // Stop polling
        if (oauthPollerRef.current) {
          clearInterval(oauthPollerRef.current)
          oauthPollerRef.current = null
        }
        // Persist email mismatch error to localStorage
        if (typeof window !== 'undefined') {
          const saved = localStorage.getItem(storageKey)
          try {
            const parsed = saved ? JSON.parse(saved) : {}
            localStorage.setItem(storageKey, JSON.stringify({
              ...parsed,
              email,
              username,
              submitted: true,
              emailMismatchError: true
            }))
          } catch {
            // Ignore parse errors
          }
        }
      } else {
        toast.error(error?.response?.data?.error || error?.response?.data?.message || 'Failed to complete account creation')
      }
    }
  })

  // Check if email exists
  const checkEmail = React.useCallback(async (emailValue: string) => {
    if (!emailValue.trim()) {
      setEmailError(null)
      setIsCheckingEmail(false)
      return
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(emailValue.trim())) {
      setEmailError(null) // Don't show error for invalid format, let browser handle it
      setIsCheckingEmail(false)
      return
    }

    setIsCheckingEmail(true)
    try {
      const result = await usersAPI.check(emailValue.trim(), undefined)
      if (result.exists && result.conflicts.email) {
        setEmailError('This email is already registered')
      } else {
        setEmailError(null)
      }
    } catch (error: any) {
      // Silently fail validation check - don't show error toast
      setEmailError(null)
    } finally {
      setIsCheckingEmail(false)
    }
  }, [])

  // Check if username exists
  const checkUsername = React.useCallback(async (usernameValue: string) => {
    if (!usernameValue.trim()) {
      setUsernameError(null)
      setIsCheckingUsername(false)
      return
    }

    setIsCheckingUsername(true)
    try {
      const result = await usersAPI.check(undefined, usernameValue.trim())
      if (result.exists && result.conflicts.username) {
        setUsernameError('This username is already taken')
      } else {
        setUsernameError(null)
      }
    } catch (error: any) {
      // Silently fail validation check - don't show error toast
      setUsernameError(null)
    } finally {
      setIsCheckingUsername(false)
    }
  }, [])

  // Handle email change with debounce
  const handleEmailChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setEmail(value)
    setEmailError(null) // Clear error immediately when typing
    
    // Clear existing timer
    if (emailCheckTimerRef.current) {
      clearTimeout(emailCheckTimerRef.current)
    }
    
    // Debounce the check
    emailCheckTimerRef.current = setTimeout(() => {
      checkEmail(value)
    }, 500) // Wait 500ms after user stops typing
  }, [checkEmail])

  // Handle username change with debounce
  const handleUsernameChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setUsername(value)
    setUsernameError(null) // Clear error immediately when typing
    
    // Clear existing timer
    if (usernameCheckTimerRef.current) {
      clearTimeout(usernameCheckTimerRef.current)
    }
    
    // Debounce the check
    usernameCheckTimerRef.current = setTimeout(() => {
      checkUsername(value)
    }, 500) // Wait 500ms after user stops typing
  }, [checkUsername])

  // Cleanup timers on unmount
  React.useEffect(() => {
    return () => {
      if (emailCheckTimerRef.current) {
        clearTimeout(emailCheckTimerRef.current)
      }
      if (usernameCheckTimerRef.current) {
        clearTimeout(usernameCheckTimerRef.current)
      }
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !username.trim()) {
      toast.error('Please fill in all fields')
      return
    }
    if (emailError || usernameError) {
      toast.error('Please fix the errors before submitting')
      return
    }

    // Submit the request - backend will return 409 if a duplicate exists
    submitMutation.mutate()
  }

  const handleOAuthAuthKey = async (authKey: string) => {
    console.log('[InvitePage] handleOAuthAuthKey called with authKey:', authKey ? 'present' : 'missing')
    setAuthKey(authKey)
    
    // Mark that we're manually completing OAuth to prevent polling from interfering
    setIsCreatingUser(true)
    
    // Stop OAuth polling since we're manually completing
    if (oauthPollerRef.current) {
      clearInterval(oauthPollerRef.current)
      oauthPollerRef.current = null
    }
    
    // Call the mutation to create the user
    console.log('[InvitePage] Calling completeMutation.mutate')
    completeMutation.mutate(authKey, {
      onSuccess: () => {
        console.log('[InvitePage] completeMutation succeeded')
        setIsCreatingUser(false)
      },
      onError: (error: any) => {
        console.error('[InvitePage] completeMutation failed:', error)
        setIsCreatingUser(false)
        // Error handling is already in completeMutation.onError
      }
    })
  }

  const pollOAuthCompletion = React.useCallback(async () => {
    const statusData = status as any
    if (statusData?.status === 'completed') {
      if (oauthPollerRef.current) {
        clearInterval(oauthPollerRef.current)
        oauthPollerRef.current = null
      }
      return
    }
    
    // Don't poll if there's an email mismatch error (already failed once)
    if (emailMismatchError) {
      return
    }
    
    if (!statusData?.oauthCode || !statusData?.oauthLink || statusData?.status !== 'accepted') {
      return
    }

    if (statusData.oauthExpiresAt && new Date(statusData.oauthExpiresAt) < new Date()) {
      return
    }

    // Don't poll if we're already creating a user
    if (isCreatingUser || completeMutation.isPending) {
      return
    }

    try {
      // Use full origin for localhost to ensure Stremio recognizes it
      const host = window.location?.host || window.location?.hostname || 'syncio.app'
      const origin = window.location?.origin || `http://${host}`
      console.log('[InvitePage] Polling Stremio OAuth with host:', host, 'origin:', origin, 'code:', status.oauthCode?.substring(0, 4) + '...')
      const response = await fetch(
        `https://link.stremio.com/api/v2/read?type=Read&code=${encodeURIComponent(status.oauthCode)}`,
        {
          headers: {
            'X-Requested-With': host,
            'Origin': origin,
          },
          referrerPolicy: 'no-referrer',
        }
      )

      const data = await response.json().catch(() => ({}))
      if (!data) return

      if (data?.result?.success && data.result.authKey) {
        if (statusData?.status === 'completed') {
          if (oauthPollerRef.current) {
            clearInterval(oauthPollerRef.current)
            oauthPollerRef.current = null
          }
          return
        }
        
        const oauthCodeKey = statusData.oauthCode || ''
        if (hasAttemptedCreationRef.current.has(oauthCodeKey)) {
          return
        }

        // Check if we've had too many verification failures
        const failureCount = verificationFailureCountRef.current.get(oauthCodeKey) || 0
        if (failureCount >= 3) {
          // Stop polling
          if (oauthPollerRef.current) {
            clearInterval(oauthPollerRef.current)
            oauthPollerRef.current = null
          }
          return
        }

        setIsCreatingUser(true)
        hasAttemptedCreationRef.current.add(oauthCodeKey)

        // Get user info from Stremio response
        const stremioUser =
          data.result.user && typeof data.result.user === 'object'
            ? {
                username: data.result.user.username,
                email: data.result.user.email,
              }
            : undefined

        // Try to verify authKey, but don't fail if it doesn't work
        let verifiedUser: { username?: string; email?: string } | undefined
        try {
          const verification = await usersAPI.verifyAuthKey({
            authKey: data.result.authKey,
          })
          verifiedUser = verification?.user || undefined
        } catch (error) {
          // Silently fallback to Stremio user data if verification fails
          // This is expected in some cases (e.g., new Stremio accounts)
        }

        // Use verified user if available, otherwise fallback to Stremio user data
        if (!verifiedUser && stremioUser) {
          verifiedUser = stremioUser
        }

        if (!verifiedUser) {
          setIsCreatingUser(false)
          return
        }

        // Use the original email and username from the request form (not from Stremio)
        // This ensures we match the request that was originally submitted
        const finalEmail = email.trim().toLowerCase()
        const finalUsername = username.trim()

        const groupName = statusData.groupName || undefined

        // Create the user via the complete endpoint
        try {
          await invitationsAPI.complete(inviteCode, finalEmail, finalUsername, data.result.authKey, groupName)
          // Refetch status to get updated 'completed' status
          await refetchStatus()
          toast.success('Account created successfully!')
          // Stop polling since user is created
          if (oauthPollerRef.current) {
            clearInterval(oauthPollerRef.current)
            oauthPollerRef.current = null
          }
        } catch (error: any) {
          
          // Check for email mismatch error
          const errorCode = error?.response?.data?.error
          if (errorCode === 'EMAIL_MISMATCH') {
            setEmailMismatchError(true)
            setIsCreatingUser(false)
            // Stop polling
            if (oauthPollerRef.current) {
              clearInterval(oauthPollerRef.current)
              oauthPollerRef.current = null
            }
            // Persist email mismatch error to localStorage
            if (typeof window !== 'undefined') {
              const saved = localStorage.getItem(storageKey)
              try {
                const parsed = saved ? JSON.parse(saved) : {}
                localStorage.setItem(storageKey, JSON.stringify({
                  ...parsed,
                  email: email.trim(),
                  username: username.trim(),
                  submitted: true,
                  emailMismatchError: true
                }))
              } catch {
                // Ignore parse errors
              }
            }
            return
          }
          
          // Check if user was actually created (might be a partial success)
          const errorMessage = error?.response?.data?.error || error?.response?.data?.message || ''
          const errorStatus = error?.response?.status
          const isUserExists = errorMessage.toLowerCase().includes('already exists') || errorMessage.toLowerCase().includes('already registered')
          const isAuthKeyError = errorMessage.toLowerCase().includes('failed to verify') || errorMessage.toLowerCase().includes('invalid stremio auth key')
          const isNotFound = errorStatus === 404
          
          // If 404, check if request is already completed
          if (isNotFound) {
            // Refetch status to check current state
            const statusResult = await refetchStatus()
            if (statusResult.data?.status === 'completed') {
              toast.success('Account already created!')
              if (oauthPollerRef.current) {
                clearInterval(oauthPollerRef.current)
                oauthPollerRef.current = null
              }
              setIsCreatingUser(false)
              return
            } else if (error?.response?.data?.status === 'completed') {
              // Response indicates completed status
              await refetchStatus()
              toast.success('Account already created!')
              if (oauthPollerRef.current) {
                clearInterval(oauthPollerRef.current)
                oauthPollerRef.current = null
              }
              setIsCreatingUser(false)
              return
            } else {
              // Real 404 error - request not found
              // Stop polling to prevent spam
              if (oauthPollerRef.current) {
                clearInterval(oauthPollerRef.current)
                oauthPollerRef.current = null
              }
              setIsCreatingUser(false)
              // Don't show error toast for 404, just stop polling
              return
            }
          }
          
          if (isUserExists || error?.response?.status === 409) {
            // User already exists - this is actually a success case
            await refetchStatus()
            toast.success('Account already exists!')
            // Stop polling
            if (oauthPollerRef.current) {
              clearInterval(oauthPollerRef.current)
              oauthPollerRef.current = null
            }
          } else if (isAuthKeyError) {
            // Auth key verification failed - increment failure count
            const currentFailures = verificationFailureCountRef.current.get(oauthCodeKey) || 0
            verificationFailureCountRef.current.set(oauthCodeKey, currentFailures + 1)
            
            setIsCreatingUser(false)
            // Remove from attempted set so we can retry (but track failures)
            hasAttemptedCreationRef.current.delete(oauthCodeKey)
            
            // If too many failures, stop polling and show error
            if (currentFailures + 1 >= 3) {
              if (oauthPollerRef.current) {
                clearInterval(oauthPollerRef.current)
                oauthPollerRef.current = null
              }
              toast.error('Failed to verify Stremio authentication. Please try refreshing the OAuth link.')
            }
          } else {
            // Other errors
            toast.error(errorMessage || 'Failed to create account')
            setIsCreatingUser(false)
            // Remove from attempted set so we can retry
            hasAttemptedCreationRef.current.delete(oauthCodeKey)
          }
        }
      }
    } catch (error) {
      // Silently handle polling errors
    }
  }, [status, inviteCode, email, username, isCreatingUser, completeMutation.isPending, refetchStatus, emailMismatchError])

  React.useEffect(() => {
    if (oauthPollerRef.current) {
      clearInterval(oauthPollerRef.current)
      oauthPollerRef.current = null
    }

    // Don't poll if there's an email mismatch error
    if (emailMismatchError) {
      return
    }

    const statusData = status as any
    if (statusData?.status === 'completed') {
      return
    }

    if (statusData?.status === 'accepted' && statusData?.oauthCode && statusData?.oauthLink && !isCreatingUser && !completeMutation.isPending) {
      if (!statusData.oauthExpiresAt || new Date(statusData.oauthExpiresAt) > new Date()) {
        const pollHandler = () => {
          pollOAuthCompletion()
        }
        oauthPollerRef.current = window.setInterval(pollHandler, 5000)
        pollHandler() // Poll immediately
      }
    }

    return () => {
      if (oauthPollerRef.current) {
        clearInterval(oauthPollerRef.current)
        oauthPollerRef.current = null
      }
    }
  }, [status, pollOAuthCompletion, isCreatingUser, completeMutation.isPending, emailMismatchError])

  const handleGenerateOAuth = async () => {
    if (!email || !username) return
    
    setIsGeneratingOAuth(true)
    try {
      await invitationsAPI.generateOAuth(inviteCode, email, username)
      setOauthLinkGenerated(true)
      // Invalidate invitations query so admin page sees the update immediately
      await queryClient.invalidateQueries({ queryKey: ['invitations'] })
      // Refetch status to get the new OAuth link
      refetchStatus()
      toast.success('OAuth link generated successfully')
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to generate OAuth link')
    } finally {
      setIsGeneratingOAuth(false)
    }
  }

  // Reset form and start a new request
  const handleNewRequest = () => {
    // Clear localStorage and reset form
    if (typeof window !== 'undefined') {
      localStorage.removeItem(storageKey)
    }
    setEmailMismatchError(false)
    setRequestSubmitted(false)
    setEmail('')
    setUsername('')
    setOauthLinkGenerated(false)
    setEmailError(null)
    setUsernameError(null)
    // Re-check invitation status when starting new request
    setIsCheckingInvitation(true)
    invitationsAPI.checkInvitation(inviteCode)
      .then((data) => {
        setIsInvitationNotFound(false)
        const isMaxUsesReached = data.maxUses != null && data.currentUses >= data.maxUses
        setIsInvitationDisabled(!data.isActive || isMaxUsesReached)
      })
      .catch((error: any) => {
        if (error?.response?.status === 404) {
          setIsInvitationNotFound(true)
          setIsInvitationDisabled(false)
        } else {
          setIsInvitationNotFound(false)
          setIsInvitationDisabled(true)
        }
      })
      .finally(() => {
        setIsCheckingInvitation(false)
      })
  }

  if (!inviteCode) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <XCircle className="w-16 h-16 mx-auto mb-4 text-red-500" />
          <h1 className="text-2xl font-bold mb-2">Invalid Invitation</h1>
          <p className="text-gray-600">The invitation link is invalid.</p>
        </div>
      </div>
    )
  }

  const statusData = status as any
  const showNewRequestButton = requestSubmitted || emailMismatchError || statusData?.status || statusError || isInvitationDisabled

  // determine which page to show
  const renderPageContent = () => {
    if (isCheckingInvitation) return null

    // error states first
    if (emailMismatchError) {
      return (
        <StatusPage
          icon={XCircle}
          iconColor="text-red-500"
          title="Wrong Stremio Account"
          borderColor="border-red-500"
        >
          <p className="text-sm mb-0" style={{ color: 'var(--color-text-secondary)' }}>
            The request was made with a different email address than the one associated with your Stremio account.
          </p>
          <p className="text-sm mt-2 mb-0" style={{ color: 'var(--color-text-secondary)' }}>
            Please make a new request with matching emails.
          </p>
        </StatusPage>
      )
    }

    if (isInvitationNotFound) {
      return (
        <StatusPage
          icon={XCircle}
          iconColor="text-red-500"
          title="Wrong Invite Link"
          borderColor="border-red-500"
        >
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            The request ID you're trying to access doesn't exist or is invalid. Please check your invitation link.
          </p>
        </StatusPage>
      )
    }

    if (statusError && requestSubmitted && ((statusError as any)?.response?.status === 404 || (statusError as any)?.response?.status === 400)) {
      return (
        <StatusPage
          icon={XCircle}
          iconColor="text-red-500"
          title="Wrong Invite Link"
          borderColor="border-red-500"
          headerContent={
            <div className="flex items-center gap-2 mb-2">
              <XCircle className="w-5 h-5 text-red-500" />
              <span className="font-medium text-red-500">Wrong Request ID</span>
            </div>
          }
          footerContent={
            <button
              onClick={handleNewRequest}
              className="w-full px-4 py-2 rounded-lg transition-colors color-surface hover:opacity-90 mt-4"
            >
              Submit New Request
            </button>
          }
        >
          <p className="text-sm mb-0" style={{ color: 'var(--color-text-secondary)' }}>
            The request ID you're trying to access doesn't exist or is invalid. Please check your invitation link.
          </p>
        </StatusPage>
      )
    }

    if (statusData?.status === 'completed' && !isInvitationNotFound) {
      return (
        <StatusPage
          icon={CheckCircle}
          iconColor="text-green-500"
          title="Successfully Joined Syncio!"
          borderColor="border-green-500"
        >
          <p className="text-sm mb-0" style={{ color: 'var(--color-text-secondary)' }}>
            Your account has been created successfully. You can now log in to Syncio.
          </p>
        </StatusPage>
      )
    }

    if (isInvitationDisabled && (!email || !username || (!isLoadingStatus && status !== undefined && statusData?.status !== 'completed'))) {
      return (
        <StatusPage
          icon={XCircle}
          iconColor="text-red-500"
          title="Invite Link Disabled"
          borderColor="border-red-500"
        >
          <p className="text-sm mb-0" style={{ color: 'var(--color-text-secondary)' }}>
            This invitation has been disabled by the administrator. The invitation needs to be enabled back or a new one generated.
          </p>
        </StatusPage>
      )
    }

    if (statusData?.status === 'pending') {
      return (
        <StatusPage
          icon={Clock}
          iconColor="text-yellow-500"
          title="Request Pending"
          borderColor="border-yellow-500"
        >
          <p className="text-sm mb-0" style={{ color: 'var(--color-text-secondary)' }}>
            Your request is pending approval. This page will automatically update when your request is reviewed.
          </p>
        </StatusPage>
      )
    }

    if (statusData?.status === 'rejected') {
      return (
        <StatusPage
          icon={XCircle}
          iconColor="#ef4444"
          title="Rejected Request"
          borderColor="border-red-500"
        >
          <p className="text-sm mb-0" style={{ color: 'var(--color-text-secondary)' }}>
            Your request has been rejected. Please contact the administrator for more information.
          </p>
        </StatusPage>
      )
    }

    if (statusData?.status === 'accepted') {
      const isOAuthExpired = statusData?.oauthExpiresAt && new Date(statusData.oauthExpiresAt) < new Date()
      if (isOAuthExpired) {
        return (
          <StatusPage
            icon={XCircle}
            iconColor="#ef4444"
            title="OAuth Link Expired"
            borderColor="border-red-500"
          >
            <p className="text-sm mb-0" style={{ color: 'var(--color-text-secondary)' }}>
              Contact your administrator to generate a new one.
            </p>
            <p className="text-sm mt-2 mb-0" style={{ color: 'var(--color-text-secondary)' }}>
              This page will refresh automatically once generated.
            </p>
          </StatusPage>
        )
      }
      return (
        <RequestAcceptedPage
          oauthLink={statusData?.oauthLink || null}
          oauthCode={statusData?.oauthCode || null}
          oauthExpiresAt={statusData?.oauthExpiresAt || null}
          oauthLinkGenerated={oauthLinkGenerated}
          oauthKeyVersion={oauthKeyVersion}
          isGeneratingOAuth={isGeneratingOAuth}
          isCompleting={completeMutation.isPending}
          onGenerateOAuth={handleGenerateOAuth}
          onAuthKey={handleOAuthAuthKey}
        />
      )
    }

    if ((!isMounted || !requestSubmitted) && !isInvitationDisabled && !statusData?.status) {
      return (
        <RequestAccessForm
          email={email}
          username={username}
          emailError={emailError}
          usernameError={usernameError}
          isCheckingEmail={isCheckingEmail}
          isCheckingUsername={isCheckingUsername}
          isSubmitting={submitMutation.isPending}
          onEmailChange={handleEmailChange}
          onUsernameChange={handleUsernameChange}
          onSubmit={handleSubmit}
        />
      )
    }

    // status error fallback
    if (statusError && ((statusError as any)?.response?.status === 404 || (statusError as any)?.response?.status === 400)) {
      return (
        <StatusPage
          icon={XCircle}
          iconColor="text-red-500"
          title="Wrong Invite Link"
          borderColor="border-red-500"
          headerContent={
            <div className="flex items-center gap-2 mb-2">
              <XCircle className="w-5 h-5 text-red-500" />
              <span className="font-medium text-red-500">Wrong Request ID</span>
            </div>
          }
          footerContent={
            <button
              onClick={handleNewRequest}
              className="w-full px-4 py-2 rounded-lg transition-colors color-surface hover:opacity-90 mt-4"
            >
              Submit New Request
            </button>
          }
        >
          <p className="text-sm mb-0" style={{ color: 'var(--color-text-secondary)' }}>
            The request ID you're trying to access doesn't exist or is invalid. Please check your invitation link.
          </p>
        </StatusPage>
      )
    }

    return null
  }

  return (
    <InvitePageLayout
      showNewRequestButton={showNewRequestButton}
      onNewRequest={handleNewRequest}
    >
      {renderPageContent()}
    </InvitePageLayout>
  )
}

