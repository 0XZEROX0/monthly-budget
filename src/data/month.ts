import { currentLang, locale, t } from '../i18n'

export const currentMonth = () => today().slice(0, 7)

export const today = () => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** A YYYY-MM-DD date moved by whole days. */
export function shiftDay(date: string, delta: number): string {
  const d = new Date(date + 'T00:00')
  d.setDate(d.getDate() + delta)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Building an Intl formatter is slow next to using one, and a page of entries formats
// hundreds of amounts and dates on every draw, so each kind is built once and kept.
const dateFormats = new Map<string, Intl.DateTimeFormat>()
function formatDate(d: Date, opts: Intl.DateTimeFormatOptions): string {
  const key = currentLang() + JSON.stringify(opts)
  let f = dateFormats.get(key)
  if (!f) dateFormats.set(key, (f = new Intl.DateTimeFormat(locale(), opts)))
  return f.format(d)
}
const numberFormats = new Map<string, Intl.NumberFormat>()
function numberFormat(opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = currentLang() + JSON.stringify(opts)
  let f = numberFormats.get(key)
  if (!f) numberFormats.set(key, (f = new Intl.NumberFormat(locale(), opts)))
  return f
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return formatDate(new Date(y, m - 1, 1), { month: 'long', year: 'numeric' })
}

let decimals = false
/** Whether amounts show two decimals; set from the user's settings. */
export const setShowDecimals = (on: boolean) => {
  decimals = on
}

export function formatMoney(amount: number, currency: string, opts: Intl.NumberFormatOptions = {}): string {
  const digits = decimals ? 2 : 0
  if (opts.notation !== 'compact') opts = { ...opts, minimumFractionDigits: digits, maximumFractionDigits: digits }
  try {
    return numberFormat({ style: 'currency', currency, ...opts }).format(amount)
  } catch {
    return `${amount.toFixed(opts.maximumFractionDigits ?? 2)} ${currency}`
  }
}

/**
 * An amount with a + or − in front, like −EGP 250. In Arabic the sign goes where Intl puts
 * it, since a sign typed before right-to-left text would show on the wrong side.
 */
export function signedMoney(sign: '+' | '−' | '', amount: number, currency: string): string {
  if (currentLang() !== 'ar' || !sign) return sign + formatMoney(amount, currency)
  return formatMoney(sign === '−' ? -amount : amount, currency, sign === '+' ? { signDisplay: 'exceptZero' } : {})
}

/** A bare number for tight tiles: 1,284, or 1,284.50 with decimals on. */
export const formatPlain = (amount: number) => {
  const digits = decimals ? 2 : 0
  return numberFormat({ minimumFractionDigits: digits, maximumFractionDigits: digits }).format(amount)
}

/** Headline figures: $1,284, or $1,284.50 with decimals on. */
export const formatWhole = (amount: number, currency: string) => formatMoney(amount, currency)

/** Compact, for chart axes: $1.2K */
export const formatCompact = (amount: number, currency: string) =>
  // Arabic spells the thousands out (30 ألف), so the currency is left off to keep it short.
  currentLang() === 'ar'
    ? numberFormat({ notation: 'compact', maximumFractionDigits: 1 }).format(amount)
    : formatMoney(amount, currency, { notation: 'compact', maximumFractionDigits: 1, minimumFractionDigits: 0 })

export const daysInMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

export const shortMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return formatDate(new Date(y, m - 1, 1), { month: 'short' })
}

export const dayLabel = (date: string) =>
  formatDate(new Date(date + 'T00:00'), { weekday: 'short', day: 'numeric', month: 'short' })

/** Short date for chart axes: Fri 31, or just Fri where space is tight. */
export const shortDay = (date: string, withDay = true) =>
  formatDate(new Date(date + 'T00:00'), withDay ? { weekday: 'short', day: 'numeric' } : { weekday: 'short' })

/** A stored HH:MM time as the user likes to read it: 20:30, or 8:30 PM on a 12-hour clock. */
export function showTime(time: string, clock12?: boolean): string {
  if (!clock12) return time
  const [h, m] = time.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? t('AM') : t('PM')}`
}

/**
 * A typed amount as a number, or NaN when it isn't one. Takes a comma for the decimal
 * point and the digits an Arabic keyboard types (٠-٩, ۰-۹, ٫), which Number() alone rejects.
 */
export function parseAmount(text: string): number {
  const s = text
    .trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٬\s]/g, '')
    .replace(/[٫,]/g, '.')
  return s ? Number(s) : NaN
}

/** A date as text in the app's language, like 10 Nov 2026 (for one-off labels). */
export const formatDateWith = (date: Date, opts: Intl.DateTimeFormatOptions) => formatDate(date, opts)

/** A plain number with up to two decimals, in the app's language: 1,234.5 */
export const formatNumber = (n: number, maxDigits = 2) => numberFormat({ maximumFractionDigits: maxDigits }).format(n)
