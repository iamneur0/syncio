import React, { CSSProperties } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { getEntityColorStyles } from '@/utils/colorMapping'

type Size = '10' | '12'

interface AddonIconProps {
  name: string
  iconUrl?: string | null
  size?: Size
  className?: string
  colorIndex?: number
}

export default function AddonIcon({
  name,
  iconUrl,
  size = '12',
  className = '',
  colorIndex = 1,
}: AddonIconProps) {
  const circleClass = size === '10' ? 'logo-circle-10' : 'logo-circle-12'
  const letter = name ? name.charAt(0).toUpperCase() : 'A'
  const showImage = Boolean(iconUrl)
  const { theme } = useTheme()
  const colorStyles = getEntityColorStyles(theme, colorIndex)

  const baseStyle: CSSProperties = {
    background: colorStyles.background,
    color: colorStyles.textColor,
  }

  return (
    <div
      className={`${circleClass} flex items-center justify-center ${className}`}
      style={baseStyle}
    >
      {showImage ? (
        <img
          src={iconUrl as string}
          alt={name}
          className="logo-img"
          onError={(e) => {
            const target = e.currentTarget as HTMLImageElement
            target.style.display = 'none'
            const nextElement = target.nextElementSibling as HTMLElement | null
            if (nextElement) nextElement.style.display = 'flex'
          }}
        />
      ) : null}
      <span
        className={`font-semibold ${size === '10' ? 'text-sm' : 'text-lg'} items-center justify-center w-full h-full`}
        style={{ display: showImage ? 'none' : 'flex', color: colorStyles.textColor }}
      >
        {letter}
      </span>
    </div>
  )
}
