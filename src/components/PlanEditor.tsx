import { useEffect, useRef, useState } from 'react'
import { emptyPlan } from '../data/defaults'
import { formatWhole, monthLabel, shiftMonth } from '../data/month'
import type { Backend, Kind, MonthPlan, Settings } from '../data/types'
import { NumberInput } from './NumberInput'
import { categoryIcon } from '../data/icons'
import { showAlert } from './dialog'

interface Props {
  backend: Backend
  month: string
  plan: MonthPlan | null
  settings: Settings
}

export function PlanEditor({ backend, month, plan, settings }: Props) {
  const [draft, setDraft] = useState<MonthPlan>(plan ?? emptyPlan())
  const [dirty, setDirty] = useState(false)
  // Changes save on their own a moment after typing stops, and when leaving the page.
  const pending = useRef<{ timer: number; month: string; plan: MonthPlan } | null>(null)
  const flush = () => {
    const p = pending.current
    if (!p) return
    clearTimeout(p.timer)
    pending.current = null
    backend.savePlan(p.month, p.plan).catch((e: Error) => showAlert(`Could not save: ${e.message}`))
    setDirty(false)
  }
  useEffect(() => flush, [month]) // eslint-disable-line react-hooks/exhaustive-deps

  // Take in changes synced from another device unless the user is mid-edit.
  useEffect(() => {
    if (!dirty) setDraft(plan ?? emptyPlan())
  }, [plan, dirty])

  const update = (next: MonthPlan) => {
    setDraft(next)
    setDirty(true)
    if (pending.current) clearTimeout(pending.current.timer)
    pending.current = { timer: window.setTimeout(flush, 700), month, plan: next }
  }
  const setPlanned = (kind: Kind, category: string, value: number) =>
    update({ ...draft, planned: { ...draft.planned, [kind]: { ...draft.planned[kind], [category]: value } } })

  const copyPrevious = () => {
    const unsub = backend.watchPlan(shiftMonth(month, -1), (prev) => {
      queueMicrotask(() => unsub())
      if (!prev) return void showAlert('Last month has no plan to copy.')
      update(prev)
    })
  }

  return (
    <div className="stack">
      <div className="plan-head">
        <h2>Budget for {monthLabel(month)}</h2>
        <span className="muted small" aria-live="polite">
          {dirty ? 'Saving…' : 'Saved ✓'}
        </span>
      </div>
      <section className="card">
        <p className="muted small">Set how much you plan to spend in each category this month. Starting balances come from your accounts automatically.</p>
        <button className="link" onClick={copyPrevious}>
          Copy planned amounts from last month
        </button>
      </section>
      {(['expense'] as Kind[]).map((kind) => (
        <section className="card" key={kind}>
          <div className="card-head">
            <h2>Planned spending</h2>
            <span className="muted small">
              Total {formatWhole(Object.values(draft.planned[kind]).reduce((a, b) => a + b, 0), settings.currency)}
            </span>
          </div>
          {settings.categories[kind].map((c) => (
            <label className="inline" key={c}>
              <span className="cat-icon plan-icon">{categoryIcon(c)}</span>
              <span>{c}</span>
              <NumberInput value={draft.planned[kind][c] ?? 0} onChange={(n) => setPlanned(kind, c, n)} />
            </label>
          ))}
        </section>
      ))}
    </div>
  )
}
