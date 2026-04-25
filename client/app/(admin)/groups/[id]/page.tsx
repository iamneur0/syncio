'use client';

import React, { useState, useCallback, useEffect, useRef, memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, User, Group, Addon } from '@/lib/api';
import { Header, Breadcrumbs } from '@/components/layout/Header';
import { Button, Card, Avatar, AvatarGroup, Badge, Modal, ConfirmModal, Input, ColorPicker, InlineEdit, ToggleSwitch, SyncBadge, VersionBadge, ResourceBadge, UserAvatar } from '@/components/ui';
import { PageSection, StaggerContainer, StaggerItem } from '@/components/layout/PageContainer';
import { toast } from '@/components/ui/Toast';
import {
  ArrowPathIcon,
  PencilIcon,
  TrashIcon,
  UsersIcon,
  PuzzlePieceIcon,
  UserPlusIcon,
  UserMinusIcon,
  ClockIcon,
  CalendarIcon,
  CheckCircleIcon,
  CheckIcon,
  XMarkIcon,
  Bars3Icon,
  PlusIcon,
  ChartBarIcon,
  FilmIcon,
  TvIcon,
} from '@heroicons/react/24/outline';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  LabelList,
} from 'recharts';
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

const colorOptions = [
  '#7c3aed', '#06b6d4', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#ec4899', '#14b8a6',
];

// Chart color palette for users - theme-aware colors
const USER_COLORS = [
  'var(--color-chart-1)',  // Primary chart color
  'var(--color-chart-2)',  // Secondary chart color
  '#22d3ee',  // cyan-400
  '#a78bfa',  // violet-400
  '#fb923c',  // orange-400
  '#4ade80',  // green-400
  '#f472b6',  // pink-400
  '#facc15',  // yellow-400
  '#38bdf8',  // sky-400
  '#c084fc',  // purple-400
];

// Types for per-user watch time data
interface AggregatedWatchTimeData {
  date: string;
  [userId: string]: number | string; // userId -> minutes, plus 'date' string
}

interface AggregatedContentData {
  date: string;
  [key: string]: number | string; // 'date' + user movies/series keys
}

// Memoized tooltip style (same as UserDetailsPage)
const TOOLTIP_STYLE = {
  backgroundColor: 'rgba(30, 30, 56, 0.9)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '12px',
  backdropFilter: 'blur(12px)',
} as const;

const TOOLTIP_LABEL_STYLE = { color: '#fff' } as const;

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return `${days}d ${remainingHours}h`;
}

// Group Watch Time Chart - shows per-user lines
const GroupWatchTimeChart = memo(function GroupWatchTimeChart({
  data,
  users,
}: {
  data: AggregatedWatchTimeData[];
  users: User[];
}) {
  // Get active users (those with data)
  const activeUsers = useMemo(() => {
    if (!data.length) return [];
    const firstEntry = data[0];
    return users.filter(u => firstEntry[u.id] !== undefined && firstEntry[u.id] !== 0);
  }, [data, users]);

  // Calculate max minutes for Y-axis ticks
  const maxMinutes = useMemo(() => {
    if (!data.length) return 60;
    let max = 0;
    data.forEach(day => {
      activeUsers.forEach(user => {
        const minutes = day[user.id] as number;
        if (minutes > max) max = minutes;
      });
    });
    return Math.max(max, 60);
  }, [data, activeUsers]);

  const hourTicks = Math.ceil(maxMinutes / 60);
  const ticks = Array.from({ length: hourTicks + 1 }, (_, i) => i * 60);

  if (activeUsers.length === 0 || data.length === 0) {
    return (
      <Card padding="lg">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-default font-display">Watch Time</h3>
        </div>
        <div className="h-40 md:h-64 flex items-center justify-center text-muted">
          No watch time data available
        </div>
      </Card>
    );
  }

  return (
    <Card padding="lg" className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-default font-display">Watch Time by User</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">Per-user activity</span>
        </div>
      </div>

      <div className="h-40 md:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
            <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
            <YAxis
              width={60}
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
              formatter={(value: any, name: any) => {
                const user = users.find(u => u.id === name);
                return [formatMinutes(value), user?.username || user?.name || 'Unknown'];
              }}
            />
            {activeUsers.map((user, index) => (
              <Line
                key={user.id}
                type="monotone"
                dataKey={user.id}
                stroke={USER_COLORS[index % USER_COLORS.length]}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-auto pt-4 border-t border-default flex-wrap">
        {activeUsers.map((user, index) => (
          <div key={user.id} className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: USER_COLORS[index % USER_COLORS.length] }}
            />
            <span className="text-sm text-muted truncate max-w-[120px]">
              {user.username || user.name || 'Unknown'}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
});

// Custom label for diagonal user names under bars
const UserLabel = (props: any) => {
  const { x, width, y, height, userName } = props;
  // Calculate baseline y position (y + height is the bottom of the bar)
  // We want to position the text well below the date labels
  const baselineY = y + height; 
  
  return (
    <text
      x={x + width / 2}
      y={baselineY + 35}
      fill="#64748b" // text-muted
      textAnchor="start"
      fontSize={10}
      transform={`rotate(45, ${x + width / 2}, ${baselineY + 35})`}
      style={{ pointerEvents: 'none' }}
    >
      {userName}
    </text>
  );
};

// Group Content Breakdown Chart - grouped stacked bars by date per user
const GroupContentBreakdownChart = memo(function GroupContentBreakdownChart({
  data,
  users,
}: {
  data: AggregatedContentData[];
  users: User[];
}) {
  // Get active users and transform data to grouped format
  const { activeUsers, groupedData } = useMemo(() => {
    if (!data.length) return { activeUsers: [], groupedData: [] };

    const activeUsersList = users.filter(u => {
      const hasData = data.some(day =>
        (day[`${u.id}_movies`] as number) > 0 || (day[`${u.id}_series`] as number) > 0
      );
      return hasData;
    });

    // Transform data: each date has stacked bars per user showing movies and series
    const transformedData = data.map(day => {
      const result: any = { date: day.date };
      activeUsersList.forEach(user => {
        const movies = (day[`${user.id}_movies`] as number) || 0;
        const series = (day[`${user.id}_series`] as number) || 0;
        // Store individual counts for stacking
        result[`${user.id}_movies`] = movies;
        result[`${user.id}_series`] = series;
        // Store breakdown for tooltip
        result[`${user.id}_breakdown`] = { movies, series };
      });
      return result;
    });

    return { activeUsers: activeUsersList, groupedData: transformedData };
  }, [data, users]);

  if (activeUsers.length === 0 || groupedData.length === 0) {
    return (
      <Card padding="lg">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-default font-display">Content Breakdown</h3>
        </div>
        <div className="h-40 md:h-64 flex items-center justify-center text-muted">
          No content data available
        </div>
      </Card>
    );
  }

  return (
    <Card padding="lg" className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-default font-display">Content Breakdown by User</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">Movies vs Series per user</span>
        </div>
      </div>

      <div className="h-40 md:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={groupedData} barGap={2} barCategoryGap="20%" margin={{ bottom: 80 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
            <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
            <YAxis width={60} stroke="#64748b" fontSize={12} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              cursor={{ fill: 'rgba(255,255,255,0.05)' }}
              formatter={(value: any, name: any, props: any) => {
                // Parse the dataKey to find the user and type
                const dataKey = props.dataKey as string;
                if (!dataKey) return [value, name];
                
                const parts = dataKey.split('_');
                const userId = parts[0];
                const type = parts[1]; // 'movies' or 'series'
                
                const user = users.find(u => u.id === userId);
                const userName = user?.username || user?.name || 'Unknown';
                
                return [`${value} ${type}`, userName];
              }}
            />
            {activeUsers.map((user) => (
              <React.Fragment key={user.id}>
                {/* Movies (Bottom) */}
                <Bar
                  dataKey={`${user.id}_movies`}
                  stackId={user.id}
                  fill="var(--color-primary)"
                  radius={[0, 0, 0, 0]}
                >
                  {/* Show user label under the stack */}
                  <LabelList 
                    dataKey={`${user.id}_movies`} 
                    content={(props: any) => <UserLabel {...props} userName={user.username || user.name || 'User'} />} 
                  />
                </Bar>
                {/* Series (Top) */}
                <Bar
                  dataKey={`${user.id}_series`}
                  stackId={user.id}
                  fill="var(--color-secondary)"
                  radius={[4, 4, 0, 0]}
                />
              </React.Fragment>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-auto pt-4 border-t border-default flex-wrap">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: 'var(--color-primary)' }} />
          <span className="text-sm text-muted">Movies</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: 'var(--color-secondary)' }} />
          <span className="text-sm text-muted">Series</span>
        </div>
      </div>
    </Card>
  );
});

// Sortable Addon Item Component with clean draggable card design
interface SortableAddonItemProps {
  addon: Addon;
  onRemove: (addonId: string) => void;
}

function SortableAddonItem({ addon, onRemove }: SortableAddonItemProps) {
  // Ensure we have a valid ID for sorting (should always exist after filtering)
  if (!addon.id) {
    console.error('SortableAddonItem received addon without ID:', addon);
    return null;
  }

  const sortableId = String(addon.id); // Always use string ID

  // Extract logo from various sources: customLogo > manifest.logo > logo > iconUrl
  const anyAddon = addon as any;
  const logo = anyAddon.customLogo || anyAddon.manifest?.logo || addon.logo || anyAddon.iconUrl;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sortableId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-4 p-4 rounded-xl bg-surface-hover hover:bg-surface border transition-all group ${
        isDragging
          ? 'border-primary shadow-lg shadow-primary/25 scale-[1.01]'
          : 'border-default hover:border-primary hover:shadow-md'
      }`}
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-surface-hover shrink-0"
      >
        <Bars3Icon className="w-5 h-5 text-subtle" />
      </div>

      {/* Addon Content - Clickable to go to addon detail */}
      <Link
        href={`/addons/${addon.id}`}
        className="flex items-center gap-4 flex-1 min-w-0 cursor-pointer"
        onClick={(e) => {
          // Don't navigate if clicking the remove button
          e.stopPropagation();
        }}
      >
        {/* Addon Logo */}
        <div className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-surface-hover">
          {logo ? (
            <img src={logo} alt={addon.name} className="w-8 h-8 object-contain" />
          ) : (
            <PuzzlePieceIcon className="w-6 h-6 text-primary" />
          )}
        </div>

        {/* Addon Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-semibold text-default truncate text-base">
              {addon.name || 'Unnamed Addon'}
            </h4>
            {addon.version && (
              <VersionBadge version={addon.version} size="sm" />
            )}
          </div>
          {addon.description && (
            <p className="text-sm text-muted truncate mb-2">{addon.description}</p>
          )}
          {(addon.resources || []).length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {(addon.resources || []).slice(0, 4).map((res: string) => (
                <ResourceBadge key={res} resource={res} />
              ))}
              {(addon.resources || []).length > 4 && (
                <Badge variant="muted" size="sm">
                  +{(addon.resources || []).length - 4}
                </Badge>
              )}
            </div>
          )}
        </div>
      </Link>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="sm"
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onClick={() => {
            if (addon.id) {
              onRemove(addon.id);
            } else {
              console.error('Cannot remove addon without ID:', addon);
            }
          }}
          className="text-error hover:bg-error-muted rounded-lg"
        >
          <XMarkIcon className="w-5 h-5" />
        </Button>
      </div>
    </motion.div>
  );
}

export default function GroupDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [isAddAddonModalOpen, setIsAddAddonModalOpen] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // New state for clear all modals
  const [isClearMembersModalOpen, setIsClearMembersModalOpen] = useState(false);
  const [isClearAddonsModalOpen, setIsClearAddonsModalOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // Track syncing users
  const [syncingUsers, setSyncingUsers] = useState<Set<string>>(new Set());
  
  // Track group sync state for badge refresh
  const [groupSyncing, setGroupSyncing] = useState(false);
  
  // Track user syncing state for user badge refresh (when group members change)
  const [usersSyncing, setUsersSyncing] = useState(false);

  // Data state
  const [group, setGroup] = useState<(Group & { color?: string; colorIndex?: number }) | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [groupUsers, setGroupUsers] = useState<User[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [allAddons, setAllAddons] = useState<Addon[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Watch time data state
  const [watchTimeData, setWatchTimeData] = useState<AggregatedWatchTimeData[]>([]);
  const [contentBreakdownData, setContentBreakdownData] = useState<AggregatedContentData[]>([]);
  const [isLoadingCharts, setIsLoadingCharts] = useState(false);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Fetch watch time data for all group users
  const fetchWatchTimeData = useCallback(async (userIds: string[]) => {
    if (userIds.length === 0) {
      setWatchTimeData([]);
      setContentBreakdownData([]);
      return;
    }

    setIsLoadingCharts(true);
    try {
      // Fetch watch time for each user
      const userWatchTimePromises = userIds.map(async (userId) => {
        try {
          const data = await api.getUserWatchTime(userId, 'month');
          return { userId, data };
        } catch {
          return { userId, data: null };
        }
      });

      const userWatchTimeResults = await Promise.all(userWatchTimePromises);

      // Collect all unique dates
      const allDates = new Set<string>();
      userWatchTimeResults.forEach(({ data }) => {
        if (data?.byDate) {
          data.byDate.forEach((period: any) => {
            allDates.add(period.date);
          });
        }
      });

      // Sort dates
      const sortedDates = Array.from(allDates).sort();

      // Aggregate data per date per user
      const aggregatedWatchTime: AggregatedWatchTimeData[] = sortedDates.map(date => {
        const dayData: AggregatedWatchTimeData = { date };
        userWatchTimeResults.forEach(({ userId, data }) => {
          const userData = data?.byDate?.find((p: any) => p.date === date);
          dayData[userId] = userData ? Math.round((userData.watchTimeSeconds || 0) / 60) : 0;
        });
        return dayData;
      });

      // Aggregate content breakdown per date per user
      const aggregatedContent: AggregatedContentData[] = sortedDates.map(date => {
        const dayData: AggregatedContentData = { date };
        userWatchTimeResults.forEach(({ userId, data }) => {
          const userData = data?.byDate?.find((p: any) => p.date === date);
          dayData[`${userId}_movies`] = userData?.movies || 0;
          dayData[`${userId}_series`] = userData?.shows || 0;
        });
        return dayData;
      });

      setWatchTimeData(aggregatedWatchTime);
      setContentBreakdownData(aggregatedContent);
    } catch (err) {
      console.error('Failed to fetch watch time data:', err);
      setWatchTimeData([]);
      setContentBreakdownData([]);
    } finally {
      setIsLoadingCharts(false);
    }
  }, []);

  // Fetch group data
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [groupData, usersData, groupAddonsData, allAddonsData] = await Promise.all([
          api.getGroup(params.id as string),
          api.getUsers(),
          api.getGroupAddons(params.id as string),
          api.getAddons(),
        ]);
        setGroup(groupData as Group & { color?: string; colorIndex?: number });
        setUsers(usersData);
        // Filter out any addons without valid IDs
        const validGroupAddons = (groupAddonsData || []).filter((a: Addon) => {
          if (!a.id) {
            console.warn('Addon without ID found during initial fetch:', a);
            return false;
          }
          return true;
        });
        console.log('🟡 Frontend: Loaded group addons:', {
          total: groupAddonsData?.length || 0,
          valid: validGroupAddons.length,
          addonIds: validGroupAddons.map(a => ({ id: a.id, name: a.name, idType: typeof a.id }))
        });
        setAddons(validGroupAddons);
        setAllAddons(allAddonsData);

        // Filter users that belong to this group
        // userIds can be a JSON string or an array
        let groupUserIds: string[] = [];
        if (groupData?.userIds) {
          try {
            if (typeof groupData.userIds === 'string') {
              groupUserIds = JSON.parse(groupData.userIds);
            } else if (Array.isArray(groupData.userIds)) {
              groupUserIds = groupData.userIds;
            }
          } catch (e) {
            console.error('Error parsing group userIds:', e);
            groupUserIds = [];
          }
        }
        const filtered = usersData.filter(u => groupUserIds.includes(u.id));
        setGroupUsers(filtered);

        // Fetch watch time data for group users
        await fetchWatchTimeData(groupUserIds);
      } catch (err) {
        setError(err as Error);
      } finally {
        setIsLoading(false);
      }
    };

    if (params.id) {
      fetchData();
    }
  }, [params.id, fetchWatchTimeData]);

  useEffect(() => {
    if (group) {
      document.title = `Syncio - ${group.name || 'Group Detail'}`;
    }
  }, [group]);

  const refetchData = useCallback(async () => {
    try {
      const [groupData, usersData, groupAddonsData, allAddonsData] = await Promise.all([
        api.getGroup(params.id as string),
        api.getUsers(),
        api.getGroupAddons(params.id as string),
        api.getAddons(),
      ]);
      setGroup(groupData as Group & { color?: string });
      setUsers(usersData);
      // Filter out any addons without valid IDs and ensure all have IDs
      const validGroupAddons = (groupAddonsData || []).filter((a: Addon) => {
        if (!a.id) {
          console.warn('Addon without ID found:', a);
          return false;
        }
        return true;
      });
      setAddons(validGroupAddons);
      setAllAddons(allAddonsData);

      // userIds can be a JSON string or an array
      let groupUserIds: string[] = [];
      if (groupData?.userIds) {
        try {
          if (typeof groupData.userIds === 'string') {
            groupUserIds = JSON.parse(groupData.userIds);
          } else if (Array.isArray(groupData.userIds)) {
            groupUserIds = groupData.userIds;
          }
        } catch (e) {
          console.error('Error parsing group userIds:', e);
          groupUserIds = [];
        }
      }
      const filtered = usersData.filter(u => groupUserIds.includes(u.id));
      setGroupUsers(filtered);

      // Refresh watch time data
      await fetchWatchTimeData(groupUserIds);
      
      // Debug: log addon IDs to help troubleshoot
      if (groupAddonsData && groupAddonsData.length > 0) {
        console.log('🟡 Frontend: Refetched group addons:', {
          total: groupAddonsData.length,
          addonIds: groupAddonsData.map(a => ({ id: a.id, name: a.name, idType: typeof a.id }))
        });
      }
    } catch (err) {
      console.error('Failed to refresh data:', err);
    }
  }, [params.id, fetchWatchTimeData]);

  const handleSync = useCallback(async () => {
    // Warning if no addons
    if (addons.length === 0) {
      toast.error('Cannot sync group: No addons assigned. Add addons before syncing.');
      return;
    }

    setIsSyncing(true);
    try {
      await api.syncGroup(params.id as string);
      toast.success('Group synced successfully');
      await refetchData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to sync group');
    } finally {
      setIsSyncing(false);
    }
  }, [params.id, refetchData, addons.length]);

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      await api.deleteGroup(params.id as string);
      toast.success('Group deleted successfully');
      router.push('/groups');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete group');
    } finally {
      setIsDeleting(false);
      setIsDeleteModalOpen(false);
    }
  }, [params.id, router]);

  const handleRemoveUser = useCallback(async (userId: string, userName: string) => {
    setUsersSyncing(true);
    try {
      await api.removeUserFromGroup(params.id as string, userId);
      toast.success(`${userName} removed from group`);
      await refetchData();
    } catch (err: any) {
      toast.error(err.message || `Failed to remove ${userName}`);
    } finally {
      setUsersSyncing(false);
    }
  }, [params.id, refetchData]);

  // Sync individual user
  const handleSyncUser = useCallback(async (userId: string, userName: string) => {
    setSyncingUsers(prev => new Set(prev).add(userId));
    setGroupSyncing(true);
    try {
      await api.syncUser(userId);
      toast.success(`${userName} synced successfully`);
    } catch (err: any) {
      toast.error(err.message || `Failed to sync ${userName}`);
    } finally {
      setSyncingUsers(prev => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
      setGroupSyncing(false);
    }
  }, []);

  // Clear all members
  const handleClearAllMembers = useCallback(async () => {
    setIsClearing(true);
    setUsersSyncing(true);
    try {
      // Remove all users from group
      for (const user of groupUsers) {
        await api.removeUserFromGroup(params.id as string, user.id);
      }
      toast.success(`Removed ${groupUsers.length} members from group`);
      await refetchData();
      setIsClearMembersModalOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to clear members');
    } finally {
      setIsClearing(false);
      setUsersSyncing(false);
    }
  }, [params.id, groupUsers, refetchData]);

  // Clear all addons
  const handleClearAllAddons = useCallback(async () => {
    setIsClearing(true);
    setGroupSyncing(true);
    setUsersSyncing(true);
    try {
      // Remove all addons from group
      for (const addon of addons) {
        await api.removeAddonFromGroup(params.id as string, addon.id);
      }
      toast.success(`Removed ${addons.length} addon${addons.length !== 1 ? 's' : ''} from group`);
      await refetchData();
      setIsClearAddonsModalOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to clear addons');
    } finally {
      setIsClearing(false);
      setGroupSyncing(false);
      setUsersSyncing(false);
    }
  }, [params.id, addons, refetchData]);

  // Handle adding addon to group
  const handleAddAddon = useCallback(async (addonIds: string[], addonNames: string[]) => {
    setGroupSyncing(true);
    setUsersSyncing(true);
    try {
      for (const addonId of addonIds) {
        await api.addAddonToGroup(params.id as string, addonId);
      }
      toast.success(`${addonNames.length} addon${addonNames.length > 1 ? 's' : ''} added to group`);
      await refetchData();
      setIsAddAddonModalOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to add addons');
    } finally {
      setGroupSyncing(false);
      setUsersSyncing(false);
    }
  }, [params.id, refetchData]);

  // Handle removing addon from group
  const handleRemoveAddon = useCallback(async (addonId: string) => {
    const addon = addons.find(a => a.id === addonId);
    setGroupSyncing(true);
    setUsersSyncing(true);
    try {
      await api.removeAddonFromGroup(params.id as string, addonId);
      toast.success(`${addon?.name || 'Addon'} removed from group`);
      await refetchData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove addon');
    } finally {
      setGroupSyncing(false);
      setUsersSyncing(false);
    }
  }, [params.id, addons, refetchData]);

  // Handle color change
  const handleColorChange = useCallback(async (colorIndex: number) => {
    // Optimistic update
    setGroup(prev => prev ? { ...prev, colorIndex } : null);
    
    try {
      await api.updateGroup(params.id as string, { colorIndex });
      toast.success('Group color updated');
      await refetchData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update group color');
      await refetchData();
    }
  }, [params.id, refetchData]);

  // Handle name update
  const handleNameUpdate = useCallback(async (newName: string) => {
    try {
      await api.updateGroup(params.id as string, { name: newName });
      toast.success('Group name updated');
      await refetchData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update group name');
    }
  }, [params.id, refetchData]);

  // Handle description update
  const handleDescriptionUpdate = useCallback(async (newDescription: string) => {
    try {
      await api.updateGroup(params.id as string, { description: newDescription || undefined });
      toast.success('Group description updated');
      await refetchData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update group description');
    }
  }, [params.id, refetchData]);

  // Handle toggle active status
  const handleToggleActive = useCallback(async () => {
    try {
      const currentGroup = await api.getGroup(params.id as string);
      const newStatus = !(currentGroup as any).isActive;
      await api.toggleGroupStatus(params.id as string, newStatus);
      toast.success(`Group ${newStatus ? 'activated' : 'deactivated'}`);
      await refetchData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to toggle group status');
    }
  }, [params.id, refetchData]);

  // Handle addon drag end for reordering
  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const oldIndex = addons.findIndex(a => String(a.id) === activeId);
    const newIndex = addons.findIndex(a => String(a.id) === overId);

    if (oldIndex === -1 || newIndex === -1) {
      console.warn('Could not find addon indices:', { 
        activeId, 
        overId, 
        addons: addons.map(a => ({ id: a.id, name: a.name }))
      });
      return;
    }

    // Optimistic update
    const newAddons = arrayMove(addons, oldIndex, newIndex);
    setAddons(newAddons);
    setGroupSyncing(true);
    setUsersSyncing(true);

    try {
      const stringIds = newAddons
        .map(a => String(a.id).trim())
        .filter(id => id && id !== 'undefined' && id !== 'null');
      
      if (stringIds.length === 0) {
        throw new Error('No valid addon IDs to reorder');
      }
      
      console.log('🟢 Reordering addons:', stringIds);
      await api.reorderGroupAddons(params.id as string, stringIds);
      toast.success('Addon order updated');
      // Refetch to ensure we have the latest data
      await refetchData();
    } catch (err: any) {
      // Revert on error
      setAddons(addons);
      console.error('❌ Failed to reorder addons:', err);
      if (err?.response?.data) {
        console.error('📦 Error response details:', err.response.data);
      }
      const errorMessage = err?.response?.data?.message || err?.message || 'Failed to update addon order';
      toast.error(errorMessage);
    } finally {
      setGroupSyncing(false);
      setUsersSyncing(false);
    }
  }, [params.id, addons, refetchData]);

  // Get color index from color hex (for color picker)
  const getColorIndex = (color?: string) => {
    // Standard group color list for matching hex back to index if needed
    const standardColors = [
      '#7c3aed', '#06b6d4', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#ec4899', '#14b8a6',
    ];
    if (group?.colorIndex !== undefined) return group.colorIndex;
    if (!color) return 0;
    const index = standardColors.findIndex(c => c.toLowerCase() === color.toLowerCase());
    return index >= 0 ? index : 0;
  };

  // Get addons not yet in this group
  const availableAddons = allAddons.filter(
    addon => !addons.some(groupAddon => groupAddon.id === addon.id)
  );

  return (
    <>
      <Header
        title={
          <Breadcrumbs
            items={[
              { label: 'Groups', href: '/groups' },
              { label: isLoading ? 'Loading...' : (group?.name || 'Group') },
            ]}
            className="text-xl font-semibold"
          />
        }
        subtitle={isLoading ? '' : (group?.description || '')}
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted">Active</span>
              <ToggleSwitch
                checked={(group as any)?.isActive !== false}
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
              Sync Group
            </Button>
            <Button
              variant="glass"
              leftIcon={<PencilIcon className="w-5 h-5" />}
              onClick={() => setIsEditModalOpen(true)}
            >
              Edit
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
        {/* Group Hero Section */}
        <PageSection className="mb-8">
          <Card padding="lg">
            <div className="relative">
              <div className="flex items-start gap-4">
                {/* Group Icon with Color Picker */}
                <motion.div
                  ref={colorPickerRef}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 200 }}
                  className="relative shrink-0"
                >
                  <div
                    onClick={() => setShowColorPicker(!showColorPicker)}
                    className="cursor-pointer hover:scale-105 transition-transform"
                  >
                    <Avatar 
                      name={group?.name || 'G'} 
                      size="2xl" 
                      colorIndex={group?.colorIndex ?? 0}
                      className="shadow-lg ring-4 ring-[var(--color-bg)]"
                    />
                  </div>
                  <ColorPicker
                    currentColorIndex={getColorIndex(group?.color)}
                    onColorChange={handleColorChange}
                    isOpen={showColorPicker}
                    onClose={() => setShowColorPicker(false)}
                    triggerRef={colorPickerRef}
                  />
                </motion.div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  {/* Name with sync badge */}
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <InlineEdit
                      value={group?.name || 'Group'}
                      onSave={handleNameUpdate}
                      placeholder="Enter group name..."
                      maxLength={50}
                      className="text-2xl font-bold inline-flex"
                    />
                    <SyncBadge 
                      key={`group-sync-${group?.id}-${groupSyncing}`}
                      groupId={group?.id || ''} 
                      isSyncing={groupSyncing}
                      onSync={async (id) => {
                        setGroupSyncing(true);
                        setUsersSyncing(true);
                        try {
                          await api.syncGroup(id);
                          toast.success(`Synced ${group?.name} successfully`);
                        } catch (err: any) {
                          toast.error(err.message || `Failed to sync ${group?.name}`);
                        }
                        setTimeout(() => {
                          setGroupSyncing(false);
                          setUsersSyncing(false);
                        }, 300);
                      }}
                      size="sm"
                    />
                  </div>
                  <div className="mb-4">
                    <InlineEdit
                      value={group?.description || undefined}
                      onSave={handleDescriptionUpdate}
                      placeholder="Enter description..."
                      maxLength={200}
                      className="text-muted"
                    />
                  </div>

                  {/* Quick stats row */}
                  <div className="flex flex-wrap items-center gap-6">
                    <div className="flex items-center gap-2">
                      <UsersIcon className="w-5 h-5 text-secondary" />
                      <span className="text-default font-medium">{groupUsers.length}</span>
                      <span className="text-muted">member{groupUsers.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <PuzzlePieceIcon className="w-5 h-5 text-secondary" />
                      <span className="text-default font-medium">{addons.length}</span>
                      <span className="text-muted">addon{addons.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ClockIcon className="w-5 h-5 text-secondary" />
                      <span className="text-muted">Last sync: Unknown</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CalendarIcon className="w-5 h-5 text-secondary" />
                      <span className="text-muted">
                        Created: {group?.createdAt ? new Date(group.createdAt).toLocaleDateString() : 'Unknown'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Avatar stack - show on mobile too */}
                <div className="flex items-start shrink-0 mt-4 md:mt-0">
                  <AvatarGroup
                    users={groupUsers.map(u => ({ name: u.name || u.username || 'Unknown', email: u.email, id: u.id }))}
                    max={5}
                    size="md"
                  />
                </div>
              </div>
            </div>
          </Card>
        </PageSection>

        {/* Members Section */}
        <PageSection delay={0.1} className="mb-8">
          <Card padding="lg">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-500/20">
                  <UsersIcon className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-default">Members</h3>
                  <p className="text-sm text-muted">{groupUsers.length} user{groupUsers.length !== 1 ? 's' : ''} in this group</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {groupUsers.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsClearMembersModalOpen(true)}
                    className="text-error hover:bg-error-muted"
                  >
                    <TrashIcon className="w-4 h-4 mr-1" />
                    Clear All
                  </Button>
                )}
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<UserPlusIcon className="w-4 h-4" />}
                  onClick={() => setIsAddMemberModalOpen(true)}
                >
                  Add Member
                </Button>
              </div>
            </div>

            <StaggerContainer className="space-y-3">
              {isLoading ? (
                <div className="text-center py-8 text-sm text-muted">Loading...</div>
              ) : groupUsers.length > 0 ? (
                groupUsers.map((user) => {
                  const displayName = user.name || user.username || 'Unknown';
                  const isUserSyncing = syncingUsers.has(user.id) || usersSyncing;
                  return (
                    <StaggerItem key={user.id}>
                      <motion.div
                        whileHover={{ x: 4 }}
                        className="flex items-center gap-4 p-4 rounded-xl bg-surface-hover hover:bg-surface transition-colors group"
                      >
                        <UserAvatar userId={user.id} name={displayName} email={user.email} size="md" />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/users/${user.id}`}
                              className="font-medium text-default hover:text-primary transition-colors truncate"
                            >
                              {displayName}
                            </Link>
                            <SyncBadge 
                              key={`user-sync-${user.id}-${isUserSyncing}`}
                              userId={user.id} 
                              isSyncing={isUserSyncing} 
                              onSync={() => handleSyncUser(user.id, displayName)}
                              size="sm" 
                            />
                          </div>
                          <p className="text-sm text-muted truncate">{user.email}</p>
                        </div>

                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="sm"
                            leftIcon={<ArrowPathIcon className={`w-4 h-4 ${isUserSyncing ? 'animate-spin' : ''}`} />}
                            onClick={() => handleSyncUser(user.id, displayName)}
                            disabled={isUserSyncing}
                          >
                            Sync
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            leftIcon={<UserMinusIcon className="w-4 h-4" />}
                            onClick={() => handleRemoveUser(user.id, displayName)}
                            className="text-error hover:bg-error-muted"
                          >
                            Remove
                          </Button>
                        </div>
                      </motion.div>
                    </StaggerItem>
                  );
                })
              ) : (
                <div className="text-center py-8 text-sm text-muted">No members in this group</div>
              )}
            </StaggerContainer>
          </Card>
        </PageSection>

        {/* Addons Section */}
        <PageSection delay={0.2}>
          <Card padding="lg">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-purple-500/20">
                  <PuzzlePieceIcon className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-default">Assigned Addons</h3>
                  <p className="text-sm text-muted">
                    {addons.length} addon{addons.length !== 1 ? 's' : ''} shared with this group
                    {addons.length > 0 && (
                      <span className="ml-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-primary-muted/15 text-primary text-xs font-medium border border-primary/25">
                        <Bars3Icon className="w-3.5 h-3.5" />
                        Drag cards to reorder
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {addons.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsClearAddonsModalOpen(true)}
                    className="text-error hover:bg-error-muted"
                  >
                    <TrashIcon className="w-4 h-4 mr-1" />
                    Clear All
                  </Button>
                )}
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<PlusIcon className="w-4 h-4" />}
                  onClick={() => setIsAddAddonModalOpen(true)}
                >
                  Add Addon
                </Button>
              </div>
            </div>

            {isLoading ? (
              <div className="text-center py-8 text-sm text-muted">Loading...</div>
            ) : addons.length > 0 ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                modifiers={[restrictToParentElement]}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={addons
                    .filter(addon => addon.id) // Only include addons with valid IDs
                    .map(addon => String(addon.id))} // Ensure string IDs
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-3">
                    {addons
                      .filter(addon => addon.id) // Only render addons with valid IDs
                      .map((addon) => {
                        // Ensure we have a valid ID (should always be true after filter)
                        if (!addon.id) {
                          console.error('Addon without ID in render:', addon);
                          return null;
                        }
                        return (
                          <SortableAddonItem
                            key={addon.id}
                            addon={addon}
                            onRemove={handleRemoveAddon}
                          />
                        );
                      })
                      .filter(Boolean)}
                  </div>
                </SortableContext>
              </DndContext>
            ) : (
              <div className="text-center py-8">
                <PuzzlePieceIcon className="w-12 h-12 mx-auto mb-4 text-muted opacity-50" />
                <p className="text-muted mb-4">No addons in this group</p>
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<PlusIcon className="w-4 h-4" />}
                  onClick={() => setIsAddAddonModalOpen(true)}
                >
                  Add First Addon
                </Button>
          </div>
        )}
      </Card>
    </PageSection>

        {/* Charts Section */}
        <PageSection delay={0.3} className="mt-8 mb-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {isLoadingCharts ? (
              <div className="col-span-2 text-center py-16">
                <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 bg-surface-hover">
                  <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin text-primary" />
                </div>
                <p className="text-muted">Loading chart data...</p>
              </div>
            ) : watchTimeData.length > 0 && groupUsers.length > 0 ? (
              <>
                <GroupWatchTimeChart data={watchTimeData} users={groupUsers} />
                <GroupContentBreakdownChart data={contentBreakdownData} users={groupUsers} />
              </>
            ) : (
              <div className="col-span-2 text-center py-16">
                <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 bg-surface-hover">
                  <ChartBarIcon className="w-8 h-8 text-muted" />
                </div>
                <h3 className="text-lg font-medium mb-2 text-default">No Activity Data</h3>
                <p className="text-muted">Watch time data will appear once users start streaming content.</p>
              </div>
            )}
          </div>
        </PageSection>
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDelete}
        title="Delete Group"
        description={`Are you sure you want to delete "${group?.name || 'this group'}"? This will remove all member associations but won't delete the users themselves.`}
        confirmText={isDeleting ? 'Deleting...' : 'Delete Group'}
        variant="danger"
      />

      {/* Edit Group Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Group"
        description="Update group details"
        size="md"
      >
        <EditGroupForm
          group={group}
          onClose={() => setIsEditModalOpen(false)}
        />
      </Modal>

      {/* Add Member Modal */}
      <Modal
        isOpen={isAddMemberModalOpen}
        onClose={() => setIsAddMemberModalOpen(false)}
        title="Add Member"
        description="Add a user to this group"
        size="md"
      >
        <AddMemberForm
          groupId={params.id as string}
          existingUserIds={groupUsers.map(u => u.id)}
          onClose={() => setIsAddMemberModalOpen(false)}
          onUsersChanged={() => {
            setUsersSyncing(true);
            // Reset after a delay to trigger badge refresh
            setTimeout(() => setUsersSyncing(false), 500);
          }}
        />
      </Modal>

      {/* Add Addon Modal */}
      <Modal
        isOpen={isAddAddonModalOpen}
        onClose={() => setIsAddAddonModalOpen(false)}
        title="Add Addon"
        description="Add an addon to this group"
        size="md"
      >
        <AddAddonForm
          availableAddons={availableAddons}
          onAdd={handleAddAddon}
          onClose={() => setIsAddAddonModalOpen(false)}
        />
      </Modal>

      {/* Clear All Members Confirmation Modal */}
      <ConfirmModal
        isOpen={isClearMembersModalOpen}
        onClose={() => setIsClearMembersModalOpen(false)}
        onConfirm={handleClearAllMembers}
        title="Clear All Members"
        description={`Are you sure you want to remove all ${groupUsers.length} members from this group? This will not delete the users, only remove them from the group.`}
        confirmText={isClearing ? 'Clearing...' : 'Clear All Members'}
        variant="danger"
        isLoading={isClearing}
      />

      {/* Clear All Addons Confirmation Modal */}
      <ConfirmModal
        isOpen={isClearAddonsModalOpen}
        onClose={() => setIsClearAddonsModalOpen(false)}
        onConfirm={handleClearAllAddons}
        title="Clear All Addons"
        description={`Are you sure you want to remove all ${addons.length} addon${addons.length !== 1 ? 's' : ''} from this group? Users will need to be re-synced after this.`}
        confirmText={isClearing ? 'Clearing...' : 'Clear All Addons'}
        variant="danger"
        isLoading={isClearing}
      />
    </>
  );
}

// Edit Group Form Component
function EditGroupForm({ group, onClose }: { group: Group | null; onClose: () => void }) {
  const [isLoading, setIsLoading] = useState(false);
  const [name, setName] = useState(group?.name || '');
  const [description, setDescription] = useState(group?.description || '');
  const [selectedColor, setSelectedColor] = useState(group?.color || '#7c3aed');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!group?.id) return;
    setIsLoading(true);
    try {
      await api.updateGroup(group.id, { name, description, color: selectedColor });
      toast.success('Group updated successfully');
      onClose();
      window.location.reload();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update group');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Input
        label="Group Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g., Family, Premium, Movies"
        required
      />

      <Input
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Brief description of this group"
      />

      <div>
        <label className="block text-sm font-medium mb-3 text-muted">
          Group Color
        </label>
        <div className="flex flex-wrap gap-3">
          {colorOptions.map((color) => (
            <motion.button
              key={color}
              type="button"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setSelectedColor(color)}
              className={`w-10 h-10 rounded-xl transition-all ${
                selectedColor === color
                  ? 'ring-2 ring-white ring-offset-2 ring-offset-[var(--color-bg)]'
                  : ''
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>

      <div className="flex gap-3 justify-end pt-4">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" isLoading={isLoading}>
          Save Changes
        </Button>
      </div>
    </form>
  );
}

// Add Member Form Component
function AddMemberForm({ groupId, existingUserIds, onClose, onUsersChanged }: { 
  groupId: string; 
  existingUserIds: string[]; 
  onClose: () => void;
  onUsersChanged?: () => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch available users
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);

  useEffect(() => {
    api.getUsers().then(setAvailableUsers).catch(console.error);
  }, []);

  // Filter out users already in the group
  const existingUserSet = new Set(existingUserIds);
  const filteredUsers = availableUsers.filter(
    user => {
      // Exclude users already in the group
      if (existingUserSet.has(user.id)) return false;
      const name = user.name || user.username || '';
      return name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (user.email && user.email.toLowerCase().includes(searchQuery.toLowerCase()));
    }
  );

  const handleAddUser = async (userId: string, userName: string) => {
    try {
      await api.addUserToGroup(groupId, userId);
      toast.success(`${userName} added to group`);
      onClose();
      if (onUsersChanged) {
        onUsersChanged();
      }
    } catch (err: any) {
      toast.error(err.message || `Failed to add ${userName} to group`);
    }
  };

  return (
    <div className="space-y-4">
      <Input
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search users..."
      />

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {filteredUsers.map((user) => {
          const displayName = user.name || user.username || 'Unknown';
          return (
            <motion.div
              key={user.id}
              whileHover={{ x: 4 }}
              className="flex items-center gap-3 p-3 rounded-xl bg-surface-hover hover:bg-surface transition-colors cursor-pointer"
              onClick={() => handleAddUser(user.id, displayName)}
            >
              <UserAvatar userId={user.id} name={displayName} email={user.email} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-default truncate">{displayName}</p>
                <p className="text-sm text-muted truncate">{user.email}</p>
              </div>
              <UserPlusIcon className="w-5 h-5 text-primary" />
            </motion.div>
          );
        })}

        {filteredUsers.length === 0 && (
          <div className="text-center py-8 text-muted">
            <UsersIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No users found</p>
          </div>
        )}
      </div>

      <div className="flex justify-end pt-4">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// Add Addon Form Component
interface AddAddonFormProps {
  availableAddons: Addon[];
  onAdd: (addonIds: string[], addonNames: string[]) => void;
  onClose: () => void;
}

function AddAddonForm({ availableAddons, onAdd, onClose }: AddAddonFormProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filteredAddons = availableAddons.filter(
    addon =>
      addon.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (addon.description && addon.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const toggleSelect = (addonId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(addonId)) {
        next.delete(addonId);
      } else {
        next.add(addonId);
      }
      return next;
    });
  };

  const handleAdd = () => {
    const selectedAddons = availableAddons.filter(a => selectedIds.has(a.id));
    onAdd(
      selectedAddons.map(a => a.id),
      selectedAddons.map(a => a.name)
    );
  };

  return (
    <div className="space-y-4">
      <Input
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search addons..."
      />

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {filteredAddons.map((addon) => {
          // Extract logo from various sources: customLogo > manifest.logo > logo > iconUrl
          const anyAddon = addon as any;
          const logo = anyAddon.customLogo || anyAddon.manifest?.logo || addon.logo || anyAddon.iconUrl;
          const isSelected = selectedIds.has(addon.id);
          return (
          <motion.div
            key={addon.id}
            whileHover={{ x: 4 }}
            className={`flex items-center gap-3 p-3 rounded-xl transition-colors cursor-pointer ${
              isSelected ? 'bg-primary-muted border border-primary' : 'bg-surface-hover hover:bg-surface'
            }`}
            onClick={() => toggleSelect(addon.id)}
          >
            <div className="shrink-0 flex items-center justify-center">
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                isSelected ? 'bg-primary border-primary' : 'border-default'
              }`}>
                {isSelected && <CheckIcon className="w-3 h-3 text-white" />}
              </div>
            </div>
            <div className="shrink-0">
              {logo ? (
                <img src={logo} alt={addon.name} className="w-8 h-8 object-contain rounded-md" />
              ) : (
                <PuzzlePieceIcon className="w-6 h-6 text-primary" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="font-medium text-default truncate">{addon.name}</p>
                {addon.version && <VersionBadge version={addon.version} size="sm" />}
              </div>
              {addon.description && (
                <p className="text-xs text-muted truncate">{addon.description}</p>
              )}
              {addon.resources && addon.resources.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {addon.resources.slice(0, 3).map((res: string) => (
                    <ResourceBadge key={res} resource={res} />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        );
        })}

        {filteredAddons.length === 0 && (
          <div className="text-center py-8 text-muted">
            <PuzzlePieceIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>{availableAddons.length === 0 ? 'All addons are already in this group' : 'No addons found'}</p>
          </div>
        )}
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button 
          variant="primary" 
          onClick={handleAdd}
          disabled={selectedIds.size === 0}
        >
          Add {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
        </Button>
      </div>
    </div>
  );
}
