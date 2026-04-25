'use client';

import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface InviteLayoutProps {
  children: ReactNode;
  showNewRequestButton?: boolean;
  onNewRequest?: () => void;
}

/**
 * Public invite page layout with Syncio branding
 * 
 * Design direction: Clean, minimal, professional with subtle depth.
 * Focus on the content with a refined atmosphere.
 */
export function InviteLayout({ 
  children, 
  showNewRequestButton = false, 
  onNewRequest 
}: InviteLayoutProps) {
  return (
    <div 
      className="min-h-screen relative overflow-hidden"
      style={{ backgroundColor: 'var(--color-bg)' }}
    >
      {/* Subtle gradient mesh background */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse 80% 50% at 20% -10%, var(--color-primary-muted) 0%, transparent 50%),
            radial-gradient(ellipse 60% 40% at 80% 110%, var(--color-secondary-muted) 0%, transparent 50%)
          `,
          opacity: 0.5,
        }}
      />
      
      {/* Subtle grid pattern overlay */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-[0.02]"
        style={{
          backgroundImage: `
            linear-gradient(var(--color-text) 1px, transparent 1px),
            linear-gradient(90deg, var(--color-text) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />

      {/* Header with logo and optional new request button */}
      <motion.header 
        className="absolute top-0 left-0 right-0 z-10 p-6 flex items-center justify-between"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div 
            className="w-9 h-9 rounded-lg flex items-center justify-center overflow-hidden"
            style={{ 
              backgroundColor: 'var(--color-primary)',
            }}
          >
            <img src="/logo-white.png" alt="Syncio" className="w-7 h-7 object-contain" />
          </div>
          <span 
            className="text-lg font-semibold tracking-tight"
            style={{ color: 'var(--color-text)' }}
          >
            Syncio
          </span>
        </div>

        {/* New Request button */}
        {showNewRequestButton && onNewRequest && (
          <motion.button
            onClick={onNewRequest}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text-muted)',
              border: '1px solid var(--color-surface-border)',
            }}
            whileHover={{ 
              scale: 1.02,
              backgroundColor: 'var(--color-surface-hover)',
            }}
            whileTap={{ scale: 0.98 }}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
          >
            New Request
          </motion.button>
        )}
      </motion.header>

      {/* Main content */}
      <main className="min-h-screen flex items-center justify-center p-6 pt-24 pb-12">
        <motion.div 
          className="w-full max-w-md relative"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
        >
          {children}
        </motion.div>
      </main>

      {/* Footer */}
      <motion.footer 
        className="absolute bottom-0 left-0 right-0 p-6 text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <p 
          className="text-xs"
          style={{ color: 'var(--color-text-subtle)' }}
        >
          Syncio manages your Stremio addons across devices
        </p>
      </motion.footer>
    </div>
  );
}
