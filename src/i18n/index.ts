// The app's language: English or Arabic. Text is written in English in the code and
// wrapped in t(), which looks it up in the Arabic list (./ar.ts) when Arabic is on.
// The choice is saved with the user's settings (so the phone, website and watch match)
// and kept on this device too, so the right language shows before settings load.
import { AR } from './ar'

export type Lang = 'en' | 'ar'

export const LANGS: { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'ar', label: 'العربية' },
]

const KEY = 'budget-app:lang'

let lang: Lang = 'en'

export const currentLang = () => lang
export const isRtl = () => lang === 'ar'

/**
 * The locale used for dates and amounts. Arabic keeps Western digits (1,234), which
 * banks and the sheet use, with Arabic month names and the ج.م. currency sign.
 */
export const locale = () => (lang === 'ar' ? 'ar-EG-u-nu-latn' : undefined)

/**
 * Text in the app's language. `vars` fill {name} slots: t('{n} entries', { n: 3 }).
 * A sentence missing from the Arabic list shows in English rather than not at all.
 */
export function t(en: string, vars?: Record<string, string | number>): string {
  let s = lang === 'ar' ? (AR[en] ?? en) : en
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
  return s
}

/** Sets the language for everything drawn from now on, and the page's direction. */
export function applyLang(next: Lang | undefined) {
  lang = next === 'ar' ? 'ar' : 'en'
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  }
  try {
    localStorage.setItem(KEY, lang)
  } catch {
    // Storage unavailable: the language still applies for this visit.
  }
}

/** The last language used on this device, before settings have loaded. */
export function cachedLang(): Lang {
  try {
    if (localStorage.getItem(KEY) === 'ar') return 'ar'
  } catch {
    // Ignore and use English.
  }
  return 'en'
}

/** Marks text kept in a list (like tab names) for the Arabic list; show it with t(). */
export const msg = (en: string) => en
