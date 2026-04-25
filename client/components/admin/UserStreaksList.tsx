'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { api } from '@/lib/api';
import { Badge, UserAvatar } from '@/components/ui';
import { FireIcon, ArrowTrendingUpIcon } from '@heroicons/react/24/outline';

interface UserData {
  id: string;
  name: string;
  email?: string;
}

interface UserStreaksData {
  userId: string;
  username: string;
  email?: string;
  currentStreak: number;
  longestStreak: number;
}

interface UserStreaksListProps {
  users: UserData[];
}

export function UserStreaksList({ users }: UserStreaksListProps) {
  const [streaks, setStreaks] = useState<UserStreaksData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStreaks() {
      if (users.length === 0) {
        setLoading(false);
        return;
      }

      try {
        const streaksData = await Promise.all(
          users.slice(0, 5).map(async (user) => {
            try {
              const data = await api.getUserStreaks(user.id);
              return {
                userId: user.id,
                username: user.name,
                email: user.email,
                currentStreak: data.currentStreak || 0,
                longestStreak: data.longestStreak || 0,
              };
            } catch (e) {
              return null;
            }
          })
        );
        
        setStreaks(streaksData.filter(Boolean) as UserStreaksData[]);
      } catch (error) {
        console.error('Error fetching streaks:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchStreaks();
  }, [users]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="flex items-center gap-2 text-sm text-muted">
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <span>Loading streaks...</span>
        </div>
      </div>
    );
  }

  if (streaks.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted">
        No streak data available
      </div>
    );
  }

  // Sort by current streak
  const sortedStreaks = [...streaks].sort((a, b) => b.currentStreak - a.currentStreak);

  return (
    <div className="space-y-3">
      {sortedStreaks.map((user, index) => (
        <motion.div
          key={user.userId}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.1 }}
          className="flex items-center gap-4 p-4 rounded-xl bg-surface-hover"
        >
          <div className="flex-shrink-0">
            <UserAvatar userId={user.userId} name={user.username} email={user.email} size="md" />
          </div>
          
          <div className="flex-1 min-w-0">
            <p className="font-medium text-default truncate">{user.username}</p>
            <div className="flex items-center gap-4 text-sm text-muted mt-1">
              <span className="flex items-center gap-1">
                <FireIcon className="w-4 h-4" />
                {user.currentStreak} day{user.currentStreak !== 1 ? 's' : ''} current
              </span>
              <span className="flex items-center gap-1">
                <ArrowTrendingUpIcon className="w-4 h-4" />
                {user.longestStreak} day{user.longestStreak !== 1 ? 's' : ''} best
              </span>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
