import { useMemo, useState } from 'react'
import { useRange } from '../data/hooks'
import { categoryIcon } from '../data/icons'
import { formatCompact, formatWhole, monthLabel, shiftMonth, shortMonth } from '../data/month'
import { balancesBefore, savedIn, spentIn } from '../data/summary'
import type { Backend, Settings } from '../data/types'
import { Legend, LineChart, MonthsChart, SavedChart } from './charts'

const PERIODS = [3, 6, 12] as const
const MASK = '•••••'

/** Trends over several months: income vs spending, saved, capital, and where the money went. */
export function ReportsView({ backend, settings, month, hidden, onSelectMonth }: { backend: Backend; settings: Settings; month: string; hidden: boolean; onSelectMonth: (m: string) => void }) {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>(6)
  const from = shiftMonth(month, -(period - 1))
  // The same length before, to compare against, and everything from the opening for balances.
  const prevFrom = shiftMonth(from, -period)
  const opening = settings.opening.month
  const history = useRange(backend, opening < prevFrom ? opening : prevFrom, month)
  const { currency } = settings
  const money = (n: number) => formatWhole(n, currency)
  const compact = (n: number) => formatCompact(n, currency)
  const secret = (n: number) => (hidden ? MASK : money(n))

  const data = useMemo(() => {
    if (!history) return null
    const months = Array.from({ length: period }, (_, i) => shiftMonth(from, i))
    const bars = months.map((m) => {
      const list = history.filter((t) => t.month === m)
      const capitalAt = balancesBefore(shiftMonth(m, 1), settings, history)
      return {
        month: m,
        label: shortMonth(m),
        income: list.filter((t) => t.kind === 'income').reduce((a, t) => a + t.amount, 0),
        expense: spentIn(list),
        saved: savedIn(list, settings),
        value: settings.accounts.reduce((a, acc) => a + (capitalAt.accounts[acc.name] ?? 0), 0),
      }
    })
    const inPeriod = history.filter((t) => t.month >= from && t.month <= month)
    const before = history.filter((t) => t.month >= prevFrom && t.month < from)
    const byCat = (list: typeof history) => {
      const out: Record<string, number> = {}
      for (const t of list) {
        if (t.notSpending) continue
        const cat = t.kind === 'expense' ? t.category || 'Other' : t.kind === 'repay' ? settings.debtCategory || 'Debt payments' : null
        if (cat) out[cat] = (out[cat] ?? 0) + t.amount
      }
      return out
    }
    const now = byCat(inPeriod)
    const prev = byCat(before)
    const hadPrev = before.length > 0
    const cats = Object.entries(now)
      .map(([category, total]) => ({ category, total, avg: total / period, change: hadPrev && prev[category] ? ((total - prev[category]) / prev[category]) * 100 : null }))
      .sort((a, b) => b.total - a.total)
    const income = bars.reduce((a, b) => a + b.income, 0)
    const spent = bars.reduce((a, b) => a + b.expense, 0)
    return { bars, cats, income, spent, saved: bars.reduce((a, b) => a + b.saved, 0), rate: income ? ((income - spent) / income) * 100 : null }
  }, [history, period, from, prevFrom, month, settings])

  if (!data) return <p className="center muted">Loading…</p>
  const topCat = data.cats[0]?.total ?? 1

  return (
    <div className="stack">
      <div className="segmented three">
        {PERIODS.map((p) => (
          <button key={p} className={p === period ? 'active' : ''} onClick={() => setPeriod(p)}>
            {p} months
          </button>
        ))}
      </div>
      <p className="muted small center-text">
        {monthLabel(from)} to {monthLabel(month)}
      </p>

      <section className="card">
        <div className="stats report-stats">
          <div className="stat">
            <span className="stat-label">Income</span>
            <strong>{hidden ? MASK : compact(data.income)}</strong>
            <span className="stat-sub">{hidden ? '' : `${compact(data.income / period)}/mo`}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Spent</span>
            <strong>{hidden ? MASK : compact(data.spent)}</strong>
            <span className="stat-sub">{hidden ? '' : `${compact(data.spent / period)}/mo`}</span>
          </div>
          <div className="stat">
            <span className="stat-label">{data.saved >= 0 ? 'Saved' : 'Overspent'}</span>
            <strong className={data.saved >= 0 ? 'good' : 'bad'}>{compact(Math.abs(data.saved))}</strong>
            <span className="stat-sub">{data.rate !== null ? `${data.rate.toFixed(0)}% of income` : ''}</span>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Income vs spending</h2>
          <span className="muted small">Tap a month to open it</span>
        </div>
        <Legend
          items={[
            { label: 'Income', color: 'var(--income)' },
            { label: 'Spent', color: 'var(--expense)' },
          ]}
        />
        {hidden ? <p className="muted small">Hidden in privacy mode.</p> : <MonthsChart bars={data.bars} current={month} format={money} axisFormat={compact} onSelect={onSelectMonth} />}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Saved each month</h2>
        </div>
        <SavedChart bars={data.bars} current={month} format={money} axisFormat={compact} onSelect={onSelectMonth} />
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Capital</h2>
          <span className="muted small">{secret(data.bars[data.bars.length - 1]?.value ?? 0)}</span>
        </div>
        <p className="muted small">All your accounts at the end of each month.</p>
        {hidden ? <p className="muted small">Hidden in privacy mode.</p> : <LineChart points={data.bars} current={month} format={money} axisFormat={compact} label="Accounts total by month" onSelect={onSelectMonth} />}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Spending by category</h2>
          <span className="muted small">vs the {period} months before</span>
        </div>
        {data.cats.length === 0 ? (
          <p className="muted small">No spending in these months.</p>
        ) : (
          data.cats.map((c) => (
            <div className="cat-row" key={c.category}>
              <span className="cat-icon">{categoryIcon(c.category)}</span>
              <div className="cat-body">
                <div className="cat-line">
                  <span>{c.category}</span>
                  <strong>{money(c.total)}</strong>
                </div>
                <div className="meter">
                  <div className="meter-fill" style={{ width: `${(c.total / topCat) * 100}%` }} />
                </div>
                <span className="small muted">
                  {money(c.avg)}/month
                  {c.change !== null && (
                    <span className={c.change > 0 ? 'status-critical' : 'good'}>
                      {' · '}
                      {c.change > 0 ? '▲' : '▼'} {Math.abs(c.change).toFixed(0)}%
                    </span>
                  )}
                </span>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  )
}
