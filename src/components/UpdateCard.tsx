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

/** Checking for and installing updates; shared by Settings › App and the prompt at launch. */
function useUpdater() {
  const [status, setStatus] = useState<Status>({ state: 'idle' })

  // Back from Android's "install unknown apps" screen: try the install again.
  useEffect(() => {
    if (status.state !== 'allow') return
    const h = App.addListener('resume', () => AppUpdater.installDownloaded().then((r) => !r.needsPermission && setStatus({ state: 'idle' })))
    return () => {
      h.then((x) => x.remove())
    }
  }, [status.state])

  const check = async (quiet = false) => {
    if (!quiet) setStatus({ state: 'checking' })
    // A quiet check (at launch or on returning to the app) never interrupts an install.
    const set = (next: Status) => setStatus((cur) => (quiet && (cur.state === 'downloading' || cur.state === 'allow') ? cur : next))
    try {
      const update = await checkForUpdate()
      set(update.kind === 'none' ? { state: quiet ? 'idle' : 'latest' } : { state: 'available', update })
    } catch (e) {
      set(quiet ? { state: 'idle' } : { state: 'error', message: `Couldn't check for updates (${(e as Error).message}).` })
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

  return { status, check, install }
}

/** Settings › App: the running build, and updating it without leaving the app. Android only. */
export function UpdateCard() {
  const { status, check, install } = useUpdater()
  if (!Capacitor.isNativePlatform()) return null

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
        <button onClick={() => check()} disabled={status.state === 'checking'}>
          {status.state === 'checking' ? 'Checking…' : 'Check for updates'}
        </button>
      )}
      {status.state === 'latest' && <p className="muted small">You have the latest version.</p>}
      {status.state === 'error' && <p className="error small">{status.message}</p>}
    </section>
  )
}

/**
 * At launch: a popup when a newer build is out. Also starts the background check that
 * notifies about new builds while the app is closed.
 */
export function UpdatePrompt() {
  const { status, check, install } = useUpdater()
  const [dismissed, setDismissed] = useState(false)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    check(true)
    if (BUILD) AppUpdater.watchForUpdates({ build: BUILD }).catch(() => {})
    // Opened again later (say from the update notification): look again.
    const h = App.addListener('resume', () => check(true))
    return () => {
      h.then((x) => x.remove())
    }
  }, [])
  if (dismissed || status.state === 'idle' || status.state === 'checking' || status.state === 'latest') return null
  const close = () => setDismissed(true)
  return (
    <div className="sheet-backdrop dialog-backdrop" onClick={status.state === 'available' || status.state === 'error' ? close : undefined}>
      <div className="dialog" role="alertdialog" aria-labelledby="update-title" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-icon" aria-hidden>
          ⬆
        </div>
        <h2 id="update-title">{status.state === 'error' ? 'Update failed' : 'An update is out'}</h2>
        {status.state === 'available' ? (
          <>
            <p className="muted small">
              Build {status.update.build} is ready ({mb(status.update.size)}); you have build {BUILD}.{' '}
              {status.update.kind === 'web' ? 'It installs in a few seconds.' : 'Android will ask you to confirm the install.'}
            </p>
            <div className="row">
              <button className="grow" onClick={close}>
                Later
              </button>
              <button className="primary grow" onClick={() => install(status.update)}>
                Update now
              </button>
            </div>
          </>
        ) : status.state === 'downloading' ? (
          <>
            <progress max={100} value={status.pct ?? undefined} />
            <p className="muted small">Downloading{status.pct !== null ? ` ${status.pct}%` : '…'}</p>
          </>
        ) : status.state === 'allow' ? (
          <p className="small">Turn on "Allow from this source" for Monthly Budget, then come back here to finish the update.</p>
        ) : (
          <>
            <p className="error small">{status.state === 'error' && status.message}</p>
            <button onClick={close}>Close</button>
          </>
        )}
      </div>
    </div>
  )
}
