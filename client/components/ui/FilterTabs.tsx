'use client';

import { useState, useRef, useLayoutEffect, useEffect, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface FilterTabOption {
  key: string;
  label: string;
  icon?: React.ReactNode;
  count?: number;
  badge?: {
    value: number | string;
    variant?: 'default' | 'error' | 'warning' | 'success';
  };
}

export interface FilterTabsProps {
  options: FilterTabOption[];
  activeKey: string;
  onChange: (key: string) => void;
  size?: 'sm' | 'md';
  className?: string;
  /** Unique ID for the sliding indicator animation (use different IDs if multiple FilterTabs on same page) */
  layoutId?: string;
}

/**
 * FilterTabs - A modern tab selector with Framer Motion sliding indicator
 * 
 * Features:
 * - Animated sliding background indicator
 * - Support for icons, counts, and badges
 * - Two sizes: sm (compact) and md (default)
 * - Accessible with ARIA attributes
 */
export function FilterTabs({
  options,
  activeKey,
  onChange,
  size = 'sm',
  className = '',
  layoutId,
}: FilterTabsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState<{ left: number; width: number } | null>(null);
  const generatedId = useId();
  const uniqueLayoutId = layoutId || `filter-tabs-${generatedId}`;

  // Function to calculate and update indicator position
  const updateIndicatorPosition = () => {
    if (!containerRef.current) return;

    const activeButton = containerRef.current.querySelector(
      `[data-tab-key="${activeKey}"]`
    ) as HTMLButtonElement | null;

    if (activeButton) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const buttonRect = activeButton.getBoundingClientRect();
      
      setIndicatorStyle({
        left: buttonRect.left - containerRect.left,
        width: buttonRect.width,
      });
    }
  };

  // Calculate indicator position based on active tab - use layoutEffect to avoid flash
  useLayoutEffect(() => {
    updateIndicatorPosition();
  }, [activeKey, options]);

  // Use ResizeObserver to recalculate when button sizes change (e.g., after icons load)
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      updateIndicatorPosition();
    });

    // Observe all tab buttons for size changes
    const buttons = containerRef.current.querySelectorAll('[data-tab-key]');
    buttons.forEach((button) => resizeObserver.observe(button));

    return () => resizeObserver.disconnect();
  }, [activeKey, options]);

  // Size variants
  const sizeClasses = {
    sm: {
      container: 'gap-1 p-1',
      button: 'px-4 py-1.5 text-sm',
      icon: 'w-4 h-4',
      badge: 'w-5 h-5 text-xs',
    },
    md: {
      container: 'gap-2 p-1.5',
      button: 'px-5 py-2 text-sm',
      icon: 'w-5 h-5',
      badge: 'w-6 h-6 text-xs',
    },
  };

  const styles = sizeClasses[size];

  return (
    <div
      ref={containerRef}
      className={`relative flex ${styles.container} rounded-xl bg-surface border border-default ${className}`}
      role="tablist"
      aria-label="Filter options"
    >
      {/* Animated sliding indicator - only render when position is calculated */}
      {indicatorStyle && (
        <motion.div
          layoutId={uniqueLayoutId}
          className="absolute top-1 bottom-1 rounded-lg bg-primary-muted"
          initial={false}
          animate={{
            left: indicatorStyle.left,
            width: indicatorStyle.width,
          }}
          transition={{
            type: 'spring',
            stiffness: 500,
            damping: 35,
            mass: 1,
          }}
          style={{
            zIndex: 0,
          }}
        />
      )}

      {/* Tab buttons */}
      {options.map((option) => {
        const isActive = activeKey === option.key;
        
        return (
          <button
            key={option.key}
            data-tab-key={option.key}
            onClick={() => onChange(option.key)}
            role="tab"
            aria-selected={isActive}
            aria-controls={`panel-${option.key}`}
            className={`
              relative z-10 flex items-center gap-2 ${styles.button} rounded-lg font-medium 
              transition-colors duration-150 ease-out
              ${isActive 
                ? 'text-primary' 
                : 'text-muted hover:text-default'
              }
            `}
          >
            {/* Icon */}
            {option.icon && (
              <span className={`${styles.icon} shrink-0`}>
                {option.icon}
              </span>
            )}
            
            {/* Label */}
            <span>{option.label}</span>
            
            {/* Count (inline, muted) */}
            {option.count !== undefined && (
              <span className={`text-xs tabular-nums ${isActive ? 'text-primary/60' : 'text-subtle'}`}>
                ({option.count})
              </span>
            )}
            
            {/* Badge (notification style, positioned) */}
            {option.badge && (
              <span
                className={`
                  absolute -top-1 -right-1 ${styles.badge} rounded-full 
                  flex items-center justify-center font-bold
                  ${option.badge.variant === 'error' 
                    ? 'bg-error text-white' 
                    : option.badge.variant === 'warning'
                      ? 'bg-warning text-white'
                      : option.badge.variant === 'success'
                        ? 'bg-success text-white'
                        : 'bg-primary text-white'
                  }
                `}
                aria-label={`${option.badge.value} ${option.label}`}
              >
                {option.badge.value}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * FilterTabsSimple - A simpler version without the sliding indicator
 * Useful when you need multiple tab sets that shouldn't share animation context
 */
export function FilterTabsSimple({
  options,
  activeKey,
  onChange,
  size = 'sm',
  className = '',
}: Omit<FilterTabsProps, 'layoutId'>) {
  const sizeClasses = {
    sm: {
      container: 'gap-1 p-1',
      button: 'px-4 py-1.5 text-sm',
    },
    md: {
      container: 'gap-2 p-1.5',
      button: 'px-5 py-2 text-sm',
    },
  };

  const styles = sizeClasses[size];

  return (
    <div
      className={`flex ${styles.container} rounded-xl bg-surface border border-default ${className}`}
      role="tablist"
    >
      {options.map((option) => {
        const isActive = activeKey === option.key;
        
        return (
          <button
            key={option.key}
            onClick={() => onChange(option.key)}
            role="tab"
            aria-selected={isActive}
            className={`
              ${styles.button} rounded-lg font-medium transition-all duration-150
              ${isActive 
                ? 'bg-primary-muted text-primary' 
                : 'text-muted hover:text-default'
              }
            `}
          >
            {option.label}
            {option.count !== undefined && (
              <span className={`ml-1.5 text-xs ${isActive ? 'text-primary/60' : 'text-subtle'}`}>
                ({option.count})
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
