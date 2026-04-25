'use client';

import { useState, memo, useEffect, useMemo, useRef, useCallback, Suspense } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Button, Card, Badge, Avatar, UserAvatar, StatCard, SearchInput, PageToolbar, ViewModeToggle } from '@/components/ui';
import { PageSection, StaggerContainer, StaggerItem } from '@/components/layout/PageContainer';
import { api, MetricsData, Invitation } from '@/lib/api';
import {
  ClockIcon,
  FilmIcon,
  TvIcon,
  PlayIcon,
  PauseIcon,
  CheckCircleIcon,
  CalendarIcon,
  MagnifyingGlassIcon,
  UserIcon,
  ArrowPathIcon,
  UsersIcon,
  PuzzlePieceIcon,
  ExclamationTriangleIcon,
  ArchiveBoxIcon,
  EnvelopeIcon,
  XMarkIcon,
  Squares2X2Icon,
  ListBulletIcon,
  ShieldCheckIcon,
  FolderIcon,
} from '@heroicons/react/24/outline';

// Activity types
type ActivityType = 'watch' | 'pause' | 'complete' | 'sync';
type ContentType = 'movie' | 'series';

interface ActivityItem {
  id: string;
  userId: string;
  userName: string;
  userEmail?: string;
  userColorIndex?: number;
  type: ActivityType;
  contentType: ContentType;
  contentId: string;
  contentName: string;
  season?: number;
  episode?: number;
  episodeName?: string;
  progress?: number;
  durationSeconds?: number; // Watch duration in seconds
  timestamp: Date; // Start time of the session
  endTime?: Date; // End time (if session is complete)
  isActive?: boolean; // True if still watching
  isSynthetic?: boolean;
  poster?: string;
}

// Invite history types
interface InviteHistoryItem {
  id: string;
  inviteCode: string;
  groupName: string;
  groupColor?: string;
  action: 'created' | 'used' | 'expired' | 'deleted';
  userName?: string;
  timestamp: Date;
}

// Helper to transform metrics data to activity items
// History = DB sessions with endTime set AND durationSeconds > 0
// Now Playing = handled separately (DB sessions with no endTime)
// Library JSON (startedPlaying/recentEpisodes) = never shown
function transformMetricsToActivity(metrics: MetricsData | null): ActivityItem[] {
  if (!metrics) return [];

  const activities: ActivityItem[] = [];

  if (metrics.watchSessions && metrics.watchSessions.length > 0) {
    metrics.watchSessions.forEach((session) => {
      // Only completed sessions: must have endTime set
      if (!session.endTime) return;
      // Must have actual watch data
      if ((session.durationSeconds || 0) <= 0) return;

      activities.push({
        id: session.id,
        userId: session.user.id,
        userName: session.user.username,
        userEmail: session.user.email,
        userColorIndex: session.user.colorIndex,
        type: 'complete' as ActivityType,
        contentType: (session.item.type === 'movie' ? 'movie' : 'series') as ContentType,
        contentId: session.item.id,
        contentName: session.item.name,
        season: session.item.season ?? undefined,
        episode: session.item.episode ?? undefined,
        durationSeconds: session.durationSeconds,
        timestamp: new Date(session.startTime),
        endTime: new Date(session.endTime),
        isActive: false,
        isSynthetic: false,
        poster: session.item.poster,
      });
    });
  }

  // Sort by timestamp, most recent first
  return activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

// Format duration in a human-readable way
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

// Task history types
type TaskStatus = 'success' | 'failed' | 'partial';
type TaskType = 'sync_users' | 'sync_groups' | 'backup' | 'reload_addons' | 'import';

interface TaskHistoryItem {
  id: string;
  type: TaskType;
  status: TaskStatus;
  timestamp: Date;
  duration: number; // in seconds
  details: {
    total?: number;
    success?: number;
    failed?: number;
    groupName?: string;
    userName?: string;
    filename?: string;
  };
}

// Helper to transform invitations to invite history
function transformInvitationsToHistory(invitations: Invitation[] | null, groups: any[] | null): InviteHistoryItem[] {
  if (!invitations) return [];

  const history: InviteHistoryItem[] = [];
  const groupMap = new Map((groups || []).map(g => [g.id, g]));

  invitations.forEach((inv) => {
    const group = inv.groupId ? groupMap.get(inv.groupId) : null;
    const code = (inv as any).code || (inv as any).inviteCode || '';

    // Add created event
    history.push({
      id: `created-${inv.id}`,
      inviteCode: code,
      groupName: group?.name || 'No Group',
      groupColor: group?.color,
      action: 'created' as const,
      timestamp: new Date(inv.createdAt),
    });

    // Add used events from requests
    if (inv.requests && Array.isArray(inv.requests)) {
      inv.requests
        .filter((req: any) => req.status === 'accepted')
        .forEach((req: any) => {
          history.push({
            id: `used-${inv.id}-${req.id}`,
            inviteCode: code,
            groupName: group?.name || 'No Group',
            groupColor: group?.color,
            action: 'used' as const,
            userName: req.username || req.email,
            timestamp: new Date(req.respondedAt || req.createdAt),
          });
        });
    }

    // Check if expired
    if (inv.expiresAt && new Date(inv.expiresAt) < new Date()) {
      history.push({
        id: `expired-${inv.id}`,
        inviteCode: code,
        groupName: group?.name || 'No Group',
        groupColor: group?.color,
        action: 'expired' as const,
        timestamp: new Date(inv.expiresAt),
      });
    }
  });

  // Sort by timestamp, most recent first
  return history.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

// Task history data - will be fetched from API when endpoint is available
const taskHistory: TaskHistoryItem[] = [];

// Helper functions
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

function getActivityIcon(type: ActivityType) {
  switch (type) {
    case 'watch':
      return <PlayIcon className="w-4 h-4" />;
    case 'pause':
      return <PauseIcon className="w-4 h-4" />;
    case 'complete':
      return <CheckCircleIcon className="w-4 h-4" />;
    case 'sync':
      return <ArrowPathIcon className="w-4 h-4" />;
  }
}

function getActivityColor(type: ActivityType) {
  switch (type) {
    case 'watch':
      return 'text-secondary bg-secondary-muted';
    case 'pause':
      return 'text-warning bg-warning-muted';
    case 'complete':
      return 'text-secondary bg-secondary-muted';
    case 'sync':
      return 'text-primary bg-primary-muted';
  }
}

function getActivityText(activity: ActivityItem): string {
  switch (activity.type) {
    case 'watch':
      return 'is watching';
    case 'pause':
      return 'paused';
    case 'complete':
      return 'watched';
    case 'sync':
      return 'synced';
  }
}

// Memoized activity card component
const ActivityCard = memo(function ActivityCard({
  activity,
  onFilterByContent,
  onFilterByEpisode,
}: {
  activity: ActivityItem;
  onFilterByContent?: (name: string) => void;
  onFilterByEpisode?: (activity: ActivityItem) => void;
}) {
  const showProgress = activity.type === 'watch' || activity.type === 'pause';
  const [imageError, setImageError] = useState(false);

  return (
    <motion.div
      whileHover={{ x: 4 }}
      className="flex items-start gap-4 p-4 rounded-xl bg-surface border border-default hover:border-primary/50 transition-colors"
    >
      {/* Activity type icon or poster (clickable for show/movie history) */}
      {activity.type === 'complete' && activity.poster && !imageError ? (
        <button
          type="button"
          className="w-12 h-16 rounded-lg overflow-hidden shrink-0 bg-surface border border-default"
          onClick={() => onFilterByContent?.(activity.contentName)}
        >
          <img
            src={activity.poster}
            alt={activity.contentName}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        </button>
      ) : (
        <button
          type="button"
          className={`p-2 rounded-lg ${getActivityColor(activity.type)}`}
          onClick={() => onFilterByContent?.(activity.contentName)}
        >
          {getActivityIcon(activity.type)}
        </button>
      )}

      {/* User avatar */}
      <Link href={`/users/${activity.userId}`}>
        <UserAvatar userId={activity.userId} name={activity.userName} email={activity.userEmail} size="md" />
      </Link>

      {/* Activity details */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-muted">
          <Link href={`/users/${activity.userId}`} className="font-medium text-default hover:text-primary transition-colors">
            {activity.userName}
          </Link>{' '}
          {getActivityText(activity)}
        </p>

        {/* Content info */}
        <div className="flex items-center gap-2 mt-1">
          {activity.contentType === 'movie' ? (
            <FilmIcon className="w-4 h-4 text-primary" />
          ) : (
            <TvIcon className="w-4 h-4 text-secondary" />
          )}
          <button
            type="button"
            onClick={() => onFilterByContent?.(activity.contentName)}
            className="font-medium text-default hover:text-primary transition-colors text-left"
          >
            {activity.contentName}
            {activity.contentType === 'series' && activity.episode !== undefined && activity.episode > 0 && (
              <span className="ml-1 text-muted">
                {activity.season !== undefined && activity.season > 0 ? `S${String(activity.season).padStart(2, '0')}E` : 'E'}
                {String(activity.episode).padStart(2, '0')}
                {activity.episodeName ? ` - ${activity.episodeName}` : ''}
              </span>
            )}
          </button>
        </div>

        {/* Session meta: duration & start/end time */}
        <div className="mt-3 flex items-center gap-1 text-xs text-muted">
          <ClockIcon className="w-3 h-3" />
          {!activity.isSynthetic && activity.durationSeconds !== undefined && (
            <span>
              {activity.durationSeconds > 0 ? formatDuration(activity.durationSeconds) : '<1m'}
            </span>
          )}
          {!activity.isSynthetic && activity.durationSeconds !== undefined && <span className="mx-1">•</span>}
          <span>{formatTime(activity.timestamp)}</span>
          {activity.endTime && !activity.isSynthetic && (
            <>
              <span className="mx-1">→</span>
              <span>{formatTime(activity.endTime)}</span>
            </>
          )}
        </div>
      </div>

      {/* Timestamp */}
      <div className="text-right">
        <p className="text-xs text-subtle">{formatTimestamp(activity.timestamp)}</p>
      </div>
    </motion.div>
  );
});

// Grid view activity card component - Cinematic poster design
const ActivityCardGrid = memo(function ActivityCardGrid({
  activity,
  onFilterByContent,
}: {
  activity: ActivityItem;
  onFilterByContent?: (name: string) => void;
}) {
  const [imageError, setImageError] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -4 }}
      className="group relative cursor-pointer"
    >
      {/* Poster Card */}
      <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-slate-800 shadow-xl">
        {activity.poster && !imageError ? (
          <>
            <img
              src={activity.poster}
              alt={activity.contentName}
              className="w-full h-full object-cover transition-all duration-700 group-hover:scale-110"
              onError={() => setImageError(true)}
            />
            {/* Gradient overlay - subtle since no text on poster */}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/50 to-transparent opacity-40 group-hover:opacity-60 transition-opacity" />
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-slate-800">
            {activity.contentType === 'movie' ? (
              <FilmIcon className="w-12 h-12 text-slate-600" />
            ) : (
              <TvIcon className="w-12 h-12 text-slate-600" />
            )}
          </div>
        )}

        {/* User avatar - top right */}
        <div className="absolute top-2 right-2">
          <Link href={`/users/${activity.userId}`} onClick={(e) => e.stopPropagation()}>
            <UserAvatar userId={activity.userId} name={activity.userName} email={activity.userEmail} size="sm" />
          </Link>
        </div>

        {/* Session duration badge - top left, styled like the activity type tick */}
        {!activity.isSynthetic && activity.durationSeconds !== undefined && activity.durationSeconds > 0 && (
          <div className="absolute top-2 left-2">
            <div className={`px-2 py-1 rounded-md text-xs font-medium shadow-lg ${getActivityColor(activity.type)}`}>
              {formatDuration(activity.durationSeconds)}
            </div>
          </div>
        )}
      </div>

      {/* Content Info - Below the poster */}
      <div className="mt-2 space-y-0.5 text-center">
        {/* Content title */}
        <button
          type="button"
          onClick={() => onFilterByContent?.(activity.contentName)}
          className="block w-full"
        >
          <h4 className="font-semibold text-sm text-slate-500 leading-tight line-clamp-2">
            {activity.contentName}
          </h4>
        </button>

        {/* Episode info for series */}
        {activity.contentType === 'series' && activity.episode !== undefined && activity.episode > 0 && (
          <p className="text-xs text-slate-500 font-medium">
            {activity.season !== undefined && activity.season > 0 ? `Season ${activity.season}, ` : ''}
            Episode {activity.episode}
            {activity.episodeName && ` - ${activity.episodeName}`}
          </p>
        )}

        {/* Timestamp - "XX Oct 2026 XX:XX" format */}
        <div className="flex items-center justify-center text-xs text-slate-500">
          <span>
            {activity.timestamp.toLocaleDateString('en-GB', {
              day: '2-digit',
              month: 'short',
              year: 'numeric'
            }).replace(/ /g, ' ')} {formatTime(activity.timestamp)}
          </span>
        </div>
      </div>
    </motion.div>
  );
});

// Task history helper functions
function getTaskIcon(type: TaskType) {
  switch (type) {
    case 'sync_users':
      return <UsersIcon className="w-4 h-4" />;
    case 'sync_groups':
      return <UsersIcon className="w-4 h-4" />;
    case 'backup':
      return <ArchiveBoxIcon className="w-4 h-4" />;
    case 'reload_addons':
      return <PuzzlePieceIcon className="w-4 h-4" />;
    case 'import':
      return <ArrowPathIcon className="w-4 h-4" />;
  }
}

function getTaskColor(status: TaskStatus) {
  switch (status) {
    case 'success':
      return 'text-success bg-success-muted';
    case 'failed':
      return 'text-error bg-error-muted';
    case 'partial':
      return 'text-warning bg-warning-muted';
  }
}

function getTaskName(type: TaskType): string {
  switch (type) {
    case 'sync_users':
      return 'Sync Users';
    case 'sync_groups':
      return 'Sync Groups';
    case 'backup':
      return 'Backup';
    case 'reload_addons':
      return 'Reload Addons';
    case 'import':
      return 'Import';
  }
}

function formatTaskDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

// Task History Card component
const TaskHistoryCard = memo(function TaskHistoryCard({ task }: { task: TaskHistoryItem }) {
  // Get the task type icon with color based on status
  const getColoredTaskIcon = () => {
    const statusColor = task.status === 'success'
      ? 'text-success'
      : task.status === 'failed'
        ? 'text-error'
        : 'text-warning'

    // Render the icon with the appropriate color
    let iconElement
    switch (task.type) {
      case 'sync_users':
        iconElement = <UsersIcon className={`w-4 h-4 ${statusColor}`} />;
        break;
      case 'sync_groups':
        iconElement = <UsersIcon className={`w-4 h-4 ${statusColor}`} />;
        break;
      case 'backup':
        iconElement = <ArchiveBoxIcon className={`w-4 h-4 ${statusColor}`} />;
        break;
      case 'reload_addons':
        iconElement = <PuzzlePieceIcon className={`w-4 h-4 ${statusColor}`} />;
        break;
      case 'import':
        iconElement = <ArrowPathIcon className={`w-4 h-4 ${statusColor}`} />;
        break;
    }

    return (
      <div className={`p-2 rounded-lg ${getTaskColor(task.status)}`}>
        {iconElement}
      </div>
    )
  }

  return (
    <motion.div
      whileHover={{ x: 4 }}
      className="flex items-start gap-4 p-4 rounded-xl bg-surface-hover hover:bg-surface transition-colors"
    >
      {/* Task type icon with status color */}
      {getColoredTaskIcon()}

      {/* Task details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-medium text-default">{getTaskName(task.type)}</h4>
          <Badge
            variant={task.status === 'success' ? 'success' : task.status === 'failed' ? 'error' : 'warning'}
            size="sm"
          >
            {task.status}
          </Badge>
        </div>

        {/* Task result details */}
        <div className="mt-1 text-xs text-muted">
          {task.details.total !== undefined && (
            <span>
              {task.details.success}/{task.details.total} successful
              {task.details.failed && task.details.failed > 0 && (
                <span className="text-error"> ({task.details.failed} failed)</span>
              )}
            </span>
          )}
          {task.details.filename && (
            <span className="font-mono">{task.details.filename}</span>
          )}
          {task.details.groupName && (
            <span>Group: {task.details.groupName}</span>
          )}
        </div>

        {/* Duration */}
        <div className="flex items-center gap-2 mt-2 text-xs text-subtle">
          <ClockIcon className="w-3 h-3" />
          <span>Duration: {formatTaskDuration(task.duration)}</span>
        </div>
      </div>

      {/* Timestamp */}
      <div className="text-right">
        <p className="text-xs text-subtle">{formatTimestamp(task.timestamp)}</p>
        <p className="text-xs text-muted mt-1">
          {task.timestamp.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </p>
      </div>
    </motion.div>
  );
});

// Proxy History View Component
function ProxyHistoryView() {
  const [proxyLogs, setProxyLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAddon, setSelectedAddon] = useState<string | null>(null);
  const [addons, setAddons] = useState<any[]>([]);

  useEffect(() => {
    // Fetch addons list
    api.getAddons().then(setAddons).catch(console.error);
  }, []);

  useEffect(() => {
    setIsLoading(true);
    
    // If no addon selected, fetch ALL logs. Otherwise fetch logs for specific addon
    const fetchLogs = selectedAddon 
      ? api.getProxyLogs(selectedAddon, 100)
      : api.getAllProxyLogs(100);
    
    fetchLogs
      .then((data) => {
        setProxyLogs(data.logs || []);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load proxy logs:', err);
        setIsLoading(false);
      });
  }, [selectedAddon]);

  return (
    <PageSection delay={0.1}>
      <Card padding="lg">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-default">Proxy Request History</h3>
            <p className="text-sm text-muted">
              View all requests made through proxied addon URLs
            </p>
          </div>
          <select
            value={selectedAddon || ''}
            onChange={(e) => setSelectedAddon(e.target.value || null)}
            className="px-3 py-2 bg-surface border border-default rounded-lg text-default"
          >
            <option value="">All Addons</option>
            {addons.map((addon) => (
              <option key={addon.id} value={addon.id}>
                {addon.name}
              </option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin text-primary" />
          </div>
        ) : proxyLogs.length === 0 ? (
          <div className="text-center py-12">
            <ShieldCheckIcon className="w-12 h-12 mx-auto mb-4 text-muted opacity-50" />
            <p className="text-muted">
              {selectedAddon ? 'No proxy requests yet for this addon' : 'No proxy requests yet'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {proxyLogs.map((log, index) => (
              <div
                key={index}
                className="flex items-center gap-4 p-3 rounded-lg bg-surface-hover border border-default"
              >
                <div className="flex-shrink-0">
                  {log.cacheHit ? (
                    <Badge variant="success" size="sm">Cache Hit</Badge>
                  ) : (
                    <Badge variant="primary" size="sm">Proxy</Badge>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <code className="text-xs text-subtle font-mono">{log.method}</code>
                    {log.url ? (
                      <a 
                        href={log.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:text-primary-hover truncate underline underline-offset-2"
                        title={log.url}
                      >
                        {log.path}
                      </a>
                    ) : (
                      <span className="text-sm text-default truncate">{log.path}</span>
                    )}
                  </div>
                  {log.upstreamUrl && (
                    <div className="flex items-center gap-1 mt-0.5 min-w-0">
                      <span className="text-[10px] text-muted uppercase font-semibold flex-shrink-0">Original:</span>
                      <a 
                        href={log.upstreamUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted hover:text-primary truncate underline decoration-muted/30 underline-offset-2"
                        title={log.upstreamUrl}
                      >
                        {log.upstreamUrl}
                      </a>
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-xs text-muted mt-1">
                    {!selectedAddon && log.addonName && (
                      <>
                        <Badge variant="secondary" size="sm">{log.addonName}</Badge>
                        <span>•</span>
                      </>
                    )}
                    <span>{new Date(log.timestamp).toLocaleString()}</span>
                    <span>•</span>
                    <span>{log.responseTimeMs}ms</span>
                    {log.statusCode && (
                      <>
                        <span>•</span>
                        <span className={log.statusCode >= 400 ? 'text-error' : 'text-success'}>
                          {log.statusCode}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                {log.ip && (
                  <div className="text-xs text-subtle font-mono hidden sm:block" title="Client IP">
                    {log.ip}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </PageSection>
  );
}

function ActivityPageContent() {
  const searchParams = useSearchParams();
  const userParam = searchParams.get('user');
  const periodParam = searchParams.get('period'); // 'today' | 'week'
  
  const [searchQuery, setSearchQuery] = useState(userParam || '');
  const [timePeriod, setTimePeriod] = useState<string | null>(periodParam);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [episodeFilter, setEpisodeFilter] = useState<{
    name: string;
    season?: number;
    episode?: number;
  } | null>(null);
  const [viewMode, setViewMode] = useState<'watch' | 'tasks' | 'invites' | 'proxy'>('watch');
  const [watchActivityViewMode, setWatchActivityViewMode] = useState<'grid' | 'list'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('watch-activity-view-mode');
      return saved === 'grid' ? 'grid' : 'list';
    }
    return 'list';
  });
  const [visibleCount, setVisibleCount] = useState(50); // lazy-load activity in chunks
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Fetch real data
  const [metricsData, setMetricsData] = useState<MetricsData | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Auto-refresh interval for Now Playing section (30 seconds)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Ticking "now" for live Now Playing durations - using state to trigger UI updates
  const [nowTick, setNowTick] = useState<number>(Date.now());

  // Time boundaries for grouping
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
  const twoDaysAgoStart = new Date(todayStart.getTime() - 2 * 24 * 60 * 60 * 1000);
  const threeDaysAgoStart = new Date(todayStart.getTime() - 3 * 24 * 60 * 60 * 1000);
  const oneWeekAgoStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgoStart = new Date(todayStart.getTime() - 14 * 24 * 60 * 60 * 1000);
  const oneMonthAgoStart = new Date(todayStart.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Ref for infinite scroll sentinel
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const fetchData = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    setError(null);
    try {
      // Parallelize API calls for better performance
      const [metrics, invs, grps] = await Promise.all([
        api.getMetrics('all'),
        api.getInvitations(),
        api.getGroups()
      ]);

      console.log('[ActivityPage] Metrics received:', {
        sessions: metrics.watchSessions?.length,
        synthetic: metrics.watchSessions?.filter((s: any) => s.isSynthetic)?.length,
        nowPlaying: metrics.nowPlaying?.length
      });

      setMetricsData(metrics);
      setInvitations(invs);
      setGroups(grps);

      setIsLoading(false);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err as Error);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Auto-refresh every 30 seconds to keep Now Playing updated
    const interval = setInterval(() => {
      fetchData(false); // Don't show loading spinner for auto-refresh
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  // Update "now" every second so Now Playing durations tick up in the UI
  useEffect(() => {
    const id = setInterval(() => {
      setNowTick(Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Calculate live watch time today (base watch time + elapsed active sessions)
  const liveWatchTimeTodayHours = useMemo(() => {
    if (!metricsData) return 0;
    
    // Start with the base time from the API (completed sessions today)
    let totalSeconds = 0;
    if (metricsData.watchTime?.byDay) {
      const todayLocal = todayStart.toLocaleDateString('sv-SE');
      const todayEntry = metricsData.watchTime.byDay.find(d => d.date === todayLocal);
      if (todayEntry) {
        totalSeconds = (todayEntry.hours || 0) * 3600;
      }
    }

    // Add elapsed time from all active "Now Playing" sessions
    if (metricsData.nowPlaying && metricsData.nowPlaying.length > 0) {
      metricsData.nowPlaying.forEach(np => {
        let startMs: number | null = null;

        // Find session to get accurate start time
        if (metricsData.watchSessions) {
          const session = metricsData.watchSessions.find(s => 
            s.isActive && s.user.id === np.user.id && s.item.id === np.item.id
          );
          if (session) startMs = new Date(session.startTime).getTime();
        }

        // Fallback to watchedAtTimestamp
        if (!startMs && np.watchedAtTimestamp) {
          startMs = np.watchedAtTimestamp;
        }

        if (startMs) {
          const elapsed = Math.max(0, (nowTick - startMs) / 1000);
          totalSeconds += elapsed;
        }
      });
    }

    return totalSeconds / 3600;
  }, [metricsData, nowTick, todayStart]);

  // Infinite scroll: load more when sentinel is visible
  const loadMore = useCallback(() => {
    if (isLoadingMore) return;
    setIsLoadingMore(true);
    // Use setTimeout to give a smooth transition feel
    setTimeout(() => {
      setVisibleCount((prev) => prev + 50);
      setIsLoadingMore(false);
    }, 100);
  }, [isLoadingMore, setVisibleCount, setIsLoadingMore]);

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: '200px' } // Load more before reaching the bottom
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  // Transform API data to activity items
  // Activity feed shows ALL history - Now Playing is handled separately by the backend
  const activityData = useMemo(
    () => transformMetricsToActivity(metricsData),
    [metricsData]
  );

  // Transform invitations to history
  const inviteHistory = useMemo(() => transformInvitationsToHistory(invitations, groups), [invitations, groups]);

  // Build user to groups mapping
  const userGroupsMap = useMemo(() => {
    const map = new Map<string, string[]>();
    groups.forEach((group) => {
      // Parse userIds if it's a JSON string
      let groupUsers: string[] = [];
      if (group.userIds) {
        if (typeof group.userIds === 'string') {
          try {
            groupUsers = JSON.parse(group.userIds);
          } catch {
            groupUsers = [];
          }
        } else if (Array.isArray(group.userIds)) {
          groupUsers = group.userIds;
        }
      }
      groupUsers.forEach((userId: string) => {
        if (!map.has(userId)) {
          map.set(userId, []);
        }
        map.get(userId)!.push(group.id);
      });
    });
    return map;
  }, [groups]);

  // Filter activities by search, time period, group, and optional episode filter
  const filteredActivities = activityData.filter((activity) => {
    // 1. Time Period Filter
    if (timePeriod === 'today') {
      if (activity.timestamp < todayStart) return false;
    } else if (timePeriod === 'week') {
      if (activity.timestamp < oneWeekAgoStart) return false;
    }

    // 2. Group Filter
    if (selectedGroup) {
      const userGroupIds = userGroupsMap.get(activity.userId) || [];
      if (!userGroupIds.includes(selectedGroup)) {
        return false;
      }
    }

    // 3. Search Query Filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (
        activity.userName.toLowerCase().includes(query) ||
        activity.contentName.toLowerCase().includes(query)
      ) {
        // ok
      } else {
        return false;
      }
    }

    // 4. Episode-level filter (for specific episode history)
    if (episodeFilter) {
      if (
        activity.contentName !== episodeFilter.name ||
        activity.season !== episodeFilter.season ||
        activity.episode !== episodeFilter.episode
      ) {
        return false;
      }
    }

    return true;
  });
  // Apply lazy-load window
  const visibleActivities = filteredActivities.slice(0, visibleCount);

  // Get date keys for today and yesterday (stable for render)
  const todayKey = getDateKey(todayStart);
  const yesterdayKey = getDateKey(yesterdayStart);

  // Group visible activities by date (each day gets its own group)
  const groupedActivities = useMemo(() => {
    const groups = new Map<string, ActivityItem[]>();

    for (const activity of visibleActivities) {
      const dateKey = getDateKey(activity.timestamp);
      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)!.push(activity);
    }

    // Convert to sorted array (most recent first)
    return Array.from(groups.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([dateKey, activities]) => {
        const totalDuration = activities.reduce((sum, a) => sum + (a.durationSeconds || 0), 0);
        return {
          dateKey,
          label: formatDateHeader(dateKey),
          activities,
          totalDuration,
          isToday: dateKey === todayKey,
          isYesterday: dateKey === yesterdayKey,
        };
      });
  }, [visibleActivities, todayKey, yesterdayKey]);

  // For backwards compat with stats
  const todayActivities = visibleActivities.filter((a) => a.timestamp >= todayStart);
  const yesterdayActivities = visibleActivities.filter(
    (a) => a.timestamp >= yesterdayStart && a.timestamp < todayStart
  );

  // Activity stats derived from real metrics data
  const currentlyWatchingCount =
    metricsData?.nowPlaying && Array.isArray(metricsData.nowPlaying)
      ? metricsData.nowPlaying.length
      : 0;

  const completedTodayCount = activityData.filter((activity) => {
    return activity.timestamp >= todayStart;
  }).length;

  let watchTimeTodayHours = 0;
  if (metricsData?.watchTime?.byDay && Array.isArray(metricsData.watchTime.byDay)) {
    // Use local date string to avoid timezone issues with toISOString()
    const todayLocal = todayStart.toLocaleDateString('sv-SE'); // YYYY-MM-DD format
    const todayEntry = metricsData.watchTime.byDay.find((d) =>
      d.date === todayLocal
    );
    if (todayEntry) {
      watchTimeTodayHours = todayEntry.hours || 0;
    }
  }

  const activeUsersCount = metricsData?.summary?.activeUsers ?? 0;

  // Group task history by time periods (TODO: fetch from API)
  const todayTasks: TaskHistoryItem[] = [];
  const yesterdayTasks: TaskHistoryItem[] = [];
  const olderTasks: TaskHistoryItem[] = [];

  return (
    <>
      <Header
        title="Activity"
        subtitle="Track watch history and sync operations across your Syncio instance"
        actions={
          <div className="flex items-center gap-3">
            {/* Group Filter Dropdown */}
            <select
              value={selectedGroup || ''}
              onChange={(e) => setSelectedGroup(e.target.value || null)}
              className="px-3 py-2 bg-surface border border-default rounded-lg text-default text-sm focus:outline-none focus:border-primary"
            >
              <option value="">All Groups</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>
        }
      />

      <div className="p-8">
        {/* Primary Tabs - Centered */}
        <PageToolbar
          animate={false}
          filterTabs={{
            options: [
              { key: 'watch', label: 'Watch Activity', icon: <PlayIcon className="w-4 h-4" /> },
              { key: 'tasks', label: 'Task History', icon: <ClockIcon className="w-4 h-4" /> },
              { key: 'invites', label: 'Invitation History', icon: <EnvelopeIcon className="w-4 h-4" /> },
              { key: 'proxy', label: 'Proxy History', icon: <ShieldCheckIcon className="w-4 h-4" /> },
            ],
            activeKey: viewMode,
            onChange: (key) => setViewMode(key as 'watch' | 'tasks' | 'invites' | 'proxy'),
            layoutId: 'activity-primary-tabs',
          }}
        />

        {viewMode === 'watch' ? (
          <>
            {/* Activity Stats (from real metrics data) */}
            <PageSection delay={0.05} className="mb-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  label="Currently Watching"
                  value={isLoading ? '...' : String(currentlyWatchingCount)}
                  icon={<PlayIcon className="w-6 h-6" />}
                  delay={0}
                />
                <StatCard
                  label="Watched Today"
                  value={isLoading ? '...' : String(completedTodayCount)}
                  icon={<CheckCircleIcon className="w-6 h-6" />}
                  delay={0.05}
                />
                <StatCard
                  label="Watch Time Today"
                  value={
                    isLoading
                      ? '...'
                      : formatHours(liveWatchTimeTodayHours)
                  }
                  icon={<ClockIcon className="w-6 h-6" />}
                  delay={0.1}
                />
                <StatCard
                  label="Active Users"
                  value={isLoading ? '...' : String(activeUsersCount)}
                  icon={<UserIcon className="w-6 h-6" />}
                  delay={0.15}
                />
              </div>
            </PageSection>

            {metricsData?.nowPlaying && metricsData.nowPlaying.length > 0 && (
              <PageSection delay={0.02} className="mb-6">
                <Card padding="md" className="border-2 border-primary/30 bg-primary/5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-primary/10 flex items-center justify-center">
                        <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
                      </div>
                      <h2 className="text-lg font-semibold text-default font-display">Now Playing</h2>
                      <Badge variant="primary" size="sm">
                        {metricsData.nowPlaying.length} {metricsData.nowPlaying.length === 1 ? 'user' : 'users'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted">
                      <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                      <span>Live</span>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {metricsData.nowPlaying.map((np) => (
                      <motion.div
                        key={`now-${np.user.id}-${np.item.id}`}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex items-center gap-3 p-3 rounded-xl bg-surface-hover hover:bg-surface border border-default hover:border-primary/50 transition-colors"
                      >
                        {/* Poster */}
                        {np.item.poster ? (
                          <div className="w-10 h-14 rounded-lg overflow-hidden shrink-0 bg-surface-hover">
                            <img
                              src={np.item.poster}
                              alt={np.item.name}
                              className="w-full h-full object-cover"
                            />
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
                          <Link href={`/users/${np.user.id}`} className="flex items-center gap-2 mb-1">
                            <UserAvatar userId={np.user.id} name={np.user.username} size="sm" />
                            <span className="text-sm font-medium text-default truncate hover:text-primary transition-colors">
                              {np.user.username}
                            </span>
                          </Link>
                          <p className="text-sm text-muted truncate">
                            {np.item.name}
                            {np.item.type === 'series' && np.item.episode !== undefined && np.item.episode > 0 && (
                              <span className="ml-1">
                                {np.item.season !== undefined && np.item.season > 0 ? `S${String(np.item.season).padStart(2, '0')}E` : 'E'}
                                {String(np.item.episode).padStart(2, '0')}
                              </span>
                            )}
                          </p>
                          {/* Live duration for now playing: now - session start.
                              Only shown when we have a proper WatchSession (so it doesn't reset on each sync). */}
                          {(() => {
                            let session: NonNullable<typeof metricsData.watchSessions>[0] | undefined = undefined;
                            let startMs: number | null = null;

                            // Find matching active session from watchSessions
                            // Match by: userId + itemId + videoId (for series) or userId + itemId (for movies)
                            if (metricsData?.watchSessions && metricsData.watchSessions.length > 0) {
                              const matchingSessions = metricsData.watchSessions.filter((s) => {
                                // Must be active and match user + item
                                if (!s.isActive || s.user.id !== np.user.id || s.item.id !== np.item.id) {
                                  return false;
                                }

                                // For series: match by videoId if available (most reliable)
                                if (np.item.type === 'series') {
                                  const npVideoId = np.videoId || null;
                                  const sVideoId = s.videoId || null;

                                  // If both have videoId, they must match
                                  if (npVideoId && sVideoId) {
                                    return npVideoId === sVideoId;
                                  }

                                  // If only one has videoId, don't match (prevents wrong episode)
                                  if ((npVideoId && !sVideoId) || (!npVideoId && sVideoId)) {
                                    return false;
                                  }

                                  // If neither has videoId, fall back to season/episode matching
                                  const npSeason = np.item.season ?? null;
                                  const npEpisode = np.item.episode ?? null;
                                  const sSeason = s.item.season ?? null;
                                  const sEpisode = s.item.episode ?? null;

                                  // Both must have season/episode and they must match
                                  if (npSeason !== null && npEpisode !== null && sSeason !== null && sEpisode !== null) {
                                    return npSeason === sSeason && npEpisode === sEpisode;
                                  }

                                  // If Now Playing has season/episode but session doesn't, don't match
                                  if ((npSeason !== null || npEpisode !== null) && (sSeason === null && sEpisode === null)) {
                                    return false;
                                  }

                                  // If both missing season/episode, match by item ID only (fallback)
                                }

                                // For movies: match by item ID only (no videoId)
                                return true;
                              });

                              // If multiple matches, use the one with EARLIEST startTime (oldest session)
                              // This prevents resets when new sessions are created
                              if (matchingSessions.length > 0) {
                                session = matchingSessions.reduce((oldest, current) => {
                                  const oldestTime = new Date(oldest.startTime).getTime();
                                  const currentTime = new Date(current.startTime).getTime();
                                  return currentTime < oldestTime ? current : oldest;
                                });

                                startMs = new Date(session.startTime).getTime();
                                if (Number.isNaN(startMs)) startMs = null;
                              }
                            }

                            // Fallback: If no matching session found, use watchedAtTimestamp from nowPlaying item
                            // BUT only if it's very recent (within last 5 minutes) to prevent showing stale/resetting durations
                            // This handles the case where a session hasn't been created yet (sync hasn't run)
                            if (!startMs && np.watchedAtTimestamp) {
                              const watchedAtMs = typeof np.watchedAtTimestamp === 'number'
                                ? np.watchedAtTimestamp
                                : new Date(np.watchedAt).getTime();
                              
                              // Only use fallback if watched within last 5 minutes (one sync cycle)
                              // This prevents showing incorrect durations for old items
                              const ageMs = nowTick - watchedAtMs;
                              if (ageMs >= 0 && ageMs <= 300000) { // 5 minutes = 300000ms
                                startMs = watchedAtMs;
                              }
                            }

                            // Only show duration if we have a valid startTime (from session or recent fallback)
                            if (!startMs || Number.isNaN(startMs)) return null;

                            const elapsedSeconds = Math.max(
                              0,
                              Math.floor((nowTick - startMs) / 1000)
                            );

                            return (
                              <p className="text-xs text-subtle mt-0.5">
                                Watching for{' '}
                                {elapsedSeconds > 0
                                  ? formatDuration(elapsedSeconds)
                                  : '<1m'}
                              </p>
                            );
                          })()}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </Card>
              </PageSection>
            )}


            {/* Search and View Toggle - Below Stat Cards */}
            <PageSection delay={0.08} className="mb-6">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <SearchInput
                    size="sm"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search users or content..."
                    className="w-64"
                  />

                  {selectedGroup && (
                    <Badge variant="secondary" className="pl-3 pr-1 py-1 flex items-center gap-2">
                      <FolderIcon className="w-3.5 h-3.5" />
                      <span>{groups.find(g => g.id === selectedGroup)?.name || 'Group'}</span>
                      <button
                        onClick={() => setSelectedGroup(null)}
                        className="p-0.5 rounded-md hover:bg-white/20 transition-colors"
                      >
                        <XMarkIcon className="w-3.5 h-3.5" />
                      </button>
                    </Badge>
                  )}

                  {timePeriod && (
                    <Badge variant="secondary" className="pl-3 pr-1 py-1 flex items-center gap-2">
                      <span className="capitalize">{timePeriod}</span>
                      <button
                        onClick={() => setTimePeriod(null)}
                        className="p-0.5 rounded-md hover:bg-white/20 transition-colors"
                      >
                        <XMarkIcon className="w-3.5 h-3.5" />
                      </button>
                    </Badge>
                  )}
                </div>
                <ViewModeToggle
                  mode={watchActivityViewMode}
                  onChange={(mode) => {
                    setWatchActivityViewMode(mode);
                    localStorage.setItem('watch-activity-view-mode', mode);
                  }}
                  showLabels={false}
                />
              </div>
            </PageSection>

            {/* Activity Feed */}
            <div className="space-y-6">
              {/* Date-grouped activities */}
              {groupedActivities.map((group, groupIndex) => (
                <PageSection key={group.dateKey} delay={0.1 + groupIndex * 0.02}>
                  <div className="flex items-center gap-3 mb-4">
                    <CalendarIcon className={`w-5 h-5 ${group.isToday ? 'text-secondary' : group.isYesterday ? 'text-muted' : 'text-subtle'}`} />
                    <div className="flex items-baseline gap-2">
                      <h2 className="text-lg font-semibold text-default font-display">{group.label}</h2>
                      <span className="text-sm text-muted">
                        • {formatHours(group.totalDuration / 3600)} 
                        <span className="ml-1 opacity-70">({group.activities.length})</span>
                      </span>
                    </div>
                  </div>
                  
                  {watchActivityViewMode === 'grid' ? (
                    // Grid view - Cinematic poster cards
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-3">
                      {group.activities.map((activity, idx) => (
                        <ActivityCardGrid
                          key={activity.id}
                          activity={activity}
                          onFilterByContent={(name) => {
                            setEpisodeFilter(null);
                            setSearchQuery(name);
                          }}
                        />
                      ))}
                    </div>
                  ) : (
                    // List view - Traditional activity cards
                    <StaggerContainer className="space-y-3">
                      {group.activities.map((activity) => (
                        <StaggerItem key={activity.id}>
                          <ActivityCard
                            activity={activity}
                            onFilterByContent={(name) => {
                              setEpisodeFilter(null);
                              setSearchQuery(name);
                            }}
                            onFilterByEpisode={(act) => {
                              setEpisodeFilter({
                                name: act.contentName,
                                season: act.season,
                                episode: act.episode,
                              });
                            }}
                          />
                        </StaggerItem>
                      ))}
                    </StaggerContainer>
                  )}
                </PageSection>
              ))}

              {/* Empty state */}
              {filteredActivities.length === 0 ? (
                <PageSection delay={0.1}>
                  <Card padding="lg" className="text-center py-16">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-surface-hover flex items-center justify-center">
                      <ClockIcon className="w-8 h-8 text-subtle" />
                    </div>
                    <h3 className="text-lg font-semibold text-default mb-2">No Activity Found</h3>
                    <p className="text-muted max-w-md mx-auto">
                      {searchQuery
                        ? `No activity matches "${searchQuery}". Try a different search term.`
                        : 'No activity matches your current filters. Try adjusting your filters.'}
                    </p>
                    <Button
                      variant="glass"
                      className="mt-6"
                      onClick={() => {
                        setSearchQuery('');
                        setTimePeriod(null);
                        setEpisodeFilter(null);
                      }}
                    >
                      Clear Filters
                    </Button>
                  </Card>
                </PageSection>
              ) : null}
            </div>

            {/* Infinite scroll sentinel & Load More fallback */}
            {visibleCount < filteredActivities.length && (
              <div ref={loadMoreRef} className="mt-8">
                <div className="text-center">
                  {isLoadingMore ? (
                    <div className="flex items-center justify-center gap-2 text-sm text-muted py-4">
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      <span>Loading more...</span>
                    </div>
                  ) : (
                    <Button
                      variant="glass"
                      size="lg"
                      onClick={loadMore}
                    >
                      Load more activity
                    </Button>
                  )}
                </div>
              </div>
            )}
          </>
        ) : viewMode === 'invites' ? (
          <>
            {/* Invitation History Stats */}
            <PageSection delay={0.05} className="mb-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  label="Total Invites"
                  value={isLoading ? '...' : inviteHistory.length}
                  icon={<EnvelopeIcon className="w-6 h-6" />}
                  delay={0}
                />
                <StatCard
                  label="Created"
                  value={isLoading ? '...' : inviteHistory.filter(i => i.action === 'created').length}
                  icon={<EnvelopeIcon className="w-6 h-6" />}
                  delay={0.05}
                />
                <StatCard
                  label="Used"
                  value={isLoading ? '...' : inviteHistory.filter(i => i.action === 'used').length}
                  icon={<CheckCircleIcon className="w-6 h-6" />}
                  delay={0.1}
                />
                <StatCard
                  label="Expired"
                  value={isLoading ? '...' : inviteHistory.filter(i => i.action === 'expired').length}
                  icon={<ClockIcon className="w-6 h-6" />}
                  delay={0.15}
                />
              </div>
            </PageSection>

            {/* Invitation History Feed */}
            <div className="space-y-6">
              {isLoading ? (
                <PageSection delay={0.1}>
                  <Card padding="lg" className="text-center py-16">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-surface-hover flex items-center justify-center">
                      <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin text-primary" />
                    </div>
                    <h3 className="text-lg font-semibold text-default mb-2">Loading...</h3>
                  </Card>
                </PageSection>
              ) : error ? (
                <PageSection delay={0.1}>
                  <Card padding="lg" className="text-center py-16">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-surface-hover flex items-center justify-center">
                      <XMarkIcon className="w-8 h-8 text-error" />
                    </div>
                    <h3 className="text-lg font-semibold text-default mb-2">Error Loading Data</h3>
                    <p className="text-muted">{error.message}</p>
                  </Card>
                </PageSection>
              ) : inviteHistory.length === 0 ? (
                <PageSection delay={0.1}>
                  <Card padding="lg" className="text-center py-16">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-surface-hover flex items-center justify-center">
                      <EnvelopeIcon className="w-8 h-8 text-subtle" />
                    </div>
                    <h3 className="text-lg font-semibold text-default mb-2">No Invitation History</h3>
                    <p className="text-muted max-w-md mx-auto">
                      Invitation history will appear here when invitations are created, used, or expire.
                    </p>
                  </Card>
                </PageSection>
              ) : (
                <>
                  {/* Today */}
                  {inviteHistory.filter(i => {
                    const date = new Date(i.timestamp);
                    return date >= todayStart;
                  }).length > 0 && (
                      <PageSection delay={0.1}>
                        <div className="flex items-center gap-3 mb-4">
                          <CalendarIcon className="w-5 h-5 text-primary" />
                          <h2 className="text-lg font-semibold text-default font-display">Today</h2>
                          <Badge variant="primary" size="sm">
                            {inviteHistory.filter(i => new Date(i.timestamp) >= todayStart).length}
                          </Badge>
                        </div>
                        <StaggerContainer className="space-y-3">
                          {inviteHistory
                            .filter(i => new Date(i.timestamp) >= todayStart)
                            .map((invite) => (
                              <StaggerItem key={invite.id}>
                                <motion.div
                                  whileHover={{ x: 4 }}
                                  className="flex items-start gap-4 p-4 rounded-xl bg-surface hover:bg-surface-hover transition-colors"
                                  style={{
                                    background: 'var(--color-surface)',
                                    border: '1px solid var(--color-surface-border)',
                                  }}
                                >
                                  {/* Invite action icon */}
                                  <div className={`p-2 rounded-lg ${invite.action === 'created'
                                    ? 'text-primary bg-primary-muted'
                                    : invite.action === 'used'
                                      ? 'text-success bg-success-muted'
                                      : invite.action === 'expired'
                                        ? 'text-warning bg-warning-muted'
                                        : 'text-error bg-error-muted'
                                    }`}>
                                    {invite.action === 'created' ? (
                                      <EnvelopeIcon className="w-4 h-4" />
                                    ) : invite.action === 'used' ? (
                                      <CheckCircleIcon className="w-4 h-4" />
                                    ) : invite.action === 'expired' ? (
                                      <ClockIcon className="w-4 h-4" />
                                    ) : (
                                      <XMarkIcon className="w-4 h-4" />
                                    )}
                                  </div>

                                  {/* Invite details */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <h4 className="text-sm font-medium text-default">
                                        Invite <span className="font-mono">{invite.inviteCode}</span>
                                      </h4>
                                      <Badge
                                        variant="primary"
                                        size="sm"
                                      >
                                        {invite.groupName}
                                      </Badge>
                                    </div>
                                    <p className="text-xs text-muted mt-1">
                                      {invite.action === 'created' && 'Invite created'}
                                      {invite.action === 'used' && invite.userName && `Used by ${invite.userName}`}
                                      {invite.action === 'used' && !invite.userName && 'Invite used'}
                                      {invite.action === 'expired' && 'Invite expired'}
                                      {invite.action === 'deleted' && 'Invite deleted'}
                                    </p>
                                  </div>

                                  {/* Timestamp */}
                                  <div className="text-right">
                                    <p className="text-xs text-subtle">{formatTimestamp(invite.timestamp)}</p>
                                  </div>
                                </motion.div>
                              </StaggerItem>
                            ))}
                        </StaggerContainer>
                      </PageSection>
                    )}

                  {/* Yesterday */}
                  {inviteHistory.filter(i => {
                    const date = new Date(i.timestamp);
                    return date >= yesterdayStart && date < todayStart;
                  }).length > 0 && (
                      <PageSection delay={0.15}>
                        <div className="flex items-center gap-3 mb-4">
                          <CalendarIcon className="w-5 h-5 text-muted" />
                          <h2 className="text-lg font-semibold text-default font-display">Yesterday</h2>
                          <Badge variant="muted" size="sm">
                            {inviteHistory.filter(i => {
                              const date = new Date(i.timestamp);
                              return date >= yesterdayStart && date < todayStart;
                            }).length}
                          </Badge>
                        </div>
                        <StaggerContainer className="space-y-3">
                          {inviteHistory
                            .filter(i => {
                              const date = new Date(i.timestamp);
                              return date >= yesterdayStart && date < todayStart;
                            })
                            .map((invite) => (
                              <StaggerItem key={invite.id}>
                                <motion.div
                                  whileHover={{ x: 4 }}
                                  className="flex items-start gap-4 p-4 rounded-xl bg-surface hover:bg-surface-hover transition-colors"
                                  style={{
                                    background: 'var(--color-surface)',
                                    border: '1px solid var(--color-surface-border)',
                                  }}
                                >
                                  {/* Invite action icon */}
                                  <div className={`p-2 rounded-lg ${invite.action === 'created'
                                    ? 'text-primary bg-primary-muted'
                                    : invite.action === 'used'
                                      ? 'text-success bg-success-muted'
                                      : invite.action === 'expired'
                                        ? 'text-warning bg-warning-muted'
                                        : 'text-error bg-error-muted'
                                    }`}>
                                    {invite.action === 'created' ? (
                                      <EnvelopeIcon className="w-4 h-4" />
                                    ) : invite.action === 'used' ? (
                                      <CheckCircleIcon className="w-4 h-4" />
                                    ) : invite.action === 'expired' ? (
                                      <ClockIcon className="w-4 h-4" />
                                    ) : (
                                      <XMarkIcon className="w-4 h-4" />
                                    )}
                                  </div>

                                  {/* Invite details */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <h4 className="text-sm font-medium text-default">
                                        Invite <span className="font-mono">{invite.inviteCode}</span>
                                      </h4>
                                      <Badge
                                        variant="primary"
                                        size="sm"
                                      >
                                        {invite.groupName}
                                      </Badge>
                                    </div>
                                    <p className="text-xs text-muted mt-1">
                                      {invite.action === 'created' && 'Invite created'}
                                      {invite.action === 'used' && invite.userName && `Used by ${invite.userName}`}
                                      {invite.action === 'used' && !invite.userName && 'Invite used'}
                                      {invite.action === 'expired' && 'Invite expired'}
                                      {invite.action === 'deleted' && 'Invite deleted'}
                                    </p>
                                  </div>

                                  {/* Timestamp */}
                                  <div className="text-right">
                                    <p className="text-xs text-subtle">{formatTimestamp(invite.timestamp)}</p>
                                  </div>
                                </motion.div>
                              </StaggerItem>
                            ))}
                        </StaggerContainer>
                      </PageSection>
                    )}

                  {/* Older */}
                  {inviteHistory.filter(i => new Date(i.timestamp) < yesterdayStart).length > 0 && (
                    <PageSection delay={0.2}>
                      <div className="flex items-center gap-3 mb-4">
                        <CalendarIcon className="w-5 h-5 text-subtle" />
                        <h2 className="text-lg font-semibold text-default font-display">Earlier</h2>
                        <Badge variant="muted" size="sm">
                          {inviteHistory.filter(i => new Date(i.timestamp) < yesterdayStart).length}
                        </Badge>
                      </div>
                      <StaggerContainer className="space-y-3">
                        {inviteHistory
                          .filter(i => new Date(i.timestamp) < yesterdayStart)
                          .map((invite) => (
                              <StaggerItem key={invite.id}>
                                <motion.div
                                  whileHover={{ x: 4 }}
                                  className="flex items-start gap-4 p-4 rounded-xl bg-surface hover:bg-surface-hover transition-colors"
                                  style={{
                                    background: 'var(--color-surface)',
                                    border: '1px solid var(--color-surface-border)',
                                  }}
                                >
                                {/* Invite action icon */}
                                <div className={`p-2 rounded-lg ${invite.action === 'created'
                                  ? 'text-primary bg-primary-muted'
                                  : invite.action === 'used'
                                    ? 'text-success bg-success-muted'
                                    : invite.action === 'expired'
                                      ? 'text-warning bg-warning-muted'
                                      : 'text-error bg-error-muted'
                                  }`}>
                                  {invite.action === 'created' ? (
                                    <EnvelopeIcon className="w-4 h-4" />
                                  ) : invite.action === 'used' ? (
                                    <CheckCircleIcon className="w-4 h-4" />
                                  ) : invite.action === 'expired' ? (
                                    <ClockIcon className="w-4 h-4" />
                                  ) : (
                                    <XMarkIcon className="w-4 h-4" />
                                  )}
                                </div>

                                {/* Invite details */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <h4 className="text-sm font-medium text-default">
                                      Invite <span className="font-mono">{invite.inviteCode}</span>
                                    </h4>
                                    <Badge
                                      variant="primary"
                                      size="sm"
                                    >
                                      {invite.groupName}
                                    </Badge>
                                  </div>
                                  <p className="text-xs text-muted mt-1">
                                    {invite.action === 'created' && 'Invite created'}
                                    {invite.action === 'used' && invite.userName && `Used by ${invite.userName}`}
                                    {invite.action === 'used' && !invite.userName && 'Invite used'}
                                    {invite.action === 'expired' && 'Invite expired'}
                                    {invite.action === 'deleted' && 'Invite deleted'}
                                  </p>
                                </div>

                                {/* Timestamp */}
                                <div className="text-right">
                                  <p className="text-xs text-subtle">{formatTimestamp(invite.timestamp)}</p>
                                </div>
                              </motion.div>
                            </StaggerItem>
                          ))}
                      </StaggerContainer>
                    </PageSection>
                  )}
                </>
              )}
            </div>
          </>
        ) : viewMode === 'proxy' ? (
          <ProxyHistoryView />
        ) : (
          <>
            {/* Task History Stats */}
            <PageSection delay={0.05} className="mb-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  label="Successful"
                  value={taskHistory.filter(t => t.status === 'success').length}
                  icon={<CheckCircleIcon className="w-6 h-6" />}
                  delay={0}
                />
                <StatCard
                  label="Partial"
                  value={taskHistory.filter(t => t.status === 'partial').length}
                  icon={<ExclamationTriangleIcon className="w-6 h-6" />}
                  delay={0.05}
                />
                <StatCard
                  label="Failed"
                  value={taskHistory.filter(t => t.status === 'failed').length}
                  icon={<ExclamationTriangleIcon className="w-6 h-6" />}
                  delay={0.1}
                />
                <StatCard
                  label="Total Tasks"
                  value={taskHistory.length}
                  icon={<ClockIcon className="w-6 h-6" />}
                  delay={0.15}
                />
              </div>
            </PageSection>

            {/* Task History Feed */}
            <div className="space-y-6">
              {/* Today */}
              {todayTasks.length > 0 ? (
                <PageSection delay={0.1}>
                  <div className="flex items-center gap-3 mb-4">
                    <CalendarIcon className="w-5 h-5 text-primary" />
                    <h2 className="text-lg font-semibold text-default font-display">Today</h2>
                    <Badge variant="primary" size="sm">{todayTasks.length}</Badge>
                  </div>
                  <StaggerContainer className="space-y-3">
                    {todayTasks.map((task) => (
                      <StaggerItem key={task.id}>
                        <TaskHistoryCard task={task} />
                      </StaggerItem>
                    ))}
                  </StaggerContainer>
                </PageSection>
              ) : null}

              {/* Yesterday */}
              {yesterdayTasks.length > 0 ? (
                <PageSection delay={0.15}>
                  <div className="flex items-center gap-3 mb-4">
                    <CalendarIcon className="w-5 h-5 text-muted" />
                    <h2 className="text-lg font-semibold text-default font-display">Yesterday</h2>
                    <Badge variant="muted" size="sm">{yesterdayTasks.length}</Badge>
                  </div>
                  <StaggerContainer className="space-y-3">
                    {yesterdayTasks.map((task) => (
                      <StaggerItem key={task.id}>
                        <TaskHistoryCard task={task} />
                      </StaggerItem>
                    ))}
                  </StaggerContainer>
                </PageSection>
              ) : null}

              {/* Older */}
              {olderTasks.length > 0 ? (
                <PageSection delay={0.2}>
                  <div className="flex items-center gap-3 mb-4">
                    <CalendarIcon className="w-5 h-5 text-subtle" />
                    <h2 className="text-lg font-semibold text-default font-display">Earlier</h2>
                    <Badge variant="muted" size="sm">{olderTasks.length}</Badge>
                  </div>
                  <StaggerContainer className="space-y-3">
                    {olderTasks.map((task) => (
                      <StaggerItem key={task.id}>
                        <TaskHistoryCard task={task} />
                      </StaggerItem>
                    ))}
                  </StaggerContainer>
                </PageSection>
              ) : null}

              {/* Empty state */}
              {taskHistory.length === 0 ? (
                <PageSection delay={0.1}>
                  <Card padding="lg" className="text-center py-16">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-surface-hover flex items-center justify-center">
                      <ClockIcon className="w-8 h-8 text-subtle" />
                    </div>
                    <h3 className="text-lg font-semibold text-default mb-2">No Task History</h3>
                    <p className="text-muted max-w-md mx-auto">
                      Task history will appear here after running sync operations, backups, or imports.
                    </p>
                  </Card>
                </PageSection>
              ) : null}
            </div>

            {/* Load More */}
            {taskHistory.length > 0 ? (
              <PageSection delay={0.25} className="mt-8">
                <div className="text-center">
                  <Button variant="glass" size="lg">
                    Load More History
                  </Button>
                </div>
              </PageSection>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

export default function ActivityPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ActivityPageContent />
    </Suspense>
  );
}
