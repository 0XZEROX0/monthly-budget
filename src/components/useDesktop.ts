import { Capacitor } from '@capacitor/core'
import { useEffect, useState } from 'react'

/** Width from which the website switches to the desktop dashboard. */
const QUERY = '(min-width: 1024px)'

/**
 * True on the website when the window is wide enough for the desktop dashboard
 * (sidebar and multi-column pages). Always false inside the Android app, and on
 * phones and narrow windows, which keep the phone layout. Pass a wider query to
 * check for a bigger desktop window.
 */
export function useDesktop(query = QUERY) {
  const native = Capacitor.isNativePlatform()
  const [wide, setWide] = useState(() => !native && typeof matchMedia === 'function' && matchMedia(query).matches)
  useEffect(() => {
    if (native || typeof matchMedia !== 'function') return
    const mq = matchMedia(query)
    const on = () => setWide(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [native, query])
  return wide
}
