'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { getEntityColorStyles } from '@/utils/colorMapping'
import { getGravatarUrl } from '@/utils/gravatar'

interface UserAvatarProps {
  email?: string | null
  username?: string | null
  colorIndex?: number | null
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
  onClick?: () => void
}

const sizeClasses = {
  xs: 'w-4 h-4 text-[8px]',
  sm: 'w-10 h-10 text-sm',
  md: 'w-12 h-12 text-lg',
  lg: 'w-16 h-16 text-xl'
}

export default function UserAvatar({
  email,
  username,
  colorIndex = 0,
  size = 'md',
  className = '',
  onClick
}: UserAvatarProps) {
  const { theme } = useTheme()
  const [gravatarExists, setGravatarExists] = useState<boolean | null>(null) // null = checking, true = exists, false = doesn't exist
  const [gravatarError, setGravatarError] = useState(false)

  // Get size in pixels for Gravatar
  const gravatarSize = useMemo(() => {
    switch (size) {
      case 'xs': return 16
      case 'sm': return 40
      case 'md': return 48
      case 'lg': return 64
      default: return 48
    }
  }, [size])

  // Check if Gravatar exists for this email
  useEffect(() => {
    if (!email) {
      setGravatarExists(false)
      return
    }

    // Reset state when email changes
    setGravatarExists(null)
    setGravatarError(false)

    // Check if Gravatar image exists by trying to load it with d=404
    // If it returns 404, no image exists
    const gravatarUrl = getGravatarUrl(email, gravatarSize, '404')
    if (!gravatarUrl) {
      setGravatarExists(false)
      return
    }

    // Create an image to test if Gravatar exists
    const img = new Image()
    img.onload = () => {
      // Image loaded successfully, Gravatar exists
      setGravatarExists(true)
    }
    img.onerror = () => {
      // Image failed to load (404), Gravatar doesn't exist
      setGravatarExists(false)
    }
    img.src = gravatarUrl
  }, [email, gravatarSize])

  // Get color styles for fallback
  const colorStyles = useMemo(
    () => getEntityColorStyles(theme, colorIndex || 0),
    [theme, colorIndex]
  )

  // Get display name and initial
  const displayName = username || email || 'U'
  const initial = displayName.charAt(0).toUpperCase()

  // Get Gravatar URL if it exists
  const gravatarUrl = gravatarExists === true ? getGravatarUrl(email, gravatarSize, '404') : null

  // Show colored circle if Gravatar doesn't exist, is checking, or failed to load
  if (gravatarExists === false || gravatarError || !gravatarUrl) {
    return (
      <div
        className={`${sizeClasses[size]} rounded-full flex items-center justify-center flex-shrink-0 ${onClick ? 'cursor-pointer transition-all hover:scale-105' : ''} ${className}`}
        style={{
          background: colorStyles.background,
          color: colorStyles.textColor,
        }}
        onClick={onClick}
      >
        <span className="font-semibold" style={{ color: colorStyles.textColor }}>
          {initial}
        </span>
      </div>
    )
  }

  // Show Gravatar if it exists
  return (
    <div
      className={`${sizeClasses[size]} rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden relative ${onClick ? 'cursor-pointer transition-all hover:scale-105' : ''} ${className}`}
      style={{
        background: colorStyles.background,
      }}
      onClick={onClick}
    >
      {gravatarUrl && (
        <img
          src={gravatarUrl}
          alt={displayName}
          className="w-full h-full object-cover"
          onError={() => {
            setGravatarError(true)
            setGravatarExists(false)
          }}
        />
      )}
      {/* Fallback initial (hidden but available if image fails) */}
      <span
        className="font-semibold hidden"
        style={{
          color: colorStyles.textColor,
        }}
      >
        {initial}
      </span>
    </div>
  )
}
