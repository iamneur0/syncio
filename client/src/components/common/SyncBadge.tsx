'use client'

import React from 'react'
import { useTheme } from '@/contexts/ThemeContext'

interface SyncBadgeProps {
  status: 'synced' | 'unsynced' | 'stale' | 'connect' | 'syncing' | 'checking'
  isClickable?: boolean
  onClick?: () => void
  title?: string
  isListMode?: boolean
}

export default function SyncBadge({ 
  status, 
  isClickable = false, 
  onClick, 
  title,
  isListMode = false
}: SyncBadgeProps) {
  const { isDark } = useTheme()

  const getStatusConfig = () => {
    switch (status) {
      case 'synced':
        return {
          text: 'Synced',
          dotColor: 'bg-green-500',
          bgColor: isDark ? 'bg-green-900 text-green-300' : 'bg-green-100 text-green-800'
        }
      case 'unsynced':
        return {
          text: 'Unsynced',
          dotColor: 'bg-red-500',
          bgColor: isDark ? 'bg-red-900 text-red-300' : 'bg-red-100 text-red-800'
        }
      case 'stale':
        return {
          text: 'Stale',
          dotColor: 'bg-gray-400',
          bgColor: isDark ? 'bg-gray-700 text-gray-100' : 'bg-gray-600 text-gray-100'
        }
      case 'connect':
        return {
          text: 'Connect Stremio',
          dotColor: 'bg-stremio-purple',
          bgColor: isDark ? 'bg-stremio-purple text-white' : 'bg-stremio-purple text-white'
        }
      case 'syncing':
        return {
          text: 'Syncing',
          dotColor: 'bg-red-500',
          bgColor: isDark ? 'bg-red-800 text-red-200' : 'bg-red-100 text-red-800'
        }
      case 'checking':
        return {
          text: 'Checking',
          dotColor: 'bg-gray-400',
          bgColor: isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-600'
        }
      default:
        return {
          text: 'Unknown',
          dotColor: 'bg-gray-400',
          bgColor: isDark ? 'bg-gray-700 text-gray-100' : 'bg-gray-600 text-gray-100'
        }
    }
  }

  const config = getStatusConfig()
  const isSpinning = status === 'syncing' || status === 'checking'

  if (isListMode) {
    // Circular mode - same proportions as pill but circular
    const content = (
      <div 
        className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${config.bgColor} ${isClickable ? 'cursor-pointer hover:opacity-80 transition-opacity' : 'cursor-default'}`}
        title={title}
      >
        <div className={`w-2 h-2 rounded-full ${config.dotColor} ${isSpinning ? 'animate-spin' : ''}`} />
      </div>
    )

    if (isClickable && onClick) {
      return (
        <button onClick={onClick} className="focus:outline-none">
          {content}
        </button>
      )
    }

    return content
  }

  // Regular pill mode
  const baseClasses = `inline-flex items-center px-2 py-1 text-xs font-medium ${config.bgColor}`
  const clickableClasses = isClickable ? 'cursor-pointer hover:opacity-80 transition-opacity' : 'cursor-default'

  const content = (
    <div 
      className={`${baseClasses} ${clickableClasses}`}
      style={{ 
        borderRadius: '9999px',
        display: 'inline-flex',
        alignItems: 'center',
        paddingLeft: '8px',
        paddingRight: '8px',
        paddingTop: '4px',
        paddingBottom: '4px'
      }}
      title={title}
    >
      <div className={`w-2 h-2 rounded-full mr-1 ${config.dotColor} ${isSpinning ? 'animate-spin' : ''}`} />
      {config.text}
    </div>
  )

  if (isClickable && onClick) {
    return (
      <button onClick={onClick} className="focus:outline-none">
        {content}
      </button>
    )
  }

  return content
}
