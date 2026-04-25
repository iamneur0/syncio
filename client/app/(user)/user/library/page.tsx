'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MagnifyingGlassIcon,
  FilmIcon,
  TvIcon,
  TrashIcon,
  PlayIcon,
  ClockIcon,
  Squares2X2Icon,
  ListBulletIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import { useUserAuth, useUserAuthHeaders } from '@/lib/hooks/useUserAuth';
import { userLibrary, LibraryItem } from '@/lib/user-api';
import { UserPageHeader } from '@/components/user/UserPageContainer';
import { ViewModeToggle } from '@/components/ui';

type ViewMode = 'grid' | 'list';

// Format watch time from milliseconds to human-readable string
function formatWatchTime(ms: number | undefined | null): string | null {
  if (!ms || ms <= 0) return null;
  
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m`;
  }
  return null;
}

// Card item component
interface LibraryCardItemProps {
  item: LibraryItem;
  isSelected: boolean;
  isDeleting: boolean;
  onToggle: () => void;
  onDelete: () => void;
  stremioLink: string | null;
  watchTime: string | null;
}

function LibraryCardItem({ item, isSelected, isDeleting, onToggle, onDelete, stremioLink, watchTime }: LibraryCardItemProps) {
  const [imageError, setImageError] = useState(false);
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -4 }}
      onClick={onToggle}
      className="group relative cursor-pointer"
    >
      {/* Poster Card */}
      <div 
        className="relative aspect-[2/3] rounded-xl overflow-hidden shadow-xl"
        style={{
          border: isSelected ? '3px solid var(--color-primary)' : '1px solid var(--color-surface-border)',
        }}
      >
        {item.poster && !imageError ? (
          <>
            <img
              src={item.poster}
              alt={item.name}
              className="w-full h-full object-cover transition-all duration-700 group-hover:scale-110"
              onError={() => setImageError(true)}
            />
            {/* Gradient overlay - subtle */}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/50 to-transparent opacity-40 group-hover:opacity-60 transition-opacity" />
          </>
        ) : (
          <div 
            className="w-full h-full flex items-center justify-center"
            style={{ background: 'var(--color-surface-elevated)' }}
          >
            {item.type === 'movie' ? (
              <FilmIcon className="w-12 h-12" style={{ color: 'var(--color-text-subtle)' }} />
            ) : (
              <TvIcon className="w-12 h-12" style={{ color: 'var(--color-text-subtle)' }} />
            )}
          </div>
        )}

        {/* Selection indicator - top left */}
        {isSelected && (
          <div 
            className="absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center"
            style={{ background: 'var(--color-primary)' }}
          >
            <CheckIcon className="w-4 h-4 text-white" />
          </div>
        )}

        {/* Stremio link - top right */}
        {stremioLink && (
          <a
            href={stremioLink}
            onClick={(e) => e.stopPropagation()}
            className="absolute top-2 right-2 p-1.5 rounded-full transition-opacity opacity-80 hover:opacity-100"
            style={{ background: 'rgba(0,0,0,0.7)' }}
            title="Open in Stremio"
          >
            <PlayIcon className="w-4 h-4 text-white" />
          </a>
        )}

        {/* Delete button - shows on hover */}
        <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            disabled={isDeleting}
            className="p-2 rounded-full transition-all"
            style={{ background: 'rgba(239, 68, 68, 0.9)' }}
            title="Delete"
          >
            {isDeleting ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <TrashIcon className="w-4 h-4 text-white" />
            )}
          </button>
        </div>
      </div>

      {/* Content Info - Below the poster */}
      <div className="mt-2 space-y-0.5 text-center">
        {/* Content title */}
        <h4 
          className="font-semibold text-sm leading-tight line-clamp-2"
          style={{ color: 'var(--color-text-muted)' }}
          title={item.name}
        >
          {item.name}
        </h4>

        {/* Watch time */}
        {watchTime && (
          <div 
            className="flex items-center justify-center gap-1 text-xs"
            style={{ color: 'var(--color-text-subtle)' }}
          >
            <ClockIcon className="w-3 h-3" />
            <span>{watchTime}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// List item component
interface LibraryListItemProps {
  item: LibraryItem;
  isSelected: boolean;
  isDeleting: boolean;
  onToggle: () => void;
  onDelete: () => void;
  stremioLink: string | null;
  watchTime: string | null;
}

function LibraryListItem({ item, isSelected, isDeleting, onToggle, onDelete, stremioLink, watchTime }: LibraryListItemProps) {
  const [imageError, setImageError] = useState(false);
  
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      whileHover={{ x: 4 }}
      onClick={onToggle}
      className="flex items-start gap-4 p-4 rounded-xl cursor-pointer transition-colors"
      style={{
        background: 'var(--color-surface)',
        border: isSelected ? '2px solid var(--color-primary)' : '1px solid var(--color-surface-border)',
      }}
    >
      {/* Poster */}
      <div className="w-12 h-16 rounded-lg overflow-hidden flex-shrink-0 relative">
        {item.poster && !imageError ? (
          <img
            src={item.poster}
            alt={item.name}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: 'var(--color-surface-elevated)' }}
          >
            {item.type === 'movie' ? (
              <FilmIcon className="w-5 h-5" style={{ color: 'var(--color-text-subtle)' }} />
            ) : (
              <TvIcon className="w-5 h-5" style={{ color: 'var(--color-text-subtle)' }} />
            )}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {item.type === 'movie' ? (
            <FilmIcon className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-primary)' }} />
          ) : (
            <TvIcon className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-secondary)' }} />
          )}
          <span 
            className="font-medium truncate"
            style={{ color: 'var(--color-text)' }}
          >
            {item.name}
          </span>
        </div>

        {/* Watch time */}
        {watchTime && (
          <div className="mt-2 flex items-center gap-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            <ClockIcon className="w-3 h-3" />
            <span>{watchTime}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        {stremioLink && (
          <a
            href={stremioLink}
            className="p-2 rounded-lg transition-colors"
            style={{ background: 'var(--color-surface-elevated)', color: 'var(--color-text-muted)' }}
            title="Open in Stremio"
          >
            <PlayIcon className="w-4 h-4" />
          </a>
        )}
        <button
          onClick={() => onDelete()}
          disabled={isDeleting}
          className="p-2 rounded-lg transition-all"
          style={{ background: 'var(--color-error-muted)', color: 'var(--color-error)' }}
          title="Delete"
        >
          {isDeleting ? (
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <TrashIcon className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Selection indicator */}
      {isSelected && (
        <div 
          className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--color-primary)' }}
        >
          <CheckIcon className="w-4 h-4 text-white" />
        </div>
      )}
    </motion.div>
  );
}

// Get watch date from item (used for sorting)
function getWatchDate(item: LibraryItem): Date | null {
  const dates: number[] = [];
  if ((item as any)._mtime) {
    const d = new Date((item as any)._mtime).getTime();
    if (!isNaN(d)) dates.push(d);
  }
  if (item.state?.lastWatched) {
    const d = new Date(item.state.lastWatched).getTime();
    if (!isNaN(d)) dates.push(d);
  }
  if (dates.length === 0) return null;
  return new Date(Math.max(...dates)); // Most recent date
}

export default function UserLibraryPage() {
  const { userId } = useUserAuth();
  const { authKey, isReady } = useUserAuthHeaders();
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [isLoaded, setIsLoaded] = useState(false);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  // Load view mode preference
  useEffect(() => {
    const saved = localStorage.getItem('user-library-view-mode');
    if (saved === 'list' || saved === 'grid') {
      setViewMode(saved);
    }
    setIsLoaded(true);
  }, []);

  // Save view mode preference
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('user-library-view-mode', viewMode);
    }
  }, [viewMode, isLoaded]);

  // Fetch library
  useEffect(() => {
    if (!isReady || !userId) return;

    const fetchLibrary = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await userLibrary.getLibrary(userId, authKey || undefined);
        // Filter to only show items that are in the library (not removed)
        // !item.removed handles false, 0, null, undefined
        const activeItems = (result.library || []).filter((item: any) => !item.removed);
        setLibrary(activeItems);
      } catch (err: any) {
        console.error('Failed to load library:', err);
        setError(err.message || 'Failed to load library');
      } finally {
        setLoading(false);
      }
    };

    fetchLibrary();
  }, [userId, authKey, isReady]);

  // Filter, search, and sort library (most recent first)
  const filteredLibrary = useMemo(() => {
    let filtered = library.filter((item) => {
      // Only show items with valid IDs (tt* format)
      const itemId = item._id;
      return typeof itemId === 'string' && itemId.startsWith('tt');
    });

    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter((item) =>
        item.name?.toLowerCase().includes(searchLower)
      );
    }

    // Sort by watch date (most recent first)
    filtered.sort((a, b) => {
      const dateA = getWatchDate(a)?.getTime() || 0;
      const dateB = getWatchDate(b)?.getTime() || 0;
      return dateB - dateA;
    });

    return filtered;
  }, [library, search]);

  // Handle item selection
  const handleItemToggle = useCallback((itemId: string) => {
    setSelectedItems((prev) =>
      prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId]
    );
  }, []);

  // Select/Deselect all
  const handleSelectAll = useCallback(() => {
    const allIds = filteredLibrary.map((item) => item._id).filter(Boolean);
    setSelectedItems(allIds);
  }, [filteredLibrary]);

  const handleDeselectAll = useCallback(() => {
    setSelectedItems([]);
  }, []);

  // Clear selection when search changes
  useEffect(() => {
    setSelectedItems([]);
  }, [search]);

  // Delete single item
  const handleDeleteItem = async (itemId: string) => {
    if (!userId || deletingIds.has(itemId)) return;

    setDeletingIds((prev) => new Set(prev).add(itemId));
    try {
      await userLibrary.deleteItem(userId, itemId, authKey || undefined);
      setLibrary((prev) => prev.filter((item) => item._id !== itemId));
      setSelectedItems((prev) => prev.filter((id) => id !== itemId));
    } catch (err: any) {
      setError(err.message || 'Failed to delete item');
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };

  // Delete selected items
  const handleDeleteSelected = async () => {
    if (!userId || selectedItems.length === 0) return;

    const toDelete = [...selectedItems];
    setDeletingIds(new Set(toDelete));

    try {
      await Promise.all(
        toDelete.map((itemId) =>
          userLibrary.deleteItem(userId, itemId, authKey || undefined)
        )
      );
      setLibrary((prev) => prev.filter((item) => !toDelete.includes(item._id)));
      setSelectedItems([]);
    } catch (err: any) {
      setError(err.message || 'Failed to delete items');
    } finally {
      setDeletingIds(new Set());
    }
  };

  // Open in Stremio
  const getStremioLink = (item: LibraryItem): string | null => {
    const itemId = item._id;
    if (!itemId) return null;
    return `stremio://detail/${item.type || 'movie'}/${itemId}`;
  };

  return (
    <div className="p-8">
      <UserPageHeader
        title="My Library"
        subtitle={`${filteredLibrary.length} items in your library`}
      />

      {/* Toolbar */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row gap-4 mb-6"
      >
        {/* Search */}
        <div className="relative flex-1">
          <MagnifyingGlassIcon
            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5"
            style={{ color: 'var(--color-text-muted)' }}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-surface-border)',
              color: 'var(--color-text)',
            }}
          />
        </div>

        {/* Selection actions */}
        {selectedItems.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {selectedItems.length} selected
            </span>
            <button
              onClick={handleDeselectAll}
              className="px-3 py-2 rounded-lg text-sm font-medium"
              style={{
                background: 'var(--color-surface)',
                color: 'var(--color-text-muted)',
              }}
            >
              Clear
            </button>
            <button
              onClick={handleDeleteSelected}
              disabled={deletingIds.size > 0}
              className="px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
              style={{
                background: 'var(--color-error)',
                color: 'white',
              }}
            >
              <TrashIcon className="w-4 h-4" />
              Delete
            </button>
          </div>
        )}

        {/* View toggle */}
        <ViewModeToggle
          mode={viewMode}
          onChange={(mode) => setViewMode(mode)}
        />
      </motion.div>

      {/* Select all / Deselect all */}
      {filteredLibrary.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-4 mb-4"
        >
          <button
            onClick={selectedItems.length === filteredLibrary.length ? handleDeselectAll : handleSelectAll}
            className="text-sm font-medium transition-colors hover:opacity-80"
            style={{ color: 'var(--color-primary)' }}
          >
            {selectedItems.length === filteredLibrary.length ? 'Deselect All' : 'Select All'}
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
          className="p-4 rounded-xl text-center mb-6"
          style={{ background: 'var(--color-error-muted)', color: 'var(--color-error)' }}
        >
          {error}
        </motion.div>
      )}

      {/* Empty state */}
      {!loading && !error && filteredLibrary.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-20"
        >
          <FilmIcon
            className="w-16 h-16 mx-auto mb-4"
            style={{ color: 'var(--color-text-subtle)' }}
          />
          <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-text)' }}>
            {search ? 'No matching items' : 'Your library is empty'}
          </h3>
          <p style={{ color: 'var(--color-text-muted)' }}>
            {search
              ? 'Try adjusting your search terms'
              : 'Start watching content on Stremio to see it here'}
          </p>
        </motion.div>
      )}

      {/* Library - flat list, no date grouping */}
      {!loading && !error && filteredLibrary.length > 0 && (
        viewMode === 'grid' ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-3">
            <AnimatePresence mode="popLayout">
              {filteredLibrary.map((item) => (
                <LibraryCardItem
                  key={item._id}
                  item={item}
                  isSelected={selectedItems.includes(item._id)}
                  isDeleting={deletingIds.has(item._id)}
                  onToggle={() => handleItemToggle(item._id)}
                  onDelete={() => handleDeleteItem(item._id)}
                  stremioLink={getStremioLink(item)}
                  watchTime={formatWatchTime(item.state?.overallTimeWatched)}
                />
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {filteredLibrary.map((item) => (
                <LibraryListItem
                  key={item._id}
                  item={item}
                  isSelected={selectedItems.includes(item._id)}
                  isDeleting={deletingIds.has(item._id)}
                  onToggle={() => handleItemToggle(item._id)}
                  onDelete={() => handleDeleteItem(item._id)}
                  stremioLink={getStremioLink(item)}
                  watchTime={formatWatchTime(item.state?.overallTimeWatched)}
                />
              ))}
            </AnimatePresence>
          </div>
        )
      )}
    </div>
  );
}
