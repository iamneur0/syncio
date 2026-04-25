'use client';

import Head from 'next/head';
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Button, Card, Avatar, Badge, StatusBadge, SearchInput, ConfirmModal, SyncBadge, ToggleSwitch, Modal, Input, UserAvatar, ContextMenu, useContextMenu, ViewModeToggle, SelectAllCheckbox, SelectionCheckbox, PageToolbar } from '@/components/ui';
import { Dialog, DialogPanel } from '@headlessui/react';
import { StaggerContainer, StaggerItem } from '@/components/layout/PageContainer';
import { toast } from '@/components/ui/Toast';
import { api, User, Group } from '@/lib/api';
import { useTheme } from '@/lib/theme';
import { CreateUserModal } from '@/components/modals/CreateUserModal';
import {
  PlusIcon,
  ArrowPathIcon,
  ClockIcon,
  ChartBarIcon,
  TrashIcon,
  CheckIcon,
  XMarkIcon,
  EllipsisVerticalIcon,
  EyeIcon,
  ArrowDownTrayIcon,
  UsersIcon,
  UserGroupIcon,
  PuzzlePieceIcon,
  MinusIcon,
} from '@heroicons/react/24/outline';

// User type for display
interface UserDisplay {
  id: string;
  name: string;
  email?: string;
  status: 'active' | 'expired' | 'pending';
  watchTime: number;
  groups: string[];
  lastSync: string;
  streak: number;
  addonCount: number;
  colorIndex?: number;
}

function formatWatchTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return `${hours}h ${mins}m`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return `${days}d ${remainingHours}h`;
}

export default function UsersPage() {
  const { hideSensitive } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Data state
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isReconnectModalOpen, setIsReconnectModalOpen] = useState(false);
  const [reconnectUserId, setReconnectUserId] = useState<string | null>(null);
  const [reconnectUserName, setReconnectUserName] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncingUserIds, setSyncingUserIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  // Single item delete state (for quick action menu)
  const [deleteTarget, setDeleteTarget] = useState<UserDisplay | null>(null);

  // Fetch users and groups
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [usersData, groupsData] = await Promise.all([
          api.getUsers(),
          api.getGroups(),
        ]);
        setUsers(usersData);
        setGroups(groupsData);
      } catch (err) {
        setError(err as Error);
        toast.error('Failed to load users');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  // Transform users for display
  const usersDisplay = useMemo<UserDisplay[]>(() => {
    const groupMap = new Map(groups.map(g => [g.id, g]));

    return users.map(user => {
      // Get group names from groupIds or groups array (handle undefined)
      let userGroups: string[] = [];
      if (user.groups && Array.isArray(user.groups)) {
        // If groups is already an array of names
        userGroups = user.groups;
      } else if (user.groupIds && Array.isArray(user.groupIds)) {
        // Map groupIds to group names
        userGroups = user.groupIds
          .map(id => groupMap.get(id)?.name)
          .filter(Boolean) as string[];
      } else if (user.groupId) {
        // Single groupId (legacy)
        const group = groupMap.get(user.groupId);
        if (group) userGroups = [group.name];
      }

      // Determine status
      let status: 'active' | 'expired' | 'pending' = 'active';
      if (user.status) {
        status = user.status === 'inactive' ? 'expired' : user.status as any;
      } else if (user.expiresAt) {
        const expiresAt = new Date(user.expiresAt);
        if (expiresAt < new Date()) {
          status = 'expired';
        }
      } else if (user.isActive === false) {
        status = 'expired';
      }
      // TODO: Determine pending status based on actual user state

      // Format last sync (would need to fetch from user detail or track separately)
      const lastSync = 'Unknown';

      // Get username (prefer username over name)
      const userName = user.username || user.name || 'Unnamed User';

      return {
        id: user.id,
        name: userName,
        email: user.email,
        status,
        watchTime: (user as any).watchTime || 0, // Use watchTime from API
        groups: userGroups,
        lastSync,
        streak: 0, // TODO: Fetch from user streaks API
        addonCount: user.stremioAddonsCount || user.addons || 0,
        colorIndex: user.colorIndex,
      };
    });
  }, [users, groups]);

  const filteredUsers = usersDisplay.filter(user =>
    (user.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (user.email || '').toLowerCase().includes(searchQuery.toLowerCase())
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
    setSelectedIds(new Set(filteredUsers.map(u => u.id)));
  }, [filteredUsers]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleSyncSelected = useCallback(async () => {
    setIsSyncing(true);
    const ids = Array.from(selectedIds);
    let success = 0;

    for (const id of ids) {
      try {
        await api.syncUser(id);
        success++;
      } catch (err) {
        console.error('Failed to sync user:', err);
      }
    }

    setIsSyncing(false);
    if (success > 0) {
      toast.success(`Synced ${success} user${success !== 1 ? 's' : ''} successfully`);
    }
    setSelectedIds(new Set());
    // Refresh users
    try {
      const usersData = await api.getUsers();
      setUsers(usersData);
    } catch (err) {
      console.error('Failed to refresh users:', err);
    }
  }, [selectedIds]);

  const handleDeleteSelected = useCallback(async () => {
    setIsDeleting(true);
    const ids = Array.from(selectedIds);
    let success = 0;

    for (const id of ids) {
      try {
        await api.deleteUser(id);
        success++;
      } catch (err) {
        console.error('Failed to delete user:', err);
      }
    }

    setIsDeleting(false);
    setIsDeleteModalOpen(false);
    if (success > 0) {
      toast.success(`Deleted ${success} user${success !== 1 ? 's' : ''} successfully`);
      // Refresh users
      try {
        const usersData = await api.getUsers();
        setUsers(usersData);
      } catch (err) {
        console.error('Failed to refresh users:', err);
      }
    }
    setSelectedIds(new Set());
  }, [selectedIds]);

  // Delete single user (from quick action menu)
  const handleDeleteSingle = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await api.deleteUser(deleteTarget.id);
      toast.success(`${deleteTarget.name} deleted successfully`);
      // Refresh users
      try {
        const usersData = await api.getUsers();
        setUsers(usersData);
      } catch (err) {
        console.error('Failed to refresh users:', err);
      }
    } catch (err) {
      toast.error(`Failed to delete ${deleteTarget.name}`);
      console.error('Failed to delete user:', err);
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget]);

  const hasSelection = selectedIds.size > 0;

  const handleSyncStart = useCallback((userId: string) => {
    setSyncingUserIds((prev) => {
      const newSet = new Set(prev);
      newSet.add(userId);
      return newSet;
    });
  }, []);

  const handleSyncEnd = useCallback((userId: string) => {
    setSyncingUserIds((prev) => {
      const nextSet = new Set(prev);
      nextSet.delete(userId);
      return nextSet;
    });
  }, []);

  return (
    <>
      <Head>
        <title>Syncio - Users</title>
      </Head>
      <Header
        title="Users"
        subtitle={isLoading ? 'Loading...' : `${users.length} total user${users.length !== 1 ? 's' : ''}`}
        actions={
          <>
            <Button
              variant="secondary"
              leftIcon={<ArrowPathIcon className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} />}
              onClick={async () => {
                setIsSyncing(true);
                setSyncingUserIds(new Set(users.map(u => u.id)));
                try {
                  const userIds = users.map(u => u.id);
                  let success = 0;
                  for (const id of userIds) {
                    try {
                      await api.syncUser(id);
                      success++;
                    } catch (err) {
                      console.error('Failed to sync user:', err);
                    }
                    // Remove from syncing set as each completes - this triggers the badge to refetch status
                    setSyncingUserIds((prev) => {
                      const nextSet = new Set(prev);
                      nextSet.delete(id);
                      return nextSet;
                    });
                  }
                  if (success > 0) {
                    toast.success(`Synced ${success} user${success !== 1 ? 's' : ''} successfully`);
                  }
                  const usersData = await api.getUsers();
                  setUsers(usersData);
                } catch (err: any) {
                  toast.error(err.message || 'Failed to sync all users');
                } finally {
                  setIsSyncing(false);
                  setSyncingUserIds(new Set());
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
              Add User
            </Button>
          </>
        }
      />

      <div className="p-8">
        {/* Filters and controls */}
        <PageToolbar
          selectionConfig={{
            totalCount: filteredUsers.length,
            selectedCount: selectedIds.size,
            onSelectAll: selectAll,
            onDeselectAll: deselectAll,
          }}
          searchConfig={{
            value: searchQuery,
            onChange: (value) => setSearchQuery(value),
            placeholder: 'Search users...',
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
            <p className="text-muted">Loading users...</p>
          </div>
        ) : error ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 bg-surface-hover">
              <XMarkIcon className="w-8 h-8 text-error" />
            </div>
            <h3 className="text-lg font-medium mb-2 text-default">Error Loading Users</h3>
            <p className="text-muted mb-4">{error.message}</p>
            <Button variant="primary" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </div>
        ) : (
          <>
            {/* Users grid/list */}
            <LayoutGroup>
              <AnimatePresence mode="popLayout">
                {viewMode === 'grid' ? (
                  <StaggerContainer key="grid" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    <AnimatePresence mode="popLayout">
                      {filteredUsers.map((user) => (
                        <StaggerItem key={user.id}>
                          <UserCard
                            user={user}
                            isSelected={selectedIds.has(user.id)}
                            onToggleSelect={() => toggleSelect(user.id)}
                            onDelete={() => setDeleteTarget(user)}
                            onReconnect={(userId, userName) => {
                              setReconnectUserId(userId);
                              setReconnectUserName(userName);
                              setIsReconnectModalOpen(true);
                            }}
                            onToggleStatus={(userId, newStatus) => {
                              setUsers(prev => prev.map(u =>
                                u.id === userId
                                  ? { ...u, status: newStatus ? 'active' : 'inactive' }
                                  : u
                              ));
                            }}
                            syncingUserIds={syncingUserIds}
                            onSyncStart={handleSyncStart}
                            onSyncEnd={handleSyncEnd}
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
                    <table className="w-full min-w-[600px]">
                      <thead>
                        <tr className="border-b border-default">
                          <th className="px-4 py-4 text-left w-12">
                            <div
                              className={`w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer transition-all ${hasSelection && selectedIds.size === filteredUsers.length
                                  ? 'bg-primary border-primary'
                                  : 'border-default hover:border-primary'
                                }`}
                              onClick={() => hasSelection && selectedIds.size === filteredUsers.length ? deselectAll() : selectAll()}
                            >
                              {hasSelection && selectedIds.size === filteredUsers.length && (
                                <CheckIcon className="w-3 h-3 text-white" />
                              )}
                            </div>
                          </th>
                          <th className="px-6 py-4 text-left text-sm font-medium text-muted">User</th>
                          <th className="px-6 py-4 text-left text-sm font-medium text-muted">Status</th>
                          <th className="px-6 py-4 text-left text-sm font-medium text-muted">Watch Time</th>
                          <th className="px-6 py-4 text-left text-sm font-medium text-muted">Groups</th>
                          <th className="px-6 py-4 text-left text-sm font-medium text-muted">Last Sync</th>
                          <th className="px-6 py-4 text-left text-sm font-medium text-muted">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        <AnimatePresence mode="popLayout">
                          {filteredUsers.map((user) => (
                            <motion.tr
                              key={user.id}
                              layout
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className={`transition-colors border-b border-default cursor-pointer ${selectedIds.has(user.id) ? 'bg-primary-muted' : 'hover:bg-white/5'
                                }`}
                              onClick={() => toggleSelect(user.id)}
                            >
                              <td className="px-4 py-4">
                                <div
                                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${selectedIds.has(user.id)
                                      ? 'bg-primary border-primary'
                                      : 'border-default'
                                    }`}
                                >
                                  {selectedIds.has(user.id) && (
                                    <CheckIcon className="w-3 h-3 text-white" />
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <Link
                                  href={`/users/${user.id}`}
                                  className="flex items-center gap-3 group"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <UserAvatar userId={user.id} name={user.name} email={user.email} colorIndex={user.colorIndex} size="sm" />
                                  <div>
                                    <p className="font-medium transition-colors group-hover:text-primary text-default">
                                      {user.name}
                                    </p>
                                    <p className="text-sm text-subtle">
                                      {hideSensitive ? '••••••••' : user.email}
                                    </p>
                                  </div>
                                </Link>
                              </td>
                              <td className="px-6 py-4">
                                <StatusBadge status={user.status} />
                              </td>
                              <td className="px-6 py-4 text-muted">
                                {formatWatchTime(user.watchTime)}
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex gap-1">
                                  {user.groups.slice(0, 2).map((group, i) => (
                                    <Badge key={i} variant="primary" size="sm">{group}</Badge>
                                  ))}
                                  {user.groups.length > 2 && (
                                    <Badge variant="neutral" size="sm">+{user.groups.length - 2}</Badge>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-sm text-muted">
                                {user.lastSync}
                              </td>
                              <td className="px-6 py-4">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  leftIcon={<ArrowPathIcon className="w-4 h-4" />}
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    try {
                                      await api.syncUser(user.id);
                                      toast.success(`Synced ${user.name} successfully`);
                                    } catch (err: any) {
                                      toast.error(err.message || `Failed to sync ${user.name}`);
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
            {filteredUsers.length === 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-16"
              >
                <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 bg-surface-hover">
                  <svg className="w-8 h-8 text-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium mb-2 text-default">No users found</h3>
                <p className="mb-6 text-muted">
                  {searchQuery ? 'Try adjusting your search' : 'Get started by adding your first user'}
                </p>
                {!searchQuery && (
                  <Button variant="primary" onClick={() => setIsCreateModalOpen(true)}>
                    Add User
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

      {/* Create User Modal */}
      <CreateUserModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />

      {/* Reconnect Modal - reusing CreateUserModal */}
      {reconnectUserId && (
        <CreateUserModal
          isOpen={isReconnectModalOpen}
          onClose={() => {
            setIsReconnectModalOpen(false);
            setReconnectUserId(null);
            setReconnectUserName('');
          }}
          mode="reconnect"
          userId={reconnectUserId}
          userName={reconnectUserName}
          onReconnectSuccess={() => {
            setIsReconnectModalOpen(false);
            setReconnectUserId(null);
            setReconnectUserName('');
            window.location.reload();
          }}
        />
      )}

      {/* Delete Confirmation Modal (bulk) */}
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteSelected}
        title="Delete Users"
        description={`Are you sure you want to delete ${selectedIds.size} user${selectedIds.size !== 1 ? 's' : ''}? This action cannot be undone.`}
        confirmText={isDeleting ? 'Deleting...' : 'Delete Users'}
        variant="danger"
      />

      {/* Delete Confirmation Modal (single) */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteSingle}
        title="Delete User"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmText={isDeleting ? 'Deleting...' : 'Delete User'}
        variant="danger"
      />
    </>
  );
}

// User Card Component - single click opens, long press/right-click shows menu
function UserCard({
  user,
  isSelected,
  onToggleSelect,
  onDelete,
  onReconnect,
  onToggleStatus,
  syncingUserIds,
  onSyncStart,
  onSyncEnd,
}: {
  user: UserDisplay;
  isSelected: boolean;
  onToggleSelect: () => void;
  onDelete: () => void;
  onReconnect?: (userId: string, userName: string) => void;
  onToggleStatus?: (userId: string, newStatus: boolean) => void;
  syncingUserIds: Set<string>;
  onSyncStart: (userId: string) => void;
  onSyncEnd: (userId: string) => void;
}) {
  const { hideSensitive } = useTheme();
  const { isOpen, position, handleContextMenu, close } = useContextMenu();
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const [showActions, setShowActions] = useState(false);

  // Single click opens detail page
  const handleClick = (e: React.MouseEvent) => {
    // If it's a long press triggered action, don't navigate
    if (showActions) {
      setShowActions(false);
      return;
    }
    // Navigate to detail page
    window.location.href = `/users/${user.id}`;
  };

  // Handle touch for long press on mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    longPressTimer.current = setTimeout(() => {
      setShowActions(true);
      // Show context menu at touch position
      const touch = e.touches[0];
      handleContextMenu(e as unknown as React.MouseEvent, touch.clientX, touch.clientY);
    }, 500); // 500ms long press
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // Right click handled by onContextMenu
    if (e.button === 2) return;
  };

  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async (e: React.MouseEvent) => {
    e.stopPropagation();
    close();
    setIsSyncing(true);
    try {
      await api.syncUser(user.id);
      toast.success(`Synced ${user.name} successfully`);
    } catch (err: any) {
      toast.error(err.message || `Failed to sync ${user.name}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleReload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    close();
    toast.success(`Reloading addons for ${user.name}...`);
  };

  const handleImport = async (e: React.MouseEvent) => {
    e.stopPropagation();
    close();
    toast.success(`Importing addons from ${user.name}...`);
    try {
      const result = await api.importUserAddons(user.id);
      toast.success(result.message || `Successfully imported ${result.importedCount} addon${result.importedCount !== 1 ? 's' : ''}`);
    } catch (err: any) {
      toast.error(err.message || `Failed to import addons from ${user.name}`);
    }
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
        {/* Selection indicator */}
        <div className="absolute top-4 right-4 flex items-center gap-2">
          <SelectionCheckbox
            checked={isSelected}
            onChange={onToggleSelect}
            visible={isSelected}
          />
        </div>

        <div className="flex items-start gap-4">
          {/* Avatar */}
          <UserAvatar userId={user.id} name={user.name} email={user.email} colorIndex={user.colorIndex} size="lg" />

          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Header row with name and sync badge */}
            <div className="flex items-center gap-2 mb-1 pr-8 flex-wrap">
              <Link
                href={`/users/${user.id}`}
                className="font-semibold truncate transition-colors hover:text-primary text-default"
                onClick={(e) => e.stopPropagation()}
              >
                {user.name}
              </Link>
              <SyncBadge
                key={`sync-badge-${user.id}`}
                userId={user.id}
                onSync={async (id) => {
                  onSyncStart(id);
                  try {
                    await api.syncUser(id);
                    toast.success(`Synced ${user.name} successfully`);
                  } catch (err: any) {
                    toast.error(err.message || `Failed to sync ${user.name}`);
                  } finally {
                    onSyncEnd(id);
                  }
                }}
                onReconnect={(id) => {
                  if (onReconnect) {
                    onReconnect(user.id, user.name);
                  }
                }}
                isSyncing={syncingUserIds.has(user.id)}
                size="sm"
              />
            </div>
          </div>
        </div>

        {/* Footer with summary stats and toggle */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-default">
          <div className="flex items-center gap-4 text-sm text-muted">
            <span className="flex items-center gap-1.5">
              <UserGroupIcon className="w-4 h-4 text-secondary" />
              {user.groups.length > 0 ? (
                <>
                  {user.groups[0]}
                  {user.groups.length > 1 && ` +${user.groups.length - 1}`}
                </>
              ) : (
                'No group'
              )}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1.5">
              <PuzzlePieceIcon className="w-4 h-4 text-secondary" />
              {user.addonCount || 0} addon{user.addonCount !== 1 ? 's' : ''}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1.5">
              <ClockIcon className="w-4 h-4 text-secondary" />
              {formatWatchTime(user.watchTime)}
            </span>
          </div>
          <ToggleSwitch
            checked={user.status === 'active'}
            onChange={async () => {
              try {
                const newStatus = user.status === 'active' ? false : true;
                await api.toggleUserStatus(user.id, newStatus);
                toast.success(`User ${newStatus ? 'activated' : 'deactivated'}`);
                onToggleStatus?.(user.id, newStatus);
              } catch (err: any) {
                toast.error(err.message || 'Failed to toggle user status');
              }
            }}
            size="sm"
          />
        </div>
      </Card>

      <ContextMenu isOpen={isOpen} position={position} onClose={close}>
        <Link
          href={`/users/${user.id}`}
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
          Sync User
        </button>
        <button
          onClick={handleReload}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-default hover:bg-surface-hover transition-colors"
        >
          <ArrowPathIcon className="w-4 h-4" />
          Reload Addons
        </button>
        <button
          onClick={handleImport}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-default hover:bg-surface-hover transition-colors"
        >
          <ArrowDownTrayIcon className="w-4 h-4" />
          Import Addons
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

