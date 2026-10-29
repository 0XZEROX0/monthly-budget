import type { Kind, MonthPlan, Settings, Transaction } from './types'

export interface CategoryRow {
  category: string
  planned: number
  actual: number
  /** Positive is good: under budget for expenses, over plan for income. */
  diff: number
}

export interface MonthSummary {
  startingBalance: number
  endingBalance: number
  planned: Record<Kind, number>
  actual: Record<Kind, number>
  /** Actual income minus actual expenses. */
  saved: number
  /** Change of ending balance against starting balance, in percent. */
  savingsChangePct: number | null
  rows: Record<Kind, CategoryRow[]>
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

// Mirrors the Summary tab of the Google "Monthly budget" sheet: planned vs actual per
// category, totals, and ending balance = starting balance + income - expenses.
export function summarize(plan: MonthPlan, settings: Settings, txns: Transaction[]): MonthSummary {
  const rowsFor = (kind: Kind): CategoryRow[] => {
    const actualBy: Record<string, number> = {}
    for (const t of txns) if (t.kind === kind) actualBy[t.category] = (actualBy[t.category] ?? 0) + t.amount
    // Keep categories that were renamed or removed but still have spending this month.
    const cats = [...settings.categories[kind], ...Object.keys(actualBy).filter((c) => !settings.categories[kind].includes(c))]
    return cats.map((category) => {
      const planned = plan.planned[kind][category] ?? 0
      const actual = actualBy[category] ?? 0
      return { category, planned, actual, diff: kind === 'expense' ? planned - actual : actual - planned }
    })
  }
  const rows = { expense: rowsFor('expense'), income: rowsFor('income') }
  const planned = { expense: sum(rows.expense.map((r) => r.planned)), income: sum(rows.income.map((r) => r.planned)) }
  const actual = { expense: sum(rows.expense.map((r) => r.actual)), income: sum(rows.income.map((r) => r.actual)) }
  const saved = actual.income - actual.expense
  const endingBalance = plan.startingBalance + saved
  const savingsChangePct = plan.startingBalance !== 0 ? (saved / Math.abs(plan.startingBalance)) * 100 : null
  return { startingBalance: plan.startingBalance, endingBalance, planned, actual, saved, savingsChangePct, rows }
}
