'use client';

import { TopContentItem } from '@/lib/api';
import { motion } from 'framer-motion';
import { FilmIcon, TvIcon, FireIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';

interface ContentLeaderboardProps {
  movies: TopContentItem[];
  series: TopContentItem[];
  trending: TopContentItem[];
}

export function ContentLeaderboard({ movies, series, trending }: ContentLeaderboardProps) {
  const [activeTab, setActiveTab] = useState<'movies' | 'series' | 'trending'>('movies');
  
  const items = activeTab === 'movies' ? movies : activeTab === 'series' ? series : trending;
  
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 p-1 rounded-xl w-fit bg-surface border border-default">
        {[
          { key: 'movies', label: 'Movies', icon: FilmIcon },
          { key: 'series', label: 'Series', icon: TvIcon },
          { key: 'trending', label: 'Trending', icon: FireIcon },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key as 'movies' | 'series' | 'trending')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              activeTab === key ? 'bg-primary-muted text-primary' : 'text-muted'
            }`}
          >
            <Icon className="w-4 h-4 inline mr-2" />
            {label}
          </button>
        ))}
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((item, index) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="flex gap-4 p-4 rounded-xl bg-surface-hover"
          >
            <div className="relative w-20 h-28 rounded-lg overflow-hidden flex-shrink-0 bg-surface">
              {item.poster ? (
                <img
                  src={item.poster}
                  alt={item.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted">
                  <FilmIcon className="w-8 h-8" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between">
                <h4 className="font-medium text-default truncate pr-2">{item.name}</h4>
                <span className="text-lg font-bold text-primary">#{index + 1}</span>
              </div>
              <div className="mt-2 space-y-1 text-sm text-muted">
                <p>{item.watchCount} viewers</p>
                <p>{item.completionRate}% completion rate</p>
                <p>{item.avgWatchTimeMinutes} min avg watch time</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
