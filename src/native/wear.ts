import { registerPlugin } from '@capacitor/core'
import { isAndroid } from './platform'
import type { User } from 'firebase/auth'

/** The native side is android/app/src/main/java/com/monthlybudget/app/WearPlugin.java. */
interface WearPlugin {
  /** Without refreshToken it unlinks the watch. */
  share(opts: { refreshToken?: string; uid?: string; apiKey?: string; projectId?: string; hidden?: boolean }): Promise<void>
  /** Tells the watch the budget changed, so it fetches just the changes. */
  ping(): Promise<void>
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
  if (!isAndroid) return
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
  if (!isAndroid) return
  clearTimeout(pingTimer)
  pingTimer = setTimeout(() => Wear.ping().catch(() => {}), 3_000)
}
