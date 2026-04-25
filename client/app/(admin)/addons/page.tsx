'use client';

import Head from 'next/head';
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Button, Card, Badge, ResourceBadge, SearchInput, Modal, Input, ConfirmModal, VersionBadge, ToggleSwitch, ContextMenu, useContextMenu, ViewModeToggle, SelectAllCheckbox, SelectionCheckbox, PageToolbar } from '@/components/ui';
import { Dialog, DialogPanel } from '@headlessui/react';
import { StaggerContainer, StaggerItem } from '@/components/layout/PageContainer';
import { toast } from '@/components/ui/Toast';
import { api, Addon } from '@/lib/api';
import {
  PlusIcon,
  ArrowPathIcon,
  PuzzlePieceIcon,
  ShieldCheckIcon,
  EllipsisVerticalIcon,
  LinkIcon,
  TrashIcon,
  CheckIcon,
  XMarkIcon,
  EyeIcon,
  DocumentDuplicateIcon,
  PencilIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';

// Addon display type
interface AddonDisplay {
  id: string;
  name: string;
  description?: string;
  manifestUrl: string;
  version?: string;
  resources: string[];
  catalogs: Array<string | { type: string; id: string; search?: boolean }>;
  logo?: string | null;
  isProtected: boolean;
  groupCount: number;
  userCount?: number;
  lastReload: string;
  isActive?: boolean;
  isOnline?: boolean;
  lastHealthCheck?: string;
  healthCheckError?: string;
}

export default function AddonsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedAddon, setSelectedAddon] = useState<AddonDisplay | null>(null);
  const [activeFilter, setActiveFilter] = useState('all');

  // Data state
  const [addons, setAddons] = useState<Addon[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Multi-select state - NO isSelectMode, just selectedIds
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Single item delete state (for quick action menu)
  const [deleteTarget, setDeleteTarget] = useState<AddonDisplay | null>(null);

  // Clone state
  const [cloneTarget, setCloneTarget] = useState<AddonDisplay | null>(null);

  // Fetch addons and groups
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [addonsData, groupsData] = await Promise.all([
          api.getAddons(),
          api.getGroups(),
        ]);
        setAddons(addonsData);
        setGroups(groupsData);
      } catch (err) {
        setError(err as Error);
        toast.error('Failed to load addons');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  // Transform addons for display
  const addonsDisplay = useMemo<AddonDisplay[]>(() => {
    return addons.map(addon => {
      const anyAddon = addon as any;
      // Count groups that use this addon (from API response)
      const groupCount = anyAddon.groups || 0;

      // Extract logo - backend returns customLogo and manifest.logo
      // Priority: customLogo > manifest.logo > fallback icon service
      const logo =
        anyAddon.customLogo ||
        (anyAddon.manifest && anyAddon.manifest.logo) ||
        addon.logo ||
        anyAddon.iconUrl ||
        (anyAddon.manifest?.id && `https://stremio-addon.netlify.app/${anyAddon.manifest.id}/icon.png`) ||
        undefined;

      return {
        id: addon.id,
        name: addon.name || 'Unnamed Addon',
        description: addon.description,
        manifestUrl: addon.manifestUrl,
        version: addon.version,
        resources: addon.resources || [],
        catalogs: addon.catalogs || [],
        logo,
        isProtected: !!anyAddon.isProtected,
        groupCount,
        userCount: anyAddon.users || 0, // Get from API response
        lastReload: 'Unknown', // TODO: Track reload time
        isActive: anyAddon.isActive !== false, // Default to true if not specified
        isOnline: addon.isOnline,
        lastHealthCheck: addon.lastHealthCheck,
        healthCheckError: addon.healthCheckError,
      };
    });
  }, [addons]);

  const filteredAddons = addonsDisplay.filter(addon => {
    // Search filter
    const matchesSearch =
      addon.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      addon.description?.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    // Category filter
    if (activeFilter === 'all') return true;
    if (activeFilter === 'protected') return addon.isProtected;
    if (activeFilter === 'stream') return addon.resources.includes('stream');
    if (activeFilter === 'catalogs') return addon.catalogs.length > 0;
    if (activeFilter === 'subtitles') return addon.resources.includes('subtitles');
    if (activeFilter === 'online') return addon.isOnline === true;
    if (activeFilter === 'offline') return addon.isOnline === false;

    return true;
  });

  const protectedCount = addonsDisplay.filter(a => a.isProtected).length;

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
    setSelectedIds(new Set(filteredAddons.map(a => a.id)));
  }, [filteredAddons]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleReloadSelected = useCallback(async () => {
    setIsReloading(true);
    const ids = Array.from(selectedIds);
    let success = 0;

    for (const id of ids) {
      try {
        await api.reloadAddon(id);
        success++;
      } catch (err) {
        console.error('Failed to reload addon:', err);
      }
    }

    setIsReloading(false);
    if (success > 0) {
      toast.success(`Reloaded ${success} addon${success !== 1 ? 's' : ''} successfully`);
    }
    setSelectedIds(new Set());
    // Refresh addons
    try {
      const addonsData = await api.getAddons();
      setAddons(addonsData);
    } catch (err) {
      console.error('Failed to refresh addons:', err);
    }
  }, [selectedIds]);

  const handleDeleteSelected = useCallback(async () => {
    setIsDeleting(true);
    const ids = Array.from(selectedIds);
    let success = 0;

    for (const id of ids) {
      try {
        await api.deleteAddon(id);
        success++;
      } catch (err) {
        console.error('Failed to delete addon:', err);
      }
    }

    setIsDeleting(false);
    setIsDeleteModalOpen(false);
    if (success > 0) {
      toast.success(`Deleted ${success} addon${success !== 1 ? 's' : ''} successfully`);
      // Refresh addons
      try {
        const addonsData = await api.getAddons();
        setAddons(addonsData);
      } catch (err) {
        console.error('Failed to refresh addons:', err);
      }
    }
    setSelectedIds(new Set());
  }, [selectedIds]);

  // Delete single addon (from quick action menu)
  const handleDeleteSingle = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await api.deleteAddon(deleteTarget.id);
      toast.success(`${deleteTarget.name} deleted successfully`);
      // Refresh addons
      try {
        const addonsData = await api.getAddons();
        setAddons(addonsData);
      } catch (err) {
        console.error('Failed to refresh addons:', err);
      }
    } catch (err) {
      toast.error(`Failed to delete ${deleteTarget.name}`);
      console.error('Failed to delete addon:', err);
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget]);

  const hasSelection = selectedIds.size > 0;

  return (
    <>
      <Head>
        <title>Syncio - Addons</title>
      </Head>
      <Header
        title="Addons"
        subtitle={isLoading ? 'Loading...' : `${addons.length} addon${addons.length !== 1 ? 's' : ''} • ${protectedCount} protected`}
        actions={
          <>
            <Button
              variant="secondary"
              leftIcon={<ArrowPathIcon className={`w-5 h-5 ${isReloading ? 'animate-spin' : ''}`} />}
              onClick={async () => {
                setIsReloading(true);
                try {
                  const addonIds = addons.map(a => a.id);
                  let success = 0;
                  for (const id of addonIds) {
                    try {
                      await api.reloadAddon(id);
                      success++;
                    } catch (err) {
                      console.error('Failed to reload addon:', err);
                    }
                  }
                  if (success > 0) {
                    toast.success(`Reloaded ${success} addon${success !== 1 ? 's' : ''} successfully`);
                  }
                  const addonsData = await api.getAddons();
                  setAddons(addonsData);
                } catch (err: any) {
                  toast.error(err.message || 'Failed to reload all addons');
                } finally {
                  setIsReloading(false);
                }
              }}
              disabled={isReloading}
            >
              {isReloading ? 'Reloading...' : 'Reload All'}
            </Button>
            <Button
              variant="primary"
              leftIcon={<PlusIcon className="w-5 h-5" />}
              onClick={() => setIsAddModalOpen(true)}
            >
              Add Addon
            </Button>
          </>
        }
      />

      <div className="p-8">
        {/* Filters */}
        <PageToolbar
          selectionConfig={{
            totalCount: filteredAddons.length,
            selectedCount: selectedIds.size,
            onSelectAll: selectAll,
            onDeselectAll: deselectAll,
          }}
          searchConfig={{
            value: searchQuery,
            onChange: setSearchQuery,
            placeholder: 'Search addons...',
          }}
          filterTabs={{
            options: [
              { key: 'all', label: 'All' },
              { key: 'protected', label: 'Protected' },
              { key: 'stream', label: 'Streams' },
              { key: 'catalogs', label: 'Catalogs' },
              { key: 'subtitles', label: 'Subtitles' },
              { key: 'online', label: 'Online' },
              { key: 'offline', label: 'Offline' },
            ],
            activeKey: activeFilter,
            onChange: setActiveFilter,
            layoutId: 'addons-filter-tabs',
          }}
          viewModeConfig={{
            mode: viewMode,
            onChange: setViewMode,
          }}
        />

        {/* Loading state */}
        {isLoading ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 bg-surface-hover">
              <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin text-primary" />
            </div>
            <p className="text-muted">Loading addons...</p>
          </div>
        ) : error ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 bg-surface-hover">
              <XMarkIcon className="w-8 h-8 text-error" />
            </div>
            <h3 className="text-lg font-medium mb-2 text-default">Error Loading Addons</h3>
            <p className="text-muted mb-4">{error.message}</p>
            <Button variant="primary" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </div>
        ) : (
          <>
            {/* Addons Grid/List */}
            <LayoutGroup>
              <AnimatePresence mode="popLayout">
                {viewMode === 'grid' ? (
                  <StaggerContainer key="grid" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    <AnimatePresence mode="popLayout">
                      {filteredAddons.map((addon) => (
                        <StaggerItem key={addon.id}>
                          <AddonCard
                            addon={addon}
                            isSelected={selectedIds.has(addon.id)}
                            onToggleSelect={() => toggleSelect(addon.id)}
                            onOpenDetail={() => setSelectedAddon(addon)}
                            onDelete={() => setDeleteTarget(addon)}
                            onClone={() => setCloneTarget(addon)}
                            onToggleStatus={(addonId, newStatus) => {
                              setAddons(prev => prev.map(a =>
                                a.id === addonId
                                  ? { ...a, isActive: newStatus }
                                  : a
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
                    <table className="w-full min-w-[600px]">
                      <thead>
                        <tr className="border-b border-default">
                          <th className="px-4 py-4 text-left w-12">
                            <div
                              className={`w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer transition-all ${hasSelection && selectedIds.size === filteredAddons.length
                                  ? 'bg-primary border-primary'
                                  : 'border-default hover:border-primary'
                                }`}
                              onClick={() => hasSelection && selectedIds.size === filteredAddons.length ? deselectAll() : selectAll()}
                            >
                              {hasSelection && selectedIds.size === filteredAddons.length && (
                                <CheckIcon className="w-3 h-3 text-white" />
                              )}
                            </div>
                          </th>
                          <th className="px-6 py-4 text-left text-sm font-medium text-muted">Addon</th>
                          <th className="px-6 py-4 text-left text-sm font-medium text-muted">Status</th>
                          <th className="px-6 py-4 text-left text-sm font-medium text-muted">Resources</th>
                          <th className="px-6 py-4 text-left text-sm font-medium text-muted">Users</th>
                          <th className="px-6 py-4 text-left text-sm font-medium text-muted">Groups</th>
                          <th className="px-6 py-4 text-left text-sm font-medium text-muted">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        <AnimatePresence mode="popLayout">
                          {filteredAddons.map((addon) => (
                            <motion.tr
                              key={addon.id}
                              layout
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className={`transition-colors border-b border-default cursor-pointer ${selectedIds.has(addon.id) ? 'bg-primary-muted' : 'hover:bg-white/5'
                                }`}
                              onClick={() => toggleSelect(addon.id)}
                            >
                              <td className="px-4 py-4">
                                <div
                                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${selectedIds.has(addon.id)
                                      ? 'bg-primary border-primary'
                                      : 'border-default'
                                    }`}
                                >
                                  {selectedIds.has(addon.id) && (
                                    <CheckIcon className="w-3 h-3 text-white" />
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <Link
                                  href={`/addons/${addon.id}`}
                                  className="flex items-center gap-3 group"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div
                                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
                                    style={{ background: 'linear-gradient(135deg, var(--color-primary-muted), var(--color-secondary-muted))' }}
                                  >
                                    {addon.logo ? (
                                      <img
                                        src={addon.logo}
                                        alt={addon.name}
                                        className="w-full h-full object-contain p-1"
                                      />
                                    ) : (
                                      <PuzzlePieceIcon className="w-6 h-6 text-primary" />
                                    )}
                                  </div>
                                  <div>
                                    <p className="font-medium transition-colors group-hover:text-primary text-default">
                                      {addon.name}
                                    </p>
                                    <p className="text-sm text-muted truncate max-w-[200px]">
                                      {addon.description || 'No description'}
                                    </p>
                                  </div>
                                </Link>
                              </td>
                              <td className="px-6 py-4">
                                {addon.lastHealthCheck ? (
                                  <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${addon.isOnline ? 'bg-success' : 'bg-danger'}`} />
                                    <span className={`text-sm ${addon.isOnline ? 'text-success' : 'text-danger'}`}>
                                      {addon.isOnline ? 'Online' : 'Offline'}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-sm text-muted">Not checked</span>
                                )}
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex flex-wrap gap-1">
                                  {addon.resources.slice(0, 3).map((resource) => (
                                    <ResourceBadge key={resource} resource={resource} />
                                  ))}
                                  {addon.resources.length > 3 && (
                                    <Badge variant="neutral" size="sm">+{addon.resources.length - 3}</Badge>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-muted">
                                <span className="flex items-center gap-1.5">
                                  <UsersIcon className="w-4 h-4 text-secondary" />
                                  {addon.userCount || 0} user{addon.userCount !== 1 ? 's' : ''}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-muted">
                                <span className="flex items-center gap-1.5">
                                  <PuzzlePieceIcon className="w-4 h-4 text-secondary" />
                                  {addon.groupCount} group{addon.groupCount !== 1 ? 's' : ''}
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
                                      await api.reloadAddon(addon.id);
                                      toast.success(`Reloaded ${addon.name} successfully`);
                                    } catch (err: any) {
                                      toast.error(err.message || `Failed to reload ${addon.name}`);
                                    }
                                  }}
                                >
                                  Reload
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
            {filteredAddons.length === 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-16"
              >
                <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 bg-surface-hover">
                  <PuzzlePieceIcon className="w-8 h-8 text-subtle" />
                </div>
                <h3 className="text-lg font-medium mb-2 text-default">No addons found</h3>
                <p className="mb-6 text-muted">
                  {searchQuery ? 'Try adjusting your search' : 'Get started by adding your first addon'}
                </p>
                {!searchQuery && (
                  <Button variant="primary" onClick={() => setIsAddModalOpen(true)}>
                    Add Addon
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
                  leftIcon={<ArrowPathIcon className={`w-4 h-4 ${isReloading ? 'animate-spin' : ''}`} />}
                  onClick={handleReloadSelected}
                  isLoading={isReloading}
                >
                  Reload
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

      {/* Add Addon Modal */}
      <AddAddonModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        groups={groups}
      />

      {/* Addon Detail Modal */}
      <Modal
        isOpen={!!selectedAddon}
        onClose={() => setSelectedAddon(null)}
        title={selectedAddon?.name || ''}
        description={selectedAddon?.description || ''}
        size="lg"
      >
        {selectedAddon && <AddonDetail addon={selectedAddon} onClose={() => setSelectedAddon(null)} />}
      </Modal>

      {/* Delete Confirmation Modal (bulk) */}
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteSelected}
        title="Delete Addons"
        description={`Are you sure you want to delete ${selectedIds.size} addon${selectedIds.size !== 1 ? 's' : ''}? This action cannot be undone.`}
        confirmText={isDeleting ? 'Deleting...' : 'Delete Addons'}
        variant="danger"
      />

      {/* Delete Confirmation Modal (single) */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteSingle}
        title="Delete Addon"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmText={isDeleting ? 'Deleting...' : 'Delete Addon'}
        variant="danger"
      />

      {/* Clone Addon Modal */}
      <Modal
        isOpen={!!cloneTarget}
        onClose={() => setCloneTarget(null)}
        title="Clone Addon"
        description={`Create a copy of "${cloneTarget?.name}"`}
        size="md"
      >
        {cloneTarget && (
          <CloneAddonForm
            addon={cloneTarget}
            onClose={() => setCloneTarget(null)}
          />
        )}
      </Modal>
    </>
  );
}

// Addon Card Component - single click opens, long press/right-click shows menu
function AddonCard({
  addon,
  isSelected,
  onToggleSelect,
  onOpenDetail,
  onDelete,
  onClone,
  onToggleStatus,
}: {
  addon: AddonDisplay;
  isSelected: boolean;
  onToggleSelect: () => void;
  onOpenDetail: () => void;
  onDelete: () => void;
  onClone: () => void;
  onToggleStatus?: (addonId: string, newStatus: boolean) => void;
}) {
  const [isReloading, setIsReloading] = useState(false);
  const { isOpen, position, handleContextMenu, close } = useContextMenu();
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const [showActions, setShowActions] = useState(false);

  const handleReload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    close();
    setIsReloading(true);
    try {
      await api.reloadAddon(addon.id);
      toast.success(`${addon.name} reloaded`);
    } catch (err) {
      toast.error(`Failed to reload ${addon.name}`);
      console.error('Failed to reload addon:', err);
    } finally {
      setIsReloading(false);
    }
  };

  // Single click opens detail page
  const handleClick = (e: React.MouseEvent) => {
    if (showActions) {
      setShowActions(false);
      return;
    }
    // If clicking a button, menu, or interactive element, navigate to detail
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }
    window.location.href = `/addons/${addon.id}`;
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

  const handleClone = (e: React.MouseEvent) => {
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
        padding="none"
        className={`group relative cursor-pointer select-none ${isSelected ? 'ring-2 ring-primary' : ''}`}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Selection indicator */}
        <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
          <SelectionCheckbox
            checked={isSelected}
            onChange={onToggleSelect}
            visible={isSelected}
          />
        </div>

        {/* Header */}
        <div className="relative p-6 pb-4">
          <div className="flex items-start gap-4">
            {/* Icon */}
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
              style={{ background: 'linear-gradient(135deg, var(--color-primary-muted), var(--color-secondary-muted))' }}
            >
              {addon.logo ? (
                <img
                  src={addon.logo}
                  alt={addon.name}
                  className="w-full h-full object-contain p-1.5"
                />
              ) : (
                <PuzzlePieceIcon className="w-7 h-7 text-primary" />
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 pr-8">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h3 className="text-lg font-semibold transition-all truncate group-hover:text-primary text-default">
                  {addon.name}
                </h3>
                {addon.version && (
                  <VersionBadge version={addon.version} size="sm" />
                )}
                {addon.isProtected && (
                  <ShieldCheckIcon className="w-5 h-5 shrink-0 text-success" title="Protected" />
                )}
                {/* Health Status Indicator */}
                {addon.lastHealthCheck && (
                  <div
                    className={`w-2 h-2 rounded-full ${addon.isOnline ? 'bg-success' : 'bg-danger'}`}
                    title={addon.isOnline
                      ? `Online - Last checked: ${new Date(addon.lastHealthCheck).toLocaleString()}`
                      : `Offline${addon.healthCheckError ? `: ${addon.healthCheckError}` : ''} - Last checked: ${new Date(addon.lastHealthCheck).toLocaleString()}`
                    }
                  />
                )}
              </div>
              {/* Description (single line with ellipsis, reserved space even if empty) */}
              <p className="text-sm line-clamp-1 text-muted min-h-[1.25rem]">
                {addon.description || '\u00A0'}
              </p>
            </div>
          </div>
        </div>

        {/* Resources */}
        {addon.resources.length > 0 && (
          <div className="px-6 pb-4">
            <div className="flex flex-wrap gap-2">
              {addon.resources.map((resource) => (
                <ResourceBadge key={resource} resource={resource} />
              ))}
            </div>
          </div>
        )}

        {/* Footer with stats and controls */}
        <div className="px-6 py-4 flex items-center justify-between border-t border-default">
          <div className="flex items-center gap-4 text-sm text-muted">
            <span className="flex items-center gap-1.5">
              <UsersIcon className="w-4 h-4 text-secondary" />
              {addon.userCount || 0} user{addon.userCount !== 1 ? 's' : ''}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1.5">
              <PuzzlePieceIcon className="w-4 h-4 text-secondary" />
              {addon.groupCount} group{addon.groupCount !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">Active</span>
            <ToggleSwitch
              checked={addon.isActive !== false}
              onChange={async () => {
                try {
                  const newStatus = !addon.isActive;
                  await api.toggleAddonStatus(addon.id, newStatus);
                  toast.success(`Addon ${newStatus ? 'activated' : 'deactivated'}`);
                  onToggleStatus?.(addon.id, newStatus);
                } catch (err: any) {
                  toast.error(err.message || 'Failed to toggle addon status');
                }
              }}
              size="sm"
            />
          </div>
        </div>
      </Card>

      <ContextMenu isOpen={isOpen} position={position} onClose={close}>
        <Link
          href={`/addons/${addon.id}`}
          onClick={(e) => {
            e.stopPropagation();
            close();
          }}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-default hover:bg-surface-hover transition-colors"
        >
          <EyeIcon className="w-4 h-4" />
          View Details
        </Link>
        <button
          onClick={handleReload}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-default hover:bg-surface-hover transition-colors"
        >
          <ArrowPathIcon className="w-4 h-4" />
          Reload Addon
        </button>
        <button
          onClick={handleClone}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-default hover:bg-surface-hover transition-colors"
        >
          <DocumentDuplicateIcon className="w-4 h-4" />
          Clone Addon
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

// Add Addon Modal - Premium styled
function AddAddonModal({
  isOpen,
  onClose,
  groups,
}: {
  isOpen: boolean;
  onClose: () => void;
  groups: any[];
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [manifestUrl, setManifestUrl] = useState('');
  const [error, setError] = useState('');
  const [manifestData, setManifestData] = useState<any>(null);
  const [isLoadingManifest, setIsLoadingManifest] = useState(false);
  const [urlError, setUrlError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setManifestUrl('');
        setError('');
        setManifestData(null);
        setUrlError('');
        setShowSuccess(false);
        setSelectedGroupIds(new Set());
      }, 300);
    }
  }, [isOpen]);

  // Load manifest when URL changes
  useEffect(() => {
    if (!manifestUrl.trim()) {
      setUrlError('');
      setManifestData(null);
      return;
    }

    const urlPattern = /^@?(https?|stremio):\/\/.+\.json$/;
    if (!urlPattern.test(manifestUrl.trim())) {
      setUrlError('URL must be a valid JSON manifest URL');
      setManifestData(null);
      return;
    }

    setUrlError('');

    const loadManifest = async () => {
      try {
        setIsLoadingManifest(true);
        let fetchUrl = manifestUrl.trim();
        if (fetchUrl.startsWith('stremio://')) {
          fetchUrl = fetchUrl.replace(/^stremio:\/\//, 'https://');
        }

        const response = await fetch(fetchUrl, { mode: 'cors', cache: 'no-cache' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        setManifestData(data);
        setUrlError('');
      } catch (err: any) {
        const isCorsError = err?.message?.includes('CORS') || err?.message?.includes('Failed to fetch') || err?.name === 'TypeError';
        setUrlError(isCorsError ? 'Cannot preview (CORS). Server will fetch it.' : err?.message || 'Failed to load');
        setManifestData(null);
      } finally {
        setIsLoadingManifest(false);
      }
    };

    const timeoutId = setTimeout(loadManifest, 500);
    return () => clearTimeout(timeoutId);
  }, [manifestUrl]);

  const handleSubmit = async () => {
    setError('');
    if (!manifestUrl.trim()) {
      setError('Manifest URL is required');
      return;
    }

    setIsLoading(true);
    try {
      const newAddon = await api.createAddon({
        manifestUrl,
        ...(manifestData ? { manifestData } : {}),
      });

      // Assign to selected groups if any
      if (selectedGroupIds.size > 0 && newAddon?.id) {
        try {
          await Promise.all(
            Array.from(selectedGroupIds).map((groupId) =>
              api.addAddonToGroup(groupId, newAddon.id)
            )
          );
        } catch (groupErr) {
          console.error('Failed to assign addon to some groups:', groupErr);
          // Don't fail the whole operation if group assignment fails
        }
      }

      setShowSuccess(true);
      setTimeout(() => {
        onClose();
        if (newAddon?.id) {
          window.location.href = `/addons/${newAddon.id}`;
        } else {
          window.location.reload();
        }
      }, 800);
    } catch (err: any) {
      setError(err.message || 'Failed to add addon');
      toast.error(err.message || 'Failed to add addon');
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
                            key={manifestData?.logo || 'default'}
                            initial={{ scale: 0, rotate: -180 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ type: 'spring', delay: 0.1, damping: 15 }}
                            className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center overflow-hidden"
                            style={{
                              background: manifestData?.logo
                                ? 'var(--color-subtle)'
                                : 'linear-gradient(135deg, var(--color-primary) 0%, color-mix(in srgb, var(--color-primary) 70%, var(--color-secondary)) 100%)',
                              boxShadow: '0 8px 32px -8px var(--color-primary)',
                              border: manifestData?.logo ? '1px solid var(--color-surfaceBorder)' : 'none'
                            }}
                          >
                            {manifestData?.logo ? (
                              <img src={manifestData.logo} alt={manifestData.name} className="w-full h-full object-contain p-2" />
                            ) : (
                              <PuzzlePieceIcon className="w-8 h-8 text-white" />
                            )}
                          </motion.div>
                          <h2 className="text-2xl font-bold mb-2 flex items-center justify-center gap-2" style={{ color: 'var(--color-text)' }}>
                            {manifestData?.name || 'Add New Addon'}
                            {manifestData?.version && (
                              <VersionBadge version={manifestData.version} size="md" />
                            )}
                          </h2>
                          <p className="text-sm" style={{ color: 'var(--color-textMuted)' }}>
                            {manifestData?.description || 'Enter the manifest URL to add an addon'}
                          </p>

                          {/* Resources preview as tags */}
                          {(() => {
                            const resources = manifestData?.resources || [];
                            const hasSearchCatalog = (manifestData?.catalogs || []).some((c: any) =>
                              c?.extra?.some((e: any) => e.name === 'search')
                            );
                            const resourceNames = resources.map((r: any) => typeof r === 'string' ? r : r.name).filter(Boolean);
                            if (hasSearchCatalog && !resourceNames.includes('search')) {
                              resourceNames.push('search');
                            }
                            if (resourceNames.length === 0) return null;
                            return (
                              <div className="mt-3 flex flex-wrap gap-2 justify-center">
                                {resourceNames.map((name: string) => (
                                  <ResourceBadge key={name} resource={name} />
                                ))}
                              </div>
                            );
                          })()}
                        </div>

                        {/* Form */}
                        <div className="space-y-5">
                          <div>
                            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-textMuted)' }}>
                              Manifest URL <span style={{ color: 'var(--color-error)' }}>*</span>
                            </label>
                            <div className="relative">
                              <div className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-textMuted)' }}>
                                <LinkIcon className="w-5 h-5" />
                              </div>
                              <input
                                type="text"
                                placeholder="https://addon.example.com/manifest.json"
                                value={manifestUrl}
                                onChange={(e) => setManifestUrl(e.target.value)}
                                className="w-full pl-12 pr-4 py-3.5 rounded-xl transition-all duration-200 focus:outline-none"
                                style={{
                                  background: 'var(--color-subtle)',
                                  border: `1px solid ${error || urlError ? 'var(--color-error)' : 'var(--color-surfaceBorder)'}`,
                                  color: 'var(--color-text)'
                                }}
                              />
                            </div>
                            {(error || urlError) && (
                              <p className="mt-2 text-sm" style={{ color: 'var(--color-error)' }}>{error || urlError}</p>
                            )}
                            {!manifestUrl.trim() && !error && !urlError && (
                              <p className="mt-2 text-xs" style={{ color: 'var(--color-textSubtle)' }}>
                                Enter the full URL to the addon's manifest.json file
                              </p>
                            )}
                          </div>

                          {/* Loading state */}
                          {isLoadingManifest && (
                            <motion.div
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="flex items-center gap-3 p-4 rounded-xl"
                              style={{ background: 'var(--color-subtle)' }}
                            >
                              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                              <span className="text-sm" style={{ color: 'var(--color-textMuted)' }}>Loading manifest...</span>
                            </motion.div>
                          )}

                          {/* Group Assignment */}
                          {manifestData && !isLoadingManifest && groups.length > 0 && (
                            <motion.div
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                            >
                              <div className="flex items-center justify-between mb-3">
                                <label className="block text-sm font-medium" style={{ color: 'var(--color-textMuted)' }}>
                                  <UsersIcon className="w-4 h-4 inline mr-2" />
                                  Assign to Groups
                                </label>
                                <span className="text-xs" style={{ color: 'var(--color-textSubtle)' }}>
                                  {selectedGroupIds.size === 0
                                    ? 'No groups selected'
                                    : `${selectedGroupIds.size} group${selectedGroupIds.size > 1 ? 's' : ''} selected`}
                                </span>
                              </div>
                              <div className="space-y-2 max-h-48 overflow-y-auto p-1">
                                {groups.map((group, index) => {
                                  const isSelected = selectedGroupIds.has(group.id);
                                  return (
                                    <motion.div
                                      key={group.id}
                                      initial={{ opacity: 0, y: 10 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      transition={{ delay: index * 0.03 }}
                                      onClick={() => {
                                        const newSet = new Set(selectedGroupIds);
                                        if (isSelected) {
                                          newSet.delete(group.id);
                                        } else {
                                          newSet.add(group.id);
                                        }
                                        setSelectedGroupIds(newSet);
                                      }}
                                      className={`group flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200 bg-surface-hover hover:bg-surface border border-default hover:border-primary`}
                                    >
                                      {/* Group color indicator */}
                                      <div
                                        className="w-3 h-3 rounded-full flex-shrink-0"
                                        style={{ background: group.color || 'var(--color-primary)' }}
                                      />

                                      {/* Content */}
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          <span className={`font-medium truncate ${isSelected ? 'text-default' : 'text-subtle group-hover:text-default'}`}>
                                            {group.name}
                                          </span>
                                          {group.description && (
                                            <span className="text-xs text-muted truncate">
                                              • {group.description}
                                            </span>
                                          )}
                                        </div>
                                      </div>

                                      {/* Selection indicator circle */}
                                      <div
                                        className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${isSelected
                                            ? 'bg-primary border-primary'
                                            : 'border-default group-hover:border-primary/50'
                                          }`}
                                      >
                                        {isSelected && (
                                          <motion.div
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            className="w-2 h-2 rounded-full bg-white"
                                          />
                                        )}
                                      </div>
                                    </motion.div>
                                  );
                                })}
                              </div>
                              <p className="mt-2 text-xs" style={{ color: 'var(--color-textSubtle)' }}>
                                Click to select groups. You can assign this addon to groups later.
                              </p>
                            </motion.div>
                          )}
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
                            disabled={isLoadingManifest}
                          >
                            Add Addon
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
                          Addon Added!
                        </h3>
                        <p className="text-sm" style={{ color: 'var(--color-textMuted)' }}>
                          {manifestData?.name || 'New addon'} is ready to use
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

// Addon Detail View - Enhanced with editing, group management, and resource selection
function AddonDetail({ addon, onClose }: { addon: AddonDisplay; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'details' | 'resources' | 'groups' | 'manifest'>('details');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedManifest, setCopiedManifest] = useState(false);

  // Editable fields
  const [editName, setEditName] = useState(addon.name);
  const [editDescription, setEditDescription] = useState(addon.description || '');
  const [editLogoUrl, setEditLogoUrl] = useState(addon.logo || '');

  // Group management
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [loadingGroups, setLoadingGroups] = useState(true);

  // Resource/Catalog selection
  const [selectedResources, setSelectedResources] = useState<Set<string>>(new Set(addon.resources));
  const [selectedCatalogs, setSelectedCatalogs] = useState<Set<string>>(() => {
    // Convert catalog objects to string keys
    const keys = addon.catalogs.map(c => {
      if (typeof c === 'string') return c;
      return c.id || c.type;
    });
    return new Set(keys);
  });

  // Manifest data
  const [manifestData, setManifestData] = useState<any>(null);
  const [loadingManifest, setLoadingManifest] = useState(false);

  // Fetch groups on mount
  useEffect(() => {
    const fetchGroups = async () => {
      try {
        const groupsData = await api.getGroups();
        setGroups(groupsData);
        // TODO: Set selectedGroups based on which groups have this addon
      } catch (err) {
        console.error('Failed to fetch groups:', err);
      } finally {
        setLoadingGroups(false);
      }
    };
    fetchGroups();
  }, []);

  // Load manifest when tab is selected
  useEffect(() => {
    if (activeTab === 'manifest' && !manifestData && !loadingManifest) {
      loadManifest();
    }
  }, [activeTab]);

  const loadManifest = async () => {
    setLoadingManifest(true);
    try {
      let fetchUrl = addon.manifestUrl;
      if (fetchUrl.startsWith('stremio://')) {
        fetchUrl = fetchUrl.replace(/^stremio:\/\//, 'https://');
      }
      const response = await fetch(fetchUrl, { mode: 'cors', cache: 'no-cache' });
      if (response.ok) {
        const data = await response.json();
        setManifestData(data);
      }
    } catch (err) {
      console.error('Failed to load manifest:', err);
    } finally {
      setLoadingManifest(false);
    }
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(addon.manifestUrl);
    setCopiedUrl(true);
    toast.success('URL copied to clipboard');
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleCopyManifest = () => {
    if (manifestData) {
      navigator.clipboard.writeText(JSON.stringify(manifestData, null, 2));
      setCopiedManifest(true);
      toast.success('Manifest JSON copied to clipboard');
      setTimeout(() => setCopiedManifest(false), 2000);
    }
  };

  const handleReload = async () => {
    setIsReloading(true);
    try {
      await api.reloadAddon(addon.id);
      toast.success('Addon manifest reloaded');
      // Reload manifest data
      await loadManifest();
    } catch (err: any) {
      toast.error(err.message || 'Failed to reload addon');
    } finally {
      setIsReloading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.updateAddon(addon.id, {
        name: editName,
        description: editDescription || undefined,
        logo: editLogoUrl || undefined,
        resources: Array.from(selectedResources),
        catalogs: Array.from(selectedCatalogs),
      });

      // Update group associations
      // TODO: Implement group association updates

      toast.success('Addon updated successfully');
      setIsEditing(false);
      window.location.reload();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update addon');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleResource = (resource: string) => {
    setSelectedResources(prev => {
      const next = new Set(prev);
      if (next.has(resource)) {
        next.delete(resource);
      } else {
        next.add(resource);
      }
      return next;
    });
  };

  const toggleCatalog = (catalog: string) => {
    setSelectedCatalogs(prev => {
      const next = new Set(prev);
      if (next.has(catalog)) {
        next.delete(catalog);
      } else {
        next.add(catalog);
      }
      return next;
    });
  };

  const toggleGroup = (groupId: string) => {
    setSelectedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const selectAllResources = () => {
    if (manifestData?.resources) {
      const allResources = manifestData.resources.map((r: any) => typeof r === 'string' ? r : r.name);
      setSelectedResources(new Set(allResources));
    }
  };

  const deselectAllResources = () => setSelectedResources(new Set());

  const selectAllCatalogs = () => {
    if (manifestData?.catalogs) {
      setSelectedCatalogs(new Set(manifestData.catalogs.map((c: any) => c.id || c.type)));
    }
  };

  const deselectAllCatalogs = () => setSelectedCatalogs(new Set());

  const tabs = [
    { id: 'details', label: 'Details' },
    { id: 'resources', label: 'Resources' },
    { id: 'groups', label: 'Groups' },
    { id: 'manifest', label: 'Manifest' },
  ];

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-surface-hover">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab.id
                ? 'bg-primary-muted text-primary'
                : 'text-muted hover:text-default'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* Details Tab */}
        {activeTab === 'details' && (
          <motion.div
            key="details"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Editable Name */}
            <div>
              <label className="block text-sm font-medium mb-2 text-muted">Name</label>
              {isEditing ? (
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Addon name"
                />
              ) : (
                <p className="font-semibold text-lg text-default">{addon.name}</p>
              )}
            </div>

            {/* Editable Description */}
            <div>
              <label className="block text-sm font-medium mb-2 text-muted">Description</label>
              {isEditing ? (
                <Input
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Addon description (optional)"
                />
              ) : (
                <p className="text-default">{addon.description || 'No description'}</p>
              )}
            </div>

            {/* Editable Logo URL */}
            <div>
              <label className="block text-sm font-medium mb-2 text-muted">Custom Logo URL</label>
              {isEditing ? (
                <Input
                  value={editLogoUrl}
                  onChange={(e) => setEditLogoUrl(e.target.value)}
                  placeholder="https://example.com/logo.png"
                  leftIcon={<LinkIcon className="w-5 h-5" />}
                />
              ) : (
                <div className="flex items-center gap-3">
                  {addon.logo ? (
                    <>
                      <img src={addon.logo} alt="Logo" className="w-10 h-10 rounded-lg object-contain bg-surface-hover" />
                      <code className="text-sm text-muted truncate">{addon.logo}</code>
                    </>
                  ) : (
                    <span className="text-subtle">No custom logo</span>
                  )}
                </div>
              )}
            </div>

            {/* Basic Info Grid */}
            <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-surface-hover">
              <div>
                <p className="text-sm mb-1 text-muted">Version</p>
                <div className="mt-1">
                  {addon.version ? (
                    <VersionBadge version={addon.version} size="md" />
                  ) : (
                    <span className="font-medium text-default text-sm">Unknown</span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-sm mb-1 text-muted">Last Reloaded</p>
                <p className="font-medium text-default">{addon.lastReload}</p>
              </div>
              <div>
                <p className="text-sm mb-1 text-muted">Groups Using</p>
                <p className="font-medium text-default">{addon.groupCount} group{addon.groupCount !== 1 ? 's' : ''}</p>
              </div>
              <div>
                <p className="text-sm mb-1 text-muted">Protected</p>
                <p className="font-medium flex items-center gap-2 text-default">
                  {addon.isProtected ? (
                    <>
                      <ShieldCheckIcon className="w-5 h-5 text-success" />
                      Yes
                    </>
                  ) : 'No'}
                </p>
              </div>
            </div>

            {/* Manifest URL */}
            <div>
              <label className="block text-sm font-medium mb-2 text-muted">Manifest URL</label>
              <div className="flex items-center gap-2 p-3 rounded-xl bg-surface-hover border border-default">
                <LinkIcon className="w-5 h-5 shrink-0 text-subtle" />
                <code className="text-sm truncate flex-1 text-muted">{addon.manifestUrl}</code>
                <Button variant="ghost" size="sm" onClick={handleCopyUrl}>
                  {copiedUrl ? <CheckIcon className="w-4 h-4" /> : 'Copy'}
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Resources Tab */}
        {activeTab === 'resources' && (
          <motion.div
            key="resources"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Resources */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-muted">Resources</label>
                <div className="flex gap-2">
                  <button onClick={selectAllResources} className="text-xs text-primary hover:underline">Select All</button>
                  <button onClick={deselectAllResources} className="text-xs text-muted hover:underline">Deselect All</button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {(manifestData?.resources || addon.resources).map((resource: any) => {
                  const resourceName = typeof resource === 'string' ? resource : resource.name;
                  const isSelected = selectedResources.has(resourceName);
                  return (
                    <motion.button
                      key={resourceName}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => toggleResource(resourceName)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${isSelected
                          ? 'bg-primary-muted text-primary border-primary'
                          : 'bg-surface-hover text-muted border-default hover:border-primary'
                        }`}
                    >
                      <span className="flex items-center gap-2">
                        {isSelected && <CheckIcon className="w-4 h-4" />}
                        {resourceName}
                      </span>
                    </motion.button>
                  );
                })}
              </div>
              <p className="text-xs text-subtle mt-2">{selectedResources.size} selected</p>
            </div>

            {/* Catalogs */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-muted">Catalogs</label>
                <div className="flex gap-2">
                  <button onClick={selectAllCatalogs} className="text-xs text-primary hover:underline">Select All</button>
                  <button onClick={deselectAllCatalogs} className="text-xs text-muted hover:underline">Deselect All</button>
                </div>
              </div>
              {addon.catalogs.length > 0 || manifestData?.catalogs?.length > 0 ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    {(manifestData?.catalogs || addon.catalogs.map((c) => {
                      if (typeof c === 'string') return { id: c, type: c };
                      return { id: c.id, type: c.type };
                    })).map((catalog: any) => {
                      const catalogId = catalog.id || catalog.type || catalog;
                      const isSelected = selectedCatalogs.has(catalogId);
                      return (
                        <motion.button
                          key={catalogId}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => toggleCatalog(catalogId)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${isSelected
                              ? 'bg-secondary-muted text-secondary border-secondary'
                              : 'bg-surface-hover hover:bg-surface text-muted border-default hover:border-secondary'
                            }`}
                        >
                          <span className="flex items-center gap-2">
                            {isSelected && <CheckIcon className="w-4 h-4" />}
                            {catalog.name || catalogId}
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-subtle mt-2">{selectedCatalogs.size} selected</p>
                </>
              ) : (
                <p className="text-sm text-subtle">No catalogs available</p>
              )}
            </div>
          </motion.div>
        )}

        {/* Groups Tab */}
        {activeTab === 'groups' && (
          <motion.div
            key="groups"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <p className="text-sm text-muted">Select which groups should have access to this addon:</p>

            {loadingGroups ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : groups.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                {groups.map((group) => (
                  <motion.label
                    key={group.id}
                    whileHover={{ x: 4 }}
                    className="flex items-center gap-3 p-3 rounded-xl bg-surface-hover cursor-pointer transition-colors hover:bg-surface"
                  >
                    <input
                      type="checkbox"
                      checked={selectedGroups.has(group.id)}
                      onChange={() => toggleGroup(group.id)}
                      className="w-5 h-5 rounded bg-subtle border-default accent-primary"
                    />
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                      style={{ backgroundColor: group.color || '#7c3aed' }}
                    >
                      {group.name?.[0] || 'G'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-default truncate">{group.name}</p>
                      {group.description && (
                        <p className="text-xs text-muted truncate">{group.description}</p>
                      )}
                    </div>
                    <span className="text-xs text-subtle">{group.userIds?.length || 0} user{group.userIds?.length !== 1 ? 's' : ''}</span>
                  </motion.label>
                ))}
              </div>
            ) : (
              <p className="text-center py-8 text-muted">No groups available</p>
            )}

            <p className="text-xs text-subtle">{selectedGroups.size} group{selectedGroups.size !== 1 ? 's' : ''} selected</p>
          </motion.div>
        )}

        {/* Manifest Tab */}
        {activeTab === 'manifest' && (
          <motion.div
            key="manifest"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted">Raw manifest JSON</p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={loadManifest} disabled={loadingManifest}>
                  <ArrowPathIcon className={`w-4 h-4 mr-1 ${loadingManifest ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                <Button variant="ghost" size="sm" onClick={handleCopyManifest} disabled={!manifestData}>
                  {copiedManifest ? <CheckIcon className="w-4 h-4 mr-1" /> : <DocumentDuplicateIcon className="w-4 h-4 mr-1" />}
                  Copy JSON
                </Button>
              </div>
            </div>

            {loadingManifest ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : manifestData ? (
              <pre className="p-4 rounded-xl bg-subtle border border-default overflow-auto max-h-64 text-xs font-mono text-muted">
                {JSON.stringify(manifestData, null, 2)}
              </pre>
            ) : (
              <div className="text-center py-8 text-muted">
                <p>Unable to load manifest</p>
                <p className="text-xs text-subtle mt-1">This may be due to CORS restrictions</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Actions */}
      <div className="flex gap-3 pt-4 border-t border-default">
        {isEditing ? (
          <>
            <Button variant="secondary" onClick={() => setIsEditing(false)} className="flex-1">
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSave} isLoading={isSaving} className="flex-1">
              Save Changes
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => setIsEditing(true)} className="flex-1">
              <PencilIcon className="w-4 h-4 mr-2" />
              Edit
            </Button>
            <Button variant="secondary" onClick={handleReload} isLoading={isReloading}>
              <ArrowPathIcon className={`w-4 h-4 mr-2 ${isReloading ? 'animate-spin' : ''}`} />
              Reload
            </Button>
            <Button variant="danger" onClick={onClose}>
              Close
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// Clone Addon Form
function CloneAddonForm({ addon, onClose }: { addon: AddonDisplay; onClose: () => void }) {
  const [isLoading, setIsLoading] = useState(false);
  const [name, setName] = useState(`${addon.name} (Copy)`);
  const [manifestUrl, setManifestUrl] = useState(addon.manifestUrl);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const created = await api.createAddon({
        manifestUrl,
        name,
      });
      toast.success('Addon cloned successfully');
      onClose();
      if ((created as any)?.id) {
        window.location.href = `/addons/${(created as any).id}`;
      } else {
        window.location.reload();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to clone addon');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Input
        label="Addon Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g., My Custom Addon"
        required
      />

      <Input
        label="Manifest URL"
        value={manifestUrl}
        onChange={(e) => setManifestUrl(e.target.value)}
        leftIcon={<LinkIcon className="w-5 h-5" />}
        placeholder="https://addon.example.com/manifest.json"
        required
      />

      <div className="p-4 rounded-xl bg-subtle border border-default">
        <p className="text-sm text-muted mb-2">Original Addon Info:</p>
        <div className="space-y-1 text-sm">
          <p className="text-default">Version: {addon.version}</p>
          <p className="text-default">Resources: {addon.resources.join(', ')}</p>
          <p className="text-default">Protected: {addon.isProtected ? 'Yes' : 'No'}</p>
        </div>
      </div>

      <div className="flex gap-3 justify-end pt-4">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" isLoading={isLoading}>
          Clone Addon
        </Button>
      </div>
    </form>
  );
}
