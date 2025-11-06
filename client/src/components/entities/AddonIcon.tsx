import React from 'react'
import { useTheme } from '@/contexts/ThemeContext'

type Size = '10' | '12'

export default function AddonIcon({
  name,
  iconUrl,
  size = '12',
  className = ''
}: {
  name: string
  iconUrl?: string | null
  size?: Size
  className?: string
}) {
  const { isDark, isMono, isModern, isModernDark } = useTheme()

  const circleClass = size === '10' ? 'logo-circle-10' : 'logo-circle-12'

  const showImage = !!iconUrl

  const baseClass = showImage
    ? `border-0 ${(!isDark && !isMono && !isModern && !isModernDark) ? 'accent-bg' : ''}`
    : 'accent-bg accent-text border accent-border'

  const bgStyle: React.CSSProperties | undefined = showImage && (isDark || isMono || isModern || isModernDark)
    ? { backgroundColor: 'transparent' }
    : undefined

  return (
    <div className={`${circleClass} ${baseClass} ${className}`} style={bgStyle}>
      {showImage ? (
        <img
          src={iconUrl as string}
          alt={name}
          className="logo-img"
          onError={(e) => {
            const target = e.currentTarget as HTMLImageElement
            target.style.display = 'none'
            const nextElement = target.nextElementSibling as HTMLElement
            if (nextElement) nextElement.style.display = 'block'
          }}
        />
      ) : null}
      <span className={`text-white font-semibold ${size === '10' ? 'text-sm' : 'text-lg'} ${showImage ? 'hidden' : ''}`}>
        {name ? name.charAt(0).toUpperCase() : 'A'}
      </span>
    </div>
  )
}


