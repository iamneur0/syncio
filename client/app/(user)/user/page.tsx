'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  ClockIcon, 
  FireIcon,
  FilmIcon,
  TvIcon,
  PlayIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ExclamationCircleIcon,
  TrophyIcon,
} from '@heroicons/react/24/outline';
import { useUserAuth, useUserAuthHeaders } from '@/lib/hooks/useUserAuth';
import { UserPageHeader } from '@/components/user/UserPageContainer';
import { Avatar } from '@/components/ui';
import { userActivity, userSync, UserActivityData, AtRiskStatus } from '@/lib/user-api';

// Format watch time from seconds to human-readable
function formatWatchTime(seconds: number): string {
  if (seconds < 60) return '<1m';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

// Format duration in a more compact way for stats
function formatDuration(seconds: number): string {
  if (seconds < 60) return '<1m';
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

// Stat Card Component
interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color?: string;
  delay?: number;
}

function StatCard({ label, value, icon, color = 'var(--color-primary)', delay = 0 }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="p-4 rounded-xl"
      style={{ 
        background: 'var(--color-surface)',
        border: '1px solid var(--color-surface-border)'
      }}
    >
      <div className="flex items-center gap-3">
        <div 
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ background: `${color}20`, color }}
        >
          {icon}
        </div>
        <div>
          <p 
            className="text-2xl font-bold"
            style={{ color: 'var(--color-text)' }}
          >
            {value}
          </p>
          <p 
            className="text-xs"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {label}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

export default function UserHomePage() {
  const { userId, userInfo } = useUserAuth();
  const { authKey, isReady } = useUserAuthHeaders();
  
  const [activityData, setActivityData] = useState<UserActivityData | null>(null);
  const [atRiskStatus, setAtRiskStatus] = useState<AtRiskStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Fetch activity data and at-risk status
  useEffect(() => {
    if (!isReady || !userId) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        // Fetch activity and risk status in parallel, but handle failures gracefully
        const [activityResult, riskResult] = await Promise.allSettled([
          userActivity.getActivity(userId, authKey || undefined),
          userSync.getAtRiskStatus(userId),
        ]);
        
        if (activityResult.status === 'fulfilled') {
          setActivityData(activityResult.value);
        } else {
          console.error('Failed to load activity:', activityResult.reason);
          // Set error only if activity fails - this is the main data
          setError(activityResult.reason?.message || 'Failed to load activity data');
        }
        
        if (riskResult.status === 'fulfilled') {
          setAtRiskStatus(riskResult.value);
        } else {
          console.error('Failed to load risk status:', riskResult.reason);
          // Don't set error for risk status - it's optional
        }
      } catch (err: any) {
        console.error('Failed to load data:', err);
        setError(err?.message || 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [userId, authKey, isReady]);

  // Handle sync
  const handleSync = async () => {
    if (!userId || syncing) return;
    
    setSyncing(true);
    setSyncMessage(null);
    try {
      const result = await userSync.sync(userId, authKey || undefined);
      setSyncMessage(result.success ? 'Sync completed!' : result.message || 'Sync failed');
      
      // Refresh at-risk status after sync
      const riskStatus = await userSync.getAtRiskStatus(userId);
      setAtRiskStatus(riskStatus);
    } catch (err: any) {
      setSyncMessage(err.message || 'Sync failed');
    } finally {
      setSyncing(false);
      // Clear message after 3 seconds
      setTimeout(() => setSyncMessage(null), 3000);
    }
  };

  // Get risk badge color and icon
  const getRiskBadge = () => {
    if (!atRiskStatus) return null;
    
    if (atRiskStatus.riskLevel === 'critical') {
      return {
        color: 'var(--color-error)',
        bg: 'var(--color-error-muted)',
        icon: <ExclamationCircleIcon className="w-4 h-4" />,
        text: 'At Risk',
      };
    }
    if (atRiskStatus.riskLevel === 'warning') {
      return {
        color: 'var(--color-warning)',
        bg: 'var(--color-warning-muted)',
        icon: <ExclamationTriangleIcon className="w-4 h-4" />,
        text: 'Warning',
      };
    }
    return {
      color: 'var(--color-success)',
      bg: 'var(--color-success-muted)',
      icon: <CheckCircleIcon className="w-4 h-4" />,
      text: 'Healthy',
    };
  };

  const riskBadge = getRiskBadge();
  const stats = activityData?.stats;

  return (
    <div className="p-8">
      <UserPageHeader 
        title={`Welcome back, ${userInfo?.username || 'User'}!`}
        subtitle="Here's your activity overview"
      />

      {/* Profile Card with Sync Button and Risk Badge */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-6 rounded-xl mb-8"
        style={{ 
          background: 'var(--color-surface)',
          border: '1px solid var(--color-surface-border)'
        }}
      >
        <div className="flex items-center gap-6">
          <Avatar 
            name={userInfo?.username || 'User'}
            email={userInfo?.email}
            colorIndex={userInfo?.colorIndex || 0}
            size="xl"
            showRing
            className="w-20 h-20"
          />
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <h2 
                className="text-xl font-bold"
                style={{ color: 'var(--color-text)' }}
              >
                {userInfo?.username}
              </h2>
              
              {/* Risk Badge */}
              {riskBadge && (
                <div 
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                  style={{ background: riskBadge.bg, color: riskBadge.color }}
                  title={atRiskStatus?.riskReason || undefined}
                >
                  {riskBadge.icon}
                  <span>{riskBadge.text}</span>
                </div>
              )}
            </div>
            <p 
              className="text-sm"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {userInfo?.email}
            </p>
            {userInfo?.groupName && (
              <p 
                className="text-sm mt-1"
                style={{ color: 'var(--color-text-subtle)' }}
              >
                Group: {userInfo.groupName}
              </p>
            )}
          </div>
          
          {/* Sync Button */}
          <div className="flex flex-col items-end gap-2">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all hover:opacity-90 disabled:opacity-50"
              style={{ 
                background: 'var(--color-primary)',
                color: 'white'
              }}
            >
              <ArrowPathIcon className={`w-5 h-5 ${syncing ? 'animate-spin' : ''}`} />
              <span>{syncing ? 'Syncing...' : 'Sync Now'}</span>
            </button>
            {syncMessage && (
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-xs"
                style={{ color: syncMessage.includes('completed') ? 'var(--color-success)' : 'var(--color-error)' }}
              >
                {syncMessage}
              </motion.p>
            )}
            {atRiskStatus?.lastSyncedAt && (
              <p 
                className="text-xs"
                style={{ color: 'var(--color-text-subtle)' }}
              >
                Last sync: {new Date(atRiskStatus.lastSyncedAt).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      </motion.div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div
            className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }}
          />
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-6 rounded-xl text-center"
          style={{ 
            background: 'var(--color-error-muted)',
            border: '1px solid var(--color-error)'
          }}
        >
          <ExclamationCircleIcon 
            className="w-12 h-12 mx-auto mb-3"
            style={{ color: 'var(--color-error)' }}
          />
          <h3 
            className="text-lg font-semibold mb-2"
            style={{ color: 'var(--color-error)' }}
          >
            Failed to load activity data
          </h3>
          <p 
            className="text-sm mb-4"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {error}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-lg font-medium transition-all hover:opacity-90"
            style={{ 
              background: 'var(--color-primary)',
              color: 'white'
            }}
          >
            Try Again
          </button>
        </motion.div>
      )}

      {/* Stats Grid */}
      {!loading && !error && stats && (
        <>
          <motion.h3
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-lg font-semibold mb-4"
            style={{ color: 'var(--color-text)' }}
          >
            Today's Activity
          </motion.h3>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard
              label="Watch Time Today"
              value={formatWatchTime(stats.watchTimeTodaySeconds)}
              icon={<ClockIcon className="w-5 h-5" />}
              color="var(--color-primary)"
              delay={0.15}
            />
            <StatCard
              label="Watched Today"
              value={stats.watchedTodayCount}
              icon={<PlayIcon className="w-5 h-5" />}
              color="#3b82f6"
              delay={0.2}
            />
            <StatCard
              label="Current Streak"
              value={`${stats.currentStreak} ${stats.currentStreak === 1 ? 'day' : 'days'}`}
              icon={<FireIcon className="w-5 h-5" />}
              color="#f59e0b"
              delay={0.25}
            />
            <StatCard
              label="Avg Watch Time"
              value={formatWatchTime(stats.avgWatchTimeSeconds)}
              icon={<ClockIcon className="w-5 h-5" />}
              color="#10b981"
              delay={0.3}
            />
          </div>

          <motion.h3
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
            className="text-lg font-semibold mb-4"
            style={{ color: 'var(--color-text)' }}
          >
            All Time Stats
          </motion.h3>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard
              label="Total Watch Time"
              value={formatWatchTime(stats.totalWatchTimeSeconds)}
              icon={<ClockIcon className="w-5 h-5" />}
              color="#8b5cf6"
              delay={0.4}
            />
            <StatCard
              label="Movies Watched"
              value={stats.moviesCount}
              icon={<FilmIcon className="w-5 h-5" />}
              color="#ec4899"
              delay={0.45}
            />
            <StatCard
              label="Series Watched"
              value={stats.seriesCount}
              icon={<TvIcon className="w-5 h-5" />}
              color="#14b8a6"
              delay={0.5}
            />
            <StatCard
              label="Longest Streak"
              value={`${stats.longestStreak} ${stats.longestStreak === 1 ? 'day' : 'days'}`}
              icon={<TrophyIcon className="w-5 h-5" />}
              color="#f59e0b"
              delay={0.55}
            />
          </div>

          {/* Most Watched & Binge Watches */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Most Watched */}
            {activityData?.mostWatched && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="p-5 rounded-xl"
                style={{ 
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-surface-border)'
                }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <TrophyIcon className="w-5 h-5" style={{ color: 'var(--color-warning)' }} />
                  <h3 className="font-semibold" style={{ color: 'var(--color-text)' }}>
                    Most Watched
                  </h3>
                </div>
                <div className="flex items-center gap-4">
                  {activityData.mostWatched.poster ? (
                    <img 
                      src={activityData.mostWatched.poster} 
                      alt={activityData.mostWatched.name}
                      className="w-16 h-24 rounded-lg object-cover"
                    />
                  ) : (
                    <div 
                      className="w-16 h-24 rounded-lg flex items-center justify-center"
                      style={{ background: 'var(--color-surface-elevated)' }}
                    >
                      {activityData.mostWatched.type === 'movie' ? (
                        <FilmIcon className="w-8 h-8" style={{ color: 'var(--color-text-subtle)' }} />
                      ) : (
                        <TvIcon className="w-8 h-8" style={{ color: 'var(--color-text-subtle)' }} />
                      )}
                    </div>
                  )}
                  <div>
                    <p className="font-medium" style={{ color: 'var(--color-text)' }}>
                      {activityData.mostWatched.name}
                    </p>
                    <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
                      {activityData.mostWatched.count} {activityData.mostWatched.count === 1 ? 'session' : 'sessions'}
                    </p>
                    <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                      {formatDuration(activityData.mostWatched.totalDuration)} total
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Binge Watches */}
            {activityData?.bingeWatches && activityData.bingeWatches.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.65 }}
                className="p-5 rounded-xl"
                style={{ 
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-surface-border)'
                }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <FireIcon className="w-5 h-5" style={{ color: 'var(--color-error)' }} />
                  <h3 className="font-semibold" style={{ color: 'var(--color-text)' }}>
                    Recent Binge Watches
                  </h3>
                </div>
                <div className="space-y-3">
                  {activityData.bingeWatches.slice(0, 3).map((binge, index) => (
                    <div key={index} className="flex items-center gap-3">
                      {binge.poster ? (
                        <img 
                          src={binge.poster} 
                          alt={binge.name}
                          className="w-10 h-14 rounded object-cover"
                        />
                      ) : (
                        <div 
                          className="w-10 h-14 rounded flex items-center justify-center"
                          style={{ background: 'var(--color-surface-elevated)' }}
                        >
                          <TvIcon className="w-5 h-5" style={{ color: 'var(--color-text-subtle)' }} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>
                          {binge.name}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          {binge.episodeCount} episodes in one day
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </div>

          {/* Now Playing */}
          {activityData?.nowPlaying && activityData.nowPlaying.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className="mt-6 p-5 rounded-xl"
              style={{ 
                background: 'var(--color-surface)',
                border: '2px solid var(--color-secondary)',
              }}
            >
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                <h3 className="font-semibold" style={{ color: 'var(--color-text)' }}>
                  Now Playing
                </h3>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {activityData.nowPlaying.map((np, index) => (
                  <div 
                    key={index} 
                    className="flex items-center gap-3 p-3 rounded-lg"
                    style={{ background: 'var(--color-surface-elevated)' }}
                  >
                    {np.item.poster ? (
                      <img 
                        src={np.item.poster} 
                        alt={np.item.name}
                        className="w-10 h-14 rounded object-cover"
                      />
                    ) : (
                      <div 
                        className="w-10 h-14 rounded flex items-center justify-center"
                        style={{ background: 'var(--color-surface)' }}
                      >
                        {np.item.type === 'movie' ? (
                          <FilmIcon className="w-5 h-5" style={{ color: 'var(--color-text-subtle)' }} />
                        ) : (
                          <TvIcon className="w-5 h-5" style={{ color: 'var(--color-text-subtle)' }} />
                        )}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>
                        {np.item.name}
                      </p>
                      {np.item.type === 'series' && np.item.episode && (
                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          {np.item.season ? `S${np.item.season}E${np.item.episode}` : `E${np.item.episode}`}
                        </p>
                      )}
                    </div>
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </>
      )}

      {/* Empty state */}
      {!loading && !error && !stats && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-20"
        >
          <ClockIcon
            className="w-16 h-16 mx-auto mb-4"
            style={{ color: 'var(--color-text-subtle)' }}
          />
          <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-text)' }}>
            No activity data yet
          </h3>
          <p style={{ color: 'var(--color-text-muted)' }}>
            Start watching content on Stremio to see your stats here
          </p>
        </motion.div>
      )}
    </div>
  );
}
