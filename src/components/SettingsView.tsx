import type { User } from 'firebase/auth'
import { useRef, useState, type ReactNode } from 'react'
import type { BankSms } from '../data/bankSms'
import { ACCOUNT_TYPES, guessType } from '../data/accounts'
import { categoryIcon } from '../data/icons'
import { formatWhole, monthLabel } from '../data/month'
import type { Account, Backend, Debt, Kind, Settings } from '../data/types'
import { NumberInput } from './NumberInput'
import { ACCENTS, DEFAULT_THEME, applyTheme, type Theme, type ThemeMode } from '../data/theme'
import { SecurityCard } from './AppLock'
import { BackupCard } from './BackupCard'
import { BillsEditor } from './Bills'
import { GoalsEditor } from './Goals'
import { SmsSettingsCard } from './SmsSettingsCard'
import { UpdateCard } from './UpdateCard'
import { useReorder } from './useReorder'
import { ask, askText, showAlert } from './dialog'
import { askEditCategory } from './categoryRename'
import { Picker } from './Picker'

interface Props {
  backend: Backend
  settings: Settings
  sms: BankSms
  user: User | null | undefined
  onSignOut?: () => void
  lock: { enabled: boolean; setEnabled: (on: boolean) => void }
  /** A group to open, like 'planning' when coming from the goals card. */
  initialGroup?: string
}

const CURRENCIES = ['EGP', 'USD', 'EUR', 'GBP', 'SAR', 'AED', 'KWD', 'QAR', 'TRY']
const fail = (e: Error) => showAlert(`Could not save: ${e.message}`)

export function SettingsView({ backend, settings, sms, user, onSignOut, lock, initialGroup }: Props) {
  const save = (s: Settings) => backend.saveSettings(s).catch(fail)
  const setCategories = (kind: Kind, list: string[]) => save({ ...settings, categories: { ...settings.categories, [kind]: list } })
  // One group open at a time keeps the page short; the last one opened is remembered.
  const [open, setOpen] = useState<string | null>(() => initialGroup ?? readGroup())
  const toggle = (id: string) => {
    const next = open === id ? null : id
    setOpen(next)
    try {
      localStorage.setItem(GROUP_KEY, next ?? '')
    } catch {
      /* not saved, which is fine */
    }
  }
  const group = (id: string, title: string, hint: string, icon: string, children: ReactNode) => (
    <SettingsGroup id={id} title={title} hint={hint} icon={icon} open={open === id} onToggle={() => toggle(id)}>
      {children}
    </SettingsGroup>
  )

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

      {group(
        'money',
        'Money',
        'Currency, decimals, accounts, debts and opening balances',
        '💰',
        <>
          <section className="card">
            <div className="edit-row">
              <span className="grow">Currency</span>
              <Picker label="Currency" value={settings.currency} options={[...new Set([settings.currency, ...CURRENCIES])].map((c) => ({ value: c, label: c }))} onChange={(c) => save({ ...settings, currency: c })} />
            </div>
            <label className="edit-row toggle-row">
              <span className="grow">
                Show decimals
                <span className="muted small block">Amounts like 1,284.50 instead of 1,285.</span>
              </span>
              <input type="checkbox" role="switch" checked={!!settings.decimals} onChange={(e) => save({ ...settings, decimals: e.target.checked })} />
            </label>
          </section>
          <AccountsEditor settings={settings} onSave={save} />
          <DebtsEditor settings={settings} onSave={save} />
          <OpeningEditor settings={settings} onSave={save} />
        </>,
      )}

      {group(
        'categories',
        'Categories',
        'Names, icons and order',
        '🏷️',
        <>
          <CategoryEditor title="Expense categories" list={settings.categories.expense} onChange={(l) => setCategories('expense', l)} onEdit={(c) => askEditCategory(backend, settings, 'expense', c)} />
          <CategoryEditor title="Income categories" list={settings.categories.income} onChange={(l) => setCategories('income', l)} onEdit={(c) => askEditCategory(backend, settings, 'income', c)} />
        </>,
      )}

      {group(
        'planning',
        'Bills, goals and alerts',
        'Reminders, savings goals and budget warnings',
        '📆',
        <>
          <BillsEditor settings={settings} onSave={save} />
          <GoalsEditor settings={settings} onSave={save} />
          <AlertsCard settings={settings} onSave={save} />
        </>,
      )}

      {group('sms', 'Bank SMS', 'Add entries from your bank and wallet messages', '✉️', <SmsSettingsCard sms={sms} settings={settings} onSave={save} />)}

      {group(
        'look',
        'Look and security',
        'Theme colour, dark mode and app lock',
        '🎨',
        <>
          <ThemeCard settings={settings} onSave={save} />
          <SecurityCard enabled={lock.enabled} onChange={lock.setEnabled} />
        </>,
      )}

      {group(
        'data',
        'Backup and import',
        'Google Drive backup, CSV export and Excel import',
        '☁️',
        <>
          <BackupCard backend={backend} settings={settings} />
          <ImportCard backend={backend} settings={settings} />
        </>,
      )}

      {group(
        'app',
        'App',
        'Updates and erasing your data',
        '⚙️',
        <>
          <UpdateCard />
          <section className="card">
            <h2>Danger zone</h2>
            <p className="muted small">Erase every transaction, plan and setting, on all your devices.</p>
            <button
              className="danger"
              onClick={() => {
                askText('Type ERASE to delete all your budget data, on all your devices.', { title: 'Erase all data', ok: 'Erase', danger: true, placeholder: 'ERASE' }).then((v) => {
                  if (v?.trim() === 'ERASE') backend.clearAll().catch(fail)
                })
              }}
            >
              Erase all data
            </button>
          </section>
        </>,
      )}
    </div>
  )
}

const GROUP_KEY = 'budget-app:settings-group'
const readGroup = () => {
  try {
    return localStorage.getItem(GROUP_KEY) || null
  } catch {
    return null
  }
}

function SettingsGroup({ id, title, hint, icon, open, onToggle, children }: { id: string; title: string; hint: string; icon: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div className={`settings-group ${open ? 'open' : ''}`} id={`settings-${id}`}>
      <button className="card settings-group-head" aria-expanded={open} onClick={onToggle}>
        <span className="cat-icon plan-icon">{icon}</span>
        <span className="grow list-main">
          <strong>{title}</strong>
          <span className="muted small">{hint}</span>
        </span>
        <span className="chevron" aria-hidden>
          ›
        </span>
      </button>
      {open && <div className="stack settings-group-body">{children}</div>}
    </div>
  )
}

const fullDate = (iso: string) => new Date(iso + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

function ImportCard({ backend, settings }: { backend: Backend; settings: Settings }) {
  const input = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState('')
  const onFile = async (file: File) => {
    setStatus('Reading the file…')
    try {
      const { importGrids, readWorkbook } = await import('../data/importSheet')
      const { importList, listColumns } = await import('../data/importList')
      const sheets = await readWorkbook(file)
      // A plain list of transactions (another app's export) rather than the sheet's month tabs.
      const list = sheets.map((s) => ({ s, cols: listColumns(s.grid) })).find((x) => x.cols)
      if (list?.cols) {
        const { transactions: existing } = await backend.exportAll()
        const res = importList(list.s.grid, list.cols, settings, existing)
        const added = [
          res.newAccounts.length ? `New accounts: ${res.newAccounts.join(', ')}.` : '',
          res.newCategories.length ? `New categories: ${res.newCategories.join(', ')}.` : '',
        ].filter(Boolean)
        const ok = await ask(
          `Found ${res.transactions.length} entries from ${fullDate(res.first)} to ${fullDate(res.last)}, each in the month of its date.` +
            (res.skipped ? ` ${res.skipped} more look like entries you already have (same day, type and amount) and are left out.` : '') +
            (added.length ? `\n\n${added.join('\n')}` : '') +
            '\n\nAdd them? Your plans and balances stay as they are. Importing the same file again replaces these entries instead of duplicating them.',
          { title: 'Import entries', ok: 'Import' },
        )
        if (!ok) return setStatus('')
        setStatus('Importing…')
        await backend.importAll({ settings: res.settings, plans: {}, transactions: res.transactions })
        return setStatus(`Imported ${res.transactions.length} entries${res.skipped ? `, skipped ${res.skipped} you already had` : ''}.`)
      }
      const res = importGrids(sheets, settings)
      const first = res.months[0].month
      const last = res.months[res.months.length - 1].month
      const ok = await ask(
        `Found ${res.months.length} months (${monthLabel(first)} to ${monthLabel(last)}) with ${res.transactions.length} entries.\n\n` +
          'Import them? Your accounts, debts, categories and plans will be set from the sheet. Importing the same file again replaces those entries instead of duplicating them.',
        { title: 'Import sheet', ok: 'Import' },
      )
      if (!ok) return setStatus('')
      setStatus('Importing…')
      // The sheet knows nothing about bank SMS, so keep those settings.
      await backend.importAll(settings.sms ? { ...res, settings: { ...res.settings, sms: settings.sms } } : res)
      setStatus(`Imported ${res.transactions.length} entries from ${res.months.length} months.`)
    } catch (e) {
      setStatus(`Import failed: ${(e as Error).message}`)
    } finally {
      if (input.current) input.current.value = ''
    }
  }
  return (
    <section className="card">
      <h2>Import from Excel</h2>
      <p className="muted small">
        Your Google Sheet: choose File › Download › Microsoft Excel (.xlsx), then pick that file here. Every month tab (like 10/2026) is imported, and balances are matched to the sheet's own totals.
      </p>
      <p className="muted small">
        An export from another budget app (like Money Manager), with one entry per row and its date in the first column, works too. Each entry goes into the month of its date, and new accounts and categories are added for you.
      </p>
      <input ref={input} type="file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      <button className="primary" onClick={() => input.current?.click()}>
        Choose Excel file
      </button>
      {status && <p className="small">{status}</p>}
    </section>
  )
}

const NEW_TYPE = '\u0000new'

function AccountsEditor({ settings, onSave }: { settings: Settings; onSave: (s: Settings) => void }) {
  const [name, setName] = useState('')
  const set = (accounts: Account[]) => onSave({ ...settings, accounts })
  const update = (i: number, a: Account) => set(settings.accounts.map((x, j) => (j === i ? a : x)))
  const types = [...ACCOUNT_TYPES, ...(settings.accountTypes ?? []).map((t) => ({ id: t, label: t }))]
  const setType = async (i: number, type: string) => {
    if (type !== NEW_TYPE) return update(i, { ...settings.accounts[i], type })
    const name = (await askText('Like Credit card or Prepaid card. It counts as money you can spend, like a bank.', { title: 'New account type', placeholder: 'Type name' }))?.trim()
    if (!name) return
    const existing = types.find((t) => t.label.toLowerCase() === name.toLowerCase())
    const accounts = settings.accounts.map((x, j) => (j === i ? { ...x, type: existing?.id ?? name } : x))
    onSave({ ...settings, accounts, ...(existing ? {} : { accountTypes: [...(settings.accountTypes ?? []), name] }) })
  }
  return (
    <section className="card">
      <h2>Accounts</h2>
      <p className="muted small">Where your money is. Cash, bank, e-wallets and your own types count as liquidity; investments count toward capital.</p>
      {settings.accounts.map((a, i) => (
        <div className="edit-group" key={a.name}>
        <div className="edit-row">
          <span className="cat-icon plan-icon">{categoryIcon(a.name)}</span>
          <strong className="grow">{a.name}</strong>
          <Picker
            label={`${a.name} type`}
            value={a.type}
            onChange={(v) => setType(i, v)}
            options={[
              ...[...types, ...(types.some((t) => t.id === a.type) ? [] : [{ id: a.type, label: a.type }])].map((t) => ({ value: t.id, label: t.label })),
              { value: NEW_TYPE, label: '+ New type…' },
            ]}
          />
          <button className="icon ghost" aria-label={`Remove ${a.name}`} onClick={() => ask(`Remove ${a.name}? Its past entries stay.`, { ok: 'Remove', danger: true }).then((ok) => ok && set(settings.accounts.filter((_, j) => j !== i)))}>
            ×
          </button>
        </div>
        {a.type === 'investment' && (
          <label className="edit-row sub-row">
            <span className="grow muted small">Interest rate</span>
            <span className="mini">
              <NumberInput value={a.interestPct ?? 0} onChange={(n) => update(i, { ...a, interestPct: n })} />
              <span>%</span>
            </span>
          </label>
        )}
        </div>
      ))}
      <AddRow placeholder="New account" value={name} onChange={setName} onAdd={() => {
        const n = name.trim()
        if (n && !settings.accounts.some((a) => a.name === n)) set([...settings.accounts, { name: n, type: guessType(n) }])
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
      <p className="muted small">Lenders and their limits (the number on the right). Add what you owe under Opening balances or with a Debt entry.</p>
      {settings.debts.map((d, i) => (
        <div className="edit-row" key={d.name}>
          <span className="cat-icon plan-icon">{categoryIcon(d.name)}</span>
          <strong className="grow">{d.name}</strong>
          <label className="mini">
            <span className="sr-only">Limit</span>
            <NumberInput value={d.limit} onChange={(n) => set(settings.debts.map((x, j) => (j === i ? { ...x, limit: n } : x)))} />
          </label>
          <button className="icon ghost" aria-label={`Remove ${d.name}`} onClick={() => ask(`Remove ${d.name}?`, { ok: 'Remove', danger: true }).then((ok) => ok && set(settings.debts.filter((_, j) => j !== i)))}>
            ×
          </button>
        </div>
      ))}
      <div className="edit-row">
        <span className="grow">Payments count as</span>
        <Picker
          label="Payments count as"
          value={settings.debtCategory ?? ''}
          onChange={(v) => onSave({ ...settings, debtCategory: v })}
          options={[{ value: '', label: 'Their own row' }, ...settings.categories.expense.map((c) => ({ value: c, label: c, icon: categoryIcon(c) }))]}
        />
      </div>
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
  const [lender, setLender] = useState('')
  const addLender = () => {
    const n = lender.trim()
    if (n && !settings.debts.some((d) => d.name === n)) onSave({ ...settings, debts: [...settings.debts, { name: n, limit: 0 }] })
    setLender('')
  }
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
      <AddRow placeholder="Add a debt, like TRU or Valu" value={lender} onChange={setLender} onAdd={addLender} />
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

function CategoryEditor({ title, list, onChange, onEdit }: { title: string; list: string[]; onChange: (l: string[]) => void; onEdit: (c: string) => void }) {
  const [name, setName] = useState('')
  const add = () => {
    const n = name.trim()
    if (n && !list.includes(n)) onChange([...list, n])
    setName('')
  }
  const reorder = useReorder(list, onChange)
  return (
    <section className="card">
      <h2>{title}</h2>
      <p className="muted small">Tap a category to change its name or icon. Hold and drag it to change the order.</p>
      <ul className="chips">
        {reorder.order.map((c) => (
          <li key={c} {...reorder.itemProps(c)}>
            <button className="chip-name" aria-label={`Edit ${c}`} onClick={() => onEdit(c)}>
              {categoryIcon(c)} {c}
            </button>
            <button aria-label={`Remove ${c}`} onClick={() => ask(`Remove "${c}"? Past entries keep it.`, { ok: 'Remove', danger: true }).then((ok) => ok && onChange(list.filter((x) => x !== c)))}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <AddRow placeholder="New category" value={name} onChange={setName} onAdd={add} />
    </section>
  )
}

function AlertsCard({ settings, onSave }: { settings: Settings; onSave: (s: Settings) => void }) {
  const alerts = settings.alerts ?? {}
  const set = (a: Partial<typeof alerts>) => onSave({ ...settings, alerts: { ...alerts, ...a } })
  return (
    <section className="card">
      <h2>Budget alerts</h2>
      <label className="edit-row toggle-row">
        <span className="grow">
          Warn me before I run out
          <span className="muted small block">A notification and a card on the Summary when a category reaches the level below, and again when it goes over.</span>
        </span>
        <input type="checkbox" role="switch" checked={!alerts.off} onChange={(e) => set({ off: !e.target.checked })} />
      </label>
      {!alerts.off && (
        <div className="edit-row">
          <span className="grow">Alert at</span>
          <Picker label="Alert at" value={String(alerts.pct ?? 80)} onChange={(v) => set({ pct: Number(v) })} options={[50, 70, 75, 80, 90].map((p) => ({ value: String(p), label: `${p}% of budget` }))} />
        </div>
      )}
    </section>
  )
}

const MODES: { id: ThemeMode; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
]

function ThemeCard({ settings, onSave }: { settings: Settings; onSave: (s: Settings) => void }) {
  const theme = settings.theme ?? DEFAULT_THEME
  const set = (t: Partial<Theme>) => {
    const next = { ...theme, ...t }
    // Apply at once; saving syncs it to your other devices.
    applyTheme(next)
    onSave({ ...settings, theme: next })
  }
  return (
    <section className="card">
      <h2>Themes</h2>
      <div className="field">
        <span className="field-label">Colour</span>
        <div className="swatches" role="radiogroup" aria-label="Theme colour">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              role="radio"
              aria-checked={theme.accent === a.id}
              className={`swatch ${theme.accent === a.id ? 'active' : ''}`}
              style={{ ['--sw-light' as string]: a.light, ['--sw-dark' as string]: a.dark }}
              onClick={() => set({ accent: a.id })}
            >
              <span className="swatch-dot" aria-hidden />
              <span className="swatch-label">{a.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="field-label">Appearance</span>
        <div className="segmented three">
          {MODES.map((m) => (
            <button key={m.id} className={theme.mode === m.id ? 'active' : ''} onClick={() => set({ mode: m.id })}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
