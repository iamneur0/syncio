'use client';

import { motion } from 'framer-motion';
import { Badge } from '@/components/ui';
import { PlayIcon, ClockIcon } from '@heroicons/react/24/outline';

interface NowPlayingItem {
  user: {
    id: string;
    username: string;
    colorIndex?: number;
  };
  item: {
    id: string;
    name: string;
    type: string;
    year?: number;
    poster?: string;
    season?: number;
    episode?: number;
  };
  watchedAt: string;
  watchedAtTimestamp?: number;
}

interface NowPlayingSectionProps {
  items: NowPlayingItem[];
}

export function NowPlayingSection({ items }: NowPlayingSectionProps) {
  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted">
        No one is currently watching
      </div>
    );
  }

  const formatTimeAgo = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  return (
    <div className="space-y-3">
      {items.slice(0, 5).map((item, index) => (
        <motion.div
          key={`${item.user.id}-${item.item.id}`}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.1 }}
          className="flex items-center gap-4 p-3 rounded-xl bg-surface-hover"
        >
          {/* User Avatar */}
          <div className="flex-shrink-0">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium"
              style={{
                background: `var(--color-avatar-${(item.user.colorIndex || 0) % 10})`,
              }}
            >
              {item.user.username.slice(0, 2).toUpperCase()}
            </div>
          </div>

          {/* Item Poster */}
          <div className="flex-shrink-0 w-12 h-16 rounded-lg overflow-hidden bg-surface">
            {item.item.poster ? (
              <img
                src={item.item.poster}
                alt={item.item.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                {item.item.type === 'movie' ? (
                  <FilmIcon className="w-6 h-6 text-muted" />
                ) : (
                  <TvIcon className="w-6 h-6 text-muted" />
                )}
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-default truncate">{item.item.name}</p>
            <div className="flex items-center gap-2 text-sm text-muted">
              <span className="truncate">{item.user.username}</span>
              {item.item.type === 'series' && item.item.season && item.item.episode && (
                <>
                  <span>•</span>
                  <Badge variant="default" size="sm">
                    S{item.item.season.toString().padStart(2, '0')}E{item.item.episode.toString().padStart(2, '0')}
                  </Badge>
                </>
              )}
            </div>
          </div>

          {/* Live indicator and Time Ago */}
          <div className="flex-shrink-0 text-right flex items-center gap-3">
            <div className="flex items-center gap-1 text-sm text-muted">
              <PlayIcon className="w-4 h-4 text-success" />
              {item.watchedAtTimestamp 
                ? formatTimeAgo(item.watchedAtTimestamp)
                : 'Active'}
            </div>
            <div className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
          </div>
        </motion.div>
      ))}
    </div>
  );
}

import { FilmIcon, TvIcon } from '@heroicons/react/24/outline';
