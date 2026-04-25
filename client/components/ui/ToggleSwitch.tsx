'use client';

import { motion } from 'framer-motion';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: () => void;
  size?: 'sm' | 'md';
  title?: string;
  disabled?: boolean;
  className?: string;
}

export function ToggleSwitch({
  checked,
  onChange,
  size = 'md',
  title,
  disabled = false,
  className = ''
}: ToggleSwitchProps) {
  const trackBase = size === 'sm' ? 'h-5 w-9' : 'h-6 w-11';
  const knobBase = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  const knobTranslate = size === 'sm' 
    ? (checked ? 'translate-x-4' : 'translate-x-0.5') 
    : (checked ? 'translate-x-5' : 'translate-x-1');

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onChange();
      }}
      disabled={disabled}
      className={`relative inline-flex items-center rounded-full transition-colors ${trackBase} disabled:opacity-50 ${className}`}
      style={{
        background: checked ? 'var(--color-primary)' : 'var(--color-surface-hover)',
        border: '1px solid var(--color-surface-border)'
      }}
      aria-pressed={checked}
      title={title}
      type="button"
    >
      <motion.span
        className={`inline-block rounded-full ${knobBase}`}
        style={{
          background: checked ? 'white' : 'var(--color-text-muted)',
        }}
        animate={{
          x: checked ? (size === 'sm' ? 16 : 20) : (size === 'sm' ? 2 : 4)
        }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
    </button>
  );
}
