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

export function formatMoney(amount: number, currency: string, opts: Intl.NumberFormatOptions = {}): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, ...opts }).format(amount)
  } catch {
    return `${amount.toFixed(opts.maximumFractionDigits ?? 2)} ${currency}`
  }
}

/** Whole units, for headline figures: $1,284 */
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
