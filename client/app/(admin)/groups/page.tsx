'use client';

import Head from 'next/head';
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Button, Card, Avatar, UserAvatar, AvatarGroup, Badge, SearchInput, Input, ConfirmModal, SyncBadge, ToggleSwitch, ContextMenu, useContextMenu, ViewModeToggle, SelectAllCheckbox, SelectionCheckbox, PageToolbar } from '@/components/ui';
import { Dialog, DialogPanel } from '@headlessui/react';
import { StaggerContainer, StaggerItem } from '@/components/layout/PageContainer';
import { toast } from '@/components/ui/Toast';
import { api, Group, User } from '@/lib/api';
import {
  PlusIcon,
  ArrowPathIcon,
  UsersIcon,
  PuzzlePieceIcon,
  EllipsisVerticalIcon,
  TrashIcon,
  CheckIcon,
  XMarkIcon,
  EyeIcon,
  DocumentDuplicateIcon,
} from '@heroicons/react/24/outline';

// Group display type
interface GroupDisplay {
  id: string;
  name: string;
  description?: string;
  color?: string;
  colorIndex?: number;
  users: Array<{ name: string; id: string }>;
  addonCount: number;
  userCount: number; // Total user count from API
  lastSync: string;
  isActive?: boolean;
}

const colorOptions = [
  '#7c3aed', // violet
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#f59e0b', // amber
  '#f43f5e', // rose
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#14b8a6', // teal
];

export default function GroupsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Data state
  const [groups, setGroups] = useState<Group[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Multi-select state - NO isSelectMode, just selectedIds
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Single item delete state (for quick action menu)
  const [deleteTarget, setDeleteTarget] = useState<GroupDisplay | null>(null);

  // Clone state
  const [cloneTarget, setCloneTarget] = useState<GroupDisplay | null>(null);

  // Fetch groups and users
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [groupsData, usersData] = await Promise.all([
          api.getGroups(),
          api.getUsers(),
        ]);
        setGroups(groupsData);
        setUsers(usersData);
      } catch (err) {
        setError(err as Error);
        toast.error('Failed to load groups');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  // Transform groups for display
  const groupsDisplay = useMemo<GroupDisplay[]>(() => {
    const userMap = new Map(users.map(u => [u.id, u]));

    return groups.map(group => {
      // Parse userIds (can be JSON string or array) and get user names
      let userIds: string[] = [];
      try {
        if (typeof group.userIds === 'string') {
          userIds = JSON.parse(group.userIds);
        } else if (Array.isArray(group.userIds)) {
          userIds = group.userIds;
        }
      } catch (e) {
        console.error('Error parsing group userIds:', e);
        userIds = [];
      }

      const groupUsers = userIds
        .map(id => {
          const user = userMap.get(id);
          return user ? { name: user.name || user.username || 'Unknown', id: user.id, email: user.email } : null;
        })
        .filter(Boolean) as Array<{ name: string; id: string; email?: string }>;

      // Derive color from colorIndex if color is not provided
      const groupColor = group.color || (group.colorIndex !== undefined ? colorOptions[group.colorIndex % colorOptions.length] : colorOptions[0]);

      return {
        id: group.id,
        name: group.name,
        description: group.description,
        color: groupColor,
        colorIndex: group.colorIndex,
        users: groupUsers,
        addonCount: group.addons || 0, // Use count from API
        userCount: group.users || groupUsers.length, // Use API count, fallback to parsed list length
        lastSync: '', // TODO: Track sync time
      };
    });
  }, [groups, users]);

  const filteredGroups = groupsDisplay.filter(group =>
    group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    group.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
    setSelectedIds(new Set(filteredGroups.map(g => g.id)));
  }, [filteredGroups]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleSyncSelected = useCallback(async () => {
    setIsSyncing(true);
    const ids = Array.from(selectedIds);
    let success = 0;

    for (const id of ids) {
      try {
        await api.syncGroup(id);
        success++;
      } catch (err) {
        console.error('Failed to sync group:', err);
      }
    }

    setIsSyncing(false);
    if (success > 0) {
      toast.success(`Synced ${success} group${success !== 1 ? 's' : ''} successfully`);
    }
    setSelectedIds(new Set());
    // Refresh groups
    try {
      const groupsData = await api.getGroups();
      setGroups(groupsData);
    } catch (err) {
      console.error('Failed to refresh groups:', err);
    }
  }, [selectedIds]);

  const handleDeleteSelected = useCallback(async () => {
    setIsDeleting(true);
    const ids = Array.from(selectedIds);
    let success = 0;

    for (const id of ids) {
      try {
        await api.deleteGroup(id);
        success++;
      } catch (err) {
        console.error('Failed to delete group:', err);
      }
    }

    setIsDeleting(false);
    setIsDeleteModalOpen(false);
    if (success > 0) {
      toast.success(`Deleted ${success} group${success !== 1 ? 's' : ''} successfully`);
      // Refresh groups
      try {
        const groupsData = await api.getGroups();
        setGroups(groupsData);
      } catch (err) {
        console.error('Failed to refresh groups:', err);
      }
    }
    setSelectedIds(new Set());
  }, [selectedIds]);

  // Delete single group (from quick action menu)
  const handleDeleteSingle = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await api.deleteGroup(deleteTarget.id);
      toast.success(`${deleteTarget.name} deleted successfully`);
      // Refresh groups
      try {
        const groupsData = await api.getGroups();
        setGroups(groupsData);
      } catch (err) {
        console.error('Failed to refresh groups:', err);
      }
    } catch (err) {
      toast.error(`Failed to delete ${deleteTarget.name}`);
      console.error('Failed to delete group:', err);
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget]);

  const hasSelection = selectedIds.size > 0;

  return (
    <>
      <Head>
        <title>Syncio - Groups</title>
      </Head>
      <Header
        title="Groups"
        subtitle={isLoading ? 'Loading...' : `${groups.length} group${groups.length !== 1 ? 's' : ''}`}
        actions={
          <>
            <Button
              variant="secondary"
              leftIcon={<ArrowPathIcon className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} />}
              onClick={async () => {
                setIsSyncing(true);
                try {
                  const groupIds = groups.map(g => g.id);
                  let success = 0;
                  for (const id of groupIds) {
                    try {
                      await api.syncGroup(id);
                      success++;
                    } catch (err) {
                      console.error('Failed to sync group:', err);
                    }
                  }
                  if (success > 0) {
                    toast.success(`Synced ${success} group${success !== 1 ? 's' : ''} successfully`);
                  }
                  const groupsData = await api.getGroups();
                  setGroups(groupsData);
                } catch (err: any) {
                  toast.error(err.message || 'Failed to sync all groups');
                } finally {
                  setIsSyncing(false);
                }
              }}
              disabled={isSyncing}
            >
              {isSyncing ? 'Syncing...' : 'Sync All'}
            </Button>
            <Button
              variant="primary"
              leftIcon={<PlusIcon className="w-5 h-5" />}
              onClick={() => setIsCreateModalOpen(true)}
            >
              Create Group
            </Button>
          </>
        }
      />

      <div className="p-8">
        {/* Filters */}
        <PageToolbar
          selectionConfig={{
            totalCount: filteredGroups.length,
            selectedCount: selectedIds.size,
            onSelectAll: selectAll,
            onDeselectAll: deselectAll,
          }}
          searchConfig={{
            value: searchQuery,
            onChange: (value) => setSearchQuery(value),
            placeholder: 'Search groups...',
          }}
          viewModeConfig={{
            mode: viewMode,
            onChange: setViewMode,
            showLabels: false,
          }}
        />

        {/* Loading state */}
        {isLoading ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 bg-surface-hover">
              <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin text-primary" />
            </div>
            <p className="text-muted">Loading groups...</p>
          </div>
        ) : error ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 bg-surface-hover">
              <XMarkIcon className="w-8 h-8 text-error" />
            </div>
            <h3 className="text-lg font-medium mb-2 text-default">Error Loading Groups</h3>
            <p className="text-muted mb-4">{error.message}</p>
            <Button variant="primary" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </div>
        ) : (
          <>
            {/* Groups Grid/List */}
            <LayoutGroup>
              <AnimatePresence mode="popLayout">
                {viewMode === 'grid' ? (
                  <StaggerContainer key="grid" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    <AnimatePresence mode="popLayout">
                      {filteredGroups.map((group) => (
                        <StaggerItem key={group.id}>
                          <GroupCard
                            group={group}
                            isSelected={selectedIds.has(group.id)}
                            onToggleSelect={() => toggleSelect(group.id)}
                            onDelete={() => setDeleteTarget(group)}
                            onClone={() => setCloneTarget(group)}
                            onToggleStatus={(groupId, newStatus) => {
                              setGroups(prev => prev.map(g =>
                                g.id === groupId
                                  ? { ...g, isActive: newStatus }
                                  : g
                              ));
                            }}
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
                              className={`w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer transition-all ${hasSelection && selectedIds.size === filteredGroups.length
                                  ? 'bg-primary border-primary'
                                  : 'border-default hover:border-primary'
                                }`}
                              onClick={() => hasSelection && selectedIds.size === filteredGroups.length ? deselectAll() : selectAll()}
                            >
                              {hasSelection && selectedIds.size === filteredGroups.length && (
                                <CheckIcon className="w-3 h-3 text-white" />
                              )}
                            </div>
                          </th>
                          <th className="px-6 py-4 text-left text-sm font-medium text-muted">Group</th>
                          <th className="px-6 py-4 text-left text-sm font-medium text-muted">Members</th>
                          <th className="px-6 py-4 text-left text-sm font-medium text-muted">Addons</th>
                          <th className="px-6 py-4 text-left text-sm font-medium text-muted">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        <AnimatePresence mode="popLayout">
                          {filteredGroups.map((group) => (
                            <motion.tr
                              key={group.id}
                              layout
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className={`transition-colors border-b border-default cursor-pointer ${selectedIds.has(group.id) ? 'bg-primary-muted' : 'hover:bg-white/5'
                                }`}
                              onClick={() => toggleSelect(group.id)}
                            >
                              <td className="px-4 py-4">
                                <div
                                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${selectedIds.has(group.id)
                                      ? 'bg-primary border-primary'
                                      : 'border-default'
                                    }`}
                                >
                                  {selectedIds.has(group.id) && (
                                    <CheckIcon className="w-3 h-3 text-white" />
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <Link
                                  href={`/groups/${group.id}`}
                                  className="flex items-center gap-3 group"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Avatar
                                    name={group.name}
                                    size="md"
                                    colorIndex={group.colorIndex ?? 0}
                                  />
                                  <div>
                                    <p className="font-medium transition-colors group-hover:text-primary text-default">
                                      {group.name}
                                    </p>
                                    <p className="text-sm text-muted truncate max-w-[200px]">
                                      {group.description || 'No description'}
                                    </p>
                                  </div>
                                </Link>
                              </td>
                              <td className="px-6 py-4 text-muted">
                                <span className="flex items-center gap-1.5">
                                  <UsersIcon className="w-4 h-4 text-secondary" />
                                  {group.userCount} member{group.userCount !== 1 ? 's' : ''}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-muted">
                                <span className="flex items-center gap-1.5">
                                  <PuzzlePieceIcon className="w-4 h-4 text-secondary" />
                                  {group.addonCount} addon{group.addonCount !== 1 ? 's' : ''}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  leftIcon={<ArrowPathIcon className="w-4 h-4" />}
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    try {
                                      await api.syncGroup(group.id);
                                      toast.success(`Synced ${group.name} successfully`);
                                    } catch (err: any) {
                                      toast.error(err.message || `Failed to sync ${group.name}`);
                                    }
                                  }}
                                >
                                  Sync
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

            {/* Empty state */}
            {filteredGroups.length === 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-16"
              >
                <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 bg-surface-hover">
                  <UsersIcon className="w-8 h-8 text-subtle" />
                </div>
                <h3 className="text-lg font-medium mb-2 text-default">No groups found</h3>
                <p className="mb-6 text-muted">
                  {searchQuery ? 'Try adjusting your search' : 'Get started by creating your first group'}
                </p>
                {!searchQuery && (
                  <Button variant="primary" onClick={() => setIsCreateModalOpen(true)}>
                    Create Group
                  </Button>
                )}
              </motion.div>
            )}
          </>
        )}
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
                  variant="secondary"
                  size="sm"
                  leftIcon={<ArrowPathIcon className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />}
                  onClick={handleSyncSelected}
                  isLoading={isSyncing}
                >
                  Sync
                </Button>
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

      {/* Create Group Modal */}
      <CreateGroupModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />

      {/* Delete Confirmation Modal (bulk) */}
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteSelected}
        title="Delete Groups"
        description={`Are you sure you want to delete ${selectedIds.size} group${selectedIds.size !== 1 ? 's' : ''}? This will remove all member associations but won't delete the users themselves.`}
        confirmText={isDeleting ? 'Deleting...' : 'Delete Groups'}
        variant="danger"
      />

      {/* Delete Confirmation Modal (single) */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteSingle}
        title="Delete Group"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This will remove all member associations but won't delete the users themselves.`}
        confirmText={isDeleting ? 'Deleting...' : 'Delete Group'}
        variant="danger"
      />

      {/* Clone Group Modal */}
      {cloneTarget && (
        <CloneGroupModal
          isOpen={!!cloneTarget}
          onClose={() => setCloneTarget(null)}
          group={cloneTarget}
        />
      )}
    </>
  );
}

// Group Card Component - single click opens, long press/right-click shows menu
function GroupCard({
  group,
  isSelected,
  onToggleSelect,
  onDelete,
  onClone,
  onToggleStatus,
}: {
  group: GroupDisplay;
  isSelected: boolean;
  onToggleSelect: () => void;
  onDelete: () => void;
  onClone: () => void;
  onToggleStatus?: (groupId: string, newStatus: boolean) => void;
}) {
  const { isOpen, position, handleContextMenu, close } = useContextMenu();
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const [showActions, setShowActions] = useState(false);

  // Single click opens detail page
  const handleClick = (e: React.MouseEvent) => {
    if (showActions) {
      setShowActions(false);
      return;
    }
    window.location.href = `/groups/${group.id}`;
  };

  // Handle touch for long press on mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    longPressTimer.current = setTimeout(() => {
      setShowActions(true);
      const touch = e.touches[0];
      handleContextMenu(e as unknown as React.MouseEvent, touch.clientX, touch.clientY);
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleSync = async (e: React.MouseEvent) => {
    e.stopPropagation();
    close();
    toast.success(`Syncing ${group.name}...`);
  };

  const handleClone = async (e: React.MouseEvent) => {
    e.stopPropagation();
    close();
    onClone();
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    close();
    onDelete();
  };

  return (
    <>
      <Card
        variant="interactive"
        padding="md"
        className={`group cursor-pointer select-none ${isSelected ? 'ring-2 ring-primary' : ''}`}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Selection indicator - visible on hover or when selected */}
        <div className="absolute top-4 right-4 flex items-center gap-2">
          <SelectionCheckbox
            checked={isSelected}
            onChange={onToggleSelect}
            visible={isSelected}
          />
        </div>

        <div className="flex items-start gap-4">
          {/* Color icon */}
          <Avatar
            name={group.name}
            size="lg"
            colorIndex={group.colorIndex ?? 0}
          />

          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Header row with name and sync badge */}
            <div className="flex items-center gap-2 mb-1 pr-8 flex-wrap">
              <Link
                href={`/groups/${group.id}`}
                className="font-semibold truncate transition-colors hover:text-primary text-default"
                onClick={(e) => e.stopPropagation()}
              >
                {group.name}
              </Link>
              <SyncBadge
                groupId={group.id}
                onSync={async (id) => {
                  try {
                    await api.syncGroup(id);
                    toast.success(`Synced ${group.name} successfully`);
                  } catch (err: any) {
                    toast.error(err.message || `Failed to sync ${group.name}`);
                  }
                }}
                size="sm"
              />
            </div>

            {/* Description (single line with ellipsis, reserved space even if empty) */}
            <p className="text-sm truncate mb-3 text-muted min-h-[1.25rem]">
              {group.description || '\u00A0'}
            </p>
          </div>
        </div>

        {/* Footer with avatars, summary stats, optional sync time, and toggle */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-default">
          <div className="flex items-center gap-3">
            <AvatarGroup users={group.users} max={4} size="xs" />
            <div className="flex items-center gap-4 text-sm text-muted">
              <span className="flex items-center gap-1.5">
                <UsersIcon className="w-4 h-4 text-secondary" />
                {group.userCount} user{group.userCount !== 1 ? 's' : ''}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1.5">
                <PuzzlePieceIcon className="w-4 h-4 text-secondary" />
                {group.addonCount} addon{group.addonCount !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {group.lastSync && (
              <>
                <span className="text-xs text-subtle">Synced {group.lastSync}</span>
                <span className="text-xs text-muted">•</span>
              </>
            )}
            <span className="text-sm text-muted">Active</span>
            <ToggleSwitch
              checked={group.isActive !== false}
              onChange={async () => {
                try {
                  const newStatus = !(group as any).isActive;
                  await api.toggleGroupStatus(group.id, newStatus);
                  toast.success(`Group ${newStatus ? 'activated' : 'deactivated'}`);
                  onToggleStatus?.(group.id, newStatus);
                } catch (err: any) {
                  toast.error(err.message || 'Failed to toggle group status');
                }
              }}
              size="sm"
            />
          </div>
        </div>
      </Card>

      <ContextMenu isOpen={isOpen} position={position} onClose={close}>
        <Link
          href={`/groups/${group.id}`}
          className="flex items-center gap-2 px-3 py-2 text-sm text-default hover:bg-surface-hover transition-colors"
          onClick={(e) => { e.stopPropagation(); close(); }}
        >
          <EyeIcon className="w-4 h-4" />
          View Details
        </Link>
        <button
          onClick={handleSync}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-default hover:bg-surface-hover transition-colors"
        >
          <ArrowPathIcon className="w-4 h-4" />
          Sync Group
        </button>
        <button
          onClick={handleClone}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-default hover:bg-surface-hover transition-colors"
        >
          <DocumentDuplicateIcon className="w-4 h-4" />
          Clone Group
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

// Create Group Modal - Premium styled
function CreateGroupModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedColorIndex, setSelectedColorIndex] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setName('');
        setDescription('');
        setSelectedColorIndex(0);
        setShowSuccess(false);
      }, 300);
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('Please enter a group name');
      return;
    }

    setIsLoading(true);
    try {
      const newGroup = await api.createGroup({
        name: name.trim(),
        description: description.trim() || undefined,
        colorIndex: selectedColorIndex,
      } as any);
      setShowSuccess(true);
      setTimeout(() => {
        onClose();
        if (newGroup?.id) {
          window.location.href = `/groups/${newGroup.id}`;
        } else {
          window.location.reload();
        }
      }, 800);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create group');
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

          <div className="fixed inset-0 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            >
              <DialogPanel
                className="w-full max-w-lg overflow-hidden"
                style={{
                  background: 'var(--color-surface)',
                  borderRadius: '24px',
                  border: '1px solid var(--color-surfaceBorder)',
                  boxShadow: '0 0 0 1px rgba(255,255,255,0.05), 0 40px 80px -20px rgba(0,0,0,0.5)'
                }}
              >
                {/* Decorative header gradient */}
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
                            <UsersIcon className="w-8 h-8 text-white" />
                          </motion.div>
                          <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-text)' }}>
                            Create New Group
                          </h2>
                          <p className="text-sm" style={{ color: 'var(--color-textMuted)' }}>
                            Organize users and manage shared addons
                          </p>
                        </div>

                        {/* Form */}
                        <div className="space-y-5">
                          <div>
                            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-textMuted)' }}>
                              Group Name <span style={{ color: 'var(--color-error)' }}>*</span>
                            </label>
                            <input
                              type="text"
                              placeholder="e.g., Family, Premium, Movies"
                              value={name}
                              onChange={(e) => setName(e.target.value)}
                              className="w-full px-4 py-3.5 rounded-xl transition-all duration-200 focus:outline-none"
                              style={{
                                background: 'var(--color-subtle)',
                                border: '1px solid var(--color-surfaceBorder)',
                                color: 'var(--color-text)'
                              }}
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-textMuted)' }}>
                              Description
                            </label>
                            <input
                              type="text"
                              placeholder="Brief description of this group"
                              value={description}
                              onChange={(e) => setDescription(e.target.value)}
                              className="w-full px-4 py-3.5 rounded-xl transition-all duration-200 focus:outline-none"
                              style={{
                                background: 'var(--color-subtle)',
                                border: '1px solid var(--color-surfaceBorder)',
                                color: 'var(--color-text)'
                              }}
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium mb-3" style={{ color: 'var(--color-textMuted)' }}>
                              Group Color
                            </label>
                            <div className="flex flex-wrap gap-3">
                              {colorOptions.map((color, index) => (
                                <motion.button
                                  key={color}
                                  type="button"
                                  whileHover={{ scale: 1.1 }}
                                  whileTap={{ scale: 0.95 }}
                                  onClick={() => setSelectedColorIndex(index)}
                                  className="w-10 h-10 rounded-xl transition-all"
                                  style={{
                                    backgroundColor: color,
                                    boxShadow: selectedColorIndex === index
                                      ? `0 0 0 2px var(--color-surface), 0 0 0 4px ${color}`
                                      : 'none'
                                  }}
                                />
                              ))}
                            </div>
                          </div>
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
                            Create Group
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
                          Group Created!
                        </h3>
                        <p className="text-sm" style={{ color: 'var(--color-textMuted)' }}>
                          {name} is ready to use
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

// Clone Group Modal
function CloneGroupModal({
  isOpen,
  onClose,
  group,
}: {
  isOpen: boolean;
  onClose: () => void;
  group: GroupDisplay;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [name, setName] = useState(`${group.name} (Copy)`);
  const [description, setDescription] = useState(group.description || '');
  const [selectedColorIndex, setSelectedColorIndex] = useState(0);
  const [includeUsers, setIncludeUsers] = useState(false);

  // Initialize from group
  useEffect(() => {
    if (isOpen && group) {
      setName(`${group.name} (Copy)`);
      setDescription(group.description || '');
      setSelectedColorIndex(group.colorIndex ?? 0);
    }
  }, [isOpen, group]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('Please enter a group name');
      return;
    }

    setIsLoading(true);
    try {
      const newGroup = await api.createGroup({
        name: name.trim(),
        description: description.trim() || undefined,
        colorIndex: selectedColorIndex,
      } as any);

      if (includeUsers && group.users.length > 0) {
        for (const user of group.users) {
          try {
            await api.addUserToGroup(newGroup.id, user.id);
          } catch (err) {
            console.error('Failed to add user to cloned group:', err);
          }
        }
      }

      toast.success('Group cloned successfully');
      onClose();
      window.location.reload();
    } catch (err: any) {
      toast.error(err.message || 'Failed to clone group');
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

          <div className="fixed inset-0 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            >
              <DialogPanel
                className="w-full max-w-lg overflow-hidden"
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
                      <DocumentDuplicateIcon className="w-8 h-8 text-white" />
                    </motion.div>
                    <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-text)' }}>
                      Clone Group
                    </h2>
                    <p className="text-sm" style={{ color: 'var(--color-textMuted)' }}>
                      Create a copy of "{group.name}"
                    </p>
                  </div>

                  <div className="space-y-5">
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-textMuted)' }}>
                        Group Name <span style={{ color: 'var(--color-error)' }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full px-4 py-3.5 rounded-xl transition-all duration-200 focus:outline-none"
                        style={{
                          background: 'var(--color-subtle)',
                          border: '1px solid var(--color-surfaceBorder)',
                          color: 'var(--color-text)'
                        }}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-textMuted)' }}>
                        Description
                      </label>
                      <input
                        type="text"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full px-4 py-3.5 rounded-xl transition-all duration-200 focus:outline-none"
                        style={{
                          background: 'var(--color-subtle)',
                          border: '1px solid var(--color-surfaceBorder)',
                          color: 'var(--color-text)'
                        }}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-3" style={{ color: 'var(--color-textMuted)' }}>
                        Group Color
                      </label>
                      <div className="flex flex-wrap gap-3">
                        {colorOptions.map((color, index) => (
                          <motion.button
                            key={color}
                            type="button"
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setSelectedColorIndex(index)}
                            className="w-10 h-10 rounded-xl transition-all"
                            style={{
                              backgroundColor: color,
                              boxShadow: selectedColorIndex === index
                                ? `0 0 0 2px var(--color-surface), 0 0 0 4px ${color}`
                                : 'none'
                            }}
                          />
                        ))}
                      </div>
                    </div>

                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => setIncludeUsers(!includeUsers)}
                      className="w-full flex items-center gap-3 p-4 rounded-xl transition-all cursor-pointer"
                      style={{
                        background: includeUsers ? 'color-mix(in srgb, var(--color-primary) 15%, transparent)' : 'var(--color-subtle)',
                        border: `1px solid ${includeUsers ? 'var(--color-primary)' : 'var(--color-surfaceBorder)'}`
                      }}
                    >
                      <div
                        className="w-5 h-5 rounded-md flex items-center justify-center transition-all"
                        style={{
                          background: includeUsers ? 'var(--color-primary)' : 'transparent',
                          border: includeUsers ? 'none' : '2px solid var(--color-surfaceBorder)'
                        }}
                      >
                        {includeUsers && <CheckIcon className="w-3 h-3 text-white" />}
                      </div>
                      <div className="text-left">
                        <p className="font-medium" style={{ color: 'var(--color-text)' }}>Include Users</p>
                        <p className="text-sm" style={{ color: 'var(--color-textMuted)' }}>
                          Copy all {group.users.length} user{group.users.length !== 1 ? 's' : ''} to the new group
                        </p>
                      </div>
                    </motion.button>
                  </div>

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
                      Clone Group
                    </Button>
                  </div>
                </div>
              </DialogPanel>
            </motion.div>
          </div>
        </Dialog>
      )}
    </AnimatePresence>
  );
}
