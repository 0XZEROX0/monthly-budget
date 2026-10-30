import { useMemo, useState } from 'react'
import { categoryIcon } from '../data/icons'
import { currentMonth, daysInMonth, formatCompact, formatWhole, shiftMonth, shortMonth, today } from '../data/month'
import { budgetAlerts, savedIn, spentIn, type CategoryRow, type MonthSummary } from '../data/summary'
import type { Account, Backend, Settings, Transaction } from '../data/types'
import { BalanceForm } from './BalanceForm'
import { BillsCard } from './Bills'
import { GoalsCard } from './Goals'
import type { ListFocus } from './TransactionList'
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
  /** Opens the Transactions tab filtered to a category, account or debt. */
  onOpen: (f: ListFocus) => void
  /** Privacy mode: hide balances, capital, debts, income and spending totals. */
  hidden: boolean
  /** Opens Settings at the savings goals. */
  onEditGoals: () => void
}

const TREND_MONTHS = 6
const MASK = '•••••'

export function SummaryView({ backend, month, summary: s, txns, history, settings, hasPlan, onPlan, onSelectMonth, onOpen, hidden, onEditGoals }: Props) {
  const { currency } = settings
  const money = (n: number) => formatWhole(n, currency)
  const compact = (n: number) => formatCompact(n, currency)
  // Hero tiles are narrow, so they drop the currency the headline already shows.
  const plain = (n: number) => (hidden ? MASK : Math.round(n).toLocaleString())
  // Wealth figures that privacy mode hides; budgets and categories stay visible.
  const secret = (n: number) => (hidden ? MASK : money(n))
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
  const alerts = settings.alerts?.off ? [] : budgetAlerts(s, settings.alerts?.pct ?? 80)

  return (
    <div className="stack">
      <section className="hero">
        <div className="hero-main">
          <div>
            <span className="hero-label">{plannedSpend > 0 ? (left >= 0 ? 'Left to spend' : 'Over budget by') : 'Cash + bank'}</span>
            <div className="hero-value">{plannedSpend > 0 ? money(Math.abs(left)) : secret(s.liquidityEnd)}</div>
            <span className="hero-sub">
              {plannedSpend > 0 ? `${secret(s.actual.expense)} spent of ${money(plannedSpend)} budget` : `Capital ${secret(s.capital)}`}
            </span>
          </div>
          {plannedSpend > 0 && <BudgetRing pct={pctSpent} />}
        </div>
        <div className="stats">
          <Stat label="Income" value={plain(s.actual.income)} color="var(--income)" />
          <Stat label="Spent" value={plain(s.spent)} color="var(--expense)" />
          <Stat
            label={s.saved >= 0 ? 'Saved' : 'Overspent'}
            value={Math.round(Math.abs(s.saved)).toLocaleString()}
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

      {alerts.length > 0 && (
        <section className="card alerts">
          <div className="card-head">
            <h2>Budget alerts</h2>
          </div>
          <ul className="plain-list">
            {alerts.map((a) => (
              <li key={a.category ?? '*'}>
                <button className="row-link grow" onClick={() => (a.category ? onOpen({ kind: 'category', value: a.category }) : onPlan())}>
                  <span className="cat-icon">{a.level === 'over' ? '⚠️' : a.category ? categoryIcon(a.category) : '📊'}</span>
                  <span className="grow list-main">
                    <span>{a.category ?? 'Whole budget'}</span>
                    <span className={`small ${a.level === 'over' ? 'status-critical' : 'status-warning'}`}>
                      {a.level === 'over' ? `Over by ${money(a.actual - a.planned)}` : `${Math.round((a.actual / a.planned) * 100)}% used · ${money(a.planned - a.actual)} left`}
                    </span>
                  </span>
                  <span className="chevron" aria-hidden>›</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <BillsCard backend={backend} settings={settings} month={month} txns={txns} />

      <section className="card">
        <div className="card-head">
          <h2>Accounts</h2>
          <span className="muted small">Capital {secret(s.capital)}</span>
        </div>
        <ul className="plain-list accounts">
          {settings.accounts.map((a) => {
            const end = s.end.accounts[a.name] ?? 0
            const delta = end - (s.start.accounts[a.name] ?? 0)
            const interest = a.type === 'investment' ? (end * (a.interestPct ?? 0)) / 100 : 0
            return (
              <li key={a.name}>
                <button className="row-link grow" onClick={() => onOpen({ kind: 'account', value: a.name })}>
                <span className="cat-icon">{categoryIcon(a.name)}</span>
                <span className="grow list-main">
                  <span>{a.name}</span>
                  <span className="muted small">
                    {hidden ? 'Amount hidden' : delta === 0 ? 'No change' : `${delta > 0 ? '+' : '−'}${money(Math.abs(delta))} this month`}
                    {interest > 0 && !hidden && ` · ~${money(interest)} interest (${a.interestPct}%)`}
                  </span>
                </span>
                </button>
                <span className="account-end">
                  <strong>{secret(end)}</strong>
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
            <span className="muted">{secret(s.liquidityStart)}</span> → <strong>{secret(s.liquidityEnd)}</strong>
          </span>
        </div>
      </section>

      <GoalsCard settings={settings} balances={s.end} hidden={hidden} onEdit={onEditGoals} />

      <section className="card">
        <div className="card-head">
          <h2>Spending this month</h2>
          <span className="muted small">{secret(s.spent)}</span>
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
              <CategoryBar key={r.category} row={r} money={money} onOpen={() => onOpen({ kind: 'category', value: r.category })} />
            ))}
            {s.debtPayments > 0 && !settings.categories.expense.includes(settings.debtCategory ?? '') && <CategoryBar row={{ category: 'Debt payments', planned: 0, actual: s.debtPayments, diff: 0 }} money={money} note="Paid back on your debts" onOpen={() => onOpen({ kind: 'debtPayments' })} />}
          </>
        )}
      </section>

      {debts.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h2>Debts</h2>
            <span className="muted small">{secret(totalDebt)} owed</span>
          </div>
          {debts.map((d) => {
            const owed = s.end.debts[d.name] ?? 0
            const paid = txns.filter((t) => t.kind === 'repay' && t.debt === d.name).reduce((a, t) => a + t.amount, 0)
            const scale = Math.max(d.limit, owed, 1)
            return (
              <button className="cat-row row-link" key={d.name} onClick={() => onOpen({ kind: 'debt', value: d.name })}>
                <span className="cat-icon">{categoryIcon(d.name)}</span>
                <div className="cat-body">
                  <div className="cat-line">
                    <span>{d.name}</span>
                    <span>
                      <strong>{secret(owed)}</strong>
                      {d.limit > 0 && <span className="muted"> / {money(d.limit)}</span>}
                    </span>
                  </div>
                  <div className="meter">
                    <div className="meter-plan debt-track" style={{ width: `${(d.limit / scale) * 100}%` }} />
                    <div className="meter-fill debt-fill" style={{ width: `${(owed / scale) * 100}%` }} />
                  </div>
                  <span className="small muted">
                    {paid > 0 ? `Paid ${money(paid)} this month` : 'No payment this month'}
                    {d.limit > 0 && ` · ${secret(Math.max(0, d.limit - owed))} available`}
                  </span>
                </div>
              </button>
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
          {hidden ? (
            <p className="muted small">Hidden in privacy mode.</p>
          ) : (
            <MonthsChart bars={trend as MonthBar[]} current={month} format={money} axisFormat={compact} onSelect={onSelectMonth} />
          )}
        </section>
      )}

      {income.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h2>Income</h2>
            <span className="muted small">{secret(s.actual.income)}</span>
          </div>
          <ul className="plain-list">
            {income.map((r) => (
              <li key={r.category}>
                <button className="row-link grow" onClick={() => onOpen({ kind: 'category', value: r.category })}>
                  <span className="cat-icon">{categoryIcon(r.category)}</span>
                  <span className="grow">{r.category}</span>
                  <span className="muted small">{r.planned ? `of ${money(r.planned)}` : ''}</span>
                  <strong>{secret(r.actual)}</strong>
                </button>
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

function CategoryBar({ row, money, note, onOpen }: { row: CategoryRow; money: (n: number) => string; note?: string; onOpen: () => void }) {
  const scale = Math.max(row.planned, row.actual, 1)
  const over = row.planned > 0 && row.actual > row.planned
  return (
    <button className="cat-row row-link" onClick={onOpen} aria-label={`${row.category}: see transactions`}>
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
      <span className="chevron" aria-hidden>›</span>
    </button>
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
