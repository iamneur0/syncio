import React, { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '@/contexts/ThemeContext'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { invitationsAPI, groupsAPI } from '@/services/api'
import { useModalState } from '@/hooks/useCommonState'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import toast from 'react-hot-toast'
import { Mail, Copy, Check, X, ExternalLink, RefreshCw, RotateCcw } from 'lucide-react'
import { ConfirmDialog } from '@/components/modals'
import { EntityList } from '@/components/entities'
import { getEntityColorStyles } from '@/utils/colorMapping'
import { formatDate } from '@/utils/dateUtils'
import { SyncBadge } from '@/components/ui'
import DateTimePicker from '@/components/ui/DateTimePicker'
import { format } from 'date-fns'

interface Invitation {
  id: string
  inviteCode: string
  groupName: string | null
  maxUses: number
  currentUses: number
  expiresAt: string | null
  membershipDurationDays?: number | null
  isActive: boolean
  syncOnJoin: boolean
  createdAt: string
  requests: InviteRequest[]
}

interface InviteRequest {
  id: string
  email: string
  username: string
  status: 'pending' | 'accepted' | 'rejected' | 'completed'
  groupName: string | null
  oauthCode: string | null
  oauthLink: string | null
  oauthExpiresAt: string | null
  createdAt: string
  respondedAt: string | null
}

interface InviteDetailModalProps {
  isOpen: boolean
  onClose: () => void
  invitation: Invitation | null
}

// renders a single request with oauth timer
function RequestItem({ 
  request, 
  themeName, 
  onAccept, 
  onReject, 
  onUndoRejection,
  onRefreshOAuth,
  onDelete,
  isRefreshingOAuth,
  isUndoingRejection,
  isDeleting,
  getRequestStatusBadge,
  isOAuthUsed 
}: { 
  request: InviteRequest
  themeName: string
  onAccept: (id: string) => void
  onReject: (id: string) => void
  onUndoRejection: (id: string) => void
  onRefreshOAuth: (requestId: string) => void
  onDelete: (id: string) => void
  isRefreshingOAuth: boolean
  isUndoingRejection: boolean
  isDeleting: boolean
  getRequestStatusBadge: (status: string, request: InviteRequest) => React.ReactNode
  isOAuthUsed: boolean
}) {
  // get first letter for avatar
  const firstLetter = request.username ? request.username.charAt(0).toUpperCase() : 'U'
  // color based on username char
  const colorIndex = request.username ? request.username.charCodeAt(0) % 10 : 0
  const userColorStyles = getEntityColorStyles(themeName, colorIndex)
  
  const [tick, setTick] = useState(0)
  const oauthExpiresAtTimestamp = request.oauthExpiresAt ? new Date(request.oauthExpiresAt).getTime() : null
  
  // expired if time passed or was used but not completed
  const isOAuthExpired = isOAuthUsed || (oauthExpiresAtTimestamp && oauthExpiresAtTimestamp < Date.now())
  
  const oauthTimeLeft = useMemo(() => {
    if (!oauthExpiresAtTimestamp || isOAuthExpired) return null
    const diff = Math.max(0, oauthExpiresAtTimestamp - Date.now())
    const minutes = Math.floor(diff / 60000)
    const seconds = Math.floor((diff % 60000) / 1000)
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }, [oauthExpiresAtTimestamp, tick, isOAuthExpired])
  
  // tick every second for countdown
  useEffect(() => {
    if (!oauthExpiresAtTimestamp || request.status !== 'accepted' || isOAuthExpired) return
    const timer = setInterval(() => {
      setTick(prev => prev + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [oauthExpiresAtTimestamp, request.status, isOAuthExpired])
  
  return (
    <div className="flex items-center justify-between p-4 rounded-lg border color-border card hover:shadow-lg transition-all">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="flex-shrink-0">
          <div
            className="logo-circle-12 flex items-center justify-center"
            style={{
              background: userColorStyles.background,
              color: userColorStyles.textColor,
            }}
          >
            <span
              className="font-semibold text-lg"
              style={{ color: userColorStyles.textColor }}
            >
              {firstLetter}
            </span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-medium truncate">{request.username}</span>
            {getRequestStatusBadge(request.status, request)}
          </div>
          <p className="text-sm color-text-secondary truncate mb-1">
            {request.email}
          </p>
          <div className="text-xs color-text-secondary">
            Requested: {formatDate(request.createdAt)}
            {request.respondedAt && ` • Responded: ${formatDate(request.respondedAt)}`}
          </div>
        </div>
      </div>
      <div className="flex flex-col items-end gap-2 flex-shrink-0">
        {request.status === 'accepted' && request.oauthCode && !isOAuthExpired && (
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs font-mono color-text-secondary">Code: {request.oauthCode}</span>
            {oauthTimeLeft && (
              <span className="text-xs color-text-secondary">Expires in: {oauthTimeLeft}</span>
            )}
          </div>
        )}
        <div className="flex items-center gap-2">
        {request.status === 'pending' && (
          <>
            <button
              type="button"
              onClick={() => onAccept(request.id)}
              className="p-2 rounded-lg transition-colors color-text color-hover"
              title="Accept"
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onReject(request.id)}
              className="p-2 rounded-lg transition-colors color-text color-hover"
              title="Reject"
            >
              <X className="w-4 h-4" />
            </button>
          </>
        )}
        {request.status === 'rejected' && (
          <>
            <button
              type="button"
              onClick={() => onUndoRejection(request.id)}
              disabled={isUndoingRejection}
              className="p-2 rounded-lg transition-colors color-text color-hover disabled:opacity-50"
              title="Undo rejection"
            >
              <RotateCcw className={`w-4 h-4 ${isUndoingRejection ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => onDelete(request.id)}
              disabled={isDeleting}
              className="p-2 rounded-lg transition-colors color-text color-hover disabled:opacity-50"
              title="Delete request"
            >
              <X className={`w-4 h-4 ${isDeleting ? 'animate-spin' : ''}`} />
            </button>
          </>
        )}
        {request.status === 'accepted' && (
          <>
            {request.oauthLink && (
              <>
                <a
                  href={request.oauthLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg transition-colors color-text color-hover"
                  title="Open OAuth link"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
                <button
                  type="button"
                  onClick={() => onRefreshOAuth(request.id)}
                  disabled={isRefreshingOAuth}
                  className="p-2 rounded-lg transition-colors color-text color-hover disabled:opacity-50"
                  title="Clear OAuth link (user can generate new one)"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshingOAuth ? 'animate-spin' : ''}`} />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => onDelete(request.id)}
              disabled={isDeleting}
              className="p-2 rounded-lg transition-colors color-text color-hover disabled:opacity-50"
              title="Delete request"
            >
              <X className={`w-4 h-4 ${isDeleting ? 'animate-spin' : ''}`} />
            </button>
          </>
        )}
        </div>
      </div>
    </div>
  )
}

export default function InviteDetailModal({
  isOpen,
  onClose,
  invitation
}: InviteDetailModalProps) {
  const { theme: themeName } = useTheme()
  const { mounted } = useModalState()
  const queryClient = useQueryClient()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [requestToReject, setRequestToReject] = useState<string | null>(null)
  const [oauthUsedRequests, setOauthUsedRequests] = useState<Set<string>>(new Set())
  const [renewedRequests, setRenewedRequests] = useState<Set<string>>(new Set())
  const justClearedOAuthRef = React.useRef<Set<string>>(new Set())
  
  // Form state for editing
  const [editGroupName, setEditGroupName] = useState<string>('')
  const [editSyncOnJoin, setEditSyncOnJoin] = useState<boolean>(false)
  const [editExpiresAt, setEditExpiresAt] = useState<string>('')
  const [editMembershipDurationDays, setEditMembershipDurationDays] = useState<string>('')
  const DEBUG_MODE = process.env.NEXT_PUBLIC_DEBUG === 'true'
  
  const invitationColorStyles = getEntityColorStyles(themeName, 1)
  
  // Fetch groups for selector
  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: groupsAPI.getAll,
    enabled: isOpen
  })

  useBodyScrollLock(isOpen)

  useEffect(() => {
    if (!isOpen) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  // poll for updates while modal is open
  const { data: invitationDetails, isLoading } = useQuery({
    queryKey: ['invitation', invitation?.id, 'details'],
    queryFn: () => invitationsAPI.getById(invitation!.id),
    enabled: !!invitation?.id && isOpen,
    initialData: invitation,
    refetchInterval: isOpen ? 5000 : false,
    staleTime: 0
  })

  const currentInvitation = invitationDetails || invitation

  // Initialize form state when invitation changes
  useEffect(() => {
    if (currentInvitation) {
      setEditGroupName(currentInvitation.groupName || '')
      setEditSyncOnJoin(currentInvitation.syncOnJoin || false)
      setEditExpiresAt(
        currentInvitation.expiresAt ? format(new Date(currentInvitation.expiresAt), "yyyy-MM-dd'T'HH:mm") : ''
      )
      // Map existing duration to one of the presets; default to "lifetime" when not set or unknown
      const knownPresets = ['1', '7', '15', '30', '90', '180', '365']
      const raw = currentInvitation.membershipDurationDays
      let durationValue: string
      if (raw == null || Number.isNaN(raw)) {
        durationValue = 'lifetime'
      } else if (DEBUG_MODE && raw === -1) {
        // Sentinel -1 is treated as the debug 1-minute preset
        durationValue = 'debug-1m'
      } else {
        durationValue = String(raw)
      }
      setEditMembershipDurationDays(
        durationValue === 'debug-1m' || knownPresets.includes(durationValue) ? durationValue : 'lifetime'
      )
    }
  }, [currentInvitation])

  useEffect(() => {
    if (!isOpen || !currentInvitation?.requests) return

    const completed = currentInvitation.requests
      .filter((req: InviteRequest) => req.status === 'completed')
      .map((req: InviteRequest) => req.id)
    
    if (completed.length > 0) {
      setOauthUsedRequests(prev => {
        const next = new Set(prev)
        completed.forEach((id: string) => next.delete(id))
        return next
      })
      setRenewedRequests(prev => {
        const next = new Set(prev)
        completed.forEach((id: string) => next.delete(id))
        return next
      })
    }
    
    setRenewedRequests(prev => {
      const withNewOAuth = currentInvitation.requests
        .filter((req: InviteRequest) => 
          req.status === 'accepted' && 
          req.oauthLink && req.oauthCode &&
          prev.has(req.id) &&
          !justClearedOAuthRef.current.has(req.id)
        )
        .map((req: InviteRequest) => req.id)
      if (withNewOAuth.length === 0) return prev
      const next = new Set(prev)
      withNewOAuth.forEach((id: string) => {
        next.delete(id)
        // Also remove from oauthUsedRequests when OAuth is renewed (fresh start)
        setOauthUsedRequests(prevUsed => {
          const nextUsed = new Set(prevUsed)
          nextUsed.delete(id)
          return nextUsed
        })
      })
      return next
    })

    const acceptedRequests = currentInvitation.requests.filter(
      (req: InviteRequest) => req.status === 'accepted' && req.oauthCode && (!req.oauthExpiresAt || new Date(req.oauthExpiresAt) > new Date())
    )

    if (acceptedRequests.length === 0) return

    const checkOAuthUsage = async () => {
      let shouldRefetch = false
      
      for (const request of acceptedRequests) {
        // Skip if already marked as used, completed, or renewed (renewed requests get fresh OAuth)
        // Also skip if status is completed - no need to check OAuth usage for completed requests
        if (oauthUsedRequests.has(request.id) || request.status === 'completed' || renewedRequests.has(request.id)) continue

        try {
          const host = typeof window !== 'undefined' ? (window.location?.host || window.location?.hostname || 'syncio.app') : 'syncio.app'
          const response = await fetch(
            `https://link.stremio.com/api/v2/read?type=Read&code=${encodeURIComponent(request.oauthCode)}`,
            {
              headers: {
                'X-Requested-With': host,
              },
            }
          )

          const data = await response.json().catch(() => ({}))
          
          if (data?.result?.success && data.result.authKey && request.status === 'accepted') {
            // Only mark as used if not renewed (renewed requests have a fresh OAuth link)
            if (!renewedRequests.has(request.id)) {
              setOauthUsedRequests(prev => new Set(prev).add(request.id))
              // Trigger immediate refetch to get latest status (might already be 'completed')
              shouldRefetch = true
            }
          }
        } catch (error) {
          // ignore errors
        }
      }
      
      // If we detected OAuth usage, immediately refetch to get the latest status
      // This prevents showing "Expired" if the backend has already updated status to 'completed'
      if (shouldRefetch && currentInvitation?.id) {
        queryClient.refetchQueries({ queryKey: ['invitation', currentInvitation.id, 'details'] })
      }
    }

    const interval = setInterval(checkOAuthUsage, 5000)
    checkOAuthUsage()

    return () => clearInterval(interval)
  }, [isOpen, currentInvitation?.requests, oauthUsedRequests, renewedRequests])

  const acceptMutation = useMutation({
    mutationFn: ({ requestId, groupName }: { requestId: string; groupName?: string }) =>
      invitationsAPI.acceptRequest(requestId, groupName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] })
      queryClient.invalidateQueries({ queryKey: ['invitation', invitation?.id, 'details'] })
      toast.success('Request accepted')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'Failed to accept request')
    }
  })

  const rejectMutation = useMutation({
    mutationFn: invitationsAPI.rejectRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] })
      queryClient.invalidateQueries({ queryKey: ['invitation', invitation?.id, 'details'] })
      toast.success('Request rejected')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'Failed to reject request')
    }
  })

  // undo rejection = accept it
  const undoRejectionMutation = useMutation({
    mutationFn: ({ requestId, groupName }: { requestId: string; groupName?: string }) =>
      invitationsAPI.undoRejection(requestId, groupName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] })
      queryClient.invalidateQueries({ queryKey: ['invitation', invitation?.id, 'details'] })
      toast.success('Request accepted')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'Failed to undo rejection')
    }
  })

  const refreshOAuthMutation = useMutation({
    mutationFn: (requestId: string) => invitationsAPI.clearOAuth(requestId),
    onSuccess: async (_, requestId) => {
      setOauthUsedRequests(prev => {
        const next = new Set(prev)
        next.delete(requestId)
        return next
      })
      
      setRenewedRequests(prev => new Set(prev).add(requestId))
      justClearedOAuthRef.current.add(requestId)
      
      await queryClient.invalidateQueries({ queryKey: ['invitations'] })
      await queryClient.invalidateQueries({ queryKey: ['invitation', invitation?.id, 'details'] })
      await queryClient.invalidateQueries({ queryKey: ['invitation', invitation?.id, 'requests'] })
      await queryClient.refetchQueries({ queryKey: ['invitation', invitation?.id, 'requests'] })
      
      setTimeout(() => {
        justClearedOAuthRef.current.delete(requestId)
      }, 1000)
      
      toast.success('OAuth link cleared. User can now generate a new link.')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'Failed to clear OAuth link')
    }
  })

  const deleteRequestMutation = useMutation({
    mutationFn: (requestId: string) => invitationsAPI.deleteRequest(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] })
      queryClient.invalidateQueries({ queryKey: ['invitation', invitation?.id, 'details'] })
      toast.success('Request deleted successfully')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'Failed to delete request')
    }
  })

  const deleteMutation = useMutation({
    mutationFn: invitationsAPI.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] })
      toast.success('Invitation deleted successfully')
      onClose()
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'Failed to delete invitation')
    }
  })

  const updateMutation = useMutation({
    mutationFn: (data: { groupName?: string | null; syncOnJoin?: boolean; expiresAt?: string | null; membershipDurationDays?: number | null; createdAt?: string }) =>
      invitationsAPI.update(currentInvitation!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitation'] })
      queryClient.invalidateQueries({ queryKey: ['invitations'] })
      queryClient.invalidateQueries({ queryKey: ['invitation', currentInvitation?.id, 'details'] })
      toast.success('Invitation updated successfully')
      onClose()
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to update invitation')
    }
  })

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentInvitation) return

    const updateData: any = {}
    if (editGroupName !== (currentInvitation.groupName || '')) {
      updateData.groupName = editGroupName || null
    }
    if (editSyncOnJoin !== (currentInvitation.syncOnJoin || false)) {
      updateData.syncOnJoin = editSyncOnJoin
    }
    if (
      editExpiresAt !==
      (currentInvitation.expiresAt ? format(new Date(currentInvitation.expiresAt), "yyyy-MM-dd'T'HH:mm") : '')
    ) {
      updateData.expiresAt = editExpiresAt || null
    }
    const currentDuration =
      currentInvitation.membershipDurationDays != null && !Number.isNaN(currentInvitation.membershipDurationDays)
        ? String(currentInvitation.membershipDurationDays)
        : 'lifetime'
    if (editMembershipDurationDays !== currentDuration) {
      let parsed: number | null
      if (editMembershipDurationDays === 'lifetime') {
        parsed = null
      } else if (DEBUG_MODE && editMembershipDurationDays === 'debug-1m') {
        // Use sentinel value -1 to represent 1-minute debug duration
        parsed = -1
      } else if (editMembershipDurationDays) {
        parsed = Number(editMembershipDurationDays)
      } else {
        parsed = null
      }
      // Allow sentinel -1 (debug 1-minute) and positive durations; null means Lifetime
      updateData.membershipDurationDays =
        parsed === null || Number.isNaN(parsed) ? null : parsed
    }

    if (Object.keys(updateData).length === 0) {
      toast('No changes to save', { icon: 'ℹ️' })
      return
    }

    await updateMutation.mutateAsync(updateData)
  }

  const handleCancel = () => {
    if (currentInvitation) {
      setEditGroupName(currentInvitation.groupName || '')
      setEditSyncOnJoin(currentInvitation.syncOnJoin || false)
      setEditExpiresAt(currentInvitation.expiresAt ? format(new Date(currentInvitation.expiresAt), "yyyy-MM-dd'T'HH:mm") : '')
      const knownPresets = ['1', '7', '15', '30', '90', '180', '365']
      const raw = currentInvitation.membershipDurationDays
      let durationValue: string
      if (raw == null || Number.isNaN(raw)) {
        durationValue = 'lifetime'
      } else if (DEBUG_MODE && raw > 0 && raw < 1) {
        durationValue = 'debug-1m'
      } else {
        durationValue = String(raw)
      }
      setEditMembershipDurationDays(
        durationValue === 'debug-1m' || knownPresets.includes(durationValue) ? durationValue : 'lifetime'
      )
    }
    onClose()
  }

  const handleAcceptRequest = (requestId: string) => {
    const finalGroupName = currentInvitation?.groupName || undefined
    acceptMutation.mutate({
      requestId,
      groupName: finalGroupName
    })
  }

  const handleRejectRequest = (requestId: string) => {
    setRequestToReject(requestId)
  }

  const handleConfirmReject = () => {
    if (requestToReject) {
      rejectMutation.mutate(requestToReject)
      setRequestToReject(null)
    }
  }

  const handleUndoRejection = (requestId: string) => {
    const finalGroupName = currentInvitation?.groupName || undefined
    undoRejectionMutation.mutate({ requestId, groupName: finalGroupName })
  }

  const handleRefreshOAuth = (requestId: string) => {
    refreshOAuthMutation.mutate(requestId)
  }

  const handleDeleteRequest = (requestId: string) => {
    deleteRequestMutation.mutate(requestId)
  }

  const handleDelete = () => {
    if (!currentInvitation) return
    setShowDeleteConfirm(true)
  }

  const handleConfirmDelete = () => {
    if (!currentInvitation) return
    deleteMutation.mutate(currentInvitation.id)
    setShowDeleteConfirm(false)
  }

  const copyInviteLink = () => {
    if (!currentInvitation) return
    const url = `${window.location.origin}/invite/${currentInvitation.inviteCode}`
    navigator.clipboard.writeText(url)
    toast.success('Invite link copied to clipboard')
  }

  const getRequestStatusBadge = React.useCallback((status: string, request: InviteRequest) => {
    const isOAuthExpired = request.oauthExpiresAt && new Date(request.oauthExpiresAt) < new Date()
    const isRenewed = status === 'accepted' && renewedRequests.has(request.id)
    // Only mark as used/expired if NOT renewed (renewed requests get a fresh OAuth link)
    const isOAuthUsedButNotCompleted = oauthUsedRequests.has(request.id) && status === 'accepted' && !isRenewed
    
    let badgeStatus: 'pending' | 'accepted' | 'joined' | 'rejected' | 'renewed'
    let dotColor: string
    let text: string
    
    // Always prioritize completed status first - prevents showing "Expired" for completed requests
    if (status === 'completed') {
      badgeStatus = 'joined'
      dotColor = '#22c55e'
      text = 'Joined'
    } else if (status === 'rejected') {
      badgeStatus = 'rejected'
      dotColor = '#ef4444'
      text = 'Rejected'
    } else if (status === 'accepted') {
      if (isRenewed) {
        badgeStatus = 'renewed'
        dotColor = '#3b82f6'
        text = 'Renewed'
      } else if (isOAuthUsedButNotCompleted || isOAuthExpired) {
        badgeStatus = 'rejected'
        dotColor = '#ef4444'
        text = 'Expired'
      } else {
        badgeStatus = 'accepted'
        dotColor = '#3b82f6'
        text = 'Accepted'
      }
    } else {
      badgeStatus = 'pending'
      dotColor = '#eab308'
      text = 'Pending'
    }
    
    const accentStyles = getEntityColorStyles(themeName, 1)
    const baseBackground = accentStyles.accentHex
    const accentTextColor = accentStyles.textColor
    
    return (
      <div 
        className="inline-flex items-center px-2 py-1 text-xs font-medium cursor-default"
        style={{ 
          borderRadius: '9999px',
          display: 'inline-flex',
          alignItems: 'center',
          paddingLeft: '8px',
          paddingRight: '8px',
          paddingTop: '4px',
          paddingBottom: '4px',
          backgroundColor: baseBackground,
          color: accentTextColor
        }}
        title={text}
      >
        <div className="w-2 h-2 rounded-full mr-1" style={{ backgroundColor: dotColor }} />
        {text}
      </div>
    )
  }, [renewedRequests, oauthUsedRequests, themeName])

  if (!isOpen || !mounted) return null

  const modalContent = (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75"
      onClick={onClose}
    >
      <div 
        className="card max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col"
        style={{ background: 'var(--color-background)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex-shrink-0">
              {(() => {
                const letter = currentInvitation?.inviteCode ? currentInvitation.inviteCode.charAt(0).toUpperCase() : 'I'
                return (
                  <div
                    className="logo-circle-12 flex items-center justify-center"
                    style={{
                      background: invitationColorStyles.background,
                      color: invitationColorStyles.textColor,
                    }}
                  >
                    <span
                      className="font-semibold text-lg"
                      style={{ color: invitationColorStyles.textColor }}
                    >
                      {letter}
                    </span>
                  </div>
                )
              })()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h2 className="font-medium transition-colors truncate text-xl" title={currentInvitation?.inviteCode}>
                  {currentInvitation?.inviteCode || 'Invitation'}
                </h2>
                <SyncBadge
                  status={
                    currentInvitation?.expiresAt && new Date(currentInvitation.expiresAt) < new Date()
                      ? 'expired'
                      : (currentInvitation?.currentUses || 0) >= (currentInvitation?.maxUses || 0)
                      ? 'full'
                      : 'incomplete'
                  }
                  title={
                    currentInvitation?.expiresAt && new Date(currentInvitation.expiresAt) < new Date()
                      ? 'Expired (invitation has expired)'
                      : (currentInvitation?.currentUses || 0) >= (currentInvitation?.maxUses || 0)
                      ? 'Full (max uses reached)'
                      : 'Incomplete (not all invites used)'
                  }
                />
              </div>
              <p className="text-sm mt-1 truncate color-text-secondary">
                {currentInvitation?.currentUses || 0} / {currentInvitation?.maxUses || 0} uses
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={onClose}
              className="p-2 rounded-lg color-hover"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6 pt-0">
          {isLoading ? (
            <div className="text-center py-8">Loading...</div>
          ) : (
            <form onSubmit={handleSave} className="flex flex-col h-full">
              <div className="p-4 rounded-lg mb-6 section-panel">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold">Details</h3>
                </div>
                
                <div className="mb-4">
                  <h4 className="text-sm font-semibold mb-2">Invite Link</h4>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={currentInvitation ? `${window.location.origin}/invite/${currentInvitation.inviteCode}` : ''}
                      className="input w-full px-3 py-2"
                      autoComplete="off"
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <button
                      type="button"
                      onClick={copyInviteLink}
                      className="w-10 h-10 rounded flex items-center justify-center color-hover"
                      title="Copy invite link"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="mb-4 flex gap-4">
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold mb-2">Group</h4>
                    <select
                      value={editGroupName}
                      onChange={(e) => {
                        setEditGroupName(e.target.value)
                        if (!e.target.value) {
                          setEditSyncOnJoin(false)
                        }
                      }}
                      className="input w-full px-3 py-2"
                    >
                      <option value="">No group assigned</option>
                      {groups.map((group: any) => (
                        <option key={group.id} value={group.name}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold mb-2">Sync on Join</h4>
                    <select
                      value={editSyncOnJoin ? 'yes' : 'no'}
                      onChange={(e) => setEditSyncOnJoin(e.target.value === 'yes')}
                      disabled={!editGroupName}
                      className="input w-full px-3 py-2"
                    >
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </select>
                  </div>
                </div>

                <div className="mb-4 flex gap-4">
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold mb-2">Created</h4>
                    <div className="px-3 py-2 rounded-lg input">
                      <p className="text-sm color-text-secondary">
                        {formatDate(currentInvitation?.createdAt || null)}
                      </p>
                    </div>
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold mb-2">Invitation Expires</h4>
                    <DateTimePicker
                      value={editExpiresAt}
                      onChange={setEditExpiresAt}
                      min={new Date()}
                    />
                  </div>
                </div>
                <div className="mb-4">
                  <h4 className="text-sm font-semibold mb-2">
                    Membership Duration <span className="text-red-500">*</span>
                  </h4>
                  <p className="text-xs color-text-secondary mb-2">
                    Choose how long users created from this invite will keep their membership. Select
                    <span className="font-semibold"> Lifetime</span> for permanent membership.
                  </p>
                  <select
                    required
                    value={editMembershipDurationDays}
                    onChange={(e) => setEditMembershipDurationDays(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none input"
                  >
                    <option value="1">1 day</option>
                    <option value="7">7 days</option>
                    <option value="15">15 days</option>
                    <option value="30">1 month</option>
                    <option value="90">3 months</option>
                    <option value="180">6 months</option>
                    <option value="365">1 year</option>
                    <option value="lifetime">Lifetime</option>
                  </select>
                </div>
              </div>

              <EntityList
                title="Invited Users"
                count={(currentInvitation?.requests || []).length}
                items={currentInvitation?.requests || []}
                isLoading={isLoading}
                emptyIcon={<Mail className="w-12 h-12 mx-auto mb-4 color-text-secondary" />}
                emptyMessage="No invited users yet"
                renderItem={(request: InviteRequest) => (
                  <RequestItem
                    request={request}
                    themeName={themeName}
                    onAccept={handleAcceptRequest}
                    onReject={handleRejectRequest}
                    onUndoRejection={handleUndoRejection}
                    onRefreshOAuth={handleRefreshOAuth}
                    onDelete={handleDeleteRequest}
                    isRefreshingOAuth={refreshOAuthMutation.isPending}
                    isUndoingRejection={undoRejectionMutation.isPending}
                    isDeleting={deleteRequestMutation.isPending}
                    getRequestStatusBadge={getRequestStatusBadge}
                    isOAuthUsed={oauthUsedRequests.has(request.id)}
                  />
                )}
              />

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2 text-sm font-medium rounded-lg transition-colors color-text-secondary color-hover"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 color-surface hover:opacity-90"
                >
                  {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Invite"
        body={
          <p className="text-sm">
            Are you sure you want to delete invite{' '}
            <span
              onClick={async () => {
                if (currentInvitation?.inviteCode) {
                  await navigator.clipboard.writeText(currentInvitation.inviteCode)
                  toast.success('Copied to clipboard')
                }
              }}
              className="font-bold px-2 py-1 rounded cursor-pointer inline-block"
              style={{ backgroundColor: 'var(--color-hover)' }}
              title="Click to copy"
            >
              {currentInvitation?.inviteCode}
            </span>
            ? This action cannot be undone.
          </p>
        }
        confirmText="Delete"
        cancelText="Cancel"
        isDanger={true}
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      <ConfirmDialog
        open={!!requestToReject}
        title="Reject Request"
        description="Are you sure you want to reject this request? This action cannot be undone."
        confirmText="Reject"
        cancelText="Cancel"
        isDanger={true}
        onConfirm={handleConfirmReject}
        onCancel={() => setRequestToReject(null)}
      />
    </div>
  )

  return createPortal(modalContent, document.body)
}

