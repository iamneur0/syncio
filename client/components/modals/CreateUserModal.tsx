'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogPanel } from '@headlessui/react';
import { Button } from '@/components/ui';
import { toast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { useTheme } from '@/lib/theme';
import {
  UsersIcon,
  ArrowPathIcon,
  ClockIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';

// Create User Modal - Redesigned with premium aesthetic
// Can also be used for reconnecting existing users
export function CreateUserModal({
  isOpen,
  onClose,
  mode = 'create',
  userId,
  userName,
  onReconnectSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  mode?: 'create' | 'reconnect';
  userId?: string;
  userName?: string;
  onReconnectSuccess?: () => void;
}) {
  const { themeId } = useTheme();
  const isDark = themeId !== 'daylight';
  const logoSrc = isDark ? '/logo-white.png' : '/logo-black.png';

  const isReconnect = mode === 'reconnect';
  const [step, setStep] = useState<'select' | 'oauth' | 'manual' | 'details' | 'success'>('select');

  // Shared identity fields
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');

  // Manual-only field
  const [authKey, setAuthKey] = useState('');
  const [password, setPassword] = useState('');

  // OAuth flow state
  const [oauthCode, setOauthCode] = useState<string | null>(null);
  const [oauthLink, setOauthLink] = useState<string | null>(null);
  const [oauthExpiresAt, setOauthExpiresAt] = useState<string | null>(null);
  const [oauthStatus, setOauthStatus] = useState<'idle' | 'connecting' | 'waiting' | 'completed' | 'error'>('idle');
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [oauthAuthKey, setOauthAuthKey] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(0);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setStep('select');
        setUsername('');
        setEmail('');
        setAuthKey('');
        setPassword('');
        setOauthCode(null);
        setOauthLink(null);
        setOauthExpiresAt(null);
        setOauthStatus('idle');
        setOauthError(null);
        setOauthAuthKey(null);
        setCountdown(0);
        stopPolling();
        if (countdownRef.current) clearInterval(countdownRef.current);
      }, 300);
    }
  }, [isOpen]);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  const startCountdown = (expiresAt: string) => {
    if (countdownRef.current) clearInterval(countdownRef.current);

    const updateCountdown = () => {
      const remaining = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining <= 0 && countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };

    updateCountdown();
    countdownRef.current = setInterval(updateCountdown, 1000);
  };

  const startPolling = (code: string, expiresAt?: string | null) => {
    stopPolling();
    setOauthStatus('waiting');

    const expiryTime = expiresAt ? new Date(expiresAt).getTime() : null;

    pollIntervalRef.current = setInterval(async () => {
      try {
        if (expiryTime && Date.now() > expiryTime) {
          stopPolling();
          setOauthStatus('error');
          setOauthError('Link expired. Please try again.');
          return;
        }

        const result = await api.pollStremioOAuth(code);
        if (!result.success || !result.authKey) return;

        stopPolling();
        setOauthAuthKey(result.authKey);
        setOauthStatus('completed');
        setOauthError(null);

        if (isReconnect && userId) {
          // Auto-reconnect when OAuth completes
          try {
            await api.connectUserStremioWithAuthKey(userId, result.authKey);
            toast.success('Reconnected successfully');
            if (onReconnectSuccess) {
              onReconnectSuccess();
            }
          } catch (err: any) {
            console.error('Failed to reconnect:', err);
            setOauthStatus('error');
            setOauthError(err.message || 'Failed to reconnect');
          }
        } else {
          // For create mode, verify and get user info
          try {
            const verification = await api.verifyStremioAuthKey({ authKey: result.authKey });
            const vUser = verification.user || {};
            if (vUser.username) setUsername((prev) => prev || vUser.username || '');
            if (vUser.email) setEmail((prev) => prev || vUser.email || '');
          } catch (err) {
            console.error('Failed to verify Stremio auth key:', err);
          }

          // Auto-advance to details step
          setTimeout(() => setStep('details'), 800);
        }
      } catch (err: any) {
        console.error('Error while polling Stremio OAuth:', err);
        stopPolling();
        setOauthStatus('error');
        setOauthError(err.message || 'Connection failed');
      }
    }, 2500);
  };

  const handleStartOAuth = async () => {
    setOauthStatus('connecting');
    setOauthError(null);
    try {
      const data = await api.generateStremioOAuth();
      if (!data?.code || !data?.link) throw new Error('Failed to generate link');

      setOauthCode(data.code);
      setOauthLink(data.link);
      setOauthExpiresAt(data.expiresAt || null);

      if (data.expiresAt) startCountdown(data.expiresAt);

      if (typeof window !== 'undefined') {
        window.open(data.link, '_blank', 'noopener,noreferrer');
      }

      startPolling(data.code, data.expiresAt || null);
    } catch (err: any) {
      console.error('Failed to start Stremio OAuth:', err);
      setOauthStatus('error');
      setOauthError(err.message || 'Failed to connect');
    }
  };

  const handleSubmit = async () => {
    if (isReconnect) {
      // Reconnect mode - manual entry
      if (!email || !password) {
        toast.error('Email and password are required');
        return;
      }
      setIsSubmitting(true);
      try {
        await api.connectUserStremio(userId!, {
          email: email.trim(),
          password: password,
        });
        toast.success('Reconnected successfully');
        if (onReconnectSuccess) {
          onReconnectSuccess();
        }
      } catch (err: any) {
        toast.error(err.message || 'Failed to reconnect');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // Create mode
    if (step === 'details' && oauthAuthKey) {
      if (!username.trim()) {
        toast.error('Please enter a username');
        return;
      }
    } else if (step === 'manual') {
      if (!username.trim()) {
        toast.error('Username is required');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      let created: any;
      if (oauthAuthKey) {
        created = await api.createUserWithStremio({
          authKey: oauthAuthKey,
          username: username.trim(),
          email: (email || '').trim(),
        });
      } else {
        created = await api.createUser({
          name: username.trim(),
          email: email || undefined,
          authKey: authKey || undefined,
        });
      }
      setStep('success');
      setTimeout(() => {
        onClose();
        if (created?.id) {
          window.location.href = `/users/${created.id}`;
        } else {
          window.location.reload();
        }
      }, 800);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create user');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <Dialog open={isOpen} onClose={onClose} className="relative z-50">
          {/* Backdrop with blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0"
            style={{
              background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.85) 100%)',
              backdropFilter: 'blur(8px)'
            }}
          />

          <div className="fixed inset-0 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            >
            <DialogPanel
              className="w-full max-w-lg overflow-hidden"
              style={{
                background: 'var(--color-surface)',
                borderRadius: '24px',
                border: '1px solid var(--color-surfaceBorder)',
                boxShadow: '0 0 0 1px rgba(255,255,255,0.05), 0 40px 80px -20px rgba(0,0,0,0.5)'
              }}
            >
              {/* Decorative header gradient */}
              <div
                className="h-1.5 w-full"
                style={{
                  background: 'linear-gradient(90deg, var(--color-primary) 0%, color-mix(in srgb, var(--color-primary) 60%, var(--color-secondary)) 50%, var(--color-secondary) 100%)'
                }}
              />

              {/* Content */}
              <div className="p-8">
                <AnimatePresence mode="wait">
                  {/* Step: Select Method */}
                  {step === 'select' && (
                    <motion.div
                      key="select"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="text-center mb-8">
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: 'spring', delay: 0.1 }}
                          className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
                          style={{
                            background: 'linear-gradient(135deg, var(--color-primary) 0%, color-mix(in srgb, var(--color-primary) 70%, var(--color-secondary)) 100%)',
                            boxShadow: '0 8px 32px -8px var(--color-primary)'
                          }}
                        >
                          {isReconnect ? (
                            <ArrowPathIcon className="w-8 h-8 text-white" />
                          ) : (
                            <UsersIcon className="w-8 h-8 text-white" />
                          )}
                        </motion.div>
                        <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-text)' }}>
                          {isReconnect ? 'Reconnect Stremio Account' : 'Add New User'}
                        </h2>
                        <p className="text-sm" style={{ color: 'var(--color-textMuted)' }}>
                          {isReconnect 
                            ? `Choose how you'd like to reconnect ${userName}'s Stremio account`
                            : "Choose how you'd like to add this user"}
                        </p>
                      </div>

                      <div className="space-y-3">
                        {/* OAuth Option */}
                        <motion.button
                          type="button"
                          whileHover={{ scale: 1.02, y: -2 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => {
                            setStep('oauth');
                            handleStartOAuth();
                          }}
                          className="w-full p-5 rounded-2xl text-left transition-all group relative overflow-hidden"
                          style={{
                            background: 'var(--color-surfaceHover)',
                            border: '1px solid var(--color-surfaceBorder)'
                          }}
                        >
                          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{
                              background: 'linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 10%, transparent) 0%, transparent 50%)'
                            }}
                          />
                          <div className="relative flex items-center gap-4">
                            <div
                              className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                              style={{
                                background: 'linear-gradient(135deg, var(--color-primary) 0%, color-mix(in srgb, var(--color-primary) 80%, var(--color-secondary)) 100%)'
                              }}
                            >
                              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold" style={{ color: 'var(--color-text)' }}>
                                  Connect with Stremio
                                </span>
                                <span
                                  className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full"
                                  style={{
                                    background: 'var(--color-primary)',
                                    color: 'white'
                                  }}
                                >
                                  Recommended
                                </span>
                              </div>
                              <p className="text-sm mt-0.5" style={{ color: 'var(--color-textMuted)' }}>
                                Securely link via OAuth - no credentials needed
                              </p>
                            </div>
                            <svg className="w-5 h-5 text-muted group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                        </motion.button>

                        {/* Manual Option */}
                        <motion.button
                          type="button"
                          whileHover={{ scale: 1.02, y: -2 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setStep('manual')}
                          className="w-full p-5 rounded-2xl text-left transition-all group relative overflow-hidden"
                          style={{
                            background: 'var(--color-surfaceHover)',
                            border: '1px solid var(--color-surfaceBorder)'
                          }}
                        >
                          <div className="relative flex items-center gap-4">
                            <div
                              className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                              style={{ background: 'var(--color-subtle)' }}
                            >
                              <svg className="w-6 h-6" style={{ color: 'var(--color-textMuted)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="font-semibold" style={{ color: 'var(--color-text)' }}>
                                Manual Entry
                              </span>
                              <p className="text-sm mt-0.5" style={{ color: 'var(--color-textMuted)' }}>
                                {isReconnect ? 'Enter email and password' : 'Enter username and optional auth key'}
                              </p>
                            </div>
                            <svg className="w-5 h-5 text-muted group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                        </motion.button>
                      </div>

                      <button
                        type="button"
                        onClick={onClose}
                        className="w-full mt-6 py-3 text-sm font-medium rounded-xl transition-colors"
                        style={{ color: 'var(--color-textMuted)' }}
                      >
                        Cancel
                      </button>
                    </motion.div>
                  )}

                  {/* Step: OAuth Flow */}
                  {step === 'oauth' && (
                    <motion.div
                      key="oauth"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.2 }}
                      className="text-center"
                    >
                      {/* Animated connection visual with Syncio + Stremio logos */}
                      <div className="relative h-40 flex items-center justify-center mb-6">
                        {/* Left orb - Syncio */}
                        <motion.div
                          animate={{
                            x: oauthStatus === 'completed' ? 20 : 0,
                            scale: oauthStatus === 'completed' ? 1.1 : 1
                          }}
                          transition={{ type: 'spring', damping: 20 }}
                          className="w-16 h-16 rounded-2xl flex items-center justify-center z-10 overflow-hidden"
                          style={{
                            background: 'linear-gradient(135deg, var(--color-primary) 0%, color-mix(in srgb, var(--color-primary) 70%, var(--color-secondary)) 100%)',
                            boxShadow: '0 8px 32px -8px var(--color-primary)'
                          }}
                        >
                          <img src={logoSrc} alt="Syncio" className="w-10 h-10 object-contain" />
                        </motion.div>

                        {/* Connection line */}
                        <div className="absolute left-1/2 -translate-x-1/2 w-24 h-0.5 overflow-hidden">
                          <motion.div
                            animate={{
                              x: oauthStatus === 'waiting' ? ['0%', '100%'] : oauthStatus === 'completed' ? '0%' : '-100%',
                              opacity: oauthStatus === 'completed' ? 1 : oauthStatus === 'error' ? 0.3 : 1
                            }}
                            transition={{
                              x: oauthStatus === 'waiting' ? { duration: 1, repeat: Infinity, ease: 'linear' } : { duration: 0.3 },
                            }}
                            className="h-full w-full"
                            style={{
                              background: oauthStatus === 'completed'
                                ? 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))'
                                : oauthStatus === 'error'
                                ? 'var(--color-error)'
                                : 'linear-gradient(90deg, transparent, var(--color-primary), transparent)'
                            }}
                          />
                        </div>

                        {/* Right orb - Stremio */}
                        <motion.div
                          animate={{
                            x: oauthStatus === 'completed' ? -20 : 0,
                            scale: oauthStatus === 'completed' ? 1.1 : 1
                          }}
                          transition={{ type: 'spring', damping: 20 }}
                          className="w-16 h-16 rounded-2xl flex items-center justify-center z-10 ml-16"
                          style={{
                            background: 'linear-gradient(135deg, #6C4ECF 0%, #8B5CF6 100%)',
                            border: '1px solid color-mix(in srgb, #8B5CF6 50%, transparent)'
                          }}
                        >
                          <img
                            src="/stremio-logo.svg"
                            alt="Stremio"
                            className="w-10 h-10 object-contain"
                          />
                        </motion.div>

                        {/* Success burst */}
                        {oauthStatus === 'completed' && (
                          <motion.div
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1.5, opacity: 0 }}
                            transition={{ duration: 0.6 }}
                            className="absolute inset-0 flex items-center justify-center"
                          >
                            <div className="w-32 h-32 rounded-full" style={{ background: 'var(--color-primary)' }} />
                          </motion.div>
                        )}
                      </div>

                      {/* Status text */}
                      <motion.div layout className="mb-6">
                        <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--color-text)' }}>
                          {oauthStatus === 'connecting' && 'Connecting...'}
                          {oauthStatus === 'waiting' && 'Waiting for Stremio'}
                          {oauthStatus === 'completed' && (isReconnect ? 'Reconnected!' : 'Connected!')}
                          {oauthStatus === 'error' && 'Connection Failed'}
                        </h3>
                        <p className="text-sm" style={{ color: 'var(--color-textMuted)' }}>
                          {oauthStatus === 'connecting' && 'Opening Stremio...'}
                          {oauthStatus === 'waiting' && 'Complete the authorization in the Stremio tab'}
                          {oauthStatus === 'completed' && (isReconnect ? 'Stremio account reconnected successfully' : 'Stremio account linked successfully')}
                          {oauthStatus === 'error' && (oauthError || 'Please try again')}
                        </p>
                      </motion.div>

                      {/* Countdown timer */}
                      {(oauthStatus === 'waiting' || oauthStatus === 'connecting') && countdown > 0 && (
                        <div className="mb-6">
                          <div
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm"
                            style={{ background: 'var(--color-subtle)' }}
                          >
                            <ClockIcon className="w-4 h-4" style={{ color: 'var(--color-textMuted)' }} />
                            <span style={{ color: 'var(--color-textMuted)' }}>
                              Link expires in <span className="font-mono font-medium" style={{ color: 'var(--color-text)' }}>{formatCountdown(countdown)}</span>
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setStep('select')}
                          className="flex-1 py-3 text-sm font-medium rounded-xl transition-colors"
                          style={{
                            background: 'var(--color-subtle)',
                            color: 'var(--color-text)'
                          }}
                        >
                          Back
                        </button>
                        {oauthStatus === 'error' && (
                          <Button
                            variant="primary"
                            className="flex-1"
                            onClick={handleStartOAuth}
                          >
                            Try Again
                          </Button>
                        )}
                        {oauthLink && oauthStatus === 'waiting' && (
                          <Button
                            variant="secondary"
                            className="flex-1"
                            onClick={() => window.open(oauthLink, '_blank')}
                          >
                            Open Stremio Again
                          </Button>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {/* Step: Manual Entry */}
                  {step === 'manual' && (
                    <motion.div
                      key="manual"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.2 }}
                    >
                      <button
                        type="button"
                        onClick={() => setStep('select')}
                        className="flex items-center gap-2 text-sm mb-6 group"
                        style={{ color: 'var(--color-textMuted)' }}
                      >
                        <svg className="w-4 h-4 group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Back
                      </button>

                      <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                        Manual Entry
                      </h2>
                      <p className="text-sm mb-6" style={{ color: 'var(--color-textMuted)' }}>
                        {isReconnect ? 'Reconnect using Stremio credentials' : 'Create a user with optional Stremio integration'}
                      </p>

                      <div className="space-y-4">
                        {!isReconnect && (
                          <div>
                            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-textMuted)' }}>
                              Username <span style={{ color: 'var(--color-error)' }}>*</span>
                            </label>
                            <input
                              type="text"
                              placeholder="Enter a unique username"
                              value={username}
                              onChange={(e) => setUsername(e.target.value)}
                              className="w-full px-4 py-3.5 rounded-xl transition-all duration-200 focus:outline-none"
                              style={{
                                background: 'var(--color-subtle)',
                                border: '1px solid var(--color-surfaceBorder)',
                                color: 'var(--color-text)'
                              }}
                            />
                          </div>
                        )}

                        {isReconnect ? (
                          <>
                            <div>
                              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-textMuted)' }}>
                                Email <span style={{ color: 'var(--color-error)' }}>*</span>
                              </label>
                              <input
                                type="email"
                                placeholder="Enter Stremio email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full px-4 py-3.5 rounded-xl transition-all duration-200 focus:outline-none"
                                style={{
                                  background: 'var(--color-subtle)',
                                  border: '1px solid var(--color-surfaceBorder)',
                                  color: 'var(--color-text)'
                                }}
                              />
                            </div>

                            <div>
                              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-textMuted)' }}>
                                Password <span style={{ color: 'var(--color-error)' }}>*</span>
                              </label>
                              <input
                                type="password"
                                placeholder="Enter Stremio password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-4 py-3.5 rounded-xl transition-all duration-200 focus:outline-none"
                                style={{
                                  background: 'var(--color-subtle)',
                                  border: '1px solid var(--color-surfaceBorder)',
                                  color: 'var(--color-text)'
                                }}
                              />
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-textMuted)' }}>
                                Email
                              </label>
                              <input
                                type="email"
                                placeholder="Optional email address"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full px-4 py-3.5 rounded-xl transition-all duration-200 focus:outline-none"
                                style={{
                                  background: 'var(--color-subtle)',
                                  border: '1px solid var(--color-surfaceBorder)',
                                  color: 'var(--color-text)'
                                }}
                              />
                            </div>

                            <div>
                              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-textMuted)' }}>
                                Stremio Auth Key
                              </label>
                              <input
                                type="password"
                                placeholder="Paste from Stremio settings"
                                value={authKey}
                                onChange={(e) => setAuthKey(e.target.value)}
                                className="w-full px-4 py-3.5 rounded-xl transition-all duration-200 focus:outline-none"
                                style={{
                                  background: 'var(--color-subtle)',
                                  border: '1px solid var(--color-surfaceBorder)',
                                  color: 'var(--color-text)'
                                }}
                              />
                              <p className="mt-2 text-xs" style={{ color: 'var(--color-textSubtle)' }}>
                                Find this in Stremio → Settings → Account
                              </p>
                            </div>
                          </>
                        )}
                      </div>

                      <div className="flex gap-3 mt-8">
                        <button
                          type="button"
                          onClick={onClose}
                          className="flex-1 py-3.5 text-sm font-medium rounded-xl transition-colors"
                          style={{
                            background: 'var(--color-subtle)',
                            color: 'var(--color-text)'
                          }}
                        >
                          Cancel
                        </button>
                        <Button
                          variant="primary"
                          className="flex-1"
                          onClick={handleSubmit}
                          isLoading={isSubmitting}
                        >
                          {isReconnect ? 'Reconnect' : 'Create User'}
                        </Button>
                      </div>
                    </motion.div>
                  )}

                  {/* Step: Details (after OAuth) - only for create mode */}
                  {!isReconnect && step === 'details' && (
                    <motion.div
                      key="details"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.2 }}
                    >
                      {/* Success indicator */}
                      <div className="flex items-center gap-3 mb-6 p-3 rounded-xl" style={{ background: 'color-mix(in srgb, var(--color-secondary) 15%, transparent)' }}>
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center"
                          style={{ background: 'var(--color-secondary)' }}
                        >
                          <CheckIcon className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                            Stremio Connected
                          </p>
                          <p className="text-xs" style={{ color: 'var(--color-textMuted)' }}>
                            {email || 'Account linked successfully'}
                          </p>
                        </div>
                      </div>

                      <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                        Finish Setup
                      </h2>
                      <p className="text-sm mb-6" style={{ color: 'var(--color-textMuted)' }}>
                        Confirm the details for this user
                      </p>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-textMuted)' }}>
                            Username <span style={{ color: 'var(--color-error)' }}>*</span>
                          </label>
                          <input
                            type="text"
                            placeholder="Choose a display name"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full px-4 py-3.5 rounded-xl transition-all duration-200 focus:outline-none"
                            style={{
                              background: 'var(--color-subtle)',
                              border: '1px solid var(--color-surfaceBorder)',
                              color: 'var(--color-text)'
                            }}
                          />
                        </div>
                      </div>

                      <div className="flex gap-3 mt-8">
                        <button
                          type="button"
                          onClick={onClose}
                          className="flex-1 py-3.5 text-sm font-medium rounded-xl transition-colors"
                          style={{
                            background: 'var(--color-subtle)',
                            color: 'var(--color-text)'
                          }}
                        >
                          Cancel
                        </button>
                        <Button
                          variant="primary"
                          className="flex-1"
                          onClick={handleSubmit}
                          isLoading={isSubmitting}
                        >
                          Add User
                        </Button>
                      </div>
                    </motion.div>
                  )}

                  {/* Step: Success - only for create mode */}
                  {!isReconnect && step === 'success' && (
                    <motion.div
                      key="success"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ type: 'spring', damping: 20 }}
                      className="text-center py-8"
                    >
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', delay: 0.1, damping: 10 }}
                        className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center"
                        style={{
                          background: 'linear-gradient(135deg, var(--color-secondary) 0%, color-mix(in srgb, var(--color-secondary) 80%, var(--color-primary)) 100%)',
                          boxShadow: '0 12px 40px -8px var(--color-secondary)'
                        }}
                      >
                        <motion.div
                          initial={{ pathLength: 0 }}
                          animate={{ pathLength: 1 }}
                          transition={{ duration: 0.4, delay: 0.3 }}
                        >
                          <CheckIcon className="w-10 h-10 text-white" />
                        </motion.div>
                      </motion.div>
                      <h3 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-text)' }}>
                        User Created!
                      </h3>
                      <p className="text-sm" style={{ color: 'var(--color-textMuted)' }}>
                        {username} has been added successfully
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </DialogPanel>
            </motion.div>
          </div>
        </Dialog>
      )}
    </AnimatePresence>
  );
}
