'use client';

import { useState, useEffect, useRef, memo } from 'react';
import { motion } from 'framer-motion';
import {
  Cog6ToothIcon,
  EyeIcon,
  EyeSlashIcon,
  UserCircleIcon,
  ShieldCheckIcon,
  ArrowPathIcon,
  PaintBrushIcon,
  CheckIcon,
  KeyIcon,
  ClipboardDocumentIcon,
  GlobeAltIcon,
  BeakerIcon,
} from '@heroicons/react/24/outline';
import { useUserAuth, useUserAuthHeaders } from '@/lib/hooks/useUserAuth';
import { userAuth } from '@/lib/user-api';
import { UserPageHeader } from '@/components/user/UserPageContainer';
import { ToggleSwitch, Avatar } from '@/components/ui';
import { useTheme, themeMeta, themeIds, ThemeId } from '@/lib/theme';
import { toast } from '@/components/ui/Toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

// Theme Card component
const ThemeCard = memo(function ThemeCard({
  themeId,
  meta,
  isSelected,
  onSelect,
}: {
  themeId: ThemeId;
  meta: typeof themeMeta[ThemeId];
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { colors } = meta;
  
  return (
    <motion.button
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onSelect}
      className="relative p-3 rounded-xl border-2 transition-all text-left w-full"
      style={{
        background: isSelected ? 'var(--color-primary-muted)' : 'var(--color-surface)',
        borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-surface-border)',
      }}
    >
      {isSelected && (
        <div 
          className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
          style={{ background: 'var(--color-primary)' }}
        >
          <CheckIcon className="w-3 h-3" style={{ color: 'var(--color-bg)' }} />
        </div>
      )}
      
      {/* Theme preview - mini mockup */}
      <div
        className="w-full h-20 rounded-lg mb-2 overflow-hidden"
        style={{ backgroundColor: colors.bg, border: `1px solid ${colors.surface}` }}
      >
        {/* Mini sidebar */}
        <div className="flex h-full">
          <div 
            className="w-8 h-full flex flex-col gap-1 p-1.5"
            style={{ backgroundColor: colors.surface }}
          >
            <div 
              className="w-full h-1.5 rounded-full"
              style={{ backgroundColor: colors.primary }}
            />
            <div 
              className="w-full h-1 rounded-full opacity-30"
              style={{ backgroundColor: '#fff' }}
            />
            <div 
              className="w-full h-1 rounded-full opacity-30"
              style={{ backgroundColor: '#fff' }}
            />
          </div>
          {/* Mini content area */}
          <div className="flex-1 p-2 flex flex-col gap-1.5">
            {/* Header bar */}
            <div 
              className="w-12 h-1.5 rounded-full opacity-40"
              style={{ backgroundColor: '#fff' }}
            />
            {/* Cards row */}
            <div className="flex gap-1 mt-1">
              <div 
                className="w-6 h-6 rounded"
                style={{ backgroundColor: colors.surface }}
              />
              <div 
                className="w-6 h-6 rounded"
                style={{ backgroundColor: colors.surface }}
              />
              <div 
                className="w-6 h-6 rounded"
                style={{ backgroundColor: colors.primary, opacity: 0.3 }}
              />
            </div>
            {/* Button */}
            <div 
              className="w-8 h-2 rounded mt-auto"
              style={{ backgroundColor: colors.primary }}
            />
          </div>
        </div>
      </div>
      
      {/* Color swatches */}
      <div className="flex gap-1 mb-2">
        <div 
          className="w-4 h-4 rounded-full border border-white/10"
          style={{ backgroundColor: colors.bg }}
          title="Background"
        />
        <div 
          className="w-4 h-4 rounded-full border border-white/10"
          style={{ backgroundColor: colors.surface }}
          title="Surface"
        />
        <div 
          className="w-4 h-4 rounded-full border border-white/10"
          style={{ backgroundColor: colors.primary }}
          title="Primary"
        />
        <div 
          className="w-4 h-4 rounded-full border border-white/10"
          style={{ backgroundColor: colors.secondary }}
          title="Secondary"
        />
      </div>
      
      <p className="font-medium text-sm" style={{ color: 'var(--color-text)' }}>
        {meta.name}
      </p>
      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {meta.description}
      </p>
    </motion.button>
  );
});

export default function UserSettingsPage() {
  const { userInfo, refreshUserInfo } = useUserAuth();
  const { userId, authKey, isReady } = useUserAuthHeaders();
  const { themeId, setTheme } = useTheme();
  
  // Activity visibility
  const [updating, setUpdating] = useState(false);
  const [activityVisibility, setActivityVisibility] = useState<'public' | 'private'>('private');
  const [activityVisibilityLoaded, setActivityVisibilityLoaded] = useState(false);
  
  // Discord webhook
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState('');
  const [isSavingWebhook, setIsSavingWebhook] = useState(false);
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);
  
  // API Key
  const [apiKeyStatus, setApiKeyStatus] = useState<{ hasKey: boolean }>({ hasKey: false });
  const [currentApiKey, setCurrentApiKey] = useState<string | null>(null);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const autoGenAttemptedRef = useRef<boolean>(false);

  // Load user settings on mount
  useEffect(() => {
    if (!userId || !authKey) return;
    
    const loadSettings = async () => {
      try {
        // Get user info for activity visibility
        const info = await userAuth.getUserInfo(userId, authKey);
        setActivityVisibility(info?.activityVisibility ?? 'private');
        setActivityVisibilityLoaded(true);
        
        // Fetch API key
        try {
          const response = await fetch(`${API_BASE}/public-library/user-api-key?userId=${userId}&authKey=${encodeURIComponent(authKey)}`);
          const data = await response.json();
          const hasKey = data?.hasKey || false;
          const apiKey = data?.apiKey || null;
          setApiKeyStatus({ hasKey });
          if (hasKey && apiKey) {
            setCurrentApiKey(apiKey);
          } else {
            setCurrentApiKey(null);
          }
          
          // Auto-generate if missing
          if (!hasKey && !autoGenAttemptedRef.current) {
            autoGenAttemptedRef.current = true;
            try {
              const genResponse = await fetch(`${API_BASE}/public-library/user-api-key`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, authKey }),
              });
              const genData = await genResponse.json();
              const newKey = genData?.apiKey;
              if (newKey) {
                setCurrentApiKey(newKey);
                setApiKeyStatus({ hasKey: true });
                toast.success('API key auto-generated');
                navigator.clipboard.writeText(newKey).catch(() => {});
              }
            } catch (e: any) {
              toast.error('Failed to auto-generate API key');
            }
          }
        } catch {
          setApiKeyStatus({ hasKey: false });
        }
      } catch (e) {
        console.error('Failed to load settings:', e);
      }
    };
    
    loadSettings();
  }, [userId, authKey]);

  // Toggle activity visibility
  const handleToggleVisibility = async () => {
    if (!isReady || !userId || !authKey || updating) return;

    const newVisibility = activityVisibility === 'public' ? 'private' : 'public';

    setUpdating(true);
    try {
      await userAuth.updateActivityVisibility(userId, authKey, newVisibility);
      setActivityVisibility(newVisibility);
      await refreshUserInfo();
      toast.success(`Activity visibility set to ${newVisibility}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update visibility');
    } finally {
      setUpdating(false);
    }
  };

  // Save Discord webhook
  const handleSaveWebhook = async () => {
    if (!userId) return;
    setIsSavingWebhook(true);
    try {
      await fetch(`${API_BASE}/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discordWebhookUrl: discordWebhookUrl.trim() || null }),
      });
      toast.success('Webhook URL saved');
    } catch (e: any) {
      toast.error(e.message || 'Failed to save webhook');
    } finally {
      setIsSavingWebhook(false);
    }
  };

  // Test Discord webhook
  const handleTestWebhook = async () => {
    const trimmed = (discordWebhookUrl || '').trim();
    if (!trimmed) {
      toast.error('Enter a webhook URL first');
      return;
    }
    if (!userId) return;
    
    setIsTestingWebhook(true);
    try {
      await fetch(`${API_BASE}/users/${userId}/test-webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl: trimmed }),
      });
      toast.success('Test message sent to Discord');
    } catch (e: any) {
      toast.error(e.message || 'Failed to send test message');
    } finally {
      setIsTestingWebhook(false);
    }
  };

  // Generate/Rotate API key
  const handleGenerateApiKey = async () => {
    if (!userId || !authKey) return;
    setIsGeneratingKey(true);
    try {
      const response = await fetch(`${API_BASE}/public-library/user-api-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, authKey }),
      });
      const data = await response.json();
      const newKey = data?.apiKey;
      if (newKey) {
        setCurrentApiKey(newKey);
        setApiKeyStatus({ hasKey: true });
        navigator.clipboard.writeText(newKey);
        toast.success(currentApiKey ? 'API key rotated and copied' : 'API key generated and copied');
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to generate API key');
    } finally {
      setIsGeneratingKey(false);
    }
  };

  // Copy API key
  const handleCopyApiKey = () => {
    if (currentApiKey) {
      navigator.clipboard.writeText(currentApiKey);
      toast.success('API key copied to clipboard');
    }
  };

  // Format date
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const isPublic = activityVisibility === 'public';
  
  // Mask API key for display
  const maskedApiKey = currentApiKey 
    ? (apiKeyVisible ? currentApiKey : currentApiKey.slice(0, 8) + '••••••••' + currentApiKey.slice(-4))
    : 'No API key';

  return (
    <div className="p-8">
      <UserPageHeader
        title="Settings"
        subtitle="Manage your account preferences"
      />

      <div className="max-w-3xl space-y-6">
        {/* Profile Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl overflow-hidden"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-surface-border)',
          }}
        >
          <div
            className="px-6 py-4 flex items-center gap-3"
            style={{ borderBottom: '1px solid var(--color-surface-border)' }}
          >
            <div 
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--color-primary-muted)' }}
            >
              <UserCircleIcon className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
            </div>
            <div>
              <h2 className="font-semibold" style={{ color: 'var(--color-text)' }}>
                Profile Information
              </h2>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Your account details
              </p>
            </div>
          </div>

          <div className="p-6 space-y-4">
            {/* Avatar and name */}
            <div className="flex items-center gap-4">
              <Avatar 
                name={userInfo?.username || 'User'}
                email={userInfo?.email}
                colorIndex={userInfo?.colorIndex || 0}
                size="xl"
                showRing
                className="w-16 h-16"
              />
              <div>
                <h3 className="text-xl font-semibold" style={{ color: 'var(--color-text)' }}>
                  {userInfo?.username}
                </h3>
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  {userInfo?.email}
                </p>
              </div>
            </div>

            {/* Details grid */}
            <div className="grid grid-cols-2 gap-4 pt-4">
              <div>
                <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-subtle)' }}>
                  Group
                </p>
                <p className="font-medium" style={{ color: 'var(--color-text)' }}>
                  {userInfo?.groupName || 'No group'}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-subtle)' }}>
                  Member Since
                </p>
                <p className="font-medium" style={{ color: 'var(--color-text)' }}>
                  {formatDate(userInfo?.createdAt)}
                </p>
              </div>
              {userInfo?.expiresAt && (
                <div className="col-span-2">
                  <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-subtle)' }}>
                    Account Expires
                  </p>
                  <p className="font-medium" style={{ color: 'var(--color-warning)' }}>
                    {formatDate(userInfo.expiresAt)}
                  </p>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Theme Selection */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-xl overflow-hidden"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-surface-border)',
          }}
        >
          <div
            className="px-6 py-4 flex items-center gap-3"
            style={{ borderBottom: '1px solid var(--color-surface-border)' }}
          >
            <div 
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--color-secondary-muted)' }}
            >
              <PaintBrushIcon className="w-5 h-5" style={{ color: 'var(--color-secondary)' }} />
            </div>
            <div>
              <h2 className="font-semibold" style={{ color: 'var(--color-text)' }}>
                Appearance
              </h2>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Choose your preferred color scheme
              </p>
            </div>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {themeIds.map((id) => (
                <ThemeCard
                  key={id}
                  themeId={id}
                  meta={themeMeta[id]}
                  isSelected={themeId === id}
                  onSelect={() => setTheme(id)}
                />
              ))}
            </div>
          </div>
        </motion.div>

        {/* Privacy Settings */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl overflow-hidden"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-surface-border)',
          }}
        >
          <div
            className="px-6 py-4 flex items-center gap-3"
            style={{ borderBottom: '1px solid var(--color-surface-border)' }}
          >
            <div 
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--color-success-muted)' }}
            >
              <ShieldCheckIcon className="w-5 h-5" style={{ color: 'var(--color-success)' }} />
            </div>
            <div>
              <h2 className="font-semibold" style={{ color: 'var(--color-text)' }}>
                Privacy
              </h2>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Control who can see your activity
              </p>
            </div>
          </div>

          <div className="p-6">
            {/* Activity Visibility Toggle */}
            <div 
              className="flex items-center justify-between p-4 rounded-lg"
              style={{ background: 'var(--color-surface-elevated)' }}
            >
              <div className="flex-1">
                <h3 className="font-medium mb-1" style={{ color: 'var(--color-text)' }}>
                  Activity Visibility
                </h3>
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  {isPublic
                    ? 'Your watch activity is visible to group members'
                    : 'Your watch activity is hidden from group members'}
                </p>
              </div>

              {activityVisibilityLoaded && (
                <div className="flex items-center gap-3">
                  <span 
                    className="text-sm font-medium"
                    style={{ color: isPublic ? 'var(--color-success)' : 'var(--color-text-muted)' }}
                  >
                    {isPublic ? 'Public' : 'Private'}
                  </span>
                  <ToggleSwitch
                    checked={isPublic}
                    onChange={handleToggleVisibility}
                    disabled={updating}
                  />
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Discord Webhook */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-xl overflow-hidden"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-surface-border)',
          }}
        >
          <div
            className="px-6 py-4 flex items-center gap-3"
            style={{ borderBottom: '1px solid var(--color-surface-border)' }}
          >
            <div 
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(88, 101, 242, 0.2)' }}
            >
              <GlobeAltIcon className="w-5 h-5" style={{ color: '#5865F2' }} />
            </div>
            <div>
              <h2 className="font-semibold" style={{ color: 'var(--color-text)' }}>
                Discord Webhook
              </h2>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Receive notifications when someone shares content with you
              </p>
            </div>
          </div>

          <div className="p-6">
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text)' }}>
              Webhook URL
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={discordWebhookUrl}
                onChange={(e) => setDiscordWebhookUrl(e.target.value)}
                onBlur={() => {
                  if (discordWebhookUrl) {
                    handleSaveWebhook();
                  }
                }}
                placeholder="https://discord.com/api/webhooks/..."
                className="flex-1 px-3 py-2 text-sm rounded-lg"
                style={{
                  background: 'var(--color-surface-elevated)',
                  border: '1px solid var(--color-surface-border)',
                  color: 'var(--color-text)',
                }}
              />
              <button
                onClick={handleTestWebhook}
                disabled={isTestingWebhook || !discordWebhookUrl.trim()}
                className="px-3 py-2 rounded-lg flex items-center gap-2 transition-all"
                style={{
                  background: 'var(--color-surface-elevated)',
                  border: '1px solid var(--color-surface-border)',
                  color: 'var(--color-text-muted)',
                  opacity: (!discordWebhookUrl.trim() || isTestingWebhook) ? 0.5 : 1,
                }}
                title="Send test message"
              >
                {isTestingWebhook ? (
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                ) : (
                  <BeakerIcon className="w-4 h-4" />
                )}
                <span className="text-sm">Test</span>
              </button>
            </div>
            <p className="text-xs mt-2" style={{ color: 'var(--color-text-subtle)' }}>
              Create a webhook in your Discord server settings to receive share notifications
            </p>
          </div>
        </motion.div>

        {/* API Key */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-xl overflow-hidden"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-surface-border)',
          }}
        >
          <div
            className="px-6 py-4 flex items-center gap-3"
            style={{ borderBottom: '1px solid var(--color-surface-border)' }}
          >
            <div 
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--color-warning-muted)' }}
            >
              <KeyIcon className="w-5 h-5" style={{ color: 'var(--color-warning)' }} />
            </div>
            <div>
              <h2 className="font-semibold" style={{ color: 'var(--color-text)' }}>
                API Access
              </h2>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Access your metrics via external API
              </p>
            </div>
          </div>

          <div className="p-6">
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text)' }}>
              Your API Key
            </label>
            <div className="flex gap-2">
              <div 
                className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg"
                style={{
                  background: 'var(--color-surface-elevated)',
                  border: '1px solid var(--color-surface-border)',
                }}
              >
                <code 
                  className="flex-1 text-sm font-mono truncate"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {maskedApiKey}
                </code>
                <button
                  onClick={() => setApiKeyVisible(!apiKeyVisible)}
                  className="p-1 rounded transition-colors"
                  style={{ color: 'var(--color-text-muted)' }}
                  title={apiKeyVisible ? 'Hide' : 'Show'}
                >
                  {apiKeyVisible ? (
                    <EyeSlashIcon className="w-4 h-4" />
                  ) : (
                    <EyeIcon className="w-4 h-4" />
                  )}
                </button>
                <button
                  onClick={handleCopyApiKey}
                  className="p-1 rounded transition-colors"
                  style={{ color: 'var(--color-text-muted)' }}
                  title="Copy"
                  disabled={!currentApiKey}
                >
                  <ClipboardDocumentIcon className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={handleGenerateApiKey}
                disabled={isGeneratingKey}
                className="px-3 py-2 rounded-lg flex items-center gap-2 transition-all"
                style={{
                  background: 'var(--color-surface-elevated)',
                  border: '1px solid var(--color-surface-border)',
                  color: 'var(--color-text-muted)',
                  opacity: isGeneratingKey ? 0.5 : 1,
                }}
                title={currentApiKey ? 'Rotate API key' : 'Generate API key'}
              >
                <ArrowPathIcon className={`w-4 h-4 ${isGeneratingKey ? 'animate-spin' : ''}`} />
                <span className="text-sm">{currentApiKey ? 'Rotate' : 'Generate'}</span>
              </button>
            </div>
            <p className="text-xs mt-2" style={{ color: 'var(--color-text-subtle)' }}>
              Use this key in the Authorization header:{' '}
              <code 
                onClick={() => {
                  if (currentApiKey) {
                    const fullHeader = `Bearer ${currentApiKey}`;
                    navigator.clipboard.writeText(fullHeader);
                    toast.success('Authorization header copied');
                  }
                }}
                className="px-1 py-0.5 rounded cursor-pointer"
                style={{ background: 'var(--color-surface-elevated)' }}
                title={currentApiKey ? 'Click to copy "Bearer {key}"' : 'API key not available'}
              >
                Bearer {currentApiKey ? '...' : '•••••'}
              </code>
            </p>
          </div>
        </motion.div>

        {/* Account Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="rounded-xl overflow-hidden"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-surface-border)',
          }}
        >
          <div
            className="px-6 py-4 flex items-center gap-3"
            style={{ borderBottom: '1px solid var(--color-surface-border)' }}
          >
            <div 
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--color-error-muted)' }}
            >
              <Cog6ToothIcon className="w-5 h-5" style={{ color: 'var(--color-error)' }} />
            </div>
            <div>
              <h2 className="font-semibold" style={{ color: 'var(--color-text)' }}>
                Account
              </h2>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Manage your account
              </p>
            </div>
          </div>

          <div className="p-6">
            <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
              Need to remove your account? You can request deletion through the invite link you received.
            </p>

            <a
              href="/invite/delete"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                background: 'var(--color-error-muted)',
                color: 'var(--color-error)',
              }}
            >
              Request Account Deletion
            </a>
          </div>
        </motion.div>

        {/* Info */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="p-4 rounded-xl"
          style={{ background: 'var(--color-primary-muted)' }}
        >
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            <strong style={{ color: 'var(--color-text)' }}>Note:</strong> Profile information is synced from your Stremio account. 
            To change your username or email, update them in the Stremio app.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
