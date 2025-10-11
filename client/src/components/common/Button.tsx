'use client'

import React from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { getButtonClasses, getTextClasses } from '@/utils/themeUtils'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode
  variant?: 'primary' | 'secondary' | 'icon' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
  className?: string
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const theme = useTheme()
  
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base'
  }
  
  const iconSizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-9 h-9 sm:w-10 sm:h-10',
    lg: 'w-10 h-10 sm:w-12 sm:h-12'
  }
  
  const baseClasses = variant === 'icon' 
    ? iconSizeClasses[size]
    : sizeClasses[size]
  
  let variantClasses = ''
  if (variant === 'danger') {
    variantClasses = 'bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed'
  } else {
    variantClasses = getButtonClasses(theme, variant)
  }
  
  const loadingClasses = isLoading ? 'opacity-50 cursor-not-allowed' : ''
  const disabledClasses = disabled ? 'opacity-40 cursor-not-allowed' : ''
  
  return (
    <button
      className={`${baseClasses} ${variantClasses} ${loadingClasses} ${disabledClasses} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
        </div>
      ) : (
        children
      )}
    </button>
  )
}

interface IconButtonProps extends Omit<ButtonProps, 'children'> {
  icon: React.ReactNode
  title?: string
}

export function IconButton({
  icon,
  title,
  variant = 'icon',
  size = 'md',
  ...props
}: IconButtonProps) {
  return (
    <Button
      variant={variant}
      size={size}
      title={title}
      {...props}
    >
      {icon}
    </Button>
  )
}

interface ToggleButtonProps extends Omit<ButtonProps, 'children'> {
  isActive: boolean
  activeIcon?: React.ReactNode
  inactiveIcon?: React.ReactNode
  children?: React.ReactNode
}

export function ToggleButton({
  isActive,
  activeIcon,
  inactiveIcon,
  children,
  variant = 'secondary',
  size = 'md',
  className = '',
  ...props
}: ToggleButtonProps) {
  const theme = useTheme()
  const { isMono, isModern, isModernDark, isDark } = theme
  
  const activeClasses = isMono
    ? '!bg-white/10 text-white'
    : isModern
    ? 'bg-gray-100 text-gray-900'
    : isModernDark
    ? 'bg-gray-700 text-white'
    : isDark
    ? 'bg-gray-700 text-white'
    : 'bg-gray-100 text-gray-900'
  
  const inactiveClasses = isMono
    ? 'text-white/70 hover:text-white hover:bg-white/5'
    : isModern
    ? 'text-purple-600 hover:text-purple-700 hover:bg-purple-50'
    : isModernDark
    ? 'text-purple-300 hover:text-purple-200 hover:bg-purple-800/30'
    : isDark
    ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-700'
    : 'text-gray-600 hover:text-gray-700 hover:bg-gray-50'
  
  const stateClasses = isActive ? activeClasses : inactiveClasses
  
  return (
    <Button
      variant={variant}
      size={size}
      className={`${stateClasses} ${className}`}
      {...props}
    >
      {isActive ? activeIcon : inactiveIcon}
      {children}
    </Button>
  )
}
