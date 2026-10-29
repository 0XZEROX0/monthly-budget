import { useEffect, useState } from 'react'
import { emptyPlan } from '../data/defaults'
import { formatWhole, shiftMonth } from '../data/month'
import type { Backend, Kind, MonthPlan, Settings } from '../data/types'
import { NumberInput } from './NumberInput'
import { categoryIcon } from '../data/icons'

interface Props {
  backend: Backend
  month: string
  plan: MonthPlan | null
  settings: Settings
}

export function PlanEditor({ backend, month, plan, settings }: Props) {
  const [draft, setDraft] = useState<MonthPlan>(plan ?? emptyPlan())
  const [dirty, setDirty] = useState(false)

  // Take in changes synced from another device unless the user is mid-edit.
  useEffect(() => {
    if (!dirty) setDraft(plan ?? emptyPlan())
  }, [plan, dirty])

  const update = (next: MonthPlan) => {
    setDraft(next)
    setDirty(true)
  }
  const setPlanned = (kind: Kind, category: string, value: number) =>
    update({ ...draft, planned: { ...draft.planned, [kind]: { ...draft.planned[kind], [category]: value } } })

  const save = () => {
    backend.savePlan(month, draft).catch((e: Error) => alert(`Could not save: ${e.message}`))
    setDirty(false)
  }

  const copyPrevious = () => {
    const unsub = backend.watchPlan(shiftMonth(month, -1), (prev) => {
      queueMicrotask(() => unsub())
      if (!prev) return alert('Last month has no plan to copy.')
      update(prev)
    })
  }

  return (
    <div className="stack">
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
      <div className="sticky-actions">
        <button className="primary" disabled={!dirty} onClick={save}>
          {dirty ? 'Save plan' : 'Saved'}
        </button>
      </div>
    </div>
  )
}
