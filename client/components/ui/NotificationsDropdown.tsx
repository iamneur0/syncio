'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BellIcon, XMarkIcon, CheckCircleIcon, EnvelopeIcon, UsersIcon, PuzzlePieceIcon, ClockIcon, UserPlusIcon, CheckIcon } from '@heroicons/react/24/outline';
import { Card, Badge, Button, Avatar } from '@/components/ui';
import { api } from '@/lib/api';
import { toast } from '@/components/ui/Toast';

interface NotificationItem {
  id: string;
  type: 'activity' | 'invite' | 'task' | 'user' | 'request';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  poster?: string;
  data?: any;
}

interface NotificationsDropdownProps {
  activities: any[];
  inviteHistory: any[];
  taskHistory: any[];
}

export function NotificationsDropdown({ activities, inviteHistory, taskHistory }: NotificationsDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [lastChecked, setLastChecked] = useState<Date>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('notifications-last-checked');
      return stored ? new Date(stored) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Default to 7 days ago
    }
    return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  });

  const [pendingRequests, setPendingRequests] = useState<any[]>([]);

  // Fetch pending requests
  useEffect(() => {
    const fetchRequests = async () => {
      try {
        const invitations = await api.getInvitations();
        const allRequests: any[] = [];
        
        for (const inv of invitations) {
          const invName = inv.name || inv.code || inv.inviteCode || 'Invitation';
          if (inv.requests && Array.isArray(inv.requests)) {
            allRequests.push(...inv.requests.map((req: any) => ({
              ...req,
              invitationName: invName
            })));
          } else {
            try {
              const reqs = await api.getInvitationRequests(inv.id);
              if (Array.isArray(reqs)) {
                allRequests.push(...reqs.map((req: any) => ({
                  ...req,
                  invitationName: invName
                })));
              }
            } catch {
              // Ignore errors
            }
          }
        }
        
        setPendingRequests(allRequests.filter((r: any) => r.status === 'pending'));
      } catch (e) {
        console.error('Failed to fetch pending requests', e);
      }
    };

    fetchRequests();
    // Poll every 30 seconds
    const interval = setInterval(fetchRequests, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleAcceptRequest = async (e: React.MouseEvent, reqId: string) => {
    e.stopPropagation();
    try {
      await api.acceptInviteRequest(reqId);
      toast.success('Request accepted');
      setPendingRequests(prev => prev.filter(r => r.id !== reqId));
    } catch (err: any) {
      toast.error(err.message || 'Failed to accept request');
    }
  };

  const handleRejectRequest = async (e: React.MouseEvent, reqId: string) => {
    e.stopPropagation();
    try {
      await api.rejectInviteRequest(reqId);
      toast.success('Request rejected');
      setPendingRequests(prev => prev.filter(r => r.id !== reqId));
    } catch (err: any) {
      toast.error(err.message || 'Failed to reject request');
    }
  };

  // Generate notifications from activities, invites, and tasks since last checked
  const notifications = useMemo(() => {
    const items: NotificationItem[] = [];
    const now = new Date();

    // Add pending requests (ALWAYS show these, regardless of last checked)
    pendingRequests.forEach((req) => {
      items.push({
        id: `req-${req.id}`,
        type: 'request',
        title: 'Access Request',
        message: `${req.username} requested access via ${req.invitationName}`,
        timestamp: new Date(req.createdAt),
        read: false,
        data: req
      });
    });

    // Add recent activities
    activities
      .filter((activity) => new Date(activity.timestamp) > lastChecked)
      .slice(0, 5)
      .forEach((activity) => {
        items.push({
          id: `activity-${activity.id}`,
          type: 'activity',
          title: `${activity.userName} ${activity.type === 'watch' ? 'is watching' : activity.type === 'complete' ? 'completed' : 'synced'}`,
          message: activity.contentName,
          timestamp: new Date(activity.timestamp),
          read: false,
          poster: activity.poster,
        });
      });

    // Add recent invite uses
    inviteHistory
      .filter((invite) => invite.action === 'used' && new Date(invite.timestamp) > lastChecked)
      .slice(0, 3)
      .forEach((invite) => {
        items.push({
          id: `invite-${invite.id}`,
          type: 'invite',
          title: 'Invite used',
          message: `${invite.userName || 'Someone'} joined ${invite.groupName}`,
          timestamp: new Date(invite.timestamp),
          read: false,
        });
      });

    // Add recent task completions
    taskHistory
      .filter((task) => new Date(task.timestamp) > lastChecked && task.status === 'success')
      .slice(0, 3)
      .forEach((task) => {
        items.push({
          id: `task-${task.id}`,
          type: 'task',
          title: 'Task completed',
          message: `${task.type.replace('_', ' ')} completed successfully`,
          timestamp: new Date(task.timestamp),
          read: false,
        });
      });

    // Sort by timestamp, most recent first
    // Requests should stay at top if we want them prominent? 
    // Or just sort by time. Pending requests are usually recent.
    return items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [activities, inviteHistory, taskHistory, lastChecked, pendingRequests]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleMarkAllRead = () => {
    const now = new Date();
    setLastChecked(now);
    if (typeof window !== 'undefined') {
      localStorage.setItem('notifications-last-checked', now.toISOString());
    }
    setIsOpen(false);
  };

  const handleClearAll = () => {
    const now = new Date();
    setLastChecked(now);
    if (typeof window !== 'undefined') {
      localStorage.setItem('notifications-last-checked', now.toISOString());
    }
    setIsOpen(false);
  };

  const getNotificationIcon = (type: NotificationItem['type']) => {
    switch (type) {
      case 'activity':
        return <ClockIcon className="w-4 h-4" />;
      case 'invite':
        return <EnvelopeIcon className="w-4 h-4" />;
      case 'task':
        return <CheckCircleIcon className="w-4 h-4" />;
      case 'user':
        return <UsersIcon className="w-4 h-4" />;
      case 'request':
        return <UserPlusIcon className="w-4 h-4" />;
    }
  };

  const formatNotificationTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    return `${diffDays}d ago`;
  };

  // Close on click outside + Escape
  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      const withinDropdown = containerRef.current?.contains(target);
      const withinButton = buttonRef.current?.contains(target);
      if (!withinDropdown && !withinButton) {
        setIsOpen(false);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown, true);
    document.addEventListener('touchstart', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown, true);
      document.removeEventListener('touchstart', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={containerRef}>
      <motion.button
        ref={buttonRef}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg transition-colors"
        style={{ color: 'var(--color-textMuted)' }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--color-surfaceHover)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
        }}
        aria-label="Notifications"
      >
        <BellIcon className="w-5 h-5" />
        {unreadCount > 0 && (
          <span 
            className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
            style={{ background: 'var(--color-primary)' }}
          />
        )}
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />
            
            {/* Dropdown */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-full mt-2 z-50 w-80 max-w-[calc(100vw-2rem)]"
            >
              <Card padding="none" className="shadow-xl border border-default max-h-[500px] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-default">
                  <h3 className="text-sm font-semibold text-default">Notifications</h3>
                  {notifications.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleMarkAllRead}
                        className="text-xs"
                      >
                        Mark all read
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleClearAll}
                        className="text-xs"
                      >
                        Clear
                      </Button>
                    </div>
                  )}
                </div>

                {/* Notifications list */}
                <div className="overflow-y-auto max-h-[400px]">
                  {notifications.length === 0 ? (
                    <div className="p-8 text-center">
                      <BellIcon className="w-8 h-8 mx-auto mb-2 text-subtle" />
                      <p className="text-sm text-muted">No new notifications</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-default">
                      {notifications.map((notification) => (
                        <motion.div
                          key={notification.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="p-4 hover:bg-surface-hover transition-colors cursor-pointer"
                        >
                          <div className="flex flex-col gap-3">
                            <div className="flex items-start gap-3">
                              {notification.poster ? (
                                <div className="w-10 h-14 rounded-lg overflow-hidden shrink-0 bg-surface border border-default">
                                  <img
                                    src={notification.poster}
                                    alt={notification.message}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      // If image fails, just hide it (we'll fall back to icon)
                                      (e.currentTarget.parentElement as HTMLElement | null)?.remove();
                                    }}
                                  />
                                </div>
                              ) : notification.type === 'request' && notification.data ? (
                                <Avatar
                                  name={notification.data.username || notification.data.email || 'User'}
                                  email={notification.data.email}
                                  size="sm"
                                />
                              ) : (
                                <div className={`p-1.5 rounded-lg flex-shrink-0 ${
                                  notification.type === 'request' ? 'bg-primary/10 text-primary' : 'bg-primary-muted text-primary'
                                }`}>
                                  {getNotificationIcon(notification.type)}
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-default">{notification.title}</p>
                                <p className="text-xs text-muted mt-0.5 truncate">{notification.message}</p>
                                <p className="text-xs text-subtle mt-1">{formatNotificationTime(notification.timestamp)}</p>
                              </div>
                            </div>

                            {/* Actions for requests */}
                            {notification.type === 'request' && notification.data && (
                              <div className="flex items-center gap-2 pl-10">
                                <Button
                                  size="sm"
                                  variant="primary"
                                  onClick={(e) => handleAcceptRequest(e, notification.data.id)}
                                  className="h-7 text-xs px-3"
                                >
                                  Accept
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={(e) => handleRejectRequest(e, notification.data.id)}
                                  className="h-7 text-xs px-3"
                                >
                                  Reject
                                </Button>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}