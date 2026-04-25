'use client';

import { useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge, Avatar, UserAvatar } from '@/components/ui';
import { PlayIcon, ClockIcon, FilmIcon, TvIcon, UsersIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface TopItem {
  itemId: string;
  name: string;
  type: 'movie' | 'series';
  poster?: string;
  totalWatchTimeSeconds: number;
  totalWatchTimeHours: number;
  userCount: number;
  users?: Array<{
    userId: string;
    username: string;
    email?: string;
    watchTimeSeconds: number;
    watchTimeHours: number;
    episodesWatched?: number;
  }>;
}

interface TopItemsSectionProps {
  movies: TopItem[];
  series: TopItem[];
}

export const TopItemsSection = memo(function TopItemsSection({ movies, series }: TopItemsSectionProps) {
  const [selectedItem, setSelectedItem] = useState<TopItem | null>(null);

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const ItemCard = ({ item, rank }: { item: TopItem; rank: number }) => (
    <div
      className="flex gap-4 p-4 rounded-xl bg-surface-hover cursor-pointer hover:bg-surface transition-colors"
      onClick={() => setSelectedItem(item)}
    >
      <div className="relative w-16 h-24 rounded-lg overflow-hidden flex-shrink-0 bg-surface">
        {item.poster ? (
          <img src={item.poster} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {item.type === 'movie' ? (
              <FilmIcon className="w-8 h-8 text-muted" />
            ) : (
              <TvIcon className="w-8 h-8 text-muted" />
            )}
          </div>
        )}
        <div className="absolute top-1 left-1 w-6 h-6 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-white">
          #{rank}
        </div>
      </div>
      
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-default truncate">{item.name}</h4>
        <div className="mt-2 space-y-1 text-sm text-muted">
          <div className="flex items-center gap-2">
            <ClockIcon className="w-4 h-4" />
            <span>{formatDuration(item.totalWatchTimeSeconds)}</span>
          </div>
          <div className="flex items-center gap-2">
            <UsersIcon className="w-4 h-4" />
            <span>{item.userCount} viewer{item.userCount !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Movies Section */}
      <div>
        <h4 className="text-sm font-medium text-muted mb-3 flex items-center gap-2">
          <FilmIcon className="w-4 h-4" />
          Top Movies
        </h4>
        <div className="space-y-3">
          {movies.slice(0, 3).map((movie, index) => (
            <ItemCard key={movie.itemId} item={movie} rank={index + 1} />
          ))}
        </div>
      </div>

      {/* Series Section */}
      <div>
        <h4 className="text-sm font-medium text-muted mb-3 flex items-center gap-2">
          <TvIcon className="w-4 h-4" />
          Top Series
        </h4>
        <div className="space-y-3">
          {series.slice(0, 3).map((show, index) => (
            <ItemCard key={show.itemId} item={show} rank={index + 1} />
          ))}
        </div>
      </div>

      {/* Modal for User Details */}
      <AnimatePresence>
        {selectedItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedItem(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-surface rounded-xl p-6 max-w-md w-full max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">{selectedItem.name}</h3>
                <button 
                  onClick={() => setSelectedItem(null)}
                  className="p-1 rounded-lg hover:bg-surface-hover"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-3">
                <p className="text-sm text-muted">
                  Total: {formatDuration(selectedItem.totalWatchTimeSeconds)} • {selectedItem.userCount} viewers
                </p>
                
                {selectedItem.users && selectedItem.users.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Viewers:</h4>
                    {selectedItem.users.map((user) => (
                      <div key={user.userId} className="flex items-center justify-between p-2 rounded-lg bg-surface-hover">
                        <div className="flex items-center gap-2">
                          <UserAvatar userId={user.userId} name={user.username} email={user.email} size="sm" />
                          <span className="text-sm">{user.username}</span>
                        </div>
                        <span className="text-sm text-muted">
                          {selectedItem.type === 'series' && user.episodesWatched && user.episodesWatched > 0
                            ? `${user.episodesWatched} ${user.episodesWatched === 1 ? 'episode' : 'episodes'} • ${formatDuration(user.watchTimeSeconds)}`
                            : formatDuration(user.watchTimeSeconds)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
