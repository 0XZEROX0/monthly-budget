import { Capacitor, registerPlugin, type PermissionState, type PluginListenerHandle } from '@capacitor/core'
import type { SmsMessage } from '../data/smsParser'

type Alias = 'sms' | 'notifications'
type Permissions = Record<Alias, PermissionState>

/** The native side is android/app/src/main/java/com/monthlybudget/app/SmsReaderPlugin.java. */
interface SmsReaderPlugin {
  checkPermissions(): Promise<Permissions>
  requestPermissions(opts: { permissions: Alias[] }): Promise<Permissions>
  /** Inbox messages received after `since` (ms since epoch), newest first. */
  list(opts: { since: number; limit?: number }): Promise<{ messages: SmsMessage[] }>
  /** Senders whose new messages raise a notification while the app is closed. */
  setWatchedSenders(opts: { senders: string[] }): Promise<void>
  addListener(event: 'smsReceived', cb: (m: Omit<SmsMessage, 'id'>) => void): Promise<PluginListenerHandle>
}

export const SmsReader = registerPlugin<SmsReaderPlugin>('SmsReader')

/** Only the Android app can read SMS; the website can't. */
export const smsAvailable = Capacitor.getPlatform() === 'android'
