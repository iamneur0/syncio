'use client';

import { motion, HTMLMotionProps } from 'framer-motion';
import { forwardRef } from 'react';
import clsx from 'clsx';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'aurora' | 'cyan' | 'glass';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  children: React.ReactNode;
}

const sizes: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-lg gap-1.5',
  md: 'px-4 py-2 text-sm rounded-lg gap-2',
  lg: 'px-5 py-2.5 text-sm rounded-xl gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', isLoading, leftIcon, rightIcon, children, className, disabled, style, ...props }, ref) => {
    
    // Get variant styles using CSS variables
    const getVariantStyles = () => {
      switch (variant) {
        case 'primary':
        case 'aurora': // Legacy support
          return {
            background: 'var(--color-primary)',
            color: 'var(--color-bg)',
            border: 'none',
          };
        case 'secondary':
        case 'glass': // Legacy support
          return {
            background: 'transparent',
            color: 'var(--color-text)',
            border: '1px solid var(--color-surface-border)',
          };
        case 'ghost':
          return {
            background: 'transparent',
            color: 'var(--color-text-muted)',
            border: 'none',
          };
        case 'danger':
          return {
            background: 'var(--color-error)',
            color: 'white',
            border: 'none',
          };
        case 'cyan': // Legacy support
          return {
            background: 'var(--color-secondary)',
            color: 'var(--color-bg)',
            border: 'none',
          };
        default:
          return {};
      }
    };

    const variantStyles = getVariantStyles();

    return (
      <motion.button
        ref={ref}
        whileHover={{ scale: disabled || isLoading ? 1 : 1.02 }}
        whileTap={{ scale: disabled || isLoading ? 1 : 0.98 }}
        transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        className={clsx(
          'relative inline-flex items-center justify-center font-medium transition-all duration-200',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          sizes[size],
          className
        )}
        style={{
          ...variantStyles,
          ...style,
        }}
        disabled={disabled || isLoading}
        onMouseEnter={(e) => {
          if (disabled || isLoading) return;
          const target = e.currentTarget;
          if (variant === 'ghost') {
            target.style.background = 'var(--color-surface-hover)';
            target.style.color = 'var(--color-text)';
          } else if (variant === 'secondary' || variant === 'glass') {
            target.style.background = 'var(--color-surface-hover)';
            target.style.borderColor = 'var(--color-text-subtle)';
          } else if (variant === 'primary' || variant === 'aurora') {
            target.style.background = 'var(--color-primary-hover)';
          } else if (variant === 'cyan') {
            target.style.background = 'var(--color-secondary-muted)';
          } else if (variant === 'danger') {
            target.style.opacity = '0.9';
          }
        }}
        onMouseLeave={(e) => {
          const target = e.currentTarget;
          const styles = getVariantStyles();
          // Reset each property explicitly to avoid issues with Object.assign
          target.style.background = styles.background || '';
          target.style.color = styles.color || '';
          target.style.border = styles.border || '';
          target.style.borderColor = '';
          target.style.opacity = '';
        }}
        {...props}
      >
        {/* Content */}
        <span className="relative flex items-center" style={{ gap: 'inherit' }}>
          {isLoading ? (
            <motion.span
              className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            />
          ) : leftIcon}
          {children}
          {!isLoading && rightIcon}
        </span>
      </motion.button>
    );
  }
);

Button.displayName = 'Button';
