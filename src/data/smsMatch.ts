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
  // Each date is read once: this runs over every message against every entry after each change.
  const times = new Map<string, number>()
  const time = (d: string) => {
    let ms = times.get(d)
    if (ms === undefined) times.set(d, (ms = new Date(d + 'T00:00').getTime()))
    return ms
  }
  for (const p of parsed) {
    if (p.currency !== 'EGP') continue
    let best: Transaction | null = null
    let bestGap = Infinity
    const at = time(p.date)
    for (const t of txns) {
      if (used.has(t.id) || Math.abs(Math.abs(t.amount) - p.amount) > 0.005) continue
      if (!(p.direction === 'spend' ? OUT : IN).includes(t.kind)) continue
      const gap = Math.abs(time(t.date) - at)
      if (gap <= 3 * DAY && gap < bestGap) [best, bestGap] = [t, gap]
    }
    if (best) {
      used.add(best.id)
      found.add(p.smsId)
    }
  }
  return found
}
