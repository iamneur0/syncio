'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, Invitation, Group, InviteRequest } from '@/lib/api';
import { Header, Breadcrumbs } from '@/components/layout/Header';
import { Button, Card, Badge, ConfirmModal, UserAvatar } from '@/components/ui';
import { PageSection, StaggerContainer, StaggerItem } from '@/components/layout/PageContainer';
import { toast, showToast } from '@/components/ui/Toast';
import {
  EnvelopeIcon,
  ClipboardIcon,
  CheckIcon,
  XMarkIcon,
  ClockIcon,
  UsersIcon,
  TrashIcon,
  ArrowPathIcon,
  PencilIcon,
  ArrowUturnLeftIcon,
  ArrowTopRightOnSquareIcon,
  LinkIcon,
  ChartPieIcon,
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';

interface InvitationWithRequests extends Invitation {
  requests?: InviteRequest[];
}

export default function InvitationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const invitationId = params.id as string;

  const [invitation, setInvitation] = useState<InvitationWithRequests | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteUserConfirm, setDeleteUserConfirm] = useState<{
    open: boolean;
    request: InviteRequest | null;
  }>({ open: false, request: null });
  const [copiedLink, setCopiedLink] = useState(false);

  // Fetch invitation data
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [invitationsData, groupsData] = await Promise.all([
          api.getInvitations(),
          api.getGroups(),
        ]);

        const foundInvitation = invitationsData.find((inv: any) => inv.id === invitationId);
        if (!foundInvitation) {
          throw new Error('Invitation not found');
        }

        // Fetch requests for this invitation
        let requests: InviteRequest[] = [];
        if (foundInvitation.requests && Array.isArray(foundInvitation.requests)) {
          requests = foundInvitation.requests;
        } else {
          try {
            const invRequests = await api.getInvitationRequests(invitationId);
            if (Array.isArray(invRequests)) {
              requests = invRequests;
            }
          } catch {
            // Skip if requests can't be fetched
          }
        }

        setInvitation({ ...foundInvitation, requests });
        setGroups(groupsData);
      } catch (err) {
        setError(err as Error);
        toast.error('Failed to load invitation');
      } finally {
        setIsLoading(false);
      }
    };

    if (invitationId) {
      fetchData();
    }
  }, [invitationId]);

  useEffect(() => {
    if (invitation) {
      document.title = `Syncio - Invitation ${invitation.code || invitation.inviteCode || ''}`;
    }
  }, [invitation]);

  const handleCopyLink = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    navigator.clipboard.writeText(`${origin}/invite/${invitation?.code || invitation?.inviteCode}`);
    setCopiedLink(true);
    toast.success('Invite link copied to clipboard');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleDelete = async () => {
    try {
      await api.deleteInvitation(invitationId);
      toast.success('Invitation deleted successfully');
      router.push('/invitations');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete invitation');
    }
  };

  const handleAcceptRequest = async (requestId: string) => {
    try {
      await api.acceptInviteRequest(requestId);
      toast.success('Request accepted');
      // Refresh data
      window.location.reload();
    } catch (err: any) {
      toast.error(err.message || 'Failed to accept request');
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    try {
      await api.rejectInviteRequest(requestId);
      toast.success('Request rejected');
      window.location.reload();
    } catch (err: any) {
      toast.error(err.message || 'Failed to reject request');
    }
  };

  const handleDeleteUser = async (requestId: string) => {
    try {
      await api.rejectInviteRequest(requestId);
      toast.success('User removed');
      window.location.reload();
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove user');
    }
  };

  const usagePercentage = useMemo(() => {
    if (!invitation?.maxUses) return 0;
    const uses = invitation.currentUses || invitation.uses || 0;
    return (uses / invitation.maxUses) * 100;
  }, [invitation]);

  const isExpired = invitation?.expiresAt && new Date(invitation.expiresAt) < new Date();
  const isFull = invitation?.maxUses && (invitation.currentUses || invitation.uses || 0) >= invitation.maxUses;
  const isActive = !isExpired && !isFull;

  if (isLoading) {
    return (
      <>
        <Header title={<Breadcrumbs items={[{ label: 'Invitations', href: '/invitations' }, { label: 'Loading...' }]} />} />
        <div className="p-8">
          <div className="flex items-center justify-center py-20">
            <div className="flex items-center gap-3 text-muted">
              <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              <span>Loading invitation...</span>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (error || !invitation) {
    return (
      <>
        <Header title={<Breadcrumbs items={[{ label: 'Invitations', href: '/invitations' }, { label: 'Error' }]} />} />
        <div className="p-8">
          <Card padding="lg" className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center bg-error-muted">
              <XMarkIcon className="w-8 h-8 text-error" />
            </div>
            <h3 className="text-lg font-medium mb-2 text-default">Invitation Not Found</h3>
            <p className="text-muted mb-4">{error?.message || 'The invitation you are looking for does not exist.'}</p>
            <Button variant="primary" onClick={() => router.push('/invitations')}>
              Back to Invitations
            </Button>
          </Card>
        </div>
      </>
    );
  }

  const code = invitation.code || invitation.inviteCode || '';
  const group = groups.find(g => g.name === invitation.groupName);

  return (
    <>
      <Header
        title={
          <Breadcrumbs
            items={[
              { label: 'Invitations', href: '/invitations' },
              { label: code },
            ]}
            className="text-xl font-semibold"
          />
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<PencilIcon className="w-4 h-4" />}
              onClick={() => showToast.info('Edit functionality coming soon')}
            >
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<TrashIcon className="w-4 h-4" />}
              onClick={() => setDeleteConfirmOpen(true)}
            >
              Delete
            </Button>
          </div>
        }
      />

      <div className="p-8">
        {/* Hero Section - Invitation Info */}
        <PageSection className="mb-8">
          <Card padding="lg">
            <div className="flex items-start gap-6">
              {/* Envelope Icon */}
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 bg-primary-muted text-primary">
                <EnvelopeIcon className="w-8 h-8" />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-2xl font-bold font-display text-default">{code}</h1>
                  {isExpired ? (
                    <Badge variant="error">Expired</Badge>
                  ) : isFull ? (
                    <Badge variant="error">Full</Badge>
                  ) : (
                    <Badge variant="success">Active</Badge>
                  )}
                </div>

                <p className="text-muted mb-4">
                  {invitation.groupName || 'No group assigned'}
                </p>

                {/* Stats Row */}
                <div className="flex flex-wrap items-center gap-6 text-sm">
                  <div className="flex items-center gap-2">
                    <UsersIcon className="w-4 h-4 text-muted" />
                    <span className="text-default font-medium">{invitation.currentUses || invitation.uses || 0}</span>
                    <span className="text-muted">/</span>
                    <span className="text-muted">{invitation.maxUses || '∞'} uses</span>
                  </div>

                  {invitation.expiresAt && (
                    <div className="flex items-center gap-2">
                      <ClockIcon className="w-4 h-4 text-muted" />
                      <span className={isExpired ? 'text-error' : 'text-muted'}>
                        {isExpired ? 'Expired ' : 'Expires '}
                        {format(new Date(invitation.expiresAt), 'MMM d, yyyy')}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <ClockIcon className="w-4 h-4 text-muted" />
                    <span className="text-muted">
                      Created {format(new Date(invitation.createdAt), 'MMM d, yyyy')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </PageSection>

        {/* Invite Link Section */}
        <PageSection delay={0.1} className="mb-8">
          <Card padding="lg">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/20">
                  <LinkIcon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-base font-semibold font-display text-default">Invite Link</h3>
                  <p className="text-sm text-muted">Share this link to invite users</p>
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={copiedLink ? <CheckIcon className="w-4 h-4" /> : <ClipboardIcon className="w-4 h-4" />}
                onClick={handleCopyLink}
              >
                {copiedLink ? 'Copied!' : 'Copy Link'}
              </Button>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-xl bg-surface-hover border border-default">
              <LinkIcon className="w-5 h-5 text-muted shrink-0" />
              <code className="flex-1 text-sm font-mono text-default truncate">
                {typeof window !== 'undefined' ? window.location.origin : ''}/invite/{code}
              </code>
            </div>
          </Card>
        </PageSection>

        {/* Usage Progress Section */}
        {invitation.maxUses != null && invitation.maxUses > 0 && (
          <PageSection delay={0.15} className="mb-8">
            <Card padding="lg">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-secondary/20">
                    <ChartPieIcon className="w-5 h-5 text-secondary" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold font-display text-default">Usage</h3>
                    <p className="text-sm text-muted">
                      {invitation.currentUses || invitation.uses || 0} of {invitation.maxUses} uses
                    </p>
                  </div>
                </div>
                <span 
                  className="text-sm font-bold tabular-nums"
                  style={{ 
                    color: usagePercentage >= 80 
                      ? 'var(--color-error)' 
                      : usagePercentage >= 50 
                        ? 'var(--color-warning)' 
                        : 'var(--color-primary)'
                  }}
                >
                  {Math.round(usagePercentage)}%
                </span>
              </div>
              
              <div className="relative h-8 rounded-lg overflow-hidden bg-surface-hover shadow-inner mb-3">
                <div className="absolute inset-0 rounded-lg shadow-[inset_0_1px_3px_rgba(0,0,0,0.3)] pointer-events-none z-10" />
                
                {/* Background track with unused count */}
                <div className="absolute inset-0 flex items-center justify-end pr-3">
                  <span className="text-xs font-bold text-default tabular-nums">
                    {(invitation.maxUses || 0) - (invitation.currentUses || invitation.uses || 0)}
                  </span>
                </div>
                
                <motion.div 
                  className="h-full rounded-lg relative flex items-center justify-center"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(usagePercentage, 100)}%` }}
                  transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                  style={{ 
                    background: usagePercentage >= 80
                      ? 'linear-gradient(180deg, rgba(239,68,68,0.9) 0%, rgba(220,38,38,0.95) 100%)'
                      : 'linear-gradient(180deg, var(--color-primary) 0%, var(--color-secondary) 100%)'
                  }}
                >
                  {/* Used count in center of used portion (only show if > 0) */}
                  {(invitation.currentUses || invitation.uses || 0) > 0 && (
                    <span className="text-xs font-bold text-white tabular-nums drop-shadow-md">
                      {invitation.currentUses || invitation.uses || 0}
                    </span>
                  )}
                  <div className="absolute inset-0 overflow-hidden rounded-lg">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent w-full h-full animate-shimmer" />
                  </div>
                </motion.div>
              </div>
            </Card>
          </PageSection>
        )}

        {/* Invited Users Section */}
        <PageSection delay={0.2}>
          <Card padding="lg">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold font-display text-default">
                <span className="text-muted font-normal mr-2">{invitation.requests?.length || 0}</span>
                Invited Users
              </h3>
            </div>

            {invitation.requests && invitation.requests.length > 0 ? (
              <StaggerContainer className="space-y-3">
                {invitation.requests.map((request, index) => (
                  <StaggerItem key={request.id}>
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="flex items-center gap-4 p-4 rounded-xl bg-surface-hover border border-default"
                    >
                      <UserAvatar 
                        userId={request.id} 
                        name={request.username || request.email} 
                        email={request.email}
                        size="md" 
                      />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-default">
                            {request.username || request.email}
                          </span>
                          <Badge 
                            variant={
                              request.status === 'accepted' || request.status === 'joined'
                                ? 'success'
                                : request.status === 'rejected'
                                  ? 'error'
                                  : request.status === 'pending'
                                    ? 'warning'
                                    : 'muted'
                            }
                            size="sm"
                          >
                            {request.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted mt-0.5">
                          {request.email && request.username !== request.email && (
                            <>{request.email} • </>
                          )}
                          Requested {format(new Date(request.createdAt), 'MMM d, yyyy')}
                          {request.respondedAt && (
                            <> • Responded {format(new Date(request.respondedAt), 'MMM d, yyyy')}</>
                          )}
                        </p>

                        {/* OAuth Code Display */}
                        {request.oauthCode && request.status === 'accepted' && (
                          <div className="mt-2 flex items-center gap-2">
                            <code className="text-xs font-mono px-2 py-1 rounded bg-surface text-default">
                              {request.oauthCode}
                            </code>
                            {request.oauthLink && (
                              <a
                                href={request.oauthLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:text-primary-hover flex items-center gap-1"
                              >
                                Open Link
                                <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-1">
                        {request.status === 'pending' && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleAcceptRequest(request.id)}
                              leftIcon={<CheckIcon className="w-4 h-4" />}
                            >
                              Accept
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRejectRequest(request.id)}
                              leftIcon={<XMarkIcon className="w-4 h-4" />}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                        {request.status === 'rejected' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAcceptRequest(request.id)}
                            leftIcon={<ArrowUturnLeftIcon className="w-4 h-4" />}
                          >
                            Undo
                          </Button>
                        )}
                        {(request.status === 'accepted' || request.status === 'joined') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteUserConfirm({ open: true, request })}
                            leftIcon={<TrashIcon className="w-4 h-4 text-error" />}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    </motion.div>
                  </StaggerItem>
                ))}
              </StaggerContainer>
            ) : (
              <div className="text-center py-12">
                <UsersIcon className="w-12 h-12 mx-auto text-muted mb-3" />
                <p className="text-muted">No users have been invited yet</p>
              </div>
            )}
          </Card>
        </PageSection>
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDelete}
        title="Delete Invitation"
        description={`Are you sure you want to delete invitation "${code}"? This will invalidate the invite code and remove all associated users.`}
        confirmText="Delete Invitation"
        variant="danger"
      />

      {/* Remove User Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteUserConfirm.open}
        onClose={() => setDeleteUserConfirm({ open: false, request: null })}
        onConfirm={() => {
          if (deleteUserConfirm.request) {
            handleDeleteUser(deleteUserConfirm.request.id);
          }
          setDeleteUserConfirm({ open: false, request: null });
        }}
        title="Remove User"
        description={`Are you sure you want to remove ${deleteUserConfirm.request?.username || deleteUserConfirm.request?.email} from this invitation?`}
        confirmText="Remove User"
        variant="danger"
      />
    </>
  );
}
