import { Capacitor, registerPlugin } from '@capacitor/core'

/** The native side is android/app/src/main/java/com/monthlybudget/app/AppLockPlugin.java. */
interface AppLockPlugin {
  /** Whether the phone has a fingerprint, face or screen lock (PIN, pattern, password) set up. */
  available(): Promise<{ available: boolean }>
  /** Shows Android's prompt: fingerprint, or the phone's PIN/pattern instead. */
  unlock(opts: { title: string; subtitle?: string }): Promise<{ ok: boolean }>
}

export const AppLock = registerPlugin<AppLockPlugin>('AppLock')
export const lockSupported = Capacitor.getPlatform() === 'android'
