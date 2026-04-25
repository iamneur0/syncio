'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  PuzzlePieceIcon,
  ShieldCheckIcon,
  ShieldExclamationIcon,
  EyeSlashIcon,
  EyeIcon,
  TrashIcon,
  PlusIcon,
  GlobeAltIcon,
} from '@heroicons/react/24/outline';
import { useUserAuthHeaders } from '@/lib/hooks/useUserAuth';
import { userAddons, GroupAddon, StremioAddon } from '@/lib/user-api';
import { UserPageHeader } from '@/components/user/UserPageContainer';

type TabType = 'group' | 'stremio';

export default function UserAddonsPage() {
  const { userId, authKey, isReady } = useUserAuthHeaders();
  const [groupAddons, setGroupAddons] = useState<GroupAddon[]>([]);
  const [stremioAddons, setStremioAddons] = useState<StremioAddon[]>([]);
  const [excludedIds, setExcludedIds] = useState<string[]>([]);
  const [protectedNames, setProtectedNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('group');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Fetch addons
  useEffect(() => {
    if (!isReady || !userId) return;

    const fetchAddons = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await userAddons.getAddons(userId, authKey || undefined);
        setGroupAddons(result.groupAddons || []);
        setStremioAddons(result.stremioAddons || []);
        setExcludedIds(result.excludedAddonIds || []);
        setProtectedNames(result.protectedAddonNames || []);
      } catch (err: any) {
        setError(err.message || 'Failed to load addons');
      } finally {
        setLoading(false);
      }
    };

    fetchAddons();
  }, [userId, authKey, isReady]);

  // Toggle exclude addon
  const handleToggleExclude = async (addonId: string, isExcluded: boolean) => {
    if (!userId || actionLoading) return;

    setActionLoading(addonId);
    try {
      if (isExcluded) {
        await userAddons.includeAddon(userId, addonId);
        setExcludedIds((prev) => prev.filter((id) => id !== addonId));
      } else {
        await userAddons.excludeAddon(userId, addonId);
        setExcludedIds((prev) => [...prev, addonId]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update addon');
    } finally {
      setActionLoading(null);
    }
  };

  // Toggle protect addon
  const handleToggleProtect = async (addonName: string, isProtected: boolean) => {
    if (!userId || actionLoading) return;

    setActionLoading(addonName);
    try {
      const result = await userAddons.toggleProtect(userId, addonName);
      if (result.protected) {
        setProtectedNames((prev) => [...prev, addonName]);
      } else {
        setProtectedNames((prev) => prev.filter((n) => n !== addonName));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update protection');
    } finally {
      setActionLoading(null);
    }
  };

  // Remove Stremio addon
  const handleRemoveAddon = async (addonName: string) => {
    if (!userId || actionLoading) return;

    if (!confirm(`Are you sure you want to remove "${addonName}"?`)) return;

    setActionLoading(addonName);
    try {
      await userAddons.removeAddon(userId, addonName);
      setStremioAddons((prev) => prev.filter((a) => a.manifest.name !== addonName));
    } catch (err: any) {
      setError(err.message || 'Failed to remove addon');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="p-8">
      <UserPageHeader
        title="Addons"
        subtitle="Manage your Stremio addons"
      />

      {/* Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex p-1 rounded-xl mb-6 w-fit"
        style={{ background: 'var(--color-surface)' }}
      >
        <button
          onClick={() => setActiveTab('group')}
          className="px-6 py-2.5 rounded-lg text-sm font-medium transition-all"
          style={{
            background: activeTab === 'group' ? 'var(--color-primary)' : 'transparent',
            color: activeTab === 'group' ? 'white' : 'var(--color-text-muted)',
          }}
        >
          Group Addons ({groupAddons.length})
        </button>
        <button
          onClick={() => setActiveTab('stremio')}
          className="px-6 py-2.5 rounded-lg text-sm font-medium transition-all"
          style={{
            background: activeTab === 'stremio' ? 'var(--color-primary)' : 'transparent',
            color: activeTab === 'stremio' ? 'white' : 'var(--color-text-muted)',
          }}
        >
          Stremio Addons ({stremioAddons.length})
        </button>
      </motion.div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div
            className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }}
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-4 rounded-xl mb-6"
          style={{ background: 'var(--color-error-muted)', color: 'var(--color-error)' }}
        >
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 underline hover:no-underline"
          >
            Dismiss
          </button>
        </motion.div>
      )}

      {/* Group Addons */}
      {!loading && activeTab === 'group' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-3"
        >
          {groupAddons.length === 0 ? (
            <div className="text-center py-20">
              <PuzzlePieceIcon
                className="w-16 h-16 mx-auto mb-4"
                style={{ color: 'var(--color-text-subtle)' }}
              />
              <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-text)' }}>
                No group addons
              </h3>
              <p style={{ color: 'var(--color-text-muted)' }}>
                Your group doesn't have any addons configured yet
              </p>
            </div>
          ) : (
            groupAddons.map((addon, index) => {
              const isExcluded = excludedIds.includes(addon.id);
              return (
                <motion.div
                  key={addon.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex items-center gap-4 p-4 rounded-xl"
                  style={{
                    background: 'var(--color-surface)',
                    border: `1px solid ${isExcluded ? 'var(--color-warning)' : 'var(--color-surface-border)'}`,
                    opacity: isExcluded ? 0.7 : 1,
                  }}
                >
                  {/* Logo */}
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: 'var(--color-surface-elevated)' }}
                  >
                    {addon.logo ? (
                      <img src={addon.logo} alt={addon.name} className="w-8 h-8 object-contain" />
                    ) : (
                      <PuzzlePieceIcon className="w-6 h-6" style={{ color: 'var(--color-text-muted)' }} />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold" style={{ color: 'var(--color-text)' }}>
                      {addon.name}
                    </h3>
                    {addon.description && (
                      <p className="text-sm truncate" style={{ color: 'var(--color-text-muted)' }}>
                        {addon.description}
                      </p>
                    )}
                  </div>

                  {/* Status badges */}
                  <div className="flex items-center gap-2">
                    {addon.isProtected && (
                      <div
                        className="px-2 py-1 rounded text-xs font-medium flex items-center gap-1"
                        style={{ background: 'var(--color-success-muted)', color: 'var(--color-success)' }}
                      >
                        <ShieldCheckIcon className="w-3.5 h-3.5" />
                        Protected
                      </div>
                    )}
                    {isExcluded && (
                      <div
                        className="px-2 py-1 rounded text-xs font-medium flex items-center gap-1"
                        style={{ background: 'var(--color-warning-muted)', color: 'var(--color-warning)' }}
                      >
                        <EyeSlashIcon className="w-3.5 h-3.5" />
                        Excluded
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <button
                    onClick={() => handleToggleExclude(addon.id, isExcluded)}
                    disabled={actionLoading === addon.id}
                    className="p-2 rounded-lg transition-all"
                    style={{
                      background: isExcluded ? 'var(--color-success-muted)' : 'var(--color-warning-muted)',
                    }}
                    title={isExcluded ? 'Include addon' : 'Exclude addon'}
                  >
                    {actionLoading === addon.id ? (
                      <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : isExcluded ? (
                      <EyeIcon className="w-5 h-5" style={{ color: 'var(--color-success)' }} />
                    ) : (
                      <EyeSlashIcon className="w-5 h-5" style={{ color: 'var(--color-warning)' }} />
                    )}
                  </button>
                </motion.div>
              );
            })
          )}

          {/* Info box */}
          {groupAddons.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="p-4 rounded-xl mt-6"
              style={{ background: 'var(--color-primary-muted)' }}
            >
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                <strong style={{ color: 'var(--color-text)' }}>Tip:</strong> Excluded addons won't be synced to your Stremio account. 
                Use this if you want to opt-out of specific group addons.
              </p>
            </motion.div>
          )}
        </motion.div>
      )}

      {/* Stremio Addons */}
      {!loading && activeTab === 'stremio' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-3"
        >
          {stremioAddons.length === 0 ? (
            <div className="text-center py-20">
              <GlobeAltIcon
                className="w-16 h-16 mx-auto mb-4"
                style={{ color: 'var(--color-text-subtle)' }}
              />
              <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-text)' }}>
                No Stremio addons
              </h3>
              <p style={{ color: 'var(--color-text-muted)' }}>
                Addons installed in your Stremio account will appear here
              </p>
            </div>
          ) : (
            stremioAddons.map((addon, index) => {
              const isProtected = (protectedNames || []).includes(addon.manifest?.name || '');
              const isOfficial = addon.flags?.official;
              return (
                <motion.div
                  key={addon.manifest.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex items-center gap-4 p-4 rounded-xl"
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-surface-border)',
                  }}
                >
                  {/* Logo */}
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: 'var(--color-surface-elevated)' }}
                  >
                    {addon.manifest.logo ? (
                      <img src={addon.manifest.logo} alt={addon.manifest.name} className="w-8 h-8 object-contain" />
                    ) : (
                      <GlobeAltIcon className="w-6 h-6" style={{ color: 'var(--color-text-muted)' }} />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold" style={{ color: 'var(--color-text)' }}>
                      {addon.manifest.name}
                    </h3>
                    {addon.manifest.description && (
                      <p className="text-sm truncate" style={{ color: 'var(--color-text-muted)' }}>
                        {addon.manifest.description}
                      </p>
                    )}
                    {addon.manifest.version && (
                      <p className="text-xs mt-1" style={{ color: 'var(--color-text-subtle)' }}>
                        v{addon.manifest.version}
                      </p>
                    )}
                  </div>

                  {/* Status badges */}
                  <div className="flex items-center gap-2">
                    {isOfficial && (
                      <div
                        className="px-2 py-1 rounded text-xs font-medium"
                        style={{ background: 'var(--color-primary-muted)', color: 'var(--color-primary)' }}
                      >
                        Official
                      </div>
                    )}
                    {isProtected && (
                      <div
                        className="px-2 py-1 rounded text-xs font-medium flex items-center gap-1"
                        style={{ background: 'var(--color-success-muted)', color: 'var(--color-success)' }}
                      >
                        <ShieldCheckIcon className="w-3.5 h-3.5" />
                        Protected
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleProtect(addon.manifest.name, isProtected)}
                      disabled={actionLoading === addon.manifest.name}
                      className="p-2 rounded-lg transition-all"
                      style={{
                        background: isProtected ? 'var(--color-warning-muted)' : 'var(--color-success-muted)',
                      }}
                      title={isProtected ? 'Remove protection' : 'Protect addon'}
                    >
                      {actionLoading === addon.manifest.name ? (
                        <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : isProtected ? (
                        <ShieldExclamationIcon className="w-5 h-5" style={{ color: 'var(--color-warning)' }} />
                      ) : (
                        <ShieldCheckIcon className="w-5 h-5" style={{ color: 'var(--color-success)' }} />
                      )}
                    </button>
                    
                    {!isProtected && !isOfficial && (
                      <button
                        onClick={() => handleRemoveAddon(addon.manifest.name)}
                        disabled={actionLoading === addon.manifest.name}
                        className="p-2 rounded-lg transition-all"
                        style={{ background: 'var(--color-error-muted)' }}
                        title="Remove addon"
                      >
                        <TrashIcon className="w-5 h-5" style={{ color: 'var(--color-error)' }} />
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })
          )}

          {/* Info box */}
          {stremioAddons.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="p-4 rounded-xl mt-6"
              style={{ background: 'var(--color-primary-muted)' }}
            >
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                <strong style={{ color: 'var(--color-text)' }}>Tip:</strong> Protected addons won't be removed during sync. 
                Use this to keep personal addons that aren't part of your group.
              </p>
            </motion.div>
          )}
        </motion.div>
      )}
    </div>
  );
}
