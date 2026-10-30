import { Capacitor } from '@capacitor/core'
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications'
import { isPaid, reminderDays, reminderText } from '../data/bills'
import { currentMonth, shiftMonth } from '../data/month'
import type { Settings, Transaction } from '../data/types'

// Phone notifications for bill reminders and budget alerts, through Android's alarm
// manager, so bill reminders arrive on time while the app is closed.

const native = Capacitor.isNativePlatform()
const REMIND_HOUR = 10
const BILL_IDS = 100_000
const ALERT_IDS = 200_000
const SMALL_ICON = 'ic_stat_budget'

let channels: Promise<void> | null = null
const setup = () =>
  (channels ??= Promise.all([
    LocalNotifications.createChannel({ id: 'bills', name: 'Bill reminders', importance: 4 }),
    LocalNotifications.createChannel({ id: 'alerts', name: 'Budget alerts', importance: 3 }),
  ]).then(() => {}))

/** Asks once (Android 13+); true when notifications may be shown. */
export async function notificationsAllowed(ask: boolean): Promise<boolean> {
  if (!native) return false
  let { display } = await LocalNotifications.checkPermissions()
  if (display === 'prompt' || display === 'prompt-with-rationale') {
    if (!ask) return false
    display = (await LocalNotifications.requestPermissions()).display
  }
  return display === 'granted'
}

let lastPlan = ''
let queue = Promise.resolve()

/**
 * Schedules reminders for this month and the next two, replacing earlier ones. This
 * month's are left out once the bill is paid; later months are rescheduled each time
 * the app opens.
 */
export function scheduleBillReminders(settings: Settings, thisMonth: Transaction[]) {
  if (!native) return
  const bills = settings.bills ?? []
  const now = new Date()
  const plan: LocalNotificationSchema[] = []
  for (let i = 0; i < 3; i++) {
    const month = shiftMonth(currentMonth(), i)
    const [y, m] = month.split('-').map(Number)
    for (const b of bills) {
      if (i === 0 && isPaid(b, month, thisMonth)) continue
      for (const day of reminderDays(b, month)) {
        const at = new Date(y, m - 1, day, REMIND_HOUR, 0)
        if (at <= now) continue
        const { title, body } = reminderText(b, month, day, settings.currency)
        plan.push({ id: BILL_IDS + plan.length, title, body, channelId: 'bills', smallIcon: SMALL_ICON, schedule: { at, allowWhileIdle: true }, extra: { kind: 'bill', bill: b.id } })
      }
    }
  }
  const key = JSON.stringify(plan.map((p) => [p.title, p.body, p.schedule?.at?.getTime()]))
  if (key === lastPlan) return
  lastPlan = key
  queue = queue
    .then(async () => {
      if (!(await notificationsAllowed(plan.length > 0))) return
      await setup()
      const { notifications } = await LocalNotifications.getPending()
      const old = notifications.filter((n) => n.id >= BILL_IDS && n.id < ALERT_IDS)
      if (old.length) await LocalNotifications.cancel({ notifications: old.map((n) => ({ id: n.id })) })
      if (plan.length) await LocalNotifications.schedule({ notifications: plan })
    })
    .catch(() => {
      lastPlan = ''
    })
}

let alertId = ALERT_IDS
/** Shows a notification now. */
export async function notifyNow(title: string, body: string) {
  if (!(await notificationsAllowed(false))) return
  await setup()
  await LocalNotifications.schedule({ notifications: [{ id: alertId++, title, body, channelId: 'alerts', smallIcon: SMALL_ICON }] })
}
