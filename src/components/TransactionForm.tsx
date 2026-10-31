import { useState, type FormEvent } from 'react'
import { useReorder } from './useReorder'
import { guessType } from '../data/accounts'
import { defaultFee, feeCategory, feeFor, feeHint, feeTemplates, type FeeKind } from '../data/fees'
import { categoryIcon } from '../data/icons'
import { today } from '../data/month'
import type { Backend, NewTransaction, Settings, Transaction, TxnKind } from '../data/types'
import { ask, askForm, askText, showAlert } from './dialog'
import { askEditCategory, askNewCategory } from './categoryRename'

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
const report = (p: Promise<void>) => p.catch((e: Error) => showAlert(`Could not save: ${e.message}`))

const nowTime = () => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Digits typed into the time box become HH:MM, with the colon put in for you. */
const typeTime = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 4)
  return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d
}

/** HH:MM as it reads on a 12-hour clock. */
const to12 = (time: string) => {
  const [h, m] = time.split(':').map(Number)
  return { text: `${String(h % 12 || 12).padStart(2, '0')}:${String(m).padStart(2, '0')}`, pm: h >= 12 }
}

/** A 12-hour time back to HH:MM; anything unfinished or out of range is kept as typed so saving can flag it. */
const from12 = (text: string, pm: boolean) => {
  const m = text.match(/^(\d{1,2}):(\d{2})$/)
  if (!m || +m[1] < 1 || +m[1] > 12) return text
  return `${String((+m[1] % 12) + (pm ? 12 : 0)).padStart(2, '0')}:${m[2]}`
}

const shiftDay = (iso: string, days: number) => {
  const d = new Date(iso + 'T00:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function TransactionForm({ backend, settings: saved, month, existing, draft, onSaved, onClose }: Props) {
  // Accounts and categories added here show at once, before the saved settings come back.
  const [settings, setSettings] = useState(saved)
  if (saved !== settings && saved.accounts.length >= settings.accounts.length && saved.categories.expense.length >= settings.categories.expense.length && saved.categories.income.length >= settings.categories.income.length) setSettings(saved)
  const saveSettings = (next: Settings) => {
    setSettings(next)
    report(backend.saveSettings(next))
  }
  const accounts = settings.accounts.map((a) => a.name)
  const liquid = settings.accounts.filter((a) => a.type !== 'investment').map((a) => a.name)
  const defaultDate = today().startsWith(month) ? today() : `${month}-01`

  const init = existing ?? draft?.txn
  const [tab, setTab] = useState<Tab>(init ? tabOf(init.kind) : 'expense')
  const [debtMode, setDebtMode] = useState<'repay' | 'borrow'>(init?.kind === 'borrow' ? 'borrow' : 'repay')
  const [amount, setAmount] = useState(init ? String(init.amount) : '')
  const [date, setDate] = useState(init?.date ?? defaultDate)
  const [description, setDescription] = useState(init?.description ?? '')
  const [notSpending, setNotSpending] = useState(!!init?.notSpending)
  // When it happened; entries are ordered by it within a day. Starts at now for a new entry.
  const [time, setTime] = useState(() => (existing ? existing.time ?? '' : init?.time ?? nowTime()))
  // On a 12-hour clock the box holds 1-12 and AM/PM is a separate switch; `time` stays HH:MM.
  const clock12 = !!settings.clock12
  const [typed12, setTyped12] = useState(() => (time ? to12(time).text : ''))
  const [pm, setPm] = useState(() => (time ? to12(time).pm : new Date().getHours() >= 12))
  const set12 = (text: string, isPm: boolean) => {
    setTyped12(text)
    setPm(isPm)
    setTime(from12(text, isPm))
  }
  // A draft starts with no category so one has to be picked, unless it remembered one.
  const [category, setCategory] = useState(draft ? draft.txn.category : existing?.category || settings.categories.expense[0] || '')
  const [account, setAccount] = useState(init?.account ?? liquid[0] ?? accounts[0] ?? '')
  const [toAccount, setToAccount] = useState(init?.toAccount ?? accounts.find((a) => a !== account) ?? '')
  // A transfer fee, saved as its own expense; only offered when adding money going out.
  const [fee, setFee] = useState<FeeKind>(() => (init ? 'none' : defaultFee(account, settings.feeTemplates)))
  const [customFee, setCustomFee] = useState('')
  const [feeTouched, setFeeTouched] = useState(false)
  const [debt, setDebt] = useState(init?.debt ?? settings.debts[0]?.name ?? '')

  const catKind = tab === 'income' ? 'income' : 'expense'
  const categories = settings.categories[catKind]
  const addAccount = async () => {
    const name = (await askText('Give it a name, like Wallet, CIB card or Instapay.', { title: 'New account', placeholder: 'Account name' }))?.trim()
    if (!name) return
    if (!accounts.includes(name)) saveSettings({ ...settings, accounts: [...settings.accounts, { name, type: guessType(name) }] })
    setAccount(name)
    if (!feeTouched) setFee(defaultFee(name, settings.feeTemplates))
    if (name === toAccount) setToAccount(accounts.find((x) => x !== name) ?? '')
  }
  const addCategory = async () => {
    const added = await askNewCategory(settings, catKind)
    if (!added) return
    saveSettings(added.settings)
    setCategory(added.name)
  }
  // Tapping the picked category again changes its name or icon.
  const pickCategory = async (c: string) => {
    if (c !== category) return setCategory(c)
    const to = await askEditCategory(backend, settings, catKind, c)
    if (!to) return
    setSettings({ ...settings, categories: { ...settings.categories, [catKind]: categories.map((x) => (x === c ? to : x)) } })
    setCategory(to)
  }
  // Hold a category and drag it to reorder; the order is saved for next time.
  const reorder = useReorder(categories, (next) => saveSettings({ ...settings, categories: { ...settings.categories, [catKind]: next } }))
  const switchTab = (t: Tab) => {
    setTab(t)
    const kind = t === 'income' ? 'income' : 'expense'
    if ((t === 'expense' || t === 'income') && !settings.categories[kind].includes(category)) setCategory(settings.categories[kind][0] ?? '')
  }

  const sendsMoney = tab === 'expense' || tab === 'transfer' || (tab === 'debt' && debtMode === 'repay')
  const showFee = !existing && sendsMoney
  const amountValue = Number(amount.replace(',', '.'))
  const templates = feeTemplates(settings)
  const feeTemplate = templates.find((t) => t.id === fee)
  const feeValue = !showFee ? 0 : fee === 'custom' ? Number(customFee.replace(',', '.')) || 0 : feeFor(feeTemplate, amountValue)
  // Shown before any amount is typed too: InstaPay's minimum of 0.5 straight away.
  const feeShown = feeValue || (showFee && feeTemplate && !(amountValue > 0) ? feeTemplate.min ?? 0 : 0)
  const money2 = (n: number) => `${settings.currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
  const ownTemplates = settings.feeTemplates ?? []
  const pickFee = (id: FeeKind) => {
    setFee(id)
    setFeeTouched(true)
  }
  // A fee template of the user's own: a percentage kept between an optional minimum and maximum.
  const addFeeTemplate = async () => {
    const v = await askForm(
      'Worked out as a percentage of the amount, like InstaPay.',
      [
        { key: 'name', label: 'Name', placeholder: 'Like Bank transfer' },
        { key: 'pct', label: 'Percentage', placeholder: 'Like 0.5', inputMode: 'decimal' },
        { key: 'min', label: 'Minimum (optional)', placeholder: 'No minimum', inputMode: 'decimal' },
        { key: 'max', label: 'Maximum (optional)', placeholder: 'No maximum', inputMode: 'decimal' },
      ],
      { title: 'New fee' },
    )
    if (!v) return
    const n = (k: string) => (v[k]?.trim() ? Number(v[k].replace(',', '.').replace('%', '')) : undefined)
    const name = v.name?.trim()
    const [pct, min, max] = [n('pct'), n('min'), n('max')]
    if (!name || pct == null || !(pct >= 0) || [min, max].some((x) => x != null && !(x >= 0)))
      return void showAlert('Give it a name and a percentage, with numbers for the minimum and maximum if you set them.')
    if (min != null && max != null && min > max) return void showAlert('The minimum is more than the maximum.')
    const t = { id: crypto.randomUUID(), name, pct, ...(min != null ? { min } : {}), ...(max != null ? { max } : {}) }
    saveSettings({ ...settings, feeTemplates: [...ownTemplates, t] })
    pickFee(t.id)
  }
  const removeFeeTemplate = async (id: string) => {
    const t = ownTemplates.find((x) => x.id === id)
    if (!t || !(await ask(`Remove the ${t.name} fee? Fees already saved stay.`, { ok: 'Remove', danger: true }))) return
    saveSettings({ ...settings, feeTemplates: ownTemplates.filter((x) => x.id !== id) })
    pickFee('none')
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const value = Number(amount.replace(',', '.'))
    if (!Number.isFinite(value) || value <= 0) return
    if ((tab === 'expense' || tab === 'income') && !category) return void showAlert('Pick a category.')
    // The time orders entries within a day, newest first.
    if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return void showAlert(clock12 ? 'Type the time like 09:30 and pick AM or PM.' : 'Type the time like 09:30 or 21:15.')
    const base = { amount: value, date, ...(time && { time }), description: description.trim(), category: '' }
    let t: NewTransaction
    if (tab === 'expense' || tab === 'income') t = { ...base, kind: tab, category, account, ...(tab === 'expense' && notSpending && { notSpending: true }) }
    else if (tab === 'transfer') {
      if (account === toAccount) return void showAlert('Pick two different accounts.')
      t = { ...base, kind: 'transfer', account, toAccount }
    } else if (debtMode === 'repay') t = { ...base, kind: 'repay', account, debt }
    else t = { ...base, kind: 'borrow', debt, ...(account ? { account } : {}) }
    // Keep an imported entry's month unless the date moved it to another month.
    if (existing && existing.date.slice(0, 7) !== existing.month && date === existing.date) t.month = existing.month
    const id = existing?.id ?? draft?.id
    if (feeValue > 0) {
      // The fee is its own expense from the same account, saved next to the entry it belongs to.
      const mainId = id ?? crypto.randomUUID()
      const label = feeTemplate?.name ?? 'Transfer'
      report(backend.updateTransaction(mainId, t))
      report(
        backend.updateTransaction(`${mainId}-fee`, {
          kind: 'expense',
          amount: feeValue,
          date,
          ...(time && { time }),
          ...(t.month ? { month: t.month } : {}),
          category: feeCategory(settings.categories.expense),
          account,
          description: `${label} fee${t.description ? ` · ${t.description}` : ''}`,
        }),
      )
    } else report(id ? backend.updateTransaction(id, t) : backend.addTransaction(t))
    onSaved?.(t)
    onClose()
  }

  const remove = async () => {
    if (!existing || !(await ask('Delete this entry?', { ok: 'Delete', danger: true }))) return
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
        {feeShown > 0 && (
          <p className="amount-fee" aria-live="polite">
            + {money2(feeShown)} {feeTemplate?.name ?? 'transfer'} fee
            {amountValue > 0 && <> · {money2(amountValue + feeShown)} in total</>}
          </p>
        )}

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
            if (!feeTouched) setFee(defaultFee(a, settings.feeTemplates))
            if (a === toAccount) setToAccount(accounts.find((x) => x !== a) ?? '')
          }}
          onAdd={addAccount}
          addLabel="New account"
        />
        {tab === 'transfer' && <Chips label="To" options={accounts.filter((a) => a !== account)} value={toAccount} onChange={setToAccount} />}

        {(tab === 'expense' || tab === 'income') && (
          <div className="field">
            <span className="field-label">
              Category <span className="muted small">· tap again to edit, hold to reorder</span>
            </span>
            <div className="cat-grid" role="radiogroup">
              {!categories.includes(category) && category && (
                <button type="button" role="radio" aria-checked className="active">
                  <span className="cat-icon">{categoryIcon(category)}</span>
                  <span className="cat-name">{category.replace('/', '/​')}</span>
                </button>
              )}
              {reorder.order.map((c) => (
                <button type="button" role="radio" aria-checked={c === category} key={c} {...reorder.itemProps(c, c === category ? 'active' : '')} onClick={() => pickCategory(c)}>
                  <span className="cat-icon">{categoryIcon(c)}</span>
                  <span className="cat-name">{c.replace('/', '/​')}</span>
                </button>
              ))}
              <button type="button" className="cat-add" onClick={addCategory} aria-label={`New ${catKind} category`}>
                <span className="cat-icon">+</span>
                <span className="cat-name">New</span>
              </button>
            </div>
          </div>
        )}

        {showFee && (
          <div className="field">
            <span className="field-label">
              Fee{feeShown > 0 && <span className="muted small"> · {money2(feeShown)} from {account}</span>}
            </span>
            <div className="row wrap" role="radiogroup" aria-label="Fee">
              {[{ id: 'none', name: 'No fee' }, ...templates, { id: 'custom', name: 'Other' }].map((f) => (
                <button type="button" role="radio" aria-checked={fee === f.id} key={f.id} className={`chip ${fee === f.id ? 'active' : ''}`} onClick={() => pickFee(f.id)}>
                  {f.name}
                </button>
              ))}
              <button type="button" className="chip chip-add" onClick={addFeeTemplate} aria-label="New fee">
                + New
              </button>
            </div>
            {fee === 'custom' ? (
              <input inputMode="decimal" value={customFee} onChange={(e) => setCustomFee(e.target.value)} placeholder="Fee amount" aria-label="Fee amount" />
            ) : (
              feeTemplate && (
                <span className="muted small">
                  {feeHint(feeTemplate)}
                  {ownTemplates.some((t) => t.id === fee) && (
                    <>
                      {' · '}
                      <button type="button" className="link small" onClick={() => removeFeeTemplate(fee)}>
                        Remove
                      </button>
                    </>
                  )}
                </span>
              )
            )}
          </div>
        )}

        <div className="field">
          <span className="field-label">Date and time</span>
          <div className="row wrap">
            <button type="button" className={`chip ${date === today() ? 'active' : ''}`} onClick={() => setDate(today())}>
              Today
            </button>
            <button type="button" className={`chip ${date === shiftDay(today(), -1) ? 'active' : ''}`} onClick={() => setDate(shiftDay(today(), -1))}>
              Yesterday
            </button>
            <input className="date-input" type="date" required value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
            {clock12 ? (
              <>
                <input className="time-input" inputMode="numeric" value={typed12} onChange={(e) => set12(typeTime(e.target.value), pm)} placeholder="hh:mm" aria-label="Time" maxLength={5} />
                <button type="button" className="chip ampm" aria-label={`${pm ? 'PM' : 'AM'}, tap to switch`} onClick={() => set12(typed12, !pm)}>
                  {pm ? 'PM' : 'AM'}
                </button>
              </>
            ) : (
              <input className="time-input" inputMode="numeric" value={time} onChange={(e) => setTime(typeTime(e.target.value))} placeholder="HH:MM" aria-label="Time" maxLength={5} />
            )}
          </div>
        </div>
        <label className="field">
          <span className="field-label">Note</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What was it for? (optional)" />
        </label>
        {tab === 'expense' && (
          <label className="edit-row toggle-row">
            <span className="grow">
              Don't count as an expense
              <span className="muted small block">It still comes out of {account || 'the account'}, but stays out of spending, budgets and charts.</span>
            </span>
            <input type="checkbox" role="switch" checked={notSpending} onChange={(e) => setNotSpending(e.target.checked)} />
          </label>
        )}
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

function Chips({ label, options, value, onChange, onAdd, addLabel }: { label: string; options: string[]; value: string; onChange: (v: string) => void; onAdd?: () => void; addLabel?: string }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="row wrap" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button type="button" role="radio" aria-checked={o === value} key={o} className={`chip ${o === value ? 'active' : ''}`} onClick={() => onChange(o)}>
            {categoryIcon(o)} {o}
          </button>
        ))}
        {onAdd && (
          <button type="button" className="chip chip-add" onClick={onAdd} aria-label={addLabel}>
            + New
          </button>
        )}
      </div>
    </div>
  )
}
