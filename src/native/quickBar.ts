import { Capacitor, registerPlugin } from '@capacitor/core'

/** The native side is android/app/src/main/java/com/monthlybudget/app/QuickBarPlugin.java. */
interface QuickBarPlugin {
  /** Whether the bar is on, and whether Android lets the app show notifications. */
  status(): Promise<{ on: boolean; allowed: boolean }>
  setEnabled(opts: { on: boolean }): Promise<{ on: boolean; allowed: boolean }>
}

export const QuickBar = registerPlugin<QuickBarPlugin>('QuickBar')
/** The notification bar only exists in the Android app. */
export const quickBarSupported = Capacitor.getPlatform() === 'android'
