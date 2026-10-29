import { useState } from 'react'
import { describe, type BankSms } from '../data/bankSms'
import { dayLabel, formatMoney } from '../data/month'
import type { ParsedSms } from '../data/smsParser'

interface Props {
  sms: BankSms
  onAdd: (p: ParsedSms) => void
  /** Compact: one line that opens the full list (on the Summary). */
  onOpen?: () => void
}

/** Bank messages waiting to be added: each opens the add form filled in, or can be skipped. */
export function PendingSms({ sms, onAdd, onOpen }: Props) {
  const [open, setOpen] = useState<string | null>(null)
  if (!sms.pending.length) return null

  if (onOpen)
    return (
      <button className="card hint sms-hint" onClick={onOpen}>
        <span className="cat-icon plan-icon">✉️</span>
        <span>
          <strong>
            {sms.pending.length} bank {sms.pending.length === 1 ? 'message' : 'messages'} to review
          </strong>
          <span className="muted small">Pick a category to add {sms.pending.length === 1 ? 'it' : 'them'} to your budget</span>
        </span>
      </button>
    )

  return (
    <section className="stack sms-pending">
      <div className="day-head">
        <span>Pending from bank SMS</span>
        <span className="muted">{sms.pending.length}</span>
      </div>
      <ul className="card list">
        {sms.pending.map((p) => (
          <li key={p.smsId}>
            <div className="sms-row">
              <button className="sms-main" onClick={() => setOpen(open === p.smsId ? null : p.smsId)} aria-expanded={open === p.smsId}>
                <span className={`cat-icon ${p.direction === 'credit' ? 'income' : 'expense'}`}>{p.transfer ? '⇄' : p.direction === 'credit' ? '↓' : '💳'}</span>
                <span className="list-main">
                  <span>{describe(p)}</span>
                  <span className="muted small">
                    {dayLabel(p.date)} · {p.sender} ••{p.card}
                  </span>
                </span>
                <strong className={p.direction === 'credit' ? 'amount-in' : ''}>
                  {p.direction === 'credit' ? '+' : '−'}
                  {formatMoney(p.amount, p.currency)}
                </strong>
              </button>
              {open === p.smsId && <p className="sms-body small muted">{p.body}</p>}
              <div className="row sms-actions">
                <button className="ghost small" onClick={() => sms.skip(p)}>
                  Skip
                </button>
                <button className="primary small grow" onClick={() => onAdd(p)}>
                  Review and add
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
