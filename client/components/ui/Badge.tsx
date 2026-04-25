'use client';

import clsx from 'clsx';

export type BadgeVariant = 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'aurora' | 'cyan' | 'neutral' | 'outline' | 'muted';
type BadgeSize = 'sm' | 'md';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  pulse?: boolean;
  icon?: React.ReactNode;
  className?: string;
  title?: string;
}

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-[10px]',
  md: 'px-2.5 py-1 text-xs',
};

// Get badge styles based on variant using CSS variables
function getBadgeStyles(variant: BadgeVariant) {
  switch (variant) {
    case 'primary':
    case 'aurora': // Legacy
      return {
        background: 'var(--color-primaryMuted)',
        color: 'var(--color-primary)',
        borderColor: 'transparent',
      };
    case 'secondary':
    case 'cyan': // Legacy
      return {
        background: 'var(--color-secondaryMuted)',
        color: 'var(--color-secondary)',
        borderColor: 'transparent',
      };
    case 'success':
      return {
        background: 'var(--color-successMuted)',
        color: 'var(--color-success)',
        borderColor: 'transparent',
      };
    case 'warning':
      return {
        background: 'var(--color-warningMuted)',
        color: 'var(--color-warning)',
        borderColor: 'transparent',
      };
    case 'error':
      return {
        background: 'var(--color-errorMuted)',
        color: 'var(--color-error)',
        borderColor: 'transparent',
      };
    case 'outline':
      return {
        background: 'transparent',
        color: 'var(--color-textMuted)',
        borderColor: 'var(--color-surfaceBorder)',
      };
    case 'muted':
      return {
        background: 'var(--color-bgMuted)',
        color: 'var(--color-textSubtle)',
        borderColor: 'transparent',
      };
    case 'default':
    case 'neutral':
    default:
      return {
        background: 'var(--color-bgMuted)',
        color: 'var(--color-textMuted)',
        borderColor: 'transparent',
      };
  }
}

function getPulseColor(variant: BadgeVariant) {
  switch (variant) {
    case 'primary':
    case 'aurora':
      return 'var(--color-primary)';
    case 'secondary':
    case 'cyan':
      return 'var(--color-secondary)';
    case 'success':
      return 'var(--color-success)';
    case 'warning':
      return 'var(--color-warning)';
    case 'error':
      return 'var(--color-error)';
    default:
      return 'var(--color-textMuted)';
  }
}

export function Badge({ children, variant = 'default', size = 'sm', pulse = false, icon, className, title }: BadgeProps) {
  const styles = getBadgeStyles(variant);
  const pulseColor = getPulseColor(variant);
  
  // Check if bg-surface-hover, bg-surface, bg-page, or bg-subtle is in className and override background
  const hasSurfaceHoverBg = className?.includes('bg-surface-hover');
  const hasSurfaceBg = className?.includes('bg-surface');
  const hasPageBg = className?.includes('bg-page');
  const hasSubtleBg = className?.includes('bg-subtle');
  
  let finalStyles = styles;
  if (hasSurfaceHoverBg) {
    finalStyles = { ...styles, background: 'var(--color-surface-hover)' };
  } else if (hasSurfaceBg) {
    finalStyles = { ...styles, background: 'var(--color-surface)' };
  } else if (hasPageBg) {
    finalStyles = { ...styles, background: 'var(--color-bg)' };
  } else if (hasSubtleBg) {
    finalStyles = { ...styles, background: 'var(--color-bg-subtle)' };
  }

  return (
    <span 
      className={clsx(
        'inline-flex items-center gap-1 rounded-full border font-medium',
        sizeStyles[size],
        className
      )}
      style={finalStyles}
      title={title}
    >
      {pulse && (
        <span className="relative flex h-1.5 w-1.5">
          <span 
            className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
            style={{ background: pulseColor }}
          />
          <span 
            className="relative inline-flex rounded-full h-1.5 w-1.5"
            style={{ background: pulseColor }}
          />
        </span>
      )}
      {icon}
      {children}
    </span>
  );
}

// Resource badge for addon types
interface ResourceBadgeProps {
  resource: string;
  size?: 'sm' | 'md';
}

export function ResourceBadge({ resource, size = 'sm' }: ResourceBadgeProps) {
  return (
    <Badge variant="secondary" size={size}>
      {resource}
    </Badge>
  );
}

// Status badge
interface StatusBadgeProps {
  status: 'active' | 'inactive' | 'expired' | 'pending' | 'syncing';
}

const statusConfig: Record<string, { variant: BadgeVariant; label: string; pulse?: boolean }> = {
  active: { variant: 'success', label: 'Active' },
  inactive: { variant: 'default', label: 'Inactive' },
  expired: { variant: 'error', label: 'Expired' },
  pending: { variant: 'warning', label: 'Pending', pulse: true },
  syncing: { variant: 'secondary', label: 'Syncing', pulse: true },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <Badge variant={config.variant} pulse={config.pulse}>
      {config.label}
    </Badge>
  );
}

// Version badge for addons
interface VersionBadgeProps {
  version: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function VersionBadge({ version, size = 'sm', className }: VersionBadgeProps) {
  return (
    <Badge variant="primary" size={size} className={className}>
      v{version}
    </Badge>
  );
}
