// Color mapping utilities for consistent theming

export type ColorIndex = number | null | undefined

export interface ColorConfig {
  bgClass: string
  textClass: string
  borderClass: string
  hexValue: string
  name: string
}

// Black theme color palette (indices 0-4)
export const BLACK_COLOR_PALETTE: ColorConfig[] = [
  {
    bgClass: 'bg-black',
    textClass: 'text-white',
    borderClass: 'border-gray-800',
    hexValue: '#000000',
    name: 'Black'
  },
  {
    bgClass: 'bg-gray-800',
    textClass: 'text-white',
    borderClass: 'border-gray-700',
    hexValue: '#1f2937',
    name: 'Dark Gray'
  },
  {
    bgClass: 'bg-gray-600',
    textClass: 'text-white',
    borderClass: 'border-gray-500',
    hexValue: '#4b5563',
    name: 'Gray'
  },
  {
    bgClass: 'bg-gray-400',
    textClass: 'text-gray-900',
    borderClass: 'border-gray-300',
    hexValue: '#9ca3af',
    name: 'Light Gray'
  },
  {
    bgClass: 'bg-gray-300',
    textClass: 'text-gray-900',
    borderClass: 'border-gray-200',
    hexValue: '#d1d5db',
    name: 'Very Light Gray'
  }
]

// Light/Dark theme color palette (indices 0-4)
export const COLOR_PALETTE: ColorConfig[] = [
  {
    bgClass: 'bg-blue-500',
    textClass: 'text-white',
    borderClass: 'border-blue-400',
    hexValue: '#3b82f6',
    name: 'Blue'
  },
  {
    bgClass: 'bg-green-500',
    textClass: 'text-white',
    borderClass: 'border-green-400',
    hexValue: '#10b981',
    name: 'Green'
  },
  {
    bgClass: 'bg-purple-500',
    textClass: 'text-white',
    borderClass: 'border-purple-400',
    hexValue: '#8b5cf6',
    name: 'Purple'
  },
  {
    bgClass: 'bg-orange-500',
    textClass: 'text-white',
    borderClass: 'border-orange-400',
    hexValue: '#f97316',
    name: 'Orange'
  },
  {
    bgClass: 'bg-red-500',
    textClass: 'text-white',
    borderClass: 'border-red-400',
    hexValue: '#ef4444',
    name: 'Red'
  }
]

// Gradient color configurations for modern themes
export const GRADIENT_COLORS: ColorConfig[] = [
  {
    bgClass: 'bg-gradient-to-br from-blue-500 to-blue-600',
    textClass: 'text-white',
    borderClass: 'border-blue-400',
    hexValue: '#3b82f6',
    name: 'Blue Gradient'
  },
  {
    bgClass: 'bg-gradient-to-br from-green-500 to-green-600',
    textClass: 'text-white',
    borderClass: 'border-green-400',
    hexValue: '#10b981',
    name: 'Green Gradient'
  },
  {
    bgClass: 'bg-gradient-to-br from-purple-500 to-purple-600',
    textClass: 'text-white',
    borderClass: 'border-purple-400',
    hexValue: '#8b5cf6',
    name: 'Purple Gradient'
  },
  {
    bgClass: 'bg-gradient-to-br from-orange-500 to-orange-600',
    textClass: 'text-white',
    borderClass: 'border-orange-400',
    hexValue: '#f97316',
    name: 'Orange Gradient'
  },
  {
    bgClass: 'bg-gradient-to-br from-red-500 to-red-600',
    textClass: 'text-white',
    borderClass: 'border-red-400',
    hexValue: '#ef4444',
    name: 'Red Gradient'
  },
  {
    bgClass: 'bg-gradient-to-br from-blue-600 to-blue-700',
    textClass: 'text-white',
    borderClass: 'border-blue-500',
    hexValue: '#2563eb',
    name: 'Dark Blue Gradient'
  },
  {
    bgClass: 'bg-gradient-to-br from-green-600 to-green-700',
    textClass: 'text-white',
    borderClass: 'border-green-500',
    hexValue: '#059669',
    name: 'Dark Green Gradient'
  },
  {
    bgClass: 'bg-gradient-to-br from-purple-600 to-purple-700',
    textClass: 'text-white',
    borderClass: 'border-purple-500',
    hexValue: '#7c3aed',
    name: 'Dark Purple Gradient'
  },
  {
    bgClass: 'bg-gradient-to-br from-orange-600 to-orange-700',
    textClass: 'text-white',
    borderClass: 'border-orange-500',
    hexValue: '#ea580c',
    name: 'Dark Orange Gradient'
  },
  {
    bgClass: 'bg-gradient-to-br from-red-600 to-red-700',
    textClass: 'text-white',
    borderClass: 'border-red-500',
    hexValue: '#dc2626',
    name: 'Dark Red Gradient'
  }
]

/**
 * Map old color indices (0-9) to new color indices (0-4)
 */
export function mapColorIndex(colorIndex: ColorIndex): number {
  if (colorIndex === null || colorIndex === undefined) {
    return 0
  }
  
  // If already in new range (0-4), return as is
  if (colorIndex >= 0 && colorIndex <= 4) {
    return colorIndex
  }
  
  // Map old range (5-9) to new range (0-4)
  if (colorIndex >= 5 && colorIndex <= 9) {
    return colorIndex - 5
  }
  
  // Fallback for any other values
  return 0
}

/**
 * Get color configuration by index and theme
 */
export function getColorConfig(colorIndex: ColorIndex, theme?: 'light' | 'dark' | 'modern' | 'modern-dark' | 'mono'): ColorConfig {
  const mappedIndex = mapColorIndex(colorIndex)
  return getThemePalette(theme)[mappedIndex]
}

/**
 * Get the appropriate color palette based on theme
 */
export function getThemePalette(theme?: 'light' | 'dark' | 'modern' | 'modern-dark' | 'mono'): ColorConfig[] {
  if (theme === 'mono' || theme === 'light') {
    return BLACK_COLOR_PALETTE
  }
  return COLOR_PALETTE
}

/**
 * Get gradient color configuration by index
 */
export function getGradientColorConfig(colorIndex: ColorIndex): ColorConfig {
  if (colorIndex === null || colorIndex === undefined || colorIndex < 0 || colorIndex >= GRADIENT_COLORS.length) {
    return GRADIENT_COLORS[0] // Default to blue gradient
  }
  return GRADIENT_COLORS[colorIndex]
}

/**
 * Get background class for a color index based on theme
 */
export function getColorBgClass(colorIndex: ColorIndex, theme: 'light' | 'dark' | 'modern' | 'modern-dark' | 'mono'): string {
  const config = getColorConfig(colorIndex, theme)
  
  // For modern themes, use gradients
  if (theme === 'modern' || theme === 'modern-dark') {
    const gradientConfig = getGradientColorConfig(colorIndex)
    return gradientConfig.bgClass
  }
  
  return config.bgClass
}

/**
 * Get text class for a color index
 */
export function getColorTextClass(colorIndex: ColorIndex, theme?: 'light' | 'dark' | 'modern' | 'modern-dark' | 'mono'): string {
  const config = getColorConfig(colorIndex, theme)
  return config.textClass
}

/**
 * Get border class for a color index
 */
export function getColorBorderClass(colorIndex: ColorIndex, theme?: 'light' | 'dark' | 'modern' | 'modern-dark' | 'mono'): string {
  const config = getColorConfig(colorIndex, theme)
  return config.borderClass
}

/**
 * Get hex value for a color index
 */
export function getColorHexValue(colorIndex: ColorIndex, theme?: 'light' | 'dark' | 'modern' | 'modern-dark' | 'mono'): string {
  const config = getColorConfig(colorIndex, theme)
  return config.hexValue
}

/**
 * Get color name for a color index
 */
export function getColorName(colorIndex: ColorIndex, theme?: 'light' | 'dark' | 'modern' | 'modern-dark' | 'mono'): string {
  const config = getColorConfig(colorIndex, theme)
  return config.name
}

/**
 * Convert Tailwind class to hex value (for backward compatibility)
 */
export function getColorValue(tailwindClass: string): string {
  // Check regular colors first
  const regularColor = COLOR_PALETTE.find(color => color.bgClass === tailwindClass)
  if (regularColor) {
    return regularColor.hexValue
  }
  
  // Check gradient colors
  const gradientColor = GRADIENT_COLORS.find(color => color.bgClass === tailwindClass)
  if (gradientColor) {
    return gradientColor.hexValue
  }
  
  // Fallback to black
  return '#000000'
}

/**
 * Get all available colors for selection UI based on theme
 */
export function getAllColors(theme?: 'light' | 'dark' | 'modern' | 'modern-dark' | 'mono'): ColorConfig[] {
  return getThemePalette(theme)
}

/**
 * Get all available gradient colors for selection UI
 */
export function getAllGradientColors(): ColorConfig[] {
  return GRADIENT_COLORS
}

/**
 * Get color options for a specific theme
 */
export function getColorOptions(theme: 'light' | 'dark' | 'modern' | 'modern-dark' | 'mono'): ColorConfig[] {
  // For modern themes, use gradients
  if (theme === 'modern' || theme === 'modern-dark') {
    return GRADIENT_COLORS
  }
  
  // For other themes, use theme-appropriate colors
  return getThemePalette(theme)
}