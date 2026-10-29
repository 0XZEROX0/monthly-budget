import { useState, type FormEvent } from 'react'
import { categoryIcon } from '../data/icons'
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

  const yesterday = (() => {
    const d = new Date(today() + 'T00:00')
    d.setDate(d.getDate() - 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form className={`sheet kind-${kind}`} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="sheet-grab" aria-hidden />
        <div className="sheet-head">
          <h2>{existing ? 'Edit' : 'Add'} {kind === 'expense' ? 'expense' : 'income'}</h2>
          <button type="button" className="icon ghost" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="segmented">
          <button type="button" className={kind === 'expense' ? 'active' : ''} onClick={() => switchKind('expense')}>
            Expense
          </button>
          <button type="button" className={kind === 'income' ? 'active' : ''} onClick={() => switchKind('income')}>
            Income
          </button>
        </div>
        <label className="amount">
          <span className="sr-only">Amount in {settings.currency}</span>
          <span className="amount-currency">{settings.currency}</span>
          <input inputMode="decimal" autoFocus required value={amount} style={{ width: `${Math.max(1, amount.length) + 0.6}ch` }} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
        </label>
        <div className="field">
          <span className="field-label">Category</span>
          <div className="cat-grid" role="radiogroup">
            {[...(categories.includes(category) || !category ? [] : [category]), ...categories].map((c) => (
              <button type="button" role="radio" aria-checked={c === category} key={c} className={c === category ? 'active' : ''} onClick={() => setCategory(c)}>
                <span className="cat-icon">{categoryIcon(c)}</span>
                <span className="cat-name">{c.replace('/', '/\u200b')}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="field-label">Date</span>
          <div className="row wrap">
            <button type="button" className={`chip ${date === today() ? 'active' : ''}`} onClick={() => setDate(today())}>
              Today
            </button>
            <button type="button" className={`chip ${date === yesterday ? 'active' : ''}`} onClick={() => setDate(yesterday)}>
              Yesterday
            </button>
            <input className="date-input" type="date" required value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
          </div>
        </div>
        <label className="field">
          <span className="field-label">Note</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What was it for? (optional)" />
        </label>
        <div className="row">
          {existing && (
            <button type="button" className="danger" onClick={remove}>
              Delete
            </button>
          )}
          <button className="primary grow">{existing ? 'Save changes' : `Add ${kind}`}</button>
        </div>
      </form>
    </div>
  )
}
