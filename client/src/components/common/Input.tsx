'use client'

import React from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { getInputClasses, getTextClasses } from '@/utils/themeUtils'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  className?: string
}

export default function Input({
  label,
  error,
  helperText,
  leftIcon,
  rightIcon,
  className = '',
  ...props
}: InputProps) {
  const theme = useTheme()
  const { isModern, isModernDark, isDark } = theme
  
  const inputClasses = getInputClasses(theme)
  const textClasses = getTextClasses(theme, 'primary')
  const labelClasses = getTextClasses(theme, 'secondary')
  
  const iconClasses = isModern 
    ? 'text-purple-500' 
    : isModernDark
    ? 'text-purple-400'
    : isDark ? 'text-gray-400' : 'text-gray-500'
  
  const leftPadding = leftIcon ? 'pl-9 sm:pl-10' : 'pl-3'
  const rightPadding = rightIcon ? 'pr-9 sm:pr-10' : 'pr-3'
  
  return (
    <div className="w-full">
      {label && (
        <label className={`block text-sm font-medium mb-1 ${labelClasses}`}>
          {label}
        </label>
      )}
      
      <div className="relative">
        {leftIcon && (
          <div className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 ${iconClasses}`}>
            {leftIcon}
          </div>
        )}
        
        <input
          className={`${inputClasses} ${leftPadding} ${rightPadding} ${className}`}
          {...props}
        />
        
        {rightIcon && (
          <div className={`absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 ${iconClasses}`}>
            {rightIcon}
          </div>
        )}
      </div>
      
      {error && (
        <p className="mt-1 text-sm text-red-500">
          {error}
        </p>
      )}
      
      {helperText && !error && (
        <p className={`mt-1 text-sm ${getTextClasses(theme, 'muted')}`}>
          {helperText}
        </p>
      )}
    </div>
  )
}

interface SearchInputProps extends Omit<InputProps, 'leftIcon'> {
  onClear?: () => void
  showClear?: boolean
  className?: string
}

export function SearchInput({
  onClear,
  showClear = false,
  value,
  className = '',
  ...props
}: SearchInputProps) {
  const theme = useTheme()
  const { isModern, isModernDark, isDark } = theme
  
  const iconClasses = isModern 
    ? 'text-purple-500' 
    : isModernDark
    ? 'text-purple-400'
    : isDark ? 'text-gray-400' : 'text-gray-500'
  
  return (
    <Input
      leftIcon={
        <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      }
      rightIcon={showClear && value ? (
        <button
          type="button"
          onClick={onClear}
          className={`${iconClasses} hover:opacity-70 transition-opacity`}
        >
          <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      ) : undefined}
      value={value}
      className={`rounded-lg h-9 py-1 ${className}`}
      {...props}
    />
  )
}
