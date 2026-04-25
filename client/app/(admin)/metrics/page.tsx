'use client';

import { useState, memo, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Header } from '@/components/layout/Header';
import { Card, StatCard, Badge, UserAvatar, PageToolbar } from '@/components/ui';
import { PageSection, StaggerContainer, StaggerItem } from '@/components/layout/PageContainer';
import { api, MetricsData, AtRiskUser } from '@/lib/api';
import {
  AlertBanner,
  UserLifecycleCard,
  HourlyHeatmap,
  AtRiskUsersTable,
  AddonPerformanceCard,
  ServerHealthDashboard,
  UserStreaksList,
  TopItemsSection,
  BingeWatchesSection,
} from '@/components/admin';
import {
  ChartBarIcon,
  ClockIcon,
  FilmIcon,
  TvIcon,
  FireIcon,
  TrophyIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  CalendarIcon,
  UsersIcon,
  PlayIcon,
  ExclamationTriangleIcon,
  ServerIcon,
  PuzzlePieceIcon,
} from '@heroicons/react/24/outline';
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

// Period options for filtering
const PERIOD_OPTIONS = [
  { value: 'all', label: 'All Time' },
  { value: '1h', label: '1 Hour' },
  { value: '24h', label: '24 Hours' },
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: '90d', label: '90 Days' },
  { value: '1y', label: '1 Year' },
];

// Helper function to format minutes
function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return `${days}d ${remainingHours}h`;
}

// Hoisted tooltip style - uses CSS variable compatible colors
const TOOLTIP_STYLE = {
  backgroundColor: 'rgba(20, 20, 35, 0.95)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '12px',
  backdropFilter: 'blur(12px)',
} as const;

const TOOLTIP_LABEL_STYLE = { color: '#fff' } as const;

// Memoized chart component
const WatchTimeChart = memo(function WatchTimeChart({ data }: { data: Array<{ date: string; hours: number }> }) {
  // Calculate max hours to determine ticks dynamically or use a fixed set if small
  const maxHours = Math.max(...data.map(d => d.hours), 1);
  const tickCount = Math.ceil(maxHours / 0.5);
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => i * 0.5);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <defs>
          <linearGradient id="colorWatchTime" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-chart-1)" stopOpacity={0.4} />
            <stop offset="95%" stopColor="var(--color-chart-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
        <XAxis 
          dataKey="date" 
          stroke="#64748b" 
          fontSize={12}
          tickFormatter={(value) => {
            const date = new Date(value);
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          }}
        />
        <YAxis 
          stroke="#64748b" 
          fontSize={12}
          ticks={ticks}
          tickFormatter={(value) => {
            if (value === 0) return '0m';
            const h = Math.floor(value);
            const m = Math.round((value - h) * 60);
            if (h === 0) return `${m}m`;
            return m === 0 ? `${h}h` : `${h}h${m}m`;
          }}
        />
        <Tooltip 
          contentStyle={TOOLTIP_STYLE} 
          labelStyle={TOOLTIP_LABEL_STYLE}
          labelFormatter={(value) => {
            const date = new Date(value);
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          }}
          formatter={(value: any) => [formatMinutes(Math.round(value * 60)), 'Time']}
        />
        <Area
          type="monotone"
          dataKey="hours"
          stroke="var(--color-chart-1)"
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#colorWatchTime)"
          isAnimationActive={false} // Disable animation to prevent blinking during updates
        />
      </AreaChart>
    </ResponsiveContainer>
  );
});

const ContentBreakdownChart = memo(function ContentBreakdownChart({ data }: { data: Array<{ date: string; movies: number; series: number }> }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
        <XAxis 
          dataKey="date" 
          stroke="#64748b" 
          fontSize={12}
          tickFormatter={(value) => {
            const date = new Date(value);
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          }}
        />
        <YAxis stroke="#64748b" fontSize={12} />
        <Tooltip 
          contentStyle={TOOLTIP_STYLE} 
          labelStyle={TOOLTIP_LABEL_STYLE}
          labelFormatter={(value) => {
            const date = new Date(value);
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          }}
        />
        <Bar dataKey="movies" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} name="Movies" />
        <Bar dataKey="series" fill="var(--color-chart-2)" radius={[4, 4, 0, 0]} name="Series" />
      </BarChart>
    </ResponsiveContainer>
  );
});

export default function MetricsPage() {
  const [period, setPeriod] = useState('30d');
  const [viewMode, setViewMode] = useState<'users' | 'content' | 'admin'>('users');
  const [metricsData, setMetricsData] = useState<MetricsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [selectedUser, setSelectedUser] = useState<AtRiskUser | null>(null);

  // Fetch metrics data
  useEffect(() => {
    setIsLoading(true);
    setError(null);
    api.getMetrics(period)
      .then((data) => {
        console.log('[Metrics] API response:', data)
        console.log('[Metrics] watchActivity:', data.watchActivity)
        console.log('[Metrics] watchActivity.byDay:', data.watchActivity?.byDay)
        setMetricsData(data);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err);
        setIsLoading(false);
      });
  }, [period]);

  // Transform watch time data for chart
  const watchTimeChartData = useMemo(() => {
    if (!metricsData?.watchTime?.byDay) return [];
    return metricsData.watchTime.byDay.map((item) => ({
      date: item.date,
      hours: item.hours,
    }));
  }, [metricsData]);

  // Transform content breakdown data for chart - calculated from watchSessions for accuracy
  const contentBreakdownData = useMemo(() => {
    if (!metricsData?.watchActivity?.byDay || metricsData.watchActivity.byDay.length === 0) {
      return [];
    }
    
    // Use watchSessions to get actual counts (movies watched and episodes watched)
    // instead of unique series count from the API
    return metricsData.watchActivity.byDay.map((item) => {
      const dateStr = item.date;
      
      // If we have watchSessions, calculate actual counts from them
      if (metricsData.watchSessions && metricsData.watchSessions.length > 0) {
        const sessionsForDate = metricsData.watchSessions.filter((session) => {
          const sessionDate = new Date(session.startTime).toLocaleDateString('sv-SE');
          return sessionDate === dateStr;
        });
        
        const movieCount = sessionsForDate.filter((s) => s.item.type === 'movie').length;
        const seriesCount = sessionsForDate.filter((s) => s.item.type === 'series').length;
        
        return {
          date: dateStr,
          movies: movieCount,
          series: seriesCount,
        };
      }
      
      // Fallback to API data if no sessions available
      return {
        date: dateStr,
        movies: item.movies || 0,
        series: item.shows || 0,
      };
    });
  }, [metricsData]);

  // Transform top users data
  const topUsersData = useMemo(() => {
    if (!metricsData?.watchActivity?.byUser) return [];
    return metricsData.watchActivity.byUser
      .slice(0, 5)
      .map((user) => ({
        id: user.id,
        name: user.username,
        email: user.email,
        watchTime: Math.round(user.watchTimeHours * 60), // Convert to minutes
        movies: user.movies,
        series: user.shows,
        streak: user.streak || 0,
        trend: 'up' as const, // Trend calculation would need historical data
      }));
  }, [metricsData]);

  return (
    <>
      <Header
        title="Metrics"
        subtitle="Track watch time, content consumption, and user activity"
        actions={
          <div className="flex items-center gap-3">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="px-4 py-2 rounded-xl text-sm bg-surface border border-default text-default"
              aria-label="Select time period"
            >
              {PERIOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        }
      />

      <div className="p-8">
        {/* Admin Alerts */}
        {metricsData?.admin?.alerts && (
          <AlertBanner alerts={metricsData.admin.alerts} />
        )}

        {/* View Mode Toggle - Centered */}
        <PageSection className="mb-6">
          <PageToolbar
            animate={false}
            filterTabs={{
              options: [
                { key: 'users', label: 'Users', icon: <UsersIcon className="w-4 h-4" /> },
                { key: 'content', label: 'Content', icon: <PlayIcon className="w-4 h-4" /> },
                { key: 'admin', label: 'Admin', icon: <ServerIcon className="w-4 h-4" /> },
              ],
              activeKey: viewMode,
              onChange: (key) => setViewMode(key as 'users' | 'content' | 'admin'),
              layoutId: 'metrics-view-tabs',
            }}
          />
        </PageSection>

        {/* Users Tab - User Leaderboard + Streaks + Watch Time Trend */}
        {viewMode === 'users' && (
          <div className="space-y-6">
            {/* Stats Grid for Users Tab */}
            <PageSection className="mb-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                  label="Active Users"
                  value={isLoading ? '...' : (metricsData?.summary?.activeUsers || 0)}
                  icon={<UsersIcon className="w-6 h-6" />}
                  delay={0}
                />
                <StatCard
                  label="Avg Watch Time/User"
                  value={isLoading ? '...' : formatMinutes(Math.round(metricsData?.admin?.interestingMetrics?.avgWatchTimePerUser || 0))}
                  icon={<ClockIcon className="w-6 h-6" />}
                  delay={0.05}
                />
                <StatCard
                  label="At-Risk Users"
                  value={isLoading ? '...' : ((metricsData?.admin?.userLifecycle?.criticalRisk?.length || 0) + (metricsData?.admin?.userLifecycle?.atRisk?.length || 0))}
                  icon={<ExclamationTriangleIcon className="w-6 h-6" />}
                  delay={0.1}
                />
                <StatCard
                  label="Top Streaker"
                  value={isLoading ? '...' : (topUsersData.length > 0 ? `${topUsersData.reduce((max, u) => Math.max(max, u.streak), 0)} days` : '0 days')}
                  icon={<FireIcon className="w-6 h-6" />}
                  delay={0.15}
                />
              </div>
            </PageSection>

            {/* Top Row: Leaderboard + Streaks side by side */}
            <PageSection delay={0.25}>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* User Leaderboard */}
                <Card padding="lg">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <TrophyIcon className="w-6 h-6" />
                      <h3 className="text-lg font-semibold font-display text-default">User Leaderboard</h3>
                    </div>
                    <Badge variant="primary">Top 5</Badge>
                  </div>

                  <StaggerContainer className="space-y-3">
                    {topUsersData.length === 0 ? (
                      <div className="text-center py-8 text-sm text-muted">
                        {isLoading ? 'Loading...' : 'No user data available'}
                      </div>
                    ) : (
                      topUsersData.map((user, index) => (
                      <StaggerItem key={user.id}>
                        <motion.div
                          whileHover={{ x: 4 }}
                          className="flex items-center gap-4 p-4 rounded-xl transition-colors bg-surface-hover"
                        >
                          {/* Rank */}
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold"
                            style={{
                              background: index === 0
                                ? 'var(--color-warning-muted)'
                                : index === 1
                                ? 'rgba(148, 163, 184, 0.2)'
                                : index === 2
                                ? 'rgba(180, 83, 9, 0.2)'
                                : 'var(--color-surface-hover)',
                              color: index === 0
                                ? 'var(--color-warning)'
                                : index === 1
                                ? '#94a3b8'
                                : index === 2
                                ? '#b45309'
                                : 'var(--color-text-muted)'
                            }}
                          >
                            {index + 1}
                          </div>

                          {/* Avatar & Name */}
                          <UserAvatar userId={user.id} name={user.name} email={user.email} size="md" />
                          <div className="flex-1">
                            <p className="font-medium text-default">{user.name}</p>
                            <div className="flex items-center gap-4 text-sm text-muted">
                              <span className="flex items-center gap-1">
                                <FilmIcon className="w-4 h-4" />
                                {user.movies}
                              </span>
                              <span className="flex items-center gap-1">
                                <TvIcon className="w-4 h-4" />
                                {user.series}
                              </span>
                              <span className="flex items-center gap-1">
                                <FireIcon className="w-4 h-4" />
                                {user.streak} {user.streak === 1 ? 'day' : 'days'}
                              </span>
                            </div>
                          </div>

                          {/* Watch Time */}
                          <div className="text-right">
                            <p className="text-lg font-bold text-default">{formatMinutes(user.watchTime)}</p>
                            <div className="flex items-center justify-end gap-1 text-sm">
                              {user.trend === 'up' ? (
                                <>
                                  <ArrowTrendingUpIcon className="w-4 h-4 text-primary" />
                                  <span className="text-primary">Rising</span>
                                </>
                              ) : (
                                <>
                                  <ArrowTrendingDownIcon className="w-4 h-4" />
                                  <span>Falling</span>
                                </>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      </StaggerItem>
                      ))
                    )}
                  </StaggerContainer>
                </Card>

                {/* User Watch Streaks */}
                <Card padding="lg">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <FireIcon className="w-6 h-6" />
                      <h3 className="text-lg font-semibold font-display text-default">Watch Streaks</h3>
                    </div>
                  </div>
                  {topUsersData.length > 0 && (
                    <UserStreaksList 
                      users={topUsersData.map(u => ({ id: u.id, name: u.name, email: u.email }))} 
                    />
                  )}
                </Card>
              </div>
            </PageSection>

            {/* Watch Time Trend - Full width */}
            <PageSection delay={0.3}>
              <Card padding="lg">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-lg font-semibold font-display text-default">Watch Time Trend</h3>
                    <p className="text-sm text-muted">Daily watch time over the period</p>
                  </div>
                  {metricsData?.watchTime?.trend && metricsData.watchTime.trend.percentage > 0 && (
                    <Badge variant="primary">
                      {metricsData.watchTime.trend.direction === 'up' ? (
                        <ArrowTrendingUpIcon className="w-4 h-4 mr-1" />
                      ) : (
                        <ArrowTrendingDownIcon className="w-4 h-4 mr-1" />
                      )}
                      {metricsData.watchTime.trend.direction === 'up' ? '+' : '-'}{metricsData.watchTime.trend.percentage}%
                    </Badge>
                  )}
                </div>
                <div className="h-40 md:h-64">
                  {isLoading ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="flex items-center gap-2 text-sm text-muted">
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        <span>Loading...</span>
                      </div>
                    </div>
                  ) : watchTimeChartData.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-sm text-muted">
                      No data available
                    </div>
                  ) : (
                    <WatchTimeChart data={watchTimeChartData} />
                  )}
                </div>
              </Card>
            </PageSection>
          </div>
        )}

        {/* Content Tab - Top Content + Engagement + Top Items + Watch Velocity + Started Playing */}
        {viewMode === 'content' && (
          <div className="space-y-6">
            {/* Stats Grid for Content Tab */}
            <PageSection className="mb-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                  label="Movies Watched"
                  value={isLoading ? '...' : (metricsData?.summary?.totalMovies || 0)}
                  icon={<FilmIcon className="w-6 h-6" />}
                  delay={0}
                />
                <StatCard
                  label="Series Watched"
                  value={isLoading ? '...' : (metricsData?.summary?.totalShows || 0)}
                  icon={<TvIcon className="w-6 h-6" />}
                  delay={0.05}
                />
                <StatCard
                  label="Most Watched"
                  value={isLoading ? '...' : (() => {
                    const name = metricsData?.admin?.topItems?.series?.[0]?.name;
                    if (!name) return 'N/A';
                    return name.length > 15 ? name.substring(0, 15) + '...' : name;
                  })()}
                  icon={<TrophyIcon className="w-6 h-6" />}
                  delay={0.1}
                />
                <StatCard
                  label="Binge Sessions"
                  value={isLoading ? '...' : (metricsData?.admin?.interestingMetrics?.totalBingeSessions || 0)}
                  icon={<FireIcon className="w-6 h-6" />}
                  delay={0.15}
                />
              </div>
            </PageSection>

            {/* Top Row: Top Items + Watch Velocity side by side */}
            <PageSection delay={0.25}>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Most Watched Section */}
                <Card padding="lg">
                  <div className="flex items-center justify-between mb-6">
                                      <div className="flex items-center gap-3">
                                        <TrophyIcon className="w-6 h-6" />
                                        <h3 className="text-lg font-semibold font-display text-default">Most Watched</h3>
                                      </div>
                                    </div>
                                    {metricsData?.admin?.topItems ? (
                                      <TopItemsSection
                                        key={period} // Only force reset when period changes
                                        movies={metricsData.admin.topItems.movies}
                                        series={metricsData.admin.topItems.series}
                                      />
                                    ) : (
                                      <div className="text-center py-8 text-sm text-muted">No top items data available</div>
                                    )}
                                  </Card>
                    
                                  {/* Binge Watches Section */}
                                  <Card padding="lg">
                                    <div className="flex items-center justify-between mb-6">
                                      <div className="flex items-center gap-3">
                                        <FireIcon className="w-6 h-6" />
                                        <h3 className="text-lg font-semibold font-display text-default">Binge Watches</h3>
                                      </div>
                                    </div>
                                    {metricsData?.admin?.watchVelocity ? (
                                      <BingeWatchesSection 
                                        key={period}
                                        items={metricsData.admin.watchVelocity} 
                                      />
                                    ) : (
                                      <div className="text-center py-8 text-sm text-muted">No binge watch data available</div>
                                    )}
                                  </Card>
                                </div>
                              </PageSection>
            {/* Second Row: Engagement Patterns + Content Breakdown side by side */}
            <PageSection delay={0.3}>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Engagement Patterns */}
                <Card padding="lg">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold font-display text-default">Engagement Patterns</h3>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">Avg: {metricsData?.admin?.engagement?.averageSessionMinutes || 0} min</Badge>
                      <Badge variant="secondary">Binge: {metricsData?.admin?.engagement?.bingeSessions || 0}</Badge>
                    </div>
                  </div>
                  {metricsData?.admin?.engagement && (
                    <HourlyHeatmap
                      hourlyActivity={metricsData.admin.engagement.hourlyActivity}
                      peakHour={metricsData.admin.engagement.peakHour}
                    />
                  )}
                </Card>

                {/* Content Breakdown */}
                <Card padding="lg" className="flex flex-col">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-lg font-semibold font-display text-default">Content Breakdown</h3>
                      <p className="text-sm text-muted">Movies vs Series</p>
                    </div>
                  </div>
                  <div className="h-40 md:h-64">
                    {isLoading ? (
                      <div className="flex items-center justify-center h-full">
                        <div className="flex items-center gap-2 text-sm text-muted">
                          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          <span>Loading...</span>
                        </div>
                      </div>
                    ) : error ? (
                      <div className="flex items-center justify-center h-full text-sm text-muted">
                        Failed to load data
                      </div>
                    ) : contentBreakdownData.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-sm text-muted">
                        <p className="mb-2">No watch activity data</p>
                        <p className="text-xs opacity-70">
                          {metricsData?.watchActivity?.byDay 
                            ? "No activity in selected period" 
                            : "Loading data..."}
                        </p>
                      </div>
                    ) : (
                      <ContentBreakdownChart data={contentBreakdownData} />
                    )}
                  </div>
                  {/* Legend */}
                  <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t border-default">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ background: 'var(--color-chart-1)' }} />
                      <span className="text-sm text-muted">Movies</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ background: 'var(--color-chart-2)' }} />
                      <span className="text-sm text-muted">Series</span>
                    </div>
                  </div>
                </Card>
              </div>
            </PageSection>
          </div>
        )}

        {/* Admin Tab - All Admin Sections */}
        {viewMode === 'admin' && (
          <div className="space-y-6">
            {/* Stats Grid for Admin Tab */}
            <PageSection className="mb-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                  label="Most Active Hour"
                  value={isLoading ? '...' : `${metricsData?.admin?.interestingMetrics?.mostActiveHour || 0}:00`}
                  icon={<ClockIcon className="w-6 h-6" />}
                  delay={0}
                />
                <StatCard
                  label="Weekend Watching"
                  value={isLoading ? '...' : `${(metricsData?.admin?.interestingMetrics?.weekendWatchPercentage || 0).toFixed(1)}%`}
                  icon={<CalendarIcon className="w-6 h-6" />}
                  delay={0.05}
                />
                <StatCard
                  label="Completion Rate"
                  value={isLoading ? '...' : `${(metricsData?.admin?.interestingMetrics?.completionRate || 0).toFixed(1)}%`}
                  icon={<ChartBarIcon className="w-6 h-6" />}
                  delay={0.1}
                />
                <StatCard
                  label="Avg Session"
                  value={isLoading ? '...' : formatMinutes(Math.round(metricsData?.admin?.interestingMetrics?.avgSessionDuration || 0))}
                  icon={<PlayIcon className="w-6 h-6" />}
                  delay={0.15}
                />
              </div>
            </PageSection>

            {/* User Joins Over Time Chart */}
            {metricsData?.userJoins?.byDay && metricsData.userJoins.byDay.length > 0 && (
              <PageSection delay={0.22}>
                <Card padding="lg">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-lg font-semibold font-display text-default">User Joins Over Time</h3>
                      <p className="text-sm text-muted">New user signups by day</p>
                    </div>
                    <Badge variant="primary">
                      <UsersIcon className="w-4 h-4 mr-1" />
                      {metricsData.userJoins.byDay.reduce((sum, day) => sum + day.count, 0)} Total
                    </Badge>
                  </div>
                  <div className="h-40 md:h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={metricsData.userJoins.byDay}>
                        <defs>
                          <linearGradient id="colorUserJoins" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--color-chart-3)" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="var(--color-chart-3)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis 
                          dataKey="date" 
                          stroke="#64748b" 
                          fontSize={12}
                          tickFormatter={(value) => {
                            const date = new Date(value);
                            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                          }}
                        />
                        <YAxis stroke="#64748b" fontSize={12} />
                        <Tooltip 
                          contentStyle={TOOLTIP_STYLE} 
                          labelStyle={TOOLTIP_LABEL_STYLE}
                          labelFormatter={(value) => {
                            const date = new Date(value);
                            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                          }}
                          formatter={(value) => [`${value} user${Number(value) !== 1 ? 's' : ''}`, 'New Signups']}
                        />
                        <Area
                          type="monotone"
                          dataKey="count"
                          stroke="var(--color-chart-3)"
                          strokeWidth={2}
                          fillOpacity={1}
                          fill="url(#colorUserJoins)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </PageSection>
            )}

            {/* Top Row: Lifecycle + At-Risk side by side */}
            <PageSection delay={0.25}>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* User Lifecycle Section */}
                <Card padding="lg">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold font-display text-default">User Lifecycle</h3>
                    <Badge variant="primary">Retention</Badge>
                  </div>
                  {metricsData?.admin?.userLifecycle && (
                    <UserLifecycleCard
                      lifecycle={metricsData.admin.userLifecycle}
                      userJoins={metricsData.userJoins?.byDay || []}
                    />
                  )}
                </Card>

                {/* At-Risk Users Section */}
                <Card padding="lg">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <ExclamationTriangleIcon className="w-6 h-6" />
                      <h3 className="text-lg font-semibold font-display text-default">At-Risk Users</h3>
                    </div>
                    <Badge>
                      {metricsData?.admin?.userLifecycle?.criticalRisk?.length || 0} Critical,{' '}
                      {metricsData?.admin?.userLifecycle?.atRisk?.length || 0} Warning
                    </Badge>
                  </div>
                  {metricsData?.admin?.userLifecycle && (
                    <AtRiskUsersTable
                      atRiskUsers={metricsData.admin.userLifecycle.atRisk}
                      criticalUsers={metricsData.admin.userLifecycle.criticalRisk}
                      onUserClick={setSelectedUser}
                    />
                  )}
                </Card>
              </div>
            </PageSection>

            {/* Server Health Section - Full width */}
            <PageSection delay={0.3}>
              <Card padding="lg">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <ServerIcon className="w-6 h-6 text-primary" />
                    <h3 className="text-lg font-semibold font-display text-default">Server Health</h3>
                  </div>
                  <Badge 
                    variant={
                      metricsData?.admin?.serverHealth?.status === 'healthy' 
                        ? 'success' 
                        : metricsData?.admin?.serverHealth?.status === 'warning'
                        ? 'warning'
                        : 'error'
                    }
                  >
                    {metricsData?.admin?.serverHealth?.status?.toUpperCase() || 'UNKNOWN'}
                  </Badge>
                </div>
                {metricsData?.admin?.serverHealth && (
                  <ServerHealthDashboard
                    status={metricsData.admin.serverHealth.status}
                    checks={metricsData.admin.serverHealth.checks}
                    metrics={metricsData.admin.serverHealth.metrics}
                  />
                )}
              </Card>
            </PageSection>

            {/* Addon Performance Section - Full width */}
            <PageSection delay={0.35}>
              <Card padding="lg">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <PuzzlePieceIcon className="w-6 h-6 text-secondary" />
                    <h3 className="text-lg font-semibold font-display text-default">Addon Performance</h3>
                  </div>
                  <Badge variant="secondary">
                    {metricsData?.admin?.addonAnalytics?.totalAddons || 0} Addons
                  </Badge>
                </div>
                {metricsData?.admin?.addonAnalytics && (
                  <AddonPerformanceCard
                    totalAddons={metricsData.admin.addonAnalytics.totalAddons}
                    activeAddons={metricsData.admin.addonAnalytics.activeAddons}
                    topAddons={metricsData.admin.addonAnalytics.topAddons}
                    byResource={metricsData.admin.addonAnalytics.byResource}
                  />
                )}
              </Card>
            </PageSection>
          </div>
        )}
      </div>
    </>
  );
}
