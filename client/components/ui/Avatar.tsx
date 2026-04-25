'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import CryptoJS from 'crypto-js';
import { UserAvatar } from './UserAvatar';

interface AvatarProps {
  name: string;
  src?: string;
  email?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  showRing?: boolean;
  status?: 'online' | 'offline' | 'away';
  colorIndex?: number;
  fallbackIcon?: React.ReactNode;
  className?: string;
  imgClassName?: string;
  avatarClassName?: string;
}

const sizes = {
  xs: 'w-6 h-6 text-xs',
  sm: 'w-8 h-8 text-sm',
  md: 'w-10 h-10 text-base',
  lg: 'w-12 h-12 text-lg',
  xl: 'w-16 h-16 text-xl',
  '2xl': 'w-24 h-24 text-4xl',
};

// Theme-based avatar styles using variations of primary and secondary colors
const avatarStyles = [
  // Primary variations
  {
    background: 'color-mix(in srgb, var(--color-primary) 100%, white)',
    gradient: 'linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 80%, white) 0%, var(--color-primary) 100%)',
  },
  {
    background: 'color-mix(in srgb, var(--color-primary) 75%, white)',
    gradient: 'linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 55%, white) 0%, color-mix(in srgb, var(--color-primary) 85%, white) 100%)',
  },
  {
    background: 'color-mix(in srgb, var(--color-primary) 50%, white)',
    gradient: 'linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 30%, white) 0%, color-mix(in srgb, var(--color-primary) 70%, white) 100%)',
  },
  {
    background: 'color-mix(in srgb, var(--color-primary) 25%, white)',
    gradient: 'linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 10%, white) 0%, color-mix(in srgb, var(--color-primary) 40%, white) 100%)',
  },
  // Secondary variations
  {
    background: 'color-mix(in srgb, var(--color-secondary) 100%, white)',
    gradient: 'linear-gradient(135deg, color-mix(in srgb, var(--color-secondary) 80%, white) 0%, var(--color-secondary) 100%)',
  },
  {
    background: 'color-mix(in srgb, var(--color-secondary) 75%, white)',
    gradient: 'linear-gradient(135deg, color-mix(in srgb, var(--color-secondary) 55%, white) 0%, color-mix(in srgb, var(--color-secondary) 85%, white) 100%)',
  },
  {
    background: 'color-mix(in srgb, var(--color-secondary) 50%, white)',
    gradient: 'linear-gradient(135deg, color-mix(in srgb, var(--color-secondary) 30%, white) 0%, color-mix(in srgb, var(--color-secondary) 70%, white) 100%)',
  },
  {
    background: 'color-mix(in srgb, var(--color-secondary) 25%, white)',
    gradient: 'linear-gradient(135deg, color-mix(in srgb, var(--color-secondary) 10%, white) 0%, color-mix(in srgb, var(--color-secondary) 40%, white) 100%)',
  },
];

function getStyleIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % avatarStyles.length;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getGravatarUrl(email: string | null | undefined, size: number = 128): string | null {
  if (!email) return null;
  
  // Normalize email: trim and convert to lowercase
  const normalizedEmail = email.trim().toLowerCase();
  
  // Generate MD5 hash using crypto-js
  const hash = CryptoJS.MD5(normalizedEmail).toString();
  
  // Construct Gravatar URL
  // Using d=404 means Gravatar will return 404 error if no image exists, triggering fallback
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=404`;
}

export function Avatar({ name, src, email, size = 'md', showRing = false, status, colorIndex, fallbackIcon, className, imgClassName, avatarClassName }: AvatarProps) {
  const initials = getInitials(name);
  const styleIndex = colorIndex !== undefined ? (colorIndex % avatarStyles.length) : getStyleIndex(name);
  const style = avatarStyles[styleIndex];

  const [gravatarSrc, setGravatarSrc] = useState<string | undefined>(undefined);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    if (!email) {
      setGravatarSrc(undefined);
      return;
    }

    // Generate gravatar URL
    const url = getGravatarUrl(email, 128);
    setGravatarSrc(url || undefined);
  }, [email]);

  const finalSrc = src || gravatarSrc;

  return (
    <div className={clsx("relative inline-flex rounded-full", className)}>
      <motion.div
        whileHover={{ scale: 1.05 }}
        className={clsx(
          'relative rounded-full overflow-hidden flex items-center justify-center font-semibold',
          sizes[size],
          avatarClassName
        )}
        style={{
          background: finalSrc && !imageError ? undefined : style.gradient,
          color: 'white',
          textShadow: '0 1px 2px rgba(0,0,0,0.3)',
          boxShadow: showRing
            ? '0 0 0 2px var(--color-primary-muted), 0 0 0 4px var(--color-bg)'
            : '0 0 0 2px var(--color-surface-border)'
        }}
      >
        {finalSrc && !imageError ? (
          <img 
            src={finalSrc} 
            alt={name} 
            className={clsx("w-full h-full object-cover", imgClassName)}
            role="img"
            onError={() => setImageError(true)}
          />
        ) : fallbackIcon ? (
          <div className="flex items-center justify-center w-full h-full">
            {fallbackIcon}
          </div>
        ) : (
          <span role="img" aria-label={`Avatar for ${name}`}>{initials}</span>
        )}
      </motion.div>

      {status && (
        <span 
          className={clsx(
            'absolute bottom-0 right-0 block rounded-full',
            size === 'xs' || size === 'sm' ? 'w-2 h-2' : 'w-3 h-3'
          )}
          style={{
            background: status === 'online' 
              ? 'var(--color-success)' 
              : status === 'away' 
              ? 'var(--color-warning)' 
              : 'var(--color-text-subtle)',
            boxShadow: '0 0 0 2px var(--color-bg)'
          }}
        />
      )}
    </div>
  );
}

// Avatar group for stacking
interface AvatarGroupProps {
  users: { name: string; id: string; src?: string; email?: string }[];
  max?: number;
  size?: 'xs' | 'sm' | 'md';
}

export function AvatarGroup({ users, max = 4, size = 'sm' }: AvatarGroupProps) {
  const displayed = users.slice(0, max);
  const remaining = users.length - max;

  return (
    <div className="flex -space-x-2">
      {displayed.map((user, i) => (
        <motion.div
          key={user.id || i}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.05 }}
          className="relative"
          style={{ zIndex: displayed.length - i }}
        >
          <UserAvatar userId={user.id} name={user.name} src={user.src} email={user.email} size={size} showRing />
        </motion.div>
      ))}
      {remaining > 0 && (
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: displayed.length * 0.05 }}
          className={clsx(
            'relative rounded-full flex items-center justify-center font-medium',
            sizes[size]
          )}
          style={{
            background: 'var(--color-surface)',
            border: '2px solid var(--color-bg)',
            color: 'var(--color-text-muted)'
          }}
        >
          +{remaining}
        </motion.div>
      )}
    </div>
  );
}
