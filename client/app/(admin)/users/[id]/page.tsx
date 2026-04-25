'use client';

import { useState, useCallback, memo, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams, useRouter } from 'next/navigation';
import { api, Addon, StremioAddon } from '@/lib/api';
import { useTheme } from '@/lib/theme';
import Link from 'next/link';
import { Header, Breadcrumbs } from '@/components/layout/Header';
import { Button, Card, StatCard, Avatar, Badge, StatusBadge, Modal, ConfirmModal, ColorPicker, DateTimePicker, InlineEdit, ToggleSwitch, Select, SyncBadge, Input, VersionBadge, ResourceBadge, UserAvatar } from '@/components/ui';
import { CreateUserModal } from '@/components/modals/CreateUserModal';
import { PageSection, StaggerContainer, StaggerItem } from '@/components/layout/PageContainer';
import { toast } from '@/components/ui/Toast';
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  PencilIcon,
  TrashIcon,
  UsersIcon,
  ClockIcon,
  FireIcon,
  ChartBarIcon,
  FilmIcon,
  TvIcon,
  CalendarIcon,
  PlayIcon,
  BoltIcon,
  XMarkIcon,
  PuzzlePieceIcon,
  EyeIcon,
  EyeSlashIcon,
  ShieldCheckIcon,
  Bars3Icon,
  CheckCircleIcon,
  ArrowDownTrayIcon,
  FolderIcon,
} from '@heroicons/react/24/outline';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import { restrictToParentElement } from '@dnd-kit/modifiers';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { format } from 'date-fns';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';

// Watch time data type
interface WatchTimeDataPoint {
  date: string;
  minutes: number;
  movies: number;
  series: number;
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return `${days}d ${remainingHours}h`;
}

// Memoized tooltip style to avoid recreating on each render (Vercel best practice: rerender-memo-with-default-value)
const TOOLTIP_STYLE = {
  backgroundColor: 'rgba(30, 30, 56, 0.9)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '12px',
  backdropFilter: 'blur(12px)',
} as const;

const TOOLTIP_LABEL_STYLE = { color: '#fff' } as const;

// Memoized chart components to prevent unnecessary re-renders (Vercel best practice: rerender-memo)
const WatchTimeChart = memo(function WatchTimeChart({ data }: { data: WatchTimeDataPoint[] }) {
  // Calculate max minutes to determine ticks dynamically
  const maxMinutes = Math.max(...data.map(d => d.minutes), 60);
  const hourTicks = Math.ceil(maxMinutes / 30);
  const ticks = Array.from({ length: hourTicks + 1 }, (_, i) => i * 30);

  return (
    <Card padding="lg">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-default font-display">Watch Time</h3>
        <div className="flex items-center gap-2">
          <select 
            className="px-3 py-1.5 rounded-lg bg-surface border border-default text-sm text-default"
            aria-label="Select time period"
          >
            <option>This Week</option>
            <option>This Month</option>
            <option>This Year</option>
          </select>
        </div>
      </div>

      <div className="h-40 md:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorMinutes" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-chart-1)" stopOpacity={0.4} />
                <stop offset="95%" stopColor="var(--color-chart-1)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
            <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
            <YAxis 
              stroke="#64748b" 
              fontSize={12} 
              ticks={ticks}
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
              formatter={(value: any) => [formatMinutes(value), 'Watch Time']}
            />
            <Area
              type="monotone"
              dataKey="minutes"
              stroke="var(--color-chart-1)"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorMinutes)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t border-default">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full" style={{ background: 'var(--color-chart-1)' }} />
          <span className="text-sm text-muted">Total</span>
        </div>
      </div>
    </Card>
  );
});

const ContentBreakdownChart = memo(function ContentBreakdownChart({ data }: { data: WatchTimeDataPoint[] }) {
  return (
    <Card padding="lg">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-default font-display">Content Breakdown</h3>
      </div>

      <div className="h-40 md:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
            <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
            <YAxis stroke="#64748b" fontSize={12} />
            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
            <Bar dataKey="movies" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="series" fill="var(--color-chart-2)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
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
  );
});

// Sortable Group Addon Item Component
interface SortableGroupAddonItemProps {
  addon: Addon;
  isExcluded: boolean;
  onToggleExclude: (addonId: string) => void;
}

function SortableGroupAddonItem({ addon, isExcluded, onToggleExclude }: SortableGroupAddonItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: addon.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-4 rounded-xl border transition-all group bg-surface-hover hover:bg-surface ${
        isExcluded ? 'opacity-50 border-default' : 'border-default hover:border-primary'
      } ${isDragging ? 'shadow-lg ring-2 ring-primary' : ''}`}
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-surface-hover"
      >
        <Bars3Icon className="w-5 h-5 text-subtle" />
      </div>

      {/* Addon icon */}
      <div className="w-10 h-10 rounded-lg bg-primary-muted flex items-center justify-center shrink-0">
        {(addon as any).customLogo ? (
          <img src={(addon as any).customLogo} alt={addon.name} className="w-6 h-6 object-contain" />
        ) : addon.logo ? (
          <img src={addon.logo} alt={addon.name} className="w-6 h-6 object-contain" />
        ) : (
          <PuzzlePieceIcon className="w-5 h-5 text-primary" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h4 className={`font-medium truncate ${isExcluded ? 'text-muted line-through' : 'text-default'}`}>
            {addon.name}
          </h4>
          {addon.version && <VersionBadge version={addon.version} size="sm" />}
          {(addon as any).isBackup && <Badge variant="warning" size="sm" title={`Primary (${(addon as any).primaryAddonName}) is offline`}>Backup</Badge>}
          {isExcluded && <Badge variant="error" size="sm">Excluded</Badge>}
        </div>
        {(addon as any).isBackup && (addon as any).primaryAddonName && (
          <p className="text-xs text-warning truncate mb-1">Primary offline: {(addon as any).primaryAddonName}</p>
        )}
        {addon.description && (
          <p className="text-xs text-muted truncate mb-1">{addon.description}</p>
        )}
        {addon.resources && addon.resources.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {addon.resources.slice(0, 4).map((res: string) => (
              <ResourceBadge key={res} resource={res} />
            ))}
            {addon.resources.length > 4 && (
              <Badge variant="muted" size="sm" className="bg-surface">+{addon.resources.length - 4}</Badge>
            )}
          </div>
        )}
      </div>

      {/* Exclude toggle */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onToggleExclude(addon.id)}
          title={isExcluded ? 'Include addon' : 'Exclude addon'}
        >
          {isExcluded ? (
            <EyeSlashIcon className="w-4 h-4 text-muted" />
          ) : (
            <EyeIcon className="w-4 h-4 text-default" />
          )}
        </Button>
      </div>
    </motion.div>
  );
}

// Sortable Stremio Addon Item Component
interface SortableStremioAddonProps {
  addon: StremioAddon;
  index: number;
  isProtected: boolean;
  onToggleProtect: (name: string) => void;
  onRemove: (name: string) => void;
}

function SortableStremioAddonItem({ addon, index, isProtected, onToggleProtect, onRemove }: SortableStremioAddonProps) {
  const uniqueId = `${index}-${addon.transportUrl}`;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: uniqueId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  const name = addon.manifest?.name || 'Unknown Addon';
  const version = addon.manifest?.version;
  const description = addon.manifest?.description;
  const logo = addon.manifest?.logo;

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-4 rounded-xl bg-surface-hover hover:bg-surface transition-all border border-default group ${
        isDragging ? 'shadow-lg ring-2 ring-primary' : ''
      }`}
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-surface-hover"
      >
        <Bars3Icon className="w-5 h-5 text-subtle" />
      </div>

      {/* Addon icon */}
      <div className="w-10 h-10 rounded-lg bg-primary-muted flex items-center justify-center shrink-0">
        {logo ? (
          <img src={logo} alt={name} className="w-6 h-6 object-contain" />
        ) : (
          <PuzzlePieceIcon className="w-5 h-5 text-primary" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="font-medium text-default truncate">{name}</h4>
          {version && <VersionBadge version={version} size="sm" />}
          {isProtected && (
            <Badge variant="success" size="sm">
              <ShieldCheckIcon className="w-3 h-3 mr-1" />
              Protected
            </Badge>
          )}
        </div>
        {description && <p className="text-xs text-muted truncate mb-1">{description}</p>}
        {addon.manifest?.resources && addon.manifest.resources.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {addon.manifest.resources.slice(0, 4).map((res: any) => {
              const resName = typeof res === 'string' ? res : res.name;
              return <ResourceBadge key={resName} resource={resName} />;
            })}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onToggleProtect(name)}
          title={isProtected ? 'Remove protection' : 'Protect addon'}
        >
          <ShieldCheckIcon className={`w-4 h-4 ${isProtected ? 'text-success' : 'text-muted'}`} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRemove(name)}
          className="text-error hover:bg-error-muted"
        >
          <XMarkIcon className="w-4 h-4" />
        </Button>
      </div>
    </motion.div>
  );
}

export default function UserDetailPage() {
  const { hideSensitive } = useTheme();
  const params = useParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'overview' | 'addons'>('overview');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isEditDetailsOpen, setIsEditDetailsOpen] = useState(false);
  const [isReconnectModalOpen, setIsReconnectModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());

  // Update ticker every second
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Time boundaries for grouping (Local Time)
  const dateBoundaries = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekStart = todayStart - 7 * 24 * 60 * 60 * 1000;
    return { todayStart, weekStart };
  }, []);

  // Data state
  const [user, setUser] = useState<any>(null);
  const [groups, setGroups] = useState<any[]>([]);
  const [watchTimeData, setWatchTimeData] = useState<WatchTimeDataPoint[]>([]);
  const [totalWatchTimeSeconds, setTotalWatchTimeSeconds] = useState(0);
  const [streaks, setStreaks] = useState<any>(null);
  const [metricsData, setMetricsData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Addons state
  const [groupAddons, setGroupAddons] = useState<Addon[]>([]);
  const [stremioAddons, setStremioAddons] = useState<StremioAddon[]>([]);
  const [excludedAddonIds, setExcludedAddonIds] = useState<Set<string>>(new Set());
  const [protectedAddonNames, setProtectedAddonNames] = useState<Set<string>>(new Set());
  const [isRefreshingAddons, setIsRefreshingAddons] = useState(false);
  const [showSyncDebug, setShowSyncDebug] = useState(false);
  const [syncPlanLoading, setSyncPlanLoading] = useState(false);
  const [syncPlanError, setSyncPlanError] = useState<string | null>(null);
  const [syncPlan, setSyncPlan] = useState<{
    alreadySynced: boolean;
    current: { name: string; transportUrl: string; fingerprint: string }[];
    desired: { name: string; transportUrl: string; fingerprint: string }[];
    currentCount: number;
    desiredCount: number;
  } | null>(null);

  const refreshSyncPlan = useCallback(async () => {
    setSyncPlanLoading(true);
    setSyncPlanError(null);
    try {
      const plan = await api.getUserSyncPlan(params.id as string);
      setSyncPlan(plan);
    } catch (err: any) {
      console.error('Failed to fetch sync plan:', err);
      setSyncPlanError(err?.message || 'Failed to fetch sync plan');
    } finally {
      setSyncPlanLoading(false);
    }
  }, [params.id]);

  const refreshGroupAddons = useCallback(async (showSpinner = true) => {
    if (showSpinner) setIsRefreshingAddons(true);
    try {
      const data = await api.getUserGroupAddons(params.id as string).catch(() => []);
      setGroupAddons(data || []);
    } finally {
      if (showSpinner) setIsRefreshingAddons(false);
    }
  }, [params.id]);

  // Poll group addons every 30s so backup/primary state stays fresh
  useEffect(() => {
    const interval = setInterval(() => refreshGroupAddons(false), 30000);
    return () => clearInterval(interval);
  }, [refreshGroupAddons]);

  // Derive user-specific sessions from metricsData
  const userSessions = useMemo(() => {
    if (!metricsData?.watchSessions || !params.id) return [];
    
    const targetId = String(params.id);
    const targetUsername = user?.username?.toLowerCase();

    return metricsData.watchSessions.filter((s: any) => {
      const sessionId = String(s.user.id);
      const sessionUsername = s.user.username?.toLowerCase();
      
      return sessionId === targetId || (targetUsername && sessionUsername === targetUsername);
    });
  }, [metricsData, params.id, user]);

  const userTopItems = useMemo(() => {
    const itemsMap = new Map<string, any>();
    userSessions.forEach((s: any) => {
      if (!itemsMap.has(s.item.id)) {
        itemsMap.set(s.item.id, {
          id: s.item.id,
          name: s.item.name,
          type: s.item.type,
          poster: s.item.poster,
          watchTime: 0,
        });
      }
      const item = itemsMap.get(s.item.id);
      // Use durationSeconds if session is complete, otherwise use elapsed time
      const sessionStart = new Date(s.startTime).getTime();
      const sessionEnd = s.endTime ? new Date(s.endTime).getTime() : nowTick;
      const duration = s.endTime ? (s.durationSeconds || 0) : Math.max(0, (nowTick - sessionStart) / 1000);
      
      item.watchTime += duration / 60;
    });
    const sorted = Array.from(itemsMap.values()).sort((a, b) => b.watchTime - a.watchTime);
    const maxTime = sorted[0]?.watchTime || 1;
    return sorted.slice(0, 5).map(item => ({ ...item, progress: (item.watchTime / maxTime) * 100 }));
  }, [userSessions, nowTick]);

  const userRecentActivity = useMemo(() => {
    return [...userSessions]
      .sort((a: any, b: any) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
      .slice(0, 5);
  }, [userSessions]);

  const liveTodayMinutes = useMemo(() => {
    let totalSeconds = 0;
    userSessions.forEach((s: any) => {
      const sessionStart = new Date(s.startTime).getTime();
      const sessionEnd = s.endTime ? new Date(s.endTime).getTime() : nowTick;
      const start = Math.max(sessionStart, dateBoundaries.todayStart);
      if (sessionEnd > start) totalSeconds += (sessionEnd - start) / 1000;
    });
    return Math.round(totalSeconds / 60);
  }, [userSessions, nowTick, dateBoundaries]);

  const liveWeekMinutes = useMemo(() => {
    let totalSeconds = 0;
    userSessions.forEach((s: any) => {
      const sessionStart = new Date(s.startTime).getTime();
      const sessionEnd = s.endTime ? new Date(s.endTime).getTime() : nowTick;
      const start = Math.max(sessionStart, dateBoundaries.weekStart);
      if (sessionEnd > start) totalSeconds += (sessionEnd - start) / 1000;
    });
    return Math.round(totalSeconds / 60);
  }, [userSessions, nowTick, dateBoundaries]);

  // Calculate absolute total watch time (completed sessions from API + current live session)
  const absoluteTotalMinutes = useMemo(() => {
    if (!user) return 0;
    
    let extraSeconds = 0;
    if (metricsData?.nowPlaying) {
      metricsData.nowPlaying
        .filter((np: any) => np.user.id === params.id || np.user.username === user.username)
        .forEach((np: any) => {
          const startMs = np.watchedAtTimestamp || new Date(np.watchedAt).getTime();
          if (startMs) {
            extraSeconds += Math.max(0, (nowTick - startMs) / 1000);
          }
        });
    }
    
    return (user.watchTime || 0) + Math.round(extraSeconds / 60);
  }, [user, metricsData, nowTick, params.id]);

  // UI state for user detail page
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [expiresAtValue, setExpiresAtValue] = useState('');
  const avatarRef = useRef<HTMLDivElement>(null);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Fetch user data
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [userData, groupsData, watchTime, topItemsData, streaksData, metrics, groupAddonsData, stremioAddonsData] = await Promise.all([
          api.getUser(params.id as string),
          api.getGroups(),
          api.getUserWatchTime(params.id as string, 'year').catch(() => null),
          api.getUserTopItems(params.id as string, 5).catch(() => []),
          api.getUserStreaks(params.id as string).catch(() => null),
          api.getMetrics('7d').catch(() => null),
          api.getUserGroupAddons(params.id as string).catch(() => []),
          api.getUserStremioAddons(params.id as string).catch((err) => {
            console.error('Failed to fetch Stremio addons:', err);
            return [];
          }),
        ]);
        setUser(userData);
        setGroups(groupsData);
        setStreaks(streaksData);
        setMetricsData(metrics);
        setGroupAddons(groupAddonsData || []);
        setStremioAddons(stremioAddonsData || []);
        
        // Set total watch time from absolute user total (minutes -> seconds)
        if ((userData as any)?.watchTime !== undefined) {
          setTotalWatchTimeSeconds((userData as any).watchTime * 60);
        } else if (watchTime) {
          setTotalWatchTimeSeconds(watchTime.totalWatchTimeSeconds || 0);
        }
        
        // Debug logging
        if (stremioAddonsData && stremioAddonsData.length > 0) {
          console.log('Loaded Stremio addons:', stremioAddonsData.length, stremioAddonsData);
        } else {
          console.log('No Stremio addons found or empty array');
        }

        // Set excluded and protected addons from user data
        if (userData?.excludedAddons) {
          setExcludedAddonIds(new Set(userData.excludedAddons));
        }
        if (userData?.protectedAddons) {
          setProtectedAddonNames(new Set(userData.protectedAddons));
        }

        // Transform watch time data
        if (watchTime) {
          // Use byDate from API response (fixed interface)
          const periods = watchTime.byDate || [];
          // Sort by date just in case
          periods.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
          
          const transformed = periods.map((p: any) => ({
            date: p.date,
            minutes: Math.round((p.watchTimeSeconds || 0) / 60),
            movies: p.movies || 0,
            series: p.shows || 0,
          }));
          setWatchTimeData(transformed);
          setTotalWatchTimeSeconds(watchTime.totalWatchTimeSeconds || 0);
        }
      } catch (err) {
        setError(err as Error);
      } finally {
        setIsLoading(false);
      }
    };

    if (params.id) {
      fetchData();
    }
  }, [params.id]);

  useEffect(() => {
    if (user) {
      document.title = `Syncio - ${user.username || user.name || 'User Detail'}`;
    }
  }, [user]);

  const handleSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      await api.syncUser(params.id as string);
    } catch {
      // Fallback to mock delay if API fails
      await new Promise(resolve => setTimeout(resolve, 2000));
    } finally {
      setIsSyncing(false);
    }
  }, [params.id]);

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      await api.deleteUser(params.id as string);
      setIsDeleteModalOpen(false);
      router.push('/users');
    } catch {
      // If API fails, just close modal (mock behavior)
      setIsDeleteModalOpen(false);
      router.push('/users');
    } finally {
      setIsDeleting(false);
    }
  }, [params.id, router]);

  // Handle color change
  const handleColorChange = useCallback(async (colorIndex: number) => {
    // Optimistic update
    setUser((prev: any) => prev ? { ...prev, colorIndex } : null);
    
    try {
      await api.updateUser(params.id as string, { colorIndex });
      toast.success('User color updated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update user color');
      // Refresh to revert
      const userData = await api.getUser(params.id as string);
      setUser(userData);
    }
  }, [params.id]);

  // Handle username update
  const handleUsernameUpdate = useCallback(async (newUsername: string) => {
    try {
      await api.updateUser(params.id as string, { username: newUsername });
      toast.success('Username updated');
      // Refresh user data
      const userData = await api.getUser(params.id as string);
      setUser(userData);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update username');
    }
  }, [params.id]);

  // Handle expiresAt change
  const handleExpiresAtChange = useCallback(async (value: string) => {
    setExpiresAtValue(value);
    try {
      await api.updateUser(params.id as string, { expiresAt: value || null });
      toast.success('Expiration date updated');
      // Refresh user data
      const userData = await api.getUser(params.id as string);
      setUser(userData);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update expiration date');
    }
  }, [params.id]);

  // Handle group change
  const handleGroupChange = useCallback(async (groupId: string) => {
    try {
      const currentUser = await api.getUser(params.id as string);
      const currentGroupIds = currentUser.groupIds || (currentUser.groupId ? [currentUser.groupId] : []);
      
      if (groupId) {
        // Add to new group if not already in it
        if (!currentGroupIds.includes(groupId)) {
          await api.addUserToGroup(groupId, params.id as string);
        }
        // Remove from other groups
        for (const gId of currentGroupIds) {
          if (gId !== groupId) {
            try {
              await api.removeUserFromGroup(gId, params.id as string);
            } catch {
              // Ignore errors for individual removals
            }
          }
        }
      } else {
        // Remove from all groups
        for (const gId of currentGroupIds) {
          try {
            await api.removeUserFromGroup(gId, params.id as string);
          } catch {
            // Ignore errors for individual removals
          }
        }
      }
      toast.success('Group updated');
      // Refresh user data
      const userData = await api.getUser(params.id as string);
      setUser(userData);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update group');
    }
  }, [params.id]);

  // Handle toggle active status
  const handleToggleActive = useCallback(async () => {
    try {
      const newStatus = !user?.isActive;
      await api.toggleUserStatus(params.id as string, newStatus);
      toast.success(`User ${newStatus ? 'activated' : 'deactivated'}`);
      // Refresh user data
      const userData = await api.getUser(params.id as string);
      setUser(userData);
    } catch (err: any) {
      toast.error(err.message || 'Failed to toggle user status');
    }
  }, [params.id, user?.isActive]);

  // Handle reset Stremio addons
  const handleResetStremioAddons = useCallback(async () => {
    try {
      // Clear all Stremio addons by removing them one by one
      for (const addon of stremioAddons) {
        const addonName = addon.manifest?.name || '';
        if (addonName) {
          try {
            await api.removeUserStremioAddon(params.id as string, addonName);
          } catch {
            // Ignore individual errors
          }
        }
      }
      toast.success('Stremio addons cleared');
      // Refresh user data
      const stremioAddonsData = await api.getUserStremioAddons(params.id as string);
      setStremioAddons(stremioAddonsData || []);
    } catch (err: any) {
      toast.error(err.message || 'Failed to clear Stremio addons');
    }
  }, [params.id, stremioAddons]);

  // Handle toggling addon exclusion
  const handleToggleExclude = useCallback(async (addonId: string) => {
    const newExcluded = new Set(excludedAddonIds);
    const wasExcluded = newExcluded.has(addonId);
    if (wasExcluded) {
      newExcluded.delete(addonId);
    } else {
      newExcluded.add(addonId);
    }

    // Optimistic update
    setExcludedAddonIds(newExcluded);

    try {
      await api.updateUserExcludedAddons(params.id as string, Array.from(newExcluded));
      toast.success(wasExcluded ? 'Addon included' : 'Addon excluded');
    } catch (err: any) {
      // Revert on error
      if (wasExcluded) {
        newExcluded.add(addonId);
      } else {
        newExcluded.delete(addonId);
      }
      setExcludedAddonIds(newExcluded);
      toast.error(err.message || 'Failed to update addon');
    }
  }, [params.id, excludedAddonIds]);

  // Handle toggling addon protection
  const handleToggleProtect = useCallback(async (addonName: string) => {
    try {
      const result = await api.toggleUserProtectedAddon(params.id as string, addonName);
      const newProtected = new Set(protectedAddonNames);
      if (result.isProtected) {
        newProtected.add(addonName);
      } else {
        newProtected.delete(addonName);
      }
      setProtectedAddonNames(newProtected);
      toast.success(result.message);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update addon protection');
    }
  }, [params.id, protectedAddonNames]);

  // Handle removing Stremio addon
  const handleRemoveStremioAddon = useCallback(async (addonName: string) => {
    try {
      await api.removeUserStremioAddon(params.id as string, addonName);
      setStremioAddons(prev => prev.filter(a => a.manifest?.name !== addonName));
      toast.success('Addon removed from Stremio account');
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove addon');
    }
  }, [params.id]);

  // Handle importing addons from user
  const handleImport = useCallback(async () => {
    if (!user) return;
    try {
      toast.success(`Importing addons from ${user.username || user.name}...`);
      const result = await api.importUserAddons(user.id);
      toast.success(result.message || `Successfully imported ${result.importedCount} addon${result.importedCount !== 1 ? 's' : ''}`);
      
      // Refresh addons data
      try {
        const [groupAddonsData, stremioAddonsData] = await Promise.all([
          api.getUserGroupAddons(params.id as string).catch(() => []),
          api.getUserStremioAddons(params.id as string).catch((err) => {
            console.error('Failed to fetch Stremio addons:', err);
            return [];
          }),
        ]);
        setGroupAddons(groupAddonsData || []);
        setStremioAddons(stremioAddonsData || []);
      } catch (e) {
        console.error('Failed to refresh addons after import', e);
      }
    } catch (err: any) {
      toast.error(err.message || `Failed to import addons`);
    }
  }, [user, params.id]);

  // Handle group addon drag end for reordering
  const handleGroupAddonDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = groupAddons.findIndex(a => a.id === active.id);
    const newIndex = groupAddons.findIndex(a => a.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    // Optimistic update
    const newAddons = arrayMove(groupAddons, oldIndex, newIndex);
    setGroupAddons(newAddons);

    try {
      const groupId = (user.groupIds && user.groupIds.length > 0 ? user.groupIds[0] : user.groupId);
      if (groupId) {
        const stringIds = newAddons.map(a => String(a.id));
        await api.reorderGroupAddons(groupId, stringIds);
        toast.success('Group addon order updated');
      }
    } catch (err: any) {
      setGroupAddons(groupAddons);
      toast.error(err.message || 'Failed to update addon order');
    }
  }, [groupAddons, user]);

  // Handle Stremio addon drag end for reordering
  const handleStremioAddonDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = parseInt(String(active.id).split('-')[0]);
    const newIndex = parseInt(String(over.id).split('-')[0]);

    if (isNaN(oldIndex) || isNaN(newIndex)) return;

    // Optimistic update
    const newAddons = arrayMove(stremioAddons, oldIndex, newIndex);
    setStremioAddons(newAddons);

    try {
      const orderedNames = newAddons.map(a => a.manifest?.name || 'Unknown');
      await api.reorderUserStremioAddons(params.id as string, orderedNames);
      toast.success('Addon order updated');
    } catch (err: any) {
      // Revert on error
      setStremioAddons(stremioAddons);
      toast.error(err.message || 'Failed to update addon order');
    }
  }, [params.id, stremioAddons]);

  return (
    <>
      <Header
        title={
          <Breadcrumbs
            items={[
              { label: 'Users', href: '/users' },
              { label: isLoading ? 'Loading...' : (user?.username || user?.name || 'User') },
            ]}
            className="text-xl font-semibold"
          />
        }
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted">Active</span>
              <ToggleSwitch
                checked={user?.isActive !== false}
                onChange={handleToggleActive}
                size="sm"
              />
            </div>
            <Button
              variant="glass"
              leftIcon={<ArrowPathIcon className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} />}
              onClick={handleSync}
              isLoading={isSyncing}
            >
              Sync
            </Button>
            <Button
              variant="glass"
              leftIcon={<ArrowDownTrayIcon className="w-5 h-5" />}
              onClick={handleImport}
            >
              Import
            </Button>
            <Button
              variant="danger"
              leftIcon={<TrashIcon className="w-5 h-5" />}
              onClick={() => setIsDeleteModalOpen(true)}
            >
              Delete
            </Button>
          </div>
        }
      />

      <div className="p-8">
        {/* Loading state */}
        {isLoading ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 bg-surface-hover">
              <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin text-primary" />
            </div>
            <p className="text-muted">Loading user data...</p>
          </div>
        ) : error ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 bg-surface-hover">
              <XMarkIcon className="w-8 h-8 text-error" />
            </div>
            <h3 className="text-lg font-medium mb-2 text-default">Error Loading User</h3>
            <p className="text-muted mb-4">{error.message}</p>
            <Button variant="primary" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </div>
        ) : !user ? (
          <div className="text-center py-16">
            <p className="text-muted">User not found</p>
          </div>
        ) : (
          <>
            {/* User Hero Section */}
            <PageSection className="mb-6 md:mb-8">
              <Card padding="md" className="md:lg:p-6">
                <div className="relative">
                  <div className="flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-6">
                    {/* Avatar with Color Picker */}
                    <motion.div
                      ref={avatarRef}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 200 }}
                      className="relative shrink-0"
                    >
                      <div
                        onClick={() => setShowColorPicker(!showColorPicker)}
                        className="relative transition-transform cursor-pointer hover:scale-105 group"
                      >
                        <UserAvatar 
                          userId={user.id}
                          name={user.username || user.name || 'User'} 
                          email={user.email}
                          size="2xl" 
                          showRing 
                          colorIndex={user.colorIndex || 0}
                          className="w-16 h-16 md:w-24 md:h-24 rounded-xl md:rounded-2xl shadow-lg ring-2 md:ring-4 ring-[var(--color-bg)]"
                          avatarClassName="rounded-xl md:rounded-2xl"
                        />
                        {/* Edit indicator overlay */}
                        <div className="absolute inset-0 rounded-xl md:rounded-2xl bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                          <PencilIcon className="w-4 h-4 md:w-6 md:h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                      <ColorPicker
                        currentColorIndex={user.colorIndex || 0}
                        onColorChange={handleColorChange}
                        isOpen={showColorPicker}
                        onClose={() => setShowColorPicker(false)}
                        triggerRef={avatarRef}
                      />
                    </motion.div>

                    {/* Info */}
                    <div className="flex-1 min-w-0 w-full">
                      {/* Name with sync badge */}
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <InlineEdit
                          value={user.username || user.name || 'User'}
                          onSave={handleUsernameUpdate}
                          placeholder="Enter username..."
                          maxLength={50}
                          className="text-xl md:text-2xl font-bold font-display"
                        />
                        <SyncBadge
                          userId={user.id}
                          onSync={async (id) => {
                            setIsSyncing(true);
                            try {
                              await api.syncUser(id);
                              toast.success(`Synced ${user.username || user.name} successfully`);
                            } catch (err: any) {
                              toast.error(err.message || `Failed to sync ${user.username || user.name}`);
                            } finally {
                              setIsSyncing(false);
                            }
                          }}
                          onReconnect={(id) => {
                            setIsReconnectModalOpen(true);
                          }}
                          isSyncing={isSyncing}
                          size="sm"
                        />
                        <button
                          onClick={() => {
                            if (!showSyncDebug) {
                              refreshSyncPlan();
                            }
                            setShowSyncDebug(!showSyncDebug);
                          }}
                          className="text-xs text-muted hover:text-primary underline"
                        >
                          {showSyncDebug ? 'Hide' : 'Debug'}
                        </button>
                        {streaks?.currentStreak > 0 ? (
                          <Badge variant="warning" size="sm" className="hidden sm:inline-flex">
                            <FireIcon className="w-3 h-3 mr-1" />
                            {streaks.currentStreak}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2 mb-3 md:mb-4">
                        <p className="text-sm md:text-base text-muted truncate">
                          {hideSensitive && !showEmail ? '••••••••' : user.email}
                        </p>
                        {hideSensitive && (
                          <button
                            onClick={() => setShowEmail(!showEmail)}
                            className="p-1 rounded-lg text-muted hover:text-primary hover:bg-surface-hover transition-colors shrink-0"
                            title={showEmail ? 'Hide email' : 'Show email'}
                          >
                            {showEmail ? (
                              <EyeSlashIcon className="w-4 h-4" />
                            ) : (
                              <EyeIcon className="w-4 h-4" />
                            )}
                          </button>
                        )}
                      </div>

                      {/* Meta Row (Matched with Group Style) */}
                      <div className="flex flex-wrap items-center gap-3 md:gap-6">
                        <button
                          onClick={() => setIsEditDetailsOpen(true)}
                          className="flex items-center gap-2 group transition-colors"
                        >
                          <UsersIcon className="w-4 h-4 md:w-5 md:h-5 text-secondary group-hover:text-primary" />
                          <span className="text-sm md:text-base text-default font-medium">
                            {groups.find(g => g.id === (user.groupIds?.[0] || user.groupId))?.name || 'No Group'}
                          </span>
                        </button>

                        <button
                          onClick={() => setIsEditDetailsOpen(true)}
                          className="flex items-center gap-2 group transition-colors"
                        >
                          <ClockIcon className="w-4 h-4 md:w-5 md:h-5 text-secondary group-hover:text-primary" />
                          <span className="text-sm md:text-base text-muted">
                            {user.expiresAt 
                              ? `Expires ${new Date(user.expiresAt).toLocaleDateString()}` 
                              : 'Lifetime'}
                          </span>
                        </button>

                        <div className="flex items-center gap-2">
                          <CalendarIcon className="w-4 h-4 md:w-5 md:h-5 text-secondary" />
                          <span className="text-sm md:text-base text-muted">
                            {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Unknown'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right column: quick stats - show on mobile too */}
                    <div className="flex md:gap-8 gap-4 items-start shrink-0 mt-4 md:mt-0">
                      <div className="text-center">
                        <p className="text-xl md:text-3xl font-bold text-default font-display">
                          {formatMinutes(absoluteTotalMinutes)}
                        </p>
                        <p className="text-[10px] md:text-xs uppercase tracking-wider font-semibold text-muted mt-0.5 md:mt-1">Total time</p>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </PageSection>

            {/* Sync Debug Section */}
            {showSyncDebug && (
              <PageSection className="mb-6">
                <div className="p-4 rounded-xl bg-surface border border-yellow-500/30">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-yellow-400">Sync Debug Info</h3>
                    {syncPlan && (
                      <Badge variant={syncPlan.alreadySynced ? 'success' : 'error'} size="sm">
                        {syncPlan.alreadySynced ? 'Synced' : 'Unsynced'}
                      </Badge>
                    )}
                  </div>
                  {syncPlanLoading && <div className="text-sm text-muted">Loading...</div>}
                  {syncPlanError && <div className="text-sm text-red-400">Error: {syncPlanError}</div>}
                  {syncPlan && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <h4 className="text-sm font-medium text-muted mb-2">Current Addons ({syncPlan.currentCount})</h4>
                          <div className="max-h-48 overflow-y-auto space-y-1">
                            {syncPlan.current.map((addon, idx) => (
                              <div key={idx} className="text-xs font-mono bg-surface-hover p-2 rounded break-all">
                                <span className="text-primary">{addon.name}</span>
                                <div className="text-muted truncate">{addon.transportUrl}</div>
                                <div className="text-xs text-gray-500 truncate" title={addon.fingerprint}>
                                  FP: {addon.fingerprint.substring(0, 50)}...
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-muted mb-2">Desired Addons ({syncPlan.desiredCount})</h4>
                          <div className="max-h-48 overflow-y-auto space-y-1">
                            {syncPlan.desired.map((addon, idx) => (
                              <div key={idx} className="text-xs font-mono bg-surface-hover p-2 rounded break-all">
                                <span className="text-green-400">{addon.name}</span>
                                <div className="text-muted truncate">{addon.transportUrl}</div>
                                <div className="text-xs text-gray-500 truncate" title={addon.fingerprint}>
                                  FP: {addon.fingerprint.substring(0, 50)}...
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={refreshSyncPlan}
                        className="mt-3 mr-2 px-3 py-1 text-xs bg-surface-hover hover:bg-primary hover:text-white rounded transition-colors"
                      >
                        Refresh
                      </button>
                      <button
                        onClick={() => {
                          const text = JSON.stringify({ current: syncPlan.current, desired: syncPlan.desired }, null, 2);
                          navigator.clipboard.writeText(text);
                          toast.success('Copied to clipboard');
                        }}
                        className="mt-3 px-3 py-1 text-xs bg-surface-hover hover:bg-primary hover:text-white rounded transition-colors"
                      >
                        Copy
                      </button>
                    </>
                  )}
                </div>
              </PageSection>
            )}

            {/* Tab Navigation */}
            <PageSection className="mb-6 md:mb-8">
              <div className="flex items-center gap-2 p-1 rounded-xl bg-surface w-fit overflow-x-auto">
                <button
                  onClick={() => setActiveTab('overview')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === 'overview'
                      ? 'bg-primary text-white'
                      : 'text-muted hover:text-default hover:bg-surface-hover'
                  }`}
                >
                  Overview
                </button>
                <button
                  onClick={() => setActiveTab('addons')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                    activeTab === 'addons'
                      ? 'bg-primary text-white'
                      : 'text-muted hover:text-default hover:bg-surface-hover'
                  }`}
                >
                  <PuzzlePieceIcon className="w-4 h-4" />
                  Addons
                  {stremioAddons.length > 0 && (
                    <span className="px-1.5 py-0.5 text-xs rounded-full bg-surface">
                      {stremioAddons.length}
                    </span>
                  )}
                </button>
              </div>
            </PageSection>

            {activeTab === 'overview' && (
              <>
                {/* Stats Cards */}
                <PageSection delay={0.1} className="mb-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <Link href={`/activity?user=${encodeURIComponent(user?.username || '')}&period=today`}>
                      <StatCard
                        label="Watch Time Today"
                        value={isLoading ? '...' : formatMinutes(liveTodayMinutes)}
                        icon={<ClockIcon className="w-6 h-6" />}
                        delay={0}
                      />
                    </Link>
                    <Link href={`/activity?user=${encodeURIComponent(user?.username || '')}&period=week`}>
                      <StatCard
                        label="Watch Time This Week"
                        value={isLoading ? '...' : formatMinutes(liveWeekMinutes)}
                        icon={<CalendarIcon className="w-6 h-6" />}
                        delay={0.05}
                      />
                    </Link>
                    <StatCard
                      label="Current Streak"
                      value={`${streaks?.currentStreak || 0} days`}
                      icon={<FireIcon className="w-6 h-6" />}
                      delay={0.1}
                    />
                    <StatCard
                      label="Watch Velocity"
                      value="0h/day"
                      icon={<BoltIcon className="w-6 h-6" />}
                      delay={0.15}
                    />
              </div>
            </PageSection>

            {/* Charts Section */}
            <PageSection delay={0.2} className="mb-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {watchTimeData.length > 0 ? (
                  <>
                    <WatchTimeChart data={watchTimeData} />
                    <ContentBreakdownChart data={watchTimeData} />
                  </>
                ) : (
                  <div className="col-span-2 text-center py-16 text-muted">No watch time data available</div>
                )}
              </div>
            </PageSection>

            {/* Top Items and Activity */}
            <PageSection delay={0.3}>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top Items */}
                <Card padding="lg">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold text-default font-display">Top Watched</h3>
                  </div>

                  <StaggerContainer className="space-y-3">
                    {userTopItems.length > 0 ? userTopItems.map((item, index) => (
                  <StaggerItem key={item.id}>
                    <motion.div
                      whileHover={{ x: 4 }}
                      className="flex items-center gap-4 p-3 rounded-xl transition-colors group cursor-pointer bg-surface-hover hover:bg-surface"
                    >
                      {/* Rank */}
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-muted" style={{ background: 'var(--color-surface)' }}>
                        {index + 1}
                      </div>

                      {/* Poster */}
                      <div className="w-12 h-16 rounded-lg flex items-center justify-center shrink-0 overflow-hidden bg-surface shadow-inner">
                        {item.poster ? (
                          <img src={item.poster} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--color-primary-muted)' }}>
                            {item.type === 'movie' ? (
                              <FilmIcon className="w-6 h-6" style={{ color: 'var(--color-primary)' }} />
                            ) : (
                              <TvIcon className="w-6 h-6" style={{ color: 'var(--color-secondary)' }} />
                            )}
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-default truncate group-hover:text-primary transition-colors">
                          {item.name}
                        </p>
                        <p className="text-sm text-muted">
                          {formatMinutes(Math.round(item.watchTime))} watched
                        </p>
                        {/* Progress bar */}
                        <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background: 'var(--color-surface)' }}>
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${item.progress}%` }}
                            transition={{ duration: 0.8, delay: index * 0.1 }}
                            className="h-full rounded-full"
                            style={{ 
                              background: item.type === 'movie' ? 'var(--color-chart-1)' : 'var(--color-chart-2)'
                            }}
                          />
                        </div>
                      </div>

                      {/* Badge */}
                      <Badge variant={item.type === 'movie' ? 'primary' : 'secondary'} size="sm">
                        {item.type}
                      </Badge>
                    </motion.div>
                    </StaggerItem>
                    )) : (
                      <div className="text-center py-8 text-sm text-muted">No top items data</div>
                    )}
                  </StaggerContainer>
                </Card>

                {/* Activity Timeline */}
                <Card padding="lg">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold text-default font-display">Recent Activity</h3>
                  </div>

                  <StaggerContainer className="space-y-3">
                    {userRecentActivity.length > 0 ? (
                      userRecentActivity.map((s: any, index: number) => (
                        <StaggerItem key={`activity-${s.id}-${index}`}>
                          <motion.div
                            whileHover={{ x: 4 }}
                            className="flex items-center gap-4 p-3 rounded-xl transition-colors group cursor-pointer bg-surface-hover hover:bg-surface border border-transparent hover:border-default"
                          >
                            {/* Poster */}
                            <div className="w-12 h-16 rounded-lg flex items-center justify-center shrink-0 overflow-hidden bg-surface shadow-inner">
                              {s.item.poster ? (
                                <img src={s.item.poster} alt={s.item.name} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--color-primary-muted)' }}>
                                  {s.item.type === 'movie' ? (
                                    <FilmIcon className="w-6 h-6" style={{ color: 'var(--color-primary)' }} />
                                  ) : (
                                    <TvIcon className="w-6 h-6" style={{ color: 'var(--color-secondary)' }} />
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <p className="font-medium text-default truncate group-hover:text-primary transition-colors">
                                  {s.item.name}
                                </p>
                                {s.isActive && (
                                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20">
                                    <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                    <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Live</span>
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted">
                                {s.item.type === 'series' && s.item.season && (
                                  <span className="font-medium text-secondary">
                                    S{String(s.item.season).padStart(2, '0')}E{String(s.item.episode).padStart(2, '0')}
                                  </span>
                                )}
                                <span>{new Date(s.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                {s.durationSeconds > 0 && (
                                  <>
                                    <span>•</span>
                                    <span>{formatMinutes(Math.round(s.durationSeconds / 60))}</span>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Status */}
                            <div className="shrink-0">
                              {s.isActive ? (
                                <div className="p-2 rounded-full bg-secondary/10">
                                  <PlayIcon className="w-4 h-4 text-secondary" />
                                </div>
                              ) : (
                                <div className="p-2 rounded-full bg-primary/10">
                                  <CheckCircleIcon className="w-4 h-4 text-primary" />
                                </div>
                              )}
                            </div>
                          </motion.div>
                        </StaggerItem>
                      ))
                    ) : (
                      <div className="text-center py-8 text-sm text-muted">No recent activity</div>
                    )}
                  </StaggerContainer>
                </Card>
              </div>
            </PageSection>
              </>
            )}

            {/* Addons Tab Content */}
            {activeTab === 'addons' && (
              <>
                {/* Group Addons */}
                <PageSection delay={0.1} className="mb-8">
                  <Card padding="lg">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/20">
                          <PuzzlePieceIcon className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-default">Group Addons</h3>
                          <p className="text-sm text-muted">
                            {groupAddons.length} addon{groupAddons.length !== 1 ? 's' : ''} from your group
                            {excludedAddonIds.size > 0 && ` • ${excludedAddonIds.size} excluded`}
                          </p>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => refreshGroupAddons(true)} disabled={isRefreshingAddons} title="Refresh addons">
                        <ArrowPathIcon className={`w-4 h-4 ${isRefreshingAddons ? 'animate-spin' : ''}`} />
                      </Button>
                    </div>

                    {groupAddons.length > 0 ? (
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        modifiers={[restrictToParentElement]}
                        onDragEnd={handleGroupAddonDragEnd}
                      >
                        <SortableContext
                          items={groupAddons.map(addon => addon.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="space-y-3">
                            {groupAddons.map((addon) => (
                              <SortableGroupAddonItem
                                key={addon.id}
                                addon={addon}
                                isExcluded={excludedAddonIds.has(addon.id)}
                                onToggleExclude={handleToggleExclude}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    ) : (
                      <div className="text-center py-8">
                        <PuzzlePieceIcon className="w-12 h-12 mx-auto mb-4 text-muted opacity-50" />
                        <p className="text-muted">No group addons assigned</p>
                        <p className="text-sm text-subtle mt-1">Join a group to get addons synced</p>
                      </div>
                    )}
                  </Card>
                </PageSection>

                {/* Stremio Account Addons */}
                <PageSection delay={0.2}>
                  <Card padding="lg">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-secondary/20">
                          <FolderIcon className="w-5 h-5 text-secondary" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-default">Stremio Account Addons</h3>
                          <p className="text-sm text-muted">
                            {stremioAddons.length} addon{stremioAddons.length !== 1 ? 's' : ''} in Stremio account
                            {stremioAddons.length > 0 && ' • Drag to reorder'}
                          </p>
                        </div>
                      </div>
                      {stremioAddons.length > 0 && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={handleResetStremioAddons}
                        >
                          Clear All
                        </Button>
                      )}
                    </div>

                    {stremioAddons.length > 0 ? (
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        modifiers={[restrictToParentElement]}
                        onDragEnd={handleStremioAddonDragEnd}
                      >
                        <SortableContext
                          items={stremioAddons.map((addon, index) => `${index}-${addon.transportUrl}`)}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="space-y-3">
                            {stremioAddons.map((addon, index) => (
                              <SortableStremioAddonItem
                                key={`${index}-${addon.transportUrl}`}
                                addon={addon}
                                index={index}
                                isProtected={protectedAddonNames.has(addon.manifest?.name || '')}
                                onToggleProtect={handleToggleProtect}
                                onRemove={handleRemoveStremioAddon}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    ) : (
                      <div className="text-center py-8">
                        <PuzzlePieceIcon className="w-12 h-12 mx-auto mb-4 text-muted opacity-50" />
                        <p className="text-muted">No Stremio addons found</p>
                        <p className="text-sm text-subtle mt-1">Sync the user to populate their addons</p>
                      </div>
                    )}
                  </Card>
                </PageSection>
              </>
            )}
          </>
        )}
      </div>

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDelete}
        title="Delete User"
        description={`Are you sure you want to delete ${user?.username || user?.name || 'this user'}? This action cannot be undone.`}
        confirmText={isDeleting ? 'Deleting...' : 'Delete'}
        variant="danger"
      />

      {/* Reconnect Modal - reusing CreateUserModal */}
      <CreateUserModal
        isOpen={isReconnectModalOpen}
        onClose={() => setIsReconnectModalOpen(false)}
        mode="reconnect"
        userId={params.id as string}
        userName={user?.username || user?.name || 'User'}
        onReconnectSuccess={() => {
          setIsReconnectModalOpen(false);
          window.location.reload();
        }}
      />

      {/* Edit Details Modal */}
      {isEditDetailsOpen && (
        <EditUserDetailsModal
          isOpen={isEditDetailsOpen}
          onClose={() => setIsEditDetailsOpen(false)}
          user={user}
          groups={groups}
          onUpdateGroup={handleGroupChange}
          onUpdateExpiresAt={handleExpiresAtChange}
        />
      )}
    </>
  );
}

// Edit User Details Modal
function EditUserDetailsModal({
  isOpen,
  onClose,
  user,
  groups,
  onUpdateGroup,
  onUpdateExpiresAt,
}: {
  isOpen: boolean;
  onClose: () => void;
  user: any;
  groups: any[];
  onUpdateGroup: (groupId: string) => Promise<void>;
  onUpdateExpiresAt: (date: string) => Promise<void>;
}) {
  const [groupId, setGroupId] = useState(user.groupIds?.[0] || user.groupId || '');
  const [expiresAt, setExpiresAt] = useState(user.expiresAt ? format(new Date(user.expiresAt), "yyyy-MM-dd'T'HH:mm") : '');
  const [isLoading, setIsLoading] = useState(false);

  // Update local state when user prop changes
  useEffect(() => {
    setGroupId(user.groupIds?.[0] || user.groupId || '');
    setExpiresAt(user.expiresAt ? format(new Date(user.expiresAt), "yyyy-MM-dd'T'HH:mm") : '');
  }, [user]);

  const handleSave = async () => {
    setIsLoading(true);
    try {
      // Update group if changed
      const currentGroupId = user.groupIds?.[0] || user.groupId || '';
      if (groupId !== currentGroupId) {
        await onUpdateGroup(groupId);
      }

      // Update expiration if changed
      const currentExpires = user.expiresAt ? format(new Date(user.expiresAt), "yyyy-MM-dd'T'HH:mm") : '';
      if (expiresAt !== currentExpires) {
        await onUpdateExpiresAt(expiresAt);
      }
      
      onClose();
    } catch (error) {
      console.error('Failed to update details:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit User Details"
      description="Update membership and group assignment"
      size="md"
    >
      <div className="space-y-6">
        {/* Group Selector */}
        <div>
          <label className="block text-sm font-medium mb-2 text-default">Group Assignment</label>
          <Select
            options={[
              { value: '', label: 'No group' },
              ...groups.map(g => ({ value: g.id, label: g.name })),
            ]}
            value={groupId}
            onChange={setGroupId}
          />
          <p className="text-xs text-muted mt-2">
            Assigning a group will automatically sync the group's addons to this user.
          </p>
        </div>

        {/* ExpiresAt */}
        <div>
          <label className="block text-sm font-medium mb-2 text-default">Membership Expiration</label>
          <DateTimePicker
            value={expiresAt}
            onChange={setExpiresAt}
            min={new Date()}
            placeholder="Lifetime (Never expires)"
          />
          <p className="text-xs text-muted mt-2">
            Leave empty for lifetime membership. User will lose access after this date.
          </p>
        </div>

        <div className="flex gap-3 justify-end pt-4 border-t border-default">
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} isLoading={isLoading}>
            Save Changes
          </Button>
        </div>
      </div>
    </Modal>
  );
}
