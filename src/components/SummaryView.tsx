import { useMemo, useState } from 'react'
import { categoryIcon } from '../data/icons'
import { currentMonth, daysInMonth, formatCompact, formatWhole, shiftMonth, shortMonth, today } from '../data/month'
import { savedIn, spentIn, type CategoryRow, type MonthSummary } from '../data/summary'
import type { Account, Backend, Settings, Transaction } from '../data/types'
import { BalanceForm } from './BalanceForm'
import { BudgetRing, Legend, MonthsChart, PaceChart, SavedChart, type MonthBar, type PacePoint, type SavedBar } from './charts'

interface Props {
  backend: Backend
  month: string
  summary: MonthSummary
  txns: Transaction[]
  /** Transactions from the opening month (or 6 months back) through this month. */
  history: Transaction[]
  settings: Settings
  hasPlan: boolean
  onPlan: () => void
  onSelectMonth: (month: string) => void
}

const TREND_MONTHS = 6

export function SummaryView({ backend, month, summary: s, txns, history, settings, hasPlan, onPlan, onSelectMonth }: Props) {
  const { currency } = settings
  const money = (n: number) => formatWhole(n, currency)
  const compact = (n: number) => formatCompact(n, currency)
  // Hero tiles are narrow, so they drop the currency the headline already shows.
  const plain = (n: number) => Math.round(n).toLocaleString()
  const [updating, setUpdating] = useState<Account | null>(null)
  const plannedSpend = s.planned.expense
  const left = plannedSpend - s.actual.expense
  const pctSpent = plannedSpend > 0 ? (s.actual.expense / plannedSpend) * 100 : 0

  const pace = useMemo(() => pacePoints(month, txns, plannedSpend), [month, txns, plannedSpend])

  const trend = useMemo(() => {
    const from = shiftMonth(month, -(TREND_MONTHS - 1))
    return Array.from({ length: TREND_MONTHS }, (_, i) => {
      const m = shiftMonth(from, i)
      const list = history.filter((t) => t.month === m)
      return {
        month: m,
        label: shortMonth(m),
        income: list.filter((t) => t.kind === 'income').reduce((a, t) => a + t.amount, 0),
        expense: spentIn(list),
        saved: savedIn(list, settings),
        any: list.length > 0,
      }
    })
  }, [history, month, settings])
  const hasTrend = trend.filter((b) => b.any).length > 1

  const spending = s.rows.expense.filter((r) => r.planned || r.actual).sort((a, b) => b.actual - a.actual || b.planned - a.planned)
  const income = s.rows.income.filter((r) => r.planned || r.actual).sort((a, b) => b.actual - a.actual)
  const debts = settings.debts.filter((d) => (s.end.debts[d.name] ?? 0) > 0 || (s.start.debts[d.name] ?? 0) > 0)
  const totalDebt = debts.reduce((a, d) => a + (s.end.debts[d.name] ?? 0), 0)

  return (
    <div className="stack">
      <section className="hero">
        <div className="hero-main">
          <div>
            <span className="hero-label">{plannedSpend > 0 ? (left >= 0 ? 'Left to spend' : 'Over budget by') : 'Cash + bank'}</span>
            <div className="hero-value">{money(plannedSpend > 0 ? Math.abs(left) : s.liquidityEnd)}</div>
            <span className="hero-sub">
              {plannedSpend > 0 ? `${money(s.actual.expense)} spent of ${money(plannedSpend)} budget` : `Capital ${money(s.capital)}`}
            </span>
          </div>
          {plannedSpend > 0 && <BudgetRing pct={pctSpent} />}
        </div>
        <div className="stats">
          <Stat label="Income" value={plain(s.actual.income)} color="var(--income)" />
          <Stat label="Spent" value={plain(s.spent)} color="var(--expense)" />
          <Stat
            label={s.saved >= 0 ? 'Saved' : 'Overspent'}
            value={plain(Math.abs(s.saved))}
            tone={s.saved >= 0 ? 'good' : 'bad'}
            sub={s.savingsPct !== null ? `${s.savingsPct >= 0 ? '+' : ''}${s.savingsPct.toFixed(0)}% of income` : undefined}
          />
        </div>
      </section>

      {!hasPlan && (
        <button className="card hint" onClick={onPlan}>
          <span className="hint-icon">✎</span>
          <span>
            <strong>Set a budget for this month</strong>
            <span className="muted small">Choose how much you plan to spend per category, or copy last month's.</span>
          </span>
        </button>
      )}

      <section className="card">
        <div className="card-head">
          <h2>Accounts</h2>
          <span className="muted small">Capital {money(s.capital)}</span>
        </div>
        <ul className="plain-list accounts">
          {settings.accounts.map((a) => {
            const end = s.end.accounts[a.name] ?? 0
            const delta = end - (s.start.accounts[a.name] ?? 0)
            const interest = a.type === 'investment' ? (end * (a.interestPct ?? 0)) / 100 : 0
            return (
              <li key={a.name}>
                <span className="cat-icon">{categoryIcon(a.name)}</span>
                <span className="grow list-main">
                  <span>{a.name}</span>
                  <span className="muted small">
                    {delta === 0 ? 'No change' : `${delta > 0 ? '+' : '−'}${money(Math.abs(delta))} this month`}
                    {interest > 0 && ` · ~${money(interest)} interest (${a.interestPct}%)`}
                  </span>
                </span>
                <span className="account-end">
                  <strong>{money(end)}</strong>
                  {a.type === 'investment' && (
                    <button className="link small" onClick={() => setUpdating(a)}>
                      Update value
                    </button>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
        <div className="liquidity">
          <span className="muted small">Cash + bank</span>
          <span>
            <span className="muted">{money(s.liquidityStart)}</span> → <strong>{money(s.liquidityEnd)}</strong>
          </span>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Spending this month</h2>
          <span className="muted small">{money(s.spent)}</span>
        </div>
        <Legend
          items={[
            { label: 'Spent so far', color: 'var(--expense)' },
            ...(plannedSpend > 0 ? [{ label: 'Budget pace', color: 'var(--pace)', line: true }] : []),
          ]}
        />
        <PaceChart
          points={pace}
          format={money}
          axisFormat={compact}
          dayName={(d) => new Date(`${month}-${String(d).padStart(2, '0')}T00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
        />
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Where your money went</h2>
          <span className="muted small">vs budget</span>
        </div>
        {spending.length === 0 && !s.debtPayments ? (
          <p className="muted small">No expenses yet. Tap + to add one.</p>
        ) : (
          <>
            {spending.map((r) => (
              <CategoryBar key={r.category} row={r} money={money} />
            ))}
            {s.debtPayments > 0 && <CategoryBar row={{ category: 'Debt payments', planned: 0, actual: s.debtPayments, diff: 0 }} money={money} note="Paid back on your debts" />}
          </>
        )}
      </section>

      {debts.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h2>Debts</h2>
            <span className="muted small">{money(totalDebt)} owed</span>
          </div>
          {debts.map((d) => {
            const owed = s.end.debts[d.name] ?? 0
            const paid = txns.filter((t) => t.kind === 'repay' && t.debt === d.name).reduce((a, t) => a + t.amount, 0)
            const scale = Math.max(d.limit, owed, 1)
            return (
              <div className="cat-row" key={d.name}>
                <span className="cat-icon">{categoryIcon(d.name)}</span>
                <div className="cat-body">
                  <div className="cat-line">
                    <span>{d.name}</span>
                    <span>
                      <strong>{money(owed)}</strong>
                      {d.limit > 0 && <span className="muted"> / {money(d.limit)}</span>}
                    </span>
                  </div>
                  <div className="meter">
                    <div className="meter-plan debt-track" style={{ width: `${(d.limit / scale) * 100}%` }} />
                    <div className="meter-fill debt-fill" style={{ width: `${(owed / scale) * 100}%` }} />
                  </div>
                  <span className="small muted">
                    {paid > 0 ? `Paid ${money(paid)} this month` : 'No payment this month'}
                    {d.limit > 0 && ` · ${money(Math.max(0, d.limit - owed))} available`}
                  </span>
                </div>
              </div>
            )
          })}
        </section>
      )}

      {hasTrend && (
        <section className="card">
          <div className="card-head">
            <h2>Saved each month</h2>
            <span className="muted small">Tap a month to open it</span>
          </div>
          <Legend
            items={[
              { label: 'Saved', color: 'var(--income)' },
              { label: 'Overspent', color: 'var(--expense)' },
            ]}
          />
          <SavedChart bars={trend as SavedBar[]} current={month} format={money} axisFormat={compact} onSelect={onSelectMonth} />
        </section>
      )}

      {hasTrend && (
        <section className="card">
          <div className="card-head">
            <h2>Income vs spending</h2>
            <span className="muted small">Last {TREND_MONTHS} months</span>
          </div>
          <Legend
            items={[
              { label: 'Income', color: 'var(--income)' },
              { label: 'Spent', color: 'var(--expense)' },
            ]}
          />
          <MonthsChart bars={trend as MonthBar[]} current={month} format={money} axisFormat={compact} onSelect={onSelectMonth} />
        </section>
      )}

      {income.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h2>Income</h2>
            <span className="muted small">{money(s.actual.income)}</span>
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

      {updating && (
        <BalanceForm
          backend={backend}
          account={updating}
          month={month}
          current={s.end.accounts[updating.name] ?? 0}
          settings={settings}
          onClose={() => setUpdating(null)}
        />
      )}
    </div>
  )
}

function Stat({ label, value, color, tone, sub }: { label: string; value: string; color?: string; tone?: 'good' | 'bad'; sub?: string }) {
  return (
    <div className="stat">
      <span className="stat-label">
        {color && <i className="key-dot" style={{ background: color }} />}
        {label}
      </span>
      <strong className={tone ?? ''}>{value}</strong>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  )
}

function CategoryBar({ row, money, note }: { row: CategoryRow; money: (n: number) => string; note?: string }) {
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
        {note ? (
          <span className="small muted">{note}</span>
        ) : over ? (
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
  for (const t of txns) {
    if (t.kind !== 'expense' && t.kind !== 'repay') continue
    // Entries dated outside the month (e.g. late last month) count on day 1.
    const day = t.date.startsWith(month) ? Number(t.date.slice(8, 10)) : 1
    byDay[day] += t.amount
  }
  let total = 0
  return Array.from({ length: days }, (_, i) => {
    const day = i + 1
    total += byDay[day]
    return { day, spent: day <= lastDay ? total : null, pace: (plannedSpend * day) / days }
  })
}
