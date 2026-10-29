import { useState, type FormEvent } from 'react'
import { categoryIcon } from '../data/icons'
import { today } from '../data/month'
import type { Backend, NewTransaction, Settings, Transaction, TxnKind } from '../data/types'

interface Props {
  backend: Backend
  settings: Settings
  month: string
  existing: Transaction | null
  /** A new entry filled in from elsewhere (a bank SMS), saved under this id so it is only added once. */
  draft?: { id: string; txn: NewTransaction }
  onSaved?: (t: NewTransaction) => void
  onClose: () => void
}

type Tab = 'expense' | 'income' | 'transfer' | 'debt'

const TABS: { id: Tab; label: string }[] = [
  { id: 'expense', label: 'Expense' },
  { id: 'income', label: 'Income' },
  { id: 'transfer', label: 'Transfer' },
  { id: 'debt', label: 'Debt' },
]

const tabOf = (k: TxnKind): Tab => (k === 'repay' || k === 'borrow' ? 'debt' : k === 'adjust' ? 'transfer' : k)

// Writes are not awaited: with the offline cache they apply locally at once and
// sync later, so waiting on the server would freeze the form without a connection.
const report = (p: Promise<void>) => p.catch((e: Error) => alert(`Could not save: ${e.message}`))

const shiftDay = (iso: string, days: number) => {
  const d = new Date(iso + 'T00:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function TransactionForm({ backend, settings, month, existing, draft, onSaved, onClose }: Props) {
  const accounts = settings.accounts.map((a) => a.name)
  const liquid = settings.accounts.filter((a) => a.type !== 'investment').map((a) => a.name)
  const defaultDate = today().startsWith(month) ? today() : `${month}-01`

  const init = existing ?? draft?.txn
  const [tab, setTab] = useState<Tab>(init ? tabOf(init.kind) : 'expense')
  const [debtMode, setDebtMode] = useState<'repay' | 'borrow'>(init?.kind === 'borrow' ? 'borrow' : 'repay')
  const [amount, setAmount] = useState(init ? String(init.amount) : '')
  const [date, setDate] = useState(init?.date ?? defaultDate)
  const [description, setDescription] = useState(init?.description ?? '')
  // A draft starts with no category so one has to be picked, unless it remembered one.
  const [category, setCategory] = useState(draft ? draft.txn.category : existing?.category || settings.categories.expense[0] || '')
  const [account, setAccount] = useState(init?.account ?? liquid[0] ?? accounts[0] ?? '')
  const [toAccount, setToAccount] = useState(init?.toAccount ?? accounts.find((a) => a !== account) ?? '')
  const [debt, setDebt] = useState(init?.debt ?? settings.debts[0]?.name ?? '')

  const catKind = tab === 'income' ? 'income' : 'expense'
  const categories = settings.categories[catKind]
  const switchTab = (t: Tab) => {
    setTab(t)
    const kind = t === 'income' ? 'income' : 'expense'
    if ((t === 'expense' || t === 'income') && !settings.categories[kind].includes(category)) setCategory(settings.categories[kind][0] ?? '')
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const value = Number(amount.replace(',', '.'))
    if (!Number.isFinite(value) || value <= 0) return
    if ((tab === 'expense' || tab === 'income') && !category) return alert('Pick a category.')
    const base = { amount: value, date, description: description.trim(), category: '' }
    let t: NewTransaction
    if (tab === 'expense' || tab === 'income') t = { ...base, kind: tab, category, account }
    else if (tab === 'transfer') {
      if (account === toAccount) return alert('Pick two different accounts.')
      t = { ...base, kind: 'transfer', account, toAccount }
    } else if (debtMode === 'repay') t = { ...base, kind: 'repay', account, debt }
    else t = { ...base, kind: 'borrow', debt, ...(account ? { account } : {}) }
    // Keep an imported entry's month unless the date moved it to another month.
    if (existing && existing.date.slice(0, 7) !== existing.month && date === existing.date) t.month = existing.month
    const id = existing?.id ?? draft?.id
    report(id ? backend.updateTransaction(id, t) : backend.addTransaction(t))
    onSaved?.(t)
    onClose()
  }

  const remove = () => {
    if (!existing || !confirm('Delete this entry?')) return
    report(backend.deleteTransaction(existing.id))
    onClose()
  }

  const title = tab === 'debt' ? (debtMode === 'repay' ? 'debt payment' : 'borrowing') : tab

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form className={`sheet kind-${tab}`} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="sheet-grab" aria-hidden />
        <div className="sheet-head">
          <h2>
            {existing ? 'Edit' : 'Add'} {title}
          </h2>
          <button type="button" className="icon ghost" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="segmented four">
          {TABS.map((t) => (
            <button type="button" key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => switchTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <label className="amount">
          <span className="sr-only">Amount in {settings.currency}</span>
          <span className="amount-currency">{settings.currency}</span>
          <input inputMode="decimal" autoFocus required value={amount} style={{ width: `${Math.max(1, amount.length) + 0.6}ch` }} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
        </label>

        {tab === 'debt' && (
          <div className="segmented">
            <button type="button" className={debtMode === 'repay' ? 'active' : ''} onClick={() => setDebtMode('repay')}>
              I paid back
            </button>
            <button type="button" className={debtMode === 'borrow' ? 'active' : ''} onClick={() => setDebtMode('borrow')}>
              I borrowed
            </button>
          </div>
        )}

        {tab === 'debt' && <Chips label="Debt" options={settings.debts.map((d) => d.name)} value={debt} onChange={setDebt} />}

        <Chips
          label={tab === 'income' ? 'Into' : tab === 'transfer' ? 'From' : tab === 'debt' ? (debtMode === 'repay' ? 'Paid from' : 'Into (optional)') : 'Paid from'}
          options={accounts}
          value={account}
          onChange={(a) => {
            // Borrowed money doesn't have to land in an account: tapping the chosen one clears it.
            if (tab === 'debt' && debtMode === 'borrow' && a === account) return setAccount('')
            setAccount(a)
            if (a === toAccount) setToAccount(accounts.find((x) => x !== a) ?? '')
          }}
        />
        {tab === 'transfer' && <Chips label="To" options={accounts.filter((a) => a !== account)} value={toAccount} onChange={setToAccount} />}

        {(tab === 'expense' || tab === 'income') && (
          <div className="field">
            <span className="field-label">Category</span>
            <div className="cat-grid" role="radiogroup">
              {[...(categories.includes(category) || !category ? [] : [category]), ...categories].map((c) => (
                <button type="button" role="radio" aria-checked={c === category} key={c} className={c === category ? 'active' : ''} onClick={() => setCategory(c)}>
                  <span className="cat-icon">{categoryIcon(c)}</span>
                  <span className="cat-name">{c.replace('/', '/​')}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="field">
          <span className="field-label">Date</span>
          <div className="row wrap">
            <button type="button" className={`chip ${date === today() ? 'active' : ''}`} onClick={() => setDate(today())}>
              Today
            </button>
            <button type="button" className={`chip ${date === shiftDay(today(), -1) ? 'active' : ''}`} onClick={() => setDate(shiftDay(today(), -1))}>
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
          <button className="primary grow">{existing ? 'Save changes' : `Add ${title}`}</button>
        </div>
      </form>
    </div>
  )
}

function Chips({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="row wrap" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button type="button" role="radio" aria-checked={o === value} key={o} className={`chip ${o === value ? 'active' : ''}`} onClick={() => onChange(o)}>
            {categoryIcon(o)} {o}
          </button>
        ))}
      </div>
    </div>
  )
}
