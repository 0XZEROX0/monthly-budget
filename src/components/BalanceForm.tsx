import { useState, type FormEvent } from 'react'
import { formatWhole, parseAmount, today } from '../data/month'
import type { Account, Backend, Settings } from '../data/types'
import { showAlert } from './dialog'
import { t } from '../i18n'

interface Props {
  backend: Backend
  account: Account
  month: string
  current: number
  settings: Settings
  onClose: () => void
}

/** Sets an account to its real value (e.g. Thndr's portfolio value); records the difference. */
export function BalanceForm({ backend, account, month, current, settings, onClose }: Props) {
  const { currency } = settings
  const [value, setValue] = useState(String(Math.round(current * 100) / 100))
  const [rate, setRate] = useState(String(account.interestPct ?? ''))
  const target = parseAmount(value)
  const diff = Number.isFinite(target) ? target - current : 0

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!Number.isFinite(target)) return
    if (Math.abs(diff) >= 0.005) {
      const date = today().startsWith(month) ? today() : `${month}-01`
      backend
        .addTransaction({ kind: 'adjust', account: account.name, amount: diff, date, month, description: t('Value change'), category: '' })
        .catch((err: Error) => showAlert(t('Could not save: {error}', { error: err.message })))
    }
    const pct = parseAmount(rate)
    if (account.type === 'investment' && rate.trim() && Number.isFinite(pct) && pct !== account.interestPct)
      backend
        .saveSettings({ ...settings, accounts: settings.accounts.map((a) => (a.name === account.name ? { ...a, interestPct: pct } : a)) })
        .catch((err: Error) => showAlert(t('Could not save: {error}', { error: err.message })))
    onClose()
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="sheet-grab" aria-hidden />
        <div className="sheet-head">
          <h2>{t('Update {name}', { name: account.name })}</h2>
          <button type="button" className="icon ghost" aria-label={t('Close')} onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="muted small">{t("Enter what {name} is worth now. The difference is saved as a value change, so it doesn't count as income or spending.", { name: account.name })}</p>
        <label className="amount">
          <span className="sr-only">{t('Current value in {currency}', { currency })}</span>
          <span className="amount-currency">{currency}</span>
          <input inputMode="decimal" autoFocus value={value} style={{ width: `${Math.max(1, value.length) + 0.6}ch` }} onChange={(e) => setValue(e.target.value)} />
        </label>
        <p className="center small" style={{ padding: 0 }}>
          {Math.abs(diff) < 0.005 ? t('No change') : (diff > 0 ? t('Up {amount} from {from}', { amount: formatWhole(Math.abs(diff), currency), from: formatWhole(current, currency) }) : t('Down {amount} from {from}', { amount: formatWhole(Math.abs(diff), currency), from: formatWhole(current, currency) }))}
        </p>
        {account.type === 'investment' && (
          <label className="field">
            <span className="field-label">{t('Interest rate %')}</span>
            <input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder={t('e.g. 5.2')} />
          </label>
        )}
        <button className="primary">{t('Save')}</button>
      </form>
    </div>
  )
}
