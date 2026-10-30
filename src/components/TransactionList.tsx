import { useState } from 'react'
import { categoryIcon } from '../data/icons'
import { dayLabel, formatMoney, formatWhole, showTime } from '../data/month'
import { countsAsSpending } from '../data/summary'
import type { Settings, Transaction } from '../data/types'

/** A drill-down from the Summary: one category, account or debt. */
export type ListFocus =
  | { kind: 'category'; value: string }
  | { kind: 'account'; value: string }
  | { kind: 'debt'; value: string }
  | { kind: 'debtPayments' }

interface Props {
  txns: Transaction[]
  settings: Settings
  onEdit: (t: Transaction) => void
  focus: ListFocus | null
  onClearFocus: () => void
}

const inFocus = (t: Transaction, f: ListFocus | null, debtCategory?: string) =>
  !f ||
  (f.kind === 'category'
    ? ((t.kind === 'expense' || t.kind === 'income') && t.category === f.value) || (t.kind === 'repay' && f.value === debtCategory)
    : f.kind === 'account'
      ? t.account === f.value || t.toAccount === f.value
      : f.kind === 'debt'
        ? t.debt === f.value
        : t.kind === 'repay')

const focusLabel = (f: ListFocus) => (f.kind === 'debtPayments' ? 'Debt payments' : f.value)

type Filter = 'all' | 'expense' | 'income' | 'moves'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'expense', label: 'Spent' },
  { id: 'income', label: 'Income' },
  { id: 'moves', label: 'Moves' },
]

const matches = (t: Transaction, f: Filter) =>
  f === 'all' || (f === 'expense' ? t.kind === 'expense' || t.kind === 'repay' : f === 'income' ? t.kind === 'income' : ['transfer', 'borrow', 'adjust'].includes(t.kind))

/** Title, subtitle, icon and sign for one entry. */
function describe(t: Transaction): { title: string; sub: string; icon: string; sign: '+' | '−' | '' } {
  const note = t.description
  switch (t.kind) {
    case 'expense':
      return { title: note || t.category, sub: `${note ? `${t.category} · ` : ''}${t.account ?? ''}`, icon: categoryIcon(t.category), sign: '−' }
    case 'income':
      return { title: note || t.category, sub: `${note ? `${t.category} · ` : ''}into ${t.account ?? ''}`, icon: categoryIcon(t.category), sign: '+' }
    case 'transfer':
      return { title: `${t.account} → ${t.toAccount}`, sub: note || 'Transfer', icon: '⇄', sign: '' }
    case 'repay':
      return { title: note || `Paid ${t.debt}`, sub: `Debt payment · ${t.account ?? ''}`, icon: categoryIcon(t.debt ?? 'debt'), sign: '−' }
    case 'borrow':
      return { title: note || `Borrowed · ${t.debt}`, sub: t.account ? `into ${t.account}` : 'Debt', icon: categoryIcon(t.debt ?? 'debt'), sign: '' }
    case 'adjust':
      return { title: note || 'Balance update', sub: t.debt ?? t.account ?? '', icon: categoryIcon(t.debt ?? t.account ?? ''), sign: t.amount >= 0 ? '+' : '−' }
  }
}

export function TransactionList({ txns, settings, onEdit, focus, onClearFocus }: Props) {
  const { currency } = settings
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const shown = txns.filter(
    (t) =>
      inFocus(t, focus, settings.debtCategory) &&
      matches(t, filter) &&
      (!q || [t.description, t.category, t.account, t.toAccount, t.debt].some((v) => v?.toLowerCase().includes(q))),
  )
  const days = new Map<string, Transaction[]>()
  for (const t of shown) days.set(t.date, [...(days.get(t.date) ?? []), t])
  const totalIn = shown.filter((t) => t.kind === 'income').reduce((a, t) => a + t.amount, 0)
  const totalOut = shown.filter(countsAsSpending).reduce((a, t) => a + t.amount, 0)

  return (
    <div className="stack">
      {focus && (
        <div className="focus-bar">
          <span className="cat-icon plan-icon">{focus.kind === 'debtPayments' ? categoryIcon('debt') : categoryIcon(focus.value)}</span>
          <span className="grow list-main">
            <strong>{focusLabel(focus)}</strong>
            <span className="muted small">Showing only this {focus.kind === 'category' ? 'category' : focus.kind === 'account' ? 'account' : 'debt'} for the month</span>
          </span>
          <button className="chip" onClick={onClearFocus}>
            Clear ✕
          </button>
        </div>
      )}
      <div className="segmented four">
        {FILTERS.map((f) => (
          <button key={f.id} className={filter === f.id ? 'active' : ''} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>
      <input className="search" type="search" placeholder="Search notes, categories or accounts" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="row totals small">
        <span>
          <i className="key-dot" style={{ background: 'var(--income)' }} /> In {formatWhole(totalIn, currency)}
        </span>
        <span>
          <i className="key-dot" style={{ background: 'var(--expense)' }} /> Out {formatWhole(totalOut, currency)}
        </span>
        <span className="spacer" />
        <span className="muted">{shown.length} entries</span>
      </div>
      {shown.length === 0 ? (
        <div className="empty">
          <span className="empty-icon">🧾</span>
          <p>{q ? 'Nothing matches your search.' : 'Nothing here this month yet.'}</p>
          {!q && <p className="muted small">Tap the + button to add an entry.</p>}
        </div>
      ) : (
        [...days].map(([date, list]) => {
          const net = list.reduce((a, t) => a + (t.kind === 'income' ? t.amount : countsAsSpending(t) ? -t.amount : 0), 0)
          return (
            <section key={date} className="day">
              <div className="day-head">
                <span>{dayLabel(date)}</span>
                <span className="muted">{net ? formatWhole(net, currency) : ''}</span>
              </div>
              <ul className="card list">
                {list.map((t) => {
                  const d = describe(t)
                  return (
                    <li key={t.id}>
                      <button onClick={() => onEdit(t)}>
                        <span className={`cat-icon ${t.kind}`}>{d.icon}</span>
                        <span className="list-main">
                          <span>{d.title}</span>
                          <span className="muted small">
                            {d.sub}
                            {t.time && ` · ${showTime(t.time, settings.clock12)}`}
                            {t.notSpending && ' · not counted as spending'}
                          </span>
                        </span>
                        <strong className={d.sign === '+' ? 'amount-in' : d.sign === '' ? 'muted' : ''}>
                          {d.sign}
                          {formatMoney(Math.abs(t.amount), currency)}
                        </strong>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })
      )}
    </div>
  )
}
