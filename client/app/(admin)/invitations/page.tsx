'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Button, Card, Badge, Avatar, Modal, Input, Select, ConfirmModal, ToggleSwitch, DateTimePicker, UserAvatar, ContextMenu, useContextMenu, SelectAllCheckbox, SelectionCheckbox, PageToolbar, ViewModeToggle } from '@/components/ui';
import { Dialog, DialogPanel } from '@headlessui/react';
import { StaggerContainer, StaggerItem } from '@/components/layout/PageContainer';
import { toast } from '@/components/ui/Toast';
import { api, Invitation, Group } from '@/lib/api';
import {
  PlusIcon,
  EnvelopeIcon,
  ClipboardIcon,
  CheckIcon,
  XMarkIcon,
  ClockIcon,
  UsersIcon,
  TrashIcon,
  EllipsisVerticalIcon,
  EyeIcon,
  DocumentDuplicateIcon,
  PencilIcon,
  ArrowPathIcon,
  ArrowUturnLeftIcon,
  LinkIcon,
} from '@heroicons/react/24/outline';

// Invitation display type
interface InvitationDisplay {
  id: string;
  name?: string;
  code: string;
  groupId?: string;
  groupName?: string;
  groupColor?: string;
  maxUses?: number;
  uses: number;
  expiresAt?: string;
  syncOnJoin: boolean;
  membershipDuration?: number;
  createdAt: string;
  isActive?: boolean;
}

// Request display type
interface RequestDisplay {
  id: string;
  invitationId: string;
  email?: string;
  username?: string;
  status: 'pending' | 'accepted' | 'rejected' | 'joined' | 'expired' | 'renewed' | 'removed';
  createdAt: string;
  respondedAt?: string;
  oauthCode?: string;
  oauthLink?: string;
  oauthExpiresAt?: string;
  userId?: string;
}

export default function InvitationsPage() {
  const [activeTab, setActiveTab] = useState<'invitations' | 'requests'>('invitations');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Data state
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Multi-select state - NO isSelectMode, just selectedIds
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Single item delete state (for quick action menu)
  const [deleteTarget, setDeleteTarget] = useState<InvitationDisplay | null>(null);

  // Edit state
  const [editTarget, setEditTarget] = useState<InvitationDisplay | null>(null);

  // Duplicate state
  const [duplicateTarget, setDuplicateTarget] = useState<InvitationDisplay | null>(null);

  // Fetch invitations, groups, and requests
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [invitationsData, groupsData] = await Promise.all([
          api.getInvitations(),
          api.getGroups(),
        ]);
        setInvitations(invitationsData);
        setGroups(groupsData);

        // Extract requests from invitations (they may be embedded)
        const allRequests: any[] = [];
        for (const inv of invitationsData) {
          if (inv.requests && Array.isArray(inv.requests)) {
            allRequests.push(...inv.requests.map((req: any) => ({
              ...req,
              invitationId: inv.id,
            })));
          } else {
            // Try to fetch requests if not embedded
            try {
              const invRequests = await api.getInvitationRequests(inv.id);
              if (Array.isArray(invRequests)) {
                allRequests.push(...invRequests.map((req: any) => ({
                  ...req,
                  invitationId: inv.id,
                })));
              }
            } catch {
              // Skip if requests can't be fetched for this invitation
            }
          }
        }
        setRequests(allRequests);
      } catch (err) {
        setError(err as Error);
        toast.error('Failed to load invitations');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  // Transform invitations for display
  const invitationsDisplay = useMemo<InvitationDisplay[]>(() => {
    // Map groups by name so we can recover color/id from invitation.groupName
    const groupByName = new Map(groups.map(g => [g.name, g]));

    // Group requests by invitation ID
    const requestsByInvitation = new Map<string, any[]>();
    for (const req of requests) {
      const invId = String(req.invitationId || req.invitation?.id || '');
      if (invId) {
        if (!requestsByInvitation.has(invId)) {
          requestsByInvitation.set(invId, []);
        }
        requestsByInvitation.get(invId)!.push(req);
      }
    }

    return (invitations || []).map((inv: any) => {
      const code = inv.code || inv.inviteCode || '';
      const rawGroupName = inv.groupName || '';
      const group = rawGroupName ? groupByName.get(rawGroupName) : undefined;

      const maxUses: number | undefined =
        typeof inv.maxUses === 'number' ? inv.maxUses : undefined;

      // Calculate base uses from backend
      const baseUses: number =
        typeof inv.uses === 'number'
          ? inv.uses
          : typeof inv.currentUses === 'number'
            ? inv.currentUses
            : 0;

      // Add accepted requests count (since they occupy a slot but might not be fully joined yet)
      const invitationRequests = requestsByInvitation.get(String(inv.id)) || [];
      const acceptedRequests = invitationRequests.filter((r: any) => r.status === 'accepted').length;
      const uses = baseUses + acceptedRequests;

      const membershipDuration: number | undefined =
        typeof inv.membershipDuration === 'number'
          ? inv.membershipDuration
          : typeof inv.membershipDurationDays === 'number'
            ? inv.membershipDurationDays
            : undefined;

      return {
        id: String(inv.id),
        name: inv.name || code,
        code,
        groupId: group?.id,
        groupName: rawGroupName || group?.name,
        groupColor: group?.color,
        maxUses,
        uses,
        expiresAt: inv.expiresAt || undefined,
        syncOnJoin: inv.syncOnJoin === true,
        membershipDuration,
        createdAt: inv.createdAt || new Date().toISOString(),
        isActive: inv.isActive !== false,
      };
    });
  }, [invitations, groups, requests]);

  // Transform requests for display
  const requestsDisplay = useMemo<RequestDisplay[]>(() => {
    return (requests || []).map((req: any) => ({
      id: req.id,
      invitationId: req.invitationId || req.invitation?.id || '',
      email: req.email,
      username: req.username,
      status: req.status || 'pending',
      createdAt: req.createdAt || req.requestedAt || new Date().toISOString(),
    }));
  }, [requests]);

  const pendingRequests = requestsDisplay.filter(r => r.status === 'pending');

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(invitationsDisplay.map(i => i.id)));
  }, [invitationsDisplay]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleDeleteSelected = useCallback(async () => {
    setIsDeleting(true);
    const ids = Array.from(selectedIds);
    let success = 0;

    for (const id of ids) {
      try {
        await api.deleteInvitation(id);
        success++;
      } catch (err) {
        console.error('Failed to delete invitation:', err);
      }
    }

    setIsDeleting(false);
    setIsDeleteModalOpen(false);
    if (success > 0) {
      toast.success(`Deleted ${success} invitation${success !== 1 ? 's' : ''} successfully`);
      // Refresh invitations
      try {
        const invitationsData = await api.getInvitations();
        setInvitations(invitationsData);
      } catch (err) {
        console.error('Failed to refresh invitations:', err);
      }
    }
    setSelectedIds(new Set());
  }, [selectedIds]);

  // Delete single invitation (from quick action menu)
  const handleDeleteSingle = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await api.deleteInvitation(deleteTarget.id);
      toast.success(`Invitation ${deleteTarget.code} deleted successfully`);
      // Refresh invitations
      try {
        const invitationsData = await api.getInvitations();
        setInvitations(invitationsData);
      } catch (err) {
        console.error('Failed to refresh invitations:', err);
      }
    } catch (err) {
      toast.error(`Failed to delete invitation ${deleteTarget.code}`);
      console.error('Failed to delete invitation:', err);
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget]);

  // Reset selection when switching tabs
  const handleTabChange = (tab: 'invitations' | 'requests') => {
    setActiveTab(tab);
    setSelectedIds(new Set());
  };

  const hasSelection = selectedIds.size > 0;

  return (
    <>
      <Header
        title="Invitations"
        subtitle={isLoading ? 'Loading...' : `${invitations.length} active invite${invitations.length !== 1 ? 's' : ''} • ${pendingRequests.length} pending request${pendingRequests.length !== 1 ? 's' : ''}`}
        actions={
          <Button
            variant="primary"
            leftIcon={<PlusIcon className="w-5 h-5" />}
            onClick={() => setIsCreateModalOpen(true)}
          >
            Create Invite
          </Button>
        }
      />

      <div className="p-8">
        {/* Filters */}
        <PageToolbar
          selectionConfig={activeTab === 'invitations' ? {
            totalCount: invitationsDisplay.length,
            selectedCount: selectedIds.size,
            onSelectAll: selectAll,
            onDeselectAll: deselectAll,
          } : undefined}
          filterTabs={{
            options: [
              { key: 'invitations', label: 'Invitations' },
              {
                key: 'requests',
                label: 'Requests',
                badge: pendingRequests.length > 0 ? { value: pendingRequests.length, variant: 'error' as const } : undefined
              },
            ],
            activeKey: activeTab,
            onChange: (key) => handleTabChange(key as 'invitations' | 'requests'),
            layoutId: 'invitations-filter-tabs',
          }}
          viewModeConfig={activeTab === 'invitations' ? {
            mode: viewMode,
            onChange: setViewMode,
            showLabels: false,
          } : undefined}
        />

        <AnimatePresence mode="wait">
          {activeTab === 'invitations' ? (
            <motion.div
              key="invitations"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              {isLoading ? (
                <div className="text-center py-16">
                  <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 bg-surface-hover">
                    <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin text-primary" />
                  </div>
                  <p className="text-muted">Loading invitations...</p>
                </div>
              ) : error ? (
                <div className="text-center py-16">
                  <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 bg-surface-hover">
                    <XMarkIcon className="w-8 h-8 text-error" />
                  </div>
                  <h3 className="text-lg font-medium mb-2 text-default">Error Loading Invitations</h3>
                  <p className="text-muted mb-4">{error.message}</p>
                  <Button variant="primary" onClick={() => window.location.reload()}>
                    Retry
                  </Button>
                </div>
              ) : (
                <LayoutGroup>
                  <AnimatePresence mode="popLayout">
                    {viewMode === 'grid' ? (
                      <StaggerContainer key="grid" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        <AnimatePresence mode="popLayout">
                          {invitationsDisplay.map((invite) => (
                            <StaggerItem key={invite.id}>
                              <InvitationCard
                                invitation={invite}
                                isSelected={selectedIds.has(invite.id)}
                                onToggleSelect={() => toggleSelect(invite.id)}
                                onDelete={() => setDeleteTarget(invite)}
                                onEdit={() => setEditTarget(invite)}
                                onDuplicate={() => setDuplicateTarget(invite)}
                              />
                            </StaggerItem>
                          ))}
                        </AnimatePresence>
                      </StaggerContainer>
                    ) : (
                      <motion.div
                        key="list"
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="rounded-2xl overflow-hidden bg-surface border border-default overflow-x-auto"
                      >
                        <table className="w-full min-w-[500px]">
                          <thead>
                            <tr className="border-b border-default">
                              <th className="px-4 py-4 text-left w-12">
                                <div
                                  className={`w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer transition-all ${hasSelection && selectedIds.size === invitationsDisplay.length
                                    ? 'bg-primary border-primary'
                                    : 'border-default hover:border-primary'
                                    }`}
                                  onClick={() => hasSelection && selectedIds.size === invitationsDisplay.length ? deselectAll() : selectAll()}
                                >
                                  {hasSelection && selectedIds.size === invitationsDisplay.length && (
                                    <CheckIcon className="w-3 h-3 text-white" />
                                  )}
                                </div>
                              </th>
                              <th className="px-6 py-4 text-left text-sm font-medium text-muted">Invitation</th>
                              <th className="px-6 py-4 text-left text-sm font-medium text-muted">Group</th>
                              <th className="px-6 py-4 text-left text-sm font-medium text-muted">Uses</th>
                              <th className="px-6 py-4 text-left text-sm font-medium text-muted">Expires</th>
                              <th className="px-6 py-4 text-left text-sm font-medium text-muted">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            <AnimatePresence mode="popLayout">
                              {invitationsDisplay.map((invite) => (
                                <motion.tr
                                  key={invite.id}
                                  layout
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  className={`transition-colors border-b border-default cursor-pointer ${selectedIds.has(invite.id) ? 'bg-primary-muted' : 'hover:bg-white/5'
                                    }`}
                                  onClick={() => toggleSelect(invite.id)}
                                >
                                  <td className="px-4 py-4">
                                    <div
                                      className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${selectedIds.has(invite.id)
                                        ? 'bg-primary border-primary'
                                        : 'border-default'
                                        }`}
                                    >
                                      {selectedIds.has(invite.id) && (
                                        <CheckIcon className="w-3 h-3 text-white" />
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4">
                                    <div>
                                      <p className="font-medium text-default">{invite.name || invite.code}</p>
                                      <p className="text-sm text-muted font-mono">{invite.code}</p>
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 text-muted">
                                    {invite.groupName || 'No group'}
                                  </td>
                                  <td className="px-6 py-4 text-muted">
                                    {invite.uses}/{invite.maxUses || '∞'}
                                  </td>
                                  <td className="px-6 py-4 text-muted">
                                    {invite.expiresAt
                                      ? new Date(invite.expiresAt).toLocaleDateString()
                                      : 'Never'}
                                  </td>
                                  <td className="px-6 py-4">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const origin = typeof window !== 'undefined' ? window.location.origin : '';
                                        navigator.clipboard.writeText(`${origin}/invite/${invite.code}`);
                                        toast.success('Invite link copied');
                                      }}
                                    >
                                      <ClipboardIcon className="w-4 h-4" />
                                    </Button>
                                  </td>
                                </motion.tr>
                              ))}
                            </AnimatePresence>
                          </tbody>
                        </table>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </LayoutGroup>
              )}

              {!isLoading && !error && invitationsDisplay.length === 0 && (
                <div className="text-center py-16">
                  <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 bg-surface-hover">
                    <EnvelopeIcon className="w-8 h-8 text-subtle" />
                  </div>
                  <h3 className="text-lg font-medium mb-2 text-default">No invitations</h3>
                  <p className="mb-6 text-muted">
                    Create an invitation to start inviting users
                  </p>
                  <Button variant="primary" onClick={() => setIsCreateModalOpen(true)}>
                    Create Invite
                  </Button>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="requests"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              {/* Request Status Summary */}
              {!isLoading && requestsDisplay.length > 0 && (
                <div className="mb-6">
                  <Card padding="md">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium text-default">Request Summary</h3>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-warning" />
                          <span className="text-sm text-muted">
                            {requestsDisplay.filter(r => r.status === 'pending').length} pending
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-success" />
                          <span className="text-sm text-muted">
                            {requestsDisplay.filter(r => r.status === 'accepted' || r.status === 'joined').length} accepted
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-error" />
                          <span className="text-sm text-muted">
                            {requestsDisplay.filter(r => r.status === 'rejected').length} rejected
                          </span>
                        </div>
                      </div>
                    </div>
                  </Card>
                </div>
              )}

              {isLoading ? (
                <div className="text-center py-16">
                  <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 bg-surface-hover">
                    <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin text-primary" />
                  </div>
                  <p className="text-muted">Loading requests...</p>
                </div>
              ) : (
                <StaggerContainer className="space-y-4">
                  {requestsDisplay.map((request) => (
                    <StaggerItem key={request.id}>
                      <RequestCard
                        request={request}
                        onUpdate={() => {
                          // Refresh invitations to get updated requests
                          api.getInvitations().then(setInvitations).catch(console.error);
                        }}
                      />
                    </StaggerItem>
                  ))}
                </StaggerContainer>
              )}

              {!isLoading && requestsDisplay.length === 0 && (
                <div className="text-center py-16">
                  <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 bg-surface-hover">
                    <EnvelopeIcon className="w-8 h-8 text-subtle" />
                  </div>
                  <h3 className="text-lg font-medium mb-2 text-default">No pending requests</h3>
                  <p className="text-muted">
                    Invite requests will appear here when users try to join
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Floating Action Bar */}
      <AnimatePresence>
        {hasSelection && (
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50"
          >
            <div className="flex items-center gap-4 px-6 py-4 rounded-2xl shadow-2xl bg-surface border border-default backdrop-blur-xl">
              <div className="flex items-center gap-2 pr-4 border-r border-default">
                <div className="w-8 h-8 rounded-lg bg-primary-muted flex items-center justify-center">
                  <span className="text-sm font-bold text-primary">{selectedIds.size}</span>
                </div>
                <span className="text-sm text-muted">selected</span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  leftIcon={<TrashIcon className="w-4 h-4" />}
                  onClick={() => setIsDeleteModalOpen(true)}
                >
                  Delete
                </Button>
              </div>

              <button
                onClick={deselectAll}
                className="p-2 rounded-lg text-muted hover:bg-surface-hover transition-colors"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Invitation Modal */}
      <CreateInvitationModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        groups={groups}
      />

      {/* Delete Confirmation Modal (bulk) */}
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteSelected}
        title="Delete Invitations"
        description={`Are you sure you want to delete ${selectedIds.size} invitation${selectedIds.size !== 1 ? 's' : ''}? This will invalidate the invite codes.`}
        confirmText={isDeleting ? 'Deleting...' : 'Delete Invitations'}
        variant="danger"
      />

      {/* Delete Confirmation Modal (single) */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteSingle}
        title="Delete Invitation"
        description={`Are you sure you want to delete invitation "${deleteTarget?.code}"? This will invalidate the invite code.`}
        confirmText={isDeleting ? 'Deleting...' : 'Delete Invitation'}
        variant="danger"
      />

      {/* Edit Invitation Modal */}
      <Modal
        isOpen={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="Edit Invitation"
        description={`Update settings for invitation ${editTarget?.code}`}
        size="md"
      >
        {editTarget && (
          <EditInvitationForm
            invitation={editTarget}
            groups={groups}
            onClose={() => setEditTarget(null)}
          />
        )}
      </Modal>

      {/* Duplicate Invitation Modal */}
      <Modal
        isOpen={!!duplicateTarget}
        onClose={() => setDuplicateTarget(null)}
        title="Duplicate Invitation"
        description={`Create a new invitation based on ${duplicateTarget?.code}`}
        size="md"
      >
        {duplicateTarget && (
          <DuplicateInvitationForm
            invitation={duplicateTarget}
            groups={groups}
            onClose={() => setDuplicateTarget(null)}
          />
        )}
      </Modal>

    </>
  );
}

// Invitation Card - with click-to-toggle selection
function InvitationCard({
  invitation,
  isSelected,
  onToggleSelect,
  onDelete,
  onEdit,
  onDuplicate,
}: {
  invitation: InvitationDisplay;
  isSelected: boolean;
  onToggleSelect: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
}) {
  const router = useRouter();
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const { isOpen, position, handleContextMenu, close } = useContextMenu();

  // Add touch handling for mobile context menu
  const touchTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchTimerRef.current = setTimeout(() => {
      // Create a synthetic mouse event-like object for handleContextMenu
      const syntheticEvent = {
        preventDefault: () => { },
        clientX: touch.clientX,
        clientY: touch.clientY,
      } as unknown as React.MouseEvent;

      handleContextMenu(syntheticEvent);
    }, 500); // 500ms long press
  };

  const handleTouchEnd = () => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    close();
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    navigator.clipboard.writeText(`${origin}/invite/${invitation.code}`);
    setCopiedLink(true);
    toast.success('Invite link copied to clipboard');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyCode = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(invitation.code);
    setCopiedCode(true);
    toast.success('Invitation code copied to clipboard');
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleClick = (e: React.MouseEvent) => {
    // If clicking a button or menu, don't toggle selection
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }
    onToggleSelect();
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/invitations/${invitation.id}`);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    close();
    onEdit();
  };

  const handleDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation();
    close();
    onDuplicate();
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    close();
    onDelete();
  };

  const handleViewDetail = (e: React.MouseEvent) => {
    e.stopPropagation();
    close();
    router.push(`/invitations/${invitation.id}`);
  };

  const usagePercentage = invitation.maxUses
    ? (invitation.uses / invitation.maxUses) * 100
    : 0;

  const isExpiringSoon = invitation.expiresAt
    ? new Date(invitation.expiresAt).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000
    : false;

  return (
    <>
      <Card
        padding="none"
        className={`relative cursor-pointer transition-all group ${isSelected ? 'ring-2 ring-primary' : ''}`}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >
        <div
          onContextMenu={handleContextMenu}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="h-full w-full"
        >
          {/* Selection indicator */}
          <div className="absolute top-4 right-4 z-10">
            <SelectionCheckbox
              checked={isSelected}
              onChange={onToggleSelect}
              visible={isSelected}
            />
          </div>

          {/* Header + usage (addon-card style) */}
          <div className="relative p-6 pb-4 border-b border-default overflow-hidden">
            {/* Subtle color accent */}
            <div
              className="absolute inset-0 opacity-10"
              style={{ background: `linear-gradient(135deg, ${invitation.groupColor || '#4b5563'}40 0%, transparent 60%)` }}
            />
            <div className="relative flex items-start gap-4">
              {/* Envelope icon */}
              <div className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 bg-primary-muted text-primary">
                <EnvelopeIcon className="w-7 h-7" />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0 pr-8">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="text-lg font-semibold truncate text-default">
                    {invitation.name || invitation.code}
                  </h3>
                  {/* Invitation status badges */}
                  {(() => {
                    const isExpired = invitation.expiresAt && new Date(invitation.expiresAt) < new Date();
                    const isFull = invitation.maxUses && invitation.uses >= invitation.maxUses;

                    if (isExpired) {
                      return <Badge variant="error" size="sm">Expired</Badge>;
                    }
                    if (isFull) {
                      return <Badge variant="error" size="sm">Full</Badge>;
                    }
                    return null;
                  })()}
                </div>
                <p className="text-xs text-muted mb-2">
                  {invitation.groupName || 'No group'}
                </p>

                {/* Progress bar for uses - Industrial Precision Design */}
                {invitation.maxUses && (
                  <div className="mt-4 group">
                    {/* Status indicator */}
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] uppercase tracking-widest font-semibold text-muted">Usage</span>
                      <span
                        className="text-[10px] font-bold tabular-nums"
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

                    {/* Track with depth */}
                    <div className="relative h-6 rounded-lg overflow-hidden bg-surface-hover shadow-inner">
                      {/* Inner shadow overlay */}
                      <div className="absolute inset-0 rounded-lg shadow-[inset_0_1px_3px_rgba(0,0,0,0.3)] pointer-events-none z-10" />

                      {/* Background track with remaining count */}
                      <div className="absolute inset-0 flex items-center justify-end pr-2">
                        <span className="text-[10px] font-bold text-default tabular-nums">
                          {(invitation.maxUses || 0) - (invitation.uses || 0)}
                        </span>
                      </div>

                      {/* Filled bar with color-coded gradient */}
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
                        {/* Uses count in center of used portion (only show if > 0) */}
                        {(invitation.uses || 0) > 0 && (
                          <span className="text-[10px] font-bold text-white tabular-nums drop-shadow-md">
                            {invitation.uses || 0}
                          </span>
                        )}

                        {/* Shimmer effect - sliding gradient overlay */}
                        <div className="absolute inset-0 overflow-hidden rounded-lg">
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent w-full h-full animate-shimmer" />
                        </div>

                        {/* Glow on hover */}
                        <div
                          className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                          style={{
                            boxShadow: usagePercentage >= 80
                              ? '0 0 20px rgba(239,68,68,0.4)'
                              : '0 0 20px var(--color-primary-muted)'
                          }}
                        />
                      </motion.div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer with summary stats and copyable code */}
          <div className="px-6 py-4 flex items-center justify-between border-t border-default">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              {invitation.syncOnJoin && <span>Auto-sync</span>}
              <span>•</span>
              <span>
                {invitation.expiresAt
                  ? `Expires ${new Date(invitation.expiresAt).toLocaleDateString()}`
                  : 'Never expires'}
              </span>
              <span>•</span>
              <span>
                {invitation.membershipDuration
                  ? `${invitation.membershipDuration} days`
                  : 'Permanent'}
              </span>
            </div>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleCopyCode}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono tracking-wide bg-surface-hover text-primary border border-default"
              aria-label={copiedCode ? 'Code copied to clipboard' : 'Copy invitation code'}
            >
              <span>{invitation.code}</span>
              {copiedCode ? (
                <CheckIcon className="w-4 h-4" />
              ) : (
                <ClipboardIcon className="w-4 h-4" />
              )}
            </motion.button>
          </div>
        </div>
      </Card>

      <ContextMenu isOpen={isOpen} position={position} onClose={close}>
        <button
          onClick={handleViewDetail}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-default hover:bg-surface-hover transition-colors"
        >
          <EyeIcon className="w-4 h-4" />
          View Details
        </button>
        <button
          onClick={handleEdit}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-default hover:bg-surface-hover transition-colors"
        >
          <PencilIcon className="w-4 h-4" />
          Edit
        </button>
        <button
          onClick={handleDuplicate}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-default hover:bg-surface-hover transition-colors"
        >
          <DocumentDuplicateIcon className="w-4 h-4" />
          Duplicate
        </button>
        <button
          onClick={handleCopy}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-default hover:bg-surface-hover transition-colors"
        >
          <ClipboardIcon className="w-4 h-4" />
          Copy Link
        </button>
        <div className="my-1 border-t border-default" />
        <button
          onClick={handleDelete}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-error hover:bg-error-muted transition-colors"
        >
          <TrashIcon className="w-4 h-4" />
          Delete
        </button>
      </ContextMenu>
    </>
  );
}

// OAuth Countdown Timer Component
function OAuthCountdown({ expiresAt }: { expiresAt: string }) {
  const [timeLeft, setTimeLeft] = useState('');
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date().getTime();
      const expiry = new Date(expiresAt).getTime();
      const diff = expiry - now;

      if (diff <= 0) {
        setIsExpired(true);
        setTimeLeft('Expired');
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return (
    <span className={`font-mono text-sm ${isExpired ? 'text-error' : 'text-muted'}`}>
      {timeLeft}
    </span>
  );
}

// Request Card with enhanced features
function RequestCard({ request, onUpdate }: { request: RequestDisplay; onUpdate?: () => void }) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const handleAction = async (action: 'accept' | 'reject') => {
    setIsProcessing(true);
    try {
      if (action === 'accept') {
        await api.acceptInviteRequest(request.id);
        toast.success(`${request.username || request.email} accepted`);
      } else {
        await api.rejectInviteRequest(request.id);
        toast.success(`${request.username || request.email} rejected`);
      }
      // Refresh data
      if (onUpdate) {
        onUpdate();
      }
    } catch (err: any) {
      toast.error(err.message || `Failed to ${action} request`);
      console.error(`Failed to ${action} request:`, err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUndoReject = async () => {
    setIsProcessing(true);
    try {
      // Re-accept a rejected request (undo rejection)
      await api.acceptInviteRequest(request.id);
      toast.success(`${request.username || request.email} rejection undone`);
      if (onUpdate) {
        onUpdate();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to undo rejection');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRefreshOAuth = async () => {
    setIsRefreshing(true);
    try {
      const result = await api.refreshInvitationOAuth(request.id);
      toast.success('OAuth link refreshed');
      if (onUpdate) {
        onUpdate();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to refresh OAuth');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCopyCode = () => {
    if (request.oauthCode) {
      navigator.clipboard.writeText(request.oauthCode);
      setCopiedCode(true);
      toast.success('OAuth code copied');
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleCopyLink = () => {
    if (request.oauthLink) {
      navigator.clipboard.writeText(request.oauthLink);
      setCopiedLink(true);
      toast.success('OAuth link copied');
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const isPending = request.status === 'pending';
  const isRejected = request.status === 'rejected';
  const isAccepted = request.status === 'accepted';
  const hasOAuth = request.oauthCode && request.oauthExpiresAt;

  // Status badge variant
  const getStatusVariant = () => {
    switch (request.status) {
      case 'pending': return 'warning';
      case 'accepted': return 'success';
      case 'joined': return 'primary';
      case 'rejected': return 'error';
      case 'expired': return 'muted';
      case 'renewed': return 'secondary';
      case 'removed': return 'error';
      default: return 'muted';
    }
  };

  return (
    <Card padding="md" className={isRejected ? 'opacity-60' : ''}>
      <div className="flex items-center gap-4">
        <UserAvatar userId={request.userId || ''} name={request.username || 'Unknown'} email={request.email} size="lg" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-default">{request.username || 'Unknown'}</h3>
            <Badge variant={getStatusVariant()} size="sm">
              {request.status}
            </Badge>
          </div>
          <p className="text-sm text-muted">{request.email}</p>
          <p className="text-xs mt-1 text-subtle">
            Requested {new Date(request.createdAt).toLocaleDateString()} at{' '}
            {new Date(request.createdAt).toLocaleTimeString()}
          </p>
          {request.respondedAt && (
            <p className="text-xs text-subtle">
              Responded: {new Date(request.respondedAt).toLocaleString()}
            </p>
          )}
        </div>

        {/* OAuth section for accepted requests */}
        {isAccepted && hasOAuth && (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-hover">
            <div className="text-center">
              <p className="text-xs text-muted mb-1">OAuth Code</p>
              <div className="flex items-center gap-2">
                <code className="font-mono text-sm text-primary">{request.oauthCode}</code>
                <button
                  onClick={handleCopyCode}
                  className="p-1 rounded hover:bg-surface-hover"
                  title="Copy code"
                >
                  {copiedCode ? <CheckIcon className="w-4 h-4 text-success" /> : <ClipboardIcon className="w-4 h-4 text-muted" />}
                </button>
              </div>
            </div>
            <div className="text-center border-l border-default pl-3">
              <p className="text-xs text-muted mb-1">Expires</p>
              <OAuthCountdown expiresAt={request.oauthExpiresAt!} />
            </div>
            <div className="flex flex-col gap-1">
              <button
                onClick={handleCopyLink}
                className="p-1.5 rounded-lg bg-surface-hover hover:bg-primary-muted text-muted hover:text-primary transition-colors"
                title="Copy OAuth link"
              >
                {copiedLink ? <CheckIcon className="w-4 h-4" /> : <LinkIcon className="w-4 h-4" />}
              </button>
              <button
                onClick={handleRefreshOAuth}
                disabled={isRefreshing}
                className="p-1.5 rounded-lg bg-surface-hover hover:bg-secondary-muted text-muted hover:text-secondary transition-colors disabled:opacity-50"
                title="Refresh OAuth link"
              >
                <ArrowPathIcon className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        )}

        {/* Actions for pending requests */}
        {isPending && (
          <div className="flex items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleAction('accept')}
              disabled={isProcessing}
              className="p-3 rounded-xl transition-colors disabled:opacity-50 bg-success-muted text-success"
              aria-label={`Accept request from ${request.username}`}
            >
              <CheckIcon className="w-5 h-5" />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleAction('reject')}
              disabled={isProcessing}
              className="p-3 rounded-xl transition-colors disabled:opacity-50 bg-error-muted text-error"
              aria-label={`Reject request from ${request.username}`}
            >
              <XMarkIcon className="w-5 h-5" />
            </motion.button>
          </div>
        )}

        {/* Undo button for rejected requests */}
        {isRejected && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleUndoReject}
            disabled={isProcessing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl transition-colors disabled:opacity-50 bg-surface-hover text-muted hover:text-default"
          >
            <ArrowUturnLeftIcon className="w-4 h-4" />
            Undo
          </motion.button>
        )}
      </div>
    </Card>
  );
}

// Quick expiration presets
const expirationPresets = [
  { label: '5m', minutes: 5 },
  { label: '30m', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '12h', minutes: 720 },
  { label: '1d', minutes: 1440 },
  { label: '1w', minutes: 10080 },
  { label: '2w', minutes: 20160 },
  { label: '30d', minutes: 43200 },
];

// Membership duration presets
const membershipPresets = [
  { label: '1 day', days: 1 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '1 year', days: 365 },
  { label: 'Lifetime', days: 0 },
];

// Create Invitation Modal - Premium styled
function CreateInvitationModal({
  isOpen,
  onClose,
  groups,
}: {
  isOpen: boolean;
  onClose: () => void;
  groups: Group[];
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    groupId: '',
    maxUses: '',
    expiresAt: '',
    membershipDuration: '',
    syncOnJoin: true,
  });
  const [useCustomExpiration, setUseCustomExpiration] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setFormData({
          name: '',
          groupId: '',
          maxUses: '',
          expiresAt: '',
          membershipDuration: '',
          syncOnJoin: true,
        });
        setUseCustomExpiration(false);
        setSelectedPreset(null);
        setShowSuccess(false);
      }, 300);
    }
  }, [isOpen]);

  const handlePresetClick = (minutes: number) => {
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + minutes);
    setFormData({ ...formData, expiresAt: expiresAt.toISOString() });
    setSelectedPreset(minutes);
    setUseCustomExpiration(false);
  };

  const handleMembershipPresetClick = (days: number) => {
    setFormData({ ...formData, membershipDuration: days === 0 ? '' : days.toString() });
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      const selectedGroup = groups.find(g => g.id === formData.groupId);
      const created = await api.createInvitation({
        name: formData.name || undefined,
        groupId: formData.groupId || undefined,
        groupName: selectedGroup?.name || undefined,
        maxUses: formData.maxUses ? parseInt(formData.maxUses) : undefined,
        expiresAt: formData.expiresAt || undefined,
        membershipDuration: formData.membershipDuration ? parseInt(formData.membershipDuration) : undefined,
        syncOnJoin: formData.syncOnJoin,
      });
      setShowSuccess(true);
      setTimeout(() => {
        onClose();
        // No dedicated invitation detail page yet; keep user on list for now.
        window.location.reload();
      }, 800);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create invitation');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <Dialog open={isOpen} onClose={onClose} className="relative z-50">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0"
            style={{
              background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.85) 100%)',
              backdropFilter: 'blur(8px)'
            }}
          />

          <div className="fixed inset-0 flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            >
              <DialogPanel
                className="w-full max-w-lg overflow-hidden my-8"
                style={{
                  background: 'var(--color-surface)',
                  borderRadius: '24px',
                  border: '1px solid var(--color-surfaceBorder)',
                  boxShadow: '0 0 0 1px rgba(255,255,255,0.05), 0 40px 80px -20px rgba(0,0,0,0.5)'
                }}
              >
                <div
                  className="h-1.5 w-full"
                  style={{
                    background: 'linear-gradient(90deg, var(--color-primary) 0%, color-mix(in srgb, var(--color-primary) 60%, var(--color-secondary)) 50%, var(--color-secondary) 100%)'
                  }}
                />

                <div className="p-8">
                  <AnimatePresence mode="wait">
                    {!showSuccess ? (
                      <motion.div
                        key="form"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                      >
                        {/* Header */}
                        <div className="text-center mb-8">
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: 'spring', delay: 0.1 }}
                            className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
                            style={{
                              background: 'linear-gradient(135deg, var(--color-primary) 0%, color-mix(in srgb, var(--color-primary) 70%, var(--color-secondary)) 100%)',
                              boxShadow: '0 8px 32px -8px var(--color-primary)'
                            }}
                          >
                            <EnvelopeIcon className="w-8 h-8 text-white" />
                          </motion.div>
                          <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-text)' }}>
                            Create Invitation
                          </h2>
                          <p className="text-sm" style={{ color: 'var(--color-textMuted)' }}>
                            Generate an invite code for new users
                          </p>
                        </div>

                        {/* Form */}
                        <div className="space-y-5">
                          <div>
                            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-textMuted)' }}>
                              Invitation Name
                            </label>
                            <input
                              type="text"
                              placeholder="e.g., Friends & Family"
                              value={formData.name}
                              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                              className="w-full px-4 py-3.5 rounded-xl transition-all duration-200 focus:outline-none"
                              style={{
                                background: 'var(--color-subtle)',
                                border: '1px solid var(--color-surfaceBorder)',
                                color: 'var(--color-text)'
                              }}
                            />
                            <p className="mt-1.5 text-xs" style={{ color: 'var(--color-textSubtle)' }}>
                              Optional. If empty, the invite code will be used.
                            </p>
                          </div>

                          <div>
                            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-textMuted)' }}>
                              Assign to Group
                            </label>
                            <select
                              value={formData.groupId}
                              onChange={(e) => setFormData({ ...formData, groupId: e.target.value })}
                              className="w-full px-4 py-3.5 rounded-xl transition-all duration-200 focus:outline-none appearance-none"
                              style={{
                                background: 'var(--color-subtle)',
                                border: '1px solid var(--color-surfaceBorder)',
                                color: 'var(--color-text)'
                              }}
                            >
                              <option value="">No group (assign later)</option>
                              {groups.map(g => (
                                <option key={g.id} value={g.id}>{g.name}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-textMuted)' }}>
                              Max Uses
                            </label>
                            <input
                              type="number"
                              placeholder="Unlimited"
                              value={formData.maxUses}
                              onChange={(e) => setFormData({ ...formData, maxUses: e.target.value })}
                              className="w-full px-4 py-3.5 rounded-xl transition-all duration-200 focus:outline-none"
                              style={{
                                background: 'var(--color-subtle)',
                                border: '1px solid var(--color-surfaceBorder)',
                                color: 'var(--color-text)'
                              }}
                            />
                          </div>

                          {/* Expiration presets */}
                          <div>
                            <label className="block text-sm font-medium mb-3" style={{ color: 'var(--color-textMuted)' }}>Expiration</label>
                            <div className="flex flex-wrap gap-2 mb-3">
                              {expirationPresets.map((preset) => (
                                <motion.button
                                  key={preset.label}
                                  type="button"
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.95 }}
                                  onClick={() => handlePresetClick(preset.minutes)}
                                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                                  style={{
                                    background: selectedPreset === preset.minutes && !useCustomExpiration
                                      ? 'var(--color-primary)'
                                      : 'var(--color-subtle)',
                                    color: selectedPreset === preset.minutes && !useCustomExpiration
                                      ? 'white'
                                      : 'var(--color-textMuted)'
                                  }}
                                >
                                  {preset.label}
                                </motion.button>
                              ))}
                              <motion.button
                                type="button"
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => {
                                  setFormData({ ...formData, expiresAt: '' });
                                  setSelectedPreset(null);
                                  setUseCustomExpiration(false);
                                }}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                                style={{
                                  background: !formData.expiresAt && !useCustomExpiration
                                    ? 'var(--color-secondary)'
                                    : 'var(--color-subtle)',
                                  color: !formData.expiresAt && !useCustomExpiration
                                    ? 'white'
                                    : 'var(--color-textMuted)'
                                }}
                              >
                                Never
                              </motion.button>
                            </div>
                            {formData.expiresAt && (
                              <p className="text-xs" style={{ color: 'var(--color-textMuted)' }}>
                                Expires: {new Date(formData.expiresAt).toLocaleString()}
                              </p>
                            )}
                          </div>

                          {/* Membership Duration */}
                          <div>
                            <label className="block text-sm font-medium mb-3" style={{ color: 'var(--color-textMuted)' }}>Membership Duration</label>
                            <div className="flex flex-wrap gap-2">
                              {membershipPresets.map((preset) => (
                                <motion.button
                                  key={preset.label}
                                  type="button"
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.95 }}
                                  onClick={() => handleMembershipPresetClick(preset.days)}
                                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                                  style={{
                                    background: (preset.days === 0 && !formData.membershipDuration) || formData.membershipDuration === preset.days.toString()
                                      ? 'var(--color-primary)'
                                      : 'var(--color-subtle)',
                                    color: (preset.days === 0 && !formData.membershipDuration) || formData.membershipDuration === preset.days.toString()
                                      ? 'white'
                                      : 'var(--color-textMuted)'
                                  }}
                                >
                                  {preset.label}
                                </motion.button>
                              ))}
                            </div>
                          </div>

                          {/* Sync on Join */}
                          <motion.button
                            type="button"
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            onClick={() => formData.groupId && setFormData({ ...formData, syncOnJoin: !formData.syncOnJoin })}
                            className={`w-full flex items-center gap-3 p-4 rounded-xl transition-all cursor-pointer ${!formData.groupId ? 'opacity-50 cursor-not-allowed' : ''}`}
                            style={{
                              background: formData.syncOnJoin && formData.groupId ? 'color-mix(in srgb, var(--color-primary) 15%, transparent)' : 'var(--color-subtle)',
                              border: `1px solid ${formData.syncOnJoin && formData.groupId ? 'var(--color-primary)' : 'var(--color-surfaceBorder)'}`
                            }}
                            disabled={!formData.groupId}
                          >
                            <div
                              className="w-5 h-5 rounded-md flex items-center justify-center transition-all"
                              style={{
                                background: formData.syncOnJoin && formData.groupId ? 'var(--color-primary)' : 'transparent',
                                border: formData.syncOnJoin && formData.groupId ? 'none' : '2px solid var(--color-surfaceBorder)'
                              }}
                            >
                              {formData.syncOnJoin && formData.groupId && <CheckIcon className="w-3 h-3 text-white" />}
                            </div>
                            <div className="text-left">
                              <p className="font-medium" style={{ color: 'var(--color-text)' }}>Sync on Join</p>
                              <p className="text-xs" style={{ color: 'var(--color-textMuted)' }}>
                                {formData.groupId ? 'Automatically sync addons when user joins' : 'Select a group first'}
                              </p>
                            </div>
                          </motion.button>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3 mt-8">
                          <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3.5 text-sm font-medium rounded-xl transition-colors"
                            style={{
                              background: 'var(--color-subtle)',
                              color: 'var(--color-text)'
                            }}
                          >
                            Cancel
                          </button>
                          <Button
                            variant="primary"
                            className="flex-1"
                            onClick={handleSubmit}
                            isLoading={isLoading}
                          >
                            Generate Invite
                          </Button>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="success"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="text-center py-8"
                      >
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: 'spring', delay: 0.1, damping: 10 }}
                          className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center"
                          style={{
                            background: 'linear-gradient(135deg, var(--color-secondary) 0%, color-mix(in srgb, var(--color-secondary) 80%, var(--color-primary)) 100%)',
                            boxShadow: '0 12px 40px -8px var(--color-secondary)'
                          }}
                        >
                          <CheckIcon className="w-10 h-10 text-white" />
                        </motion.div>
                        <h3 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-text)' }}>
                          Invitation Created!
                        </h3>
                        <p className="text-sm" style={{ color: 'var(--color-textMuted)' }}>
                          {formData.name || 'New invite'} is ready to share
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </DialogPanel>
            </motion.div>
          </div>
        </Dialog>
      )}
    </AnimatePresence>
  );
}

// Edit Invitation Form
function EditInvitationForm({
  invitation,
  groups,
  onClose,
}: {
  invitation: InvitationDisplay;
  groups: Group[];
  onClose: () => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: invitation.name || '',
    groupId: invitation.groupId || '',
    maxUses: invitation.maxUses?.toString() || '',
    membershipDuration: invitation.membershipDuration?.toString() || '',
    syncOnJoin: invitation.syncOnJoin,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const selectedGroup = groups.find(g => g.id === formData.groupId);
      await api.updateInvitation(invitation.id, {
        name: formData.name || undefined,
        groupId: formData.groupId || undefined,
        groupName: selectedGroup?.name || undefined,
        maxUses: formData.maxUses ? parseInt(formData.maxUses) : undefined,
        membershipDuration: formData.membershipDuration ? parseInt(formData.membershipDuration) : undefined,
        syncOnJoin: formData.syncOnJoin,
      });
      toast.success('Invitation updated successfully');
      onClose();
      // Refresh page to show updated invitation
      window.location.reload();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update invitation');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="p-4 rounded-xl bg-subtle border border-default">
        <p className="text-sm text-muted mb-1">Invite Code</p>
        <code className="text-lg font-mono text-primary">{invitation.code}</code>
      </div>

      <Input
        label="Invitation Name"
        placeholder="e.g., Friends & Family"
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        hint="Optional. If empty, the invite code will be used as the name."
      />

      <Select
        label="Assign to Group"
        options={[
          { value: '', label: 'No group (assign later)' },
          ...groups.map(g => ({ value: g.id, label: g.name })),
        ]}
        value={formData.groupId}
        onChange={(value) => setFormData({ ...formData, groupId: value })}
      />

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Max Uses"
          type="number"
          placeholder="Unlimited"
          value={formData.maxUses}
          onChange={(e) => setFormData({ ...formData, maxUses: e.target.value })}
          hint="Leave empty for unlimited"
        />
        <div>
          <p className="text-sm font-medium mb-2 text-muted">Current Usage</p>
          <p className="text-default font-medium">{invitation.uses} uses</p>
        </div>
      </div>

      <Select
        label="Membership Duration"
        options={[
          { value: '', label: 'Permanent' },
          { value: '7', label: '7 days' },
          { value: '30', label: '30 days' },
          { value: '90', label: '90 days' },
          { value: '365', label: '1 year' },
        ]}
        value={formData.membershipDuration}
        onChange={(value) => setFormData({ ...formData, membershipDuration: value })}
      />

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={formData.syncOnJoin}
          onChange={(e) => setFormData({ ...formData, syncOnJoin: e.target.checked })}
          className="w-5 h-5 rounded bg-subtle border-default accent-primary"
        />
        <div>
          <p className="font-medium text-default">Sync on Join</p>
          <p className="text-sm text-muted">Automatically sync addons when user joins</p>
        </div>
      </label>

      <div className="flex gap-3 justify-end pt-4">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" isLoading={isLoading}>
          Save Changes
        </Button>
      </div>
    </form>
  );
}

// Duplicate Invitation Form
function DuplicateInvitationForm({
  invitation,
  groups,
  onClose,
}: {
  invitation: InvitationDisplay;
  groups: Group[];
  onClose: () => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: invitation.name ? `${invitation.name} (Copy)` : '',
    groupId: invitation.groupId || '',
    maxUses: invitation.maxUses?.toString() || '',
    expiresIn: '',
    membershipDuration: invitation.membershipDuration?.toString() || '',
    syncOnJoin: invitation.syncOnJoin,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Calculate expiresAt from expiresIn
      let expiresAt: Date | undefined;
      if (formData.expiresIn) {
        const days = parseInt(formData.expiresIn);
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + days);
      }

      const selectedGroup = groups.find(g => g.id === formData.groupId);
      await api.createInvitation({
        name: formData.name || undefined,
        groupId: formData.groupId || undefined,
        groupName: selectedGroup?.name || undefined,
        maxUses: formData.maxUses ? parseInt(formData.maxUses) : undefined,
        expiresAt: expiresAt?.toISOString(),
        membershipDuration: formData.membershipDuration ? parseInt(formData.membershipDuration) : undefined,
        syncOnJoin: formData.syncOnJoin,
      });
      toast.success('Invitation duplicated successfully');
      onClose();
      // Refresh page to show new invitation
      window.location.reload();
    } catch (err: any) {
      toast.error(err.message || 'Failed to duplicate invitation');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="p-4 rounded-xl bg-subtle border border-default">
        <p className="text-sm text-muted mb-1">Based on</p>
        <code className="text-lg font-mono text-primary">{invitation.code}</code>
        <p className="text-xs text-subtle mt-1">A new code will be generated</p>
      </div>

      <Select
        label="Assign to Group"
        options={[
          { value: '', label: 'No group (assign later)' },
          ...groups.map(g => ({ value: g.id, label: g.name })),
        ]}
        value={formData.groupId}
        onChange={(value) => setFormData({ ...formData, groupId: value })}
      />

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Max Uses"
          type="number"
          placeholder="Unlimited"
          value={formData.maxUses}
          onChange={(e) => setFormData({ ...formData, maxUses: e.target.value })}
          hint="Leave empty for unlimited"
        />
        <Select
          label="Expires In"
          options={[
            { value: '', label: 'Never' },
            { value: '7', label: '7 days' },
            { value: '14', label: '14 days' },
            { value: '30', label: '30 days' },
            { value: '90', label: '90 days' },
          ]}
          value={formData.expiresIn}
          onChange={(value) => setFormData({ ...formData, expiresIn: value })}
        />
      </div>

      <Select
        label="Membership Duration"
        options={[
          { value: '', label: 'Permanent' },
          { value: '7', label: '7 days' },
          { value: '30', label: '30 days' },
          { value: '90', label: '90 days' },
          { value: '365', label: '1 year' },
        ]}
        value={formData.membershipDuration}
        onChange={(value) => setFormData({ ...formData, membershipDuration: value })}
      />

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={formData.syncOnJoin}
          onChange={(e) => setFormData({ ...formData, syncOnJoin: e.target.checked })}
          className="w-5 h-5 rounded bg-subtle border-default accent-primary"
        />
        <div>
          <p className="font-medium text-default">Sync on Join</p>
          <p className="text-sm text-muted">Automatically sync addons when user joins</p>
        </div>
      </label>

      <div className="flex gap-3 justify-end pt-4">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" isLoading={isLoading}>
          Create Duplicate
        </Button>
      </div>
    </form>
  );
}
