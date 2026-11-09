import { Capacitor, registerPlugin } from '@capacitor/core'

/** The native side is android/app/src/main/java/com/monthlybudget/app/WidgetPlugin.java. */
interface WidgetPlugin {
  /**
   * Shows these lines on the "Left to spend" widget; the text is formatted here.
   * `data` is a WidgetData as JSON, for the plan, categories, latest expenses and accounts widgets.
   */
  update(opts: { label: string; value: string; sub: string; pct: number; over: boolean; data?: string }): Promise<void>
}

const Widget = registerPlugin<WidgetPlugin>('Widget')

let last = ''
export function updateWidget(data: Parameters<WidgetPlugin['update']>[0]) {
  if (!Capacitor.isNativePlatform()) return
  const key = JSON.stringify(data)
  if (key === last) return
  last = key
  Widget.update(data).catch(() => {
    last = ''
  })
}
