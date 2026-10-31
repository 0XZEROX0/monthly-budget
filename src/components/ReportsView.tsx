import { useMemo, useState } from 'react'
import { useRange } from '../data/hooks'
import { categoryIcon } from '../data/icons'
import { currentMonth, dayLabel, daysInMonth, formatCompact, formatWhole, monthLabel, shiftDay, shiftMonth, shortDay, shortMonth, today } from '../data/month'
import { balancesBefore, balancesThrough, savedIn, spentIn } from '../data/summary'
import type { Backend, Settings, Transaction } from '../data/types'
import { Legend, LineChart, MonthsChart, SavedChart } from './charts'

/** Report ranges: a few days counted back from today, or whole months back from the month on screen. */
const PERIODS = [
  { id: 'd1', label: 'Day', days: 1, before: 'the day before' },
  { id: 'd3', label: '3 days', days: 3, before: 'the 3 days before' },
  { id: 'd7', label: 'Week', days: 7, before: 'the week before' },
  { id: 'm3', label: '3 months', months: 3, before: 'the 3 months before' },
  { id: 'm6', label: '6 months', months: 6, before: 'the 6 months before' },
  { id: 'm12', label: '12 months', months: 12, before: 'the 12 months before' },
] as const
type Period = (typeof PERIODS)[number]
const MASK = '•••••'

/** Trends over a few days or several months: income vs spending, saved, capital, and where the money went. */
export function ReportsView({ backend, settings, month, hidden, onSelectMonth }: { backend: Backend; settings: Settings; month: string; hidden: boolean; onSelectMonth: (m: string) => void }) {
  const [periodId, setPeriodId] = useState<Period['id']>('m6')
  const period: Period = PERIODS.find((p) => p.id === periodId) ?? PERIODS[4]
  const byDay = 'days' in period
  const count = byDay ? period.days : period.months
  // Day ranges end today, or on the last day of a past month being viewed.
  const end = byDay ? (month === currentMonth() ? today() : `${month}-${String(daysInMonth(month)).padStart(2, '0')}`) : month
  const from = byDay ? shiftDay(end, -(count - 1)) : shiftMonth(month, -(count - 1))
  // The same length before, to compare against, and everything from the opening for balances.
  const prevFrom = byDay ? shiftDay(from, -count) : shiftMonth(from, -count)
  const opening = settings.opening.month
  const firstMonth = prevFrom.slice(0, 7)
  const history = useRange(backend, opening < firstMonth ? opening : firstMonth, end.slice(0, 7))
  const { currency } = settings
  const money = (n: number) => formatWhole(n, currency)
  const compact = (n: number) => formatCompact(n, currency)
  const secret = (n: number) => (hidden ? MASK : money(n))
  const unit = byDay ? 'day' : 'month'

  const data = useMemo(() => {
    if (!history) return null
    const keys = Array.from({ length: count }, (_, i) => (byDay ? shiftDay(from, i) : shiftMonth(from, i)))
    const keyOf = (t: Transaction) => (byDay ? t.date : t.month)
    const bars = keys.map((k) => {
      const list = history.filter((t) => keyOf(t) === k)
      const capitalAt = byDay ? balancesThrough(k, settings, history) : balancesBefore(shiftMonth(k, 1), settings, history)
      return {
        month: k,
        label: byDay ? shortDay(k, count < 7) : shortMonth(k),
        income: list.filter((t) => t.kind === 'income').reduce((a, t) => a + t.amount, 0),
        expense: spentIn(list),
        saved: savedIn(list, settings),
        value: settings.accounts.reduce((a, acc) => a + (capitalAt.accounts[acc.name] ?? 0), 0),
      }
    })
    const inPeriod = history.filter((t) => keyOf(t) >= from && keyOf(t) <= end)
    const before = history.filter((t) => keyOf(t) >= prevFrom && keyOf(t) < from)
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
      .map(([category, total]) => ({ category, total, avg: total / count, change: hadPrev && prev[category] ? ((total - prev[category]) / prev[category]) * 100 : null }))
      .sort((a, b) => b.total - a.total)
    const income = bars.reduce((a, b) => a + b.income, 0)
    const spent = bars.reduce((a, b) => a + b.expense, 0)
    return { bars, cats, income, spent, saved: bars.reduce((a, b) => a + b.saved, 0), rate: income ? ((income - spent) / income) * 100 : null }
  }, [history, count, byDay, from, prevFrom, end, settings])

  if (!data) return <p className="center muted">Loading…</p>
  const topCat = data.cats[0]?.total ?? 1
  const rangeLabel = !byDay ? `${monthLabel(from)} to ${monthLabel(month)}` : count === 1 ? dayLabel(end) : `${dayLabel(from)} to ${dayLabel(end)}`
  const perUnit = (n: number) => (hidden || count === 1 ? '' : `${compact(n / count)}/${byDay ? 'day' : 'mo'}`)
  const openBar = (k: string) => onSelectMonth(k.slice(0, 7))
  // One bar says nothing a chart can add, so a single day shows just the totals and categories.
  const charts = count > 1

  return (
    <div className="stack">
      <div className="segmented three">
        {PERIODS.map((p) => (
          <button key={p.id} className={p.id === period.id ? 'active' : ''} onClick={() => setPeriodId(p.id)}>
            {p.label}
          </button>
        ))}
      </div>
      <p className="muted small center-text">{rangeLabel}</p>

      <section className="card">
        <div className="stats report-stats">
          <div className="stat">
            <span className="stat-label">Income</span>
            <strong>{hidden ? MASK : compact(data.income)}</strong>
            <span className="stat-sub">{perUnit(data.income)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Spent</span>
            <strong>{hidden ? MASK : compact(data.spent)}</strong>
            <span className="stat-sub">{perUnit(data.spent)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">{data.saved >= 0 ? 'Saved' : 'Overspent'}</span>
            <strong className={data.saved >= 0 ? 'good' : 'bad'}>{compact(Math.abs(data.saved))}</strong>
            <span className="stat-sub">{data.rate !== null ? `${data.rate.toFixed(0)}% of income` : ''}</span>
          </div>
        </div>
      </section>

      {charts && (
        <>
          <section className="card">
            <div className="card-head">
              <h2>Income vs spending</h2>
              <span className="muted small">{byDay ? 'Tap a day to open its month' : 'Tap a month to open it'}</span>
            </div>
            <Legend
              items={[
                { label: 'Income', color: 'var(--income)' },
                { label: 'Spent', color: 'var(--expense)' },
              ]}
            />
            {hidden ? <p className="muted small">Hidden in privacy mode.</p> : <MonthsChart bars={data.bars} current={end} format={money} axisFormat={compact} onSelect={openBar} />}
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Saved each {unit}</h2>
            </div>
            <SavedChart bars={data.bars} current={end} format={money} axisFormat={compact} onSelect={openBar} />
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Capital</h2>
              <span className="muted small">{secret(data.bars[data.bars.length - 1]?.value ?? 0)}</span>
            </div>
            <p className="muted small">All your accounts at the end of each {unit}.</p>
            {hidden ? <p className="muted small">Hidden in privacy mode.</p> : <LineChart points={data.bars} current={end} format={money} axisFormat={compact} label={`Accounts total by ${unit}`} onSelect={openBar} />}
          </section>
        </>
      )}

      <section className="card">
        <div className="card-head">
          <h2>Spending by category</h2>
          <span className="muted small">vs {period.before}</span>
        </div>
        {data.cats.length === 0 ? (
          <p className="muted small">{byDay ? 'No spending on these days.' : 'No spending in these months.'}</p>
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
                  {count > 1 && `${money(c.avg)}/${unit}`}
                  {c.change !== null && (
                    <span className={c.change > 0 ? 'status-critical' : 'good'}>
                      {count > 1 && ' · '}
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
