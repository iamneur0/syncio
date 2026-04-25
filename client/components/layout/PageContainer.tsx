'use client';

import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface PageContainerProps {
  children: ReactNode;
  className?: string;
}

export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className={`ml-0 md:ml-60 min-h-screen ${className || ''}`}
      style={{ background: 'var(--color-bg)' }}
    >
      {/* Subtle background gradient */}
      <div className="fixed inset-0 ml-0 md:ml-60 pointer-events-none overflow-hidden">
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

// Page section with animation
interface PageSectionProps {
  children: ReactNode;
  delay?: number;
  className?: string;
}

export function PageSection({ children, delay = 0, className }: PageSectionProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

// Staggered list container - only animates on first mount
interface StaggerContainerProps {
  children: ReactNode;
  className?: string;
}

export function StaggerContainer({ children, className }: StaggerContainerProps) {
  return (
    <div className={className}>
      {children}
    </div>
  );
}

// Stagger item - uses layout animation for smooth reordering
interface StaggerItemProps {
  children: ReactNode;
  className?: string;
}

export function StaggerItem({ children, className }: StaggerItemProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
