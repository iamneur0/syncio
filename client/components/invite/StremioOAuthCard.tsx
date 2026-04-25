'use client';

import { motion } from 'framer-motion';
import { 
  ArrowTopRightOnSquareIcon, 
  ClipboardIcon, 
  CheckIcon, 
  ArrowPathIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';
import { useState, useEffect, useCallback, useRef } from 'react';
import { stremioOAuth } from '@/lib/invite-api';

interface StremioOAuthCardProps {
  /** OAuth link provided by admin (if already generated) */
  initialLink?: string | null;
  /** OAuth code provided by admin */
  initialCode?: string | null;
  /** Expiration timestamp */
  initialExpiresAt?: string | null;
  /** Called when OAuth completes with auth key */
  onAuthKey: (authKey: string) => Promise<void>;
  /** Called on error */
  onError?: (message: string) => void;
  /** Whether the card is disabled */
  disabled?: boolean;
  /** Whether we're in completing state (called from parent) */
  isCompleting?: boolean;
  /** Title for the card */
  title?: string;
  /** Description for the card */
  description?: string;
}

/**
 * Stremio OAuth card for authenticating with Stremio
 * 
 * Supports two modes:
 * 1. Admin-generated link: Uses initialLink/initialCode props
 * 2. Self-generated link: Creates link via Stremio API
 */
export function StremioOAuthCard({
  initialLink,
  initialCode,
  initialExpiresAt,
  onAuthKey,
  onError,
  disabled = false,
  isCompleting = false,
  title = 'Complete with Stremio',
  description = 'Sign in with your Stremio account to complete the setup.',
}: StremioOAuthCardProps) {
  // OAuth state
  const [oauthLink, setOAuthLink] = useState<string | null>(initialLink || null);
  const [oauthCode, setOAuthCode] = useState<string>(initialCode || '');
  const [oauthExpiresAt, setOAuthExpiresAt] = useState<number | null>(
    initialExpiresAt ? new Date(initialExpiresAt).getTime() : null
  );
  
  // UI state
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPolling, setIsPolling] = useState(!!initialCode);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<string | null>(null);
  
  // Refs for cleanup
  const pollIntervalRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  
  // Check if OAuth is expired
  const isExpired = oauthExpiresAt ? oauthExpiresAt < Date.now() : false;
  
  // Has admin-provided link (can't refresh)
  const hasAdminLink = !!initialCode;

  // Update state when initial props change
  useEffect(() => {
    if (initialLink) {
      setOAuthLink(initialLink);
      setIsPolling(true);
    }
    if (initialCode) {
      setOAuthCode(initialCode);
      setIsPolling(true);
    }
    if (initialExpiresAt) {
      setOAuthExpiresAt(new Date(initialExpiresAt).getTime());
    }
  }, [initialLink, initialCode, initialExpiresAt]);

  // Timer for countdown
  useEffect(() => {
    if (!oauthExpiresAt || isExpired) {
      setTimeLeft(null);
      return;
    }

    const updateTimer = () => {
      const diff = Math.max(0, oauthExpiresAt - Date.now());
      if (diff === 0) {
        setTimeLeft('Expired');
        setIsPolling(false);
        return;
      }
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    };

    updateTimer();
    timerIntervalRef.current = window.setInterval(updateTimer, 1000);

    return () => {
      if (timerIntervalRef.current) {
        window.clearInterval(timerIntervalRef.current);
      }
    };
  }, [oauthExpiresAt, isExpired]);

  // Poll for OAuth completion
  useEffect(() => {
    if (!isPolling || !oauthCode || isExpired || disabled || isCompleting) {
      return;
    }

    const poll = async () => {
      try {
        const result = await stremioOAuth.poll(oauthCode);
        
        if (result.success && result.authKey) {
          setIsPolling(false);
          if (pollIntervalRef.current) {
            window.clearInterval(pollIntervalRef.current);
          }
          await onAuthKey(result.authKey);
        } else if (result.error) {
          setError(result.error);
          onError?.(result.error);
        }
      } catch (err) {
        // Silently handle polling errors
      }
    };

    // Initial poll
    poll();
    
    // Set up interval
    pollIntervalRef.current = window.setInterval(poll, 3000);

    return () => {
      if (pollIntervalRef.current) {
        window.clearInterval(pollIntervalRef.current);
      }
    };
  }, [isPolling, oauthCode, isExpired, disabled, isCompleting, onAuthKey, onError]);

  // Generate new OAuth link
  const generateLink = useCallback(async () => {
    if (isGenerating || disabled || hasAdminLink) return;
    
    setIsGenerating(true);
    setError(null);
    
    try {
      const result = await stremioOAuth.create();
      setOAuthLink(result.link);
      setOAuthCode(result.code);
      setOAuthExpiresAt(result.expiresAt);
      setIsPolling(true);
    } catch (err: any) {
      const message = err?.message || 'Failed to generate OAuth link';
      setError(message);
      onError?.(message);
    } finally {
      setIsGenerating(false);
    }
  }, [isGenerating, disabled, hasAdminLink, onError]);

  // Auto-generate if no initial link
  useEffect(() => {
    if (!initialLink && !initialCode && !oauthLink) {
      generateLink();
    }
  }, [initialLink, initialCode, oauthLink, generateLink]);

  // Copy code to clipboard
  const copyCode = useCallback(() => {
    if (!oauthCode) return;
    navigator.clipboard.writeText(oauthCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [oauthCode]);

  // Open OAuth link
  const openLink = useCallback(() => {
    if (!oauthLink || disabled) return;
    window.open(oauthLink, '_blank', 'noopener,noreferrer');
  }, [oauthLink, disabled]);

  // Time left color based on urgency
  const getTimeColor = () => {
    if (!oauthExpiresAt) return 'var(--color-text-subtle)';
    const diff = oauthExpiresAt - Date.now();
    if (diff < 60000) return 'var(--color-error)'; // < 1 min
    if (diff < 120000) return 'var(--color-warning)'; // < 2 min
    return 'var(--color-text-subtle)';
  };

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
      {/* Top accent */}
      <div 
        className="h-1"
        style={{ backgroundColor: 'var(--color-success)' }}
      />

      <div className="p-8">
        {/* Icon */}
        <motion.div
          className="w-16 h-16 mx-auto mb-5 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: 'var(--color-success-muted)' }}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <CheckCircleIcon 
            className="w-8 h-8" 
            style={{ color: 'var(--color-success)' }} 
          />
        </motion.div>

        {/* Title */}
        <motion.h2 
          className="text-2xl font-semibold mb-2 text-center"
          style={{ color: 'var(--color-text)' }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
        >
          {title}
        </motion.h2>

        {/* Description */}
        <motion.p 
          className="text-sm text-center mb-6"
          style={{ color: 'var(--color-text-muted)' }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          {description}
        </motion.p>

        {/* OAuth Actions */}
        <motion.div
          className="space-y-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.25 }}
        >
          {/* Main button - Open Stremio */}
          <button
            onClick={openLink}
            disabled={!oauthLink || disabled || isExpired || isCompleting}
            className="w-full py-3.5 rounded-xl font-medium transition-all flex items-center justify-center gap-2"
            style={{
              backgroundColor: 'var(--color-primary)',
              color: 'var(--color-bg)',
              opacity: (!oauthLink || disabled || isExpired || isCompleting) ? 0.5 : 1,
            }}
          >
            {isCompleting ? (
              <>
                <span className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                <span>Creating Account...</span>
              </>
            ) : isGenerating ? (
              <>
                <span className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                <span>Generating Link...</span>
              </>
            ) : (
              <>
                <ArrowTopRightOnSquareIcon className="w-5 h-5" />
                <span>Open Stremio</span>
              </>
            )}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div 
              className="flex-1 h-px" 
              style={{ backgroundColor: 'var(--color-surface-border)' }} 
            />
            <span 
              className="text-xs uppercase tracking-wider"
              style={{ color: 'var(--color-text-subtle)' }}
            >
              or
            </span>
            <div 
              className="flex-1 h-px" 
              style={{ backgroundColor: 'var(--color-surface-border)' }} 
            />
          </div>

          {/* Manual code entry */}
          <div className="text-center space-y-3">
            <p 
              className="text-sm"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Copy the code and paste it at{' '}
              <a
                href="https://link.stremio.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:no-underline"
                style={{ color: 'var(--color-primary)' }}
              >
                link.stremio.com
              </a>
            </p>

            {/* Code display */}
            <button
              onClick={copyCode}
              disabled={!oauthCode}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg transition-all"
              style={{
                backgroundColor: 'var(--color-bg-subtle)',
                border: '1px solid var(--color-surface-border)',
              }}
            >
              <span 
                className="font-mono text-lg tracking-widest"
                style={{ color: 'var(--color-text)' }}
              >
                {oauthCode || '----'}
              </span>
              {copied ? (
                <CheckIcon className="w-4 h-4" style={{ color: 'var(--color-success)' }} />
              ) : (
                <ClipboardIcon className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
              )}
            </button>
          </div>

          {/* Timer and refresh */}
          <div className="flex items-center justify-center gap-4 pt-2">
            {timeLeft && (
              <span 
                className="text-sm font-mono"
                style={{ color: getTimeColor() }}
              >
                {timeLeft}
              </span>
            )}
            
            {!hasAdminLink && (
              <button
                onClick={generateLink}
                disabled={isGenerating || disabled}
                className="text-sm flex items-center gap-1 hover:underline transition-all"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <ArrowPathIcon className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            )}
          </div>

          {/* Error message */}
          {error && (
            <motion.p
              className="text-sm text-center"
              style={{ color: 'var(--color-error)' }}
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {error}
            </motion.p>
          )}

          {/* Polling indicator */}
          {isPolling && !isExpired && !error && (
            <div className="flex items-center justify-center gap-2">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: 'var(--color-success)' }}
                    animate={{
                      scale: [1, 1.3, 1],
                      opacity: [0.4, 1, 0.4],
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
                Waiting for authorization...
              </span>
            </div>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}
