import { useEffect, useState } from 'react'
import { notificationsAllowed } from '../native/notify'
import { QuickBar } from '../native/quickBar'
import { showAlert } from './dialog'

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
      return showAlert('Allow notifications for Monthly Budget in your phone settings, then turn this on again.')
    }
    try {
      setState(await QuickBar.setEnabled({ on }))
    } catch (e) {
      showAlert(`Could not change the quick-add bar: ${(e as Error).message}`)
    }
  }

  return (
    <section className="card">
      <h2>Notification bar</h2>
      <label className="edit-row toggle-row">
        <span className="grow">
          Quick-add bar
          <span className="muted small block">Keeps buttons in your notifications to add an expense, income or transfer, or open your summary.</span>
        </span>
        <input type="checkbox" role="switch" disabled={!state} checked={!!state?.on} onChange={(e) => void toggle(e.target.checked)} />
      </label>
      {state?.on && !state.allowed && <p className="error small">Notifications are off for this app, so the bar can't show. Turn them on in your phone settings.</p>}
    </section>
  )
}
