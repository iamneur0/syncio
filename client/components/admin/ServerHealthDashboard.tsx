'use client';

import { motion } from 'framer-motion';
import { Badge } from '@/components/ui';
import { 
  ServerIcon, 
  CircleStackIcon, 
  FolderIcon, 
  ArrowPathIcon,
  SignalIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon
} from '@heroicons/react/24/outline';

interface ServerHealthDashboardProps {
  status: 'healthy' | 'warning' | 'critical';
  checks: {
    syncQueue?: {
      status: 'healthy' | 'warning' | 'critical' | 'unknown';
      message: string;
      totalUsers?: number;
      staleUsers?: number;
    };
    storage?: {
      status: 'healthy' | 'warning' | 'critical' | 'unknown';
      message: string;
      sizeMB?: number;
      fileCount?: number;
    };
    database?: {
      status: 'healthy' | 'warning' | 'critical' | 'unknown';
      message: string;
    };
    activity?: {
      status: 'healthy' | 'warning' | 'critical' | 'unknown';
      message: string;
      activeSessions?: number;
    };
  };
  metrics: {
    activeSessions: number;
    serverTime: string;
  };
}

export function ServerHealthDashboard({ status, checks, metrics }: ServerHealthDashboardProps) {
  const statusConfig = {
    healthy: { color: 'success', icon: CheckCircleIcon, label: 'All Systems Operational' },
    warning: { color: 'warning', icon: ExclamationTriangleIcon, label: 'Degraded Performance' },
    critical: { color: 'error', icon: XCircleIcon, label: 'Critical Issues Detected' },
  };

  const currentStatus = statusConfig[status];
  const StatusIcon = currentStatus.icon;

  return (
    <div className="space-y-6">
      {/* Overall Status */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`flex items-center gap-4 p-4 rounded-xl bg-${currentStatus.color}-muted border border-${currentStatus.color}/20`}
      >
        <StatusIcon className={`w-8 h-8 text-${currentStatus.color}`} />
        <div className="flex-1">
          <p className={`font-medium text-${currentStatus.color}`}>{currentStatus.label}</p>
          <p className="text-sm text-muted">
            {metrics.activeSessions} active sessions • Server time: {new Date(metrics.serverTime).toLocaleTimeString()}
          </p>
        </div>
        <Badge variant={currentStatus.color as any}>{status.toUpperCase()}</Badge>
      </motion.div>

      {/* Health Checks Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <HealthCheckCard
          title="Database Connection"
          icon={<CircleStackIcon className="w-5 h-5" />}
          check={checks.database}
        />
        <HealthCheckCard
          title="Library Storage"
          icon={<FolderIcon className="w-5 h-5" />}
          check={checks.storage}
        />
        <HealthCheckCard
          title="Sync Queue"
          icon={<ArrowPathIcon className="w-5 h-5" />}
          check={checks.syncQueue}
        />
        <HealthCheckCard
          title="Active Sessions"
          icon={<SignalIcon className="w-5 h-5" />}
          check={checks.activity}
        />
      </div>
    </div>
  );
}

interface HealthCheckCardProps {
  title: string;
  icon: React.ReactNode;
  check?: {
    status: 'healthy' | 'warning' | 'critical' | 'unknown';
    message: string;
    totalUsers?: number;
    staleUsers?: number;
    sizeMB?: number;
    fileCount?: number;
    activeSessions?: number;
  };
}

function HealthCheckCard({ title, icon, check }: HealthCheckCardProps) {
  const statusColors = {
    healthy: 'success',
    warning: 'warning',
    critical: 'error',
    unknown: 'default',
  };

  const status = check?.status || 'unknown';
  const color = statusColors[status];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="p-4 rounded-xl bg-surface-hover"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg bg-${color}-muted`}>
            {icon}
          </div>
          <div>
            <p className="font-medium text-default">{title}</p>
            <p className="text-sm text-muted">{check?.message || 'Status unknown'}</p>
          </div>
        </div>
        <div className={`w-2 h-2 rounded-full bg-${color}`} />
      </div>
      
      {check && (
        <div className="mt-3 pt-3 border-t border-default grid grid-cols-2 gap-2 text-sm">
          {check.totalUsers !== undefined && (
            <div>
              <span className="text-muted">Total Users:</span>{' '}
              <span className="text-default">{check.totalUsers}</span>
            </div>
          )}
          {check.staleUsers !== undefined && (
            <div>
              <span className="text-muted">Need Sync:</span>{' '}
              <span className={check.staleUsers > 10 ? 'text-warning' : 'text-default'}>
                {check.staleUsers}
              </span>
            </div>
          )}
          {check.sizeMB !== undefined && (
            <div>
              <span className="text-muted">Storage:</span>{' '}
              <span className={check.sizeMB > 500 ? 'text-warning' : 'text-default'}>
                {check.sizeMB} MB
              </span>
            </div>
          )}
          {check.fileCount !== undefined && (
            <div>
              <span className="text-muted">Files:</span>{' '}
              <span className="text-default">{check.fileCount}</span>
            </div>
          )}
          {check.activeSessions !== undefined && (
            <div>
              <span className="text-muted">Active:</span>{' '}
              <span className="text-default">{check.activeSessions}</span>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
