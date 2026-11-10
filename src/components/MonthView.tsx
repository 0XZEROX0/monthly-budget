import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import type { User } from 'firebase/auth'
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { describe, draftFor, smsSettings, smsTxnId, useBankSms } from '../data/bankSms'
import { feeIdFor, smsFee } from '../data/fees'
import { emptyPlan } from '../data/defaults'
import { usePlan, useRange, useSettings, useToday, useTransactions } from '../data/hooks'
import { currentMonth, dayLabel, formatWhole, monthLabel, shiftMonth } from '../data/month'
import { balancesBefore, budgetAlerts, summarize, type MonthSummary } from '../data/summary'
import { applyTheme } from '../data/theme'
import type { ParsedSms } from '../data/smsParser'
import { notifyNow, scheduleBillReminders } from '../native/notify'
import { shareSmsWithWatch, shareWithWatch, smsSkippedOnWatch } from '../native/wear'
import { updateWidget } from '../native/widget'
import { widgetData } from '../native/widgetData'
import { LockScreen, useAppLock } from './AppLock'
import { ReportsView } from './ReportsView'
import { UpdatePrompt } from './UpdateCard'
import type { Backend, NewTransaction, Settings, SmsTarget, Transaction } from '../data/types'
import { PendingSms } from './PendingSms'
import { MonthPicker } from './MonthPicker'
import { useDesktop } from './useDesktop'
import { closeTopPopup, useBackButton, useSwipe } from './useNavigation'
import { usePull } from './usePull'
import { PlanEditor } from './PlanEditor'
import { SettingsView } from './SettingsView'
import { SummaryView } from './SummaryView'
import { TransactionForm } from './TransactionForm'
import { TransactionList, type ListFocus } from './TransactionList'
import { FirstRunSetup } from './FirstRunSetup'
import { Guide, type GuideForm, type GuideStep } from './Guide'
import { ask, showAlert } from './dialog'
import { isRtl, msg, t } from '../i18n'

type Tab = 'summary' | 'transactions' | 'plan' | 'reports' | 'settings'

const PRIVACY_KEY = 'budget-app:privacy'
/** From this width the desktop website shows Reports as a panel on the right. */
const PANEL_QUERY = '(min-width: 1280px)'

// Stroke icons drawn on a 24x24 grid.
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'summary', label: msg('Summary'), icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2' },
  { id: 'transactions', label: msg('Transactions'), icon: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01' },
  { id: 'plan', label: msg('Plan'), icon: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z' },
  { id: 'reports', label: msg('Reports'), icon: 'M3 17l6-6 4 4 8-8M15 7h6v6' },
  { id: 'settings', label: msg('Settings'), icon: 'M4 6h16M4 12h16M4 18h16M8 4v4M16 10v4M10 16v4' },
]

interface Props {
  backend: Backend
  user: User | null | undefined
  onSignOut?: () => void
}

export function MonthView({ backend, user, onSignOut }: Props) {
  const [month, setMonth] = useState(currentMonth)
  // When a new month begins with the app still open on the current one, move on to it.
  const day = useToday()
  const nowMonth = day.slice(0, 7)
  const [seenMonth, setSeenMonth] = useState(nowMonth)
  if (seenMonth !== nowMonth) {
    setSeenMonth(nowMonth)
    if (month === seenMonth) setMonth(nowMonth)
  }
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
  const wideDesk = useDesktop(PANEL_QUERY)
  // The desktop sidebar (shrinks to icons) and Reports panel (hides) can be folded away; remembered per browser.
  const [leftOpen, setLeftOpen] = useStoredFlag('budget-app:desk-left')
  const [rightOpen, setRightOpen] = useStoredFlag('budget-app:desk-right')
  // Set when a Summary row is tapped: the Transactions tab then shows only its entries.
  const [focus, setFocus] = useState<ListFocus | null>(null)
  // The Settings section to open on, when sent there from elsewhere.
  const [settingsGroup, setSettingsGroup] = useState<string>()
  // These are handed to the pages, which only redraw when something they show changes,
  // so each keeps the same identity from one draw to the next.
  const openFocus = useCallback(
    (f: ListFocus) => {
      setFocus(f)
      setTab('transactions')
      scroller.current?.scrollTo(0, 0)
    },
    [scroller],
  )
  const clearFocus = useCallback(() => setFocus(null), [])
  const openPlan = useCallback(() => setTab('plan'), [])
  const openGoals = useCallback(() => {
    setSettingsGroup('planning')
    setTab('settings')
    setTimeout(() => document.getElementById('goals')?.scrollIntoView({ behavior: 'smooth' }), 50)
  }, [])
  const openMonthSummary = useCallback((m: string) => {
    setMonth(m)
    setTab('summary')
  }, [])
  // null: form closed; 'new': adding; a transaction: editing it.
  const [editing, setEditing] = useState<Transaction | 'new' | null>(null)
  const editEntry = useCallback(
    (entry: Transaction) => {
      // Balance updates have no form; they can only be removed.
      if (entry.kind !== 'adjust') return setEditing(entry)
      ask(t('Delete this balance update?'), { ok: t('Delete'), danger: true }).then((ok) => {
        if (ok) backend.deleteTransaction(entry.id).catch((e: Error) => showAlert(e.message))
      })
    },
    [backend],
  )
  // The tab a new entry opens on (the notification bar has a button for each).
  const [startOn, setStartOn] = useState<StartOn>()
  // A bank SMS being reviewed in the add form.
  const [fromSms, setFromSms] = useState<ParsedSms | null>(null)

  const [settings, fresh] = useSettings(backend)
  // Someone new adds their accounts first (FirstRunSetup), then gets a short tour (Guide),
  // which Settings can also open again. People who were using the app before never get the setup.
  const needsSetup = !!settings && (settings.onboarding === 'accounts' || (fresh && !settings.onboarding))
  // Which way the page slides in after a swipe (1: from the right, -1: from the left).
  const [slide, setSlide] = useState<0 | 1 | -1>(0)
  const [touring, setTouring] = useState(false)
  const guideOpen = !needsSetup && (touring || settings?.onboarding === 'guide')
  // The add form kind or Settings section the tour is showing.
  const [guideForm, setGuideForm] = useState<GuideForm>()
  const [guideGroup, setGuideGroup] = useState<string>()
  const showGuideStep = useCallback(
    (step: GuideStep) => {
      setSlide(0)
      setTab(step.tab)
      setFocus(null)
      setGuideForm(step.form)
      setGuideGroup(step.group)
      if (step.group) setSettingsGroup(step.group)
      if (!step.group) scroller.current?.scrollTo(0, 0)
    },
    [scroller],
  )
  // A Settings section the tour points at: scrolled into view once it's drawn.
  useEffect(() => {
    if (!guideGroup) return
    const timer = window.setTimeout(() => {
      const head = [...document.querySelectorAll<HTMLElement>(`#settings-${guideGroup} .settings-group-head`)].find((el) => !el.closest('.pager-peek'))
      const page = head?.closest<HTMLElement>('.app, .desk-main')
      // A little above the middle, leaving room for the tour's bubble under it.
      if (head && page) page.scrollTo({ top: head.getBoundingClientRect().top - page.getBoundingClientRect().top + page.scrollTop - page.clientHeight * 0.3, behavior: 'smooth' })
    }, 80)
    return () => window.clearTimeout(timer)
  }, [guideGroup, tab])
  const endGuide = () => {
    setTouring(false)
    setGuideForm(undefined)
    setGuideGroup(undefined)
    setTab('summary')
    if (settings?.onboarding === 'guide') backend.saveSettings({ ...settings, onboarding: 'done' }).catch(() => {})
  }
  const startGuide = useCallback(() => setTouring(true), [])
  // Apply the synced theme once settings arrive (main.tsx already applied this device's last one).
  const theme = settings?.theme
  useEffect(() => {
    if (theme) applyTheme(theme)
  }, [theme])
  const sms = useBankSms(backend, settings)
  // The watch shows the same waiting bank SMS, to add or skip there.
  useEffect(() => {
    if (!settings || !sms.available) return
    shareSmsWithWatch(
      sms.pending.map((p) => {
        const t = draftFor(p, settings)
        return {
          smsId: p.smsId,
          title: describe(p),
          sub: `${dayLabel(p.date)} · ${p.wallet ?? `${p.sender} ••${p.card}`}`,
          body: p.body,
          kind: t.kind,
          amount: t.amount,
          account: t.account ?? '',
          debt: t.debt ?? '',
          category: t.category,
          description: t.description,
          date: t.date,
          // The watch picks the fee from these, as smsFee does here.
          fee: p.fee ?? 0,
          transfer: p.transfer,
          instant: !!p.instant,
          wallet: p.wallet ?? '',
        }
      }),
      sms.newestId,
    )
  }, [sms.pending, sms.newestId, sms.available, settings])
  // And skips here what was skipped there, whenever the app comes back to the front.
  const skipIds = useRef(sms.skipIds)
  useEffect(() => {
    skipIds.current = sms.skipIds
  })
  useEffect(() => {
    if (!sms.available) return
    const check = () => void smsSkippedOnWatch().then((ids) => ids.length && skipIds.current(ids))
    check()
    const handle = CapApp.addListener('resume', check)
    return () => void handle.then((h) => h.remove())
  }, [sms.available])
  const plan = usePlan(backend, month)
  const txns = useTransactions(backend, month)

  // Everything from the opening month (for balances) or the last 6 months (for trends).
  const trendFrom = shiftMonth(month, -5)
  const opening = settings?.opening.month ?? month
  const history = useRange(backend, opening < trendFrom ? opening : trendFrom, month)

  const loading = !settings || plan === undefined || !txns || !history
  // Worked out only when the data changes, not on every draw: it walks the whole history.
  const summary = useMemo(
    () => (!settings || plan === undefined || !txns || !history ? null : summarize(plan ?? emptyPlan(), settings, txns, balancesBefore(month, settings, history))),
    [settings, plan, txns, history, month],
  )

  // Bill reminders follow this month's payments, whichever month is on screen.
  const nowTxns = useTransactions(backend, nowMonth)
  useEffect(() => {
    if (settings && nowTxns) scheduleBillReminders(settings, nowTxns)
  }, [settings, nowTxns])

  // The home screen widget and budget alerts follow the current month.
  // `day` is listed so "Today" and "Yesterday" on the widgets turn over at midnight.
  const isNow = month === nowMonth
  useEffect(() => {
    if (!summary || !settings || !isNow || !txns) return
    updateWidget({ ...widgetLines(summary, settings.currency, hidden), month, data: JSON.stringify(widgetData(month, summary, settings, txns, hidden)) })
    if (!settings.alerts?.off) alertOnce(month, summary, settings.alerts?.pct ?? 80, settings.currency)
  }, [summary, settings, isNow, txns, month, hidden, day])

  // The widget's + button opens monthlybudget://add; the notification bar's buttons open
  // monthlybudget://add/expense, /income, /transfer and monthlybudget://summary.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const open = (url?: string) => {
      const link = url && parseLink(url)
      if (!link) return
      if (link === 'summary') {
        setEditing(null)
        setFocus(null)
        setMonth(currentMonth())
        setTab('summary')
        scroller.current?.scrollTo(0, 0)
        return
      }
      setStartOn(link.startOn)
      setEditing('new')
    }
    CapApp.getLaunchUrl().then((r) => open(r?.url)).catch(() => {})
    const h = CapApp.addListener('appUrlOpen', ({ url }) => open(url))
    return () => {
      h.then((x) => x.remove())
    }
  }, [scroller])

  const lock = useAppLock()

  // A short note at the bottom, like "Swipe back again to exit".
  const [toast, setToast] = useState('')
  const exitArmed = useRef(0)
  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(''), 2000)
    return () => window.clearTimeout(t)
  }, [toast])

  // Back closes the pop-up on top first, otherwise goes straight to Summary;
  // on Summary it asks for a second back within 2 seconds before leaving the app.
  useBackButton(() => {
    if (!lock.locked && closeTopPopup()) return
    const leave = () => {
      if (Date.now() - exitArmed.current < 2000) return void CapApp.exitApp()
      exitArmed.current = Date.now()
      setToast(t('Swipe back again to exit'))
    }
    if (lock.locked) return leave()
    if (tab === 'summary') return leave()
    exitArmed.current = 0
    setSlide(-1)
    setTab('summary')
    setFocus(null)
    scroller.current?.scrollTo(0, 0)
  })

  // A sideways swipe across the middle of the phone screen drags the pages along with
  // the finger. The tabs either side are kept drawn beside this one (just off screen), so
  // a swipe never waits for a page to be built; a newly needed one is built in the
  // background once a swipe lands.
  const track = useRef<HTMLDivElement>(null)
  const tabNow = useRef(tab)
  tabNow.current = tab
  // dir is the side of the screen (1: right). Right to left, the next tab comes from the left.
  const flip = isRtl() ? -1 : 1
  const near = (t: Tab, dir: 1 | -1) => TABS[TABS.findIndex((x) => x.id === t) + dir * flip]?.id
  const settledTab = useDeferredValue(tab)
  // A neighbour asked for before the background build reached it.
  const [wanted, setWanted] = useState<Tab | null>(null)
  const built = new Set<Tab | undefined>([settledTab, near(settledTab, -1), near(settledTab, 1), wanted ?? undefined])
  const beside = ([-1, 1] as const).map((dir) => ({ dir, tab: near(tab, dir) })).filter((b): b is { dir: -1 | 1; tab: Tab } => !!b.tab && built.has(b.tab))
  useSwipe(
    scroller,
    track,
    {
      canGo: (dir) => !!near(tabNow.current, dir),
      onPeek: (dir) => {
        if (!dir) return
        const to = near(tabNow.current, dir)
        if (to && !track.current?.querySelector(`[data-tab="${to}"]`)) setWanted(to)
        // Drawn level with the screen, wherever this page is scrolled to.
        const top = `${scroller.current?.scrollTop ?? 0}px`
        track.current?.querySelectorAll<HTMLElement>('.pager-peek').forEach((el) => (el.style.top = top))
      },
      onCommit: (dir) => {
        const to = near(tabNow.current, dir)
        if (!to) return
        flushSync(() => {
          setSlide(0)
          setTab(to)
          setFocus(null)
          setWanted(null)
        })
        tabNow.current = to
        scroller.current?.scrollTo(0, 0)
      },
    },
    !desktop && !lock.locked && !guideOpen,
  )

  if (lock.locked)
    return (
      <>
        <LockScreen onUnlock={lock.unlock} />
        {toast && <div className="toast" role="status">{toast}</div>}
      </>
    )

  if (settings && needsSetup) return <FirstRunSetup backend={backend} settings={settings} />

  const openTab = (t: Tab) => {
    setTab(t)
    setFocus(null)
    scroller.current?.scrollTo(0, 0)
  }

  const privacyButton = (
    <button className="icon ghost privacy" onClick={togglePrivacy} aria-pressed={hidden} aria-label={hidden ? t('Show amounts') : t('Hide amounts')} title={hidden ? t('Show amounts') : t('Hide amounts')}>
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
        {hidden && <path d="M4 4l16 16" />}
      </svg>
    </button>
  )

  // Reports and Settings don't depend on the month picked, so they show no month picker.
  const monthless = (t: Tab) => t === 'reports' || t === 'settings'
  const backToCurrent = month !== nowMonth && (
    <button className="link back-current" onClick={() => setMonth(nowMonth)}>
      {t('Back to current month')}
    </button>
  )

  // On a wide desktop screen Reports sits in its own panel on the right, so it isn't a page.
  const hasPanel = desktop && wideDesk
  const withPanel = hasPanel && rightOpen
  const view: Tab = withPanel && tab === 'reports' ? 'summary' : tab

  // A tab's page. While swiping, the next tab's page is drawn beside the current one.
  const pageFor = (view: Tab, focus: ListFocus | null) =>
    loading || !summary ? (
      <p className="center muted">{t('Loading…')}</p>
    ) : view === 'summary' ? (
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
          onPlan={openPlan}
          onSelectMonth={setMonth}
          onOpen={openFocus}
          hidden={hidden}
          desktop={desktop}
          onEditGoals={openGoals}
          today={day}
        />
      </div>
    ) : view === 'transactions' ? (
      <div className="stack">
        {!focus && <PendingSms sms={sms} onAdd={setFromSms} />}
        <TransactionList
          txns={txns}
          settings={settings}
          focus={focus}
          onClearFocus={clearFocus}
          onEdit={editEntry}
        />
      </div>
    ) : view === 'plan' ? (
      <PlanEditor backend={backend} month={month} plan={plan} settings={settings} />
    ) : view === 'reports' ? (
      <ReportsView backend={backend} settings={settings} month={nowMonth} hidden={hidden} onSelectMonth={openMonthSummary} />
    ) : (
      <SettingsView backend={backend} settings={settings} sms={sms} user={user} onSignOut={onSignOut} lock={lock} initialGroup={settingsGroup} onShowGuide={startGuide} />
    )
  const page = pageFor(view, focus)

  // A neighbouring tab's page, waiting just off screen for a swipe.
  const peekPage = ({ dir, tab: t }: { dir: -1 | 1; tab: Tab }) => (
    <main key={t} data-tab={t} className="content pager-peek" aria-hidden inert style={{ left: `${dir * 100}%` }}>
      {pageFor(t, null)}
    </main>
  )

  // Pop-ups shared by both layouts.
  const overlays = (
    <>
      {picking && <MonthPicker month={month} onPick={setMonth} onClose={() => setPicking(false)} />}

      {editing && settings && (
        <TransactionForm
          key={editing === 'new' ? `new-${startOn ?? ''}` : editing.id}
          backend={backend}
          settings={settings}
          month={month}
          existing={editing === 'new' ? null : editing}
          existingFee={editing === 'new' ? undefined : history?.find((t) => t.id === feeIdFor(editing.id))}
          startOn={editing === 'new' ? startOn : undefined}
          onClose={() => {
            setEditing(null)
            setStartOn(undefined)
          }}
        />
      )}

      <UpdatePrompt />

      {guideOpen && guideForm && settings && (
        <TransactionForm key={`guide-${guideForm}`} backend={backend} settings={settings} month={month} existing={null} startOn={guideForm} guided onClose={() => setGuideForm(undefined)} />
      )}
      {guideOpen && <Guide onStep={showGuideStep} onDone={endGuide} />}

      {fromSms && settings && (
        <TransactionForm
          backend={backend}
          settings={settings}
          month={month}
          existing={null}
          draft={draftWithFee(fromSms, settings)}
          onSaved={(t) => remember(backend, settings, fromSms, t)}
          onClose={() => setFromSms(null)}
        />
      )}
    </>
  )

  // The website on a wide screen: a sidebar of pages on the left and the page using the full width.
  if (desktop) {
    const current = TABS.find((t) => t.id === view)!
    return (
      <div className={`desk ${hasPanel ? 'has-panel' : ''} ${hasPanel && !rightOpen ? 'right-closed' : ''} ${leftOpen ? '' : 'left-closed'}`}>
        <aside className="sidebar">
          <div className="brand">
            <img src="./favicon.svg" alt="" width={34} height={34} />
            <span className="side-label">{t('Monthly Budget')}</span>
          </div>
          <button className="primary side-add" data-guide="add" onClick={() => setEditing('new')} aria-label={t('Add transaction')} title={leftOpen ? undefined : t('Add transaction')}>
            <span aria-hidden>+</span>
            <span className="side-label">{t('Add transaction')}</span>
          </button>
          <nav className="side-nav" aria-label={t('Pages')}>
            {TABS.filter((x) => !(withPanel && x.id === 'reports')).map((tab) => (
              <button key={tab.id} className={tab.id === view ? 'active' : ''} data-guide={tab.id} aria-current={tab.id === view ? 'page' : undefined} onClick={() => openTab(tab.id)} aria-label={t(tab.label)} title={leftOpen ? undefined : t(tab.label)}>
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path d={tab.icon} />
                </svg>
                <span className="side-label">{t(tab.label)}</span>
              </button>
            ))}
          </nav>
          <div className="side-foot">
            {user?.email ? (
              <>
                {user.photoURL ? <img className="avatar" src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : <span className="avatar">{(user.displayName || user.email)[0].toUpperCase()}</span>}
                <span className="side-user side-label">
                  <strong>{user.displayName || user.email}</strong>
                  {onSignOut && (
                    <button className="link small" onClick={onSignOut}>
                      {t('Sign out')}
                    </button>
                  )}
                </span>
              </>
            ) : (
              <span className="muted small side-label">{t('Saved on this device')}</span>
            )}
          </div>
        </aside>
        <div className="desk-main" ref={scroller}>
          <div ref={content}>
            <header className="desk-top">
              <button className="icon ghost panel-toggle" onClick={() => setLeftOpen(!leftOpen)} aria-pressed={!leftOpen} aria-label={leftOpen ? t('Hide sidebar') : t('Show sidebar')} title={leftOpen ? t('Hide sidebar') : t('Show sidebar')}>
                <svg viewBox="0 0 24 24" aria-hidden>
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <path d="M9 4v16" />
                  {leftOpen ? <path d="M15.5 10l-2 2 2 2" /> : <path d="M13.5 10l2 2-2 2" />}
                </svg>
              </button>
              <h1>{t(current.label)}</h1>
              <span className="spacer" />
              {!monthless(view) && backToCurrent}
              {!monthless(view) && (
                <button className="desk-month" onClick={() => setPicking(true)} aria-label={t('{month}, choose another month', { month: monthLabel(month) })}>
                  <svg viewBox="0 0 24 24" aria-hidden>
                    <rect x="3" y="5" width="18" height="16" rx="2" />
                    <path d="M3 10h18M8 3v4M16 3v4" />
                  </svg>
                  {monthLabel(month)} <span className="caret" aria-hidden>▾</span>
                </button>
              )}
              {privacyButton}
              {wideDesk && (
                <button className="icon ghost panel-toggle" onClick={() => setRightOpen(!rightOpen)} aria-pressed={!rightOpen} aria-label={rightOpen ? t('Hide Reports panel') : t('Show Reports panel')} title={rightOpen ? t('Hide Reports panel') : t('Show Reports panel')}>
                  <svg viewBox="0 0 24 24" aria-hidden>
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <path d="M15 4v16" />
                    {rightOpen ? <path d="M8.5 10l2 2-2 2" /> : <path d="M10.5 10l-2 2 2 2" />}
                  </svg>
                </button>
              )}
            </header>
            <main className={`desk-content page-${view}`}>{page}</main>
          </div>
        </div>
        {hasPanel && settings && (
          // Stays on the page while hidden, so it can slide out and back in.
          <aside className="report-panel" data-guide="reports" aria-label={t('Reports')} aria-hidden={!rightOpen} inert={!rightOpen}>
            <div className="report-panel-inner">
              <h2 className="report-panel-title">{t('Reports')}</h2>
              <ReportsView backend={backend} settings={settings} month={nowMonth} hidden={hidden} onSelectMonth={setMonth} />
            </div>
          </aside>
        )}
        {overlays}
      </div>
    )
  }

  return (
    <div className="app" ref={scroller}>
      <div className="pull" ref={content}>
      <header className="topbar">
        {monthless(tab) ? (
          <h1 className="month page-title">{t(TABS.find((x) => x.id === tab)?.label ?? '')}</h1>
        ) : (
          <button className="month" onClick={() => setPicking(true)} aria-label={t('{month}, choose another month', { month: monthLabel(month) })}>
            <span>
              {monthLabel(month)} <span className="caret" aria-hidden>▾</span>
            </span>
          </button>
        )}
        {!monthless(tab) && backToCurrent}
        {(tab === 'summary' || tab === 'reports') && privacyButton}
      </header>

      <div className="pager">
        <div className="pager-track" ref={track}>
          {beside[0]?.dir === -1 && peekPage(beside[0])}
          <main key={tab} data-tab={tab} className={`content ${slide > 0 ? 'slide-next' : slide < 0 ? 'slide-prev' : ''}`}>{page}</main>
          {beside.filter((x) => x.dir === 1).map(peekPage)}
        </div>
      </div>
      </div>

      {(tab === 'summary' || tab === 'transactions') && (
        <button className="fab" data-guide="add" aria-label={t('Add transaction')} onClick={() => setEditing('new')}>
          +
        </button>
      )}

      <nav className="tabbar">
        {TABS.map((x) => (
          <button key={x.id} className={x.id === tab ? 'active' : ''} data-guide={x.id} onClick={() => {
              setSlide(0)
              setTab(x.id)
              setFocus(null)
            }}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d={x.icon} />
            </svg>
            {t(x.label)}
          </button>
        ))}
      </nav>

      {overlays}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}

/** A yes/no choice kept in this browser (default yes), e.g. whether a desktop side panel is open. */
function useStoredFlag(key: string) {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(key) !== '0'
    } catch {
      return true
    }
  })
  const set = (v: boolean) => {
    setOn(v)
    try {
      localStorage.setItem(key, v ? '1' : '0')
    } catch {
      // Not remembered; still applies until the page closes.
    }
  }
  return [on, set] as const
}

type StartOn = 'expense' | 'income' | 'transfer'

/** What a monthlybudget:// link from the widget or the notification bar asks for. */
function parseLink(url: string): 'summary' | { startOn?: StartOn } | null {
  if (url.startsWith('monthlybudget://summary')) return 'summary'
  const m = url.match(/^monthlybudget:\/\/add(?:\/(expense|income|transfer))?/)
  return m ? { startOn: m[1] as StartOn | undefined } : null
}

function widgetLines(s: MonthSummary, currency: string, hidden: boolean) {
  const money = (n: number) => formatWhole(n, currency)
  const budget = s.planned.expense
  if (budget <= 0) return { label: t('Cash + bank'), value: hidden ? '•••••' : money(s.liquidityEnd), sub: t('No budget set this month'), pct: 0, over: false }
  const left = budget - s.actual.expense
  const pct = (s.actual.expense / budget) * 100
  return {
    label: left >= 0 ? t('Left to spend') : t('Over budget by'),
    value: money(Math.abs(left)),
    sub: hidden ? t('{pct}% of budget spent', { pct: Math.round(pct) }) : t('{spent} spent of {budget}', { spent: money(s.actual.expense), budget: money(budget) }),
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
    `${a.category ?? t('Whole budget')}: ${a.level === 'over' ? t('over by {amount}', { amount: money(a.actual - a.planned) }) : t('{pct}% used, {amount} left', { pct: Math.round((a.actual / a.planned) * 100), amount: money(a.planned - a.actual) })}`
  const over = fresh.some((a) => a.level === 'over')
  notifyNow(over ? t('Over budget') : t('Budget {pct}% used', { pct }), fresh.map(line).join('\n')).catch(() => {})
}

/** Saves the category picked for this merchant and the account picked for this card, for next time. */
/** The add form's draft for a bank SMS, with the fee it should start on. */
function draftWithFee(p: ParsedSms, settings: Settings) {
  const txn = draftFor(p, settings)
  return { id: smsTxnId(p), txn, fee: smsFee(p, txn.account ?? '', settings) }
}

function remember(backend: Backend, settings: Settings, p: ParsedSms, t: NewTransaction) {
  const cfg = smsSettings(settings)
  const target: SmsTarget | null =
    t.kind === 'expense' || t.kind === 'income' ? `account:${t.account}` : t.kind === 'borrow' && t.debt ? `debt:${t.debt}` : null
  const merchants = p.merchant && t.category && (t.kind === 'expense' || t.kind === 'income') ? { ...cfg.merchants, [describe(p).toLowerCase()]: t.category } : cfg.merchants
  const cards = target ? { ...cfg.cards, [p.card]: target } : cfg.cards
  backend.saveSettings({ ...settings, sms: { ...cfg, merchants, cards } }).catch(() => {})
}
