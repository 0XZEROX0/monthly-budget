import { registerPlugin } from '@capacitor/core'
import { isAndroid } from './platform'

/** The native side is android/app/src/main/java/com/monthlybudget/app/WidgetPlugin.java. */
interface WidgetPlugin {
  /** Shows these lines on the home screen widget; the text is formatted here. */
  update(opts: { label: string; value: string; sub: string; pct: number; over: boolean }): Promise<void>
}

const Widget = registerPlugin<WidgetPlugin>('Widget')

let last = ''
export function updateWidget(data: Parameters<WidgetPlugin['update']>[0]) {
  if (!isAndroid) return
  const key = JSON.stringify(data)
  if (key === last) return
  last = key
  Widget.update(data).catch(() => {
    last = ''
  })
}
