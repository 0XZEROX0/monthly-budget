import { defaultTarget, smsSettings, splitTarget, targetFor, type BankSms } from '../data/bankSms'
import type { Settings, SmsSettings, SmsTarget } from '../data/types'

const RELEASE_URL = 'https://github.com/0XZEROX0/monthly-budget/releases/latest/download/monthly-budget.apk'

interface Props {
  sms: BankSms
  settings: Settings
  onSave: (s: Settings) => void
}

/** Settings › Bank SMS: permission, which senders are banks, and where each card's payments go. */
export function SmsSettingsCard({ sms, settings, onSave }: Props) {
  if (!sms.available)
    return (
      <section className="card">
        <h2>Bank SMS</h2>
        <p className="muted small">
          The Android app can read your bank's card messages and list each payment for you to add. <a href={RELEASE_URL}>Download the Android app</a>.
        </p>
      </section>
    )

  const cfg = smsSettings(settings)
  const set = (patch: Partial<SmsSettings>) => onSave({ ...settings, sms: { ...cfg, ...patch } })
  const senders = [...new Set([...cfg.senders, ...sms.detectedSenders])].sort()
  // Until some are picked, every detected sender counts.
  const isOn = (s: string) => (cfg.senders.length ? cfg.senders.includes(s) : true)
  const toggle = (s: string) => {
    const current = cfg.senders.length ? cfg.senders : sms.detectedSenders
    set({ senders: current.includes(s) ? current.filter((x) => x !== s) : [...current, s] })
  }
  const cards = Object.keys(cfg.cards)
  const pendingCards = [...new Set(sms.pending.map((p) => p.card))].filter((c) => !cards.includes(c))

  return (
    <section className="card">
      <h2>Bank SMS</h2>
      <p className="muted small">
        Card payments and transfers from your bank's messages wait under Transactions › Pending until you pick a category. Nothing is added on its own.
      </p>
      {sms.permission !== 'granted' ? (
        <button className="primary" onClick={sms.requestPermission}>
          Allow access to SMS
        </button>
      ) : (
        <>
          <label className="edit-row">
            <span className="grow">Read messages from</span>
            <input type="date" value={cfg.since} onChange={(e) => e.target.value && set({ since: e.target.value })} style={{ width: 'auto' }} />
          </label>
          <div className="field">
            <span className="field-label">Bank senders</span>
            {senders.length ? (
              <div className="row wrap">
                {senders.map((s) => (
                  <button key={s} className={`chip ${isOn(s) ? 'active' : ''}`} onClick={() => toggle(s)} aria-pressed={isOn(s)}>
                    {s}
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted small">No card messages since that day yet. Pick an earlier day to look further back.</p>
            )}
          </div>
          <TargetRow label="Cards not listed below" value={defaultTarget(settings)} settings={settings} onChange={(t) => set({ defaultTarget: t })} />
          {[...cards, ...pendingCards].map((c) => (
            <TargetRow key={c} label={`Card or account ••${c}`} value={targetFor(c, settings)} settings={settings} onChange={(t) => set({ cards: { ...cfg.cards, [c]: t } })} />
          ))}
          <button className="link" onClick={sms.refresh}>
            Check messages again
          </button>
        </>
      )}
      {sms.error && <p className="error small">{sms.error}</p>}
    </section>
  )
}

function TargetRow({ label, value, settings, onChange }: { label: string; value: SmsTarget; settings: Settings; onChange: (t: SmsTarget) => void }) {
  const known = splitTarget(value)
  return (
    <label className="edit-row">
      <span className="grow">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as SmsTarget)} style={{ width: 'auto' }}>
        {settings.accounts.map((a) => (
          <option key={a.name} value={`account:${a.name}`}>
            {a.name}
          </option>
        ))}
        {settings.debts.map((d) => (
          <option key={d.name} value={`debt:${d.name}`}>
            {d.name} (credit)
          </option>
        ))}
        {!settings.accounts.some((a) => a.name === known.name) && !settings.debts.some((d) => d.name === known.name) && <option value={value}>{known.name}</option>}
      </select>
    </label>
  )
}
