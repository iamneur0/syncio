'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckIcon, MinusIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';

interface SelectAllCheckboxProps {
  totalCount: number;
  selectedCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  className?: string;
  title?: string;
}

export function SelectAllCheckbox({
  totalCount,
  selectedCount,
  onSelectAll,
  onDeselectAll,
  className = '',
  title
}: SelectAllCheckboxProps) {
  const [isHovered, setIsHovered] = useState(false);

  const isEmpty = selectedCount === 0;
  const isAllSelected = selectedCount === totalCount && totalCount > 0;
  const isIndeterminate = selectedCount > 0 && selectedCount < totalCount;

  const handleClick = () => {
    if (isEmpty) {
      onSelectAll();
    } else {
      onDeselectAll();
    }
  };

  if (totalCount === 0) {
    return (
      <div
        className={clsx(
          'w-6 h-6 rounded-lg border-2 cursor-not-allowed',
          'bg-surface-hover/50',
          className
        )}
        style={{ 
          borderColor: 'var(--color-surface-border)',
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.2)',
        }}
        title="No items to select"
      />
    );
  }

  // Get styles based on state - all use primary color theme
  const getBackgroundColor = () => {
    if (isAllSelected || isIndeterminate) return 'var(--color-primary)';
    return 'transparent';
  };

  const getBorderColor = () => {
    if (isAllSelected || isIndeterminate) return 'var(--color-primary)';
    if (isHovered) return 'var(--color-primary)';
    return 'var(--color-surface-border)';
  };

  const getIconColor = () => {
    return 'var(--color-bg)';
  };

  const getBoxShadow = () => {
    if (isEmpty) return 'inset 0 1px 3px rgba(0,0,0,0.2)';
    if (isHovered && (isAllSelected || isIndeterminate)) {
      return '0 0 12px var(--color-primary-muted)';
    }
    return 'none';
  };

  const getRingShadow = () => {
    if (!isHovered || isEmpty) return '0 0 0 0px rgba(0,0,0,0)';
    if (isAllSelected || isIndeterminate) return '0 0 0 4px var(--color-primary-muted)';
    return '0 0 0 0px rgba(0,0,0,0)';
  };

  return (
    <motion.button
      onClick={handleClick}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      className={clsx(
        'relative w-6 h-6 rounded-lg flex items-center justify-center',
        'transition-colors duration-150 ease-out',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2',
        'cursor-pointer',
        className
      )}
      style={{
        backgroundColor: getBackgroundColor(),
        borderColor: getBorderColor(),
        borderWidth: '2px',
        borderStyle: 'solid',
        boxShadow: getBoxShadow(),
      }}
      whileTap={{ scale: 0.92 }}
      transition={{ 
        type: 'spring', 
        stiffness: 400, 
        damping: 25,
        mass: 0.8 
      }}
      type="button"
      aria-label={isAllSelected ? 'Deselect all items' : isIndeterminate ? 'Deselect all items' : `Select all ${totalCount} items`}
      aria-checked={isAllSelected ? 'true' : isIndeterminate ? 'mixed' : 'false'}
      role="checkbox"
      title={title || (isAllSelected ? 'Deselect all' : isIndeterminate ? 'Deselect all' : `Select all ${totalCount} items`)}
    >
      {/* Icon container with spring animation */}
      <AnimatePresence mode="wait">
        {isAllSelected && (
          <motion.div
            key="check"
            initial={{ scale: 0, opacity: 0, rotate: -45 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0, opacity: 0, rotate: 45 }}
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
              style={{ color: getIconColor() }}
            />
          </motion.div>
        )}

        {isIndeterminate && (
          <motion.div
            key="minus"
            initial={{ scale: 0, opacity: 0, x: -8 }}
            animate={{ scale: 1, opacity: 1, x: 0 }}
            exit={{ scale: 0, opacity: 0, x: 8 }}
            transition={{ 
              type: 'spring', 
              stiffness: 500, 
              damping: 30,
              delay: 0.05 
            }}
            className="flex items-center justify-center"
          >
            <MinusIcon 
              className="w-4 h-4" 
              strokeWidth={3} 
              style={{ color: getIconColor() }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Selection count indicator - appears on hover when partially selected */}
      <AnimatePresence>
        {isIndeterminate && isHovered && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.9 }}
            transition={{ duration: 0.15 }}
            className="absolute -top-7 left-1/2 -translate-x-1/2 pointer-events-none"
          >
            <div 
              className="px-2 py-1 rounded-md text-[10px] font-bold whitespace-nowrap shadow-lg"
              style={{ 
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-surface-border)',
              }}
            >
              {selectedCount} of {totalCount}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ripple effect on hover */}
      <motion.div
        className="absolute inset-0 rounded-lg pointer-events-none"
        initial={false}
        animate={{
          boxShadow: getRingShadow()
        }}
        transition={{ duration: 0.2 }}
      />
    </motion.button>
  );
}
