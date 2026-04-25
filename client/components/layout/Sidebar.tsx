'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HomeIcon,
  UsersIcon,
  UserGroupIcon,
  PuzzlePieceIcon,
  EnvelopeIcon,
  Cog6ToothIcon,
  ChartBarIcon,
  ClockIcon,
  QueueListIcon,
  DocumentTextIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { PanelSwitcher } from './PanelSwitcher';
import { api } from '@/lib/api';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

// Navigation structure with grouped sections
const navigationSections = [
  {
    id: 'overview',
    label: 'Overview',
    items: [
      { name: 'Dashboard', href: '/', icon: HomeIcon },
      { name: 'Activity', href: '/activity', icon: ClockIcon },
      { name: 'Metrics', href: '/metrics', icon: ChartBarIcon },
    ],
  },
  {
    id: 'management',
    label: 'Management',
    items: [
      { name: 'Users', href: '/users', icon: UsersIcon },
      { name: 'Groups', href: '/groups', icon: UserGroupIcon },
      { name: 'Addons', href: '/addons', icon: PuzzlePieceIcon },
      { name: 'Invitations', href: '/invitations', icon: EnvelopeIcon },
    ],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      { name: 'Tasks', href: '/tasks', icon: QueueListIcon },
      { name: 'Settings', href: '/settings', icon: Cog6ToothIcon },
      { name: 'Changelog', href: '/changelog', icon: DocumentTextIcon },
    ],
  },
];

interface NavItemProps {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  isActive: boolean;
  index: number;
  onNavigate?: () => void;
}

function NavItem({ name, href, icon: Icon, isActive, index, onNavigate }: NavItemProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
    >
      <Link
        href={href}
        onClick={onNavigate}
        className="relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group"
        style={{
          background: isActive ? 'var(--color-primary-muted)' : 'transparent',
          color: isActive ? 'var(--color-text)' : 'var(--color-text-muted)',
        }}
        onMouseEnter={(e) => {
          if (!isActive) {
            e.currentTarget.style.background = 'var(--color-surface-hover)';
            e.currentTarget.style.color = 'var(--color-text)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive) {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--color-text-muted)';
          }
        }}
      >
        {isActive && (
          <motion.div
            layoutId="activeNavIndicator"
            className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full"
            style={{ background: 'var(--color-primary)' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          />
        )}

        <Icon
          className={`w-[18px] h-[18px] transition-colors ${isActive ? 'text-primary' : ''}`}
        />
        <span className="text-sm font-medium">{name}</span>
      </Link>
    </motion.div>
  );
}

interface NavSectionProps {
  label: string;
  children: React.ReactNode;
  delay?: number;
}

function NavSection({ label, children, delay = 0 }: NavSectionProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay }}
      className="space-y-0.5"
    >
      <h3
        className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: 'var(--color-text-subtle)' }}
      >
        {label}
      </h3>
      {children}
    </motion.div>
  );
}

export function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [accountInfo, setAccountInfo] = useState<{ username?: string; email?: string; uuid?: string | null } | null>(null);

  const isPublicInstance = (process.env.NEXT_PUBLIC_INSTANCE_TYPE || 'private') === 'public';

  useEffect(() => {
    api.getAccountStats()
      .then(stats => {
        const uuid = (stats as any).uuid || null;
        const email = (stats as any).email || null;
        setAccountInfo({
          username: isPublicInstance ? (uuid || email || 'Admin') : 'Administrator',
          email: email,
          uuid: uuid,
        });
      })
      .catch(() => { });
  }, []);

  const isItemActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname === href || pathname.startsWith(href + '/');
  };

  const handleLogout = () => {
    localStorage.removeItem('syncio-admin-token');
    window.location.href = '/login?mode=admin';
  };

  const handleNavigate = () => {
    if (onClose) {
      onClose();
    }
  };

  let globalIndex = 0;

  return (
    <>
      {/* Mobile Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        initial={{ x: -280 }}
        animate={{ x: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className={`
          fixed left-0 top-0 bottom-0 w-60 flex flex-col z-50
          md:z-40 md:translate-x-0 md:flex
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
        style={{
          background: 'var(--color-surface)',
          borderRight: '1px solid var(--color-surface-border)',
        }}
      >
        {/* Mobile Close Button */}
        <div className="flex items-center justify-between p-4 md:hidden">
          <span className="text-sm font-medium text-muted">Menu</span>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-surface-hover transition-colors"
          >
            <XMarkIcon className="w-5 h-5 text-muted" />
          </button>
        </div>

        {/* Logo */}
        <div
          className="p-5 hidden md:block"
          style={{ borderBottom: '1px solid var(--color-surface-border)' }}
        >
          <Link href="/" className="flex items-center gap-3">
            <motion.div
              whileHover={{ scale: 1.05 }}
              transition={{ duration: 0.2 }}
              className="w-9 h-9 rounded-lg flex items-center justify-center overflow-hidden"
              style={{ background: 'var(--color-primary)' }}
            >
              <img src="/logo-white.png" alt="Syncio" className="w-7 h-7 object-contain" />
            </motion.div>
            <div>
              <h1 className="text-lg font-bold font-display" style={{ color: 'var(--color-text)' }}>
                Syncio
              </h1>
            </div>
          </Link>
        </div>

        {/* Navigation Sections */}
        <nav className="flex-1 p-3 space-y-5 overflow-y-auto custom-scrollbar">
          {navigationSections.map((section, sectionIndex) => (
            <NavSection key={section.id} label={section.label} delay={sectionIndex * 0.1}>
              {section.items.map((item) => {
                const itemIndex = globalIndex++;
                return (
                  <NavItem
                    key={item.href}
                    name={item.name}
                    href={item.href}
                    icon={item.icon}
                    isActive={isItemActive(item.href)}
                    index={itemIndex}
                    onNavigate={handleNavigate}
                  />
                );
              })}
            </NavSection>
          ))}
        </nav>

        {/* Version */}
        <div
          className="mt-auto px-4 py-2 flex items-center justify-center"
          style={{ borderTop: '1px solid var(--color-surface-border)' }}
        >
          <span
            className="text-[10px] font-medium tracking-wide"
            style={{ color: 'var(--color-text-subtle)' }}
          >
            v{(process.env.NEXT_PUBLIC_APP_VERSION as string) || 'dev'}
          </span>
        </div>

        {/* Panel Switcher */}
        <div
          className="p-3"
          style={{ borderTop: '1px solid var(--color-surface-border)' }}
        >
          <PanelSwitcher
            mode="admin"
            userInfo={accountInfo}
            onLogout={handleLogout}
          />
        </div>
      </motion.aside>
    </>
  );
}
