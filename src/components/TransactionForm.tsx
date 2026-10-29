import { useState, type FormEvent } from 'react'
import { today } from '../data/month'
import type { Backend, Kind, Settings, Transaction } from '../data/types'

interface Props {
  backend: Backend
  settings: Settings
  month: string
  existing: Transaction | null
  onClose: () => void
}

// Writes are not awaited: with the offline cache they apply locally at once and
// sync later, so waiting on the server would freeze the form without a connection.
const report = (p: Promise<void>) => p.catch((e: Error) => alert(`Could not save: ${e.message}`))

export function TransactionForm({ backend, settings, month, existing, onClose }: Props) {
  const defaultDate = today().startsWith(month) ? today() : `${month}-01`
  const [kind, setKind] = useState<Kind>(existing?.kind ?? 'expense')
  const [amount, setAmount] = useState(existing ? String(existing.amount) : '')
  const [date, setDate] = useState(existing?.date ?? defaultDate)
  const [description, setDescription] = useState(existing?.description ?? '')
  const [category, setCategory] = useState(existing?.category ?? settings.categories[kind][0] ?? '')

  const categories = settings.categories[kind]
  const switchKind = (k: Kind) => {
    setKind(k)
    if (!settings.categories[k].includes(category)) setCategory(settings.categories[k][0] ?? '')
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const value = Number(amount.replace(',', '.'))
    if (!Number.isFinite(value) || value <= 0) return
    const t = { kind, amount: value, date, description: description.trim(), category }
    report(existing ? backend.updateTransaction(existing.id, t) : backend.addTransaction(t))
    onClose()
  }

  const remove = () => {
    if (!existing || !confirm('Delete this transaction?')) return
    report(backend.deleteTransaction(existing.id))
    onClose()
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{existing ? 'Edit transaction' : 'New transaction'}</h2>
        <div className="segmented">
          <button type="button" className={kind === 'expense' ? 'active' : ''} onClick={() => switchKind('expense')}>
            Expense
          </button>
          <button type="button" className={kind === 'income' ? 'active' : ''} onClick={() => switchKind('income')}>
            Income
          </button>
        </div>
        <label>
          Amount
          <input inputMode="decimal" autoFocus required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </label>
        <label>
          Date
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Description
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
        </label>
        <label>
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {!categories.includes(category) && category && <option value={category}>{category}</option>}
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <div className="row">
          {existing && (
            <button type="button" className="danger" onClick={remove}>
              Delete
            </button>
          )}
          <span className="spacer" />
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary">Save</button>
        </div>
      </form>
    </div>
  )
}
