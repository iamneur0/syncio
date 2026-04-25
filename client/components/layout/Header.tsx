'use client';

import { motion } from 'framer-motion';
import { BellIcon, MagnifyingGlassIcon, Bars3Icon } from '@heroicons/react/24/outline';
import { Avatar } from '../ui/Avatar';
import { NotificationsDropdown } from '../ui/NotificationsDropdown';
import { useMobileMenu } from '@/app/(admin)/AdminClientLayout';

interface HeaderProps {
  title: React.ReactNode;
  subtitle?: string;
  actions?: React.ReactNode;
  activities?: any[];
  inviteHistory?: any[];
  taskHistory?: any[];
  onMenuClick?: () => void;
  isMobileMenuOpen?: boolean;
}

export function Header({ 
  title, 
  subtitle, 
  actions, 
  activities = [], 
  inviteHistory = [], 
  taskHistory = [],
  onMenuClick: onMenuClickProp,
  isMobileMenuOpen: isMobileMenuOpenProp
}: HeaderProps) {
  const { onOpen: onMenuClickContext, isOpen: isMobileMenuOpenContext } = useMobileMenu();
  
  // Use provided props or fall back to context
  const onMenuClick = onMenuClickProp || onMenuClickContext;
  const isMobileMenuOpen = isMobileMenuOpenProp !== undefined ? isMobileMenuOpenProp : isMobileMenuOpenContext;

  const INSTANCE_TYPE = (process.env.NEXT_PUBLIC_INSTANCE_TYPE || 'private') as 'public' | 'private';

  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="sticky top-0 z-30"
      style={{
        background: 'color-mix(in srgb, var(--color-bg) 80%, transparent)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--color-surfaceBorder)',
      }}
    >
      <div className="px-4 md:px-6 lg:px-8 py-3 md:py-4 flex items-center justify-between gap-4">
        {/* Mobile Menu Button & Title section */}
        <div className="flex items-center gap-3">
          {/* Hamburger - only show on mobile */}
          <button
            onClick={onMenuClick}
            className="md:hidden p-2 -ml-2 rounded-lg hover:bg-surface-hover transition-colors"
            aria-label="Open menu"
          >
            <Bars3Icon className="w-6 h-6 text-default" />
          </button>

          <div>
            <motion.h1
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="text-lg md:text-xl font-semibold font-display"
              style={{ color: 'var(--color-text)' }}
            >
              {title}
            </motion.h1>
            {subtitle ? (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="text-sm mt-0.5 hidden sm:block"
                style={{ color: 'var(--color-textMuted)' }}
              >
                {subtitle}
              </motion.p>
            ) : null}
          </div>
        </div>

        {/* Right section */}
        <div className="flex items-center gap-2 md:gap-3">
          {/* Notifications */}
          <NotificationsDropdown
            activities={activities}
            inviteHistory={inviteHistory}
            taskHistory={taskHistory}
          />

          {/* Actions */}
          {actions ? (
            <div 
              className="hidden md:flex items-center gap-2 pl-3"
              style={{ borderLeft: '1px solid var(--color-surfaceBorder)' }}
            >
              {actions}
            </div>
          ) : null}
        </div>
      </div>
    </motion.header>
  );
}

// Breadcrumbs component
interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  return (
    <nav className={`flex items-center gap-2 ${className || 'text-sm'}`} style={{ color: 'var(--color-textMuted)' }}>
      {items.map((item, index) => (
        <motion.div
          key={index}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.05 }}
          className="flex items-center gap-2"
        >
          {index > 0 && <span style={{ color: 'var(--color-textSubtle)' }}>/</span>}
          {item.href ? (
            <a
              href={item.href}
              className="transition-colors hover:text-[var(--color-text)]"
              style={{ color: 'var(--color-textMuted)' }}
            >
              {item.label}
            </a>
          ) : (
            <span style={{ color: 'var(--color-text)' }}>{item.label}</span>
          )}
        </motion.div>
      ))}
    </nav>
  );
}
