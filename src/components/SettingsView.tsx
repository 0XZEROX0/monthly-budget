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
import { QuickBarCard } from './QuickBarCard'
import { quickBarSupported } from '../native/quickBar'
import { UpdateCard } from './UpdateCard'
import { FeedbackCard } from './FeedbackCard'
import { useReorder } from './useReorder'
import { ask, askText, showAlert } from './dialog'
import { askEditCategory, askEditHolder, askNewCategory } from './categoryRename'
import { Picker } from './Picker'
import { applyLang, LANGS, msg, t, type Lang } from '../i18n'
import { formatDateWith } from '../data/month'

interface Props {
  backend: Backend
  settings: Settings
  sms: BankSms
  user: User | null | undefined
  onSignOut?: () => void
  lock: { enabled: boolean; setEnabled: (on: boolean) => void }
  /** A group to open, like 'planning' when coming from the goals card. */
  initialGroup?: string
  /** Opens the tour of the app again. */
  onShowGuide?: () => void
}

const CURRENCIES = ['EGP', 'USD', 'EUR', 'GBP', 'SAR', 'AED', 'KWD', 'QAR', 'TRY']
const fail = (e: Error) => showAlert(t('Could not save: {error}', { error: e.message }))

export function SettingsView({ backend, settings, sms, user, onSignOut, lock, initialGroup, onShowGuide }: Props) {
  const save = (s: Settings) => backend.saveSettings(s).catch(fail)
  // Name and icon in one popup, as on the add screen.
  const newCategory = (kind: 'expense' | 'income') => askNewCategory(settings, kind).then((r) => r && save(r.settings))
  const editHolder: EditHolder = (what, name) => void askEditHolder(backend, settings, what, name)
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
    <SettingsGroup id={id} title={t(title)} hint={t(hint)} icon={icon} open={open === id} onToggle={() => toggle(id)}>
      {children}
    </SettingsGroup>
  )

  return (
    <div className="stack">
      <section className="card">
        <h2>{t('Account')}</h2>
        {backend.mode === 'cloud' && user ? (
          <div className="row wrap">
            <span className="grow">
              {t('Signed in as')} <strong>{user.email}</strong>. {t('Your data syncs across devices.')}
            </span>
            <button onClick={onSignOut}>{t('Sign out')}</button>
          </div>
        ) : (
          <p className="muted small">{t('Local mode: data is saved in this browser only.')}</p>
        )}
      </section>

      <LanguageCard settings={settings} onSave={save} />

      {onShowGuide && (
        <button className="card hint guide-again" onClick={onShowGuide}>
          <span className="setup-icon" aria-hidden>
            🧭
          </span>
          <span>
            <strong>{t('How to use the app')}</strong>
            <span className="muted small">{t('Take the short tour again: what each page does and how to add entries.')}</span>
          </span>
        </button>
      )}

      {group(
        'money',
        msg('Money'),
        msg('Currency, accounts, debts and opening balances'),
        '💰',
        <>
          <section className="card">
            <div className="edit-row">
              <span className="grow">{t('Currency')}</span>
              <Picker label={t('Currency')} value={settings.currency} options={[...new Set([settings.currency, ...CURRENCIES])].map((c) => ({ value: c, label: c }))} onChange={(c) => save({ ...settings, currency: c })} />
            </div>
          </section>
          <AccountsEditor settings={settings} onSave={save} onEdit={editHolder} />
          <DebtsEditor settings={settings} onSave={save} onEdit={editHolder} />
          <OpeningEditor settings={settings} onSave={save} onEdit={editHolder} />
        </>,
      )}

      {group(
        'categories',
        msg('Categories'),
        msg('Names, icons and order'),
        '🏷️',
        <>
          <CategoryEditor title={t('Expense categories')} list={settings.categories.expense} onChange={(l) => setCategories('expense', l)} onEdit={(c) => askEditCategory(backend, settings, 'expense', c)} onNew={() => newCategory('expense')} />
          <CategoryEditor title={t('Income categories')} list={settings.categories.income} onChange={(l) => setCategories('income', l)} onEdit={(c) => askEditCategory(backend, settings, 'income', c)} onNew={() => newCategory('income')} />
        </>,
      )}

      {group(
        'planning',
        msg('Bills, goals and alerts'),
        msg('Reminders, savings goals and budget warnings'),
        '📆',
        <>
          <BillsEditor settings={settings} onSave={save} />
          <GoalsEditor settings={settings} onSave={save} />
          <AlertsCard settings={settings} onSave={save} />
        </>,
      )}

      {group('sms', msg('Bank SMS'), msg('Add entries from your bank and wallet messages'), '✉️', <SmsSettingsCard sms={sms} settings={settings} onSave={save} />)}

      {group(
        'look',
        msg('Look and security'),
        msg('Theme, dark mode, decimals, clock and app lock'),
        '🎨',
        <>
          <ThemeCard settings={settings} onSave={save} />
          <section className="card">
            <h2>{t('Display')}</h2>
            <label className="edit-row toggle-row">
              <span className="grow">
                {t('Show decimals')}
                <span className="muted small block">{t('Amounts like 1,284.50 instead of 1,285.')}</span>
              </span>
              <input type="checkbox" role="switch" checked={!!settings.decimals} onChange={(e) => save({ ...settings, decimals: e.target.checked })} />
            </label>
            <label className="edit-row toggle-row">
              <span className="grow">
                {t('12-hour clock')}
                <span className="muted small block">{t('Times like 8:30 PM instead of 20:30.')}</span>
              </span>
              <input type="checkbox" role="switch" checked={!!settings.clock12} onChange={(e) => save({ ...settings, clock12: e.target.checked })} />
            </label>
          </section>
          <SecurityCard enabled={lock.enabled} onChange={lock.setEnabled} />
        </>,
      )}

      {group(
        'data',
        msg('Backup and import'),
        msg('Google Drive backup, CSV export and Excel import'),
        '☁️',
        <>
          <BackupCard backend={backend} settings={settings} />
          <ImportCard backend={backend} settings={settings} />
        </>,
      )}

      {group('feedback', msg('Feedback'), msg('Suggest a feature or report a problem'), '💬', <FeedbackCard user={backend.mode === 'cloud' ? user : null} />)}

      {group(
        'app',
        msg('App'),
        quickBarSupported ? msg('Quick-add bar, updates and erasing your data') : msg('Updates and erasing your data'),
        '⚙️',
        <>
          {quickBarSupported && <QuickBarCard />}
          <UpdateCard />
          <section className="card">
            <h2>{t('Danger zone')}</h2>
            <p className="muted small">{t('Erase every transaction, plan and setting, on all your devices.')}</p>
            <button
              className="danger"
              onClick={() => {
                askText(t('Type ERASE to delete all your budget data, on all your devices.'), { title: t('Erase all data'), ok: t('Erase'), danger: true, placeholder: 'ERASE' }).then((v) => {
                  if (v?.trim() === 'ERASE') backend.clearAll().catch(fail)
                })
              }}
            >
              {t('Erase all data')}
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

const fullDate = (iso: string) => formatDateWith(new Date(iso + 'T00:00'), { day: 'numeric', month: 'short', year: 'numeric' })

function ImportCard({ backend, settings }: { backend: Backend; settings: Settings }) {
  const input = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState('')
  const onFile = async (file: File) => {
    setStatus(t('Reading the file…'))
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
          res.newAccounts.length ? t('New accounts: {names}.', { names: res.newAccounts.join(', ') }) : '',
          res.newCategories.length ? t('New categories: {names}.', { names: res.newCategories.join(', ') }) : '',
        ].filter(Boolean)
        const ok = await ask(
          t('Found {n} entries from {first} to {last}, each in the month of its date.', { n: res.transactions.length, first: fullDate(res.first), last: fullDate(res.last) }) +
            (res.skipped ? ' ' + t('{n} more look like entries you already have (same day, type and amount) and are left out.', { n: res.skipped }) : '') +
            (added.length ? `\n\n${added.join('\n')}` : '') +
            '\n\n' +
            t('Add them? Your plans and balances stay as they are. Importing the same file again replaces these entries instead of duplicating them.'),
          { title: t('Import entries'), ok: t('Import') },
        )
        if (!ok) return setStatus('')
        setStatus(t('Importing…'))
        await backend.importAll({ settings: res.settings, plans: {}, transactions: res.transactions })
        return setStatus(res.skipped ? t('Imported {n} entries, skipped {skipped} you already had.', { n: res.transactions.length, skipped: res.skipped }) : t('Imported {n} entries.', { n: res.transactions.length }))
      }
      const res = importGrids(sheets, settings)
      const first = res.months[0].month
      const last = res.months[res.months.length - 1].month
      const ok = await ask(
        t('Found {months} months ({first} to {last}) with {n} entries.', { months: res.months.length, first: monthLabel(first), last: monthLabel(last), n: res.transactions.length }) +
          '\n\n' +
          t('Import them? Your accounts, debts, categories and plans will be set from the sheet. Importing the same file again replaces those entries instead of duplicating them.'),
        { title: t('Import sheet'), ok: t('Import') },
      )
      if (!ok) return setStatus('')
      setStatus(t('Importing…'))
      // The sheet knows nothing about bank SMS, so keep those settings.
      await backend.importAll(settings.sms ? { ...res, settings: { ...res.settings, sms: settings.sms } } : res)
      setStatus(t('Imported {n} entries from {months} months.', { n: res.transactions.length, months: res.months.length }))
    } catch (e) {
      setStatus(t('Import failed: {error}', { error: (e as Error).message }))
    } finally {
      if (input.current) input.current.value = ''
    }
  }
  return (
    <section className="card">
      <h2>{t('Import from Excel')}</h2>
      <p className="muted small">
        {t("Your Google Sheet: choose File › Download › Microsoft Excel (.xlsx), then pick that file here. Every month tab (like 10/2026) is imported, and balances are matched to the sheet's own totals.")}
      </p>
      <p className="muted small">
        {t('An export from another budget app (like Money Manager), with one entry per row and its date in the first column, works too. Each entry goes into the month of its date, and new accounts and categories are added for you.')}
      </p>
      <input ref={input} type="file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      <button className="primary" onClick={() => input.current?.click()}>
        {t('Choose Excel file')}
      </button>
      {status && <p className="small">{status}</p>}
    </section>
  )
}

type EditHolder = (what: 'account' | 'debt', name: string) => void

/** An account's or debt's icon and name; tap to change them. */
function HolderName({ name, suffix = '', onClick }: { name: string; suffix?: string; onClick: () => void }) {
  return (
    <button className="holder-name grow" aria-label={t('Edit {name}', { name })} onClick={onClick}>
      <span className="cat-icon plan-icon">{categoryIcon(name)}</span>
      <strong>
        {name}
        {suffix}
      </strong>
    </button>
  )
}

const NEW_TYPE = '\u0000new'

function AccountsEditor({ settings, onSave, onEdit }: { settings: Settings; onSave: (s: Settings) => void; onEdit: EditHolder }) {
  const [name, setName] = useState('')
  const set = (accounts: Account[]) => onSave({ ...settings, accounts })
  const update = (i: number, a: Account) => set(settings.accounts.map((x, j) => (j === i ? a : x)))
  const types = [...ACCOUNT_TYPES.map((x) => ({ ...x, label: t(x.label) })), ...(settings.accountTypes ?? []).map((x) => ({ id: x, label: x }))]
  const setType = async (i: number, type: string) => {
    if (type !== NEW_TYPE) return update(i, { ...settings.accounts[i], type })
    const name = (await askText(t('Like Credit card or Prepaid card. It counts as money you can spend, like a bank.'), { title: t('New account type'), placeholder: t('Type name') }))?.trim()
    if (!name) return
    const existing = types.find((x) => x.label.toLowerCase() === name.toLowerCase())
    const accounts = settings.accounts.map((x, j) => (j === i ? { ...x, type: existing?.id ?? name } : x))
    onSave({ ...settings, accounts, ...(existing ? {} : { accountTypes: [...(settings.accountTypes ?? []), name] }) })
  }
  return (
    <section className="card">
      <h2>{t('Accounts')}</h2>
      <p className="muted small">{t('Where your money is. Cash, bank, e-wallets and your own types count as liquidity; investments count toward capital. Tap one to change its name or icon.')}</p>
      {settings.accounts.map((a, i) => (
        <div className="edit-group" key={a.name}>
        <div className="edit-row">
          <HolderName name={a.name} onClick={() => onEdit('account', a.name)} />
          <Picker
            label={t('{name} type', { name: a.name })}
            value={a.type}
            onChange={(v) => setType(i, v)}
            options={[
              ...[...types, ...(types.some((x) => x.id === a.type) ? [] : [{ id: a.type, label: a.type }])].map((x) => ({ value: x.id, label: x.label })),
              { value: NEW_TYPE, label: t('+ New type…') },
            ]}
          />
          <button className="icon ghost" aria-label={t('Remove {name}', { name: a.name })} onClick={() => ask(t('Remove {name}? Its past entries stay.', { name: a.name }), { ok: t('Remove'), danger: true }).then((ok) => ok && set(settings.accounts.filter((_, j) => j !== i)))}>
            ×
          </button>
        </div>
        {a.type === 'investment' && (
          <label className="edit-row sub-row">
            <span className="grow muted small">{t('Interest rate')}</span>
            <span className="mini">
              <NumberInput value={a.interestPct ?? 0} onChange={(n) => update(i, { ...a, interestPct: n })} />
              <span>%</span>
            </span>
          </label>
        )}
        </div>
      ))}
      <AddRow placeholder={t('New account')} value={name} onChange={setName} onAdd={() => {
        const n = name.trim()
        if (n && !settings.accounts.some((a) => a.name === n)) set([...settings.accounts, { name: n, type: guessType(n) }])
        setName('')
      }} />
    </section>
  )
}

function DebtsEditor({ settings, onSave, onEdit }: { settings: Settings; onSave: (s: Settings) => void; onEdit: EditHolder }) {
  const [name, setName] = useState('')
  const set = (debts: Debt[]) => onSave({ ...settings, debts })
  return (
    <section className="card">
      <h2>{t('Debts')}</h2>
      <p className="muted small">{t('Lenders and their limits (the number at the end). Add what you owe under Opening balances or with a Debt entry. Tap one to change its name or icon.')}</p>
      {settings.debts.map((d, i) => (
        <div className="edit-row" key={d.name}>
          <HolderName name={d.name} onClick={() => onEdit('debt', d.name)} />
          <label className="mini">
            <span className="sr-only">{t('Limit')}</span>
            <NumberInput value={d.limit} onChange={(n) => set(settings.debts.map((x, j) => (j === i ? { ...x, limit: n } : x)))} />
          </label>
          <button className="icon ghost" aria-label={t('Remove {name}', { name: d.name })} onClick={() => ask(t('Remove {name}?', { name: d.name }), { ok: t('Remove'), danger: true }).then((ok) => ok && set(settings.debts.filter((_, j) => j !== i)))}>
            ×
          </button>
        </div>
      ))}
      <div className="edit-row">
        <span className="grow">{t('Payments count as')}</span>
        <Picker
          label={t('Payments count as')}
          value={settings.debtCategory ?? ''}
          onChange={(v) => onSave({ ...settings, debtCategory: v })}
          options={[{ value: '', label: t('Their own row') }, ...settings.categories.expense.map((c) => ({ value: c, label: c, icon: categoryIcon(c) }))]}
        />
      </div>
      <AddRow placeholder={t('New lender')} value={name} onChange={setName} onAdd={() => {
        const n = name.trim()
        if (n && !settings.debts.some((d) => d.name === n)) set([...settings.debts, { name: n, limit: 0 }])
        setName('')
      }} />
    </section>
  )
}

function OpeningEditor({ settings, onSave, onEdit }: { settings: Settings; onSave: (s: Settings) => void; onEdit: EditHolder }) {
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
      <h2>{t('Opening balances')}</h2>
      <p className="muted small">{t('What you had at the start of the first month you track. Every later month is worked out from your entries.')}</p>
      <label className="edit-row">
        <span className="grow">{t('First month')}</span>
        <input type="month" value={opening.month} onChange={(e) => e.target.value && set({ month: e.target.value })} style={{ width: 'auto' }} />
      </label>
      {settings.accounts.map((a) => (
        <div className="edit-row" key={a.name}>
          <HolderName name={a.name} onClick={() => onEdit('account', a.name)} />
          <label className="mini">
            <span className="sr-only">{t('{name} opening balance', { name: a.name })}</span>
            <NumberInput value={opening.accounts[a.name] ?? 0} onChange={(n) => set({ accounts: { ...opening.accounts, [a.name]: n } })} />
          </label>
        </div>
      ))}
      {settings.debts.map((d) => (
        <div className="edit-row" key={d.name}>
          <HolderName name={d.name} suffix={' ' + t('owed')} onClick={() => onEdit('debt', d.name)} />
          <label className="mini">
            <span className="sr-only">{t('{name} owed at the start', { name: d.name })}</span>
            <NumberInput value={opening.debts[d.name] ?? 0} onChange={(n) => set({ debts: { ...opening.debts, [d.name]: n } })} />
          </label>
        </div>
      ))}
      <AddRow placeholder={t('Add a debt, like TRU or Valu')} value={lender} onChange={setLender} onAdd={addLender} />
      <p className="muted small">
        {t('Total opening:')} {formatWhole(Object.values(opening.accounts).reduce((a, b) => a + b, 0), settings.currency)}
      </p>
    </section>
  )
}

function AddRow({ placeholder, value, onChange, onAdd }: { placeholder: string; value: string; onChange: (v: string) => void; onAdd: () => void }) {
  return (
    <div className="row">
      <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onAdd()} />
      <button onClick={onAdd}>{t('Add')}</button>
    </div>
  )
}

function CategoryEditor({ title, list, onChange, onEdit, onNew }: { title: string; list: string[]; onChange: (l: string[]) => void; onEdit: (c: string) => void; onNew: () => void }) {
  const reorder = useReorder(list, onChange)
  return (
    <section className="card">
      <h2>{title}</h2>
      <p className="muted small">{t('Tap a category to change its name or icon. Hold and drag it to change the order.')}</p>
      <ul className="chips">
        {reorder.order.map((c) => (
          <li key={c} {...reorder.itemProps(c)}>
            <button className="chip-name" aria-label={t('Edit {name}', { name: c })} onClick={() => onEdit(c)}>
              {categoryIcon(c)} {c}
            </button>
            <button aria-label={t('Remove {name}', { name: c })} onClick={() => ask(t('Remove "{name}"? Past entries keep it.', { name: c }), { ok: t('Remove'), danger: true }).then((ok) => ok && onChange(list.filter((x) => x !== c)))}>
              ×
            </button>
          </li>
        ))}
        <li className="chip-new">
          <button onClick={onNew}>{t('+ New')}</button>
        </li>
      </ul>
    </section>
  )
}

function AlertsCard({ settings, onSave }: { settings: Settings; onSave: (s: Settings) => void }) {
  const alerts = settings.alerts ?? {}
  const set = (a: Partial<typeof alerts>) => onSave({ ...settings, alerts: { ...alerts, ...a } })
  return (
    <section className="card">
      <h2>{t('Budget alerts')}</h2>
      <label className="edit-row toggle-row">
        <span className="grow">
          {t('Warn me before I run out')}
          <span className="muted small block">{t('A notification and a card on the Summary when a category reaches the level below, and again when it goes over.')}</span>
        </span>
        <input type="checkbox" role="switch" checked={!alerts.off} onChange={(e) => set({ off: !e.target.checked })} />
      </label>
      {!alerts.off && (
        <div className="edit-row">
          <span className="grow">{t('Alert at')}</span>
          <Picker label={t('Alert at')} value={String(alerts.pct ?? 80)} onChange={(v) => set({ pct: Number(v) })} options={[50, 70, 75, 80, 90].map((p) => ({ value: String(p), label: t('{pct}% of budget', { pct: p }) }))} />
        </div>
      )}
    </section>
  )
}

const MODES: { id: ThemeMode; label: string }[] = [
  { id: 'system', label: msg('System') },
  { id: 'light', label: msg('Light') },
  { id: 'dark', label: msg('Dark') },
]

function ThemeCard({ settings, onSave }: { settings: Settings; onSave: (s: Settings) => void }) {
  const theme = settings.theme ?? DEFAULT_THEME
  const set = (change: Partial<Theme>) => {
    const next = { ...theme, ...change }
    // Apply at once; saving syncs it to your other devices.
    applyTheme(next)
    onSave({ ...settings, theme: next })
  }
  return (
    <section className="card">
      <h2>{t('Themes')}</h2>
      <div className="field">
        <span className="field-label">{t('Colour')}</span>
        <div className="swatches" role="radiogroup" aria-label={t('Theme colour')}>
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
              <span className="swatch-label">{t(a.label)}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="field-label">{t('Appearance')}</span>
        <div className="segmented three">
          {MODES.map((m) => (
            <button key={m.id} className={theme.mode === m.id ? 'active' : ''} onClick={() => set({ mode: m.id })}>
              {t(m.label)}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

/** English or Arabic, for the app, the website and the watch. Its title shows in both, so it can be found in either. */
function LanguageCard({ settings, onSave }: { settings: Settings; onSave: (s: Settings) => void }) {
  const current: Lang = settings.lang ?? 'en'
  const set = (lang: Lang) => {
    // Apply at once; saving syncs it to your other devices.
    applyLang(lang)
    onSave({ ...settings, lang })
  }
  return (
    <section className="card">
      <h2>{t('Language')} · {current === 'ar' ? 'Language' : 'اللغة'}</h2>
      <div className="segmented" role="radiogroup" aria-label={t('Language')}>
        {LANGS.map((l) => (
          <button key={l.id} role="radio" aria-checked={current === l.id} className={current === l.id ? 'active' : ''} lang={l.id} onClick={() => set(l.id)}>
            {l.label}
          </button>
        ))}
      </div>
    </section>
  )
}
