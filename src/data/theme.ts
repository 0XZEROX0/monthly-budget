// Accent colour and light/dark choice, applied as data-accent / data-mode on <html>
// (styles in index.css). Saved with the user's settings so every device matches, and
// cached locally so the right colours show before settings load.

export type ThemeMode = 'system' | 'light' | 'dark'

export interface Theme {
  accent: string
  mode: ThemeMode
}

export const DEFAULT_THEME: Theme = { accent: 'purple', mode: 'system' }

/** Accent choices: name, swatch for light and dark mode. */
export const ACCENTS: { id: string; label: string; light: string; dark: string }[] = [
  { id: 'purple', label: 'Purple', light: '#4b3fd1', dark: '#9085e9' },
  { id: 'blue', label: 'Blue', light: '#1f5fbf', dark: '#6ea6f0' },
  { id: 'teal', label: 'Teal', light: '#0f766e', dark: '#4fc1b3' },
  { id: 'green', label: 'Green', light: '#2f7d32', dark: '#6cc070' },
  { id: 'orange', label: 'Orange', light: '#c2560f', dark: '#f0904f' },
  { id: 'pink', label: 'Pink', light: '#be2f6e', dark: '#ee7aab' },
  { id: 'graphite', label: 'Graphite', light: '#2b2b2b', dark: '#d6d6d2' },
]

const KEY = 'budget-app:theme'

export function applyTheme(t: Theme) {
  const root = document.documentElement
  root.dataset.accent = t.accent
  if (t.mode === 'system') delete root.dataset.mode
  else root.dataset.mode = t.mode
  // Browser/status bar colour: the page background for the mode in use.
  const dark = t.mode === 'dark' || (t.mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0d0d0d' : '#f3f4f1')
  try {
    localStorage.setItem(KEY, JSON.stringify(t))
  } catch {
    // Storage unavailable: the theme still applies for this visit.
  }
}

/** The last theme used on this device, before settings have loaded. */
export function cachedTheme(): Theme {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULT_THEME, ...(JSON.parse(raw) as Partial<Theme>) }
  } catch {
    // Ignore and use the default.
  }
  return DEFAULT_THEME
}
