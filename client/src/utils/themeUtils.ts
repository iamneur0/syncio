import { ThemeContextType, Theme } from '@/contexts/ThemeContext'

export type ThemeVariant = 'light' | 'dark' | 'mono'

const DARK_THEMES: Theme[] = ['dark', 'modern-dark', 'aubergine', 'aurora', 'choco-mint', 'ochin', 'work-hard']

export function getThemeVariant(theme: ThemeContextType): ThemeVariant {
  if (theme.theme === 'mono') return 'mono'
  if (DARK_THEMES.includes(theme.theme)) return 'dark'
  return 'light'
}

// Card styling utilities
export function getCardClasses(theme: ThemeContextType, isSelected = false, isDisabled = false) {
  const baseClasses = 'card'
  const selectedClasses = isSelected ? 'selection-ring' : ''
  const disabledClasses = isDisabled ? 'opacity-50' : ''

  return [baseClasses, selectedClasses, disabledClasses].filter(Boolean).join(' ').trim()
}

// List item styling utilities
export function getListItemClasses(theme: ThemeContextType, isSelected = false, isDisabled = false) {
  const baseClasses = 'card cursor-pointer'
  const selectedClasses = isSelected ? 'selection-ring' : ''
  const disabledClasses = isDisabled ? 'opacity-50' : ''

  return [baseClasses, selectedClasses, disabledClasses].filter(Boolean).join(' ').trim()
}

// Card grid styling utilities
export function getCardGridClasses(theme: ThemeContextType, isSelected = false, isDisabled = false) {
  const baseClasses = 'card flex flex-col h-full cursor-pointer'
  const selectedClasses = isSelected ? 'selection-ring' : ''
  const disabledClasses = isDisabled ? 'opacity-50' : ''

  return [baseClasses, selectedClasses, disabledClasses].filter(Boolean).join(' ').trim()
}

// Text color utilities
export function getTextClasses(theme: ThemeContextType, variant: 'primary' | 'secondary' | 'accent' | 'muted' = 'primary') {
  if (variant === 'primary') return 'color-text'
  return 'color-text-secondary'
}

// Background utilities
export function getBackgroundClasses(theme: ThemeContextType, variant: 'page' | 'card' | 'modal' = 'page') {
  switch (variant) {
    case 'page':
      return 'color-background'
    case 'card':
    case 'modal':
    default:
      return 'color-surface'
  }
}

// Button utilities
export function getButtonClasses(theme: ThemeContextType, variant: 'primary' | 'secondary' | 'danger' | 'icon' = 'primary') {
  return 'btn'
}

// Input utilities
export function getInputClasses(theme: ThemeContextType, hasError = false) {
  return 'input'
}

// Toggle button utilities
export function getToggleClasses(theme: ThemeContextType, isActive: boolean) {
  return isActive ? 'color-text' : 'color-text-secondary'
}

// Version tag utilities
export function getVersionTagClasses(theme: ThemeContextType) {
  return 'badge'
}

// Icon container utilities
export function getIconContainerClasses(theme: ThemeContextType, size: 'sm' | 'md' | 'lg' = 'md') {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12'
  }

  return `${sizeClasses[size]} rounded-lg flex items-center justify-center color-surface color-border`
}