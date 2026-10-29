import { Capacitor, registerPlugin } from '@capacitor/core'
import type { User } from 'firebase/auth'

/** The native side is android/app/src/main/java/com/monthlybudget/app/WearPlugin.java. */
interface WearPlugin {
  /** Without refreshToken it unlinks the watch. */
  share(opts: { refreshToken?: string; uid?: string; apiKey?: string; projectId?: string; hidden?: boolean }): Promise<void>
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
