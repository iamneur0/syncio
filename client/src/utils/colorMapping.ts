// Color mapping utilities for different themes
// Maps colorIndex (1-5) to actual colors based on theme

export type Theme = 'light' | 'dark' | 'mono' | 'modern' | 'modern-dark';

export interface ColorMapping {
  bg: string;
  text: string;
  border?: string;
}

// Color mappings for each theme
const colorMappings: Record<Theme, ColorMapping[]> = {
  light: [
    { bg: 'bg-blue-500', text: 'text-white' },
    { bg: 'bg-green-500', text: 'text-white' },
    { bg: 'bg-purple-500', text: 'text-white' },
    { bg: 'bg-orange-500', text: 'text-white' },
    { bg: 'bg-red-500', text: 'text-white' }
  ],
  dark: [
    { bg: 'bg-blue-500', text: 'text-white' },
    { bg: 'bg-green-500', text: 'text-white' },
    { bg: 'bg-purple-500', text: 'text-white' },
    { bg: 'bg-orange-500', text: 'text-white' },
    { bg: 'bg-red-500', text: 'text-white' }
  ],
  mono: [
    { bg: 'bg-black', text: 'text-white' }, // darkest - pure black
    { bg: 'bg-gray-800', text: 'text-white' }, // very dark grey
    { bg: 'bg-gray-600', text: 'text-white' }, // medium dark grey
    { bg: 'bg-gray-400', text: 'text-black' }, // medium grey
    { bg: 'bg-gray-300', text: 'text-black' }  // lightest grey
  ],
  modern: [
    { bg: 'bg-gradient-to-br from-blue-500 to-blue-600', text: 'text-white' },
    { bg: 'bg-gradient-to-br from-green-500 to-green-600', text: 'text-white' },
    { bg: 'bg-gradient-to-br from-purple-500 to-purple-600', text: 'text-white' },
    { bg: 'bg-gradient-to-br from-orange-500 to-orange-600', text: 'text-white' },
    { bg: 'bg-gradient-to-br from-red-500 to-red-600', text: 'text-white' }
  ],
  'modern-dark': [
    { bg: 'bg-gradient-to-br from-blue-600 to-blue-700', text: 'text-white' },
    { bg: 'bg-gradient-to-br from-green-600 to-green-700', text: 'text-white' },
    { bg: 'bg-gradient-to-br from-purple-600 to-purple-700', text: 'text-white' },
    { bg: 'bg-gradient-to-br from-orange-600 to-orange-700', text: 'text-white' },
    { bg: 'bg-gradient-to-br from-red-600 to-red-700', text: 'text-white' }
  ]
};

/**
 * Get color mapping for a given colorIndex and theme
 * @param colorIndex - Index from 1-5
 * @param theme - Current theme
 * @returns Color mapping object with bg, text, and optional border classes
 */
export function getColorMapping(colorIndex: number | null | undefined, theme: Theme): ColorMapping {
  if (!colorIndex || colorIndex < 1 || colorIndex > 5) {
    // Default to index 1 if invalid
    colorIndex = 1;
  }
  
  const mapping = colorMappings[theme]?.[colorIndex - 1];
  if (!mapping) {
    // Fallback to light theme if theme not found
    return colorMappings.light[0];
  }
  
  return mapping;
}

/**
 * Get background color class for a given colorIndex and theme
 * @param colorIndex - Index from 1-5
 * @param theme - Current theme
 * @returns Background color class string
 */
export function getColorBgClass(colorIndex: number | null | undefined, theme: Theme): string {
  return getColorMapping(colorIndex, theme).bg;
}

/**
 * Get text color class for a given colorIndex and theme
 * @param colorIndex - Index from 1-5
 * @param theme - Current theme
 * @returns Text color class string
 */
export function getColorTextClass(colorIndex: number | null | undefined, theme: Theme): string {
  return getColorMapping(colorIndex, theme).text;
}

/**
 * Get all available color options for a theme (for color picker)
 * @param theme - Current theme
 * @returns Array of color mappings for indices 1-5
 */
export function getColorOptions(theme: Theme): ColorMapping[] {
  return colorMappings[theme] || colorMappings.light;
}