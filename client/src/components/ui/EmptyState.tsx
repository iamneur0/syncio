import React from 'react'

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
  const getIconColor = () => {
    return 'color-text-secondary'
  }
  
  return (
    <div className={`text-center py-12 px-4 ${className}`}>
      <div className={`mx-auto w-16 h-16 mb-4 ${getIconColor()}`}>
        {icon}
      </div>
      
      <h3 className={`text-lg font-medium mb-2`}>
        {title}
      </h3>
      
      <p className={`text-sm mb-6 max-w-sm mx-auto`}>
        {description}
      </p>
      
      {action && (
        <button
          onClick={action.onClick}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors color-surface hover:opacity-90`}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
