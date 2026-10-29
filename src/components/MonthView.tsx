import type { User } from 'firebase/auth'
import { useState } from 'react'
import { describe, draftFor, smsSettings, smsTxnId, useBankSms } from '../data/bankSms'
import { emptyPlan } from '../data/defaults'
import { usePlan, useRange, useSettings, useTransactions } from '../data/hooks'
import { currentMonth, monthLabel, shiftMonth } from '../data/month'
import { balancesBefore, summarize } from '../data/summary'
import type { ParsedSms } from '../data/smsParser'
import type { Backend, NewTransaction, Settings, SmsTarget, Transaction } from '../data/types'
import { PendingSms } from './PendingSms'
import { PlanEditor } from './PlanEditor'
import { SettingsView } from './SettingsView'
import { SummaryView } from './SummaryView'
import { TransactionForm } from './TransactionForm'
import { TransactionList, type ListFocus } from './TransactionList'

type Tab = 'summary' | 'transactions' | 'plan' | 'settings'

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
  // Set when a Summary row is tapped: the Transactions tab then shows only its entries.
  const [focus, setFocus] = useState<ListFocus | null>(null)
  const openFocus = (f: ListFocus) => {
    setFocus(f)
    setTab('transactions')
    window.scrollTo(0, 0)
  }
  // null: form closed; 'new': adding; a transaction: editing it.
  const [editing, setEditing] = useState<Transaction | 'new' | null>(null)
  // A bank SMS being reviewed in the add form.
  const [fromSms, setFromSms] = useState<ParsedSms | null>(null)

  const settings = useSettings(backend)
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
    <div className="app">
      <header className="topbar">
        <button className="icon" aria-label="Previous month" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
          ‹
        </button>
        <button className="month" onClick={() => setMonth(currentMonth())} title="Go to this month">
          <span>{monthLabel(month)}</span>
          {month !== currentMonth() && <small>Back to this month</small>}
        </button>
        <button className="icon" aria-label="Next month" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
          ›
        </button>
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
