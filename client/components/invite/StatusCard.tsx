'use client';

import Link from 'next/link';
import { Button } from '@/components/ui';
import { motion } from 'framer-motion';
import { 
  ClockIcon, 
  CheckCircleIcon, 
  XCircleIcon, 
  ExclamationTriangleIcon, 
  NoSymbolIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { ReactNode, ComponentType } from 'react';

type StatusType = 
  | 'pending' 
  | 'accepted' 
  | 'rejected' 
  | 'completed' 
  | 'error' 
  | 'disabled' 
  | 'expired'
  | 'email-mismatch'
  | 'not-found';

interface StatusCardProps {
  type: StatusType;
  title: string;
  children?: ReactNode;
  footer?: ReactNode;
}

// Icon component type for Heroicons
type HeroIconComponent = ComponentType<{ className?: string; style?: React.CSSProperties }>;

const statusConfig: Record<StatusType, {
  icon: HeroIconComponent;
  iconColor: string;
  bgColor: string;
  borderColor: string;
}> = {
  pending: {
    icon: ClockIcon,
    iconColor: 'var(--color-warning)',
    bgColor: 'var(--color-warning-muted)',
    borderColor: 'var(--color-warning)',
  },
  accepted: {
    icon: CheckCircleIcon,
    iconColor: 'var(--color-success)',
    bgColor: 'var(--color-success-muted)',
    borderColor: 'var(--color-success)',
  },
  rejected: {
    icon: XCircleIcon,
    iconColor: 'var(--color-error)',
    bgColor: 'var(--color-error-muted)',
    borderColor: 'var(--color-error)',
  },
  completed: {
    icon: CheckCircleIcon,
    iconColor: 'var(--color-success)',
    bgColor: 'var(--color-success-muted)',
    borderColor: 'var(--color-success)',
  },
  error: {
    icon: ExclamationTriangleIcon,
    iconColor: 'var(--color-error)',
    bgColor: 'var(--color-error-muted)',
    borderColor: 'var(--color-error)',
  },
  disabled: {
    icon: NoSymbolIcon,
    iconColor: 'var(--color-error)',
    bgColor: 'var(--color-error-muted)',
    borderColor: 'var(--color-error)',
  },
  expired: {
    icon: ArrowPathIcon,
    iconColor: 'var(--color-error)',
    bgColor: 'var(--color-error-muted)',
    borderColor: 'var(--color-error)',
  },
  'email-mismatch': {
    icon: XCircleIcon,
    iconColor: 'var(--color-error)',
    bgColor: 'var(--color-error-muted)',
    borderColor: 'var(--color-error)',
  },
  'not-found': {
    icon: XCircleIcon,
    iconColor: 'var(--color-error)',
    bgColor: 'var(--color-error-muted)',
    borderColor: 'var(--color-error)',
  },
};

/**
 * Status card for displaying various states in the invite flow
 */
export function StatusCard({ type, title, children, footer }: StatusCardProps) {
  const config = statusConfig[type];
  const Icon = config.icon;

  return (
    <motion.div
      className="rounded-2xl overflow-hidden"
      style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-surface-border)',
      }}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* Top accent border */}
      <div 
        className="h-1"
        style={{ backgroundColor: config.borderColor }}
      />

      <div className="p-8">
        {/* Icon */}
        <motion.div
          className="w-16 h-16 mx-auto mb-5 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: config.bgColor }}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <Icon 
            className="w-8 h-8" 
            style={{ color: config.iconColor }} 
          />
        </motion.div>

        {/* Title */}
        <motion.h1 
          className="text-2xl font-semibold mb-4 text-center"
          style={{ color: 'var(--color-text)' }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
        >
          {title}
        </motion.h1>

        {/* Content */}
        {children && (
          <motion.div 
            className="text-sm text-center"
            style={{ color: 'var(--color-text-muted)' }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
          >
            {children}
          </motion.div>
        )}

        {/* Pending pulse animation */}
        {type === 'pending' && (
          <motion.div 
            className="flex items-center justify-center gap-2 mt-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.3 }}
          >
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: 'var(--color-warning)' }}
                  animate={{
                    scale: [1, 1.3, 1],
                    opacity: [0.5, 1, 0.5],
                  }}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                    delay: i * 0.2,
                  }}
                />
              ))}
            </div>
            <span 
              className="text-xs"
              style={{ color: 'var(--color-text-subtle)' }}
            >
              Auto-updates when reviewed
            </span>
          </motion.div>
        )}

        {/* Footer */}
        {footer && (
          <motion.div 
            className="mt-6"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.25 }}
          >
            {footer}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

/**
 * Preset status cards for common states
 */
export const StatusCards = {
  Pending: () => (
    <StatusCard type="pending" title="Request Pending">
      <p>Your request is waiting for admin approval.</p>
      <p className="mt-2 opacity-75">This page will update automatically when your request is reviewed.</p>
    </StatusCard>
  ),

  Rejected: () => (
    <StatusCard type="rejected" title="Request Rejected">
      <p>Your request has been rejected by the administrator.</p>
      <p className="mt-2 opacity-75">Contact the administrator for more information.</p>
    </StatusCard>
  ),

  Completed: () => (
    <StatusCard 
      type="completed" 
      title="Welcome to Syncio!"
      footer={
        <div className="flex justify-center w-full">
          <Link href="/login" className="w-full sm:w-auto">
            <Button variant="primary" className="w-full">
              Go to Dashboard
            </Button>
          </Link>
        </div>
      }
    >
      <p>Your account has been created successfully.</p>
      <p className="mt-2 opacity-75">You can now use Syncio to manage your Stremio addons.</p>
    </StatusCard>
  ),

  Disabled: () => (
    <StatusCard type="disabled" title="Invite Link Disabled">
      <p>This invitation has been disabled by the administrator.</p>
      <p className="mt-2 opacity-75">The invitation needs to be re-enabled or a new one generated.</p>
    </StatusCard>
  ),

  NotFound: () => (
    <StatusCard type="not-found" title="Invalid Invite Link">
      <p>This invitation link doesn&apos;t exist or has been removed.</p>
      <p className="mt-2 opacity-75">Please check the link and try again.</p>
    </StatusCard>
  ),

  EmailMismatch: () => (
    <StatusCard type="email-mismatch" title="Wrong Stremio Account">
      <p>The Stremio account you used has a different email than your request.</p>
      <p className="mt-2 opacity-75">Please start a new request with the correct email address.</p>
    </StatusCard>
  ),

  OAuthExpired: () => (
    <StatusCard type="expired" title="OAuth Link Expired">
      <p>The authentication link has expired.</p>
      <p className="mt-2 opacity-75">Contact your administrator to generate a new one. This page will refresh automatically.</p>
    </StatusCard>
  ),
};
