import { useState } from 'react'
import { endOfYear, goalProgress } from '../data/goals'
import { categoryIcon } from '../data/icons'
import { formatWhole } from '../data/month'
import type { Balances } from '../data/summary'
import type { Goal, Settings } from '../data/types'
import { NumberInput } from './NumberInput'
import { ask, showAlert } from './dialog'

const MASK = '•••••'
const dateLabel = (iso: string) => new Date(iso + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

/** Summary: progress toward each savings goal from its accounts' balances. */
export function GoalsCard({ settings, balances, hidden, onEdit }: { settings: Settings; balances: Balances; hidden: boolean; onEdit: () => void }) {
  const goals = settings.goals ?? []
  if (!goals.length) return null
  const money = (n: number) => (hidden ? MASK : formatWhole(n, settings.currency))
  return (
    <section className="card">
      <div className="card-head">
        <h2>Savings goals</h2>
        <button className="link small" onClick={onEdit}>
          Edit
        </button>
      </div>
      {goals.map((g) => {
        const p = goalProgress(g, balances)
        const done = p.left <= 0
        const late = !done && p.daysLeft !== null && p.daysLeft < 0
        return (
          <div className="cat-row" key={g.id}>
            <span className="cat-icon">{done ? '🎉' : categoryIcon(g.accounts[0] ?? 'saving')}</span>
            <div className="cat-body">
              <div className="cat-line">
                <span>{g.name}</span>
                <span>
                  <strong>{money(p.saved)}</strong>
                  <span className="muted"> / {money(g.target)}</span>
                </span>
              </div>
              <div className="meter" title={`${Math.round(p.pct)}%`}>
                <div className="meter-fill goal-fill" style={{ width: `${p.pct}%` }} />
              </div>
              <span className={`small ${late ? 'status-critical' : 'muted'}`}>
                {Math.round(p.pct)}% · {g.accounts.join(' + ')}
                {done
                  ? ' · Reached!'
                  : late
                    ? ` · Deadline passed ${dateLabel(g.deadline!)}`
                    : p.perMonth !== null
                      ? ` · ${money(p.perMonth)}/month to reach it by ${dateLabel(g.deadline!)}`
                      : ` · ${money(p.left)} to go`}
              </span>
            </div>
          </div>
        )
      })}
    </section>
  )
}

/** Settings: goals for bank and investment accounts, with or without a deadline. */
export function GoalsEditor({ settings, onSave }: { settings: Settings; onSave: (s: Settings) => void }) {
  const goals = settings.goals ?? []
  const [editing, setEditing] = useState<Goal | null>(null)
  const set = (list: Goal[]) => onSave({ ...settings, goals: list })
  const savers = settings.accounts.filter((a) => a.type !== 'cash' && a.type !== 'wallet').map((a) => a.name)
  const money = (n: number) => formatWhole(n, settings.currency)
  return (
    <section className="card" id="goals">
      <h2>Savings goals</h2>
      <p className="muted small">A target for your bank and investment accounts, like Thndr by the end of the year. Progress is their balance; the deadline is up to you.</p>
      {goals.map((g) => (
        <button className="edit-row row-link" key={g.id} onClick={() => setEditing(g)}>
          <span className="cat-icon plan-icon">{categoryIcon(g.accounts[0] ?? 'saving')}</span>
          <span className="grow list-main">
            <strong>{g.name}</strong>
            <span className="muted small">
              {money(g.target)} in {g.accounts.join(' + ')}
              {g.deadline ? ` by ${dateLabel(g.deadline)}` : ', no deadline'}
            </span>
          </span>
          <span className="chevron" aria-hidden>›</span>
        </button>
      ))}
      <button
        disabled={!savers.length}
        onClick={() => setEditing({ id: crypto.randomUUID().slice(0, 8), name: '', accounts: savers.slice(0, 1), target: 0, deadline: endOfYear() })}
      >
        + New goal
      </button>
      {!savers.length && <p className="muted small">Add a bank or investment account first.</p>}
      {editing && (
        <GoalForm
          goal={editing}
          accounts={savers}
          currency={settings.currency}
          onClose={() => setEditing(null)}
          onRemove={goals.some((g) => g.id === editing.id) ? () => set(goals.filter((g) => g.id !== editing.id)) : undefined}
          onSave={(g) => set(goals.some((x) => x.id === g.id) ? goals.map((x) => (x.id === g.id ? g : x)) : [...goals, g])}
        />
      )}
    </section>
  )
}

function GoalForm({ goal, accounts, currency, onSave, onRemove, onClose }: { goal: Goal; accounts: string[]; currency: string; onSave: (g: Goal) => void; onRemove?: () => void; onClose: () => void }) {
  const [g, setG] = useState(goal)
  const up = (p: Partial<Goal>) => setG((x) => ({ ...x, ...p }))
  const toggle = (a: string) => up({ accounts: g.accounts.includes(a) ? g.accounts.filter((x) => x !== a) : [...g.accounts, a] })
  const save = () => {
    if (!g.accounts.length) return void showAlert('Pick at least one account.')
    if (g.target <= 0) return void showAlert('Set how much you want to reach.')
    const name = g.name.trim() || `${g.accounts.join(' + ')} goal`
    onSave({ ...g, name, ...(g.deadline ? {} : { deadline: undefined }) })
    onClose()
  }
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" aria-hidden />
        <div className="sheet-head">
          <h2>{onRemove ? `Edit ${goal.name}` : 'New savings goal'}</h2>
          <button className="icon ghost" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <label className="field">
          <span className="field-label">Name</span>
          <input value={g.name} onChange={(e) => up({ name: e.target.value })} placeholder="Emergency fund, Thndr 2026…" />
        </label>
        <div className="field">
          <span className="field-label">Counts the balance of</span>
          <div className="row wrap">
            {accounts.map((a) => (
              <button key={a} className={`chip ${g.accounts.includes(a) ? 'active' : ''}`} aria-pressed={g.accounts.includes(a)} onClick={() => toggle(a)}>
                {categoryIcon(a)} {a}
              </button>
            ))}
          </div>
        </div>
        <label className="edit-row">
          <span className="grow">Target ({currency})</span>
          <span className="mini">
            <NumberInput value={g.target} onChange={(n) => up({ target: n })} />
          </span>
        </label>
        <div className="field">
          <span className="field-label">Deadline</span>
          <div className="segmented">
            <button className={g.deadline ? 'active' : ''} onClick={() => up({ deadline: g.deadline || endOfYear() })}>
              By a date
            </button>
            <button className={!g.deadline ? 'active' : ''} onClick={() => up({ deadline: undefined })}>
              No deadline
            </button>
          </div>
          {g.deadline && <input type="date" value={g.deadline} onChange={(e) => e.target.value && up({ deadline: e.target.value })} aria-label="Deadline" />}
        </div>
        <div className="row">
          {onRemove && (
            <button className="danger" onClick={() => ask(`Remove the goal ${goal.name}?`, { ok: 'Remove', danger: true }).then((ok) => ok && (onRemove(), onClose()))}>
              Remove
            </button>
          )}
          <button className="primary grow" onClick={save}>
            {onRemove ? 'Save' : 'Add goal'}
          </button>
        </div>
      </div>
    </div>
  )
}
