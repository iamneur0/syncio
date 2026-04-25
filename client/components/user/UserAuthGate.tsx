'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useUserAuth } from '@/lib/hooks/useUserAuth';

interface UserAuthGateProps {
  children: React.ReactNode;
}

/**
 * Auth gate for user panel routes
 * Redirects to login if not authenticated
 */
export function UserAuthGate({ children }: UserAuthGateProps) {
  const { isAuthenticated, isLoading, error, errorCode } = useUserAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Redirect to login with user mode
      router.push('/login?mode=user');
    }
  }, [isLoading, isAuthenticated, router]);

  // Loading state
  if (isLoading) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--color-bg)' }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          {/* Animated loader */}
          <div className="relative w-12 h-12">
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{ 
                border: '3px solid var(--color-surface-border)',
                borderTopColor: 'var(--color-primary)'
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            />
          </div>
          <p style={{ color: 'var(--color-text-muted)' }} className="text-sm">
            Verifying session...
          </p>
        </motion.div>
      </div>
    );
  }

  // Error state (e.g., user deleted, banned)
  if (error && errorCode) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center p-6"
        style={{ background: 'var(--color-bg)' }}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full p-6 rounded-xl text-center"
          style={{ 
            background: 'var(--color-surface)',
            border: '1px solid var(--color-error)'
          }}
        >
          <div 
            className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
            style={{ background: 'var(--color-error-muted)' }}
          >
            <svg 
              className="w-8 h-8" 
              style={{ color: 'var(--color-error)' }}
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
              />
            </svg>
          </div>
          <h2 
            className="text-xl font-bold mb-2"
            style={{ color: 'var(--color-text)' }}
          >
            Access Denied
          </h2>
          <p 
            className="mb-6"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {error}
          </p>
          <button
            onClick={() => router.push('/login?mode=user')}
            className="px-6 py-2 rounded-lg font-medium transition-all duration-200"
            style={{ 
              background: 'var(--color-primary)',
              color: 'white'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '0.9';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '1';
            }}
          >
            Back to Login
          </button>
        </motion.div>
      </div>
    );
  }

  // Not authenticated - will redirect
  if (!isAuthenticated) {
    return null;
  }

  // Authenticated - render children
  return <>{children}</>;
}
