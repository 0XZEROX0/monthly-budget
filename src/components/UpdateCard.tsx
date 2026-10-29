import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'
import { useEffect, useState } from 'react'

// Every push to main publishes "Monthly Budget for Android (build N)" here; N is the APK's versionCode.
const RELEASE_API = 'https://api.github.com/repos/0XZEROX0/monthly-budget/releases/tags/android'
const APK_URL = 'https://github.com/0XZEROX0/monthly-budget/releases/latest/download/monthly-budget.apk'

type Status = { state: 'idle' | 'checking' | 'latest' | 'error' } | { state: 'available'; build: number }

/** Settings › App: the installed build and a check for a newer APK. Android app only. */
export function UpdateCard() {
  const [build, setBuild] = useState<number | null>(null)
  const [status, setStatus] = useState<Status>({ state: 'idle' })

  useEffect(() => {
    if (Capacitor.isNativePlatform()) App.getInfo().then((i) => setBuild(Number(i.build)))
  }, [])

  if (!Capacitor.isNativePlatform()) return null

  const check = async () => {
    setStatus({ state: 'checking' })
    try {
      const res = await fetch(RELEASE_API, { headers: { Accept: 'application/vnd.github+json' } })
      if (!res.ok) throw new Error(String(res.status))
      const latest = Number(/build (\d+)/.exec(((await res.json()) as { name: string }).name)?.[1])
      setStatus(latest > (build ?? 0) ? { state: 'available', build: latest } : { state: 'latest' })
    } catch {
      setStatus({ state: 'error' })
    }
  }

  return (
    <section className="card">
      <h2>App</h2>
      <p className="muted small">Monthly Budget for Android, build {build ?? '…'}</p>
      {status.state === 'available' ? (
        <>
          <p className="small">Build {status.build} is ready. Download it, then open the file to install it over this one; your data stays.</p>
          <button className="primary" onClick={() => Browser.open({ url: APK_URL })}>
            Download update
          </button>
        </>
      ) : (
        <button onClick={check} disabled={status.state === 'checking'}>
          {status.state === 'checking' ? 'Checking…' : 'Check for updates'}
        </button>
      )}
      {status.state === 'latest' && <p className="muted small">You have the latest version.</p>}
      {status.state === 'error' && <p className="error small">Couldn't check for updates. Are you online?</p>}
    </section>
  )
}
