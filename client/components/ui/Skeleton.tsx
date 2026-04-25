'use client';

import clsx from 'clsx';

interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({ className, style }: SkeletonProps) {
  return (
    <div
      className={clsx(
        'relative overflow-hidden rounded-lg bg-surface-300/50',
        'before:absolute before:inset-0 before:-translate-x-full',
        'before:animate-shimmer before:bg-gradient-to-r',
        'before:from-transparent before:via-white/5 before:to-transparent',
        className
      )}
      style={style}
    />
  );
}

// Card skeleton
export function CardSkeleton() {
  return (
    <div className="glass-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
      <Skeleton className="h-10 w-32" />
      <Skeleton className="h-4 w-20" />
    </div>
  );
}

// Table row skeleton
export function TableRowSkeleton({ columns = 5 }: { columns?: number }) {
  return (
    <tr className="border-b border-white/5">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-6 py-4">
          <Skeleton className="h-5 w-full max-w-[150px]" />
        </td>
      ))}
    </tr>
  );
}

// User card skeleton
export function UserCardSkeleton() {
  return (
    <div className="glass-card p-6 space-y-4">
      <div className="flex items-center gap-4">
        <Skeleton className="w-12 h-12 rounded-full" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
      </div>
    </div>
  );
}

// Chart skeleton
export function ChartSkeleton() {
  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-6">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-8 w-24 rounded-lg" />
      </div>
      <div className="h-64 flex items-end gap-2 px-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton
            key={i}
            className="flex-1 rounded-t-lg"
            style={{ height: `${Math.random() * 60 + 20}%` }}
          />
        ))}
      </div>
    </div>
  );
}

// Group card skeleton
export function GroupCardSkeleton() {
  return (
    <div className="relative p-6 rounded-2xl border border-default bg-surface">
      <div className="flex items-start gap-4">
        {/* Color icon */}
        <Skeleton className="w-12 h-12 rounded-xl shrink-0" />
        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-48" />
          <div className="flex items-center gap-4">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
          </div>
        </div>
      </div>
      {/* Footer */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-default">
        <div className="flex -space-x-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="w-6 h-6 rounded-full border-2 border-surface" />
          ))}
        </div>
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
}

// Addon card skeleton
export function AddonCardSkeleton() {
  return (
    <div className="relative p-6 rounded-2xl border border-default bg-surface">
      <div className="flex items-start gap-4">
        {/* Logo */}
        <Skeleton className="w-12 h-12 rounded-xl shrink-0" />
        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-12 rounded-full" />
          </div>
          <Skeleton className="h-4 w-full" />
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

// Invitation card skeleton
export function InvitationCardSkeleton() {
  return (
    <div className="relative p-6 rounded-2xl border border-default bg-surface">
      <div className="flex items-start gap-4">
        {/* Icon */}
        <Skeleton className="w-12 h-12 rounded-xl shrink-0" />
        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-4 w-40" />
          <div className="flex items-center gap-4">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      </div>
    </div>
  );
}
