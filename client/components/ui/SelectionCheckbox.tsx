'use client';

import { motion } from 'framer-motion';
import { CheckIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';

interface SelectionCheckboxProps {
  checked: boolean;
  onChange?: () => void;
  className?: string;
  visible?: boolean;
}

export function SelectionCheckbox({
  checked,
  onChange,
  className = '',
  visible = true,
}: SelectionCheckboxProps) {
  return (
    <motion.button
      onClick={(e) => {
        e.stopPropagation();
        onChange?.();
      }}
      className={clsx(
        'relative w-6 h-6 rounded-lg flex items-center justify-center',
        'transition-all duration-150 ease-out',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2',
        checked ? 'cursor-pointer' : 'cursor-pointer',
        !visible && !checked && 'opacity-0',
        className
      )}
      style={{
        backgroundColor: checked ? 'var(--color-primary)' : 'var(--color-surface)',
        borderColor: checked ? 'var(--color-primary)' : 'var(--color-surface-border)',
        borderWidth: '2px',
        borderStyle: 'solid',
        boxShadow: checked ? '0 0 12px var(--color-primary-muted)' : 'inset 0 1px 3px rgba(0,0,0,0.2)',
      }}
      whileHover={{ 
        borderColor: 'var(--color-primary)',
        boxShadow: checked ? '0 0 16px var(--color-primary-muted)' : '0 0 8px var(--color-primary-muted)'
      }}
      whileTap={{ scale: 0.92 }}
      transition={{ 
        type: 'spring', 
        stiffness: 400, 
        damping: 25,
        mass: 0.8 
      }}
      type="button"
      aria-label={checked ? 'Deselect item' : 'Select item'}
      aria-checked={checked ? 'true' : 'false'}
      role="checkbox"
    >
      <motion.div
        initial={false}
        animate={{
          scale: checked ? 1 : 0,
          opacity: checked ? 1 : 0,
          rotate: checked ? 0 : -45,
        }}
        transition={{ 
          type: 'spring', 
          stiffness: 500, 
          damping: 30,
          delay: 0.05 
        }}
        className="flex items-center justify-center"
      >
        <CheckIcon 
          className="w-4 h-4" 
          strokeWidth={3} 
          style={{ color: 'var(--color-bg)' }}
        />
      </motion.div>

      {/* Ripple effect on hover when not checked */}
      <motion.div
        className="absolute inset-0 rounded-lg pointer-events-none"
        initial={false}
        animate={{
          boxShadow: checked 
            ? '0 0 0 4px var(--color-primary-muted)' 
            : '0 0 0 0px rgba(0,0,0,0)'
        }}
        transition={{ duration: 0.2 }}
      />
    </motion.button>
  );
}
