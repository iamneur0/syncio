'use client';

import { useState, useRef, useLayoutEffect, useEffect, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronDownIcon,
  CheckIcon 
} from '@heroicons/react/24/outline';

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
      className={`relative flex ${styles.container} rounded-xl bg-surface border border-default w-full sm:w-auto ${className}`}
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
                relative z-10 flex items-center justify-center gap-2 flex-1 min-w-0 ${styles.button} rounded-lg font-medium 
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
      className={`flex flex-wrap ${styles.container} rounded-xl bg-surface border border-default ${className}`}
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

/**
 * FilterTabsResponsive - Shows dropdown on mobile, tabs on desktop
 * Perfect for pages with many filter options that don't fit on mobile
 */
export function FilterTabsResponsive({
  options,
  activeKey,
  onChange,
  size = 'sm',
  className = '',
  layoutId,
}: FilterTabsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeOption = options.find(opt => opt.key === activeKey);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      const originalStyle = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [isOpen]);

  const sizeClasses = {
    sm: {
      trigger: 'px-3 py-2 text-sm',
      option: 'px-3 py-2.5 text-sm',
      icon: 'w-4 h-4',
    },
    md: {
      trigger: 'px-4 py-2.5 text-sm',
      option: 'px-4 py-3 text-sm',
      icon: 'w-5 h-5',
    },
  };

  const styles = sizeClasses[size];

  return (
    <div ref={dropdownRef} className={`relative md:w-auto ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          md:hidden w-full h-9 flex items-center justify-between
          ${styles.trigger} rounded-lg font-medium
          bg-surface border border-default
          text-default transition-colors duration-150
          hover:bg-surface-hover
        `}
        style={{ minHeight: '36px' }}
        aria-label="Select filter"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="flex items-center gap-1.5 truncate">
          {activeOption?.icon && (
            <span className={`${styles.icon} shrink-0 text-primary`}>
              {activeOption.icon}
            </span>
          )}
          <span className="truncate">{activeOption?.label || 'Select'}</span>
          {activeOption?.count !== undefined && (
            <span className="text-xs text-muted">({activeOption.count})</span>
          )}
        </span>
        <ChevronDownIcon className={`w-4 h-4 text-muted shrink-0 ml-1 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop - fixed on mobile to cover entire screen */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-40 md:hidden"
              onClick={() => setIsOpen(false)}
            />
            
            {/* Dropdown panel - fixed on mobile to escape overflow containers */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="fixed left-4 right-4 top-1/2 -translate-y-1/2 z-50 md:hidden"
            >
              <div className="bg-surface border border-default rounded-xl overflow-hidden shadow-xl max-h-[70vh] overflow-y-auto">
                {options.map((option) => {
                  const isActive = activeKey === option.key;
                  
                  return (
                    <button
                      key={option.key}
                      onClick={() => {
                        onChange(option.key);
                        setIsOpen(false);
                      }}
                      role="option"
                      aria-selected={isActive}
                      className={`
                        w-full flex items-center justify-between gap-3
                        ${styles.option} font-medium
                        transition-colors duration-150
                        ${isActive 
                          ? 'bg-primary-muted text-primary' 
                          : 'text-default hover:bg-surface-hover'
                        }
                      `}
                    >
                      <span className="flex items-center gap-2">
                        {option.icon && (
                          <span className={`${styles.icon} shrink-0 ${isActive ? 'text-primary' : 'text-muted'}`}>
                            {option.icon}
                          </span>
                        )}
                        <span>{option.label}</span>
                        {option.count !== undefined && (
                          <span className={`text-xs ${isActive ? 'text-primary/60' : 'text-muted'}`}>
                            ({option.count})
                          </span>
                        )}
                      </span>
                      {isActive && (
                        <CheckIcon className="w-4 h-4 text-primary shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="hidden md:block">
        <FilterTabs
          options={options}
          activeKey={activeKey}
          onChange={onChange}
          size={size}
          layoutId={layoutId}
        />
      </div>
    </div>
  );
}
