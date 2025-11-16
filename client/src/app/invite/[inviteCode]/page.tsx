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
import { RequestRenewedPage } from './components/RequestRenewedPage'
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
        // Restore email/username for convenience, but NEVER restore requestSubmitted
        // requestSubmitted should only be true when user explicitly clicks submit
        // This prevents auto-redirect when typing matching email/username
        return {
          email: parsed.email || '',
          username: parsed.username || '',
          requestSubmitted: false, // Always start as false, never restore from localStorage
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
  
  
  // Email mismatch error state - initialized from localStorage synchronously
  const [emailMismatchError, setEmailMismatchError] = React.useState(initialState.emailMismatchError)
  
  // Validation errors for form fields
  const [emailError, setEmailError] = React.useState<string | null>(null)
  const [usernameError, setUsernameError] = React.useState<string | null>(null)

  React.useEffect(() => {
    setIsMounted(true)
    // Don't sync requestSubmitted from localStorage here - only restore on initial mount via getInitialState()
    // This prevents auto-submission when user types matching email/username
  }, [storageKey])

  React.useEffect(() => {
    if (!isMounted || !inviteCode) {
      setIsCheckingInvitation(false)
      return
    }
    
    setIsCheckingInvitation(true)
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
  }, [isMounted, inviteCode])

  const [authKey, setAuthKey] = React.useState<string | null>(null)
  const [oauthLinkGenerated, setOauthLinkGenerated] = React.useState(false)
  const [isGeneratingOAuth, setIsGeneratingOAuth] = React.useState(false)
  const [lastOAuthLink, setLastOAuthLink] = React.useState<string | null>(null)
  const [lastOAuthCode, setLastOAuthCode] = React.useState<string | null>(null)
  const [isRenewed, setIsRenewed] = React.useState(false)
  const [oauthKeyVersion, setOauthKeyVersion] = React.useState(0)
  const oauthPollerRef = React.useRef<number | null>(null)
  const currentPollingOAuthCodeRef = React.useRef<string | null>(null)
  const [isCreatingUser, setIsCreatingUser] = React.useState(false)
  const hasAttemptedCreationRef = React.useRef<Set<string>>(new Set())
  const verificationFailureCountRef = React.useRef<Map<string, number>>(new Map())
  // Only check status when request has been submitted, not while typing
  const shouldCheckStatus = requestSubmitted
  
  const { data: status, dataUpdatedAt, refetch: refetchStatus, error: statusError, isLoading: isLoadingStatus } = useQuery({
    queryKey: ['invite-status', inviteCode, email, username],
    queryFn: () => invitationsAPI.checkStatus(inviteCode, email, username),
    enabled:
      isMounted &&
      shouldCheckStatus &&
      !!email &&
      !!username &&
      !isInvitationNotFound,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      const queryData = query.state?.data as any
      // Stop polling if completed
      if (queryData?.status === 'completed') {
        return false
      }
      // Stop polling if rejected (no point checking)
      if (queryData?.status === 'rejected') {
        return false
      }
      // Only poll if we're waiting for something:
      // - pending: waiting for admin to accept/reject
      // - accepted (with or without OAuth link): waiting for OAuth link generation, completion, or expiration
      if (queryData?.status === 'pending') {
        return 2000 // Poll every 2s for pending requests
      }
      if (queryData?.status === 'accepted') {
        // Poll every 5s for accepted requests (renewed or with OAuth link)
        return 5000
      }
      // Default: don't poll
      return false
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
        setOauthLinkGenerated(false)
        setEmailMismatchError(false)
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
    const linkCleared = prevLink !== null && currentLink === null
    
    // Detect renewed state: if status is 'accepted' but oauthLink is null
    // This can happen on initial load (refresh) when OAuth was cleared
    const isInitialLoad = prevLink === null && prevCode === null && prevStatus === null
    // On initial load, if status is 'accepted' but oauthLink is null, it means OAuth was cleared (renewed)
    const isRenewedState = currentStatus === 'accepted' && currentLink === null
    
    if (linkCleared || (isInitialLoad && isRenewedState)) {
      // Also set requestSubmitted to true so status query continues to run
      if (!requestSubmitted) {
        setRequestSubmitted(true)
      }
      setOauthLinkGenerated(false)
      setLastOAuthLink(null)
      setLastOAuthCode(null)
      setOauthKeyVersion(prev => prev + 1)
      setIsRenewed(true)
      prevLinkRef.current = currentLink
      prevCodeRef.current = currentCode
    }
    
    if (statusChanged && currentStatus === 'completed') {
      setIsRenewed(false)
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
    // Initialize refs on first load
    if (prevLinkRef.current === null && currentLink !== null) prevLinkRef.current = currentLink
    if (prevCodeRef.current === null && currentCode !== null) prevCodeRef.current = currentCode
    if (prevStatusRef.current === null && currentStatus !== null) prevStatusRef.current = currentStatus
  }, [status, dataUpdatedAt, requestSubmitted])

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
      const errorMessage = error?.response?.data?.error || 'Failed to submit request'
      
      // If 409, check what type of error it is
      if (error?.response?.status === 409) {
        const errorCode = error?.response?.data?.error
        
        // If user already exists, show error under appropriate field and stay on form
        if (errorCode === 'EMAIL_EXISTS' || errorCode === 'EMAIL_AND_USERNAME_EXIST') {
          setEmailError(error?.response?.data?.message || 'This email is already registered')
        }
        if (errorCode === 'USERNAME_EXISTS' || errorCode === 'EMAIL_AND_USERNAME_EXIST') {
          setUsernameError(error?.response?.data?.message || 'This username is already taken')
        }
        if (errorCode === 'EMAIL_EXISTS' || errorCode === 'USERNAME_EXISTS' || errorCode === 'EMAIL_AND_USERNAME_EXIST') {
          return // Don't navigate, stay on form
        }
        
        // If duplicate request exists, navigate to status page
        if (errorMessage.toLowerCase().includes('request already exists')) {
          setRequestSubmitted(true)
          setEmailError('')
          setUsernameError('')
          // Save to localStorage
          if (typeof window !== 'undefined') {
            localStorage.setItem(storageKey, JSON.stringify({
              email,
              username,
              submitted: true
            }))
          }
          // Wait a bit for state to update, then check status
          setTimeout(async () => {
            try {
              await refetchStatus()
            } catch (err) {
              console.error('Failed to refetch status:', err)
            }
          }, 100)
          return // Don't show error toast, we're handling it
        }
      }
      
      // Check if invitation is disabled
      if (errorMessage.toLowerCase().includes('not active') || (error?.response?.status === 400 && errorMessage.toLowerCase().includes('invitation'))) {
        setIsInvitationDisabled(true)
      }
      
      // Only show error toast if we haven't handled it above
      toast.error(errorMessage)
    }
  })

  const completeMutation = useMutation({
    mutationFn: (authKey: string) => {
      const statusData = status as any
      const groupName = statusData?.groupName || undefined
      
      // Use email/username from status if form state is missing (e.g., on "Request Renewed" page)
      const finalEmail = email || statusData?.email || ''
      const finalUsername = username || statusData?.username || ''
      
      console.log('[InvitePage] completeMutation.mutationFn called with:', {
        inviteCode,
        email: finalEmail,
        username: finalUsername,
        emailFromForm: email,
        emailFromStatus: statusData?.email,
        usernameFromForm: username,
        usernameFromStatus: statusData?.username,
        authKeyLength: authKey?.length,
        groupName
      })
      
      if (!finalEmail || !finalUsername) {
        throw new Error('Email and username are required')
      }
      if (!authKey) {
        throw new Error('Auth key is required')
      }
      return invitationsAPI.complete(inviteCode, finalEmail, finalUsername, authKey, groupName)
    },
    onSuccess: async (response) => {
      setIsCreatingUser(false)
      
      // Stop OAuth polling
      if (oauthPollerRef.current) {
        clearInterval(oauthPollerRef.current)
        oauthPollerRef.current = null
      }
      
      // Invalidate the status query cache to force a fresh fetch
      await queryClient.invalidateQueries({ 
        queryKey: ['invite-status', inviteCode, email, username] 
      })
      
      // Immediately refetch status with fresh data
      const result = await refetchStatus()
      
      // If status is already completed, we're done
      if (result.data?.status === 'completed') {
        toast.success('Account created successfully! You can now log in.')
        return
      }
      
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
          toast.success('Account created successfully! You can now log in.')
        }
        // Stop polling after 10 attempts (10 seconds)
        if (pollCount >= 10) {
          clearInterval(pollInterval)
          // Even if polling times out, try one more refetch
          await refetchStatus()
        }
      }, 500) // Poll more frequently (500ms instead of 1000ms)
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

  // Handle email change
  const handleEmailChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value)
    setEmailError(null) // Clear error when user types
  }, [])

  // Handle username change
  const handleUsernameChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setUsername(e.target.value)
    setUsernameError(null) // Clear error when user types
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !username.trim()) {
      toast.error('Please fill in all fields')
      return
    }

    // Submit the request - backend will validate and return errors if needed
    submitMutation.mutate()
  }

  const handleOAuthAuthKey = async (authKey: string) => {
    console.log('[InvitePage] handleOAuthAuthKey called with authKey:', authKey ? 'present' : 'missing')
    const statusData = status as any
    // Use email/username from status if form state is missing (e.g., on "Request Renewed" page)
    const finalEmail = email || statusData?.email || ''
    const finalUsername = username || statusData?.username || ''
    console.log('[InvitePage] Current state - email:', finalEmail, 'username:', finalUsername, 'inviteCode:', inviteCode)
    console.log('[InvitePage] Email sources - form:', email, 'status:', statusData?.email)
    console.log('[InvitePage] Username sources - form:', username, 'status:', statusData?.username)
    
    // Validate required fields
    if (!finalEmail || !finalUsername) {
      const error = new Error('Email and username are required to complete OAuth')
      console.error('[InvitePage] Missing email or username:', { 
        email: finalEmail, 
        username: finalUsername,
        emailFromForm: email,
        emailFromStatus: statusData?.email,
        usernameFromForm: username,
        usernameFromStatus: statusData?.username
      })
      toast.error('Email and username are required. Please submit a request first.')
      throw error
    }
    
    if (!authKey) {
      const error = new Error('Auth key is required')
      console.error('[InvitePage] Missing authKey')
      toast.error('Authentication key is missing. Please try again.')
      throw error
    }
    
    setAuthKey(authKey)
    
    // Mark that we're manually completing OAuth to prevent polling from interfering
    setIsCreatingUser(true)
    
    // Stop OAuth polling since we're manually completing
    if (oauthPollerRef.current) {
      clearInterval(oauthPollerRef.current)
      oauthPollerRef.current = null
    }
    
    // Call the mutation to create the user and wait for it to complete
    // Using mutateAsync to get a promise that resolves when the mutation completes
    console.log('[InvitePage] Calling completeMutation.mutateAsync with:', {
      inviteCode,
      email,
      username,
      authKeyLength: authKey?.length,
      hasGroupName: !!(status as any)?.groupName
    })
    try {
      const result = await completeMutation.mutateAsync(authKey)
      console.log('[InvitePage] completeMutation completed successfully, result:', result)
      // The mutation's onSuccess handler will handle refetching status and showing success
    } catch (error: any) {
      console.error('[InvitePage] completeMutation failed:', error)
      console.error('[InvitePage] Error details:', {
        message: error?.message,
        response: error?.response,
        status: error?.response?.status,
        data: error?.response?.data
      })
      setIsCreatingUser(false)
      // The mutation's onError handler will handle error display, but we also show a toast here
      const errorMessage = error?.response?.data?.error || error?.response?.data?.message || error?.message || 'Failed to complete account creation'
      toast.error(errorMessage)
      throw error // Re-throw so StremioOAuthCard can handle it
    }
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
        const verifiedUser =
          data.result.user && typeof data.result.user === 'object'
            ? {
                username: data.result.user.username,
                email: data.result.user.email,
              }
            : undefined

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
    // Don't poll if there's an email mismatch error
    if (emailMismatchError) {
      if (oauthPollerRef.current) {
        clearInterval(oauthPollerRef.current)
        oauthPollerRef.current = null
        currentPollingOAuthCodeRef.current = null
      }
      return
    }

    const statusData = status as any
    if (statusData?.status === 'completed') {
      if (oauthPollerRef.current) {
        clearInterval(oauthPollerRef.current)
        oauthPollerRef.current = null
        currentPollingOAuthCodeRef.current = null
      }
      return
    }

    // Don't set up polling if StremioOAuthCard is active (it handles its own polling)
    // StremioOAuthCard is rendered on "Request Accepted" and "Request Renewed" pages when there's an OAuth link
    // So we skip pollOAuthCompletion when we have a valid OAuth link to avoid duplicate polling
    const hasOAuthLink = statusData?.oauthCode && statusData?.oauthLink
    const isOAuthValid = !statusData?.oauthExpiresAt || new Date(statusData.oauthExpiresAt) > new Date()
    const isStremioOAuthCardActive = statusData?.status === 'accepted' && hasOAuthLink && isOAuthValid
    
    // Only poll if StremioOAuthCard is NOT active (fallback for edge cases)
    if (statusData?.status === 'accepted' && hasOAuthLink && !isCreatingUser && !completeMutation.isPending && !isStremioOAuthCardActive) {
      if (isOAuthValid) {
        const currentOAuthCode = statusData.oauthCode
        
        // Only set up polling if we're not already polling this OAuth code
        if (currentPollingOAuthCodeRef.current === currentOAuthCode && oauthPollerRef.current) {
          return // Already polling this code, don't recreate interval
        }
        
        // Clean up any existing interval
        if (oauthPollerRef.current) {
          clearInterval(oauthPollerRef.current)
          oauthPollerRef.current = null
        }
        
        // Track which OAuth code we're polling
        currentPollingOAuthCodeRef.current = currentOAuthCode
        
        const pollHandler = () => {
          // Only poll if OAuth code hasn't changed (prevent polling with stale code)
          const currentStatus = status as any
          if (currentStatus?.oauthCode === currentOAuthCode) {
            pollOAuthCompletion()
          } else {
            // OAuth code changed, stop polling
            if (oauthPollerRef.current) {
              clearInterval(oauthPollerRef.current)
              oauthPollerRef.current = null
              currentPollingOAuthCodeRef.current = null
            }
          }
        }
        // Don't call immediately - let the interval handle it to avoid duplicate calls
        oauthPollerRef.current = window.setInterval(pollHandler, 5000)
      } else {
        // OAuth expired, stop polling
        if (oauthPollerRef.current) {
          clearInterval(oauthPollerRef.current)
          oauthPollerRef.current = null
          currentPollingOAuthCodeRef.current = null
        }
      }
    } else {
      // Not in accepted state, missing OAuth, or StremioOAuthCard is handling it - stop polling
      if (oauthPollerRef.current) {
        clearInterval(oauthPollerRef.current)
        oauthPollerRef.current = null
        currentPollingOAuthCodeRef.current = null
      }
    }

    return () => {
      if (oauthPollerRef.current) {
        clearInterval(oauthPollerRef.current)
        oauthPollerRef.current = null
        currentPollingOAuthCodeRef.current = null
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
      
      if (isRenewed) {
        return (
          <RequestRenewedPage
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

  const pageContent = renderPageContent()
  
  // Only show "New Request" button after we've determined the page content
  // Don't show it while checking invitation or if we're on the initial request form
  const showNewRequestButton = !isCheckingInvitation && 
    pageContent !== null && 
    (requestSubmitted || emailMismatchError || statusData?.status || statusError || isInvitationDisabled)

  return (
    <InvitePageLayout
      showNewRequestButton={showNewRequestButton}
      onNewRequest={handleNewRequest}
    >
      {pageContent}
    </InvitePageLayout>
  )
}

