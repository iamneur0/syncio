'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowTopRightOnSquareIcon,
  ClipboardIcon,
  CheckIcon,
  ArrowPathIcon,
  UserIcon,
  ShieldCheckIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';
import { userOAuth, userAuth as userAuthApi } from '@/lib/user-api';
import { api } from '@/lib/api';
import { useUserAuth, UserAuthProvider } from '@/lib/hooks/useUserAuth';

type LoginMode = 'user' | 'admin';

function LoginContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { login: userLogin, isAuthenticated } = useUserAuth();

  // Mode state
  const initialMode = (searchParams.get('mode') as LoginMode) || 'user';
  const [mode, setMode] = useState<LoginMode>(initialMode);
  const INSTANCE_TYPE = (process.env.NEXT_PUBLIC_INSTANCE_TYPE || 'private') as 'public' | 'private';

  // Admin login state
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminLoginType, setAdminLoginType] = useState<'credentials' | 'stremio'>(
    searchParams.get('linkStremio') === '1' && initialMode === 'admin' ? 'stremio' : 'credentials'
  );
  const [checkingAuth, setCheckingAuth] = useState(INSTANCE_TYPE !== 'public');

  // Check if auth is required for private instance
  useEffect(() => {
    if (INSTANCE_TYPE !== 'public' && mode === 'admin') {
      const checkAuth = async () => {
        try {
          // Try to access a protected endpoint
          // If it succeeds, auth is disabled
          const response = await fetch('/api/ext/account');
          if (response.ok) {
            router.push('/');
            return;
          }
        } catch (e) {
          // Ignore error, show login form
        } finally {
          setCheckingAuth(false);
        }
      };
      checkAuth();
    } else {
      setCheckingAuth(false);
    }
  }, [INSTANCE_TYPE, router, mode]);

  // User OAuth state
  const [oauthLink, setOAuthLink] = useState<string | null>(null);
  const [oauthCode, setOAuthCode] = useState<string>('');
  const [oauthExpiresAt, setOAuthExpiresAt] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<string | null>(null);

  // Refs for cleanup
  const pollIntervalRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<number | null>(null);

  // Check if OAuth is expired
  const isExpired = oauthExpiresAt ? oauthExpiresAt < Date.now() : false;

  // Redirect if already authenticated in user mode
  useEffect(() => {
    if (mode === 'user' && isAuthenticated) {
      router.push('/user');
    }
  }, [mode, isAuthenticated, router]);

  // Timer countdown
  useEffect(() => {
    // Timer applies to both user mode and admin stremio login mode
    if (!oauthExpiresAt || isExpired || (mode === 'admin' && adminLoginType !== 'stremio')) {
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
  }, [oauthExpiresAt, isExpired, mode]);

  // Poll for OAuth completion
  useEffect(() => {
    if (!isPolling || !oauthCode || isExpired || isAuthenticating) {
      return;
    }

    const poll = async () => {
      try {
        const pollResult = await userOAuth.poll(oauthCode);

        if (pollResult.success && pollResult.authKey) {
          setIsPolling(false);
          if (pollIntervalRef.current) {
            window.clearInterval(pollIntervalRef.current);
          }

          setIsAuthenticating(true);

          if (mode === 'admin') {
            // Admin Stremio Login
            try {
              const result = await api.stremioLogin(pollResult.authKey);
              if (result.token || result.account) {
                if (result.token) {
                  localStorage.setItem('syncio-admin-token', result.token);
                }
                router.push('/');
              } else {
                setAdminError('Failed to link Stremio account to admin');
                setIsAuthenticating(false);
              }
            } catch (err: any) {
              setAdminError(err.message || 'Stremio login failed');
              setIsAuthenticating(false);
            }
          } else {
            // User Stremio Login
            const authResult = await userLogin(pollResult.authKey);
            if (authResult.success) {
              router.push('/user');
            } else {
              setUserError(authResult.error || 'Failed to authenticate. Please try again.');
              setIsAuthenticating(false);
            }
          }
        } else if (pollResult.error) {
          if (mode === 'admin') setAdminError(pollResult.error);
          else setUserError(pollResult.error);
        }
      } catch (err) {
        // Silently handle polling errors
      }
    };

    poll();
    pollIntervalRef.current = window.setInterval(poll, 3000);

    return () => {
      if (pollIntervalRef.current) {
        window.clearInterval(pollIntervalRef.current);
      }
    };
  }, [isPolling, oauthCode, isExpired, isAuthenticating, mode, userLogin, router]);

  // Generate OAuth link
  const generateOAuthLink = useCallback(async () => {
    if (isGenerating) return;

    setIsGenerating(true);
    setAdminError(null);
    setUserError(null);

    try {
      const result = await userOAuth.create();
      setOAuthLink(result.link);
      setOAuthCode(result.code);
      setOAuthExpiresAt(result.expiresAt);
      setIsPolling(true);
    } catch (err: any) {
      if (mode === 'admin') setAdminError(err?.message || 'Failed to generate link');
      else setUserError(err?.message || 'Failed to generate OAuth link');
    } finally {
      setIsGenerating(false);
    }
  }, [isGenerating, mode]);

  // Auto-generate OAuth link
  useEffect(() => {
    // Generate if user mode, OR if admin mode and stremio tab is selected
    const shouldGenerate = (mode === 'user') || (mode === 'admin' && adminLoginType === 'stremio');
    if (shouldGenerate && !oauthLink && !isGenerating) {
      generateOAuthLink();
    }
  }, [mode, adminLoginType, oauthLink, isGenerating, generateOAuthLink]);

  // Handle auto-linking stremio
  useEffect(() => {
    if (searchParams.get('linkStremio') === '1' && oauthLink && !isAuthenticating) {
      window.open(oauthLink, '_blank', 'noopener,noreferrer'); // Redirect in a new tab so they don't lose the polling syncio page
    }
  }, [searchParams, oauthLink, isAuthenticating]);

  // Copy code
  const copyCode = useCallback(() => {
    if (!oauthCode) return;
    navigator.clipboard.writeText(oauthCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [oauthCode]);

  // Open OAuth link
  const openOAuthLink = useCallback(() => {
    if (!oauthLink) return;
    window.open(oauthLink, '_blank', 'noopener,noreferrer');
  }, [oauthLink]);

  // Admin login
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminUsername || !adminPassword) return;

    setAdminLoading(true);
    setAdminError(null);

    try {
      const isPublic = INSTANCE_TYPE === 'public';
      const endpoint = isPublic ? '/api/auth/login' : '/api/auth/private-login';
      const payload = isPublic
        ? { uuid: adminUsername, password: adminPassword }
        : { username: adminUsername, password: adminPassword };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok && (data.token || data.account)) {
        // Store admin token and redirect
        // Backend returns token in different fields depending on route
        const token = data.token || response.headers.get('set-cookie');
        if (data.token) {
          localStorage.setItem('syncio-admin-token', data.token);
        }
        router.push('/');
      } else {
        setAdminError(data.message || 'Invalid credentials');
      }
    } catch (err) {
      setAdminError('Failed to connect to server');
    } finally {
      setAdminLoading(false);
    }
  };

  // Time color based on urgency
  const getTimeColor = () => {
    if (!oauthExpiresAt) return 'var(--color-text-subtle)';
    const diff = oauthExpiresAt - Date.now();
    if (diff < 60000) return 'var(--color-error)';
    if (diff < 120000) return 'var(--color-warning)';
    return 'var(--color-text-subtle)';
  };

  // Switch mode
  const switchMode = (newMode: LoginMode) => {
    setMode(newMode);
    setAdminError(null);
    setUserError(null);
    // Update URL while preserving other search params
    const newParams = new URLSearchParams(searchParams.toString());
    newParams.set('mode', newMode);
    router.replace(`/login?${newParams.toString()}`);
  };

  if (checkingAuth) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{ background: 'var(--color-bg)' }}
      >
        <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin" style={{ color: 'var(--color-primary)' }} />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: 'var(--color-bg)' }}
    >
      {/* Background gradient */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full blur-[120px] opacity-30"
          style={{ background: 'var(--color-primaryMuted)' }}
        />
        <div
          className="absolute -bottom-40 -left-40 w-[400px] h-[400px] rounded-full blur-[100px] opacity-20"
          style={{ background: 'var(--color-secondaryMuted)' }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
            style={{ background: 'var(--color-primary)' }}
          >
            <img src="/logo-white.png" alt="Syncio" className="w-10 h-10 object-contain" />
          </motion.div>
          <h1
            className="text-3xl font-bold font-display mb-2"
            style={{ color: 'var(--color-text)' }}
          >
            Syncio
          </h1>
          <p style={{ color: 'var(--color-text-muted)' }}>
            Sign in to continue
          </p>
        </div>

        {/* Mode Toggle */}
        <div
          className="p-1 rounded-xl mb-6 flex"
          style={{ background: 'var(--color-surface)' }}
        >
          <button
            onClick={() => switchMode('user')}
            className="flex-1 py-2.5 px-4 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2"
            style={{
              background: mode === 'user' ? 'var(--color-primary)' : 'transparent',
              color: mode === 'user' ? 'white' : 'var(--color-text-muted)',
            }}
          >
            <UserIcon className="w-4 h-4" />
            User
          </button>
          <button
            onClick={() => switchMode('admin')}
            className="flex-1 py-2.5 px-4 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2"
            style={{
              background: mode === 'admin' ? 'var(--color-primary)' : 'transparent',
              color: mode === 'admin' ? 'white' : 'var(--color-text-muted)',
            }}
          >
            <ShieldCheckIcon className="w-4 h-4" />
            Admin
          </button>
        </div>

        {/* Login Card */}
        <motion.div
          className="rounded-2xl overflow-hidden"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-surface-border)',
          }}
        >
          {/* Top accent */}
          <div
            className="h-1"
            style={{
              background: mode === 'user' ? 'var(--color-success)' : 'var(--color-primary)',
            }}
          />

          <div className="p-6">
            <AnimatePresence mode="wait">
              {mode === 'admin' ? (
                /* Admin Login Form */
                <motion.div
                  key="admin"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-4"
                >
                  {/* Admin Login Type Selector (Public Mode only) */}
                  {INSTANCE_TYPE === 'public' && (
                    <div className="flex gap-2 p-1 rounded-lg bg-bg-subtle mb-4">
                      <button
                        onClick={() => setAdminLoginType('credentials')}
                        className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium transition-all ${adminLoginType === 'credentials'
                          ? 'bg-surface shadow-sm text-default'
                          : 'text-muted hover:text-default'
                          }`}
                      >
                        UUID / Pass
                      </button>
                      <button
                        onClick={() => {
                          setAdminLoginType('stremio');
                          if (!oauthLink) generateOAuthLink();
                        }}
                        className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium transition-all ${adminLoginType === 'stremio'
                          ? 'bg-surface shadow-sm text-default'
                          : 'text-muted hover:text-default'
                          }`}
                      >
                        Stremio Login
                      </button>
                    </div>
                  )}

                  {adminLoginType === 'credentials' ? (
                    <form onSubmit={handleAdminLogin} className="space-y-4">
                      <div>
                        <label
                          htmlFor="username"
                          className="block text-sm font-medium mb-2"
                          style={{ color: 'var(--color-text)' }}
                        >
                          {INSTANCE_TYPE === 'public' ? 'UUID' : 'Username'}
                        </label>
                        <input
                          id="username"
                          type="text"
                          value={adminUsername}
                          onChange={(e) => setAdminUsername(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl text-sm transition-all"
                          style={{
                            background: 'var(--color-bg)',
                            border: '1px solid var(--color-surface-border)',
                            color: 'var(--color-text)',
                          }}
                          placeholder={INSTANCE_TYPE === 'public' ? '00000000-0000-...' : 'admin'}
                          autoComplete={INSTANCE_TYPE === 'public' ? 'off' : 'username'}
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="password"
                          className="block text-sm font-medium mb-2"
                          style={{ color: 'var(--color-text)' }}
                        >
                          Password
                        </label>
                        <input
                          id="password"
                          type="password"
                          value={adminPassword}
                          onChange={(e) => setAdminPassword(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl text-sm transition-all"
                          style={{
                            background: 'var(--color-bg)',
                            border: '1px solid var(--color-surface-border)',
                            color: 'var(--color-text)',
                          }}
                          placeholder="********"
                          autoComplete="current-password"
                        />
                      </div>

                      {adminError && (
                        <motion.p
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-sm"
                          style={{ color: 'var(--color-error)' }}
                        >
                          {adminError}
                        </motion.p>
                      )}

                      <button
                        type="submit"
                        disabled={adminLoading || !adminUsername || !adminPassword}
                        className="w-full py-3.5 rounded-xl font-medium transition-all flex items-center justify-center gap-2"
                        style={{
                          background: 'var(--color-primary)',
                          color: 'white',
                          opacity: adminLoading || !adminUsername || !adminPassword ? 0.5 : 1,
                        }}
                      >
                        {adminLoading ? (
                          <>
                            <span className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            Signing in...
                          </>
                        ) : (
                          <>
                            <ArrowRightIcon className="w-5 h-5" />
                            Sign in
                          </>
                        )}
                      </button>
                    </form>
                  ) : (
                    /* Admin Stremio Login UI */
                    <div className="space-y-4">
                      <p className="text-sm text-center mb-4" style={{ color: 'var(--color-text-muted)' }}>
                        Link your Stremio account to your administrator profile.
                      </p>

                      <button
                        onClick={openOAuthLink}
                        disabled={!oauthLink || isExpired || isAuthenticating}
                        className="w-full py-3.5 rounded-xl font-medium transition-all flex items-center justify-center gap-2"
                        style={{
                          background: 'var(--color-primary)',
                          color: 'white',
                          opacity: !oauthLink || isExpired || isAuthenticating ? 0.5 : 1,
                        }}
                      >
                        {isAuthenticating ? (
                          <>
                            <span className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            Verifying...
                          </>
                        ) : isGenerating ? (
                          <>
                            <span className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            Generating Link...
                          </>
                        ) : (
                          <>
                            <ArrowTopRightOnSquareIcon className="w-5 h-5" />
                            Open Stremio
                          </>
                        )}
                      </button>

                      {/* Manual code UI reused */}
                      <div className="text-center space-y-3 pt-2">
                        <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-subtle)' }}>
                          Verification Code
                        </p>
                        <button
                          onClick={copyCode}
                          disabled={!oauthCode}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg transition-all"
                          style={{
                            background: 'var(--color-bg)',
                            border: '1px solid var(--color-surface-border)',
                          }}
                        >
                          <span className="font-mono text-lg tracking-widest" style={{ color: 'var(--color-text)' }}>
                            {oauthCode || '----'}
                          </span>
                          {copied ? (
                            <CheckIcon className="w-4 h-4 text-success" />
                          ) : (
                            <ClipboardIcon className="w-4 h-4 text-muted" />
                          )}
                        </button>
                      </div>

                      {adminError && (
                        <p className="text-sm text-center" style={{ color: 'var(--color-error)' }}>
                          {adminError}
                        </p>
                      )}

                      {/* Polling indicator reused */}
                      {isPolling && !isExpired && !adminError && !isAuthenticating && (
                        <div className="flex items-center justify-center gap-2 pt-2">
                          <div className="flex gap-1">
                            {[0, 1, 2].map((i) => (
                              <motion.div
                                key={i}
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ background: 'var(--color-success)' }}
                                animate={{ scale: [1, 1.3, 1], opacity: [0.4, 1, 0.4] }}
                                transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                              />
                            ))}
                          </div>
                          <span className="text-xs" style={{ color: 'var(--color-text-subtle)' }}>
                            Waiting for authorization...
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              ) : (
                /* User OAuth */
                <motion.div
                  key="user"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <p
                    className="text-sm text-center mb-4"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    Sign in with your Stremio account to access your library and settings.
                  </p>

                  {/* Open Stremio Button */}
                  <button
                    onClick={openOAuthLink}
                    disabled={!oauthLink || isExpired || isAuthenticating}
                    className="w-full py-3.5 rounded-xl font-medium transition-all flex items-center justify-center gap-2"
                    style={{
                      background: 'var(--color-primary)',
                      color: 'white',
                      opacity: !oauthLink || isExpired || isAuthenticating ? 0.5 : 1,
                    }}
                  >
                    {isAuthenticating ? (
                      <>
                        <span className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        Signing in...
                      </>
                    ) : isGenerating ? (
                      <>
                        <span className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        Generating Link...
                      </>
                    ) : (
                      <>
                        <ArrowTopRightOnSquareIcon className="w-5 h-5" />
                        Open Stremio
                      </>
                    )}
                  </button>

                  {/* Divider */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px" style={{ background: 'var(--color-surface-border)' }} />
                    <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-subtle)' }}>
                      or
                    </span>
                    <div className="flex-1 h-px" style={{ background: 'var(--color-surface-border)' }} />
                  </div>

                  {/* Manual code */}
                  <div className="text-center space-y-3">
                    <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
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

                    <button
                      onClick={copyCode}
                      disabled={!oauthCode}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg transition-all"
                      style={{
                        background: 'var(--color-bg)',
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
                      <span className="text-sm font-mono" style={{ color: getTimeColor() }}>
                        {timeLeft}
                      </span>
                    )}
                    <button
                      onClick={generateOAuthLink}
                      disabled={isGenerating}
                      className="text-sm flex items-center gap-1 hover:underline transition-all"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      <ArrowPathIcon className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
                      Refresh
                    </button>
                  </div>

                  {/* Error */}
                  {userError && (
                    <motion.p
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-sm text-center"
                      style={{ color: 'var(--color-error)' }}
                    >
                      {userError}
                    </motion.p>
                  )}

                  {/* Polling indicator */}
                  {isPolling && !isExpired && !userError && !isAuthenticating && (
                    <div className="flex items-center justify-center gap-2">
                      <div className="flex gap-1">
                        {[0, 1, 2].map((i) => (
                          <motion.div
                            key={i}
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ background: 'var(--color-success)' }}
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
                      <span className="text-xs" style={{ color: 'var(--color-text-subtle)' }}>
                        Waiting for authorization...
                      </span>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Footer */}
        <p className="text-center mt-6 text-sm" style={{ color: 'var(--color-text-subtle)' }}>
          {mode === 'user'
            ? 'Sign in to access your library and share with your group.'
            : 'Admin access for managing users, groups, and addons.'}
        </p>
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <UserAuthProvider>
      <Suspense fallback={
        <div
          className="min-h-screen flex items-center justify-center"
          style={{ background: 'var(--color-bg)' }}
        >
          <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin" style={{ color: 'var(--color-primary)' }} />
        </div>
      }>
        <LoginContent />
      </Suspense>
    </UserAuthProvider>
  );
}
