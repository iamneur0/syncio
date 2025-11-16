'use client'

import React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Mail } from 'lucide-react'
import { invitationsAPI } from '@/services/api'
import GenericEntityPage, { EntityPageConfig } from '@/components/layout/GenericEntityPage'
import InviteDetailModal from '@/components/modals/InviteDetailModal'
import InviteAddModal from '@/components/modals/InviteAddModal'
import { SyncBadge } from '@/components/ui'

interface Invite {
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

  // Clear all OAuth links for all accepted requests across all invites
  const clearAllOAuthMutation = useMutation({
    mutationFn: async (invites: Invite[]) => {
      const allAcceptedRequests: InviteRequest[] = []
      invites.forEach((invite: Invite) => {
        const acceptedRequests = invite.requests.filter(
          (req: InviteRequest) => req.status === 'accepted' && req.oauthCode && req.oauthLink
        )
        allAcceptedRequests.push(...acceptedRequests)
      })
      
      const clearPromises = allAcceptedRequests.map((req: InviteRequest) =>
        invitationsAPI.clearOAuth(req.id)
      )
      
      await Promise.all(clearPromises)
      return allAcceptedRequests.length
    },
    onSuccess: async (count) => {
      await queryClient.invalidateQueries({ queryKey: ['invitations'] })
      toast.success(`Cleared ${count} OAuth link${count !== 1 ? 's' : ''}. Users can now generate new links.`)
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'Failed to clear OAuth links')
    }
  })

  // Custom filter function for invites
  const customFilter = React.useCallback((entities: any[], statusFilter: string, searchTerm: string) => {
    let filtered = entities
    
    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((inv: Invite) => {
        const isExpired = inv.expiresAt && new Date(inv.expiresAt) < new Date()
        const isFull = inv.maxUses != null && inv.currentUses >= inv.maxUses
        const isIncomplete = !isFull && !isExpired
        const isEffectivelyInactive = !inv.isActive || isFull || isExpired
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
      filtered = filtered.filter((inv: Invite) => 
        inv.inviteCode.toLowerCase().includes(searchLower) ||
        inv.requests.some((req: InviteRequest) => 
          req.email.toLowerCase().includes(searchLower) ||
          req.username.toLowerCase().includes(searchLower)
        )
      )
    }
    
    return filtered
  }, [])

  // Custom sort function for invites
  const customSort = React.useCallback((entities: any[]) => {
    return [...entities].sort((a: Invite, b: Invite) => {
      const aIsExpired = a.expiresAt && new Date(a.expiresAt) < new Date()
      const bIsExpired = b.expiresAt && new Date(b.expiresAt) < new Date()
      const aIsDisabled = !a.isActive || (a.maxUses != null && a.currentUses >= a.maxUses) || aIsExpired
      const bIsDisabled = !b.isActive || (b.maxUses != null && b.currentUses >= b.maxUses) || bIsExpired
      
      if (aIsDisabled !== bIsDisabled) {
        return aIsDisabled ? 1 : -1
      }
      
      const dateA = new Date(a.createdAt).getTime()
      const dateB = new Date(b.createdAt).getTime()
      return dateB - dateA
    })
  }, [])

  // Toggle status mutation
  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      invitationsAPI.toggleStatus(id, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] })
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'Failed to toggle invite status')
    }
  })

  // Clear OAuth for a single invite
  const refreshOAuthMutation = useMutation({
    mutationFn: async (invite: Invite) => {
      const unusedRequests = invite.requests.filter(
        (req: InviteRequest) => req.status === 'accepted' && req.oauthCode && req.oauthLink
      )
      const clearPromises = unusedRequests.map((req: InviteRequest) =>
        invitationsAPI.clearOAuth(req.id)
      )
      await Promise.all(clearPromises)
      return unusedRequests.length
    },
    onSuccess: async (count) => {
      await queryClient.invalidateQueries({ queryKey: ['invitations'] })
      toast.success(`Cleared ${count} OAuth link${count !== 1 ? 's' : ''}. Users can now generate new links.`)
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'Failed to clear OAuth links')
    }
  })

  const config: EntityPageConfig = {
    entityType: 'invite',
    title: 'Invites',
    description: 'Manage invite links and review access requests',
    searchPlaceholder: 'Search invites...',
    emptyStateTitle: 'No invites yet',
    emptyStateDescription: 'Create your first invite to get started.',
    emptyStateAction: {
      label: 'Create Invite',
      onClick: () => {}
    },
    icon: <Mail className="w-16 h-16" />,
    api: {
      getAll: invitationsAPI.getAll,
      create: invitationsAPI.create,
      update: async () => {},
      delete: invitationsAPI.delete,
      enable: async (id: string) => invitationsAPI.toggleStatus(id, true),
      disable: async (id: string) => invitationsAPI.toggleStatus(id, false)
    },
    detailModal: InviteDetailModal,
    addModal: InviteAddModal,
    getEntityStatus: (entity: any) => {
      const isExpired = entity.expiresAt && new Date(entity.expiresAt) < new Date()
      const isFull = entity.maxUses != null && entity.currentUses >= entity.maxUses
      return entity.isActive && !isFull && !isExpired
    },
    getEntityName: (entity: any) => entity.inviteCode || entity.name,
    getEntityId: (entity: any) => entity.id,
    searchFields: ['inviteCode'],
    customFilter,
    customSort,
    customSync: async () => {
      const invites = await queryClient.fetchQuery({
        queryKey: ['invitations'],
        queryFn: invitationsAPI.getAll
      }) || []
      clearAllOAuthMutation.mutate(invites as Invite[])
    },
    customEntityTransform: (entity: any) => ({
      ...entity,
      name: entity.inviteCode || entity.name,
      inviteCode: entity.inviteCode,
      isActive: entity.isActive,
      colorIndex: 1,
      maxUses: entity.maxUses,
      currentUses: entity.currentUses,
      expiresAt: entity.expiresAt ?? undefined,
      groupName: entity.groupName || undefined,
      requests: entity.requests
    }),
    customToggleHandler: (id: string, isActive: boolean, entity: any) => {
      const invite = entity as Invite
      // Prevent enabling if invite is full
      if (!isActive && invite.maxUses != null && invite.currentUses >= invite.maxUses) {
        toast.error('Cannot enable invite that has reached maximum uses')
        return
      }
      // Prevent enabling if invite is expired
      if (!isActive && invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
        toast.error('Cannot enable invite that has expired')
        return
      }
      toggleStatusMutation.mutate({ id, isActive: !isActive })
    },
    customBadgeRenderer: (entity: any, viewMode: 'card' | 'list') => {
      const invite = entity as Invite
      const isExpired = invite.expiresAt && new Date(invite.expiresAt) < new Date()
      const isFull = invite.maxUses != null && invite.currentUses >= invite.maxUses
      
      return (
        <SyncBadge 
          status={
            isExpired
              ? 'expired'
              : isFull
              ? 'full'
              : 'incomplete'
          }
          isListMode={viewMode === 'list'}
          title={
            isExpired
              ? 'Expired (invite has expired)'
              : isFull
              ? 'Full (max uses reached)'
              : 'Incomplete (not all invites used)'
          }
        />
      )
    },
    customRefreshOAuth: (entity: any) => {
      refreshOAuthMutation.mutate(entity as Invite)
    },
    refetchInterval: 3000
  }

  return <GenericEntityPage config={config} />
}
