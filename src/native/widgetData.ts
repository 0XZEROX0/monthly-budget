import { goalProgress } from '../data/goals'
import { categoryIcon } from '../data/icons'
import { formatWhole, monthLabel, shiftDay, showTime, today } from '../data/month'
import { countsAsSpending, newestFirst, type MonthSummary } from '../data/summary'
import type { Settings, Transaction } from '../data/types'

/**
 * What the home screen widgets show, already formatted. The native side
 * (android/.../BoardWidget.java and its subclasses) only lays these strings out.
 */
export interface WidgetData {
  /** "November 2026" */
  month: string
  hidden: boolean
  plan: {
    income: string
    /** Empty when nothing is planned. */
    incomePlanned: string
    incomePct: number
    spent: string
    spentPlanned: string
    spentPct: number
    over: boolean
    /** "Left to spend" or "Over budget by" */
    leftLabel: string
    left: string
    saved: string
    savedPct: string
  }
  categories: { icon: string; name: string; spent: string; budget: string; pct: number; over: boolean }[]
  recent: { icon: string; title: string; sub: string; amount: string }[]
  /** Savings goals: saved / target, and a line like "40% · EGP 2,000/month to reach it by 31 Dec 2026". */
  goals: { icon: string; name: string; saved: string; target: string; pct: number; sub: string; late: boolean }[]
  accounts: { icon: string; name: string; value: string }[]
  /** Cash + bank */
  liquidity: string
  capital: string
  debts: string
}

const HIDDEN = '•••••'

/** How a date reads on a widget: Today, Yesterday, or Mon 3 Nov. */
function when(t: Transaction, clock12?: boolean) {
  const now = today()
  const day = t.date === now ? 'Today' : t.date === shiftDay(now, -1) ? 'Yesterday' : new Date(t.date + 'T00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  return t.time ? `${day}, ${showTime(t.time, clock12)}` : day
}

export function widgetData(month: string, s: MonthSummary, settings: Settings, txns: Transaction[], hidden: boolean): WidgetData {
  const money = (n: number) => (hidden ? HIDDEN : formatWhole(n, settings.currency))
  const pct = (a: number, b: number) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0)
  const budget = s.planned.expense
  const left = budget - s.actual.expense

  const categories = s.rows.expense
    .filter((r) => r.planned > 0 || r.actual > 0)
    .map((r) => ({
      icon: categoryIcon(r.category),
      name: r.category,
      spent: money(r.actual),
      budget: r.planned > 0 ? money(r.planned) : 'No budget',
      pct: r.planned > 0 ? pct(r.actual, r.planned) : 100,
      over: r.planned > 0 ? r.actual > r.planned : r.actual > 0,
    }))
    .slice(0, 40)

  const recent = txns
    .filter(countsAsSpending)
    .sort(newestFirst)
    .slice(0, 20)
    .map((t) => ({
      icon: categoryIcon(t.category || t.debt || ''),
      title: t.description || t.category || t.debt || 'Expense',
      sub: [t.category || t.debt, when(t, settings.clock12)].filter(Boolean).join(' · '),
      amount: hidden ? HIDDEN : `−${formatWhole(t.amount, settings.currency)}`,
    }))

  const accounts = settings.accounts.map((a) => {
    const end = s.end.accounts[a.name] ?? 0
    const interest = a.type === 'investment' ? (end * (a.interestPct ?? 0)) / 100 : 0
    return { icon: categoryIcon(a.name), name: a.name, value: money(end + interest) }
  })
  const dateLabel = (iso: string) => new Date(iso + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  const goals = (settings.goals ?? []).map((g) => {
    const p = goalProgress(g, s.end)
    const done = p.left <= 0
    const late = !done && p.daysLeft !== null && p.daysLeft < 0
    const status = done
      ? 'Reached!'
      : late
        ? `Deadline passed ${dateLabel(g.deadline!)}`
        : p.perMonth !== null
          ? `${money(p.perMonth)}/month to reach it by ${dateLabel(g.deadline!)}`
          : `${money(p.left)} to go`
    return {
      icon: done ? '🎉' : categoryIcon(g.accounts[0] ?? 'saving'),
      name: g.name,
      saved: money(p.saved),
      target: money(g.target),
      pct: Math.round(p.pct),
      sub: `${Math.round(p.pct)}% · ${status}`,
      late,
    }
  })
  const owed = Object.values(s.end.debts).reduce((a, b) => a + Math.max(0, b), 0)

  return {
    month: monthLabel(month),
    hidden,
    plan: {
      income: money(s.actual.income),
      incomePlanned: s.planned.income > 0 ? money(s.planned.income) : '',
      incomePct: pct(s.actual.income, s.planned.income),
      spent: money(s.actual.expense),
      spentPlanned: budget > 0 ? money(budget) : '',
      spentPct: pct(s.actual.expense, budget),
      over: budget > 0 && left < 0,
      leftLabel: budget <= 0 ? 'No budget set' : left >= 0 ? 'Left to spend' : 'Over budget by',
      left: budget <= 0 ? '' : money(Math.abs(left)),
      saved: money(s.saved),
      savedPct: s.savingsPct == null || hidden ? '' : `${Math.round(s.savingsPct)}%`,
    },
    categories,
    recent,
    goals,
    accounts,
    liquidity: money(s.liquidityEnd),
    capital: money(s.capital),
    debts: owed > 0 ? money(owed) : '',
  }
}
