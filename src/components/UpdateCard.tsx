import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import { useEffect, useState } from 'react'
import { applyWebUpdate, BUILD, checkForUpdate, type Available } from '../data/appUpdate'
import { AppUpdater } from '../native/appUpdater'

type Status =
  | { state: 'idle' | 'checking' | 'latest' }
  | { state: 'available'; update: Available }
  | { state: 'downloading'; pct: number | null }
  | { state: 'allow' }
  | { state: 'error'; message: string }

const mb = (bytes: number) => `${(bytes / 1_048_576).toFixed(1)} MB`

/** Settings › App: the running build, and updating it without leaving the app. Android only. */
export function UpdateCard() {
  const [status, setStatus] = useState<Status>({ state: 'idle' })

  // Back from Android's "install unknown apps" screen: try the install again.
  useEffect(() => {
    if (status.state !== 'allow') return
    const h = App.addListener('resume', () => AppUpdater.installDownloaded().then((r) => !r.needsPermission && setStatus({ state: 'idle' })))
    return () => {
      h.then((x) => x.remove())
    }
  }, [status.state])

  if (!Capacitor.isNativePlatform()) return null

  const check = async () => {
    setStatus({ state: 'checking' })
    try {
      const update = await checkForUpdate()
      setStatus(update.kind === 'none' ? { state: 'latest' } : { state: 'available', update })
    } catch (e) {
      setStatus({ state: 'error', message: `Couldn't check for updates (${(e as Error).message}).` })
    }
  }

  const install = async (update: Available) => {
    setStatus({ state: 'downloading', pct: null })
    try {
      if (update.kind === 'web') {
        const h = await CapacitorUpdater.addListener('download', (e) => setStatus({ state: 'downloading', pct: e.percent }))
        // Reloads the app into the new version; nothing after this runs.
        await applyWebUpdate(update, true).finally(() => h.remove())
      } else {
        const h = await AppUpdater.addListener('downloadProgress', (p) =>
          setStatus({ state: 'downloading', pct: p.total > 0 ? Math.round((p.downloaded * 100) / p.total) : null }),
        )
        const r = await AppUpdater.downloadAndInstall({ url: update.url }).finally(() => h.remove())
        setStatus(r.needsPermission ? { state: 'allow' } : { state: 'idle' })
      }
    } catch (e) {
      setStatus({ state: 'error', message: `Update failed: ${(e as Error).message}` })
    }
  }

  return (
    <section className="card">
      <h2>App</h2>
      <p className="muted small">Monthly Budget for Android, build {BUILD || 'dev'}</p>
      {status.state === 'available' ? (
        <>
          <p className="small">
            Build {status.update.build} is ready ({mb(status.update.size)}).{' '}
            {status.update.kind === 'web' ? 'It installs in a moment, right here.' : 'This one changes the Android side, so Android will ask you to confirm the install.'}
          </p>
          <button className="primary" onClick={() => install(status.update)}>
            Update now
          </button>
        </>
      ) : status.state === 'downloading' ? (
        <>
          <progress max={100} value={status.pct ?? undefined} />
          <p className="muted small">Downloading{status.pct !== null ? ` ${status.pct}%` : '…'}</p>
        </>
      ) : status.state === 'allow' ? (
        <p className="small">Turn on "Allow from this source" for Monthly Budget, then come back here to finish the update.</p>
      ) : (
        <button onClick={check} disabled={status.state === 'checking'}>
          {status.state === 'checking' ? 'Checking…' : 'Check for updates'}
        </button>
      )}
      {status.state === 'latest' && <p className="muted small">You have the latest version.</p>}
      {status.state === 'error' && <p className="error small">{status.message}</p>}
    </section>
  )
}
