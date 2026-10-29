import { useState } from 'react'
import { categoryIcon } from '../data/icons'
import { dayLabel, formatMoney, formatWhole } from '../data/month'
import type { Kind, Transaction } from '../data/types'

interface Props {
  txns: Transaction[]
  currency: string
  onEdit: (t: Transaction) => void
}

type Filter = 'all' | Kind

export function TransactionList({ txns, currency, onEdit }: Props) {
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const shown = txns.filter(
    (t) => (filter === 'all' || t.kind === filter) && (!q || t.description.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)),
  )
  const days = new Map<string, Transaction[]>()
  for (const t of shown) days.set(t.date, [...(days.get(t.date) ?? []), t])
  const total = (list: Transaction[], kind: Kind) => list.filter((t) => t.kind === kind).reduce((a, t) => a + t.amount, 0)

  return (
    <div className="stack">
      <div className="segmented three">
        {(['all', 'expense', 'income'] as Filter[]).map((f) => (
          <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : f === 'expense' ? 'Expenses' : 'Income'}
          </button>
        ))}
      </div>
      <input className="search" type="search" placeholder="Search notes or categories" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="row totals small">
        <span>
          <i className="key-dot" style={{ background: 'var(--income)' }} /> In {formatWhole(total(shown, 'income'), currency)}
        </span>
        <span>
          <i className="key-dot" style={{ background: 'var(--expense)' }} /> Out {formatWhole(total(shown, 'expense'), currency)}
        </span>
        <span className="spacer" />
        <span className="muted">{shown.length} entries</span>
      </div>
      {shown.length === 0 ? (
        <div className="empty">
          <span className="empty-icon">🧾</span>
          <p>{q ? 'Nothing matches your search.' : 'No transactions this month yet.'}</p>
          {!q && <p className="muted small">Tap the + button to add your first one.</p>}
        </div>
      ) : (
        [...days].map(([date, list]) => (
          <section key={date} className="day">
            <div className="day-head">
              <span>{dayLabel(date)}</span>
              <span className="muted">{formatWhole(total(list, 'income') - total(list, 'expense'), currency)}</span>
            </div>
            <ul className="card list">
              {list.map((t) => (
                <li key={t.id}>
                  <button onClick={() => onEdit(t)}>
                    <span className={`cat-icon ${t.kind}`}>{categoryIcon(t.category)}</span>
                    <span className="list-main">
                      <span>{t.description || t.category}</span>
                      {t.description && <span className="muted small">{t.category}</span>}
                    </span>
                    <strong className={t.kind === 'income' ? 'amount-in' : ''}>
                      {t.kind === 'income' ? '+' : '−'}
                      {formatMoney(t.amount, currency)}
                    </strong>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
