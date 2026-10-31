export const currentMonth = () => today().slice(0, 7)

export const today = () => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
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
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, ...opts }).format(amount)
  } catch {
    return `${amount.toFixed(opts.maximumFractionDigits ?? 2)} ${currency}`
  }
}

/** Headline figures: $1,284, or $1,284.50 with decimals on. */
export const formatWhole = (amount: number, currency: string) =>
  formatMoney(amount, currency, { maximumFractionDigits: 0, minimumFractionDigits: 0 })

/** Compact, for chart axes: $1.2K */
export const formatCompact = (amount: number, currency: string) =>
  formatMoney(amount, currency, { notation: 'compact', maximumFractionDigits: 1, minimumFractionDigits: 0 })

export const daysInMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

export const shortMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short' })
}

export const dayLabel = (date: string) =>
  new Date(date + 'T00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })

/** A stored HH:MM time as the user likes to read it: 20:30, or 8:30 PM on a 12-hour clock. */
export function showTime(time: string, clock12?: boolean): string {
  if (!clock12) return time
  const [h, m] = time.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}
