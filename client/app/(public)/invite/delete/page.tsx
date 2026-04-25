'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { 
  TrashIcon, 
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import { InviteLayout } from '@/components/invite/InviteLayout';
import { StremioOAuthCard } from '@/components/invite/StremioOAuthCard';
import { StatusCard } from '@/components/invite/StatusCard';
import { inviteApi, InviteApiError } from '@/lib/invite-api';

type DeleteState = 'confirm' | 'oauth' | 'success' | 'error' | 'not-found';

/**
 * User self-deletion page
 * 
 * Allows users to delete their own account by authenticating with Stremio.
 */
export default function DeleteAccountPage() {
  const [state, setState] = useState<DeleteState>('confirm');
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Handle OAuth completion - delete the user
  const handleAuthKey = async (authKey: string) => {
    setIsDeleting(true);
    setErrorMessage(null);
    
    try {
      await inviteApi.deleteUser(authKey);
      setState('success');
    } catch (error) {
      if (error instanceof InviteApiError) {
        if (error.status === 404) {
          setState('not-found');
          return;
        }
        setErrorMessage(error.message || 'Failed to delete account');
      } else {
        setErrorMessage('An unexpected error occurred');
      }
      setState('error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle error from OAuth card
  const handleOAuthError = (message: string) => {
    console.error('OAuth error:', message);
  };

  // Start the deletion flow
  const handleStartDelete = () => {
    setState('oauth');
  };

  // Go back to confirmation
  const handleCancel = () => {
    setState('confirm');
    setErrorMessage(null);
  };

  // Render based on state
  const renderContent = () => {
    switch (state) {
      case 'confirm':
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
            {/* Warning accent */}
            <div 
              className="h-1"
              style={{ backgroundColor: 'var(--color-error)' }}
            />

            <div className="p-8">
              {/* Icon */}
              <motion.div
                className="w-16 h-16 mx-auto mb-5 rounded-2xl flex items-center justify-center"
                style={{ backgroundColor: 'var(--color-error-muted)' }}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.1 }}
              >
                <TrashIcon 
                  className="w-8 h-8" 
                  style={{ color: 'var(--color-error)' }} 
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
                Delete Your Account
              </motion.h1>

              {/* Warning */}
              <motion.div
                className="mb-6 p-4 rounded-xl flex items-start gap-3"
                style={{ backgroundColor: 'var(--color-warning-muted)' }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.2 }}
              >
                <ExclamationTriangleIcon 
                  className="w-5 h-5 flex-shrink-0 mt-0.5" 
                  style={{ color: 'var(--color-warning)' }} 
                />
                <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  <p className="font-medium" style={{ color: 'var(--color-warning)' }}>
                    This action cannot be undone
                  </p>
                  <p className="mt-1">
                    Your account and all associated data will be permanently deleted.
                    You&apos;ll need to request access again if you want to rejoin.
                  </p>
                </div>
              </motion.div>

              {/* Actions */}
              <motion.div
                className="space-y-3"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.25 }}
              >
                <button
                  onClick={handleStartDelete}
                  className="w-full py-3.5 rounded-xl font-medium transition-all flex items-center justify-center gap-2"
                  style={{
                    backgroundColor: 'var(--color-error)',
                    color: 'white',
                  }}
                >
                  <TrashIcon className="w-5 h-5" />
                  <span>Delete My Account</span>
                </button>

                <p 
                  className="text-xs text-center"
                  style={{ color: 'var(--color-text-subtle)' }}
                >
                  You&apos;ll need to authenticate with Stremio to confirm
                </p>
              </motion.div>
            </div>
          </motion.div>
        );

      case 'oauth':
        return (
          <div className="space-y-4">
            <StremioOAuthCard
              onAuthKey={handleAuthKey}
              onError={handleOAuthError}
              isCompleting={isDeleting}
              title="Confirm Deletion"
              description="Sign in with Stremio to confirm account deletion."
            />
            
            <motion.button
              onClick={handleCancel}
              className="w-full py-3 rounded-xl font-medium transition-all"
              style={{
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-text-muted)',
                border: '1px solid var(--color-surface-border)',
              }}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              Cancel
            </motion.button>
          </div>
        );

      case 'success':
        return (
          <StatusCard type="completed" title="Account Deleted">
            <p>Your account has been successfully deleted.</p>
            <p className="mt-2 opacity-75">
              Thank you for using Syncio. You can request access again if you change your mind.
            </p>
          </StatusCard>
        );

      case 'not-found':
        return (
          <StatusCard type="not-found" title="Account Not Found">
            <p>No account was found for this Stremio user.</p>
            <p className="mt-2 opacity-75">
              The account may have already been deleted.
            </p>
          </StatusCard>
        );

      case 'error':
        return (
          <StatusCard 
            type="error" 
            title="Deletion Failed"
            footer={
              <button
                onClick={handleCancel}
                className="w-full py-3 rounded-xl font-medium transition-all"
                style={{
                  backgroundColor: 'var(--color-surface-hover)',
                  color: 'var(--color-text)',
                }}
              >
                Try Again
              </button>
            }
          >
            <p>{errorMessage || 'An error occurred while deleting your account.'}</p>
            <p className="mt-2 opacity-75">
              Please try again or contact the administrator.
            </p>
          </StatusCard>
        );

      default:
        return null;
    }
  };

  return (
    <InviteLayout>
      {renderContent()}
    </InviteLayout>
  );
}
