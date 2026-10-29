import { useMemo } from 'react'
import { useRange } from '../data/hooks'
import { categoryIcon } from '../data/icons'
import { currentMonth, daysInMonth, formatCompact, formatWhole, shiftMonth, shortMonth, today } from '../data/month'
import type { CategoryRow, MonthSummary } from '../data/summary'
import type { Backend, Transaction } from '../data/types'
import { BudgetRing, Legend, MonthsChart, PaceChart, type MonthBar, type PacePoint } from './charts'

interface Props {
  backend: Backend
  month: string
  summary: MonthSummary
  txns: Transaction[]
  currency: string
  hasPlan: boolean
  onPlan: () => void
  onSelectMonth: (month: string) => void
}

const TREND_MONTHS = 6

export function SummaryView({ backend, month, summary: s, txns, currency, hasPlan, onPlan, onSelectMonth }: Props) {
  const money = (n: number) => formatWhole(n, currency)
  const compact = (n: number) => formatCompact(n, currency)
  const plannedSpend = s.planned.expense
  const left = plannedSpend - s.actual.expense
  const pctSpent = plannedSpend > 0 ? (s.actual.expense / plannedSpend) * 100 : 0

  const pace = useMemo(() => pacePoints(month, txns, plannedSpend), [month, txns, plannedSpend])

  const from = shiftMonth(month, -(TREND_MONTHS - 1))
  const range = useRange(backend, from, month)
  const bars = useMemo<MonthBar[]>(() => {
    const list = Array.from({ length: TREND_MONTHS }, (_, i) => {
      const m = shiftMonth(from, i)
      return { month: m, label: shortMonth(m), income: 0, expense: 0 }
    })
    for (const t of range ?? []) {
      const b = list.find((x) => x.month === t.month)
      if (b) b[t.kind] += t.amount
    }
    return list
  }, [range, from])

  const spending = s.rows.expense.filter((r) => r.planned || r.actual).sort((a, b) => b.actual - a.actual || b.planned - a.planned)
  const income = s.rows.income.filter((r) => r.planned || r.actual).sort((a, b) => b.actual - a.actual)
  const hasTrend = bars.some((b) => b.income || b.expense)

  return (
    <div className="stack">
      <section className="hero">
        <div className="hero-main">
          <div>
            <span className="hero-label">{plannedSpend > 0 ? (left >= 0 ? 'Left to spend' : 'Over budget by') : 'Balance'}</span>
            <div className="hero-value">{money(plannedSpend > 0 ? Math.abs(left) : s.endingBalance)}</div>
            <span className="hero-sub">
              {plannedSpend > 0 ? `${money(s.actual.expense)} spent of ${money(plannedSpend)}` : `Started the month at ${money(s.startingBalance)}`}
            </span>
          </div>
          {plannedSpend > 0 && <BudgetRing pct={pctSpent} />}
        </div>
        <div className="stats">
          <Stat label="Income" value={money(s.actual.income)} color="var(--income)" />
          <Stat label="Expenses" value={money(s.actual.expense)} color="var(--expense)" />
          <Stat label={s.saved >= 0 ? 'Saved' : 'Overspent'} value={money(Math.abs(s.saved))} tone={s.saved >= 0 ? 'good' : 'bad'} />
        </div>
      </section>

      {!hasPlan && (
        <button className="card hint" onClick={onPlan}>
          <span className="hint-icon">✎</span>
          <span>
            <strong>Set a budget for this month</strong>
            <span className="muted small">Add your starting balance and how much you plan to spend per category.</span>
          </span>
        </button>
      )}

      <section className="card">
        <div className="card-head">
          <h2>Spending this month</h2>
          <span className="muted small">Ending balance {money(s.endingBalance)}</span>
        </div>
        <Legend
          items={[
            { label: 'Spent so far', color: 'var(--expense)' },
            ...(plannedSpend > 0 ? [{ label: 'Budget pace', color: 'var(--pace)', line: true }] : []),
          ]}
        />
        <PaceChart points={pace} format={money} axisFormat={compact} dayName={(d) => new Date(`${month}-${String(d).padStart(2, '0')}T00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} />
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Where your money went</h2>
          <span className="muted small">vs budget</span>
        </div>
        {spending.length === 0 ? <p className="muted small">No expenses yet. Tap + to add one.</p> : spending.map((r) => <CategoryBar key={r.category} row={r} money={money} />)}
      </section>

      {hasTrend && (
        <section className="card">
          <div className="card-head">
            <h2>Last {TREND_MONTHS} months</h2>
            <span className="muted small">Tap a month to open it</span>
          </div>
          <Legend
            items={[
              { label: 'Income', color: 'var(--income)' },
              { label: 'Expenses', color: 'var(--expense)' },
            ]}
          />
          <MonthsChart bars={bars} current={month} format={money} axisFormat={compact} onSelect={onSelectMonth} />
        </section>
      )}

      {income.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h2>Income</h2>
            <span className="muted small">
              {money(s.actual.income)} of {money(s.planned.income)} planned
            </span>
          </div>
          <ul className="plain-list">
            {income.map((r) => (
              <li key={r.category}>
                <span className="cat-icon">{categoryIcon(r.category)}</span>
                <span className="grow">{r.category}</span>
                <span className="muted small">{r.planned ? `of ${money(r.planned)}` : ''}</span>
                <strong>{money(r.actual)}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function Stat({ label, value, color, tone }: { label: string; value: string; color?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="stat">
      <span className="stat-label">
        {color && <i className="key-dot" style={{ background: color }} />}
        {label}
      </span>
      <strong className={tone ?? ''}>{value}</strong>
    </div>
  )
}

function CategoryBar({ row, money }: { row: CategoryRow; money: (n: number) => string }) {
  const scale = Math.max(row.planned, row.actual, 1)
  const over = row.planned > 0 && row.actual > row.planned
  return (
    <div className="cat-row">
      <span className="cat-icon">{categoryIcon(row.category)}</span>
      <div className="cat-body">
        <div className="cat-line">
          <span>{row.category}</span>
          <span>
            <strong>{money(row.actual)}</strong>
            {row.planned > 0 && <span className="muted"> / {money(row.planned)}</span>}
          </span>
        </div>
        <div className="meter" title={`${money(row.actual)} of ${money(row.planned)}`}>
          {row.planned > 0 && <div className="meter-plan" style={{ width: `${(row.planned / scale) * 100}%` }} />}
          <div className={`meter-fill ${over ? 'over' : ''}`} style={{ width: `${(row.actual / scale) * 100}%` }} />
        </div>
        {over ? (
          <span className="small status-critical">⚠ Over by {money(row.actual - row.planned)}</span>
        ) : row.planned > 0 ? (
          <span className="small muted">{money(row.planned - row.actual)} left</span>
        ) : (
          <span className="small muted">No budget set</span>
        )}
      </div>
    </div>
  )
}

function pacePoints(month: string, txns: Transaction[], plannedSpend: number): PacePoint[] {
  const days = daysInMonth(month)
  const now = currentMonth()
  // Future months have nothing spent yet; the current month stops at today.
  const lastDay = month < now ? days : month > now ? 0 : Number(today().slice(8, 10))
  const byDay = new Array<number>(days + 1).fill(0)
  for (const t of txns) if (t.kind === 'expense') byDay[Number(t.date.slice(8, 10))] += t.amount
  let total = 0
  return Array.from({ length: days }, (_, i) => {
    const day = i + 1
    total += byDay[day]
    return { day, spent: day <= lastDay ? total : null, pace: (plannedSpend * day) / days }
  })
}
