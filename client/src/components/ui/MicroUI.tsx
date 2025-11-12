import React, { useMemo } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { getEntityColorStyles } from '@/utils/colorMapping'

// VersionChip
export function VersionChip({ version, size = 'md', className = '' }: { version: string; size?: 'sm' | 'md'; className?: string }) {
  const padding = size === 'sm' ? 'px-1.5 py-0.5' : 'px-2 py-1'
  const { theme } = useTheme()
  const accentStyles = useMemo(() => getEntityColorStyles(theme, 1), [theme])

  return (
    <span
      className={`inline-flex items-center rounded text-xs font-medium w-fit ${padding} ${className}`}
      style={{
        background: accentStyles.accentHex,
        color: accentStyles.textColor,
      }}
    >
      v{version}
    </span>
  )
}

// StatPill
export function StatPill({ icon, value, label, className = '' }: { icon: React.ReactNode; value: number | string; label: string; className?: string }) {
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {icon}
      <span className={`font-medium color-text`}>{value}</span>
      <span className={`color-text-secondary text-xs`}>{label}</span>
    </div>
  )
}

// ToggleSwitch
export function ToggleSwitch({
  checked,
  onChange,
  size = 'md',
  title,
  disabled = false,
  className = ''
}: {
  checked: boolean
  onChange: () => void
  size?: 'sm' | 'md'
  title?: string
  disabled?: boolean
  className?: string
}) {
  const trackBase = size === 'sm' ? 'h-5 w-9' : 'h-6 w-11'
  const knobBase = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'
  const knobTranslate = size === 'sm' ? (checked ? 'translate-x-4' : 'translate-x-0.5') : (checked ? 'translate-x-5' : 'translate-x-1')

  const trackColor = checked ? 'toggle-track-on' : 'toggle-track-off'
  const knobColor = checked ? 'toggle-knob-on' : 'toggle-knob-off'

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onChange() }}
      disabled={disabled}
      className={`relative inline-flex items-center rounded-full transition-colors ${trackBase} ${trackColor} disabled:opacity-50 ${className}`}
      aria-pressed={checked}
      title={title}
      type="button"
    >
      <span className={`inline-block rounded-full transition-transform ${knobBase} ${knobTranslate} ${knobColor}`} />
    </button>
  )
}



// Badge / Chip
export function Badge({ children, variant = 'default', className = '' }: { children: React.ReactNode; variant?: 'default' | 'success' | 'warning' | 'error' | 'info'; className?: string }) {
  const base = 'color-surface color-text-secondary'
  const variantClasses: Record<string, string> = {
    default: base,
    success: base,
    warning: base,
    error: base,
    info: base
  }
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${variantClasses[variant]} ${className}`}>{children}</span>
  )
}

// Status Dot
export function StatusDot({ color = 'gray', className = '' }: { color?: 'gray' | 'green' | 'yellow' | 'red' | 'blue' | 'purple'; className?: string }) {
  const mixes: Record<string, string> = {
    gray: 'color-mix(in srgb, var(--color-text-secondary) 35%, var(--color-surface))',
    green: 'color-mix(in srgb, var(--color-text) 35%, var(--color-surface))',
    yellow: 'color-mix(in srgb, var(--color-text) 20%, var(--color-surface))',
    red: 'color-mix(in srgb, var(--color-text) 45%, var(--color-surface))',
    blue: 'color-mix(in srgb, var(--color-text) 30%, var(--color-surface))',
    purple: 'color-mix(in srgb, var(--color-text-secondary) 45%, var(--color-surface))'
  }
  const background = mixes[color] || mixes.gray
  return <span className={`inline-block h-2 w-2 rounded-full ${className}`} style={{ backgroundColor: background }} />
}

// Divider
export function Divider({ className = '' }: { className?: string }) {
  return <div className={`border-t color-border ${className}`} />
}

// Section Label
export function SectionLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`text-xs uppercase tracking-wide color-text-secondary ${className}`}>{children}</div>
}

// MutedText
export function MutedText({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`text-sm color-text-secondary ${className}`}>{children}</span>
}

// Inline code
export function InlineCode({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <code className={`rounded color-surface px-1.5 py-0.5 text-[0.85em] ${className}`}>{children}</code>
}

// Keyboard key
export function Kbd({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <kbd className={`rounded border color-border color-surface px-1.5 py-0.5 text-[0.85em] shadow-sm ${className}`}>{children}</kbd>
}

// TruncateText (single-line)
export function TruncateText({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`block truncate ${className}`}>{children}</span>
}

// IconButton (micro)
export function IconButton({ onClick, title, disabled = false, className = '', children }: { onClick: (e: React.MouseEvent) => void; title?: string; disabled?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onClick(e) }}
      className={`inline-flex h-8 w-8 items-center justify-center rounded border-0 outline-none focus:outline-none focus:ring-0 disabled:opacity-50 color-text-secondary color-hover ${className}`}
    >
      {children}
    </button>
  )
}

// Spinner (micro)
export function Spinner({ size = 4, className = '' }: { size?: 3 | 4 | 5 | 6; className?: string }) {
  const sizeMap: Record<number, string> = { 3: 'h-3 w-3', 4: 'h-4 w-4', 5: 'h-5 w-5', 6: 'h-6 w-6' }
  return <span className={`inline-block animate-spin rounded-full border-2 color-border border-t-transparent ${sizeMap[size]} ${className}`} />
}

// CountBubble
export function CountBubble({ value, className = '' }: { value: number | string; className?: string }) {
  return <span className={`ml-1 inline-flex min-w-[1.25rem] items-center justify-center rounded-full color-surface px-1.5 text-xs font-medium leading-5 ${className}`}>{value}</span>
}

// LabelValue pair
export function LabelValue({ label, value, className = '' }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-xs color-text-secondary">{label}:</span>
      <span className="text-sm">{value}</span>
    </div>
  )
}

// EmptyHint (lighter than EmptyState)
export function EmptyHint({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`text-sm color-text-secondary ${className}`}>{children}</div>
}

// ToggleButton
export function ToggleButton({
  isActive,
  onClick,
  activeIcon,
  inactiveIcon,
  children,
  className = '',
  title
}: {
  isActive: boolean
  onClick: () => void
  activeIcon?: React.ReactNode
  inactiveIcon?: React.ReactNode
  children?: React.ReactNode
  className?: string
  title?: string
}) {
  const baseClasses = 'flex items-center justify-center px-3 py-2 text-sm font-medium transition-colors'
  const activeClasses = 'surface-interactive is-active shadow-sm'
  const inactiveClasses = 'color-text-secondary opacity-60 hover:opacity-90'
  const dynamicStyle = isActive
    ? {
        backgroundColor: 'var(--color-surface)',
        color: 'var(--color-text)',
      }
    : undefined
  
  return (
    <button
      type="button"
      className={`${baseClasses} ${className} ${isActive ? activeClasses : inactiveClasses}`}
      onClick={onClick}
      aria-pressed={isActive}
      title={title}
      style={dynamicStyle}
    >
      {isActive ? activeIcon : inactiveIcon}
      {children}
    </button>
  )
}

