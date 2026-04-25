'use client';

import { AtRiskUser } from '@/lib/api';
import { motion } from 'framer-motion';
import { Avatar, Badge } from '@/components/ui';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface AtRiskUsersTableProps {
  atRiskUsers: AtRiskUser[];
  criticalUsers: AtRiskUser[];
  onUserClick: (user: AtRiskUser) => void;
}

export function AtRiskUsersTable({
  atRiskUsers,
  criticalUsers,
  onUserClick,
}: AtRiskUsersTableProps) {
  const allUsers = [...criticalUsers, ...atRiskUsers];

  if (allUsers.length === 0) {
    return (
      <div className="text-center py-8 text-muted">
        No at-risk users - everyone is active!
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {allUsers.map((user, index) => (
        <motion.div
          key={user.id}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.05 }}
          onClick={() => onUserClick(user)}
          className="flex items-center gap-4 p-3 rounded-xl bg-surface-hover cursor-pointer hover:bg-surface transition-colors"
        >
          <Avatar name={user.username} size="md" />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-default">{user.username}</span>
              {user.neverWatched ? (
                <Badge variant="error" size="sm">
                  Never Watched
                </Badge>
              ) : user.daysInactive >= 60 ? (
                <Badge variant="error" size="sm">
                  Critical
                </Badge>
              ) : (
                <Badge variant="warning" size="sm">
                  At Risk
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted truncate">{user.email}</p>
          </div>

          <div className="text-right">
            <p className="text-sm font-medium text-default">
              {user.daysInactive} days inactive
            </p>
            <p className="text-xs text-muted">{user.totalWatchTimeHours}h total watch time</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
