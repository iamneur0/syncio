'use client';

import { motion, HTMLMotionProps } from 'framer-motion';
import clsx from 'clsx';

interface CardProps extends HTMLMotionProps<'div'> {
  variant?: 'default' | 'elevated' | 'bordered' | 'interactive' | 'aurora';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

const paddingStyles = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
};

export function Card({
  variant = 'default',
  padding = 'md',
  children,
  className,
  style,
  ...props
}: CardProps) {
  const isInteractive = variant === 'interactive';
  const isAurora = variant === 'aurora';

  return (
    <motion.div
      whileHover={isInteractive ? { scale: 1.01 } : undefined}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className={clsx(
        'rounded-xl relative',
        paddingStyles[padding],
        variant === 'bordered' && 'accent-border',
        className
      )}
      style={{
        background: isAurora 
          ? 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%)'
          : 'var(--color-surface)',
        border: isAurora ? 'none' : '1px solid var(--color-surface-border)',
        ...style,
      }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

// Stat Card Component
interface StatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: { value: number; isPositive: boolean };
  delay?: number;
  onClick?: () => void;
}

export function StatCard({ label, value, icon, trend, delay = 0, onClick }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      whileHover={{ y: -2, scale: onClick ? 1.02 : 1 }}
      onClick={onClick}
      className={`rounded-xl p-4 relative overflow-hidden h-[100px] group ${onClick ? 'cursor-pointer' : ''}`}
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-surface-border)',
      }}
    >
      {/* Hover glow */}
      <div 
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ background: 'var(--color-primaryMuted)' }}
      />

      <div className="relative flex items-start justify-between h-full">
        <div className="flex flex-col justify-between h-full">
          <p className="text-xs font-medium" style={{ color: 'var(--color-textMuted)' }}>
            {label}
          </p>
          <div>
            <motion.p
              className="text-2xl font-bold font-display"
              style={{ color: 'var(--color-text)' }}
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, delay: delay + 0.1 }}
            >
              {typeof value === 'number' ? value.toLocaleString() : value}
            </motion.p>
            {trend ? (
              <div 
                className="flex items-center gap-1 text-xs font-medium mt-0.5"
                style={{ color: trend.isPositive ? 'var(--color-success)' : 'var(--color-error)' }}
              >
                <span>{trend.isPositive ? '↑' : '↓'}</span>
                <span>{Math.abs(trend.value)}%</span>
              </div>
            ) : (
              <div className="h-4" /> /* Spacer for consistent height */
            )}
          </div>
        </div>
        {icon && (
          <div 
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ 
              background: 'var(--color-primaryMuted)',
              color: 'var(--color-primary)'
            }}
          >
            {icon}
          </div>
        )}
      </div>
    </motion.div>
  );
}
