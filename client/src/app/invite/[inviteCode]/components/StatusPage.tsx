'use client'

import React from 'react'
import { LucideIcon } from 'lucide-react'

interface StatusPageProps {
  icon: LucideIcon
  iconColor?: string
  title: string
  borderColor?: string
  children: React.ReactNode
  headerContent?: React.ReactNode
  footerContent?: React.ReactNode
}

export function StatusPage({ 
  icon: Icon, 
  iconColor = 'var(--color-text)', 
  title, 
  borderColor = 'var(--color-border)',
  children,
  headerContent,
  footerContent
}: StatusPageProps) {
  const iconStyle = iconColor.startsWith('#') || iconColor.startsWith('var(') 
    ? { color: iconColor } 
    : undefined
  const iconClassName = iconColor.startsWith('#') || iconColor.startsWith('var(')
    ? 'w-16 h-16 mx-auto mb-4'
    : `w-16 h-16 mx-auto mb-4 ${iconColor}`

  const borderClassName = borderColor.startsWith('#') || borderColor.startsWith('var(')
    ? 'p-4 rounded-lg border'
    : `p-4 rounded-lg border ${borderColor}`
  const borderStyle = borderColor.startsWith('#') || borderColor.startsWith('var(')
    ? { borderColor }
    : undefined

  return (
    <>
      <div className="text-center mb-8">
        <Icon className={iconClassName} style={iconStyle} />
        <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--color-text)' }}>
          {title}
        </h1>
      </div>

      <div className={borderClassName} style={borderStyle}>
        {headerContent}
        {children}
        {footerContent}
      </div>
    </>
  )
}

