'use client';

import { forwardRef, InputHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  size?: 'sm' | 'md';
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, leftIcon, rightIcon, size = 'md', className, ...props }, ref) => {
    const sizeStyles = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-3',
    };
    
    const iconSizeStyles = {
      sm: 'left-3',
      md: 'left-4',
    };
    
    return (
      <div className="w-full">
        {label && (
          <label 
            className="block text-sm font-medium mb-2"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div 
              className={clsx("absolute top-1/2 -translate-y-1/2", iconSizeStyles[size])}
              style={{ color: 'var(--color-text-subtle)' }}
            >
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            className={clsx(
              'syncio-input w-full rounded-xl transition-all duration-300',
              sizeStyles[size],
              'focus:outline-none focus:ring-0 focus:shadow-none focus-visible:outline-none focus-visible:ring-0 focus-visible:shadow-none',
              'border',
              error 
                ? 'border-theme-error focus:border-theme-error' 
                : 'border-theme-surface-border focus:border-theme-primary-muted',
              leftIcon && (size === 'sm' ? 'pl-9' : 'pl-12'),
              rightIcon && (size === 'sm' ? 'pr-9' : 'pr-12'),
              className
            )}
            style={{
              backgroundColor: 'var(--color-surface-hover)',
              color: 'var(--color-text)',
              borderColor: 'var(--color-surface-border)',
              ...props.style,
            }}
            {...props}
          />
          {rightIcon && (
            <div 
              className="absolute right-4 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--color-text-subtle)' }}
            >
              {rightIcon}
            </div>
          )}
        </div>
        {(error || hint) && (
          <p 
            className="mt-2 text-sm"
            style={{ color: error ? 'var(--color-error)' : 'var(--color-text-subtle)' }}
          >
            {error || hint}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

// Textarea component
interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, className, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label 
            className="block text-sm font-medium mb-2"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          className={clsx(
            'w-full px-4 py-3 rounded-xl transition-all duration-300 resize-none',
            'focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0',
            'border',
            error 
              ? 'border-theme-error focus:border-theme-error' 
              : 'border-theme-surface-border focus:border-theme-secondary',
            className
          )}
          style={{
            backgroundColor: 'var(--color-bg-subtle)',
            color: 'var(--color-text)',
          }}
          {...props}
        />
        {(error || hint) && (
          <p 
            className="mt-2 text-sm"
            style={{ color: error ? 'var(--color-error)' : 'var(--color-text-subtle)' }}
          >
            {error || hint}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

// Search input with animation
interface SearchInputProps extends Omit<InputProps, 'leftIcon'> {
  onSearch?: (value: string) => void;
  size?: 'sm' | 'md';
}

export function SearchInput({ onSearch, size = 'md', ...props }: SearchInputProps) {
  return (
    <Input
      size={size}
      leftIcon={
        <MagnifyingGlassIcon 
          className={size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'} 
          style={{ color: 'var(--color-text-muted)' }}
        />
      }
      placeholder="Search..."
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-surface-border)',
        color: 'var(--color-text)',
      }}
      {...props}
    />
  );
}

// Select component
interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  label?: string;
  options: SelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  error?: string;
}

export function Select({ label, options, value, onChange, placeholder, error }: SelectProps) {
  return (
    <div className="w-full">
      {label && (
        <label 
          className="block text-sm font-medium mb-2"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {label}
        </label>
      )}
      <select
        value={value}
        onChange={e => onChange?.(e.target.value)}
        className={clsx(
          'w-full px-4 py-3 rounded-xl transition-all duration-300',
          'appearance-none cursor-pointer',
          'focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0',
          'border',
          error 
            ? 'border-theme-error focus:border-theme-error' 
            : 'border-theme-surface-border focus:border-theme-secondary',
          'bg-[url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%2394a3b8\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'/%3E%3C/svg%3E")]',
          'bg-[length:1.25rem] bg-[right_1rem_center] bg-no-repeat'
        )}
        style={{
          backgroundColor: 'var(--color-bg-subtle)',
          color: 'var(--color-text)',
        }}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map(opt => (
          <option 
            key={opt.value} 
            value={opt.value} 
            style={{ backgroundColor: 'var(--color-surface)' }}
          >
            {opt.label}
          </option>
        ))}
      </select>
      {error && (
        <p 
          className="mt-2 text-sm"
          style={{ color: 'var(--color-error)' }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
