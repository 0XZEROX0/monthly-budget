import type { User } from 'firebase/auth'
import { useState } from 'react'
import { emptyPlan } from '../data/defaults'
import { usePlan, useSettings, useTransactions } from '../data/hooks'
import { currentMonth, monthLabel, shiftMonth } from '../data/month'
import { summarize } from '../data/summary'
import type { Backend, Transaction } from '../data/types'
import { PlanEditor } from './PlanEditor'
import { SettingsView } from './SettingsView'
import { SummaryView } from './SummaryView'
import { TransactionForm } from './TransactionForm'
import { TransactionList } from './TransactionList'

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
  // null: form closed; 'new': adding; a transaction: editing it.
  const [editing, setEditing] = useState<Transaction | 'new' | null>(null)

  const settings = useSettings(backend)
  const plan = usePlan(backend, month)
  const txns = useTransactions(backend, month)

  const loading = !settings || plan === undefined || !txns
  const summary = loading ? null : summarize(plan ?? emptyPlan(), settings, txns)

  return (
    <div className="app">
      <header className="topbar">
        <button className="icon" aria-label="Previous month" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
          ‹
        </button>
        <button className="month" onClick={() => setMonth(currentMonth())} title="Go to this month">
          {monthLabel(month)}
        </button>
        <button className="icon" aria-label="Next month" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
          ›
        </button>
      </header>

      <main className="content">
        {loading || !summary ? (
          <p className="center muted">Loading…</p>
        ) : tab === 'summary' ? (
          <SummaryView summary={summary} currency={settings.currency} hasPlan={plan !== null} onPlan={() => setTab('plan')} />
        ) : tab === 'transactions' ? (
          <TransactionList txns={txns} currency={settings.currency} onEdit={setEditing} />
        ) : tab === 'plan' ? (
          <PlanEditor backend={backend} month={month} plan={plan} settings={settings} />
        ) : (
          <SettingsView backend={backend} settings={settings} user={user} onSignOut={onSignOut} />
        )}
      </main>

      {tab !== 'settings' && tab !== 'plan' && (
        <button className="fab" aria-label="Add transaction" onClick={() => setEditing('new')}>
          +
        </button>
      )}

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={t.id === tab ? 'active' : ''} onClick={() => setTab(t.id)}>
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
    </div>
  )
}
