import type { User } from 'firebase/auth'
import { useEffect, useState } from 'react'
import { describe, draftFor, smsSettings, smsTxnId, useBankSms } from '../data/bankSms'
import { emptyPlan } from '../data/defaults'
import { usePlan, useRange, useSettings, useTransactions } from '../data/hooks'
import { currentMonth, monthLabel, shiftMonth } from '../data/month'
import { balancesBefore, summarize } from '../data/summary'
import { applyTheme } from '../data/theme'
import type { ParsedSms } from '../data/smsParser'
import { shareWithWatch } from '../native/wear'
import type { Backend, NewTransaction, Settings, SmsTarget, Transaction } from '../data/types'
import { PendingSms } from './PendingSms'
import { MonthPicker } from './MonthPicker'
import { usePull } from './usePull'
import { PlanEditor } from './PlanEditor'
import { SettingsView } from './SettingsView'
import { SummaryView } from './SummaryView'
import { TransactionForm } from './TransactionForm'
import { TransactionList, type ListFocus } from './TransactionList'

type Tab = 'summary' | 'transactions' | 'plan' | 'settings'

const PRIVACY_KEY = 'budget-app:privacy'

// Stroke icons drawn on a 24x24 grid.
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'summary', label: 'Summary', icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2' },
  { id: 'transactions', label: 'Transactions', icon: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01' },
  { id: 'plan', label: 'Plan', icon: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z' },
  { id: 'settings', label: 'Settings', icon: 'M4 6h16M4 12h16M4 18h16M8 4v4M16 10v4M10 16v4' },
]

interface Props {
  backend: Backend
  user: User | null | undefined
  onSignOut?: () => void
}

export function MonthView({ backend, user, onSignOut }: Props) {
  const [month, setMonth] = useState(currentMonth)
  const [tab, setTab] = useState<Tab>('summary')
  const [picking, setPicking] = useState(false)
  // Privacy mode is per device, so hiding numbers on the phone doesn't hide them elsewhere.
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(PRIVACY_KEY) === '1'
    } catch {
      return false
    }
  })
  const togglePrivacy = () =>
    setHidden((h) => {
      try {
        localStorage.setItem(PRIVACY_KEY, h ? '0' : '1')
      } catch {
        // Not stored; still applies until the app closes.
      }
      return !h
    })
  // The watch follows this phone's privacy mode.
  useEffect(() => shareWithWatch({ hidden }), [hidden])
  const { scroller, content } = usePull<HTMLDivElement, HTMLDivElement>()
  // Set when a Summary row is tapped: the Transactions tab then shows only its entries.
  const [focus, setFocus] = useState<ListFocus | null>(null)
  const openFocus = (f: ListFocus) => {
    setFocus(f)
    setTab('transactions')
    scroller.current?.scrollTo(0, 0)
  }
  // null: form closed; 'new': adding; a transaction: editing it.
  const [editing, setEditing] = useState<Transaction | 'new' | null>(null)
  // A bank SMS being reviewed in the add form.
  const [fromSms, setFromSms] = useState<ParsedSms | null>(null)

  const settings = useSettings(backend)
  // Apply the synced theme once settings arrive (main.tsx already applied this device's last one).
  const theme = settings?.theme
  useEffect(() => {
    if (theme) applyTheme(theme)
  }, [theme])
  const sms = useBankSms(backend, settings)
  const plan = usePlan(backend, month)
  const txns = useTransactions(backend, month)

  // Everything from the opening month (for balances) or the last 6 months (for trends).
  const trendFrom = shiftMonth(month, -5)
  const opening = settings?.opening.month ?? month
  const history = useRange(backend, opening < trendFrom ? opening : trendFrom, month)

  const loading = !settings || plan === undefined || !txns || !history
  const summary = loading ? null : summarize(plan ?? emptyPlan(), settings, txns, balancesBefore(month, settings, history))

  return (
    <div className="app" ref={scroller}>
      <div className="pull" ref={content}>
      <header className="topbar">
        <button className="month" onClick={() => setPicking(true)} aria-label={`${monthLabel(month)}, choose another month`}>
          <span>
            {monthLabel(month)} <span className="caret" aria-hidden>▾</span>
          </span>
        </button>
        {month !== currentMonth() && (
          <button className="link back-current" onClick={() => setMonth(currentMonth())}>
            Back to current month
          </button>
        )}
        {tab === 'summary' && (
          <button className="icon ghost privacy" onClick={togglePrivacy} aria-pressed={hidden} aria-label={hidden ? 'Show amounts' : 'Hide amounts'} title={hidden ? 'Show amounts' : 'Hide amounts'}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
              <circle cx="12" cy="12" r="3" />
              {hidden && <path d="M4 4l16 16" />}
            </svg>
          </button>
        )}
      </header>

      <main className="content">
        {loading || !summary ? (
          <p className="center muted">Loading…</p>
        ) : tab === 'summary' ? (
          <div className="stack">
            <PendingSms sms={sms} onAdd={setFromSms} onOpen={() => setTab('transactions')} />
            <SummaryView
              backend={backend}
              month={month}
              summary={summary}
              txns={txns}
              history={history}
              settings={settings}
              hasPlan={plan !== null}
              onPlan={() => setTab('plan')}
              onSelectMonth={setMonth}
              onOpen={openFocus}
            hidden={hidden}
            />
          </div>
        ) : tab === 'transactions' ? (
          <div className="stack">
            {!focus && <PendingSms sms={sms} onAdd={setFromSms} />}
            <TransactionList
              txns={txns}
              settings={settings}
              focus={focus}
              onClearFocus={() => setFocus(null)}
              onEdit={(t) => {
                // Balance updates have no form; they can only be removed.
                if (t.kind !== 'adjust') return setEditing(t)
                if (confirm('Delete this balance update?')) backend.deleteTransaction(t.id).catch((e: Error) => alert(e.message))
              }}
            />
          </div>
        ) : tab === 'plan' ? (
          <PlanEditor backend={backend} month={month} plan={plan} settings={settings} />
        ) : (
          <SettingsView backend={backend} settings={settings} sms={sms} user={user} onSignOut={onSignOut} />
        )}
      </main>
      </div>
      {picking && <MonthPicker month={month} onPick={setMonth} onClose={() => setPicking(false)} />}

      {tab !== 'settings' && tab !== 'plan' && (
        <button className="fab" aria-label="Add transaction" onClick={() => setEditing('new')}>
          +
        </button>
      )}

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={t.id === tab ? 'active' : ''} onClick={() => {
              setTab(t.id)
              setFocus(null)
            }}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d={t.icon} />
            </svg>
            {t.label}
          </button>
        ))}
      </nav>

      {editing && settings && (
        <TransactionForm
          backend={backend}
          settings={settings}
          month={month}
          existing={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}

      {fromSms && settings && (
        <TransactionForm
          backend={backend}
          settings={settings}
          month={month}
          existing={null}
          draft={{ id: smsTxnId(fromSms), txn: draftFor(fromSms, settings) }}
          onSaved={(t) => remember(backend, settings, fromSms, t)}
          onClose={() => setFromSms(null)}
        />
      )}
    </div>
  )
}

/** Saves the category picked for this merchant and the account picked for this card, for next time. */
function remember(backend: Backend, settings: Settings, p: ParsedSms, t: NewTransaction) {
  const cfg = smsSettings(settings)
  const target: SmsTarget | null =
    t.kind === 'expense' || t.kind === 'income' ? `account:${t.account}` : t.kind === 'borrow' && t.debt ? `debt:${t.debt}` : null
  const merchants = p.merchant && t.category && (t.kind === 'expense' || t.kind === 'income') ? { ...cfg.merchants, [describe(p).toLowerCase()]: t.category } : cfg.merchants
  const cards = target ? { ...cfg.cards, [p.card]: target } : cfg.cards
  backend.saveSettings({ ...settings, sms: { ...cfg, merchants, cards } }).catch(() => {})
}
