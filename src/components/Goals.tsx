import { useState } from 'react'
import { endOfYear, goalProgress } from '../data/goals'
import { categoryIcon } from '../data/icons'
import { formatWhole } from '../data/month'
import type { Balances } from '../data/summary'
import type { Goal, Settings } from '../data/types'
import { NumberInput } from './NumberInput'
import { ask, showAlert } from './dialog'
import { t } from '../i18n'
import { formatDateWith } from '../data/month'

const MASK = '•••••'
const dateLabel = (iso: string) => formatDateWith(new Date(iso + 'T00:00'), { day: 'numeric', month: 'short', year: 'numeric' })

/** Summary: progress toward each savings goal from its accounts' balances. */
export function GoalsCard({ settings, balances, hidden, onEdit }: { settings: Settings; balances: Balances; hidden: boolean; onEdit: () => void }) {
  const goals = settings.goals ?? []
  if (!goals.length) return null
  const money = (n: number) => (hidden ? MASK : formatWhole(n, settings.currency))
  return (
    <section className="card">
      <div className="card-head">
        <h2>{t('Savings goals')}</h2>
        <button className="link small" onClick={onEdit}>
          {t('Edit')}
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
                  ? ' · ' + t('Reached!')
                  : late
                    ? ' · ' + t('Deadline passed {date}', { date: dateLabel(g.deadline!) })
                    : p.perMonth !== null
                      ? ' · ' + t('{amount}/month to reach it by {date}', { amount: money(p.perMonth), date: dateLabel(g.deadline!) })
                      : ' · ' + t('{amount} to go', { amount: money(p.left) })}
              </span>
            </div>
          </div>
        )
      })}
    </section>
  )
}

/** Settings: goals for any accounts, cash included, with or without a deadline. */
export function GoalsEditor({ settings, onSave }: { settings: Settings; onSave: (s: Settings) => void }) {
  const goals = settings.goals ?? []
  const [editing, setEditing] = useState<Goal | null>(null)
  const set = (list: Goal[]) => onSave({ ...settings, goals: list })
  const savers = settings.accounts.map((a) => a.name)
  const money = (n: number) => formatWhole(n, settings.currency)
  return (
    <section className="card" id="goals">
      <h2>{t('Savings goals')}</h2>
      <p className="muted small">{t('A target for any of your accounts, like Thndr by the end of the year or cash at home. Progress is their balance; the deadline is up to you.')}</p>
      {goals.map((g) => (
        <button className="edit-row row-link" key={g.id} onClick={() => setEditing(g)}>
          <span className="cat-icon plan-icon">{categoryIcon(g.accounts[0] ?? 'saving')}</span>
          <span className="grow list-main">
            <strong>{g.name}</strong>
            <span className="muted small">
              {t('{amount} in {accounts}', { amount: money(g.target), accounts: g.accounts.join(' + ') })}
              {g.deadline ? ' ' + t('by {date}', { date: dateLabel(g.deadline) }) : t(', no deadline')}
            </span>
          </span>
          <span className="chevron" aria-hidden>›</span>
        </button>
      ))}
      <button
        disabled={!savers.length}
        onClick={() => setEditing({ id: crypto.randomUUID().slice(0, 8), name: '', accounts: savers.slice(0, 1), target: 0, deadline: endOfYear() })}
      >
        + {t('New goal')}
      </button>
      {!savers.length && <p className="muted small">{t('Add an account first.')}</p>}
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
    if (!g.accounts.length) return void showAlert(t('Pick at least one account.'))
    if (g.target <= 0) return void showAlert(t('Set how much you want to reach.'))
    const name = g.name.trim() || t('{accounts} goal', { accounts: g.accounts.join(' + ') })
    onSave({ ...g, name, ...(g.deadline ? {} : { deadline: undefined }) })
    onClose()
  }
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" aria-hidden />
        <div className="sheet-head">
          <h2>{onRemove ? t('Edit {name}', { name: goal.name }) : t('New savings goal')}</h2>
          <button className="icon ghost" aria-label={t('Close')} onClick={onClose}>
            ✕
          </button>
        </div>
        <label className="field">
          <span className="field-label">{t('Name')}</span>
          <input value={g.name} onChange={(e) => up({ name: e.target.value })} placeholder={t('Emergency fund, Thndr 2026…')} />
        </label>
        <div className="field">
          <span className="field-label">{t('Counts the balance of')}</span>
          <div className="row wrap">
            {accounts.map((a) => (
              <button key={a} className={`chip ${g.accounts.includes(a) ? 'active' : ''}`} aria-pressed={g.accounts.includes(a)} onClick={() => toggle(a)}>
                {categoryIcon(a)} {a}
              </button>
            ))}
          </div>
        </div>
        <label className="edit-row">
          <span className="grow">{t('Target ({currency})', { currency })}</span>
          <span className="mini">
            <NumberInput value={g.target} onChange={(n) => up({ target: n })} />
          </span>
        </label>
        <div className="field">
          <span className="field-label">{t('Deadline')}</span>
          <div className="segmented">
            <button className={g.deadline ? 'active' : ''} onClick={() => up({ deadline: g.deadline || endOfYear() })}>
              {t('By a date')}
            </button>
            <button className={!g.deadline ? 'active' : ''} onClick={() => up({ deadline: undefined })}>
              {t('No deadline')}
            </button>
          </div>
          {g.deadline && <input type="date" value={g.deadline} onChange={(e) => e.target.value && up({ deadline: e.target.value })} aria-label={t('Deadline')} />}
        </div>
        <div className="row">
          {onRemove && (
            <button className="danger" onClick={() => ask(t('Remove the goal {name}?', { name: goal.name }), { ok: t('Remove'), danger: true }).then((ok) => ok && (onRemove(), onClose()))}>
              {t('Remove')}
            </button>
          )}
          <button className="primary grow" onClick={save}>
            {onRemove ? t('Save') : t('Add goal')}
          </button>
        </div>
      </div>
    </div>
  )
}
