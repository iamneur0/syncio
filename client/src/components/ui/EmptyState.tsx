import React from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { getTextClasses, getButtonClasses } from '@/utils/themeUtils'

interface EmptyStateProps {
  icon: React.ReactNode
  title: string
  description: string
  action?: {
    label: string
    onClick: () => void
  }
  className?: string
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
  className = ''
}: EmptyStateProps) {
  const theme = useTheme()
  const { isDark, isMono } = theme
  
  const getIconColor = () => {
    if (isMono) return 'text-white/40'
    if (isDark) return 'text-gray-500'
    return 'text-gray-400'
  }
  
  return (
    <div className={`text-center py-12 px-4 ${className}`}>
      <div className={`mx-auto w-16 h-16 mb-4 ${getIconColor()}`}>
        {icon}
      </div>
      
      <h3 className={`text-lg font-medium mb-2 ${getTextClasses(theme, 'primary')}`}>
        {title}
      </h3>
      
      <p className={`text-sm mb-6 max-w-sm mx-auto ${getTextClasses(theme, 'secondary')}`}>
        {description}
      </p>
      
      {action && (
        <button
          onClick={action.onClick}
          className={`
            px-4 py-2 rounded-lg text-sm font-medium transition-colors
            ${getButtonClasses(theme, 'primary')}
          `}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
