import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, Copy, RefreshCw, Send, CheckCircle2, XCircle, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { usersAPI, groupsAPI } from '@/services/api'

interface UserInviteModalProps {
  isOpen: boolean
  onClose: () => void
  maxInvites?: number
}

interface InviteLink {
  id: string
  code: string
  link: string
  expiresAt: number
  status: 'pending' | 'joined' | 'expired' | 'created'
  user?: {
    username?: string
    email?: string
  }
  authKey?: string
  groupName?: string
  groupId?: string
  isRefreshing?: boolean
  isCreating?: boolean
  error?: string | null
  synced?: boolean
}

const MAX_INVITES_DEFAULT = 5
const INVITE_DURATION_MS = 5 * 60 * 1000

export default function UserInviteModal({
  isOpen,
  onClose,
  maxInvites = MAX_INVITES_DEFAULT,
}: UserInviteModalProps) {
  const [mounted, setMounted] = useState(false)
  const [inviteCount, setInviteCount] = useState(1)
  const [invites, setInvites] = useState<InviteLink[]>([])
  const [isGeneratingAll, setIsGeneratingAll] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState('')
  const [newGroupName, setNewGroupName] = useState('')
  const [isCreatingNewGroup, setIsCreatingNewGroup] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [syncOnInvite, setSyncOnInvite] = useState(true)
  const [, forceTick] = useState(0)
  const pollersRef = useRef<Record<string, number>>({})
  const summaryTimerRef = useRef<number | null>(null)
  const inviteStartTimeRef = useRef<number | null>(null)
  const webhookSentRef = useRef(false)
  const queryClient = useQueryClient()

  // Fetch groups
  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: groupsAPI.getAll,
    enabled: isOpen,
  })

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!isOpen) return
    const interval = window.setInterval(() => {
      forceTick((tick) => tick + 1)
    }, 1000)
    return () => window.clearInterval(interval)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      if (invites.length > 0) {
        setShowSummary(true)
      }
      if (summaryTimerRef.current) {
        window.clearTimeout(summaryTimerRef.current)
        summaryTimerRef.current = null
      }
      Object.values(pollersRef.current).forEach((timer) => window.clearInterval(timer))
      pollersRef.current = {}
      webhookSentRef.current = false
    } else {
      setShowSummary(false)
      webhookSentRef.current = false
    }
  }, [isOpen, invites.length])

  useEffect(() => {
    if (invites.length > 0 && !inviteStartTimeRef.current) {
      inviteStartTimeRef.current = Date.now()
      summaryTimerRef.current = window.setTimeout(() => {
        setShowSummary(true)
      }, INVITE_DURATION_MS)
    }
    return () => {
      if (summaryTimerRef.current) {
        window.clearTimeout(summaryTimerRef.current)
        summaryTimerRef.current = null
      }
    }
  }, [invites.length])

  // Check if all invites are completed and show summary automatically
  useEffect(() => {
    if (invites.length === 0 || showSummary) return

    const allCompleted = invites.every((invite) => {
      // Completed if: created
      if (invite.status === 'created') return true
      // Completed if: expired
      if (invite.status === 'expired') return true
      // Completed if: pending but past expiry time
      if (invite.status === 'pending' && Date.now() >= invite.expiresAt) return true
      // Completed if: has error (failed)
      if (invite.error) return true
      // Completed if: joined but not creating anymore (creation process finished)
      if (invite.status === 'joined' && !invite.isCreating) return true
      // Not completed if still pending and not expired
      if (invite.status === 'pending') return false
      // Not completed if still creating
      if (invite.status === 'joined' && invite.isCreating) return false
      return false
    })

    if (allCompleted) {
      // Small delay to ensure all state updates are processed
      const timer = setTimeout(() => {
        // Clear the 5-minute timer since all invites are done
        if (summaryTimerRef.current) {
          window.clearTimeout(summaryTimerRef.current)
          summaryTimerRef.current = null
        }
        setShowSummary(true)
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [invites, showSummary])

  const getFinalGroupName = useCallback(() => {
    const selectedGroupName = selectedGroup ? (groups.find((g: any) => g.id === selectedGroup)?.name || undefined) : undefined
    return (newGroupName.trim() || selectedGroupName) || undefined
  }, [selectedGroup, newGroupName, groups])

  const limitedInviteCount = useMemo(() => {
    if (!Number.isFinite(inviteCount)) return 1
    return Math.min(Math.max(1, inviteCount), Math.max(1, maxInvites))
  }, [inviteCount, maxInvites])

  const visibleInvites = useMemo(() => invites.slice(0, limitedInviteCount), [invites, limitedInviteCount])

  const joinedCount = useMemo(
    () => visibleInvites.filter((invite) => invite.status === 'joined' || invite.status === 'created').length,
    [visibleInvites]
  )

  const summaryStats = useMemo(() => {
    const total = invites.length
    const created = invites.filter((invite) => invite.status === 'created').length
    const joined = invites.filter((invite) => invite.status === 'joined' && !invite.isCreating).length
    const pending = invites.filter((invite) => invite.status === 'pending').length
    const expired = invites.filter((invite) => invite.status === 'expired').length
    const failed = invites.filter((invite) => !!invite.error && invite.status !== 'created').length
    const createdUsers = invites.filter((invite) => invite.status === 'created' && invite.user)
    const failedInvites = invites.filter((invite) => 
      invite.status === 'expired' || 
      (!!invite.error && invite.status !== 'created') ||
      (invite.status === 'pending' && Date.now() >= invite.expiresAt)
    )
    
    // Group created users by group name
    const usersByGroup = new Map<string, typeof createdUsers>()
    createdUsers.forEach((invite) => {
      const groupName = invite.groupName || 'No Group'
      if (!usersByGroup.has(groupName)) {
        usersByGroup.set(groupName, [])
      }
      usersByGroup.get(groupName)!.push(invite)
    })
    
    return {
      total,
      created,
      joined,
      pending,
      expired,
      failed,
      createdUsers,
      failedInvites,
      usersByGroup,
    }
  }, [invites])

  // Send webhook when summary is shown
  useEffect(() => {
    if (!showSummary || webhookSentRef.current || summaryStats.createdUsers.length === 0) return

    webhookSentRef.current = true

    // Get the first group name (assuming all users are in the same group, or use the most common one)
    const groupNames = Array.from(summaryStats.usersByGroup.keys()).filter(name => name !== 'No Group')
    const primaryGroupName = groupNames[0] || undefined

    const webhookData = {
      type: 'summary' as const,
      createdUsers: summaryStats.createdUsers.map((invite) => ({
        username: invite.user?.username,
        email: invite.user?.email,
        code: invite.code,
        link: invite.link,
        synced: invite.synced || false,
      })),
      totalInvites: summaryStats.total,
      groupName: primaryGroupName,
    }

    usersAPI.sendInviteWebhook(webhookData).catch((error) => {
      // Silently fail - webhook is optional
    })
  }, [showSummary, summaryStats])

  const formatTimeLeft = useCallback((expiresAt: number) => {
    const diff = Math.max(0, expiresAt - Date.now())
    if (diff <= 0) return 'Expired'
    const minutes = Math.floor(diff / 60000)
    const seconds = Math.floor((diff % 60000) / 1000)
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }, [])

  const clearPoller = useCallback((id: string) => {
    const timer = pollersRef.current[id]
    if (timer) {
      window.clearInterval(timer)
      delete pollersRef.current[id]
    }
  }, [])

  const clearAllPollers = useCallback(() => {
    Object.values(pollersRef.current).forEach((timer) => window.clearInterval(timer))
    pollersRef.current = {}
  }, [])

  const fetchInvite = useCallback(async (): Promise<InviteLink> => {
    if (typeof window === 'undefined') {
      throw new Error('Invite generation is only available in the browser')
    }

    const host = window.location?.host || window.location?.hostname || 'syncio.app'
    const response = await fetch('https://link.stremio.com/api/v2/create?type=Create', {
      headers: {
        'X-Requested-With': host,
      },
    })

    if (!response.ok) {
      throw new Error(`Stremio responded with ${response.status}`)
    }

    const data = await response.json()
    const result = data?.result
    if (!result?.success || !result?.code || !result?.link) {
      const message = data?.error?.message || 'Failed to create Stremio link'
      throw new Error(message)
    }

    const inviteId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    return {
      id: inviteId,
      code: result.code,
      link: result.link,
      expiresAt: Date.now() + INVITE_DURATION_MS,
      status: 'pending',
      isRefreshing: false,
      error: null,
    }
  }, [])

  const pollInvite = useCallback(
    async (invite: InviteLink) => {
      const { id, code } = invite

      let expired = false
      setInvites((prev) =>
        prev.map((item) => {
          if (item.id !== id || item.status !== 'pending') return item
          if (Date.now() >= item.expiresAt) {
            expired = true
            return {
              ...item,
              status: 'expired',
            }
          }
          return item
        })
      )

      if (expired) {
        clearPoller(id)
        return
      }

      try {
        const host = window.location?.host || window.location?.hostname || 'syncio.app'
        const response = await fetch(
          `https://link.stremio.com/api/v2/read?type=Read&code=${encodeURIComponent(code)}`,
          {
            headers: {
              'X-Requested-With': host,
            },
          }
        )

        const data = await response.json().catch(() => ({}))
        if (!data) return

        if (data?.result?.success && data.result.authKey) {
          let verifiedUser: { username?: string; email?: string } | undefined
          const stremioUser =
            data.result.user && typeof data.result.user === 'object'
              ? {
                  username: data.result.user.username,
                  email: data.result.user.email,
                }
              : undefined
          try {
            const verification = await usersAPI.verifyAuthKey({
              authKey: data.result.authKey,
            })
            verifiedUser = verification?.user || undefined
          } catch {
            // Fallback to Stremio user data if verification fails
          }
          if (!verifiedUser && stremioUser) {
            verifiedUser = stremioUser
          }

          if (!verifiedUser) {
            return
          }

          const usernameRaw = verifiedUser.username || (verifiedUser.email ? verifiedUser.email.split('@')[0] : '')
          // Capitalize first letter for invite-based user creation
          const username = usernameRaw ? usernameRaw.charAt(0).toUpperCase() + usernameRaw.slice(1) : ''
          const displayUsername = username || 'User'

          let groupName: string | undefined
          let groupId: string | undefined
          setInvites((prev) => {
            const currentInvite = prev.find((i) => i.id === id)
            groupName = currentInvite?.groupName
            groupId = currentInvite?.groupId
            return prev.map((item) =>
              item.id === id
                ? {
                    ...item,
                    status: 'joined',
                    authKey: data.result.authKey,
                    user: {
                      ...verifiedUser,
                      username: username, // Store capitalized username
                    },
                    isCreating: true,
                    error: null,
                  }
                : item
            )
          })

          // Fallback to get group name from groupId if groupName is not available
          if ((!groupName || groupName.trim() === '') && groupId) {
            const group = groups.find((g: any) => g.id === groupId)
            if (group?.name) {
              groupName = group.name
            }
          }
          
          // Final fallback to current selected group if invite doesn't have groupName
          if (!groupName || groupName.trim() === '') {
            const finalGroupName = getFinalGroupName()
            if (finalGroupName && finalGroupName.trim() !== '') {
              groupName = finalGroupName
            }
          }

          usersAPI
            .create({
              authKey: data.result.authKey,
              username: username,
              email: verifiedUser.email,
              groupName: groupName && groupName.trim() !== '' ? groupName.trim() : undefined,
              colorIndex: 0,
            })
            .then(async (response: any) => {
              const hasUserData = !!(response?.id || response?.user?.id)
              
              if (hasUserData) {
                const userId = response?.id || response?.user?.id
                let synced = false
                
                // Sync user if option is enabled and a group is assigned
                if (syncOnInvite && userId && groupName && groupName.trim() !== '') {
                  try {
                    await usersAPI.sync(userId)
                    synced = true
                  } catch (syncError) {
                    // Silently fail - sync is optional
                  }
                }
                
                queryClient.invalidateQueries({ queryKey: ['user'] }).catch(() => {})
                queryClient.invalidateQueries({ queryKey: ['users'] }).catch(() => {})
                setInvites((prevState) =>
                  prevState.map((item) =>
                    item.id === id
                      ? {
                          ...item,
                          status: 'created',
                          isCreating: false,
                          error: null,
                          synced: synced,
                        }
                      : item
                  )
                )
                toast.success(`User ${displayUsername} created and added to group!`)
              } else {
                const responseMessage = response?.message || 'Failed to create user'
                const lowerMessage = String(responseMessage).toLowerCase()
                const isUserExists = 
                  lowerMessage.includes('already exists') ||
                  lowerMessage.includes('user already') ||
                  lowerMessage.includes('email already') ||
                  lowerMessage.includes('username already')
                
                const displayMessage = isUserExists ? 'User Already Exists' : responseMessage
                
                setInvites((prevState) =>
                  prevState.map((item) =>
                    item.id === id
                      ? {
                          ...item,
                          isCreating: false,
                          error: displayMessage,
                        }
                      : item
                  )
                )
                toast.error(isUserExists ? 'User Already Exists' : `Failed to create user: ${displayMessage}`)
              }
            })
            .catch((error: any) => {
              const status = error?.response?.status
              const rawMessage = error?.response?.data?.message || error?.response?.data?.error || error?.message || 'Failed to create user'
              
              if (status && status >= 200 && status < 300) {
                const userData = error?.response?.data?.user || error?.response?.data
                if (userData?.id) {
                  queryClient.invalidateQueries({ queryKey: ['user'] }).catch(() => {})
                  queryClient.invalidateQueries({ queryKey: ['users'] }).catch(() => {})
                  setInvites((prevState) =>
                    prevState.map((item) =>
                      item.id === id
                        ? {
                            ...item,
                            status: 'created',
                            isCreating: false,
                            error: null,
                          }
                        : item
                    )
                  )
                  toast.success(`User ${displayUsername} created and added to group!`)
                  return
                }
              }
              
              const lowerMessage = String(rawMessage).toLowerCase()
              const isUserExists = 
                lowerMessage.includes('already exists') ||
                lowerMessage.includes('user already') ||
                lowerMessage.includes('email already') ||
                lowerMessage.includes('username already')
              
              const displayMessage = isUserExists ? 'User Already Exists' : rawMessage
              
              setInvites((prevState) =>
                prevState.map((item) =>
                  item.id === id
                    ? {
                        ...item,
                        isCreating: false,
                        error: displayMessage,
                      }
                    : item
                )
              )
              toast.error(isUserExists ? 'User Already Exists' : `Failed to create user: ${rawMessage}`)
            })

          clearPoller(id)
        } else if (data?.error && data.error.code && data.error.code !== 101) {
          const message = data.error.message || 'Stremio reported an error'
          setInvites((prev) =>
            prev.map((item) =>
              item.id === id
                ? {
                    ...item,
                    error: message,
                  }
                : item
            )
          )
        }
      } catch {
        // Silently handle polling errors
      }
    },
    [clearPoller, syncOnInvite, getFinalGroupName, groups]
  )

  useEffect(() => {
    if (!isOpen) return

    invites.forEach((invite) => {
      if (invite.status === 'pending') {
        if (!pollersRef.current[invite.id]) {
          const pollHandler = () => {
            pollInvite(invite)
          }
          pollersRef.current[invite.id] = window.setInterval(pollHandler, 5000)
          pollHandler()
        }
      } else {
        clearPoller(invite.id)
      }
    })

    return () => {
      if (!isOpen) {
        clearAllPollers()
      }
    }
  }, [invites, isOpen, pollInvite, clearAllPollers, clearPoller])

  const handleGenerateAll = useCallback(async () => {
    try {
      setIsGeneratingAll(true)
      clearAllPollers()
      if (summaryTimerRef.current) {
        window.clearTimeout(summaryTimerRef.current)
        summaryTimerRef.current = null
      }
      inviteStartTimeRef.current = null
      webhookSentRef.current = false
      const count = limitedInviteCount
      const groupName = getFinalGroupName()
      const selectedGroupId = selectedGroup || undefined
      
      const results = await Promise.all(
        Array.from({ length: count }, () => fetchInvite())
      )
      const invitesWithGroup = results.map((invite) => ({
        ...invite,
        groupName: groupName,
        groupId: selectedGroupId,
      }))
      setInvites(invitesWithGroup)
      toast.success(`Generated ${count} invite${count > 1 ? 's' : ''}`)
      
      // Send webhook for generated invites
      if (results.length > 0) {
        const webhookData = {
          type: 'generated' as const,
          invites: results.map((invite) => ({
            code: invite.code,
            link: invite.link,
          })),
          totalInvites: count,
          groupName: groupName,
        }
        usersAPI.sendInviteWebhook(webhookData).catch((error) => {
          // Silently fail - webhook is optional
        })
      }
    } catch (error: any) {
      const message = error?.message || 'Failed to generate invites'
      toast.error(message)
    } finally {
      setIsGeneratingAll(false)
    }
  }, [fetchInvite, limitedInviteCount, clearAllPollers, getFinalGroupName, selectedGroup])

  const handleRegenerateInvite = useCallback(
    async (index: number) => {
      try {
        setInvites((prev) =>
          prev.map((invite, i) =>
            i === index ? { ...invite, isRefreshing: true, error: null } : invite
          )
        )
        const updated = await fetchInvite()
        setInvites((prev) => {
          if (index >= prev.length) return prev
          const next = [...prev]
          const previous = next[index]
          if (previous) {
            clearPoller(previous.id)
            next[index] = {
              ...updated,
              groupName: previous.groupName,
              groupId: previous.groupId,
            }
          }
          return next
        })
        toast.success('Invite regenerated')
      } catch (error: any) {
        const message = error?.message || 'Failed to regenerate invite'
        toast.error(message)
        setInvites((prev) =>
          prev.map((invite, i) =>
            i === index ? { ...invite, isRefreshing: false, error: message } : invite
          )
        )
      }
    },
    [fetchInvite, clearPoller]
  )

  const handleCopy = useCallback(async (value: string, label: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(value)
        toast.success(`${label} copied!`)
      }
    } catch {
      toast.error(`Failed to copy ${label.toLowerCase()}`)
    }
  }, [])

  const handleCopySummary = useCallback(async () => {
    if (!visibleInvites.length) {
      toast.error('No invites to copy yet')
      return
    }

    const summary = visibleInvites
      .map((invite, index) => {
        if ((invite.status === 'joined' || invite.status === 'created') && invite.user) {
          const emailPart = invite.user.email ? ` (${invite.user.email})` : ''
          return `Invite ${index + 1} ${invite.user.username || 'User'}${emailPart}`
        }
        return `Invite ${index + 1} ${invite.link}`
      })
      .join('\n')

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(summary)
        toast.success('Invite list copied!')
      }
    } catch {
      toast.error('Failed to copy invite list')
    }
  }, [visibleInvites])

  const handleCloseSummary = useCallback(() => {
    setShowSummary(false)
    clearAllPollers()
      setInvites([])
      setInviteCount(1)
      setSelectedGroup('')
      setNewGroupName('')
      setIsCreatingNewGroup(false)
      setSyncOnInvite(true)
      inviteStartTimeRef.current = null
    if (summaryTimerRef.current) {
      window.clearTimeout(summaryTimerRef.current)
      summaryTimerRef.current = null
    }
    onClose()
  }, [clearAllPollers, onClose])

  const handleClose = useCallback(() => {
    if (invites.length > 0 && !showSummary) {
      setShowSummary(true)
    } else {
      handleCloseSummary()
    }
  }, [invites.length, showSummary, handleCloseSummary])

  if (!isOpen) return null
  if (!mounted || typeof window === 'undefined' || !document.body) {
    return null
  }

  const mainModal = createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/75 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          handleClose()
        }
      }}
    >
      <div className="w-full max-w-5xl max-h-[85vh] rounded-lg shadow-lg card flex flex-col">
        <div className="flex items-center justify-between p-6 border-b color-border">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full flex items-center justify-center color-surface">
              <Send className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">Invite Users</h2>
              <p className="text-sm color-text-secondary">
                Generate temporary OAuth links to onboard new users.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center rounded color-hover color-text-secondary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium color-text">Number of invitations</label>
            <select
              value={limitedInviteCount}
              onChange={(event) => setInviteCount(Number(event.target.value))}
              className="w-full px-3 py-2 rounded-lg border focus:outline-none input"
              disabled={isGeneratingAll}
            >
              {Array.from({ length: maxInvites }, (_, index) => (
                <option key={index} value={index + 1}>
                  {index + 1}
                </option>
              ))}
            </select>
            <p className="text-xs color-text-secondary">
              You can generate up to {maxInvites} invite link{maxInvites > 1 ? 's' : ''} at a time.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium color-text">Assign to group (optional)</label>
            <select
              value={isCreatingNewGroup ? '__create_new__' : selectedGroup}
              onChange={(e) => {
                if (e.target.value === '__create_new__') {
                  setIsCreatingNewGroup(true)
                  setSelectedGroup('')
                  setNewGroupName('')
                } else {
                  setIsCreatingNewGroup(false)
                  setSelectedGroup(e.target.value)
                  setNewGroupName('')
                }
              }}
              className="w-full px-3 py-2 rounded-lg border focus:outline-none input"
              disabled={isGeneratingAll}
            >
              <option value="">No group</option>
              {groups?.map((group: any) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
              <option value="__create_new__">+ Create new group...</option>
            </select>
            {isCreatingNewGroup && (
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Enter new group name"
                className="w-full px-3 py-2 border rounded-lg focus:outline-none input mt-2"
                autoFocus
                disabled={isGeneratingAll}
              />
            )}
            <p className="text-xs color-text-secondary">
              Invited users will be automatically added to the selected group when they connect.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="sync-on-invite"
              checked={syncOnInvite}
              onChange={(e) => {
                const finalGroupName = getFinalGroupName()
                if (finalGroupName && finalGroupName.trim() !== '') {
                  setSyncOnInvite(e.target.checked)
                }
                // When disabled (no group), don't change the value - keep it checked
              }}
              className="w-4 h-4 rounded border-color-border color-surface focus:ring-2 focus:ring-offset-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isGeneratingAll || !getFinalGroupName() || getFinalGroupName()?.trim() === ''}
            />
            <label htmlFor="sync-on-invite" className={`text-sm color-text ${(!getFinalGroupName() || getFinalGroupName()?.trim() === '') ? 'opacity-50' : 'cursor-pointer'}`}>
              Sync users when invited
            </label>
          </div>

          <button
            type="button"
            onClick={handleGenerateAll}
            disabled={isGeneratingAll}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg color-surface transition-colors disabled:opacity-60"
          >
            {isGeneratingAll ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating links...
              </>
            ) : (
              'Generate Links'
            )}
          </button>

          <div className="space-y-3">
            {visibleInvites.length > 0 && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <button
                  type="button"
                  onClick={handleCopySummary}
                  className="inline-flex items-center gap-2 text-sm font-medium color-text hover:opacity-80 transition-opacity"
                  title="Copy all invite links"
                >
                  Generated Links
                  <Copy className="w-4 h-4" />
                </button>
                <span className="text-xs color-text-secondary">
                  Joined {joinedCount} / {visibleInvites.length}
                </span>
              </div>
            )}
            {visibleInvites.length === 0 ? (
              <div className="text-sm color-text-secondary text-center py-6 border border-dashed rounded-lg">
                Select how many invitations you need and click &quot;Generate Links&quot; to get started.
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {visibleInvites.map((invite, index) => {
                const isPending = invite.status === 'pending'
                const timeLeft = isPending ? formatTimeLeft(invite.expiresAt) : ''
                const hasError = !!invite.error
                const statusLabel =
                  hasError
                    ? invite.error
                    : invite.status === 'created'
                    ? 'User created'
                    : invite.status === 'joined'
                    ? invite.isCreating
                      ? 'Creating user...'
                      : 'Joined'
                    : invite.status === 'expired'
                    ? 'Expired'
                    : `Expires in ${timeLeft}`
                const statusClass =
                  hasError
                    ? 'text-red-400'
                    : invite.status === 'created' || invite.status === 'joined'
                    ? 'text-emerald-400'
                    : invite.status === 'expired'
                    ? 'text-red-400'
                    : 'color-text-secondary'
                const borderClass =
                  hasError
                    ? 'border-red-500/60 bg-red-500/5'
                    : invite.status === 'created' || invite.status === 'joined'
                    ? 'border-emerald-400/60 bg-emerald-500/5'
                    : invite.status === 'expired'
                    ? 'border-red-500/60 bg-red-500/5'
                    : 'border-color-border'

                return (
                  <div
                    key={invite.id}
                    className={`border rounded-lg p-4 space-y-3 transition-colors ${borderClass}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium color-text">Invite {index + 1}</p>
                        <p className={`text-xs ${statusClass}`}>{statusLabel}</p>
                      </div>
                      {!hasError && (invite.status === 'joined' || invite.status === 'created') && invite.groupName ? (
                        <p className="text-sm font-medium color-text">{invite.groupName}</p>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleRegenerateInvite(index)}
                          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg color-surface transition-colors disabled:opacity-60"
                          disabled={invite.isRefreshing}
                        >
                          {invite.isRefreshing ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Updating...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-4 h-4" />
                              Regenerate
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    {!hasError && (invite.status === 'joined' || invite.status === 'created') ? (
                      <>
                        {invite.isCreating ? (
                          <div className="flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="text-sm color-text-secondary">Creating user...</span>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs uppercase tracking-wide color-text-secondary">
                                User
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopy(invite.user?.username || '', 'Username')}
                                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg color-surface transition-colors"
                              >
                                <Copy className="w-4 h-4" />
                                {invite.user?.username || 'Stremio user'}
                              </button>
                            </div>

                            {invite.user?.email && (
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs uppercase tracking-wide color-text-secondary">
                                  Email
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopy(invite.user?.email || '', 'Email')}
                                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg color-surface transition-colors"
                                >
                                  <Copy className="w-4 h-4" />
                                  <span className="max-w-[200px] truncate">{invite.user?.email}</span>
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs uppercase tracking-wide color-text-secondary">
                            Code
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopy(invite.code, 'Code')}
                            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg color-surface transition-colors"
                          >
                            <Copy className="w-4 h-4" />
                            {invite.code}
                          </button>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              try {
                                window.open(invite.link, '_blank', 'noopener,noreferrer')
                              } catch {}
                            }}
                            className="text-xs uppercase tracking-wide color-text-secondary hover:underline cursor-pointer"
                            title="Click to open link"
                          >
                            Link
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopy(invite.link, 'Link')}
                            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg color-surface transition-colors"
                            title={invite.link}
                          >
                            <Copy className="w-4 h-4" />
                            <span className="max-w-[120px] truncate">{invite.link}</span>
                          </button>
                        </div>
                      </>
                    )}

                    {invite.error && invite.status === 'pending' && (
                      <div className="text-xs text-red-400">
                        {invite.error}
                      </div>
                    )}
                  </div>
                )
              })}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 pb-6">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 rounded-lg color-text-secondary color-hover"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  )

  if (!showSummary) return mainModal

  return (
    <>
      {createPortal(
        <div
          className="fixed inset-0 z-[1001] flex items-center justify-center bg-black/75 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              handleCloseSummary()
            }
          }}
        >
          <div className="w-full max-w-2xl max-h-[85vh] rounded-lg shadow-lg card flex flex-col">
            <div className="flex items-center justify-between p-6 border-b color-border">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full flex items-center justify-center color-surface">
                  <Send className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">Invite Summary</h2>
                  <p className="text-sm color-text-secondary">
                    Summary of invite results
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseSummary}
                className="w-8 h-8 flex items-center justify-center rounded color-hover color-text-secondary"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="flex items-center justify-center gap-4 p-4 rounded-lg color-surface">
                <div className="text-center">
                  <p className="text-3xl font-bold color-text">
                    {summaryStats.created}
                  </p>
                  <p className="text-sm color-text-secondary">Users Added</p>
                </div>
                <div className="text-2xl color-text-secondary">/</div>
                <div className="text-center">
                  <p className="text-3xl font-bold color-text">
                    {summaryStats.total}
                  </p>
                  <p className="text-sm color-text-secondary">Total Invites</p>
                </div>
              </div>

              {Array.from(summaryStats.usersByGroup.entries()).map(([groupName, groupUsers]) => {
                const displayGroupName = groupName !== 'No Group' ? groupName : ''
                const userWord = groupUsers.length === 1 ? 'User' : 'Users'
                const allSynced = groupUsers.every((invite) => invite.synced === true)
                const syncText = allSynced ? ' and Synced' : ''
                const title = displayGroupName
                  ? `${groupUsers.length} ${displayGroupName} ${userWord} Created${syncText}`
                  : `${groupUsers.length} ${userWord} Created${syncText}`
                
                return (
                  <div key={groupName} className="space-y-3">
                    <h3 className="text-sm font-semibold color-text flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      {title}
                    </h3>
                  <div className="space-y-2">
                    {groupUsers.map((invite) => (
                      <div
                        key={invite.id}
                        className="p-3 rounded-lg border border-emerald-400/60 bg-emerald-500/5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs uppercase tracking-wide color-text-secondary">
                            User
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopy(invite.user?.username || '', 'Username')}
                            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg color-surface transition-colors"
                          >
                            <Copy className="w-4 h-4" />
                            {invite.user?.username || 'Stremio user'}
                          </button>
                        </div>
                        {invite.user?.email && (
                          <div className="flex items-center justify-between gap-2 mt-2">
                            <span className="text-xs uppercase tracking-wide color-text-secondary">
                              Email
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopy(invite.user?.email || '', 'Email')}
                              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg color-surface transition-colors"
                            >
                              <Copy className="w-4 h-4" />
                              <span className="max-w-[200px] truncate">{invite.user.email}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                )
              })}

              {summaryStats.failedInvites.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold color-text flex items-center gap-2">
                    <XCircle className="w-4 h-4 text-red-400" />
                    Failed/Expired ({summaryStats.failedInvites.length})
                  </h3>
                  <div className="space-y-2">
                    {summaryStats.failedInvites.map((invite) => {
                      const inviteIndex = invites.findIndex((i) => i.id === invite.id)
                      return (
                        <div
                          key={invite.id}
                          className="p-3 rounded-lg border border-red-500/60 bg-red-500/5"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium color-text">Invite {inviteIndex >= 0 ? inviteIndex + 1 : 'N/A'}</p>
                              <p className="text-xs color-text-secondary">
                                {invite.status === 'expired' ? 'Expired' : invite.error || 'Failed'}
                              </p>
                            </div>
                            {invite.status === 'expired' ? (
                              <Clock className="w-4 h-4 text-red-400" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-400" />
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {summaryStats.pending > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold color-text flex items-center gap-2">
                    <Clock className="w-4 h-4 color-text-secondary" />
                    Still Pending ({summaryStats.pending})
                  </h3>
                  <p className="text-sm color-text-secondary">
                    {summaryStats.pending} invite{summaryStats.pending > 1 ? 's' : ''} still waiting for users to connect.
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 px-6 pb-6 border-t color-border">
              <button
                type="button"
                onClick={handleCloseSummary}
                className="px-4 py-2 rounded-lg color-surface transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
