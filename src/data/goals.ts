import { today } from './month'
import type { Balances } from './summary'
import type { Goal } from './types'

export interface GoalProgress {
  saved: number
  pct: number
  left: number
  /** Months to the deadline, counting this one; null without a deadline. */
  monthsLeft: number | null
  /** Needed each month to reach it by the deadline. */
  perMonth: number | null
  daysLeft: number | null
}

export function goalProgress(g: Goal, balances: Balances, now = today()): GoalProgress {
  const saved = g.accounts.reduce((a, name) => a + (balances.accounts[name] ?? 0), 0)
  const left = Math.max(0, g.target - saved)
  const pct = g.target > 0 ? Math.min(100, Math.max(0, (saved / g.target) * 100)) : 0
  if (!g.deadline) return { saved, pct, left, monthsLeft: null, perMonth: null, daysLeft: null }
  const [y, m] = now.split('-').map(Number)
  const [dy, dm] = g.deadline.split('-').map(Number)
  const monthsLeft = Math.max(0, (dy - y) * 12 + (dm - m) + 1)
  const daysLeft = Math.round((new Date(g.deadline + 'T00:00').getTime() - new Date(now + 'T00:00').getTime()) / 86_400_000)
  return { saved, pct, left, monthsLeft, perMonth: monthsLeft > 0 ? left / monthsLeft : null, daysLeft }
}

export const endOfYear = () => `${today().slice(0, 4)}-12-31`
