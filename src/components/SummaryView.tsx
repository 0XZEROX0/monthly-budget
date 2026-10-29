import { formatMoney } from '../data/month'
import type { CategoryRow, MonthSummary } from '../data/summary'
import type { Kind } from '../data/types'

interface Props {
  summary: MonthSummary
  currency: string
  hasPlan: boolean
  onPlan: () => void
}

export function SummaryView({ summary: s, currency, hasPlan, onPlan }: Props) {
  const money = (n: number) => formatMoney(n, currency)
  return (
    <div className="stack">
      <section className="card balances">
        <div>
          <span className="label">Starting balance</span>
          <strong>{money(s.startingBalance)}</strong>
        </div>
        <div>
          <span className="label">Ending balance</span>
          <strong>{money(s.endingBalance)}</strong>
        </div>
        <div className="wide">
          <span className="label">{s.saved >= 0 ? 'Saved this month' : 'Overspent this month'}</span>
          <strong className={s.saved >= 0 ? 'good' : 'bad'}>
            {money(Math.abs(s.saved))}
            {s.savingsChangePct !== null && <small> ({s.savingsChangePct >= 0 ? '+' : ''}{s.savingsChangePct.toFixed(1)}%)</small>}
          </strong>
        </div>
      </section>

      {!hasPlan && (
        <button className="card hint" onClick={onPlan}>
          No plan for this month yet. Tap to set your starting balance and budget.
        </button>
      )}

      <Totals kind="expense" title="Expenses" summary={s} money={money} />
      <Totals kind="income" title="Income" summary={s} money={money} />
    </div>
  )
}

function Totals({ kind, title, summary, money }: { kind: Kind; title: string; summary: MonthSummary; money: (n: number) => string }) {
  const rows = summary.rows[kind].filter((r) => r.planned || r.actual)
  return (
    <section className="card">
      <div className="card-head">
        <h2>{title}</h2>
        <span className="muted">
          {money(summary.actual[kind])} of {money(summary.planned[kind])}
        </span>
      </div>
      <Bar planned={summary.planned[kind]} actual={summary.actual[kind]} kind={kind} />
      {rows.length === 0 ? (
        <p className="muted small">Nothing planned or recorded yet.</p>
      ) : (
        <table className="cats">
          <thead>
            <tr>
              <th>Category</th>
              <th>Planned</th>
              <th>Actual</th>
              <th>Diff.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Row key={r.category} row={r} money={money} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

function Row({ row, money }: { row: CategoryRow; money: (n: number) => string }) {
  return (
    <tr>
      <td>{row.category}</td>
      <td>{money(row.planned)}</td>
      <td>{money(row.actual)}</td>
      <td className={row.diff >= 0 ? 'good' : 'bad'}>{money(row.diff)}</td>
    </tr>
  )
}

function Bar({ planned, actual, kind }: { planned: number; actual: number; kind: Kind }) {
  const max = Math.max(planned, actual, 1)
  const over = kind === 'expense' ? actual > planned : false
  return (
    <div className="bar" aria-hidden>
      <div className="bar-planned" style={{ width: `${(planned / max) * 100}%` }} />
      <div className={`bar-actual ${over ? 'over' : ''}`} style={{ width: `${(actual / max) * 100}%` }} />
    </div>
  )
}
