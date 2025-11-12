import React from 'react'

interface LoadingSkeletonProps {
  type?: 'card' | 'list' | 'text' | 'avatar' | 'button'
  className?: string
  lines?: number
}

export default function LoadingSkeleton({ 
  type = 'card', 
  className = '', 
  lines = 1 
}: LoadingSkeletonProps) {
  const baseClasses = 'animate-pulse'
  const bgClasses = 'color-surface'
  
  const renderSkeleton = () => {
    switch (type) {
      case 'card':
        return (
          <div className={`rounded-lg border p-6 card ${className}`}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg ${bgClasses}`} />
                <div className="space-y-2">
                  <div className={`h-4 w-32 rounded ${bgClasses}`} />
                  <div className={`h-3 w-48 rounded ${bgClasses}`} />
                </div>
              </div>
              <div className={`h-6 w-16 rounded ${bgClasses}`} />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <div className={`h-5 w-12 rounded ${bgClasses}`} />
                <div className={`h-5 w-16 rounded ${bgClasses}`} />
              </div>
              <div className="flex gap-1">
                <div className={`w-8 h-8 rounded ${bgClasses}`} />
                <div className={`w-8 h-8 rounded ${bgClasses}`} />
              </div>
            </div>
          </div>
        )
      
      case 'list':
        return (
          <div className={`rounded-lg border p-4 card ${className}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-8 h-8 rounded ${bgClasses}`} />
                <div className="space-y-2">
                  <div className={`h-4 w-32 rounded ${bgClasses}`} />
                  <div className={`h-3 w-48 rounded ${bgClasses}`} />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex gap-2">
                  <div className={`h-5 w-12 rounded ${bgClasses}`} />
                  <div className={`h-5 w-16 rounded ${bgClasses}`} />
                </div>
                <div className={`h-6 w-16 rounded ${bgClasses}`} />
                <div className="flex gap-1">
                  <div className={`w-8 h-8 rounded ${bgClasses}`} />
                  <div className={`w-8 h-8 rounded ${bgClasses}`} />
                </div>
              </div>
            </div>
          </div>
        )
      
      case 'text':
        return (
          <div className={`space-y-2 ${className}`}>
            {Array.from({ length: lines }).map((_, i) => (
              <div
                key={i}
                className={`h-4 rounded ${bgClasses} ${
                  i === lines - 1 ? 'w-3/4' : 'w-full'
                }`}
              />
            ))}
          </div>
        )
      
      case 'avatar':
        return (
          <div className={`w-10 h-10 rounded-lg ${bgClasses} ${className}`} />
        )
      
      case 'button':
        return (
          <div className={`h-10 w-24 rounded ${bgClasses} ${className}`} />
        )
      
      default:
        return (
          <div className={`h-4 w-full rounded ${bgClasses} ${className}`} />
        )
    }
  }
  
  return (
    <div className={baseClasses}>
      {renderSkeleton()}
    </div>
  )
}
