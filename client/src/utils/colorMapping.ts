// Color mapping utilities for consistent theming

export type ColorIndex = number | null | undefined

export type ThemeName =
  | 'light'
  | 'dark'
  | 'modern'
  | 'modern-dark'
  | 'mono'
  | 'aubergine'
  | 'hoth'
  | 'aurora'
  | 'choco-mint'
  | 'ochin'
  | 'work-hard'

export interface ColorConfig {
  bgClass: string
  textClass: string
  borderClass: string
  hexValue: string
  name: string
  index: number
  accentHex: string
  gradient: string
  borderHex: string
  textHex: string
}

export interface EntityColorStyles {
  background: string
  borderColor: string
  textColor: string
  accentHex: string
}

type HSL = { h: number; s: number; l: number }
type Offset = Partial<HSL>

const SURFACE_HEX: Record<ThemeName, string> = {
  light: '#ffffff',
  dark: '#1e293b',
  modern: '#ffffff',
  'modern-dark': '#1e293b',
  mono: '#0f0f0f',
  aubergine: '#2c1c3a',
  hoth: '#ffffff',
  aurora: '#1e2431',
  'choco-mint': '#2b352c',
  ochin: '#172a46',
  'work-hard': '#3a2d1a',
}

const PRIMARY_ACCENT_HEX: Partial<Record<ThemeName, string>> = {
  light: '#3b82f6',
  modern: '#3b82f6',
  hoth: '#0ea5e9',
}

const LIGHT_TEXT = '#0f172a'
const DARK_TEXT = '#f8fafc'

const ACCENT_PRESETS: Array<{
  start: Offset
  mid: Offset
  end: Offset
  border: Offset
}> = [
  {
    start: { l: 0.04 },
    mid: { h: 6, s: 0.08, l: 0.1 },
    end: { h: 12, s: 0.12, l: 0.18 },
    border: { l: -0.08 },
  },
  {
    start: { l: 0.05 },
    mid: { h: -12, s: 0.1, l: 0.08 },
    end: { h: -18, s: 0.14, l: 0.14 },
    border: { l: -0.1 },
  },
  {
    start: { l: 0.06 },
    mid: { h: 18, s: 0.12, l: 0.12 },
    end: { h: 26, s: 0.16, l: 0.2 },
    border: { l: -0.09 },
  },
  {
    start: { l: 0.07 },
    mid: { h: -24, s: 0.14, l: 0.09 },
    end: { h: -30, s: 0.18, l: 0.16 },
    border: { l: -0.08 },
  },
  {
    start: { l: 0.08 },
    mid: { h: 36, s: 0.16, l: 0.14 },
    end: { h: 42, s: 0.2, l: 0.22 },
    border: { l: -0.07 },
  },
]

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const hexToRgb = (hex: string): [number, number, number] => {
  const sanitized = hex.replace('#', '')
  const bigint = parseInt(sanitized.length === 3 ? sanitized.split('').map((c) => c + c).join('') : sanitized, 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255
  return [r, g, b]
}

const rgbToHex = (r: number, g: number, b: number): string => {
  const toHexComponent = (value: number) => {
    const clamped = clamp(Math.round(value), 0, 255)
    const hex = clamped.toString(16)
    return hex.length === 1 ? `0${hex}` : hex
  }
  return `#${toHexComponent(r)}${toHexComponent(g)}${toHexComponent(b)}`
}

const mixHexColors = (hexA: string, hexB: string, weight: number): string => {
  const normalized = clamp(weight, 0, 1)
  const [r1, g1, b1] = hexToRgb(hexA)
  const [r2, g2, b2] = hexToRgb(hexB)
  const r = r1 + (r2 - r1) * normalized
  const g = g1 + (g2 - g1) * normalized
  const b = b1 + (b2 - b1) * normalized
  return rgbToHex(r, g, b)
}

const CUSTOM_THEMES: ThemeName[] = ['aubergine', 'hoth', 'aurora', 'choco-mint', 'ochin', 'work-hard']

const normalizeTheme = (theme?: ThemeName | string | null): ThemeName => {
  if (theme === 'dark' || theme === 'light' || theme === 'mono') return theme
  if (CUSTOM_THEMES.includes(theme as ThemeName)) return theme as ThemeName
  if (theme === 'modern-dark') return 'dark'
  if (theme === 'modern') return 'light'
  return 'light'
}

const hexToHsl = (hex: string): HSL => {
  const value = hex.replace('#', '')
  const bigint = parseInt(value.length === 3 ? value.split('').map((c) => c + c).join('') : value, 16)
  const r = ((bigint >> 16) & 255) / 255
  const g = ((bigint >> 8) & 255) / 255
  const b = (bigint & 255) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min

  let h = 0
  if (delta) {
    if (max === r) h = ((g - b) / delta) % 6
    else if (max === g) h = (b - r) / delta + 2
    else h = (r - g) / delta + 4
  }

  const l = (max + min) / 2
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1))

  return {
    h: (h * 60 + 360) % 360,
    s: clamp(s, 0, 1),
    l: clamp(l, 0, 1),
  }
}

const hslToHex = ({ h, s, l }: HSL): string => {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2

  let [r, g, b] = [0, 0, 0]
  if (0 <= h && h < 60) [r, g, b] = [c, x, 0]
  else if (60 <= h && h < 120) [r, g, b] = [x, c, 0]
  else if (120 <= h && h < 180) [r, g, b] = [0, c, x]
  else if (180 <= h && h < 240) [r, g, b] = [0, x, c]
  else if (240 <= h && h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]

  const toHex = (value: number) => {
    const hex = Math.round((value + m) * 255).toString(16)
    return hex.length === 1 ? `0${hex}` : hex
  }

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

const applyOffset = (base: HSL, offset: Offset): HSL => ({
  h: (base.h + (offset.h ?? 0) + 360) % 360,
  s: clamp(base.s + (offset.s ?? 0), 0, 1),
  l: clamp(base.l + (offset.l ?? 0), 0, 1),
})

const pickTextColor = (hsl: HSL) => (hsl.l > 0.55 ? LIGHT_TEXT : DARK_TEXT)

const paletteCache = new Map<ThemeName, ColorConfig[]>()

const buildPalette = (theme?: ThemeName | string | null): ColorConfig[] => {
  const normalized = normalizeTheme(theme)
  if (paletteCache.has(normalized)) {
    return paletteCache.get(normalized)!
  }

  const baseHex = SURFACE_HEX[normalized] || SURFACE_HEX.light
  const baseHsl = hexToHsl(baseHex)

  const paletteFromSurface = ACCENT_PRESETS.map((preset, index) => {
    const startHsl = applyOffset(baseHsl, preset.start)
    const midHsl = applyOffset(baseHsl, preset.mid)
    const endHsl = applyOffset(baseHsl, preset.end)
    const borderHsl = applyOffset(baseHsl, preset.border)

    const accentHex = hslToHex(midHsl)
    const gradient = `linear-gradient(135deg, ${hslToHex(startHsl)} 0%, ${accentHex} 55%, ${hslToHex(endHsl)} 100%)`
    const borderHex = hslToHex(borderHsl)
    const textHex = pickTextColor(midHsl)

    return {
  bgClass: 'color-surface',
  textClass: 'color-text',
  borderClass: 'color-border',
      hexValue: accentHex,
      name: `Option ${index + 1}`,
      index,
      accentHex,
      gradient,
      borderHex,
      textHex,
    }
  })

  let finalPalette = paletteFromSurface

  if (['light', 'modern', 'hoth'].includes(normalized)) {
    const textHex = pickTextColor(baseHsl) === LIGHT_TEXT ? LIGHT_TEXT : DARK_TEXT
    const weights = [0.18, 0.24, 0.3, 0.36, 0.42]
    finalPalette = paletteFromSurface.map((config, index) => {
      const weight = weights[index] ?? weights[weights.length - 1]
      const startWeight = clamp(weight - 0.06, 0, 1)
      const endWeight = clamp(weight + 0.06, 0, 1)
      const borderWeight = clamp(weight + 0.1, 0, 1)

      const accentHex = mixHexColors(baseHex, textHex, weight)
      const startHex = mixHexColors(baseHex, textHex, startWeight)
      const endHex = mixHexColors(baseHex, textHex, endWeight)
      const borderHex = mixHexColors(baseHex, textHex, borderWeight)
      const textColorHex = pickTextColor(hexToHsl(accentHex))

      return {
        ...config,
        accentHex,
        gradient: `linear-gradient(135deg, ${startHex} 0%, ${accentHex} 55%, ${endHex} 100%)`,
        borderHex,
        textHex: textColorHex,
      }
    })
  } else if (PRIMARY_ACCENT_HEX[normalized]) {
    const accentBaseHex = PRIMARY_ACCENT_HEX[normalized] as string
    const mixedPalette = paletteFromSurface.map((config, index) => {
      const baseWeight = [0.75, 0.6, 0.45, 0.3, 0.18][index] ?? 0.3
      const accentHex = mixHexColors(baseHex, accentBaseHex, baseWeight)
      const startHex = mixHexColors(baseHex, accentBaseHex, clamp(baseWeight + 0.12, 0, 1))
      const endHex = mixHexColors(baseHex, accentBaseHex, clamp(baseWeight - 0.12, 0, 1))
      const borderHex = mixHexColors(baseHex, accentBaseHex, clamp(baseWeight + 0.2, 0, 1))
      const textHex = pickTextColor(hexToHsl(accentHex))

      return {
        ...config,
        accentHex,
        gradient: `linear-gradient(135deg, ${startHex} 0%, ${accentHex} 55%, ${endHex} 100%)`,
        borderHex,
        textHex,
      }
    })

    finalPalette = mixedPalette
  }

  paletteCache.set(normalized, finalPalette)
  return finalPalette
}

export function mapColorIndex(colorIndex: ColorIndex): number {
  if (colorIndex === null || colorIndex === undefined) return 0
  if (colorIndex >= 0 && colorIndex <= 4) return colorIndex
  if (colorIndex >= 5 && colorIndex <= 9) return colorIndex - 5
  return 0
}

export function getThemePalette(theme?: ThemeName | string | null): ColorConfig[] {
  return buildPalette(theme)
}

export function getColorConfig(colorIndex: ColorIndex, theme?: ThemeName | string | null): ColorConfig {
  const palette = buildPalette(theme)
  return palette[mapColorIndex(colorIndex)]
}

export function getEntityColorStyles(theme: ThemeName | string | null | undefined, colorIndex: ColorIndex): EntityColorStyles {
  const config = getColorConfig(colorIndex, theme)
  return {
    background: config.gradient,
    borderColor: config.borderHex,
    textColor: config.textHex,
    accentHex: config.accentHex,
  }
}