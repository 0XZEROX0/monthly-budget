import { useMemo, useState } from 'react'
import { useRange } from '../data/hooks'
import { categoryIcon } from '../data/icons'
import { currentMonth, dayLabel, daysInMonth, formatCompact, formatWhole, monthLabel, shiftDay, shiftMonth, shortDay, shortMonth, today } from '../data/month'
import { balancesBefore, balancesThrough, countsAsIncome, savedIn, spentIn } from '../data/summary'
import type { Backend, Settings, Transaction } from '../data/types'
import { Legend, LineChart, MonthsChart, SavedChart } from './charts'
import { askChoice, askForm, askMonth, showAlert } from './dialog'

/** Report ranges: a few days counted back from today (or yesterday), or whole months back from the month on screen. */
const PERIODS = [
  { id: 'd1', label: 'Day', days: 1, before: 'the day before' },
  { id: 'y', label: 'Yesterday', days: 1, back: 1, before: 'the day before' },
  { id: 'd7', label: 'Week', days: 7, before: 'the week before' },
  { id: 'm3', label: '3 months', months: 3, before: 'the 3 months before' },
  { id: 'm6', label: '6 months', months: 6, before: 'the 6 months before' },
  { id: 'm12', label: '12 months', months: 12, before: 'the 12 months before' },
] as const
type Period = (typeof PERIODS)[number]
/** A preset, one calendar month, or any dates from and to. */
type Choice = { id: Period['id'] } | { id: 'month'; month: string } | { id: 'custom'; from: string; to: string }
const MASK = '•••••'
/** Custom ranges longer than this show a bar per month instead of per day. */
const MAX_DAY_BARS = 62
const DEFAULT: Choice = { id: 'm6' }

// The last range picked stays picked on this phone, across tabs and restarts.
const RANGE_KEY = 'reports-range'
const DATE = /^\d{4}-\d{2}-\d{2}$/
const savedRange = (): Choice => {
  try {
    const raw = localStorage.getItem(RANGE_KEY) ?? ''
    // Older builds saved just the preset's id.
    const c = (raw.startsWith('{') ? JSON.parse(raw) : { id: raw }) as Choice
    if (c.id === 'month') return /^\d{4}-\d{2}$/.test(c.month) ? c : DEFAULT
    if (c.id === 'custom') return DATE.test(c.from) && DATE.test(c.to) ? c : DEFAULT
    return PERIODS.some((p) => p.id === c.id) ? c : DEFAULT
  } catch {
    return DEFAULT
  }
}
const saveRange = (c: Choice) => {
  try {
    localStorage.setItem(RANGE_KEY, JSON.stringify(c))
  } catch {
    // Storage blocked: the pick lasts until the app closes.
  }
}

const lastDayOf = (m: string) => `${m}-${String(daysInMonth(m)).padStart(2, '0')}`
const daysBetween = (a: string, b: string) => Math.round((new Date(b + 'T00:00').getTime() - new Date(a + 'T00:00').getTime()) / 86_400_000)
const shortDate = (d: string) => {
  const date = new Date(d + 'T00:00')
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(!sameYear && { year: 'numeric' }) })
}
const monthsFrom = (a: string, b: string) => {
  const out: string[] = []
  for (let m = a; m <= b; m = shiftMonth(m, 1)) out.push(m)
  return out
}

/**
 * What a choice covers: the bars (days or months), which entries fall in it and in the
 * stretch just before it (to compare categories), and how to name it.
 */
function rangeFor(choice: Choice, month: string) {
  const lastDay = month === currentMonth() ? today() : lastDayOf(month)
  const byDate = (from: string, to: string) => (t: Transaction) => t.date >= from && t.date <= to
  const dayBars = (from: string, to: string) => Array.from({ length: daysBetween(from, to) + 1 }, (_, i) => shiftDay(from, i))

  if (choice.id === 'month') {
    const m = choice.month
    const from = `${m}-01`
    const to = m === currentMonth() ? today() : lastDayOf(m)
    const prev = shiftMonth(m, -1)
    return { byDay: true, keys: dayBars(from, to), keyOf: (t: Transaction) => t.date, inRange: byDate(from, to), inBefore: byDate(`${prev}-01`, lastDayOf(prev)), loadFrom: prev, from, to, title: monthLabel(m), label: `${dayLabel(from)} to ${dayLabel(to)}`, before: 'the month before' }
  }
  if (choice.id === 'custom') {
    const { from, to } = choice
    const days = daysBetween(from, to) + 1
    const byDay = days <= MAX_DAY_BARS
    const before = { from: shiftDay(from, -days), to: shiftDay(from, -1) }
    return {
      byDay,
      keys: byDay ? dayBars(from, to) : monthsFrom(from.slice(0, 7), to.slice(0, 7)),
      keyOf: (t: Transaction) => (byDay ? t.date : t.date.slice(0, 7)),
      inRange: byDate(from, to),
      inBefore: byDate(before.from, before.to),
      loadFrom: before.from.slice(0, 7),
      from,
      to,
      title: from === to ? shortDate(from) : `${shortDate(from)} – ${shortDate(to)}`,
      label: from === to ? dayLabel(from) : `${dayLabel(from)} to ${dayLabel(to)}`,
      before: days === 1 ? 'the day before' : `the ${days} days before`,
    }
  }
  const period = PERIODS.find((p) => p.id === choice.id) ?? PERIODS[4]
  if ('days' in period) {
    const to = shiftDay(lastDay, -('back' in period ? period.back : 0))
    const from = shiftDay(to, -(period.days - 1))
    const prevFrom = shiftDay(from, -period.days)
    return { byDay: true, keys: dayBars(from, to), keyOf: (t: Transaction) => t.date, inRange: byDate(from, to), inBefore: byDate(prevFrom, shiftDay(from, -1)), loadFrom: prevFrom.slice(0, 7), from, to, title: period.label, label: period.days === 1 ? dayLabel(to) : `${dayLabel(from)} to ${dayLabel(to)}`, before: period.before }
  }
  const fromMonth = shiftMonth(month, -(period.months - 1))
  const prevFrom = shiftMonth(fromMonth, -period.months)
  const byMonth = (a: string, b: string) => (t: Transaction) => t.month >= a && t.month <= b
  return {
    byDay: false,
    keys: monthsFrom(fromMonth, month),
    keyOf: (t: Transaction) => t.month,
    inRange: byMonth(fromMonth, month),
    inBefore: byMonth(prevFrom, shiftMonth(fromMonth, -1)),
    loadFrom: prevFrom,
    from: `${fromMonth}-01`,
    to: lastDayOf(month),
    title: period.label,
    label: `${monthLabel(fromMonth)} to ${monthLabel(month)}`,
    before: period.before,
  }
}

/** Asks for a range: a preset, then for "Month" which month, or for "Custom range" the dates. */
async function askRange(current: Choice, settings: Settings): Promise<Choice | null> {
  const id = await askChoice(
    'Report range',
    // Day, Yesterday, Week, then a chosen month, the longer spans, and custom dates last.
    [
      ...PERIODS.slice(0, 3).map((p) => ({ value: p.id as string, label: p.label })),
      { value: 'month', label: 'Month' },
      ...PERIODS.slice(3).map((p) => ({ value: p.id as string, label: p.label })),
      { value: 'custom', label: 'Custom range' },
    ],
    current.id,
  )
  if (!id) return null
  if (id === 'month') {
    const first = settings.opening.month < shiftMonth(currentMonth(), -23) ? settings.opening.month : shiftMonth(currentMonth(), -23)
    const m = await askMonth('Which month?', current.id === 'month' ? current.month : currentMonth(), first, currentMonth())
    return m ? { id: 'month', month: m } : null
  }
  if (id === 'custom') {
    const init = current.id === 'custom' ? current : { from: `${currentMonth()}-01`, to: today() }
    const v = await askForm('Every entry from the first date to the last, both included.', [
      { key: 'from', label: 'From', type: 'date', initial: init.from },
      { key: 'to', label: 'To', type: 'date', initial: init.to },
    ], { title: 'Custom range', ok: 'Show' })
    if (!v) return null
    if (!DATE.test(v.from ?? '') || !DATE.test(v.to ?? '')) return void showAlert('Pick both dates.'), null
    // Either order works.
    const [from, to] = v.from <= v.to ? [v.from, v.to] : [v.to, v.from]
    return { id: 'custom', from, to }
  }
  return { id: id as Period['id'] }
}

/** Trends over a few days, a month, a custom range or several months: income vs spending, saved, capital, and where the money went. */
export function ReportsView({ backend, settings, month, hidden, onSelectMonth }: { backend: Backend; settings: Settings; month: string; hidden: boolean; onSelectMonth: (m: string) => void }) {
  const [choice, setChoice] = useState(savedRange)
  const pick = async () => {
    const next = await askRange(choice, settings)
    if (!next) return
    setChoice(next)
    saveRange(next)
  }
  const range = useMemo(() => rangeFor(choice, month), [choice, month])
  const { byDay, keys } = range
  const count = keys.length
  // Everything from the opening (for balances) or the stretch before the range, through its end.
  const opening = settings.opening.month
  const history = useRange(backend, range.loadFrom < opening ? range.loadFrom : opening, range.to.slice(0, 7))
  const { currency } = settings
  const money = (n: number) => formatWhole(n, currency)
  const compact = (n: number) => formatCompact(n, currency)
  const secret = (n: number) => (hidden ? MASK : money(n))
  const unit = byDay ? 'day' : 'month'

  const data = useMemo(() => {
    if (!history) return null
    const inRange = history.filter(range.inRange)
    // Long day ranges label every few bars so the numbers don't run together.
    const step = Math.ceil(count / 8)
    const bars = keys.map((k, i) => {
      const list = inRange.filter((t) => range.keyOf(t) === k)
      const endOfBar = byDay ? k : lastDayOf(k) < range.to ? lastDayOf(k) : range.to
      const capitalAt = byDay || choice.id === 'custom' ? balancesThrough(endOfBar, settings, history) : balancesBefore(shiftMonth(k, 1), settings, history)
      return {
        month: k,
        label: !byDay ? shortMonth(k) : count <= 7 ? shortDay(k, count < 7) : i % step === 0 ? String(Number(k.slice(8))) : '',
        income: list.filter(countsAsIncome).reduce((a, t) => a + t.amount, 0),
        expense: spentIn(list),
        saved: savedIn(list, settings),
        value: settings.accounts.reduce((a, acc) => a + (capitalAt.accounts[acc.name] ?? 0), 0),
      }
    })
    const before = history.filter(range.inBefore)
    const byCat = (list: typeof history) => {
      const out: Record<string, number> = {}
      for (const t of list) {
        if (t.notSpending) continue
        const cat = t.kind === 'expense' ? t.category || 'Other' : t.kind === 'repay' ? settings.debtCategory || 'Debt payments' : null
        if (cat) out[cat] = (out[cat] ?? 0) + t.amount
      }
      return out
    }
    const now = byCat(inRange)
    const prev = byCat(before)
    const hadPrev = before.length > 0
    const cats = Object.entries(now)
      .map(([category, total]) => ({ category, total, avg: total / count, change: hadPrev && prev[category] ? ((total - prev[category]) / prev[category]) * 100 : null }))
      .sort((a, b) => b.total - a.total)
    const income = bars.reduce((a, b) => a + b.income, 0)
    const spent = bars.reduce((a, b) => a + b.expense, 0)
    return { bars, cats, income, spent, saved: bars.reduce((a, b) => a + b.saved, 0), rate: income ? ((income - spent) / income) * 100 : null }
  }, [history, range, keys, count, byDay, choice.id, settings])

  if (!data) return <p className="center muted">Loading…</p>
  const topCat = data.cats[0]?.total ?? 1
  const perUnit = (n: number) => (hidden || count === 1 ? '' : `${compact(n / count)}/${byDay ? 'day' : 'mo'}`)
  const openBar = (k: string) => onSelectMonth(k.slice(0, 7))
  // One bar says nothing a chart can add, so a single day shows just the totals and categories.
  const charts = count > 1

  return (
    <div className="stack">
      <button type="button" className="picker range-picker" aria-label="Report range" aria-haspopup="listbox" onClick={pick}>
        <span className="grow">{range.title}</span>
        <span className="picker-caret" aria-hidden>
          ▾
        </span>
      </button>
      <p className="muted small center-text">{range.label}</p>

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
            {hidden ? <p className="muted small">Hidden in privacy mode.</p> : <MonthsChart bars={data.bars} current={range.to.slice(0, byDay ? 10 : 7)} format={money} axisFormat={compact} onSelect={openBar} />}
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Saved each {unit}</h2>
            </div>
            <SavedChart bars={data.bars} current={range.to.slice(0, byDay ? 10 : 7)} format={money} axisFormat={compact} onSelect={openBar} />
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Capital</h2>
              <span className="muted small">{secret(data.bars[data.bars.length - 1]?.value ?? 0)}</span>
            </div>
            <p className="muted small">All your accounts at the end of each {unit}.</p>
            {hidden ? <p className="muted small">Hidden in privacy mode.</p> : <LineChart points={data.bars} current={range.to.slice(0, byDay ? 10 : 7)} format={money} axisFormat={compact} label={`Accounts total by ${unit}`} onSelect={openBar} />}
          </section>
        </>
      )}

      <section className="card">
        <div className="card-head">
          <h2>Spending by category</h2>
          <span className="muted small">vs {range.before}</span>
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
