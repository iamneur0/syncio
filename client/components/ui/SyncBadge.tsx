'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { Badge } from './Badge';
import { toast } from './Toast';

interface SyncBadgeProps {
  userId?: string;
  groupId?: string;
  onSync?: (id: string) => void;
  onReconnect?: (id: string) => void;
  isSyncing?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

type SyncStatus = 'synced' | 'unsynced' | 'stale' | 'connect' | 'syncing' | 'checking' | 'error';

export function SyncBadge({
  userId,
  groupId,
  onSync,
  onReconnect,
  isSyncing = false,
  size = 'sm',
  className = ''
}: SyncBadgeProps) {
  const [status, setStatus] = useState<SyncStatus>('checking');
  const [isLoading, setIsLoading] = useState(true);
  const prevIsSyncing = useRef(isSyncing);

  const fetchSyncStatus = useCallback(async () => {
    if (!userId && !groupId) {
      setStatus('stale');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      if (userId) {
        // First check if user has any groups
        const user = await api.getUser(userId);
        const userGroups = (user as any)?.groupIds || (user as any)?.groups || [];

        // If user has no groups, they're stale
        if (!userGroups.length) {
          setStatus('stale');
          setIsLoading(false);
          return;
        }

        const syncStatus = await api.getUserSyncStatus(userId);
        const syncStatusValue = (syncStatus as any)?.status;

        if (syncStatusValue === 'error') {
          const message = (syncStatus as any)?.message || '';
          if (message.includes('Stremio connection invalid') ||
              message.includes('authentication') ||
              message.includes('auth') ||
              message.includes('invalid') ||
              message.includes('corrupted')) {
            setStatus('connect');
          } else {
            setStatus('error');
          }
        } else if (syncStatusValue === 'stale' || !syncStatusValue) {
          // Backend returns 'stale' or nothing for users without proper sync
          setStatus('stale');
        } else {
          setStatus(syncStatusValue);
        }
      } else if (groupId) {
        // For groups, check if all users are synced
        const group = await api.getGroup(groupId);
        let userIds: string[] = [];
        try {
          if (typeof (group as any)?.userIds === 'string') {
            userIds = JSON.parse((group as any).userIds);
          } else if (Array.isArray((group as any)?.userIds)) {
            userIds = (group as any).userIds;
          }
        } catch (e) {
          console.error('Error parsing group userIds:', e);
          userIds = [];
        }
        const groupAddons = await api.getGroupAddons(groupId);

        // If group has no addons, it's stale
        if (groupAddons.length === 0) {
          setStatus('stale');
        } else if (userIds.length === 0) {
          setStatus('stale');
        } else {
          // Check sync status of all users
          const syncResults = await Promise.all(
            userIds.map(async (uid: string) => {
              try {
                const userSyncStatus = await api.getUserSyncStatus(uid, groupId);
                const status = (userSyncStatus as any)?.status;
                return status;
              } catch {
                return 'error';
              }
            })
          );
          const allSynced = syncResults.every(s => s === 'synced');
          const hasError = syncResults.some(s => s === 'error' || s === 'connect');
          
          if (hasError) {
            setStatus('error');
          } else {
            setStatus(allSynced ? 'synced' : 'unsynced');
          }
        }
      }
    } catch (error) {
      console.error('Error fetching sync status:', error);
      setStatus('error');
    } finally {
      setIsLoading(false);
    }
  }, [userId, groupId]);

  // Initial fetch and polling
  useEffect(() => {
    fetchSyncStatus();

    // Poll for updates every 30 seconds
    const interval = setInterval(fetchSyncStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchSyncStatus]);

  // When sync completes, refetch the actual status instead of assuming success
  useEffect(() => {
    if (prevIsSyncing.current && !isSyncing) {
      fetchSyncStatus();
    }
    prevIsSyncing.current = isSyncing;
  }, [isSyncing, fetchSyncStatus]);

  const finalStatus = isSyncing ? 'syncing' : (isLoading ? 'checking' : status);

  const getStatusConfig = () => {
    const syncedDot = '#22c55e';
    const unsyncedDot = '#ef4444';
    const neutralDot = 'var(--color-text-muted)';

    switch (finalStatus) {
      case 'synced':
        return {
          text: 'Synced',
          dot: syncedDot,
          variant: 'success' as const
        };
      case 'unsynced':
        return {
          text: 'Unsynced',
          dot: unsyncedDot,
          variant: 'error' as const
        };
      case 'stale':
        return {
          text: 'Stale',
          dot: neutralDot,
          variant: 'muted' as const
        };
      case 'connect':
        return {
          text: 'Reconnect',
          dot: neutralDot,
          variant: 'warning' as const
        };
      case 'syncing':
        return {
          text: 'Syncing',
          dot: neutralDot,
          variant: 'muted' as const
        };
      case 'checking':
        return {
          text: 'Checking',
          dot: neutralDot,
          variant: 'muted' as const
        };
      case 'error':
        return {
          text: 'Error',
          dot: unsyncedDot,
          variant: 'error' as const
        };
      default:
        return {
          text: 'Unknown',
          dot: neutralDot,
          variant: 'muted' as const
        };
    }
  };

  const config = getStatusConfig();
  const isSpinning = finalStatus === 'syncing' || finalStatus === 'checking';

  const content = (
    <Badge variant={config.variant} size={size} className={`${className} bg-surface-hover`}>
      <div 
        className={`w-2 h-2 rounded-full mr-1 ${isSpinning ? 'animate-spin' : ''}`} 
        style={{ backgroundColor: config.dot }}
      />
      {config.text}
    </Badge>
  );

  // Handle reconnect status separately
  if (finalStatus === 'connect' && onReconnect && userId) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onReconnect(userId);
        }}
        className="focus:outline-none border-0 shadow-none ring-0 cursor-pointer relative z-10"
        type="button"
      >
        {content}
      </button>
    );
  }

  // For error state, don't make it clickable - show message instead
  if (finalStatus === 'error' && groupId) {
    return (
      <div
        onClick={(e) => {
          e.stopPropagation();
          toast.error('Fix user credentials to resolve sync errors');
        }}
        className="cursor-pointer"
      >
        {content}
      </div>
    );
  }

  // Only make unsynced clickable, not error
  if (onSync && finalStatus === 'unsynced') {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onSync(userId || groupId!);
        }}
        className="focus:outline-none border-0 shadow-none ring-0 cursor-pointer relative z-10"
      >
        {content}
      </button>
    );
  }

  return content;
}
