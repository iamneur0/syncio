'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UserIcon,
  ShieldCheckIcon,
  ArrowRightOnRectangleIcon,
  ChevronDownIcon,
  ArrowsRightLeftIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';
import { Avatar } from '@/components/ui';
import { toast } from '@/components/ui/Toast';
import { AccountModal } from './AccountModal';

interface PanelSwitcherProps {
  /** Current panel mode */
  mode: 'admin' | 'user';
  /** User info for display (optional) */
  userInfo?: {
    username?: string;
    email?: string;
    colorIndex?: number;
    uuid?: string | null;
  } | null;
  /** Called when logout is clicked */
  onLogout?: () => void;
  /** Whether the component is collapsed (for sidebar) */
  collapsed?: boolean;
}

/**
 * Panel switcher component for switching between Admin and User panels
 * Appears in the sidebar of both panels
 */
export function PanelSwitcher({ mode, userInfo, onLogout, collapsed = false }: PanelSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close on escape
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  const handleCopyUuid = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!userInfo?.uuid) return;

    navigator.clipboard.writeText(userInfo.uuid);
    setCopied(true);
    toast.success('UUID copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSwitchPanel = async () => {
    if (mode === 'admin') {
      setIsOpen(false);
      // Switching from Admin to User
      // Check if user is logged in (has auth in localStorage)
      const userAuth = localStorage.getItem('syncio-user-auth');
      if (userAuth) {
        try {
          const data = JSON.parse(userAuth);
          if (data.userId && data.authKey) {
            window.location.href = '/user';
            return;
          }
        } catch { }
      }
      // Not logged in as user, go to login
      window.location.href = '/login?mode=user';
    } else {
      // Switching from User to Admin
      // Check if admin is logged in (localStorage)
      const adminToken = localStorage.getItem('syncio-admin-token');
      if (adminToken) {
        setIsOpen(false);
        window.location.href = '/';
        return;
      }

      // If no token, verify session via API (cookie check) to avoid login page flash
      try {
        const response = await fetch('/api/ext/account');
        if (response.ok) {
          setIsOpen(false);
          window.location.href = '/';
          return;
        }
      } catch { }

      // Not logged in as admin, go to login
      setIsOpen(false);
      window.location.href = '/login?mode=admin';
    }
  };

  const handleLogout = () => {
    setIsOpen(false);
    onLogout?.();
  };

  const isAdmin = mode === 'admin';
  const isPublicInstance = (process.env.NEXT_PUBLIC_INSTANCE_TYPE || 'private') === 'public';
  const targetPanel = isAdmin ? 'User' : 'Admin';
  const TargetIcon = isAdmin ? UserIcon : ShieldCheckIcon;

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger Button */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200"
        style={{
          background: isOpen ? 'var(--color-surface-elevated)' : 'transparent',
          color: 'var(--color-text)',
        }}
        onMouseEnter={(e) => {
          if (!isOpen) {
            e.currentTarget.style.background = 'var(--color-surface-hover)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isOpen) {
            e.currentTarget.style.background = 'transparent';
          }
        }}
      >
        {/* Current Mode Icon */}
        <div
          className="flex-shrink-0"
        >
          {isAdmin ? (
            userInfo ? (
              <Avatar
                name={userInfo.username || 'A'}
                email={userInfo.email}
                size="sm"
                className="w-8 h-8"
                avatarClassName="rounded-lg"
                fallbackIcon={<ShieldCheckIcon className="w-4 h-4" style={{ color: 'white' }} />}
              />
            ) : (
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'var(--color-primary-muted)' }}
              >
                <ShieldCheckIcon className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />
              </div>
            )
          ) : (
            userInfo ? (
              <Avatar
                name={userInfo.username || 'U'}
                email={userInfo.email}
                colorIndex={userInfo.colorIndex || 0}
                size="sm"
                className="w-8 h-8"
                avatarClassName="rounded-lg"
              />
            ) : (
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'var(--color-success-muted)' }}
              >
                <UserIcon className="w-4 h-4" style={{ color: 'var(--color-success)' }} />
              </div>
            )
          )}
        </div>

        {!collapsed && (
          <>
            <div className="flex-1 text-left min-w-0">
              <p className="text-sm font-medium truncate">
                {isAdmin ? (userInfo?.username || 'Admin Panel') : (userInfo?.username || 'User Panel')}
              </p>
              <p className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>
                {isAdmin ? (userInfo?.email || 'Administrator') : (userInfo?.email || 'Stremio User')}
              </p>
            </div>

            <ChevronDownIcon
              className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
              style={{ color: 'var(--color-text-muted)' }}
            />
          </>
        )}
      </motion.button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-0 right-0 mb-2 rounded-xl overflow-hidden shadow-xl z-50"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-surface-border)',
            }}
          >
            {/* Switch Panel Button */}
            <button
              onClick={handleSwitchPanel}
              className="w-full flex items-center gap-3 px-4 py-3 transition-all duration-200"
              style={{ color: 'var(--color-text)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--color-surface-hover)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{
                  background: isAdmin ? 'var(--color-success-muted)' : 'var(--color-primary-muted)',
                }}
              >
                <TargetIcon
                  className="w-4 h-4"
                  style={{ color: isAdmin ? 'var(--color-success)' : 'var(--color-primary)' }}
                />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium">Switch to {targetPanel} Panel</p>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {isAdmin ? 'Access your library and settings' : 'Manage users and system'}
                </p>
              </div>
              <ArrowsRightLeftIcon className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
            </button>

            {/* Copy UUID Button (Admin Mode / Public Instance / Has UUID only) */}
            {isAdmin && isPublicInstance && userInfo?.uuid && (
              <>
                <div className="h-px" style={{ background: 'var(--color-surface-border)' }} />
                <button
                  onClick={handleCopyUuid}
                  className="w-full flex items-center gap-3 px-4 py-3 transition-all duration-200"
                  style={{ color: 'var(--color-text)' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--color-surface-hover)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center bg-surface-hover"
                  >
                    {copied ? (
                      <CheckIcon className="w-4 h-4 text-success" />
                    ) : (
                      <ClipboardDocumentIcon className="w-4 h-4 text-muted" />
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium">Copy Account UUID</p>
                    <p className="text-[10px] font-mono opacity-50 truncate max-w-[180px]">
                      {userInfo.uuid}
                    </p>
                  </div>
                </button>
              </>
            )}

            {/* Account Button (Admin Mode / Public Instance only) */}
            {isAdmin && isPublicInstance && (
              <>
                <div className="h-px" style={{ background: 'var(--color-surface-border)' }} />
                <button
                  onClick={() => { setIsOpen(false); setAccountModalOpen(true); }}
                  className="w-full flex items-center gap-3 px-4 py-3 transition-all duration-200"
                  style={{ color: 'var(--color-text)' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--color-surface-hover)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: 'var(--color-surface-hover)' }}
                  >
                    <Cog6ToothIcon className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium">Account</p>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Manage login methods</p>
                  </div>
                </button>
              </>
            )}

            {/* Divider */}
            <div className="h-px" style={{ background: 'var(--color-surface-border)' }} />

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 transition-all duration-200"
              style={{ color: 'var(--color-error)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--color-error-muted)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'var(--color-error-muted)' }}
              >
                <ArrowRightOnRectangleIcon className="w-4 h-4" style={{ color: 'var(--color-error)' }} />
              </div>
              <span className="text-sm font-medium">Logout</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Account Modal */}
      {isAdmin && isPublicInstance && (
        <AccountModal
          isOpen={accountModalOpen}
          onClose={() => setAccountModalOpen(false)}
          accountInfo={{
            uuid: userInfo?.uuid,
            email: userInfo?.email,
          }}
          onAccountUpdated={() => {
            // Refresh page to update account info
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
