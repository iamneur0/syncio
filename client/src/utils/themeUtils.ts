import { ThemeContextType } from '@/contexts/ThemeContext'

export type ThemeVariant = 'light' | 'dark' | 'modern' | 'modern-dark' | 'mono'

export function getThemeVariant(theme: ThemeContextType): ThemeVariant {
  const { isDark, isModern, isModernDark, isMono } = theme
  
  if (isMono) return 'mono'
  if (isModernDark) return 'modern-dark'
  if (isModern) return 'modern'
  if (isDark) return 'dark'
  return 'light'
}

// Card styling utilities
export function getCardClasses(theme: ThemeContextType, isSelected = false, isDisabled = false) {
  const variant = getThemeVariant(theme)
  const { isMono } = theme
  
  const baseClasses = 'rounded-lg border transition-shadow'
  const selectedClasses = isSelected 
    ? (isMono ? 'ring-2 ring-white/50 border-white/40' : 'ring-2 ring-gray-400 border-gray-400')
    : ''
  const disabledClasses = isDisabled ? 'opacity-50' : ''
  
  const themeClasses = {
    light: 'bg-white border-gray-200 hover:shadow-md',
    dark: 'bg-gray-800 border-gray-700 hover:shadow-md',
    modern: 'bg-gradient-to-r from-purple-50/90 to-blue-50/90 border-purple-200/50 shadow-md shadow-purple-100/20 hover:shadow-md',
    'modern-dark': 'bg-gradient-to-r from-purple-800/40 to-blue-800/40 border-purple-600/50 shadow-md shadow-purple-900/20 hover:shadow-md',
    mono: 'bg-black border-white/20 shadow-none'
  }
  
  return `${baseClasses} ${themeClasses[variant]} ${selectedClasses} ${disabledClasses}`.trim()
}

// List item styling utilities
export function getListItemClasses(theme: ThemeContextType, isSelected = false, isDisabled = false) {
  const variant = getThemeVariant(theme)
  const { isMono } = theme
  
  const baseClasses = 'rounded-lg border p-4 hover:shadow-md transition-shadow cursor-pointer relative group'
  const selectedClasses = isSelected 
    ? (isMono ? 'ring-2 ring-white/50 border-white/40' : 'ring-2 ring-gray-400 border-gray-400')
    : ''
  const disabledClasses = isDisabled ? 'opacity-50' : ''
  
  const themeClasses = {
    light: 'bg-white border-gray-200',
    dark: 'bg-gray-800 border-gray-700',
    modern: 'bg-gradient-to-r from-purple-50/90 to-blue-50/90 border-purple-200/50 shadow-md shadow-purple-100/20',
    'modern-dark': 'bg-gradient-to-r from-purple-800/40 to-blue-800/40 border-purple-600/50 shadow-md shadow-purple-900/20',
    mono: 'bg-black border-white/20 shadow-none'
  }
  
  return `${baseClasses} ${themeClasses[variant]} ${selectedClasses} ${disabledClasses}`.trim()
}

// Card grid styling utilities
export function getCardGridClasses(theme: ThemeContextType, isSelected = false, isDisabled = false) {
  const variant = getThemeVariant(theme)
  const { isMono } = theme
  
  const baseClasses = 'rounded-lg shadow-sm border p-6 hover:shadow-md transition-shadow flex flex-col h-full relative group cursor-pointer'
  const selectedClasses = isSelected 
    ? (isMono ? 'ring-2 ring-white/50 border-white/40' : 'ring-2 ring-gray-400 border-gray-400')
    : ''
  const disabledClasses = isDisabled ? 'opacity-50' : ''
  
  const themeClasses = {
    light: 'bg-white border-gray-200',
    dark: 'bg-gray-800 border-gray-700',
    modern: 'bg-gradient-to-br from-purple-50/90 to-blue-50/90 backdrop-blur-sm border-purple-200/60',
    'modern-dark': 'bg-gradient-to-br from-purple-800/40 to-blue-800/40 backdrop-blur-sm border-purple-600/50',
    mono: 'bg-black border-white/20 shadow-none'
  }
  
  return `${baseClasses} ${themeClasses[variant]} ${selectedClasses} ${disabledClasses}`.trim()
}

// Text color utilities
export function getTextClasses(theme: ThemeContextType, variant: 'primary' | 'secondary' | 'accent' | 'muted' = 'primary') {
  const themeVariant = getThemeVariant(theme)
  const { isMono } = theme
  
  const colorMap = {
    primary: {
      light: 'text-gray-900',
      dark: 'text-white',
      modern: 'text-purple-800',
      'modern-dark': 'text-purple-100',
      mono: 'text-white'
    },
    secondary: {
      light: 'text-gray-600',
      dark: 'text-gray-400',
      modern: 'text-purple-600',
      'modern-dark': 'text-purple-300',
      mono: 'text-gray-300'
    },
    accent: {
      light: 'text-gray-500',
      dark: 'text-gray-400',
      modern: 'text-purple-500',
      'modern-dark': 'text-purple-400',
      mono: 'text-gray-400'
    },
    muted: {
      light: 'text-gray-400',
      dark: 'text-gray-500',
      modern: 'text-purple-400',
      'modern-dark': 'text-purple-500',
      mono: 'text-gray-500'
    }
  }
  
  return colorMap[variant][themeVariant]
}

// Background utilities
export function getBackgroundClasses(theme: ThemeContextType, variant: 'page' | 'card' | 'modal' = 'page') {
  const themeVariant = getThemeVariant(theme)
  
  const backgroundMap = {
    page: {
      light: 'bg-gray-50',
      dark: 'bg-gray-900',
      modern: 'bg-gradient-to-br from-purple-100 via-blue-100 to-indigo-100',
      'modern-dark': 'bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900',
      mono: 'bg-black'
    },
    card: {
      light: 'bg-white',
      dark: 'bg-gray-800',
      modern: 'bg-gradient-to-r from-purple-50/90 to-blue-50/90',
      'modern-dark': 'bg-gradient-to-r from-purple-800/40 to-blue-800/40',
      mono: 'bg-black'
    },
    modal: {
      light: 'bg-white',
      dark: 'bg-gray-800',
      modern: 'bg-gradient-to-r from-purple-50/95 to-blue-50/95 backdrop-blur-sm',
      'modern-dark': 'bg-gradient-to-r from-purple-800/50 to-blue-800/50 backdrop-blur-sm',
      mono: 'bg-black'
    }
  }
  
  return backgroundMap[variant][themeVariant]
}

// Button utilities
export function getButtonClasses(theme: ThemeContextType, variant: 'primary' | 'secondary' | 'danger' | 'icon' = 'primary') {
  const themeVariant = getThemeVariant(theme)
  const { isMono } = theme
  
  const buttonMap = {
    primary: {
      light: 'bg-gray-800 text-white hover:bg-gray-700',
      dark: 'bg-gray-700 text-white hover:bg-gray-600',
      modern: 'bg-purple-600 text-white hover:bg-purple-700',
      'modern-dark': 'bg-purple-700 text-white hover:bg-purple-600',
      mono: 'bg-white/10 text-white hover:bg-white/20'
    },
    secondary: {
      light: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
      dark: 'bg-gray-700 text-gray-300 hover:bg-gray-600',
      modern: 'bg-purple-100 text-purple-800 hover:bg-purple-200',
      'modern-dark': 'bg-purple-800/30 text-purple-100 hover:bg-purple-800/50',
      mono: 'bg-transparent border border-white/20 text-white hover:bg-white/10'
    },
    danger: {
      light: 'bg-red-600 text-white hover:bg-red-700',
      dark: 'bg-red-700 text-white hover:bg-red-600',
      modern: 'bg-red-600 text-white hover:bg-red-700',
      'modern-dark': 'bg-red-700 text-white hover:bg-red-600',
      mono: 'bg-red-600 text-white hover:bg-red-700'
    },
    icon: {
      light: 'text-gray-500 hover:text-gray-700',
      dark: 'text-gray-400 hover:text-gray-200',
      modern: 'text-purple-600 hover:text-purple-800',
      'modern-dark': 'text-purple-300 hover:text-purple-100',
      mono: 'text-white/70 hover:text-white'
    }
  }
  
  return buttonMap[variant][themeVariant]
}

// Input utilities
export function getInputClasses(theme: ThemeContextType, hasError = false) {
  const themeVariant = getThemeVariant(theme)
  const { isMono } = theme
  
  const baseClasses = 'w-full px-3 py-2 rounded border focus:ring-2 focus:border-transparent'
  const errorClasses = hasError ? 'border-red-500 focus:ring-red-500' : ''
  
  const themeClasses = {
    light: 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:ring-purple-500',
    dark: 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:ring-purple-500',
    modern: 'bg-purple-50/80 border-purple-300/50 text-purple-900 placeholder-purple-500 focus:ring-purple-500',
    'modern-dark': 'bg-purple-800/30 border-purple-600/50 text-purple-100 placeholder-purple-400 focus:ring-purple-500',
    mono: 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:ring-purple-500'
  }
  
  return `${baseClasses} ${themeClasses[themeVariant]} ${errorClasses}`.trim()
}

// Toggle button utilities
export function getToggleClasses(theme: ThemeContextType, isActive: boolean) {
  const themeVariant = getThemeVariant(theme)
  const { isMono } = theme
  
  if (isActive) {
    const activeClasses = {
      light: 'bg-gray-100 text-gray-900',
      dark: 'bg-gray-700 text-white',
      modern: 'bg-gray-100 text-gray-900',
      'modern-dark': 'bg-gray-700 text-white',
      mono: '!bg-white/10 text-white'
    }
    return activeClasses[themeVariant]
  } else {
    const inactiveClasses = {
      light: 'text-gray-600 hover:text-gray-700 hover:bg-gray-50',
      dark: 'text-gray-400 hover:text-gray-300 hover:bg-gray-700',
      modern: 'text-purple-600 hover:text-purple-700 hover:bg-purple-50',
      'modern-dark': 'text-purple-300 hover:text-purple-200 hover:bg-purple-800/30',
      mono: 'text-white/70 hover:text-white hover:bg-white/5'
    }
    return inactiveClasses[themeVariant]
  }
}

// Version tag utilities
export function getVersionTagClasses(theme: ThemeContextType) {
  const themeVariant = getThemeVariant(theme)
  
  const tagClasses = {
    light: 'bg-gray-100 text-gray-700 border-gray-200',
    dark: 'bg-gray-700 text-gray-100 border-gray-600',
    modern: 'bg-purple-100 text-purple-800 border-purple-200',
    'modern-dark': 'bg-purple-800/30 text-purple-100 border-purple-600/50',
    mono: 'bg-gray-700 text-white border-gray-600'
  }
  
  return `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${tagClasses[themeVariant]}`
}

// Icon container utilities
export function getIconContainerClasses(theme: ThemeContextType, size: 'sm' | 'md' | 'lg' = 'md') {
  const themeVariant = getThemeVariant(theme)
  const { isMono } = theme
  
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12'
  }
  
  const themeClasses = {
    light: 'bg-gray-100 border-gray-200',
    dark: 'bg-gray-700 border-gray-600',
    modern: 'bg-purple-100 border-purple-200',
    'modern-dark': 'bg-purple-800/30 border-purple-600/50',
    mono: isMono ? 'bg-gray-700 border-gray-600' : 'bg-gray-100 border-gray-200'
  }
  
  return `${sizeClasses[size]} rounded-lg flex items-center justify-center border ${themeClasses[themeVariant]}`
}