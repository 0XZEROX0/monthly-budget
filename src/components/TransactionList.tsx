import { useState } from 'react'
import { formatMoney } from '../data/month'
import type { Kind, Transaction } from '../data/types'

interface Props {
  txns: Transaction[]
  currency: string
  onEdit: (t: Transaction) => void
}

export function TransactionList({ txns, currency, onEdit }: Props) {
  const [kind, setKind] = useState<Kind>('expense')
  const shown = txns.filter((t) => t.kind === kind)
  return (
    <div className="stack">
      <div className="segmented">
        <button className={kind === 'expense' ? 'active' : ''} onClick={() => setKind('expense')}>
          Expenses
        </button>
        <button className={kind === 'income' ? 'active' : ''} onClick={() => setKind('income')}>
          Income
        </button>
      </div>
      {shown.length === 0 ? (
        <p className="center muted">No {kind === 'expense' ? 'expenses' : 'income'} this month. Tap + to add one.</p>
      ) : (
        <ul className="card list">
          {shown.map((t) => (
            <li key={t.id}>
              <button onClick={() => onEdit(t)}>
                <span className="list-main">
                  <span>{t.description || t.category}</span>
                  <span className="muted small">
                    {new Date(t.date + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · {t.category}
                  </span>
                </span>
                <strong className={kind === 'income' ? 'good' : ''}>{formatMoney(t.amount, currency)}</strong>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
