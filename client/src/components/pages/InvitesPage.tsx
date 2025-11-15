'use client'

import React, { useMemo } from 'react'
import { format } from 'date-fns'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Mail } from 'lucide-react'
import { invitationsAPI, groupsAPI } from '@/services/api'
import PageHeader from '@/components/layout/PageHeader'
import InviteDetailModal from '@/components/modals/InviteDetailModal'
import { ConfirmDialog } from '@/components/modals'
import DateTimePicker from '@/components/ui/DateTimePicker'
import EntityCard from '@/components/entities/EntityCard'
import { SyncBadge } from '@/components/ui'
import { EmptyState } from '@/components/ui'

interface Invitation {
  id: string
  inviteCode: string
  groupName: string | null
  maxUses: number
  currentUses: number
  expiresAt: string | null
  isActive: boolean
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

export default function InvitesPage() {
  const queryClient = useQueryClient()
  const [showCreateModal, setShowCreateModal] = React.useState(false)
  const [maxUses, setMaxUses] = React.useState<number>(1)
  const [expiresAt, setExpiresAt] = React.useState<string>('')
  const [selectedGroupForCreate, setSelectedGroupForCreate] = React.useState<string>('')
  const [searchTerm, setSearchTerm] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('invites-filter')
      return saved || 'all'
    }
    return 'all'
  })
  
  // Persist filter to localStorage
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('invites-filter', statusFilter)
    }
  }, [statusFilter])

  // Close create modal on Escape key
  React.useEffect(() => {
    if (!showCreateModal) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowCreateModal(false)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [showCreateModal])
  const [selectedInvitations, setSelectedInvitations] = React.useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = React.useState<'card' | 'list'>(() => {
    if (typeof window !== 'undefined') {
      const raw = String(localStorage.getItem('global-view-mode') || 'card').toLowerCase().trim()
      return (raw === 'list' ? 'list' : 'card') as 'card' | 'list'
    }
    return 'card'
  })
  
  const handleViewModeChange = (mode: 'card' | 'list') => {
    setViewMode(mode)
    if (typeof window !== 'undefined') {
      localStorage.setItem('global-view-mode', mode)
    }
  }
  
  const [selectedInvitation, setSelectedInvitation] = React.useState<Invitation | null>(null)
  const [showDetailModal, setShowDetailModal] = React.useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false)
  const [invitationToDelete, setInvitationToDelete] = React.useState<{ id: string; inviteCode: string } | null>(null)

  // Fetch invitations with automatic polling
  const { data: invitations = [], isLoading, refetch } = useQuery({
    queryKey: ['invitations'],
    queryFn: invitationsAPI.getAll,
    staleTime: 0, // Always consider data stale to ensure fresh fetches
    refetchInterval: 3000 // Poll every 3 seconds to check for new requests and status updates
  })

  // Fetch groups for assignment
  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: groupsAPI.getAll
  })

  // Filter and sort invitations based on search and status
  // Sort: enabled invites first (recent to old), then disabled invites (recent to old)
  const filteredInvitations = useMemo(() => {
    let filtered = invitations
    
    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((inv: Invitation) => {
        const isExpired = inv.expiresAt && new Date(inv.expiresAt) < new Date()
        const isFull = inv.maxUses != null && inv.currentUses >= inv.maxUses
        const isIncomplete = !isFull && !isExpired
        // An invite is effectively inactive if: toggle is off OR full OR expired
        const isEffectivelyInactive = !inv.isActive || isFull || isExpired
        // An invite is effectively active if: toggle is on AND not full AND not expired
        const isEffectivelyActive = inv.isActive && !isFull && !isExpired
        
        switch (statusFilter) {
          case 'incomplete':
            return isIncomplete
          case 'expired':
            return isExpired
          case 'full':
            return isFull
          case 'active':
            return isEffectivelyActive
          case 'inactive':
            return isEffectivelyInactive
          default:
            return true
        }
      })
    }
    
    // Apply search filter
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase()
      filtered = filtered.filter((inv: Invitation) => 
        inv.inviteCode.toLowerCase().includes(searchLower) ||
        inv.requests.some((req: InviteRequest) => 
          req.email.toLowerCase().includes(searchLower) ||
          req.username.toLowerCase().includes(searchLower)
        )
      )
    }
    
    // Sort: enabled invites first (recent to old), then disabled/full/expired invites (recent to old)
    return [...filtered].sort((a: Invitation, b: Invitation) => {
      // Check if invite is effectively disabled (disabled OR full OR expired)
      const aIsExpired = a.expiresAt && new Date(a.expiresAt) < new Date()
      const bIsExpired = b.expiresAt && new Date(b.expiresAt) < new Date()
      const aIsDisabled = !a.isActive || (a.maxUses != null && a.currentUses >= a.maxUses) || aIsExpired
      const bIsDisabled = !b.isActive || (b.maxUses != null && b.currentUses >= b.maxUses) || bIsExpired
      
      // First, group by disabled status (enabled first)
      if (aIsDisabled !== bIsDisabled) {
        return aIsDisabled ? 1 : -1 // enabled comes before disabled
      }
      // Within each group, sort by createdAt descending (recent to old)
      const dateA = new Date(a.createdAt).getTime()
      const dateB = new Date(b.createdAt).getTime()
      return dateB - dateA // descending order (newest first)
    })
  }, [invitations, searchTerm, statusFilter])

  // Create invitation mutation
  const createMutation = useMutation({
    mutationFn: invitationsAPI.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] })
      toast.success('Invite created successfully')
      setShowCreateModal(false)
      setMaxUses(1)
      setExpiresAt('')
      setSelectedGroupForCreate('')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'Failed to create invite')
    }
  })

  // Delete invitation mutation
  const deleteMutation = useMutation({
    mutationFn: invitationsAPI.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] })
      toast.success('Invite deleted successfully')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'Failed to delete invite')
    }
  })



  // Clear all OAuth links for accepted requests in an invitation
  const refreshAllUnusedOAuth = useMutation({
    mutationFn: async (invitation: Invitation) => {
      // Find all accepted requests that have OAuth links (unused OAuth links)
      const unusedRequests = invitation.requests.filter(
        (req: InviteRequest) => req.status === 'accepted' && req.oauthCode && req.oauthLink
      )
      
      // Clear OAuth link for each accepted request (user can generate new one)
      const clearPromises = unusedRequests.map((req: InviteRequest) =>
        invitationsAPI.clearOAuth(req.id)
      )
      
      await Promise.all(clearPromises)
      return unusedRequests.length
    },
    onSuccess: async (count) => {
      await queryClient.invalidateQueries({ queryKey: ['invitations'] })
      await refetch()
      toast.success(`Cleared ${count} OAuth link${count !== 1 ? 's' : ''}. Users can now generate new links.`)
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'Failed to clear OAuth links')
    }
  })

  // Clear all OAuth links for all accepted requests across all invitations
  const clearAllOAuthMutation = useMutation({
    mutationFn: async () => {
      // Find all accepted requests with OAuth links across all invitations
      const allAcceptedRequests: InviteRequest[] = []
      invitations.forEach((invitation: Invitation) => {
        const acceptedRequests = invitation.requests.filter(
          (req: InviteRequest) => req.status === 'accepted' && req.oauthCode && req.oauthLink
        )
        allAcceptedRequests.push(...acceptedRequests)
      })
      
      // Clear OAuth link for each accepted request
      const clearPromises = allAcceptedRequests.map((req: InviteRequest) =>
        invitationsAPI.clearOAuth(req.id)
      )
      
      await Promise.all(clearPromises)
      return allAcceptedRequests.length
    },
    onSuccess: async (count) => {
      await queryClient.invalidateQueries({ queryKey: ['invitations'] })
      await refetch()
      toast.success(`Cleared ${count} OAuth link${count !== 1 ? 's' : ''}. Users can now generate new links.`)
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'Failed to clear OAuth links')
    }
  })

  // Toggle invitation status
  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      invitationsAPI.toggleStatus(id, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] })
      refetch()
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'Failed to toggle invitation status')
    }
  })

  const handleCreateInvitation = () => {
    if (!expiresAt) {
      toast.error('Please select an expiration date and time')
      return
    }

    const finalMaxUses = Math.min(Math.max(maxUses || 1, 1), 10)
    if (maxUses > 10) {
      toast.error('Maximum uses cannot exceed 10')
      return
    }

    createMutation.mutate({
      maxUses: finalMaxUses,
      expiresAt: expiresAt,
      groupName: selectedGroupForCreate || undefined
    })
  }

  const handleDeleteInvitation = (id: string) => {
    const invitation = invitations?.find((inv: Invitation) => inv.id === id)
    if (invitation) {
      setInvitationToDelete({ id, inviteCode: invitation.inviteCode })
      setShowDeleteConfirm(true)
    }
  }

  const handleConfirmDelete = () => {
    if (invitationToDelete) {
      deleteMutation.mutate(invitationToDelete.id)
      setShowDeleteConfirm(false)
      setInvitationToDelete(null)
    }
  }



  const handleSelectAll = () => {
    setSelectedInvitations(new Set(filteredInvitations.map((inv: Invitation) => inv.id)))
  }

  const handleDeselectAll = () => {
    setSelectedInvitations(new Set())
  }

  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = React.useState(false)

  const handleDelete = () => {
    if (selectedInvitations.size === 0) return
    setShowBulkDeleteConfirm(true)
  }

  const handleConfirmBulkDelete = () => {
    if (selectedInvitations.size === 0) return
    Promise.all(Array.from(selectedInvitations).map(id => invitationsAPI.delete(id)))
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['invitations'] })
        toast.success(`${selectedInvitations.size} invite(s) deleted successfully`)
        setSelectedInvitations(new Set())
        setShowBulkDeleteConfirm(false)
      })
      .catch((error: any) => {
        toast.error(error?.response?.data?.error || 'Failed to delete invites')
        setShowBulkDeleteConfirm(false)
      })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading invites...</div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Invites"
        description="Manage invite links and review access requests"
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search invites..."
        selectedCount={selectedInvitations.size}
        onSelectAll={handleSelectAll}
        onDeselectAll={handleDeselectAll}
        onAdd={() => setShowCreateModal(true)}
        onSync={() => clearAllOAuthMutation.mutate()}
        onDelete={handleDelete}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        isSyncing={clearAllOAuthMutation.isPending}
        isSyncDisabled={clearAllOAuthMutation.isPending}
        isDeleteDisabled={selectedInvitations.size === 0}
        filterOptions={[
          { value: 'all', label: 'All' },
          { value: 'incomplete', label: 'Incomplete' },
          { value: 'expired', label: 'Expired' },
          { value: 'full', label: 'Full' },
          { value: 'inactive', label: 'Inactive' },
          { value: 'active', label: 'Active' }
        ]}
        filterValue={statusFilter}
        onFilterChange={setStatusFilter}
        filterPlaceholder="Filter by status"
      />

      {/* Create Invitation Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()} style={{ background: 'var(--color-background)' }}>
            <h2 className="text-xl font-semibold mb-4">Create New Invite</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Group (optional)</label>
                <select
                  value={selectedGroupForCreate}
                  onChange={(e) => setSelectedGroupForCreate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none input"
                >
                  <option value="">No group</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.name}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Maximum Uses</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={maxUses}
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || 1
                    setMaxUses(Math.min(Math.max(value, 1), 10))
                  }}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Expires At</label>
                <DateTimePicker
                  value={expiresAt}
                  onChange={setExpiresAt}
                  min={new Date()}
                  placeholder="Select expiration date and time"
                />
                <div className="flex gap-2 mt-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      const date = new Date()
                      date.setMinutes(date.getMinutes() + 5)
                      setExpiresAt(format(date, "yyyy-MM-dd'T'HH:mm"))
                    }}
                    className="px-3 py-1 text-xs rounded transition-colors color-hover"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    5m
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const date = new Date()
                      date.setMinutes(date.getMinutes() + 30)
                      setExpiresAt(format(date, "yyyy-MM-dd'T'HH:mm"))
                    }}
                    className="px-3 py-1 text-xs rounded transition-colors color-hover"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    30m
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const date = new Date()
                      date.setHours(date.getHours() + 1)
                      setExpiresAt(format(date, "yyyy-MM-dd'T'HH:mm"))
                    }}
                    className="px-3 py-1 text-xs rounded transition-colors color-hover"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    1h
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const date = new Date()
                      date.setHours(date.getHours() + 12)
                      setExpiresAt(format(date, "yyyy-MM-dd'T'HH:mm"))
                    }}
                    className="px-3 py-1 text-xs rounded transition-colors color-hover"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    12h
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const date = new Date()
                      date.setDate(date.getDate() + 1)
                      setExpiresAt(format(date, "yyyy-MM-dd'T'HH:mm"))
                    }}
                    className="px-3 py-1 text-xs rounded transition-colors color-hover"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    1d
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const date = new Date()
                      date.setDate(date.getDate() + 7)
                      setExpiresAt(format(date, "yyyy-MM-dd'T'HH:mm"))
                    }}
                    className="px-3 py-1 text-xs rounded transition-colors color-hover"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    1w
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const date = new Date()
                      date.setDate(date.getDate() + 14)
                      setExpiresAt(format(date, "yyyy-MM-dd'T'HH:mm"))
                    }}
                    className="px-3 py-1 text-xs rounded transition-colors color-hover"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    2w
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const date = new Date()
                      date.setDate(date.getDate() + 30)
                      setExpiresAt(format(date, "yyyy-MM-dd'T'HH:mm"))
                    }}
                    className="px-3 py-1 text-xs rounded transition-colors color-hover"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    30d
                  </button>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-sm font-medium rounded-lg transition-colors color-text-secondary color-hover"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateInvitation}
                  disabled={createMutation.isPending || !expiresAt}
                  className="px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 color-surface hover:opacity-90"
                >
                  {createMutation.isPending ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Invitations List */}
      {filteredInvitations.length === 0 ? (
        <EmptyState
          icon={<Mail className="w-16 h-16" />}
          title="No invites yet"
          description="Create your first invite to get started."
          action={{
            label: 'Create Invite',
            onClick: () => setShowCreateModal(true)
          }}
        />
      ) : (
        <div className={`mt-6 ${viewMode === 'card' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4' : 'space-y-2'}`}>
          {filteredInvitations.map((invitation: Invitation) => (
            <EntityCard
              key={invitation.id}
              variant="invitation"
              entity={{
                id: invitation.id,
                name: invitation.inviteCode,
                inviteCode: invitation.inviteCode,
                isActive: invitation.isActive,
                colorIndex: 1,
                maxUses: invitation.maxUses,
                currentUses: invitation.currentUses,
                expiresAt: invitation.expiresAt ?? undefined,
                groupName: invitation.groupName || undefined,
                requests: invitation.requests
              }}
              isSelected={selectedInvitations.has(invitation.id)}
              onSelect={(id) => {
                setSelectedInvitations(prev => {
                  const next = new Set(prev)
                  if (next.has(id)) {
                    next.delete(id)
                  } else {
                    next.add(id)
                  }
                  return next
                })
              }}
              onToggle={(id, isActive) => {
                const invitation = invitations?.find((inv: Invitation) => inv.id === id)
                // Prevent enabling if invite is full
                if (invitation && !isActive && invitation.maxUses != null && invitation.currentUses >= invitation.maxUses) {
                  toast.error('Cannot enable invite that has reached maximum uses')
                  return
                }
                // Prevent enabling if invite is expired
                if (invitation && !isActive && invitation.expiresAt && new Date(invitation.expiresAt) < new Date()) {
                  toast.error('Cannot enable invite that has expired')
                  return
                }
                toggleStatusMutation.mutate({ 
                  id, 
                  isActive: !isActive 
                })
              }}
              onView={() => {
                setSelectedInvitation(invitation)
                setShowDetailModal(true)
              }}
              onDelete={handleDeleteInvitation}
              onRefreshOAuth={(entity) => {
                refreshAllUnusedOAuth.mutate(invitation)
              }}
              isRefreshingOAuth={refreshAllUnusedOAuth.isPending}
              customBadge={
                <SyncBadge 
                  status={
                    invitation.expiresAt && new Date(invitation.expiresAt) < new Date()
                      ? 'expired'
                      : invitation.currentUses >= invitation.maxUses
                      ? 'full'
                      : 'incomplete'
                  }
                  isListMode={viewMode === 'list'}
                  title={
                    invitation.expiresAt && new Date(invitation.expiresAt) < new Date()
                      ? 'Expired (invitation has expired)'
                      : invitation.currentUses >= invitation.maxUses
                      ? 'Full (max uses reached)'
                      : 'Incomplete (not all invites used)'
                  }
                />
              }
              isListMode={viewMode === 'list'}
            />
          ))}
        </div>
      )}

      {/* Invite Detail Modal */}
      <InviteDetailModal
        isOpen={showDetailModal}
        onClose={() => {
          setShowDetailModal(false)
          setSelectedInvitation(null)
        }}
        invitation={selectedInvitation}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Invite"
        body={
          <p className="text-sm">
            Are you sure you want to delete invite{' '}
            <span
              onClick={async () => {
                if (invitationToDelete?.inviteCode) {
                  await navigator.clipboard.writeText(invitationToDelete.inviteCode)
                  toast.success('Copied to clipboard')
                }
              }}
              className="font-bold px-2 py-1 rounded cursor-pointer inline-block"
              style={{ backgroundColor: 'var(--color-hover)' }}
              title="Click to copy"
            >
              {invitationToDelete?.inviteCode}
            </span>
            ? This action cannot be undone.
          </p>
        }
        confirmText="Delete"
        cancelText="Cancel"
        isDanger={true}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setShowDeleteConfirm(false)
          setInvitationToDelete(null)
        }}
      />

      {/* Bulk Delete Confirmation Modal */}
      <ConfirmDialog
        open={showBulkDeleteConfirm}
        title={`Delete ${selectedInvitations.size} Invite${selectedInvitations.size > 1 ? 's' : ''}`}
        description={`Are you sure you want to delete ${selectedInvitations.size} selected invite${selectedInvitations.size > 1 ? 's' : ''}? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        isDanger={true}
        onConfirm={handleConfirmBulkDelete}
        onCancel={() => setShowBulkDeleteConfirm(false)}
      />
    </div>
  )
}

