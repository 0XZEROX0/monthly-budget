import { useState } from 'react'
import { categoryIcon } from '../data/icons'
import { dayLabel, formatMoney, formatWhole } from '../data/month'
import type { Settings, Transaction } from '../data/types'

interface Props {
  txns: Transaction[]
  settings: Settings
  onEdit: (t: Transaction) => void
}

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

export function TransactionList({ txns, settings, onEdit }: Props) {
  const { currency } = settings
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const shown = txns.filter(
    (t) =>
      matches(t, filter) &&
      (!q || [t.description, t.category, t.account, t.toAccount, t.debt].some((v) => v?.toLowerCase().includes(q))),
  )
  const days = new Map<string, Transaction[]>()
  for (const t of shown) days.set(t.date, [...(days.get(t.date) ?? []), t])
  const totalIn = shown.filter((t) => t.kind === 'income').reduce((a, t) => a + t.amount, 0)
  const totalOut = shown.filter((t) => t.kind === 'expense' || t.kind === 'repay').reduce((a, t) => a + t.amount, 0)

  return (
    <div className="stack">
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
          const net = list.reduce((a, t) => a + (t.kind === 'income' ? t.amount : t.kind === 'expense' || t.kind === 'repay' ? -t.amount : 0), 0)
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
                          <span className="muted small">{d.sub}</span>
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
