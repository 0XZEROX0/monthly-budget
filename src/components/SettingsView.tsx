import type { User } from 'firebase/auth'
import { useRef, useState } from 'react'
import { categoryIcon } from '../data/icons'
import { formatWhole, monthLabel } from '../data/month'
import type { Account, AccountType, Backend, Debt, Kind, Settings } from '../data/types'
import { NumberInput } from './NumberInput'

interface Props {
  backend: Backend
  settings: Settings
  user: User | null | undefined
  onSignOut?: () => void
}

const CURRENCIES = ['EGP', 'USD', 'EUR', 'GBP', 'SAR', 'AED', 'KWD', 'QAR', 'TRY']
const fail = (e: Error) => alert(`Could not save: ${e.message}`)

export function SettingsView({ backend, settings, user, onSignOut }: Props) {
  const save = (s: Settings) => backend.saveSettings(s).catch(fail)
  const setCategories = (kind: Kind, list: string[]) => save({ ...settings, categories: { ...settings.categories, [kind]: list } })

  return (
    <div className="stack">
      <section className="card">
        <h2>Account</h2>
        {backend.mode === 'cloud' && user ? (
          <div className="row wrap">
            <span className="grow">
              Signed in as <strong>{user.email}</strong>. Your data syncs across devices.
            </span>
            <button onClick={onSignOut}>Sign out</button>
          </div>
        ) : (
          <p className="muted small">Local mode: data is saved in this browser only.</p>
        )}
      </section>

      <ImportCard backend={backend} settings={settings} />

      <section className="card">
        <label>
          Currency
          <select value={settings.currency} onChange={(e) => save({ ...settings, currency: e.target.value })}>
            {[...new Set([settings.currency, ...CURRENCIES])].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </section>

      <AccountsEditor settings={settings} onSave={save} />
      <DebtsEditor settings={settings} onSave={save} />
      <OpeningEditor settings={settings} onSave={save} />

      <CategoryEditor title="Expense categories" list={settings.categories.expense} onChange={(l) => setCategories('expense', l)} />
      <CategoryEditor title="Income categories" list={settings.categories.income} onChange={(l) => setCategories('income', l)} />

      <section className="card">
        <h2>Danger zone</h2>
        <p className="muted small">Erase every transaction, plan and setting, on all your devices.</p>
        <button
          className="danger"
          onClick={() => {
            if (prompt('Type ERASE to delete all your budget data.') === 'ERASE') backend.clearAll().catch(fail)
          }}
        >
          Erase all data
        </button>
      </section>
    </div>
  )
}

function ImportCard({ backend, settings }: { backend: Backend; settings: Settings }) {
  const input = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState('')
  const onFile = async (file: File) => {
    setStatus('Reading the file…')
    try {
      const { importWorkbook } = await import('../data/importSheet')
      const res = await importWorkbook(file, settings)
      const first = res.months[0].month
      const last = res.months[res.months.length - 1].month
      const ok = confirm(
        `Found ${res.months.length} months (${monthLabel(first)} to ${monthLabel(last)}) with ${res.transactions.length} entries.\n\n` +
          'Import them? Your accounts, debts, categories and plans will be set from the sheet. Importing the same file again replaces those entries instead of duplicating them.',
      )
      if (!ok) return setStatus('')
      setStatus('Importing…')
      await backend.importAll(res)
      setStatus(`Imported ${res.transactions.length} entries from ${res.months.length} months.`)
    } catch (e) {
      setStatus(`Import failed: ${(e as Error).message}`)
    } finally {
      if (input.current) input.current.value = ''
    }
  }
  return (
    <section className="card">
      <h2>Import from Google Sheets</h2>
      <p className="muted small">
        In your sheet choose File › Download › Microsoft Excel (.xlsx), then pick that file here. Every month tab (like 10/2026) is imported, and balances are matched to the sheet's own totals.
      </p>
      <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      <button className="primary" onClick={() => input.current?.click()}>
        Choose .xlsx file
      </button>
      {status && <p className="small">{status}</p>}
    </section>
  )
}

const TYPES: { id: AccountType; label: string }[] = [
  { id: 'cash', label: 'Cash' },
  { id: 'bank', label: 'Bank' },
  { id: 'investment', label: 'Investment' },
]

function AccountsEditor({ settings, onSave }: { settings: Settings; onSave: (s: Settings) => void }) {
  const [name, setName] = useState('')
  const set = (accounts: Account[]) => onSave({ ...settings, accounts })
  const update = (i: number, a: Account) => set(settings.accounts.map((x, j) => (j === i ? a : x)))
  return (
    <section className="card">
      <h2>Accounts</h2>
      <p className="muted small">Where your money is. Cash and bank count as liquidity; investments count toward capital.</p>
      {settings.accounts.map((a, i) => (
        <div className="edit-row" key={a.name}>
          <span className="cat-icon plan-icon">{categoryIcon(a.name)}</span>
          <strong className="grow">{a.name}</strong>
          <select value={a.type} onChange={(e) => update(i, { ...a, type: e.target.value as AccountType })} aria-label={`${a.name} type`}>
            {TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          {a.type === 'investment' && (
            <label className="mini">
              <NumberInput value={a.interestPct ?? 0} onChange={(n) => update(i, { ...a, interestPct: n })} />
              <span>%</span>
            </label>
          )}
          <button className="icon ghost" aria-label={`Remove ${a.name}`} onClick={() => confirm(`Remove ${a.name}? Its past entries stay.`) && set(settings.accounts.filter((_, j) => j !== i))}>
            ×
          </button>
        </div>
      ))}
      <AddRow placeholder="New account" value={name} onChange={setName} onAdd={() => {
        const n = name.trim()
        if (n && !settings.accounts.some((a) => a.name === n)) set([...settings.accounts, { name: n, type: 'bank' }])
        setName('')
      }} />
    </section>
  )
}

function DebtsEditor({ settings, onSave }: { settings: Settings; onSave: (s: Settings) => void }) {
  const [name, setName] = useState('')
  const set = (debts: Debt[]) => onSave({ ...settings, debts })
  return (
    <section className="card">
      <h2>Debts</h2>
      <p className="muted small">Lenders and their limits. Add what you owe under Opening balances or with a Debt entry.</p>
      {settings.debts.map((d, i) => (
        <div className="edit-row" key={d.name}>
          <span className="cat-icon plan-icon">{categoryIcon(d.name)}</span>
          <strong className="grow">{d.name}</strong>
          <label className="mini">
            <span>Limit</span>
            <NumberInput value={d.limit} onChange={(n) => set(settings.debts.map((x, j) => (j === i ? { ...x, limit: n } : x)))} />
          </label>
          <button className="icon ghost" aria-label={`Remove ${d.name}`} onClick={() => confirm(`Remove ${d.name}?`) && set(settings.debts.filter((_, j) => j !== i))}>
            ×
          </button>
        </div>
      ))}
      <AddRow placeholder="New lender" value={name} onChange={setName} onAdd={() => {
        const n = name.trim()
        if (n && !settings.debts.some((d) => d.name === n)) set([...settings.debts, { name: n, limit: 0 }])
        setName('')
      }} />
    </section>
  )
}

function OpeningEditor({ settings, onSave }: { settings: Settings; onSave: (s: Settings) => void }) {
  const { opening } = settings
  const set = (o: Partial<typeof opening>) => onSave({ ...settings, opening: { ...opening, ...o } })
  return (
    <section className="card">
      <h2>Opening balances</h2>
      <p className="muted small">What you had at the start of the first month you track. Every later month is worked out from your entries.</p>
      <label className="edit-row">
        <span className="grow">First month</span>
        <input type="month" value={opening.month} onChange={(e) => e.target.value && set({ month: e.target.value })} style={{ width: 'auto' }} />
      </label>
      {settings.accounts.map((a) => (
        <label className="edit-row" key={a.name}>
          <span className="cat-icon plan-icon">{categoryIcon(a.name)}</span>
          <span className="grow">{a.name}</span>
          <span className="mini">
            <NumberInput value={opening.accounts[a.name] ?? 0} onChange={(n) => set({ accounts: { ...opening.accounts, [a.name]: n } })} />
          </span>
        </label>
      ))}
      {settings.debts.map((d) => (
        <label className="edit-row" key={d.name}>
          <span className="cat-icon plan-icon">{categoryIcon(d.name)}</span>
          <span className="grow">{d.name} owed</span>
          <span className="mini">
            <NumberInput value={opening.debts[d.name] ?? 0} onChange={(n) => set({ debts: { ...opening.debts, [d.name]: n } })} />
          </span>
        </label>
      ))}
      <p className="muted small">
        Total opening: {formatWhole(Object.values(opening.accounts).reduce((a, b) => a + b, 0), settings.currency)}
      </p>
    </section>
  )
}

function AddRow({ placeholder, value, onChange, onAdd }: { placeholder: string; value: string; onChange: (v: string) => void; onAdd: () => void }) {
  return (
    <div className="row">
      <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onAdd()} />
      <button onClick={onAdd}>Add</button>
    </div>
  )
}

function CategoryEditor({ title, list, onChange }: { title: string; list: string[]; onChange: (l: string[]) => void }) {
  const [name, setName] = useState('')
  const add = () => {
    const n = name.trim()
    if (n && !list.includes(n)) onChange([...list, n])
    setName('')
  }
  const move = (i: number, d: number) => {
    const next = [...list]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    onChange(next)
  }
  return (
    <section className="card">
      <h2>{title}</h2>
      <ul className="chips">
        {list.map((c, i) => (
          <li key={c}>
            <span>
              {categoryIcon(c)} {c}
            </span>
            <button aria-label={`Move ${c} up`} disabled={i === 0} onClick={() => move(i, -1)}>
              ↑
            </button>
            <button aria-label={`Remove ${c}`} onClick={() => confirm(`Remove "${c}"? Past entries keep it.`) && onChange(list.filter((x) => x !== c))}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <AddRow placeholder="New category" value={name} onChange={setName} onAdd={add} />
    </section>
  )
}
