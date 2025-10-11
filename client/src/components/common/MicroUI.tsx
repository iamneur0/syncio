import React from 'react'
import { useTheme } from '@/contexts/ThemeContext'

// VersionChip
export function VersionChip({ version, size = 'md', className = '' }: { version: string; size?: 'sm' | 'md'; className?: string }) {
  const padding = size === 'sm' ? 'px-1.5 py-0.5' : 'px-2 py-1'
  return (
    <span className={`inline-flex items-center rounded text-xs font-medium w-fit accent-bg accent-text ${padding} ${className}`}>
      v{version}
    </span>
  )
}

// StatPill
export function StatPill({ icon, value, label, className = '' }: { icon: React.ReactNode; value: number | string; label: string; className?: string }) {
  const { isDark } = useTheme()
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {icon}
      <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{value}</span>
      <span className={`${isDark ? 'text-gray-400' : 'text-gray-500'} text-xs`}>{label}</span>
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
  const { isDark, isMono } = useTheme()

  const trackBase = size === 'sm' ? 'h-5 w-9' : 'h-6 w-11'
  const knobBase = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'
  const knobTranslate = size === 'sm' ? (checked ? 'translate-x-4' : 'translate-x-0.5') : (checked ? 'translate-x-5' : 'translate-x-1')

  const trackColor = checked
    ? (isMono ? 'bg-white/30 border border-white/20' : (isDark ? 'bg-gray-600' : 'bg-gray-800'))
    : (isMono ? 'bg-white/15 border border-white/20' : (isDark ? 'bg-gray-700' : 'bg-gray-300'))

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onChange() }}
      disabled={disabled}
      className={`relative inline-flex items-center rounded-full transition-colors ${trackBase} ${trackColor} disabled:opacity-50 ${className}`}
      aria-pressed={checked}
      title={title}
      type="button"
    >
      <span className={`inline-block rounded-full bg-white transition-transform ${knobBase} ${knobTranslate}`} />
    </button>
  )
}



// Badge / Chip
export function Badge({ children, variant = 'default', className = '' }: { children: React.ReactNode; variant?: 'default' | 'success' | 'warning' | 'error' | 'info'; className?: string }) {
  const variantClasses = {
    default: 'accent-bg accent-text',
    success: 'bg-green-600 text-white',
    warning: 'bg-yellow-600 text-white',
    error: 'bg-red-600 text-white',
    info: 'bg-blue-600 text-white'
  } as const
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${variantClasses[variant]} ${className}`}>{children}</span>
  )
}

// Status Dot
export function StatusDot({ color = 'gray', className = '' }: { color?: 'gray' | 'green' | 'yellow' | 'red' | 'blue' | 'purple'; className?: string }) {
  const colorMap: Record<string, string> = {
    gray: 'bg-gray-400',
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
    blue: 'bg-blue-500',
    purple: 'bg-purple-500'
  }
  return <span className={`inline-block h-2 w-2 rounded-full ${colorMap[color]} ${className}`} />
}

// Divider
export function Divider({ className = '' }: { className?: string }) {
  return <div className={`border-t border-gray-200 dark:border-white/10 ${className}`} />
}

// Section Label
export function SectionLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 ${className}`}>{children}</div>
}

// MutedText
export function MutedText({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`text-sm text-gray-500 dark:text-gray-400 ${className}`}>{children}</span>
}

// Inline code
export function InlineCode({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <code className={`rounded bg-gray-100 px-1.5 py-0.5 text-[0.85em] dark:bg-white/10 ${className}`}>{children}</code>
}

// Keyboard key
export function Kbd({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <kbd className={`rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 text-[0.85em] shadow-sm dark:border-white/20 dark:bg-white/10 ${className}`}>{children}</kbd>
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
      className={`inline-flex h-8 w-8 items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-white/10 disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  )
}

// Spinner (micro)
export function Spinner({ size = 4, className = '' }: { size?: 3 | 4 | 5 | 6; className?: string }) {
  const sizeMap: Record<number, string> = { 3: 'h-3 w-3', 4: 'h-4 w-4', 5: 'h-5 w-5', 6: 'h-6 w-6' }
  return <span className={`inline-block animate-spin rounded-full border-2 border-gray-300 border-t-transparent ${sizeMap[size]} ${className}`} />
}

// CountBubble
export function CountBubble({ value, className = '' }: { value: number | string; className?: string }) {
  return <span className={`ml-1 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-gray-200 px-1.5 text-xs font-medium leading-5 dark:bg-white/10 ${className}`}>{value}</span>
}

// LabelValue pair
export function LabelValue({ label, value, className = '' }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}:</span>
      <span className="text-sm">{value}</span>
    </div>
  )
}

// EmptyHint (lighter than EmptyState)
export function EmptyHint({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`text-sm text-gray-500 dark:text-gray-400 ${className}`}>{children}</div>
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
  const { isDark, isMono } = useTheme()
  
  const baseClasses = 'flex items-center justify-center px-3 py-2 text-sm font-medium transition-colors duration-200'
  
  const activeClasses = isMono
    ? '!bg-white/10 text-white'
    : isDark
    ? 'bg-gray-700 text-white'
    : 'bg-gray-100 text-gray-900'
  
  const inactiveClasses = isMono
    ? 'text-white/70 hover:text-white hover:bg-white/5'
    : isDark
    ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-700'
    : 'text-gray-600 hover:text-gray-700 hover:bg-gray-50'
  
  const stateClasses = isActive ? activeClasses : inactiveClasses
  
  return (
    <button
      className={`${baseClasses} ${stateClasses} ${className}`}
      onClick={onClick}
      title={title}
    >
      {isActive ? activeIcon : inactiveIcon}
      {children}
    </button>
  )
}

