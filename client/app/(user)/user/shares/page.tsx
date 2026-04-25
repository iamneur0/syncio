'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShareIcon,
  PaperAirplaneIcon,
  InboxIcon,
  FilmIcon,
  TvIcon,
  TrashIcon,
  CheckIcon,
  UserGroupIcon,
  Squares2X2Icon,
  ListBulletIcon,
  MagnifyingGlassIcon,
  PlayIcon,
  BookmarkIcon,
  HeartIcon,
  HandThumbUpIcon,
  XMarkIcon,
  FunnelIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { CheckIcon as CheckIconSolid, BookmarkIcon as BookmarkIconSolid } from '@heroicons/react/24/solid';
import { useUserAuth, useUserAuthHeaders } from '@/lib/hooks/useUserAuth';
import { userShares, userLibrary, Share, GroupMember } from '@/lib/user-api';
import { UserPageHeader } from '@/components/user/UserPageContainer';
import { toast } from '@/components/ui/Toast';
import { ViewModeToggle } from '@/components/ui';

type TabType = 'received' | 'sent';
type ViewMode = 'grid' | 'list';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

export default function UserSharesPage() {
  const { userId, userInfo } = useUserAuth();
  const { authKey } = useUserAuthHeaders();
  const [sentShares, setSentShares] = useState<Share[]>([]);
  const [receivedShares, setReceivedShares] = useState<Share[]>([]);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [libraryItemIds, setLibraryItemIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('received');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  
  // New UI states
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [isLoaded, setIsLoaded] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedShares, setSelectedShares] = useState<Set<string>>(new Set());
  const [userFilter, setUserFilter] = useState<string>('all');
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);

  // Load view mode from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('user-shares-view-mode');
    if (saved === 'list' || saved === 'grid') {
      setViewMode(saved as ViewMode);
    }
    setIsLoaded(true);
  }, []);

  // Save view mode to localStorage
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('user-shares-view-mode', viewMode);
    }
  }, [viewMode, isLoaded]);

  // Fetch shares and library
  useEffect(() => {
    if (!userId) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [sharesResult, membersResult, libraryResult] = await Promise.all([
          userShares.getShares(userId, authKey || undefined),
          userShares.getGroupMembers(userId, authKey || undefined),
          userLibrary.getLibrary(userId, authKey || undefined),
        ]);
        setSentShares(sharesResult.sent || []);
        setReceivedShares(sharesResult.received || []);
        setGroupMembers((membersResult.members || []).filter((m) => m.id !== userId));
        
        // Build set of library item IDs for quick lookup
        const libraryIds = new Set<string>();
        (libraryResult.library || []).forEach((item: any) => {
          const id = item._id || item.id;
          if (id && item.removed !== true) {
            libraryIds.add(id);
            // Also add base ID (without episode info)
            const baseId = id.split(':')[0];
            if (baseId) libraryIds.add(baseId);
          }
        });
        setLibraryItemIds(libraryIds);
      } catch (err: any) {
        setError(err.message || 'Failed to load shares');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [userId, authKey]);

  // Get unique users for filter
  const filterUsers = useMemo(() => {
    const users = new Map<string, { username: string; colorIndex: number }>();
    receivedShares.forEach((s) => {
      if (s.fromUsername && !users.has(s.fromUsername)) {
        users.set(s.fromUsername, { username: s.fromUsername, colorIndex: 0 });
      }
    });
    sentShares.forEach((s) => {
      if (s.toUsername && !users.has(s.toUsername)) {
        users.set(s.toUsername, { username: s.toUsername, colorIndex: 0 });
      }
    });
    return Array.from(users.values()).sort((a, b) => a.username.localeCompare(b.username));
  }, [receivedShares, sentShares]);

  // Filtered shares
  const filteredReceived = useMemo(() => {
    return receivedShares.filter((share) => {
      const matchesSearch = !searchTerm || share.itemName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesUser = userFilter === 'all' || share.fromUsername === userFilter;
      return matchesSearch && matchesUser;
    });
  }, [receivedShares, searchTerm, userFilter]);

  const filteredSent = useMemo(() => {
    return sentShares.filter((share) => {
      const matchesSearch = !searchTerm || share.itemName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesUser = userFilter === 'all' || share.toUsername === userFilter;
      return matchesSearch && matchesUser;
    });
  }, [sentShares, searchTerm, userFilter]);

  // Check if item is in library
  const isInLibrary = (itemId: string) => {
    if (!itemId) return false;
    if (libraryItemIds.has(itemId)) return true;
    const baseId = itemId.split(':')[0];
    return baseId ? libraryItemIds.has(baseId) : false;
  };

  // Selection handlers
  const handleToggleSelect = (shareId: string) => {
    setSelectedShares((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(shareId)) {
        newSet.delete(shareId);
      } else {
        newSet.add(shareId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    const currentShares = activeTab === 'received' ? filteredReceived : filteredSent;
    setSelectedShares(new Set(currentShares.map((s) => s.id)));
  };

  const handleDeselectAll = () => {
    setSelectedShares(new Set());
  };

  // Mark as viewed
  const handleMarkViewed = async (shareId: string) => {
    if (!userId || actionLoading) return;

    setActionLoading(shareId);
    try {
      await userShares.markAsViewed(userId, shareId);
      setReceivedShares((prev) =>
        prev.map((s) =>
          s.id === shareId ? { ...s, viewedAt: new Date().toISOString() } : s
        )
      );
      toast.success('Marked as viewed');
    } catch (err: any) {
      toast.error(err.message || 'Failed to mark as viewed');
    } finally {
      setActionLoading(null);
    }
  };

  // Remove single share
  const handleRemoveShare = async (shareId: string, type: 'sent' | 'received') => {
    if (!userId || actionLoading) return;

    setActionLoading(shareId);
    try {
      await userShares.removeShare(userId, shareId);
      if (type === 'sent') {
        setSentShares((prev) => prev.filter((s) => s.id !== shareId));
      } else {
        setReceivedShares((prev) => prev.filter((s) => s.id !== shareId));
      }
      selectedShares.delete(shareId);
      setSelectedShares(new Set(selectedShares));
      toast.success('Share removed');
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove share');
    } finally {
      setActionLoading(null);
    }
  };

  // Bulk delete
  const handleBulkDelete = async () => {
    if (!userId || selectedShares.size === 0) return;

    setActionLoading('bulk');
    try {
      await Promise.all(
        Array.from(selectedShares).map((shareId) => userShares.removeShare(userId, shareId))
      );
      setSentShares((prev) => prev.filter((s) => !selectedShares.has(s.id)));
      setReceivedShares((prev) => prev.filter((s) => !selectedShares.has(s.id)));
      toast.success(`${selectedShares.size} share(s) removed`);
      setSelectedShares(new Set());
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete shares');
    } finally {
      setActionLoading(null);
    }
  };

  // Add to library
  const handleAddToLibrary = async (share: Share) => {
    if (!userId) return;
    
    setActionLoading(share.id);
    try {
      const response = await fetch(`${API_BASE}/users/${userId}/toggle-library`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{
            itemId: share.itemId,
            itemType: share.itemType || 'movie',
            itemName: share.itemName,
            poster: share.poster,
            addToLibrary: true,
          }],
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to add to library');
      }
      
      // Update local state
      setLibraryItemIds((prev) => {
        const newSet = new Set(prev);
        newSet.add(share.itemId);
        return newSet;
      });
      toast.success(`Added "${share.itemName}" to library`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to add to library');
    } finally {
      setActionLoading(null);
    }
  };

  // Bulk add to library
  const handleBulkAddToLibrary = async () => {
    if (!userId || selectedShares.size === 0) return;

    const sharesToAdd = receivedShares.filter(
      (s) => selectedShares.has(s.id) && !isInLibrary(s.itemId)
    );
    
    if (sharesToAdd.length === 0) {
      toast.error('No shares to add (already in library or not received shares)');
      return;
    }

    setActionLoading('bulk');
    try {
      const response = await fetch(`${API_BASE}/users/${userId}/toggle-library`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: sharesToAdd.map((share) => ({
            itemId: share.itemId,
            itemType: share.itemType || 'movie',
            itemName: share.itemName,
            poster: share.poster,
            addToLibrary: true,
          })),
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to add to library');
      }
      
      // Update local state
      setLibraryItemIds((prev) => {
        const newSet = new Set(prev);
        sharesToAdd.forEach((s) => newSet.add(s.itemId));
        return newSet;
      });
      toast.success(`${sharesToAdd.length} item(s) added to library`);
      setSelectedShares(new Set());
    } catch (err: any) {
      toast.error(err.message || 'Failed to add to library');
    } finally {
      setActionLoading(null);
    }
  };

  // Format relative time
  const formatRelativeTime = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  const unviewedCount = receivedShares.filter((s) => !s.viewedAt).length;
  const currentShares = activeTab === 'received' ? filteredReceived : filteredSent;

  // Render share card (card view)
  const renderShareCard = (share: Share, type: 'sent' | 'received') => {
    const isSelected = selectedShares.has(share.id);
    const inLibrary = isInLibrary(share.itemId);
    const stremioLink = `stremio://detail/${share.itemType || 'movie'}/${share.itemId}`;

    return (
      <motion.div
        key={share.id}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={() => handleToggleSelect(share.id)}
        className="relative rounded-xl overflow-hidden cursor-pointer group"
        style={{
          background: 'var(--color-surface)',
          border: `2px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-surface-border)'}`,
        }}
      >
        {/* Selection indicator */}
        {isSelected && (
          <div 
            className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full flex items-center justify-center"
            style={{ background: 'var(--color-primary)' }}
          >
            <CheckIconSolid className="w-4 h-4 text-white" />
          </div>
        )}

        {/* Poster */}
        <div className="aspect-[2/3] relative overflow-hidden">
          {share.poster ? (
            <img 
              src={share.poster} 
              alt={share.itemName} 
              className="w-full h-full object-cover"
            />
          ) : (
            <div 
              className="w-full h-full flex items-center justify-center"
              style={{ background: 'var(--color-surface-elevated)' }}
            >
              {share.itemType === 'series' ? (
                <TvIcon className="w-12 h-12" style={{ color: 'var(--color-text-subtle)' }} />
              ) : (
                <FilmIcon className="w-12 h-12" style={{ color: 'var(--color-text-subtle)' }} />
              )}
            </div>
          )}

          {/* Stremio link overlay */}
          <a
            href={stremioLink}
            onClick={(e) => e.stopPropagation()}
            className="absolute top-2 left-2 p-1.5 rounded-full transition-opacity opacity-80 hover:opacity-100"
            style={{ background: 'rgba(0,0,0,0.7)' }}
            title="Open in Stremio"
          >
            <PlayIcon className="w-4 h-4 text-white" />
          </a>

          {/* New badge */}
          {type === 'received' && !share.viewedAt && (
            <div 
              className="absolute bottom-2 left-2 px-2 py-0.5 rounded text-xs font-medium"
              style={{ background: 'var(--color-primary)', color: 'white' }}
            >
              New
            </div>
          )}

          {/* Type badge */}
          <div 
            className="absolute bottom-2 right-2 px-2 py-0.5 rounded text-xs font-medium"
            style={{ background: 'rgba(0,0,0,0.7)', color: 'white' }}
          >
            {share.itemType === 'series' ? 'Series' : 'Movie'}
          </div>
        </div>

        {/* Action buttons */}
        <div 
          className="flex items-center border-t"
          style={{ borderColor: 'var(--color-surface-border)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => handleAddToLibrary(share)}
            disabled={actionLoading === share.id}
            className="flex-1 py-2 flex items-center justify-center transition-colors hover:bg-surface-hover"
            title={inLibrary ? 'In library' : 'Add to library'}
            style={{ color: inLibrary ? 'var(--color-primary)' : 'var(--color-text-muted)' }}
          >
            {inLibrary ? (
              <BookmarkIconSolid className="w-4 h-4" />
            ) : (
              <BookmarkIcon className="w-4 h-4" />
            )}
          </button>
          {type === 'received' && !share.viewedAt && (
            <button
              onClick={() => handleMarkViewed(share.id)}
              disabled={actionLoading === share.id}
              className="flex-1 py-2 flex items-center justify-center transition-colors hover:bg-surface-hover"
              title="Mark as viewed"
              style={{ color: 'var(--color-success)' }}
            >
              <CheckIcon className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => handleRemoveShare(share.id, type)}
            disabled={actionLoading === share.id}
            className="flex-1 py-2 flex items-center justify-center transition-colors hover:bg-surface-hover"
            title="Remove"
            style={{ color: 'var(--color-error)' }}
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Info */}
        <div className="p-2 text-center">
          <p className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>
            {type === 'received' ? share.fromUsername : share.toUsername}
          </p>
          <p className="text-xs" style={{ color: 'var(--color-text-subtle)' }}>
            {formatRelativeTime(share.createdAt)}
          </p>
        </div>
      </motion.div>
    );
  };

  // Render share row (list view)
  const renderShareRow = (share: Share, type: 'sent' | 'received') => {
    const isSelected = selectedShares.has(share.id);
    const inLibrary = isInLibrary(share.itemId);
    const stremioLink = `stremio://detail/${share.itemType || 'movie'}/${share.itemId}`;

    return (
      <motion.div
        key={share.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={() => handleToggleSelect(share.id)}
        className="flex items-center gap-4 p-3 rounded-xl cursor-pointer"
        style={{
          background: 'var(--color-surface)',
          border: `2px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-surface-border)'}`,
        }}
      >
        {/* Poster */}
        <div className="relative w-16 h-24 rounded-lg overflow-hidden flex-shrink-0">
          {share.poster ? (
            <img src={share.poster} alt={share.itemName} className="w-full h-full object-cover" />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center"
              style={{ background: 'var(--color-surface-elevated)' }}
            >
              {share.itemType === 'series' ? (
                <TvIcon className="w-6 h-6" style={{ color: 'var(--color-text-subtle)' }} />
              ) : (
                <FilmIcon className="w-6 h-6" style={{ color: 'var(--color-text-subtle)' }} />
              )}
            </div>
          )}
          <a
            href={stremioLink}
            onClick={(e) => e.stopPropagation()}
            className="absolute top-1 right-1 p-1 rounded-full"
            style={{ background: 'rgba(0,0,0,0.7)' }}
            title="Open in Stremio"
          >
            <PlayIcon className="w-3 h-3 text-white" />
          </a>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {type === 'received' ? 'From' : 'To'}
            </span>
            <span className="font-medium" style={{ color: 'var(--color-text)' }}>
              {type === 'received' ? share.fromUsername : share.toUsername}
            </span>
            {type === 'received' && !share.viewedAt && (
              <span
                className="px-2 py-0.5 rounded text-xs font-medium"
                style={{ background: 'var(--color-primary-muted)', color: 'var(--color-primary)' }}
              >
                New
              </span>
            )}
            {type === 'sent' && share.viewedAt && (
              <span
                className="px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1"
                style={{ background: 'var(--color-success-muted)', color: 'var(--color-success)' }}
              >
                <CheckIcon className="w-3 h-3" />
                Viewed
              </span>
            )}
          </div>
          <h3 className="font-semibold truncate" style={{ color: 'var(--color-text)' }}>
            {share.itemName}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <span 
              className="text-xs px-1.5 py-0.5 rounded"
              style={{ background: 'var(--color-surface-elevated)', color: 'var(--color-text-muted)' }}
            >
              {share.itemType === 'series' ? 'Series' : 'Movie'}
            </span>
            <span className="text-xs" style={{ color: 'var(--color-text-subtle)' }}>
              {formatRelativeTime(share.createdAt)}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => handleAddToLibrary(share)}
            disabled={actionLoading === share.id}
            className="p-2 rounded-lg transition-colors"
            style={{ 
              background: 'var(--color-surface-elevated)',
              color: inLibrary ? 'var(--color-primary)' : 'var(--color-text-muted)',
            }}
            title={inLibrary ? 'In library' : 'Add to library'}
          >
            {inLibrary ? (
              <BookmarkIconSolid className="w-5 h-5" />
            ) : (
              <BookmarkIcon className="w-5 h-5" />
            )}
          </button>
          {type === 'received' && !share.viewedAt && (
            <button
              onClick={() => handleMarkViewed(share.id)}
              disabled={actionLoading === share.id}
              className="p-2 rounded-lg transition-colors"
              style={{ background: 'var(--color-success-muted)', color: 'var(--color-success)' }}
              title="Mark as viewed"
            >
              <CheckIcon className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={() => handleRemoveShare(share.id, type)}
            disabled={actionLoading === share.id}
            className="p-2 rounded-lg transition-colors"
            style={{ background: 'var(--color-error-muted)', color: 'var(--color-error)' }}
            title="Remove"
          >
            <TrashIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Selection indicator */}
        {isSelected && (
          <div 
            className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--color-primary)' }}
          >
            <CheckIconSolid className="w-4 h-4 text-white" />
          </div>
        )}
      </motion.div>
    );
  };

  return (
    <div className="p-8">
      <UserPageHeader
        title="Shares"
        subtitle="Media shared with you and by you"
      />

      {/* Toolbar */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center gap-3 mb-6"
      >
        {/* Tabs */}
        <div 
          className="flex p-1 rounded-xl"
          style={{ background: 'var(--color-surface)' }}
        >
          <button
            onClick={() => { setActiveTab('received'); setSelectedShares(new Set()); }}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2"
            style={{
              background: activeTab === 'received' ? 'var(--color-primary)' : 'transparent',
              color: activeTab === 'received' ? 'white' : 'var(--color-text-muted)',
            }}
          >
            <InboxIcon className="w-4 h-4" />
            Received
            {unviewedCount > 0 && (
              <span
                className="px-1.5 py-0.5 rounded-full text-xs font-bold"
                style={{
                  background: activeTab === 'received' ? 'white' : 'var(--color-primary)',
                  color: activeTab === 'received' ? 'var(--color-primary)' : 'white',
                }}
              >
                {unviewedCount}
              </span>
            )}
          </button>
          <button
            onClick={() => { setActiveTab('sent'); setSelectedShares(new Set()); }}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2"
            style={{
              background: activeTab === 'sent' ? 'var(--color-primary)' : 'transparent',
              color: activeTab === 'sent' ? 'white' : 'var(--color-text-muted)',
            }}
          >
            <PaperAirplaneIcon className="w-4 h-4" />
            Sent ({sentShares.length})
          </button>
        </div>

        {/* Search */}
        <div 
          className="flex items-center gap-2 px-3 py-2 rounded-lg flex-1 min-w-48"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)' }}
        >
          <MagnifyingGlassIcon className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by title..."
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--color-text)' }}
          />
        </div>

        {/* User Filter */}
        {filterUsers.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', color: 'var(--color-text)' }}
            >
              <FunnelIcon className="w-4 h-4" />
              {userFilter === 'all' ? 'All Users' : userFilter}
              <ChevronDownIcon className="w-4 h-4" />
            </button>
            {isFilterDropdownOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setIsFilterDropdownOpen(false)} />
                <div 
                  className="absolute top-full right-0 mt-1 py-1 rounded-lg shadow-lg z-20 min-w-40"
                  style={{ background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)' }}
                >
                  <button
                    onClick={() => { setUserFilter('all'); setIsFilterDropdownOpen(false); }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-surface-hover"
                    style={{ color: userFilter === 'all' ? 'var(--color-primary)' : 'var(--color-text)' }}
                  >
                    All Users
                  </button>
                  {filterUsers.map((user) => (
                    <button
                      key={user.username}
                      onClick={() => { setUserFilter(user.username); setIsFilterDropdownOpen(false); }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-surface-hover"
                      style={{ color: userFilter === user.username ? 'var(--color-primary)' : 'var(--color-text)' }}
                    >
                      {user.username}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* View Mode Toggle */}
        <ViewModeToggle
          mode={viewMode}
          onChange={(mode) => setViewMode(mode)}
        />
      </motion.div>

      {/* Selection Bar */}
      {selectedShares.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 mb-4 p-3 rounded-xl"
          style={{ background: 'var(--color-primary-muted)' }}
        >
          <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
            {selectedShares.size} selected
          </span>
          <button
            onClick={handleSelectAll}
            className="text-sm underline"
            style={{ color: 'var(--color-primary)' }}
          >
            Select All
          </button>
          <button
            onClick={handleDeselectAll}
            className="text-sm underline"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Deselect All
          </button>
          <div className="flex-1" />
          {activeTab === 'received' && (
            <button
              onClick={handleBulkAddToLibrary}
              disabled={actionLoading === 'bulk'}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium"
              style={{ background: 'var(--color-primary)', color: 'white' }}
            >
              <BookmarkIcon className="w-4 h-4" />
              Add to Library
            </button>
          )}
          <button
            onClick={handleBulkDelete}
            disabled={actionLoading === 'bulk'}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium"
            style={{ background: 'var(--color-error)', color: 'white' }}
          >
            <TrashIcon className="w-4 h-4" />
            Delete
          </button>
        </motion.div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div
            className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }}
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-4 rounded-xl mb-6"
          style={{ background: 'var(--color-error-muted)', color: 'var(--color-error)' }}
        >
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 underline hover:no-underline"
          >
            Dismiss
          </button>
        </motion.div>
      )}

      {/* Content */}
      {!loading && (
        <AnimatePresence mode="wait">
          {currentShares.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-20"
            >
              {activeTab === 'received' ? (
                <InboxIcon className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--color-text-subtle)' }} />
              ) : (
                <PaperAirplaneIcon className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--color-text-subtle)' }} />
              )}
              <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-text)' }}>
                {searchTerm || userFilter !== 'all' ? 'No matches found' : activeTab === 'received' ? 'No shared media' : 'No sent shares'}
              </h3>
              <p style={{ color: 'var(--color-text-muted)' }}>
                {searchTerm || userFilter !== 'all'
                  ? 'Try adjusting your search or filter'
                  : activeTab === 'received'
                  ? 'When someone shares media with you, it will appear here'
                  : 'Share media from your library to recommend to others'}
              </p>
            </motion.div>
          ) : viewMode === 'grid' ? (
            <motion.div
              key="card-grid"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3"
            >
              {currentShares.map((share) => renderShareCard(share, activeTab))}
            </motion.div>
          ) : (
            <motion.div
              key="list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              {currentShares.map((share) => renderShareRow(share, activeTab))}
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* Group Members Info */}
      {!loading && groupMembers.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-8 p-4 rounded-xl"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)' }}
        >
          <div className="flex items-center gap-2 mb-3">
            <UserGroupIcon className="w-5 h-5" style={{ color: 'var(--color-text-muted)' }} />
            <h3 className="font-semibold" style={{ color: 'var(--color-text)' }}>
              Group Members ({groupMembers.length})
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {groupMembers.map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full"
                style={{ background: 'var(--color-surface-elevated)' }}
              >
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-medium"
                  style={{ background: `hsl(${(member.colorIndex || 0) * 60}, 70%, 50%)` }}
                >
                  {member.username.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm" style={{ color: 'var(--color-text)' }}>
                  {member.username}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
