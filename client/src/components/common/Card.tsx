'use client'

import React from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { getCardClasses, getButtonClasses, getTextClasses } from '@/utils/themeUtils'

interface CardProps {
  children: React.ReactNode
  isSelected?: boolean
  onClick?: () => void
  className?: string
  disabled?: boolean
}

export default function Card({ 
  children, 
  isSelected = false, 
  onClick, 
  className = '', 
  disabled = false 
}: CardProps) {
  const theme = useTheme()
  
  const cardClasses = getCardClasses(theme, isSelected)
  const clickableClasses = onClick && !disabled ? 'cursor-pointer' : ''
  const disabledClasses = disabled ? 'opacity-50 cursor-not-allowed' : ''
  
  return (
    <div 
      className={`${cardClasses} ${clickableClasses} ${disabledClasses} ${className}`}
      onClick={disabled ? undefined : onClick}
    >
      {children}
    </div>
  )
}

interface CardHeaderProps {
  children: React.ReactNode
  className?: string
}

export function CardHeader({ children, className = '' }: CardHeaderProps) {
  return (
    <div className={`p-4 sm:p-6 ${className}`}>
      {children}
    </div>
  )
}

interface CardContentProps {
  children: React.ReactNode
  className?: string
}

export function CardContent({ children, className = '' }: CardContentProps) {
  return (
    <div className={`p-4 sm:p-6 pt-0 ${className}`}>
      {children}
    </div>
  )
}

interface CardTitleProps {
  children: React.ReactNode
  className?: string
  variant?: 'primary' | 'secondary' | 'tertiary'
}

export function CardTitle({ 
  children, 
  className = '', 
  variant = 'primary' 
}: CardTitleProps) {
  const theme = useTheme()
  const textClasses = getTextClasses(theme, variant)
  
  return (
    <h3 className={`font-semibold text-lg ${textClasses} ${className}`}>
      {children}
    </h3>
  )
}

interface CardDescriptionProps {
  children: React.ReactNode
  className?: string
  variant?: 'primary' | 'secondary' | 'tertiary'
}

export function CardDescription({ 
  children, 
  className = '', 
  variant = 'secondary' 
}: CardDescriptionProps) {
  const theme = useTheme()
  const textClasses = getTextClasses(theme, variant)
  
  return (
    <p className={`text-sm ${textClasses} ${className}`}>
      {children}
    </p>
  )
}

interface CardActionsProps {
  children: React.ReactNode
  className?: string
}

export function CardActions({ children, className = '' }: CardActionsProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {children}
    </div>
  )
}

interface CardIconProps {
  children: React.ReactNode
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export function CardIcon({ 
  children, 
  className = '', 
  size = 'md' 
}: CardIconProps) {
  const theme = useTheme()
  const { isMono } = theme
  
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10 sm:w-12 sm:h-12',
    lg: 'w-12 h-12 sm:w-16 sm:h-16'
  }
  
  const iconClasses = isMono 
    ? 'bg-black border border-white/20 text-white' 
    : 'bg-gradient-to-br from-purple-500 to-blue-500 text-white'
  
  return (
    <div className={`${sizeClasses[size]} rounded-lg flex items-center justify-center flex-shrink-0 ${iconClasses} ${className}`}>
      {children}
    </div>
  )
}
