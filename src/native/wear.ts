import { Capacitor, registerPlugin } from '@capacitor/core'
import type { User } from 'firebase/auth'

/** The native side is android/app/src/main/java/com/monthlybudget/app/WearPlugin.java. */
interface WearPlugin {
  /** Without refreshToken it unlinks the watch. */
  share(opts: { refreshToken?: string; uid?: string; apiKey?: string; projectId?: string; hidden?: boolean }): Promise<void>
  /** Tells the watch the budget changed, so it fetches just the changes. */
  ping(): Promise<void>
  /** Bank SMS waiting to be added, as a JSON array of WatchSms. */
  shareSms(opts: { items: string }): Promise<void>
  /** SMS ids skipped on the watch. */
  smsSkipped(): Promise<{ ids: string[] }>
}

/** A bank SMS for the watch, filled in like the add form would be (wear/.../Sms.kt reads it). */
export interface WatchSms {
  smsId: string
  title: string
  sub: string
  body: string
  kind: string
  amount: number
  account: string
  debt: string
  category: string
  description: string
  date: string
}

const Wear = registerPlugin<WearPlugin>('Wear')

let state: { user: User | null; hidden: boolean } = { user: null, hidden: false }

/**
 * Keeps the Galaxy Watch app signed in to the same account and following privacy mode.
 * The watch gets the Firebase refresh token over the Wear OS Data Layer, which only
 * delivers to the watch app with this package and signing key.
 */
export function shareWithWatch(change: Partial<typeof state>) {
  state = { ...state, ...change }
  if (!Capacitor.isNativePlatform()) return
  const { user, hidden } = state
  Wear.share(
    user
      ? {
          refreshToken: user.refreshToken,
          uid: user.uid,
          apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
          projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
          hidden,
        }
      : {},
  ).catch(() => {})
}

let pingTimer: ReturnType<typeof setTimeout> | undefined

/**
 * After an edit on the phone, nudges the watch to sync now instead of waiting for its hourly
 * check. Several edits in a row send one nudge.
 */
export function notifyWatch() {
  if (!Capacitor.isNativePlatform()) return
  clearTimeout(pingTimer)
  pingTimer = setTimeout(() => Wear.ping().catch(() => {}), 3_000)
}

let lastSms = ''

/** Sends the bank SMS waiting to be added to the watch, so they can be added or skipped there. */
export function shareSmsWithWatch(items: WatchSms[]) {
  if (!Capacitor.isNativePlatform()) return
  const json = JSON.stringify(items)
  if (json === lastSms) return
  lastSms = json
  Wear.shareSms({ items: json }).catch(() => {})
}

/** SMS ids skipped on the watch, to skip on the phone too. */
export async function smsSkippedOnWatch(): Promise<string[]> {
  if (!Capacitor.isNativePlatform()) return []
  try {
    return (await Wear.smsSkipped()).ids
  } catch {
    return []
  }
}
