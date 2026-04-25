'use client';

import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface UserPageContainerProps {
  children: ReactNode;
  className?: string;
}

/**
 * Page container for user panel with sidebar offset
 */
export function UserPageContainer({ children, className }: UserPageContainerProps) {
  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className={`ml-60 min-h-screen ${className || ''}`}
      style={{ background: 'var(--color-bg)' }}
    >
      {/* Subtle background gradient */}
      <div className="fixed inset-0 ml-60 pointer-events-none overflow-hidden">
        <div 
          className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full blur-[120px] opacity-30"
          style={{ background: 'var(--color-primaryMuted)' }}
        />
        <div 
          className="absolute -bottom-40 -left-40 w-[400px] h-[400px] rounded-full blur-[100px] opacity-20"
          style={{ background: 'var(--color-secondaryMuted)' }}
        />
      </div>

      {/* Content */}
      <div className="relative">
        {children}
      </div>
    </motion.main>
  );
}

// Page header component for user pages
interface UserPageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function UserPageHeader({ title, subtitle, actions }: UserPageHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center justify-between mb-6"
    >
      <div>
        <h1 
          className="text-2xl font-bold font-display"
          style={{ color: 'var(--color-text)' }}
        >
          {title}
        </h1>
        {subtitle && (
          <p 
            className="text-sm mt-1"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </motion.div>
  );
}
