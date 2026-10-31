import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import type { User } from 'firebase/auth'
import { useEffect, useState } from 'react'
import { describe, draftFor, smsSettings, smsTxnId, useBankSms } from '../data/bankSms'
import { emptyPlan } from '../data/defaults'
import { usePlan, useRange, useSettings, useTransactions } from '../data/hooks'
import { currentMonth, formatWhole, monthLabel, shiftMonth } from '../data/month'
import { balancesBefore, budgetAlerts, summarize, type MonthSummary } from '../data/summary'
import { applyTheme } from '../data/theme'
import type { ParsedSms } from '../data/smsParser'
import { notifyNow, scheduleBillReminders } from '../native/notify'
import { shareWithWatch } from '../native/wear'
import { updateWidget } from '../native/widget'
import { LockScreen, useAppLock } from './AppLock'
import { ReportsView } from './ReportsView'
import { UpdatePrompt } from './UpdateCard'
import type { Backend, NewTransaction, Settings, SmsTarget, Transaction } from '../data/types'
import { PendingSms } from './PendingSms'
import { MonthPicker } from './MonthPicker'
import { useDesktop } from './useDesktop'
import { usePull } from './usePull'
import { PlanEditor } from './PlanEditor'
import { SettingsView } from './SettingsView'
import { SummaryView } from './SummaryView'
import { TransactionForm } from './TransactionForm'
import { TransactionList, type ListFocus } from './TransactionList'
import { ask, showAlert } from './dialog'

type Tab = 'summary' | 'transactions' | 'plan' | 'reports' | 'settings'

const PRIVACY_KEY = 'budget-app:privacy'

// Stroke icons drawn on a 24x24 grid.
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'summary', label: 'Summary', icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2' },
  { id: 'transactions', label: 'Transactions', icon: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01' },
  { id: 'plan', label: 'Plan', icon: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z' },
  { id: 'reports', label: 'Reports', icon: 'M3 17l6-6 4 4 8-8M15 7h6v6' },
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
  const desktop = useDesktop()
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
  const [settingsGroup, setSettingsGroup] = useState<string>()
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

  // Bill reminders follow this month's payments, whichever month is on screen.
  const nowTxns = useTransactions(backend, currentMonth())
  useEffect(() => {
    if (settings && nowTxns) scheduleBillReminders(settings, nowTxns)
  }, [settings, nowTxns])

  // The home screen widget and budget alerts follow the current month.
  const isNow = month === currentMonth()
  useEffect(() => {
    if (!summary || !settings || !isNow) return
    updateWidget(widgetLines(summary, settings.currency, hidden))
    if (!settings.alerts?.off) alertOnce(month, summary, settings.alerts?.pct ?? 80, settings.currency)
  })

  // The widget's + button opens monthlybudget://add.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const isAdd = (url?: string) => !!url && url.startsWith('monthlybudget://add')
    CapApp.getLaunchUrl().then((r) => isAdd(r?.url) && setEditing('new')).catch(() => {})
    const h = CapApp.addListener('appUrlOpen', ({ url }) => isAdd(url) && setEditing('new'))
    return () => {
      h.then((x) => x.remove())
    }
  }, [])

  const lock = useAppLock()
  if (lock.locked) return <LockScreen onUnlock={lock.unlock} />

  const openTab = (t: Tab) => {
    setTab(t)
    setFocus(null)
    scroller.current?.scrollTo(0, 0)
  }

  const privacyButton = (
    <button className="icon ghost privacy" onClick={togglePrivacy} aria-pressed={hidden} aria-label={hidden ? 'Show amounts' : 'Hide amounts'} title={hidden ? 'Show amounts' : 'Hide amounts'}>
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
        {hidden && <path d="M4 4l16 16" />}
      </svg>
    </button>
  )

  const backToCurrent = month !== currentMonth() && (
    <button className="link back-current" onClick={() => setMonth(currentMonth())}>
      Back to current month
    </button>
  )

  const page =
    loading || !summary ? (
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
          desktop={desktop}
          onEditGoals={() => {
            setSettingsGroup('planning')
            setTab('settings')
            setTimeout(() => document.getElementById('goals')?.scrollIntoView({ behavior: 'smooth' }), 50)
          }}
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
            ask('Delete this balance update?', { ok: 'Delete', danger: true }).then((ok) => {
              if (ok) backend.deleteTransaction(t.id).catch((e: Error) => showAlert(e.message))
            })
          }}
        />
      </div>
    ) : tab === 'plan' ? (
      <PlanEditor backend={backend} month={month} plan={plan} settings={settings} />
    ) : tab === 'reports' ? (
      <ReportsView backend={backend} settings={settings} month={month} hidden={hidden} onSelectMonth={(m) => {
        setMonth(m)
        setTab('summary')
      }} />
    ) : (
      <SettingsView backend={backend} settings={settings} sms={sms} user={user} onSignOut={onSignOut} lock={lock} initialGroup={settingsGroup} />
    )

  // Pop-ups shared by both layouts.
  const overlays = (
    <>
      {picking && <MonthPicker month={month} onPick={setMonth} onClose={() => setPicking(false)} />}

      {editing && settings && (
        <TransactionForm
          backend={backend}
          settings={settings}
          month={month}
          existing={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}

      <UpdatePrompt />

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
    </>
  )

  // The website on a wide screen: a sidebar of pages on the left and the page using the full width.
  if (desktop) {
    const current = TABS.find((t) => t.id === tab)!
    return (
      <div className="desk">
        <aside className="sidebar">
          <div className="brand">
            <img src="./favicon.svg" alt="" width={34} height={34} />
            <span>Monthly Budget</span>
          </div>
          <button className="primary side-add" onClick={() => setEditing('new')}>
            <span aria-hidden>+</span> Add transaction
          </button>
          <nav className="side-nav" aria-label="Pages">
            {TABS.map((t) => (
              <button key={t.id} className={t.id === tab ? 'active' : ''} aria-current={t.id === tab ? 'page' : undefined} onClick={() => openTab(t.id)}>
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path d={t.icon} />
                </svg>
                {t.label}
              </button>
            ))}
          </nav>
          <div className="side-foot">
            {user?.email ? (
              <>
                {user.photoURL ? <img className="avatar" src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : <span className="avatar">{(user.displayName || user.email)[0].toUpperCase()}</span>}
                <span className="side-user">
                  <strong>{user.displayName || user.email}</strong>
                  {onSignOut && (
                    <button className="link small" onClick={onSignOut}>
                      Sign out
                    </button>
                  )}
                </span>
              </>
            ) : (
              <span className="muted small">Saved on this device</span>
            )}
          </div>
        </aside>
        <div className="desk-main" ref={scroller}>
          <div ref={content}>
            <header className="desk-top">
              <h1>{current.label}</h1>
              <span className="spacer" />
              {backToCurrent}
              <button className="desk-month" onClick={() => setPicking(true)} aria-label={`${monthLabel(month)}, choose another month`}>
                <svg viewBox="0 0 24 24" aria-hidden>
                  <rect x="3" y="5" width="18" height="16" rx="2" />
                  <path d="M3 10h18M8 3v4M16 3v4" />
                </svg>
                {monthLabel(month)} <span className="caret" aria-hidden>▾</span>
              </button>
              {privacyButton}
            </header>
            <main className={`desk-content page-${tab}`}>{page}</main>
          </div>
        </div>
        {overlays}
      </div>
    )
  }

  return (
    <div className="app" ref={scroller}>
      <div className="pull" ref={content}>
      <header className="topbar">
        <button className="month" onClick={() => setPicking(true)} aria-label={`${monthLabel(month)}, choose another month`}>
          <span>
            {monthLabel(month)} <span className="caret" aria-hidden>▾</span>
          </span>
        </button>
        {backToCurrent}
        {(tab === 'summary' || tab === 'reports') && privacyButton}
      </header>

      <main className="content">{page}</main>
      </div>

      {(tab === 'summary' || tab === 'transactions') && (
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

      {overlays}
    </div>
  )
}

function widgetLines(s: MonthSummary, currency: string, hidden: boolean) {
  const money = (n: number) => formatWhole(n, currency)
  const budget = s.planned.expense
  if (budget <= 0) return { label: 'Cash + bank', value: hidden ? '•••••' : money(s.liquidityEnd), sub: 'No budget set this month', pct: 0, over: false }
  const left = budget - s.actual.expense
  const pct = (s.actual.expense / budget) * 100
  return {
    label: left >= 0 ? 'Left to spend' : 'Over budget by',
    value: money(Math.abs(left)),
    sub: hidden ? `${Math.round(pct)}% of budget spent` : `${money(s.actual.expense)} spent of ${money(budget)}`,
    pct: Math.min(100, Math.round(pct)),
    over: left < 0,
  }
}

const ALERTS_KEY = 'budget-app:alerts-sent'

/** A notification the first time a category (or the whole budget) reaches the alert level, and again when it goes over. */
function alertOnce(month: string, s: MonthSummary, pct: number, currency: string) {
  let sent: string[] = []
  try {
    sent = JSON.parse(localStorage.getItem(ALERTS_KEY) || '[]')
  } catch {
    // Treat as none sent.
  }
  const fresh = budgetAlerts(s, pct).filter((a) => !sent.includes(`${month}|${a.category ?? '*'}|${a.level}`))
  if (!fresh.length) return
  const keep = sent.filter((k) => k.startsWith(month))
  try {
    localStorage.setItem(ALERTS_KEY, JSON.stringify([...keep, ...fresh.map((a) => `${month}|${a.category ?? '*'}|${a.level}`)]))
  } catch {
    return // Without storage it would repeat on every change, so stay quiet.
  }
  const money = (n: number) => formatWhole(n, currency)
  const line = (a: (typeof fresh)[number]) =>
    `${a.category ?? 'Whole budget'}: ${a.level === 'over' ? `over by ${money(a.actual - a.planned)}` : `${Math.round((a.actual / a.planned) * 100)}% used, ${money(a.planned - a.actual)} left`}`
  const over = fresh.some((a) => a.level === 'over')
  notifyNow(over ? 'Over budget' : `Budget ${pct}% used`, fresh.map(line).join('\n')).catch(() => {})
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
