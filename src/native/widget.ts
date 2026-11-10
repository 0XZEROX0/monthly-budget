import { Capacitor, registerPlugin } from '@capacitor/core'
import { currentLang } from '../i18n'

/** The native side is android/app/src/main/java/com/monthlybudget/app/WidgetPlugin.java. */
interface WidgetPlugin {
  /**
   * Shows these lines on the "Left to spend" widget; the text is formatted here.
   * `data` is a WidgetData as JSON, for the plan, categories, latest expenses and accounts widgets.
   */
  update(opts: { label: string; value: string; sub: string; pct: number; over: boolean; data?: string; month?: string; lang?: string }): Promise<void>
}

const Widget = registerPlugin<WidgetPlugin>('Widget')

let last = ''
export function updateWidget(data: Parameters<WidgetPlugin['update']>[0]) {
  if (!Capacitor.isNativePlatform()) return
  // The widgets and notification bar word their own few lines in the app's language.
  data = { ...data, lang: currentLang() }
  const key = JSON.stringify(data)
  if (key === last) return
  last = key
  Widget.update(data).catch(() => {
    last = ''
  })
}
