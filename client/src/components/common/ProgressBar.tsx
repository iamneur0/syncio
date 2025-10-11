import React from 'react'
import { useTheme } from '@/contexts/ThemeContext'

interface ProgressBarProps {
  progress: number // 0-100
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'success' | 'warning' | 'error'
  showPercentage?: boolean
  animated?: boolean
  className?: string
}

export default function ProgressBar({
  progress,
  size = 'md',
  variant = 'default',
  showPercentage = false,
  animated = false,
  className = ''
}: ProgressBarProps) {
  const theme = useTheme()
  const { isDark, isMono } = theme
  
  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return 'h-1'
      case 'md':
        return 'h-2'
      case 'lg':
        return 'h-3'
      default:
        return 'h-2'
    }
  }
  
  const getVariantClasses = () => {
    switch (variant) {
      case 'success':
        return 'bg-green-500'
      case 'warning':
        return 'bg-yellow-500'
      case 'error':
        return 'bg-red-500'
      default:
        return isMono 
          ? 'bg-white' 
          : isDark 
          ? 'bg-blue-500' 
          : 'bg-blue-600'
    }
  }
  
  const getBackgroundClasses = () => {
    if (isMono) return 'bg-white/20'
    if (isDark) return 'bg-gray-700'
    return 'bg-gray-200'
  }
  
  const getTextColor = () => {
    if (isMono) return 'text-white'
    if (isDark) return 'text-gray-300'
    return 'text-gray-600'
  }
  
  const clampedProgress = Math.min(Math.max(progress, 0), 100)
  
  return (
    <div className={`w-full ${className}`}>
      <div className="flex items-center justify-between mb-1">
        <span className={`text-xs font-medium ${getTextColor()}`}>
          Progress
        </span>
        {showPercentage && (
          <span className={`text-xs font-medium ${getTextColor()}`}>
            {Math.round(clampedProgress)}%
          </span>
        )}
      </div>
      
      <div className={`w-full rounded-full overflow-hidden ${getBackgroundClasses()} ${getSizeClasses()}`}>
        <div
          className={`
            h-full transition-all duration-300 ease-out
            ${getVariantClasses()}
            ${animated ? 'animate-pulse' : ''}
          `}
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
    </div>
  )
}
