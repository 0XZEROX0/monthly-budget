import { Capacitor } from '@capacitor/core'

/** The Android app (APK). SMS import, the widget, the watch, app lock and in-app updates live here. */
export const isAndroid = Capacitor.getPlatform() === 'android'
/** The iPhone app (TestFlight). Apple handles its updates; it has none of the Android-only features. */
export const isIOS = Capacitor.getPlatform() === 'ios'
