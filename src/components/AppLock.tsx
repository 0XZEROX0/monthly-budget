import { App } from '@capacitor/app'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppLock, lockSupported } from '../native/appLock'
import { showAlert } from './dialog'

// Fingerprint (or the phone's own PIN or pattern) to open the app. A setting of this
// phone only, so it doesn't follow you to the website or another device.
const KEY = 'budget-app:lock'
/** Back within this long and it stays unlocked, so a quick look at another app doesn't ask again. */
const GRACE_MS = 30_000

const read = () => {
  try {
    return lockSupported && localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function useAppLock() {
  const [enabled, setEnabledState] = useState(read)
  const [locked, setLocked] = useState(read)
  const pausedAt = useRef<number | null>(null)

  const unlock = useCallback(async () => {
    try {
      const { ok } = await AppLock.unlock({ title: 'Unlock Monthly Budget', subtitle: 'Use your fingerprint or phone PIN' })
      if (ok) setLocked(false)
    } catch {
      // Cancelled; the lock screen stays with its Unlock button.
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    const pause = App.addListener('pause', () => {
      pausedAt.current = Date.now()
    })
    const resume = App.addListener('resume', () => {
      if (pausedAt.current !== null && Date.now() - pausedAt.current > GRACE_MS) setLocked(true)
      pausedAt.current = null
    })
    return () => {
      pause.then((h) => h.remove())
      resume.then((h) => h.remove())
    }
  }, [enabled])

  // Ask straight away whenever it locks.
  useEffect(() => {
    if (locked) unlock()
  }, [locked, unlock])

  const setEnabled = async (on: boolean) => {
    if (on) {
      const { available } = await AppLock.available()
      if (!available) return showAlert('Set up a fingerprint or a screen lock (PIN, pattern or password) in your phone settings first.')
      const { ok } = await AppLock.unlock({ title: 'Turn on app lock', subtitle: 'Confirm with your fingerprint or phone PIN' }).catch(() => ({ ok: false }))
      if (!ok) return
    }
    try {
      localStorage.setItem(KEY, on ? '1' : '0')
    } catch {
      // Applies until the app closes.
    }
    setEnabledState(on)
  }

  return { enabled, locked: enabled && locked, unlock, setEnabled }
}

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  return (
    <div className="center signin lock-screen">
      <img src="./favicon.svg" alt="" width={72} height={72} />
      <h1>Monthly Budget is locked</h1>
      <p className="muted">Use your fingerprint or your phone's PIN to open it.</p>
      <button className="primary" onClick={onUnlock}>
        Unlock
      </button>
    </div>
  )
}

export function SecurityCard({ enabled, onChange }: { enabled: boolean; onChange: (on: boolean) => void }) {
  if (!lockSupported) return null
  return (
    <section className="card">
      <h2>App lock</h2>
      <label className="edit-row toggle-row">
        <span className="grow">
          Lock with fingerprint or PIN
          <span className="muted small block">Asks when you open the app, and after it's been in the background for 30 seconds.</span>
        </span>
        <input type="checkbox" role="switch" checked={enabled} onChange={(e) => onChange(e.target.checked)} />
      </label>
    </section>
  )
}
