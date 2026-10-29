import type { ParsedSms } from './smsParser'
import type { Transaction, TxnKind } from './types'

// Kinds an entry for money going out or coming in can have, e.g. a transfer out may be
// entered as Bank -> Thndr rather than as an expense.
const OUT: TxnKind[] = ['expense', 'repay', 'transfer', 'borrow']
const IN: TxnKind[] = ['income', 'transfer', 'borrow']
const DAY = 86_400_000

/**
 * Messages already in the budget, entered by hand or imported from the sheet: an entry
 * with the same amount, a matching kind, and a date at most 3 days apart. Each entry
 * accounts for one message only, the one closest in date.
 */
export function alreadyRecorded(parsed: ParsedSms[], txns: Transaction[]): Set<string> {
  const used = new Set<string>()
  const found = new Set<string>()
  const time = (d: string) => new Date(d + 'T00:00').getTime()
  for (const p of parsed) {
    if (p.currency !== 'EGP') continue
    let best: Transaction | null = null
    let bestGap = Infinity
    for (const t of txns) {
      if (used.has(t.id) || Math.abs(Math.abs(t.amount) - p.amount) > 0.005) continue
      if (!(p.direction === 'spend' ? OUT : IN).includes(t.kind)) continue
      const gap = Math.abs(time(t.date) - time(p.date))
      if (gap <= 3 * DAY && gap < bestGap) [best, bestGap] = [t, gap]
    }
    if (best) {
      used.add(best.id)
      found.add(p.smsId)
    }
  }
  return found
}
