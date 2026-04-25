'use client';

import { useState, useEffect, useMemo, memo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  ClockIcon,
  FilmIcon,
  TvIcon,
  CalendarIcon,
  PlayIcon,
  CheckCircleIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import { useUserAuth, useUserAuthHeaders } from '@/lib/hooks/useUserAuth';
import { userActivity, WatchSession, UserActivityData } from '@/lib/user-api';
import { UserPageHeader } from '@/components/user/UserPageContainer';
import { Avatar, ViewModeToggle, Card } from '@/components/ui';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

// Helper to format duration in a human-readable way
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

// Format fractional hours in a human-readable way (Xh Xm)
function formatHours(hours: number): string {
  if (hours === 0) return '0h';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);

  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// Format time for display (e.g., "2:30 PM")
function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// Format timestamp relative
function formatTimestamp(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  return `${diffDays} days ago`;
}

// Helper to get date key for grouping (YYYY-MM-DD format)
function getDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper to format date header (Today, Yesterday, or formatted date)
function formatDateHeader(dateKey: string): string {
  const today = new Date();
  const todayKey = getDateKey(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = getDateKey(yesterday);

  if (dateKey === todayKey) return 'Today';
  if (dateKey === yesterdayKey) return 'Yesterday';

  const date = new Date(dateKey + 'T00:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

// Memoized tooltip style
const TOOLTIP_STYLE = {
  backgroundColor: 'rgba(30, 30, 56, 0.95)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '12px',
  backdropFilter: 'blur(12px)',
} as const;

const TOOLTIP_LABEL_STYLE = { color: '#fff' } as const;

// Stat Card Component
function StatCard({
  label,
  value,
  icon,
  color = 'var(--color-primary)',
  delay = 0,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="p-5 rounded-xl"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-surface-border)',
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ background: `${color}20`, color }}
        >
          {icon}
        </div>
      </div>
      <div
        className="text-2xl font-bold mb-1"
        style={{ color: 'var(--color-text)' }}
      >
        {value}
      </div>
      <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
        {label}
      </div>
    </motion.div>
  );
}

// Watch Time Chart Component
const WatchTimeChart = memo(function WatchTimeChart({
  data,
}: {
  data: Array<{ date: string; minutes: number }>;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="p-6 rounded-xl"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-surface-border)',
      }}
    >
      <div className="flex items-center justify-between mb-6">
        <h3
          className="text-lg font-semibold"
          style={{ color: 'var(--color-text)' }}
        >
          Watch Time
        </h3>
        <div
          className="text-sm px-3 py-1 rounded-lg"
          style={{
            background: 'var(--color-surface-elevated)',
            color: 'var(--color-text-muted)',
          }}
        >
          Last 7 Days
        </div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorMinutes" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-primary)"
                  stopOpacity={0.4}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-primary)"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
            <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
            <YAxis
              stroke="#64748b"
              fontSize={12}
              tickFormatter={(value) => {
                if (value === 0) return '0m';
                const h = Math.floor(value / 60);
                const m = value % 60;
                if (h === 0) return `${m}m`;
                return m === 0 ? `${h}h` : `${h}h${m}m`;
              }}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              formatter={(value: any) => [formatDuration(value * 60), 'Watch Time']}
            />
            <Area
              type="monotone"
              dataKey="minutes"
              stroke="var(--color-primary)"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorMinutes)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
});

// Content Breakdown Chart Component
const ContentBreakdownChart = memo(function ContentBreakdownChart({
  data,
}: {
  data: Array<{ date: string; movies: number; series: number }>;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
      className="p-6 rounded-xl"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-surface-border)',
      }}
    >
      <div className="flex items-center justify-between mb-6">
        <h3
          className="text-lg font-semibold"
          style={{ color: 'var(--color-text)' }}
        >
          Content Breakdown
        </h3>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
            <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
            <YAxis stroke="#64748b" fontSize={12} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
            />
            <Bar dataKey="movies" fill="var(--color-primary)" radius={[4, 4, 0, 0]} name="Movies" />
            <Bar dataKey="series" fill="var(--color-secondary)" radius={[4, 4, 0, 0]} name="Series" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t" style={{ borderColor: 'var(--color-surface-border)' }}>
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-full"
            style={{ background: 'var(--color-primary)' }}
          />
          <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Movies
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-full"
            style={{ background: 'var(--color-secondary)' }}
          />
          <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Series
          </span>
        </div>
      </div>
    </motion.div>
  );
});

// Activity Card Component - matches admin design
const ActivityCard = memo(function ActivityCard({
  session,
  userInfo,
  onFilterByContent,
}: {
  session: WatchSession;
  userInfo: any;
  onFilterByContent?: (name: string) => void;
}) {
  const [imageError, setImageError] = useState(false);
  const timestamp = new Date(session.startTime);
  const endTime = session.endTime ? new Date(session.endTime) : undefined;

  return (
    <motion.div
      whileHover={{ x: 4 }}
      className="flex items-start gap-4 p-4 rounded-xl transition-colors"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-surface-border)',
      }}
    >
      {/* Poster or icon */}
      {session.poster && !imageError ? (
        <button
          type="button"
          className="w-12 h-16 rounded-lg overflow-hidden shrink-0"
          style={{ background: 'var(--color-surface-elevated)', border: '1px solid var(--color-surface-border)' }}
          onClick={() => onFilterByContent?.(session.itemName)}
        >
          <img
            src={session.poster}
            alt={session.itemName}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        </button>
      ) : (
        <button
          type="button"
          className="p-2 rounded-lg"
          style={{ background: 'var(--color-primary-muted)', color: 'var(--color-primary)' }}
          onClick={() => onFilterByContent?.(session.itemName)}
        >
          {session.itemType === 'movie' ? (
            <FilmIcon className="w-4 h-4" />
          ) : (
            <TvIcon className="w-4 h-4" />
          )}
        </button>
      )}

      {/* User avatar */}
      <Avatar
        name={userInfo?.username || 'You'}
        email={userInfo?.email}
        colorIndex={userInfo?.colorIndex || 0}
        size="sm"
      />

      {/* Activity details */}
      <div className="flex-1 min-w-0">
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          <span className="font-medium" style={{ color: 'var(--color-text)' }}>
            {userInfo?.username || 'You'}
          </span>{' '}
          watched
        </p>

        {/* Content info */}
        <div className="flex items-center gap-2 mt-1">
          {session.itemType === 'movie' ? (
            <FilmIcon className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />
          ) : (
            <TvIcon className="w-4 h-4" style={{ color: '#10b981' }} />
          )}
          <button
            type="button"
            onClick={() => onFilterByContent?.(session.itemName)}
            className="font-medium text-left transition-colors hover:opacity-80"
            style={{ color: 'var(--color-text)' }}
          >
            {session.itemName}
            {session.itemType === 'series' && session.episode !== undefined && session.episode > 0 && (
              <span className="ml-1" style={{ color: 'var(--color-text-muted)' }}>
                {session.season !== undefined && session.season > 0 ? `S${String(session.season).padStart(2, '0')}E` : 'E'}
                {String(session.episode).padStart(2, '0')}
              </span>
            )}
          </button>
        </div>

        {/* Session meta: duration & start/end time */}
        <div className="mt-3 flex items-center gap-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          <ClockIcon className="w-3 h-3" />
          {!session.isSynthetic && session.durationSeconds !== undefined && (
            <span>
              {session.durationSeconds > 0 ? formatDuration(session.durationSeconds) : '<1m'}
            </span>
          )}
          {!session.isSynthetic && session.durationSeconds !== undefined && <span className="mx-1">•</span>}
          <span>{formatTime(timestamp)}</span>
          {endTime && !session.isSynthetic && (
            <>
              <span className="mx-1">→</span>
              <span>{formatTime(endTime)}</span>
            </>
          )}
        </div>
      </div>

      {/* Timestamp */}
      <div className="text-right">
        <p className="text-xs" style={{ color: 'var(--color-text-subtle)' }}>{formatTimestamp(timestamp)}</p>
      </div>
    </motion.div>
  );
});

// Grid view activity card - Cinematic poster design (matches admin)
const ActivityCardGrid = memo(function ActivityCardGrid({
  session,
  onFilterByContent,
}: {
  session: WatchSession;
  onFilterByContent?: (name: string) => void;
}) {
  const [imageError, setImageError] = useState(false);
  const timestamp = new Date(session.startTime);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -4 }}
      className="group relative cursor-pointer"
    >
      {/* Poster Card */}
      <div
        className="relative aspect-[2/3] rounded-xl overflow-hidden shadow-xl"
        style={{ background: 'var(--color-surface-elevated)' }}
      >
        {session.poster && !imageError ? (
          <>
            <img
              src={session.poster}
              alt={session.itemName}
              className="w-full h-full object-cover transition-all duration-700 group-hover:scale-110"
              onError={() => setImageError(true)}
            />
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-40 group-hover:opacity-60 transition-opacity" />
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {session.itemType === 'movie' ? (
              <FilmIcon className="w-12 h-12" style={{ color: 'var(--color-text-subtle)' }} />
            ) : (
              <TvIcon className="w-12 h-12" style={{ color: 'var(--color-text-subtle)' }} />
            )}
          </div>
        )}

        {/* Session duration badge - top left */}
        {!session.isSynthetic && session.durationSeconds !== undefined && session.durationSeconds > 0 && (
          <div className="absolute top-2 left-2">
            <div
              className="px-2 py-1 rounded-md text-xs font-medium shadow-lg"
              style={{ background: 'var(--color-primary-muted)', color: 'var(--color-primary)' }}
            >
              {formatDuration(session.durationSeconds)}
            </div>
          </div>
        )}
      </div>

      {/* Content Info - Below the poster */}
      <div className="mt-2 space-y-0.5 text-center">
        {/* Content title */}
        <button
          type="button"
          onClick={() => onFilterByContent?.(session.itemName)}
          className="block w-full"
        >
          <h4 className="font-semibold text-sm leading-tight line-clamp-2" style={{ color: 'var(--color-text-muted)' }}>
            {session.itemName}
          </h4>
        </button>

        {/* Episode info for series */}
        {session.itemType === 'series' && session.episode !== undefined && session.episode > 0 && (
          <p className="text-xs font-medium" style={{ color: 'var(--color-text-subtle)' }}>
            {session.season !== undefined && session.season > 0 ? `Season ${session.season}, ` : ''}
            Episode {session.episode}
          </p>
        )}

        {/* Timestamp */}
        <div className="flex items-center justify-center text-xs" style={{ color: 'var(--color-text-subtle)' }}>
          <span>
            {timestamp.toLocaleDateString('en-GB', {
              day: '2-digit',
              month: 'short',
              year: 'numeric'
            }).replace(/ /g, ' ')} {formatTime(timestamp)}
          </span>
        </div>
      </div>
    </motion.div>
  );
});

export default function UserActivityPage() {
  const { userId, userInfo } = useUserAuth();
  const { authKey, isReady } = useUserAuthHeaders();
  const [activityData, setActivityData] = useState<UserActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [isLoaded, setIsLoaded] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());

  // Load view mode preference
  useEffect(() => {
    const saved = localStorage.getItem('user-activity-view-mode');
    if (saved === 'list' || saved === 'grid') {
      setViewMode(saved);
    }
    setIsLoaded(true);
  }, []);

  // Save view mode preference
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('user-activity-view-mode', viewMode);
    }
  }, [viewMode, isLoaded]);

  // Fetch activity data with polling
  useEffect(() => {
    if (!isReady || !userId) return;

    const fetchData = async (isPolling = false) => {
      // Only show loading on initial fetch
      if (!isPolling) setLoading(true);
      setError(null);
      try {
        const result = await userActivity.getActivity(userId, authKey || undefined, 200);
        setActivityData(result);
      } catch (err: any) {
        console.error('Failed to load activity data:', err);
        // Only set error if we don't have data yet
        if (!isPolling) setError(err.message || 'Failed to load activity');
      } finally {
        if (!isPolling) setLoading(false);
      }
    };

    fetchData(false);

    // Poll every 30 seconds
    const interval = setInterval(() => fetchData(true), 30000);
    return () => clearInterval(interval);
  }, [userId, authKey, isReady]);

  // Tick every second for live now-playing duration
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Filter sessions by search
  const filteredSessions = useMemo(() => {
    if (!activityData?.sessions) return [];
    
    // Filter out active sessions (show only completed) and sessions with no duration
    let sessions = activityData.sessions.filter(s => !s.isActive && s.endTime && (s.durationSeconds || 0) > 0);
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      sessions = sessions.filter(s => 
        s.itemName.toLowerCase().includes(query) ||
        s.username.toLowerCase().includes(query)
      );
    }
    
    return sessions;
  }, [activityData, searchQuery]);

  // Group sessions by date
  const groupedSessions = useMemo(() => {
    const groups = new Map<string, WatchSession[]>();

    for (const session of filteredSessions) {
      const dateKey = getDateKey(new Date(session.startTime));
      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)!.push(session);
    }

    const today = new Date();
    const todayKey = getDateKey(today);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = getDateKey(yesterday);

    return Array.from(groups.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([dateKey, sessions]) => {
        const totalDuration = sessions.reduce((sum, s) => sum + (s.durationSeconds || 0), 0);
        return {
          dateKey,
          label: formatDateHeader(dateKey),
          sessions,
          totalDuration,
          isToday: dateKey === todayKey,
          isYesterday: dateKey === yesterdayKey,
        };
      });
  }, [filteredSessions]);

  // Stats from API
  const stats = activityData?.stats;
  const chartData = activityData?.watchTimeByDay || [];
  const nowPlaying = activityData?.nowPlaying || [];

  // Live total watch time: completed sessions + elapsed now-playing time
  const liveTotalWatchTimeHours = useMemo(() => {
    let totalSeconds = (stats?.totalWatchTimeSeconds || 0);
    for (const np of nowPlaying) {
      if (np.startTime) {
        const startMs = new Date(np.startTime).getTime();
        if (!isNaN(startMs)) {
          totalSeconds += Math.max(0, (nowTick - startMs) / 1000);
        }
      }
    }
    return totalSeconds / 3600;
  }, [stats, nowPlaying, nowTick]);

  const handleFilterByContent = useCallback((name: string) => {
    setSearchQuery(name);
  }, []);

  return (
    <div className="p-8">
      <UserPageHeader
        title="Activity"
        subtitle="Your watch history and statistics"
      />

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div
            className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
            style={{
              borderColor: 'var(--color-primary)',
              borderTopColor: 'transparent',
            }}
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-4 rounded-xl text-center mb-6"
          style={{
            background: 'var(--color-error-muted)',
            color: 'var(--color-error)',
          }}
        >
          {error}
        </motion.div>
      )}

      {!loading && !error && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard
              label="Total Watch Time"
              value={formatHours(liveTotalWatchTimeHours)}
              icon={<ClockIcon className="w-5 h-5" />}
              color="var(--color-primary)"
              delay={0}
            />
            <StatCard
              label="Movies Watched"
              value={stats?.moviesCount || 0}
              icon={<FilmIcon className="w-5 h-5" />}
              color="#8b5cf6"
              delay={0.05}
            />
            <StatCard
              label="Series Watching"
              value={stats?.seriesCount || 0}
              icon={<TvIcon className="w-5 h-5" />}
              color="#10b981"
              delay={0.1}
            />
            <StatCard
              label="Watched Today"
              value={stats?.watchedTodayCount || 0}
              icon={<CheckCircleIcon className="w-5 h-5" />}
              color="#f59e0b"
              delay={0.15}
            />
          </div>

          {/* Now Playing Section */}
          {nowPlaying.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6"
            >
              <Card padding="md" className="border-2 border-primary/30 bg-primary/5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-primary/10 flex items-center justify-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
                    </div>
                    <h2 className="text-lg font-semibold text-default font-display">Now Playing</h2>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    <span>Live</span>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {nowPlaying.map((np, idx) => (
                    <motion.div
                      key={`now-${idx}`}
                      className="flex items-center gap-3 p-3 rounded-xl bg-surface-hover hover:bg-surface border border-default hover:border-primary/50 transition-colors"
                    >
                      {/* Poster */}
                      {np.item.poster ? (
                        <div className="w-10 h-14 rounded-lg overflow-hidden shrink-0 bg-surface-hover">
                          <img src={np.item.poster} alt={np.item.name} className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-10 h-14 rounded-lg bg-surface-hover flex items-center justify-center shrink-0">
                          {np.item.type === 'movie' ? (
                            <FilmIcon className="w-5 h-5 text-muted" />
                          ) : (
                            <TvIcon className="w-5 h-5 text-muted" />
                          )}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate text-default">
                          {np.item.name}
                        </p>
                        <div className="text-xs text-muted truncate">
                          {np.item.type === 'series' && np.item.episode !== undefined && np.item.episode > 0 ? (
                            <span>
                              {np.item.season !== undefined && np.item.season > 0 ? `S${String(np.item.season).padStart(2, '0')}E` : 'E'}
                              {String(np.item.episode).padStart(2, '0')}
                            </span>
                          ) : (
                            <span className="capitalize">{np.item.type}</span>
                          )}
                        </div>
                        {/* Live duration calculation */}
                        {(() => {
                          if (np.startTime) {
                            const startMs = new Date(np.startTime).getTime();
                            if (!isNaN(startMs)) {
                              const elapsedSeconds = Math.max(0, Math.floor((nowTick - startMs) / 1000));
                              if (elapsedSeconds > 0) {
                                return (
                                  <p className="text-xs text-subtle mt-0.5">
                                    Watching for {formatDuration(elapsedSeconds)}
                                  </p>
                                                              );
                                                            }
                                                          }
                                                        }
                                                        return null;
                                                      })()}
                                                    </div>
                                                  </motion.div>
                                                ))}
                                              </div>
                                            </Card>            </motion.div>
          )}

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <WatchTimeChart data={chartData} />
            <ContentBreakdownChart data={chartData} />
          </div>

          {/* Search and View Toggle */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="flex items-center justify-between gap-4 mb-6"
          >
            <div className="relative flex-1 max-w-sm">
              <MagnifyingGlassIcon
                className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5"
                style={{ color: 'var(--color-text-muted)' }}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search content..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm"
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-surface-border)',
                  color: 'var(--color-text)',
                }}
              />
            </div>
            <ViewModeToggle
              mode={viewMode}
              onChange={(mode) => setViewMode(mode)}
            />
          </motion.div>

          {/* Activity Feed - Grouped by Date */}
          <div className="space-y-6">
            {groupedSessions.map((group, groupIndex) => (
              <motion.div
                key={group.dateKey}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + groupIndex * 0.02 }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <CalendarIcon
                    className="w-5 h-5"
                    style={{ color: group.isToday ? '#10b981' : group.isYesterday ? 'var(--color-text-muted)' : 'var(--color-text-subtle)' }}
                  />
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
                      {group.label}
                    </h2>
                    <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                      • {formatHours(group.totalDuration / 3600)}
                      <span className="ml-1 opacity-70">({group.sessions.length})</span>
                    </span>
                  </div>
                </div>

                {viewMode === 'grid' ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
                    {group.sessions.map((session) => (
                      <ActivityCardGrid
                        key={session.id}
                        session={session}
                        onFilterByContent={handleFilterByContent}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {group.sessions.map((session) => (
                      <ActivityCard
                        key={session.id}
                        session={session}
                        userInfo={userInfo}
                        onFilterByContent={handleFilterByContent}
                      />
                    ))}
                  </div>
                )}
              </motion.div>
            ))}

            {/* Empty state */}
            {filteredSessions.length === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-16 rounded-xl"
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-surface-border)',
                }}
              >
                <ClockIcon
                  className="w-16 h-16 mx-auto mb-4"
                  style={{ color: 'var(--color-text-subtle)' }}
                />
                <h3
                  className="text-lg font-semibold mb-2"
                  style={{ color: 'var(--color-text)' }}
                >
                  {searchQuery ? 'No matching activity' : 'No activity yet'}
                </h3>
                <p style={{ color: 'var(--color-text-muted)' }}>
                  {searchQuery
                    ? `No activity matches "${searchQuery}". Try a different search term.`
                    : 'Start watching content on Stremio to see activity here'}
                </p>
              </motion.div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
