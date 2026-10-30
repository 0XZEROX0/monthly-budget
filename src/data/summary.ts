import type { Kind, MonthPlan, Settings, Transaction } from './types'

export interface CategoryRow {
  category: string
  planned: number
  actual: number
  /** Positive is good: under budget for expenses, over plan for income. */
  diff: number
}

export interface Balances {
  accounts: Record<string, number>
  debts: Record<string, number>
}

export interface MonthSummary {
  start: Balances
  end: Balances
  /** Cash + bank accounts, at the start and end of the month. */
  liquidityStart: number
  liquidityEnd: number
  investments: number
  /** Expected monthly interest on investments, from each account's interest %. */
  interest: number
  /** Liquidity + investments + expected interest, as the sheet's "Capital". */
  capital: number
  planned: Record<Kind, number>
  actual: Record<Kind, number>
  /** Repayments made this month; part of spending (inside the debt category's row when set). */
  debtPayments: number
  /** Expenses + debt payments. */
  spent: number
  /** Change in liquidity, counting money moved into investments as saved. */
  saved: number
  /** (income - spent) / income, in percent. */
  savingsPct: number | null
  rows: Record<Kind, CategoryRow[]>
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

/** How a transaction moves account and debt balances. */
export function effects(t: Transaction, settings: Settings): Balances {
  const accounts: Record<string, number> = {}
  const debts: Record<string, number> = {}
  const acc = t.account ?? settings.accounts[0]?.name ?? 'Cash'
  const add = (o: Record<string, number>, k: string | undefined, v: number) => {
    if (k) o[k] = (o[k] ?? 0) + v
  }
  switch (t.kind) {
    case 'expense':
      add(accounts, acc, -t.amount)
      break
    case 'income':
      add(accounts, acc, t.amount)
      break
    case 'transfer':
      add(accounts, acc, -t.amount)
      add(accounts, t.toAccount, t.amount)
      break
    case 'repay':
      add(accounts, acc, -t.amount)
      add(debts, t.debt, -t.amount)
      break
    case 'borrow':
      add(accounts, t.account, t.amount)
      add(debts, t.debt, t.amount)
      break
    case 'adjust':
      if (t.debt) add(debts, t.debt, t.amount)
      else add(accounts, acc, t.amount)
      break
  }
  return { accounts, debts }
}

function apply(b: Balances, txns: Transaction[], settings: Settings): Balances {
  const out = { accounts: { ...b.accounts }, debts: { ...b.debts } }
  for (const t of txns) {
    const e = effects(t, settings)
    for (const [k, v] of Object.entries(e.accounts)) out.accounts[k] = (out.accounts[k] ?? 0) + v
    for (const [k, v] of Object.entries(e.debts)) out.debts[k] = (out.debts[k] ?? 0) + v
  }
  return out
}

/** Balances at the start of `month`: opening balances plus everything before it. */
export function balancesBefore(month: string, settings: Settings, history: Transaction[]): Balances {
  const { opening } = settings
  const before = history.filter((t) => t.month >= opening.month && t.month < month)
  return apply({ accounts: opening.accounts, debts: opening.debts }, before, settings)
}

const isLiquid = (settings: Settings, name: string) => settings.accounts.find((a) => a.name === name)?.type !== 'investment'

/** Saved in a month: liquidity change, with money moved into investments counted as saved. */
export function savedIn(txns: Transaction[], settings: Settings): number {
  let saved = 0
  for (const t of txns) {
    const e = effects(t, settings)
    for (const [k, v] of Object.entries(e.accounts)) if (isLiquid(settings, k)) saved += v
    if (t.kind === 'transfer' && t.toAccount && isLiquid(settings, t.account ?? '') !== isLiquid(settings, t.toAccount))
      saved += isLiquid(settings, t.toAccount) ? -t.amount : t.amount
  }
  return saved
}

/** Expenses plus debt repayments. */
export const spentIn = (txns: Transaction[]) => sum(txns.filter((t) => t.kind === 'expense' || t.kind === 'repay').map((t) => t.amount))

// Mirrors a month tab of the sheet: planned vs actual per category, account and
// debt balances, liquidity (cash + bank), saved this month and capital.
export function summarize(plan: MonthPlan, settings: Settings, txns: Transaction[], start: Balances): MonthSummary {
  // Repayments count toward this expense category when it exists, so they share its budget.
  const debtRow = settings.debtCategory && settings.categories.expense.includes(settings.debtCategory) ? settings.debtCategory : null
  const rowsFor = (kind: Kind): CategoryRow[] => {
    const actualBy: Record<string, number> = {}
    for (const t of txns) {
      const cat = t.kind === kind ? t.category : kind === 'expense' && t.kind === 'repay' ? debtRow : null
      if (cat) actualBy[cat] = (actualBy[cat] ?? 0) + t.amount
    }
    // Keep categories that were renamed or removed but still have entries this month.
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
  const debtPayments = sum(txns.filter((t) => t.kind === 'repay').map((t) => t.amount))
  const spent = actual.expense + (debtRow ? 0 : debtPayments)
  const end = apply(start, txns, settings)

  const liquid = settings.accounts.filter((a) => a.type !== 'investment')
  const invest = settings.accounts.filter((a) => a.type === 'investment')
  const total = (b: Balances, list: typeof liquid) => sum(list.map((a) => b.accounts[a.name] ?? 0))
  const investments = total(end, invest)
  const interest = sum(invest.map((a) => ((end.accounts[a.name] ?? 0) * (a.interestPct ?? 0)) / 100))
  const liquidityEnd = total(end, liquid)

  return {
    start,
    end,
    liquidityStart: total(start, liquid),
    liquidityEnd,
    investments,
    interest,
    capital: liquidityEnd + investments + interest,
    planned,
    actual,
    debtPayments,
    spent,
    saved: savedIn(txns, settings),
    savingsPct: actual.income ? ((actual.income - spent) / actual.income) * 100 : null,
    rows,
  }
}

export interface BudgetAlert {
  /** A category, or null for the whole budget. */
  category: string | null
  planned: number
  actual: number
  level: 'near' | 'over'
}

/** Categories (and the total) at or past `pct`% of their budget. */
export function budgetAlerts(s: MonthSummary, pct = 80): BudgetAlert[] {
  const out: BudgetAlert[] = []
  const check = (category: string | null, planned: number, actual: number) => {
    if (planned <= 0 || actual < (planned * pct) / 100) return
    out.push({ category, planned, actual, level: actual > planned ? 'over' : 'near' })
  }
  check(null, s.planned.expense, s.actual.expense)
  for (const r of s.rows.expense) check(r.category, r.planned, r.actual)
  return out
}
