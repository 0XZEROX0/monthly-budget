import { useState } from 'react'
import { billStatus, billTxnId, dueDay, ordinal, paymentFor, reminderDays, type BillStatus } from '../data/bills'
import { categoryIcon } from '../data/icons'
import { formatWhole, parseAmount } from '../data/month'
import type { Backend, Bill, BillType, Settings, Transaction } from '../data/types'
import { notificationsAllowed } from '../native/notify'
import { NumberInput } from './NumberInput'
import { ask, askText, showAlert } from './dialog'
import { Picker } from './Picker'
import { msg, t } from '../i18n'

const fail = (e: Error) => showAlert(t('Could not save: {error}', { error: e.message }))

const STATUS_ORDER: Record<BillStatus, number> = { late: 0, due: 1, upcoming: 2, paid: 3 }

/** Summary: this month's bills, what's due, and paying them in one tap. */
export function BillsCard({ backend, settings, month, txns }: { backend: Backend; settings: Settings; month: string; txns: Transaction[] }) {
  const bills = settings.bills ?? []
  if (!bills.length) return null
  const money = (n: number) => formatWhole(n, settings.currency)
  const rows = bills.map((b) => ({ b, status: billStatus(b, month, txns) })).sort((x, y) => STATUS_ORDER[x.status] - STATUS_ORDER[y.status] || dueDay(x.b, month) - dueDay(y.b, month))
  const unpaid = rows.filter((r) => r.status !== 'paid')
  const owed = unpaid.reduce((a, r) => a + r.b.amount, 0)

  const pay = async (b: Bill) => {
    let amount = b.amount
    if (!amount) {
      const v = parseAmount((await askText(t('How much did you pay for {name}?', { name: b.name }), { placeholder: t('Amount'), inputMode: 'decimal', ok: t('Paid') })) ?? '')
      if (!Number.isFinite(v) || v <= 0) return
      amount = v
    }
    backend.updateTransaction(billTxnId(b, month), paymentFor(b, month, settings, amount)).catch(fail)
  }
  const unpay = async (b: Bill) => {
    const id = billTxnId(b, month)
    if (!txns.some((x) => x.id === id)) return showAlert(t('A payment to {name} this month counts as paid. Delete it under Transactions to undo.', { name: b.debt ?? '' }))
    if (await ask(t('Mark {name} as not paid? Its payment entry is deleted.', { name: b.name }), { ok: t('Not paid'), danger: true })) backend.deleteTransaction(id).catch(fail)
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>{t('Bills this month')}</h2>
        <span className="muted small">{unpaid.length ? `${t('{n} to pay', { n: unpaid.length })}${owed ? ` · ${money(owed)}` : ''}` : t('All paid ✓')}</span>
      </div>
      <ul className="plain-list">
        {rows.map(({ b, status }) => {
          const days = reminderDays(b, month)
          const due = dueDay(b, month)
          const when =
            status === 'paid'
              ? t('Paid')
              : status === 'late'
                ? t('Overdue since the {day}', { day: ordinal(due) })
                : status === 'due'
                  ? b.type === 'card' || days.length === 1
                    ? t('Due today')
                    : t('Due now · reminding until the {day}', { day: ordinal(days[days.length - 1]) })
                  : t('Due on the {day}', { day: ordinal(due) })
          return (
            <li key={b.id} className={`bill bill-${status}`}>
              <span className="cat-icon">{categoryIcon(b.debt ?? b.name)}</span>
              <span className="grow list-main">
                <span>{b.name}</span>
                <span className={`small ${status === 'late' ? 'status-critical' : status === 'due' ? 'status-warning' : 'muted'}`}>{when}</span>
              </span>
              {b.amount > 0 && <strong>{money(b.amount)}</strong>}
              {status === 'paid' ? (
                <button className="chip active" onClick={() => unpay(b)} aria-label={t('{name} is paid; tap to undo', { name: b.name })}>
                  ✓
                </button>
              ) : (
                <button className="chip" onClick={() => pay(b)}>
                  {t('Paid')}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

const TYPES: { id: BillType; label: string; hint: string }[] = [
  { id: 'instalment', label: msg('Instalment'), hint: msg('Pay-later companies like TRU or Valu. Reminds you every day from the due day, for as many days as you choose.') },
  { id: 'card', label: msg('Bank or card'), hint: msg('A credit card or bank payment on one day. Reminds you on that day.') },
]

const blank = (type: BillType, settings: Settings): Bill => ({
  id: crypto.randomUUID().slice(0, 8),
  name: '',
  type,
  amount: 0,
  day: 1,
  windowDays: type === 'instalment' ? 5 : 1,
  account: settings.accounts.find((a) => a.type !== 'investment')?.name,
})

/** Settings: add, change and remove bills. */
export function BillsEditor({ settings, onSave }: { settings: Settings; onSave: (s: Settings) => void }) {
  const bills = settings.bills ?? []
  const [editing, setEditing] = useState<Bill | null>(null)
  const set = (list: Bill[]) => onSave({ ...settings, bills: list })
  const money = (n: number) => formatWhole(n, settings.currency)
  return (
    <section className="card">
      <h2>{t('Bills and reminders')}</h2>
      <p className="muted small">{t("Instalments and card payments you pay every month. The app reminds you with a notification at 10 am until they're marked paid.")}</p>
      {bills.map((b) => (
        <button className="edit-row row-link" key={b.id} onClick={() => setEditing(b)}>
          <span className="cat-icon plan-icon">{categoryIcon(b.debt ?? b.name)}</span>
          <span className="grow list-main">
            <strong>{b.name}</strong>
            <span className="muted small">
              {b.type === 'instalment' ? (b.windowDays > 1 ? t('Day {day}, reminded {n} days', { day: b.day, n: b.windowDays }) : t('Day {day}, reminded 1 day', { day: b.day })) : t('On day {day}', { day: b.day })}
              {b.amount > 0 && ` · ${money(b.amount)}`}
              {b.debt && ' · ' + t('pays {name}', { name: b.debt })}
            </span>
          </span>
          <span className="chevron" aria-hidden>›</span>
        </button>
      ))}
      <div className="row">
        <button onClick={() => setEditing(blank('instalment', settings))}>+ {t('Instalment')}</button>
        <button onClick={() => setEditing(blank('card', settings))}>+ {t('Bank or card')}</button>
      </div>
      {editing && (
        <BillForm
          bill={editing}
          settings={settings}
          onClose={() => setEditing(null)}
          onRemove={bills.some((b) => b.id === editing.id) ? () => set(bills.filter((b) => b.id !== editing.id)) : undefined}
          onSave={(b) => {
            set(bills.some((x) => x.id === b.id) ? bills.map((x) => (x.id === b.id ? b : x)) : [...bills, b])
            // Ask for notifications the first time there's something to remind about.
            notificationsAllowed(true).catch(() => {})
          }}
        />
      )}
    </section>
  )
}

function BillForm({ bill, settings, onSave, onRemove, onClose }: { bill: Bill; settings: Settings; onSave: (b: Bill) => void; onRemove?: () => void; onClose: () => void }) {
  const [b, setB] = useState(bill)
  const up = (p: Partial<Bill>) => setB((x) => ({ ...x, ...p }))
  const isNew = !onRemove
  const setType = (type: BillType) => up({ type, windowDays: type === 'instalment' ? Math.max(b.windowDays, 5) : 1 })
  const setName = (name: string) => {
    // "TRU" finds "Debt TRU", so the payment pays that debt down.
    const match = !b.debt && name.trim().length >= 3 ? settings.debts.find((d) => d.name.toLowerCase().includes(name.trim().toLowerCase())) : undefined
    up({ name, ...(match ? { debt: match.name } : {}) })
  }
  const save = () => {
    if (!b.name.trim()) return void showAlert(t('Give it a name, like TRU or CIB card.'))
    onSave({ ...b, name: b.name.trim(), day: Math.min(31, Math.max(1, Math.round(b.day) || 1)), windowDays: Math.min(28, Math.max(1, Math.round(b.windowDays) || 1)) })
    onClose()
  }
  const hint = t(TYPES.find((x) => x.id === b.type)!.hint)
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" aria-hidden />
        <div className="sheet-head">
          <h2>{isNew ? t('Add a bill') : t('Edit {name}', { name: bill.name })}</h2>
          <button className="icon ghost" aria-label={t('Close')} onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="segmented">
          {TYPES.map((x) => (
            <button key={x.id} className={b.type === x.id ? 'active' : ''} onClick={() => setType(x.id)}>
              {t(x.label)}
            </button>
          ))}
        </div>
        <p className="muted small">{hint}</p>
        <label className="field">
          <span className="field-label">{b.type === 'instalment' ? t('Company') : t('Bank or card')}</span>
          <input value={b.name} autoFocus={isNew} onChange={(e) => setName(e.target.value)} placeholder={b.type === 'instalment' ? t('TRU, Valu…') : t('CIB credit card')} list="bill-names" />
          <datalist id="bill-names">
            {settings.debts.map((d) => (
              <option key={d.name} value={d.name.replace(/^debt\s*/i, '') || d.name} />
            ))}
          </datalist>
        </label>
        <label className="edit-row">
          <span className="grow">{t('Amount each month')}</span>
          <span className="mini">
            <NumberInput value={b.amount} onChange={(n) => up({ amount: n })} />
          </span>
        </label>
        <p className="muted small">{t("Leave it at 0 if it changes; you'll type it when you mark it paid.")}</p>
        <label className="edit-row">
          <span className="grow">{b.type === 'instalment' ? t('Due on day') : t('Pay on day')}</span>
          <span className="mini">
            <NumberInput value={b.day} onChange={(n) => up({ day: n })} />
          </span>
        </label>
        {b.type === 'instalment' && (
          <label className="edit-row">
            <span className="grow">{t('Remind me for')}</span>
            <span className="mini">
              <NumberInput value={b.windowDays} onChange={(n) => up({ windowDays: n })} />
              <span>{t('days')}</span>
            </span>
          </label>
        )}
        <div className="edit-row">
          <span className="grow">{t('Pays down debt')}</span>
          <Picker
            label={t('Pays down debt')}
            value={b.debt ?? ''}
            options={[{ value: '', label: t('None') }, ...settings.debts.map((d) => ({ value: d.name, label: d.name, icon: categoryIcon(d.name) }))]}
            onChange={(v) => up({ debt: v || undefined })}
          />
        </div>
        {!b.debt && (
          <div className="edit-row">
            <span className="grow">{t('Category')}</span>
            <Picker
              label={t('Category')}
              value={b.category ?? 'Other'}
              options={[...new Set([...settings.categories.expense, b.category ?? 'Other'])].map((c) => ({ value: c, label: c, icon: categoryIcon(c) }))}
              onChange={(v) => up({ category: v })}
            />
          </div>
        )}
        <div className="edit-row">
          <span className="grow">{t('Paid from')}</span>
          <Picker
            label={t('Paid from')}
            value={b.account ?? ''}
            options={settings.accounts.map((a) => ({ value: a.name, label: a.name, icon: categoryIcon(a.name) }))}
            onChange={(v) => up({ account: v || undefined })}
          />
        </div>
        <div className="row">
          {onRemove && (
            <button className="danger" onClick={() => ask(t('Remove {name}? Its reminders stop.', { name: bill.name }), { ok: t('Remove'), danger: true }).then((ok) => ok && (onRemove(), onClose()))}>
              {t('Remove')}
            </button>
          )}
          <button className="primary grow" onClick={save}>
            {isNew ? t('Add bill') : t('Save')}
          </button>
        </div>
      </div>
    </div>
  )
}
