import { daysInMonth, formatWhole, today } from './month'
import type { Bill, NewTransaction, Settings, Transaction } from './types'

// Monthly bills: instalments to pay-later companies (TRU, Valu) are reminded on the
// first days of the month, a card on its one chosen day. The Galaxy Watch app follows
// the same rules (see the Bill type), so keep the two in step.

export const billTxnId = (b: Bill, month: string) => `bill-${b.id}-${month}`

/** The day it's due in `month`, moved to the last day for short months. */
export const dueDay = (b: Bill, month: string) => Math.min(Math.max(1, b.day), daysInMonth(month))

/** Days of `month` with a reminder. */
export function reminderDays(b: Bill, month: string): number[] {
  const last = daysInMonth(month)
  const first = dueDay(b, month)
  const n = Math.max(1, b.windowDays)
  return Array.from({ length: n }, (_, i) => first + i).filter((d) => d <= last)
}

export function isPaid(b: Bill, month: string, txns: Transaction[]): boolean {
  const id = billTxnId(b, month)
  return txns.some((t) => t.id === id || (t.month === month && !!b.debt && t.kind === 'repay' && t.debt === b.debt))
}

export type BillStatus = 'paid' | 'due' | 'late' | 'upcoming'

export function billStatus(b: Bill, month: string, txns: Transaction[], now = today()): BillStatus {
  if (isPaid(b, month, txns)) return 'paid'
  const nowMonth = now.slice(0, 7)
  if (month > nowMonth) return 'upcoming'
  if (month < nowMonth) return 'late'
  const d = Number(now.slice(8, 10))
  const days = reminderDays(b, month)
  if (d < days[0]) return 'upcoming'
  return d <= days[days.length - 1] ? 'due' : 'late'
}

export const ordinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'
  return `${n}${s}`
}

/** The entry that pays this bill for `month`, saved under billTxnId so it's added only once. */
export function paymentFor(b: Bill, month: string, settings: Settings, amount: number): NewTransaction {
  const now = today()
  const date = now.startsWith(month) ? now : `${month}-${String(dueDay(b, month)).padStart(2, '0')}`
  const account = b.account || settings.accounts.find((a) => a.type !== 'investment')?.name || settings.accounts[0]?.name
  const description = b.type === 'instalment' ? `${b.name} instalment` : `${b.name} payment`
  if (b.debt) return { kind: 'repay', amount, date, month, description, category: '', account, debt: b.debt }
  return { kind: 'expense', amount, date, month, description, category: b.category || 'Other', account }
}

/** Notification text for one reminder day. */
export function reminderText(b: Bill, month: string, day: number, currency: string) {
  const due = dueDay(b, month)
  const amount = b.amount > 0 ? ` of ${formatWhole(b.amount, currency)}` : ''
  if (b.type === 'card') return { title: `${b.name} payment due today`, body: `Pay your ${b.name}${amount} today.` }
  const days = reminderDays(b, month)
  const idx = days.indexOf(day) + 1
  return {
    title: `Don't forget your ${b.name} instalment`,
    body: `You have the ${b.name} instalment${amount}, due on the ${ordinal(due)}.${days.length > 1 ? ` Reminder ${idx} of ${days.length}.` : ''}`,
  }
}
