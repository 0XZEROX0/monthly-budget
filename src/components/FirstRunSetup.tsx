import { useRef, useState } from 'react'
import { applyLang, currentLang, LANGS, msg, t, type Lang } from '../i18n'
import { ARABIC_CATEGORIES, DEFAULT_SETTINGS } from '../data/defaults'
import { currentMonth, formatWhole, parseAmount } from '../data/month'
import type { Account, AccountType, Backend, Debt, Settings } from '../data/types'
import { showAlert } from './dialog'

// The first start for someone new: pick a language, add every account with what's in it
// now, then any debts, one per lender. Saving sets the opening balances for this month
// and starts the guide (Guide.tsx). People who already have data never see this.

interface Props {
  backend: Backend
  settings: Settings
}

interface AccountRow {
  key: number
  name: string
  type: AccountType
  balance: string
}

interface DebtRow {
  key: number
  name: string
  owed: string
  limit: string
}

/** The kinds of account, each with names people in Egypt commonly have, to add with one tap. */
const GROUPS: { type: AccountType; icon: string; title: string; hint: string; picks: string[]; other: string }[] = [
  { type: 'cash', icon: '💵', title: msg('Cash'), hint: msg('Money in your wallet or at home.'), picks: [], other: msg('+ Another cash account') },
  {
    type: 'bank',
    icon: '🏦',
    title: msg('Banks'),
    hint: msg('Add each bank account or card on its own.'),
    picks: ['CIB', 'NBE', 'Banque Misr', 'QNB', 'Banque du Caire', 'HSBC'],
    other: msg('+ Other bank'),
  },
  {
    type: 'wallet',
    icon: '📱',
    title: msg('E-wallets'),
    hint: msg('Phone wallets like Vodafone Cash.'),
    picks: ['Vodafone Cash', 'Orange Cash', 'Etisalat Cash', 'WE Pay'],
    other: msg('+ Other e-wallet'),
  },
  {
    type: 'investment',
    icon: '📈',
    title: msg('Investments'),
    hint: msg('Stocks, funds, certificates or gold. They count as savings, not money to spend.'),
    picks: ['Thndr', msg('Certificates'), msg('Gold')],
    other: msg('+ Other investment'),
  },
]

/** Pay-later companies and cards people often owe. */
const LENDERS = ['valU', 'TRU', 'Contact', 'Sympl', 'Souhoola', 'Aman', msg('Credit card')]

const amount = (s: string) => (s.trim() ? parseAmount(s) : 0)

export function FirstRunSetup({ backend, settings }: Props) {
  const [step, setStep] = useState(0)
  const [lang, setLang] = useState<Lang>(currentLang())
  const next = useRef(1)
  const key = () => next.current++
  const [accounts, setAccounts] = useState<AccountRow[]>(() => [{ key: key(), name: t('Cash'), type: 'cash', balance: '' }])
  const [debts, setDebts] = useState<DebtRow[]>([])
  const [saving, setSaving] = useState(false)
  // A row just added with no name, to put the cursor in.
  const [focusKey, setFocusKey] = useState<number | null>(null)
  const { currency } = settings

  const pickLang = (l: Lang) => {
    applyLang(l)
    setLang(l)
    // The Cash row's name follows the language while it hasn't been changed.
    setAccounts((rows) => rows.map((r) => (r.type === 'cash' && (r.name === 'Cash' || r.name === 'كاش') ? { ...r, name: t('Cash') } : r)))
    // Saved now, so the choice syncs and a restart comes back to this setup in the same language.
    backend.saveSettings({ ...settings, lang: l, onboarding: 'accounts' }).catch(() => {})
  }

  const addAccount = (type: AccountType, name = '') => {
    if (name && accounts.some((a) => a.name.trim().toLowerCase() === name.toLowerCase())) return
    const k = key()
    setAccounts([...accounts, { key: k, name, type, balance: '' }])
    if (!name) setFocusKey(k)
  }
  const updateAccount = (k: number, change: Partial<AccountRow>) => setAccounts(accounts.map((a) => (a.key === k ? { ...a, ...change } : a)))
  const addDebt = (name = '') => {
    if (name && debts.some((d) => d.name.trim().toLowerCase() === name.toLowerCase())) return
    const k = key()
    setDebts([...debts, { key: k, name, owed: '', limit: '' }])
    if (!name) setFocusKey(k)
  }
  const updateDebt = (k: number, change: Partial<DebtRow>) => setDebts(debts.map((d) => (d.key === k ? { ...d, ...change } : d)))

  /** The rows with a name, or a message saying what to fix. */
  function checkAccounts(): string | null {
    const named = accounts.filter((a) => a.name.trim())
    if (!named.length) return t('Add at least one account, like Cash.')
    if (accounts.some((a) => !a.name.trim() && a.balance.trim())) return t('Give every account a name, or remove the empty ones.')
    const bad = named.find((a) => !Number.isFinite(amount(a.balance)))
    if (bad) return t('Type the balance of {name} as a number, like 2500.', { name: bad.name.trim() })
    const names = named.map((a) => a.name.trim().toLowerCase())
    if (new Set(names).size !== names.length) return t('Two accounts have the same name. Give each its own name.')
    return null
  }

  function checkDebts(): string | null {
    if (debts.some((d) => !d.name.trim() && (d.owed.trim() || d.limit.trim()))) return t('Give every debt a name, or remove the empty ones.')
    const named = debts.filter((d) => d.name.trim())
    const bad = named.find((d) => !Number.isFinite(amount(d.owed)) || !Number.isFinite(amount(d.limit)))
    if (bad) return t('Type the amounts for {name} as numbers, like 4000.', { name: bad.name.trim() })
    const names = named.map((d) => d.name.trim().toLowerCase())
    if (new Set(names).size !== names.length) return t('Two debts have the same name. Give each its own name.')
    if (named.some((d) => accounts.some((a) => a.name.trim().toLowerCase() === d.name.trim().toLowerCase())))
      return t('A debt has the same name as an account. Give it another name.')
    return null
  }

  const toDebts = () => {
    const problem = checkAccounts()
    if (problem) return void showAlert(problem)
    setStep(2)
  }

  const finish = (withDebts: boolean) => {
    const problem = withDebts ? checkDebts() : null
    if (problem) return void showAlert(problem)
    const acc: Account[] = accounts.filter((a) => a.name.trim()).map((a) => ({ name: a.name.trim(), type: a.type }))
    const debtRows = withDebts ? debts.filter((d) => d.name.trim()) : []
    const debtList: Debt[] = debtRows.map((d) => ({ name: d.name.trim(), limit: amount(d.limit) }))
    const opening = {
      month: currentMonth(),
      accounts: Object.fromEntries(accounts.filter((a) => a.name.trim()).map((a) => [a.name.trim(), amount(a.balance)])),
      debts: Object.fromEntries(debtRows.map((d) => [d.name.trim(), amount(d.owed)])),
    }
    // Set up in Arabic, the starting categories are Arabic too (they're the user's own names after that).
    const untouched = JSON.stringify(settings.categories) === JSON.stringify(DEFAULT_SETTINGS.categories)
    const arabic = lang === 'ar' && untouched ? { categories: ARABIC_CATEGORIES, debtCategory: 'أقساط' } : {}
    setSaving(true)
    backend
      .saveSettings({ ...settings, lang, accounts: acc, debts: debtList, opening, onboarding: 'guide', ...arabic })
      .catch((e: Error) => {
        setSaving(false)
        showAlert(t('Could not save: {error}', { error: e.message }))
      })
  }

  const total = accounts.reduce((sum, a) => sum + (Number.isFinite(amount(a.balance)) ? amount(a.balance) : 0), 0)
  const owed = debts.reduce((sum, d) => sum + (Number.isFinite(amount(d.owed)) ? amount(d.owed) : 0), 0)

  const progress = (
    <div className="setup-progress" aria-label={t('Step {n} of {total}', { n: step, total: 2 })}>
      {[1, 2].map((n) => (
        <span key={n} className={n <= step ? 'on' : ''} />
      ))}
    </div>
  )

  if (step === 0)
    return (
      <div className="setup setup-welcome">
        <img src="./favicon.svg" alt="" width={72} height={72} />
        <h1>{t('Welcome to Monthly Budget')}</h1>
        <p className="muted">{t("Let's set up your money in two quick steps: your accounts, then any debts. After that, a short tour shows you around.")}</p>
        <div className="segmented setup-lang" role="radiogroup" aria-label={t('Language')}>
          {LANGS.map((l) => (
            <button key={l.id} role="radio" aria-checked={lang === l.id} className={lang === l.id ? 'active' : ''} lang={l.id} onClick={() => pickLang(l.id)}>
              {l.label}
            </button>
          ))}
        </div>
        <button className="primary" onClick={() => setStep(1)}>
          {t('Start')}
        </button>
      </div>
    )

  if (step === 1)
    return (
      <div className="setup">
        {progress}
        <header className="setup-head">
          <h1>{t('Your accounts')}</h1>
          <p className="muted">{t('Add every place you keep money, with how much is in it right now. You can change all of this later in Settings.')}</p>
        </header>
        {GROUPS.map((g) => {
          const rows = accounts.filter((a) => a.type === g.type)
          return (
            <section className="card setup-group" key={g.type}>
              <div className="setup-group-head">
                <span className="setup-icon" aria-hidden>
                  {g.icon}
                </span>
                <span>
                  <h2>{t(g.title)}</h2>
                  <span className="muted small">{t(g.hint)}</span>
                </span>
              </div>
              {rows.map((a) => (
                <div className="setup-row" key={a.key}>
                  <input
                    className="grow"
                    value={a.name}
                    placeholder={t('Name')}
                    aria-label={t('Account name')}
                    autoFocus={a.key === focusKey}
                    onChange={(e) => updateAccount(a.key, { name: e.target.value })}
                  />
                  <label className="setup-money">
                    <span className="sr-only">{t('{name} balance now', { name: a.name || t('Account') })}</span>
                    <input inputMode="decimal" value={a.balance} placeholder="0" onChange={(e) => updateAccount(a.key, { balance: e.target.value })} />
                  </label>
                  <button className="icon ghost" aria-label={t('Remove {name}', { name: a.name || t('Account') })} onClick={() => setAccounts(accounts.filter((x) => x.key !== a.key))}>
                    ×
                  </button>
                </div>
              ))}
              <div className="row wrap">
                {g.picks
                  .filter((p) => !accounts.some((a) => a.name.trim().toLowerCase() === t(p).toLowerCase()))
                  .map((p) => (
                    <button key={p} className="chip chip-add" onClick={() => addAccount(g.type, t(p))}>
                      + {t(p)}
                    </button>
                  ))}
                <button className="chip chip-add" onClick={() => addAccount(g.type)}>
                  {t(g.other)}
                </button>
              </div>
            </section>
          )
        })}
        <div className="setup-foot">
          <p className="setup-total">
            {t('Total')} <strong>{formatWhole(total, currency)}</strong>
          </p>
          <div className="row">
            <button onClick={() => setStep(0)}>{t('Back')}</button>
            <button className="primary grow" onClick={toDebts}>
              {t('Next')}
            </button>
          </div>
        </div>
      </div>
    )

  return (
    <div className="setup">
      {progress}
      <header className="setup-head">
        <h1>{t('Your debts')}</h1>
        <p className="muted">{t('Do you owe money, like instalments or a credit card? Add each lender on its own, so you can see what you owe each one. No debts? Skip this.')}</p>
      </header>
      <section className="card setup-group">
        <div className="setup-group-head">
          <span className="setup-icon" aria-hidden>
            💳
          </span>
          <span>
            <h2>{t('Debts')}</h2>
            <span className="muted small">{t('Owed now: what you still have to pay back. Limit: the most they let you borrow (optional).')}</span>
          </span>
        </div>
        {debts.map((d) => (
          <div className="setup-debt" key={d.key}>
            <div className="setup-row">
              <input className="grow" value={d.name} placeholder={t('Lender, like valU')} aria-label={t('Lender')} autoFocus={d.key === focusKey} onChange={(e) => updateDebt(d.key, { name: e.target.value })} />
              <button className="icon ghost" aria-label={t('Remove {name}', { name: d.name || t('Debt') })} onClick={() => setDebts(debts.filter((x) => x.key !== d.key))}>
                ×
              </button>
            </div>
            <div className="setup-row">
              <label className="field grow">
                <span className="field-label">{t('Owed now')}</span>
                <input inputMode="decimal" value={d.owed} placeholder="0" onChange={(e) => updateDebt(d.key, { owed: e.target.value })} />
              </label>
              <label className="field grow">
                <span className="field-label">{t('Limit')}</span>
                <input inputMode="decimal" value={d.limit} placeholder={t('Optional')} onChange={(e) => updateDebt(d.key, { limit: e.target.value })} />
              </label>
            </div>
          </div>
        ))}
        <div className="row wrap">
          {LENDERS.filter((p) => !debts.some((d) => d.name.trim().toLowerCase() === t(p).toLowerCase())).map((p) => (
            <button key={p} className="chip chip-add" onClick={() => addDebt(t(p))}>
              + {t(p)}
            </button>
          ))}
          <button className="chip chip-add" onClick={() => addDebt()}>
            {t('+ Other lender')}
          </button>
        </div>
      </section>
      <div className="setup-foot">
        {debts.length > 0 && (
          <p className="setup-total">
            {t('Total owed')} <strong>{formatWhole(owed, currency)}</strong>
          </p>
        )}
        <div className="row">
          <button onClick={() => setStep(1)} disabled={saving}>
            {t('Back')}
          </button>
          {debts.length ? (
            <button className="primary grow" onClick={() => finish(true)} disabled={saving}>
              {t('Finish')}
            </button>
          ) : (
            <button className="primary grow" onClick={() => finish(false)} disabled={saving}>
              {t('I have no debts')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
