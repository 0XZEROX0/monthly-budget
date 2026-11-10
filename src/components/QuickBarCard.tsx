import { useEffect, useState } from 'react'
import { notificationsAllowed } from '../native/notify'
import { QuickBar } from '../native/quickBar'
import { showAlert } from './dialog'
import { t } from '../i18n'

/**
 * Settings › Quick add: a bar in the notification shade with Expense, Income, Transfer and
 * Summary buttons. A setting of this phone only, like the app lock.
 */
export function QuickBarCard() {
  const [state, setState] = useState<{ on: boolean; allowed: boolean } | null>(null)
  useEffect(() => {
    QuickBar.status().then(setState).catch(() => setState({ on: false, allowed: false }))
  }, [])

  const toggle = async (on: boolean) => {
    if (on && !(await notificationsAllowed(true))) {
      return showAlert(t('Allow notifications for Monthly Budget in your phone settings, then turn this on again.'))
    }
    try {
      setState(await QuickBar.setEnabled({ on }))
    } catch (e) {
      showAlert(t('Could not change the quick-add bar: {error}', { error: (e as Error).message }))
    }
  }

  return (
    <section className="card">
      <h2>{t('Notification bar')}</h2>
      <label className="edit-row toggle-row">
        <span className="grow">
          {t('Quick-add bar')}
          <span className="muted small block">{t('Buttons in your notifications: 💸 expense, 💰 income, 🔁 transfer, 📊 summary. Comes back if cleared.')}</span>
        </span>
        <input type="checkbox" role="switch" disabled={!state} checked={!!state?.on} onChange={(e) => void toggle(e.target.checked)} />
      </label>
      {state?.on && !state.allowed && <p className="error small">{t("Notifications are off for this app, so the bar can't show. Turn them on in your phone settings.")}</p>}
    </section>
  )
}
