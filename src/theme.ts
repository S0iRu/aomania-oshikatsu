export const DEFAULT_THEME = 'default'

export const BUILTIN_THEMES = [
  { id: 'default', color: '#8eabc4' },
  { id: 'pink', color: '#e7a0b4' },
  { id: 'green', color: '#7dba8e' },
  { id: 'purple', color: '#b09ad4' },
  { id: 'night', color: '#2c3e55' },
] as const

export type ThemePreset = { id: string; color: string }

const DEFAULT_VARS: Record<string, string> = {
  '--bg': '#d7e2ee',
  '--ink': '#2c3a4a',
  '--button': '#4d6484',
  '--button-text': '#ffffff',
  '--segment': '#e6eef6',
  '--segment-on': '#c5d6ea',
  '--segment-on-text': '#2c3a4a',
}

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const raw = hex.trim().replace('#', '')
  const full = raw.length === 3 ? raw.split('').map((char) => char + char).join('') : raw
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null
  const value = Number.parseInt(full, 16)
  const r = ((value >> 16) & 255) / 255
  const g = ((value >> 8) & 255) / 255
  const b = (value & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h =
    max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: (h / 6) * 360, s, l }
}

function hsl(h: number, s: number, l: number): string {
  return `hsl(${Math.round(h)} ${Math.round(Math.min(1, Math.max(0, s)) * 100)}% ${Math.round(Math.min(1, Math.max(0, l)) * 100)}%)`
}

export function varsFromColor(color: string): Record<string, string> {
  const hslColor = hexToHsl(color)
  if (!hslColor) return DEFAULT_VARS
  const { h, s, l } = hslColor
  const dark = l < 0.42
  if (dark) {
    return {
      '--bg': hsl(h, s * 0.28, 0.18),
      '--ink': '#f4f7fb',
      '--button': hsl(h, Math.min(s, 0.45), 0.46),
      '--button-text': '#ffffff',
      '--segment': hsl(h, s * 0.2, 0.26),
      '--segment-on': hsl(h, s * 0.32, 0.4),
      '--segment-on-text': '#f4f7fb',
    }
  }
  return {
    '--bg': hsl(h, Math.min(s, 0.5) * 0.45, 0.9),
    '--ink': '#2c3a4a',
    '--button': hsl(h, Math.min(s, 0.55), 0.4),
    '--button-text': '#ffffff',
    '--segment': hsl(h, s * 0.22, 0.93),
    '--segment-on': hsl(h, s * 0.32, 0.8),
    '--segment-on-text': '#2c3a4a',
  }
}

export function resolveThemeVars(
  theme: string,
  customColor: string,
  presets: ThemePreset[],
): Record<string, string> {
  if (theme === DEFAULT_THEME) return DEFAULT_VARS
  if (theme === 'custom') return varsFromColor(customColor)
  const builtin = BUILTIN_THEMES.find((item) => item.id === theme)
  if (builtin && builtin.id !== DEFAULT_THEME) return varsFromColor(builtin.color)
  const preset = presets.find((item) => item.id === theme)
  if (preset) return varsFromColor(preset.color)
  return DEFAULT_VARS
}

export function applyTheme(theme: string, customColor: string, presets: ThemePreset[]): void {
  const vars = resolveThemeVars(theme, customColor, presets)
  for (const [name, value] of Object.entries(vars)) {
    document.documentElement.style.setProperty(name, value)
  }
}
