'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui';
import { TvIcon, BoltIcon } from '@heroicons/react/24/outline';

interface BingeWatchItem {
  itemId: string;
  name: string;
  poster?: string;
  episodesPerDay: number;
  episodesPerWeek: number;
  estimatedEpisodes: number;
  daysActive: number;
  totalWatchTimeHours: number;
}

interface BingeWatchesSectionProps {
  items: BingeWatchItem[];
}

export const BingeWatchesSection = memo(function BingeWatchesSection({ items }: BingeWatchesSectionProps) {
  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted">
        No binge watch data available
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.slice(0, 5).map((item, index) => (
        <div
          key={item.itemId}
          className="flex items-center gap-4 p-4 rounded-xl bg-surface-hover"
        >
          {/* Poster */}
          <div className="relative w-14 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-surface">
            {item.poster ? (
              <img src={item.poster} alt={item.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <TvIcon className="w-6 h-6 text-muted" />
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-default truncate">{item.name}</h4>
            <div className="flex items-center gap-3 text-sm text-muted mt-1">
              <span className="flex items-center gap-1">
                <BoltIcon className="w-4 h-4" />
                {item.episodesPerDay.toFixed(1)} ep/day
              </span>
              <span>•</span>
              <span>{item.estimatedEpisodes} episodes</span>
            </div>
          </div>

          {/* Stats */}
          <div className="text-right flex-shrink-0">
            <p className="text-xs text-muted">
              {item.daysActive} {item.daysActive === 1 ? 'day' : 'days'} active
            </p>
          </div>
        </div>
      ))}
    </div>
  );
});
