import { CapacitorUpdater, type BundleInfo } from '@capgo/capacitor-updater'
import { Capacitor } from '@capacitor/core'

// Each push to main publishes one GitHub release with the APK, the web files as web.zip,
// and notes naming the build number and a hash of the Android code. When only the web
// files changed, the app swaps them in (about 1 MB); when the Android code changed it
// needs the whole APK. See .github/workflows/android.yml.
const RELEASE_API = 'https://api.github.com/repos/0XZEROX0/monthly-budget/releases/tags/android'

/** Set by CI; 0 and "dev" in local builds, which never offer updates. */
export const BUILD = Number(import.meta.env.VITE_BUILD || 0)
const NATIVE = import.meta.env.VITE_NATIVE_HASH || 'dev'

export interface Available {
  kind: 'web' | 'app'
  build: number
  url: string
  size: number
  /** SHA-256 of the file, hex; the updater refuses a download without it. */
  checksum: string
}
export type Update = { kind: 'none' } | Available

export async function checkForUpdate(): Promise<Update> {
  const res = await fetch(RELEASE_API, { headers: { Accept: 'application/vnd.github+json' } })
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
  const rel = (await res.json()) as {
    name: string
    body: string
    assets: { name: string; browser_download_url: string; size: number; digest?: string }[]
  }
  const build = Number(/build (\d+)/.exec(rel.name)?.[1] ?? 0)
  const native = /native: (\w+)/.exec(rel.body)?.[1]
  if (!BUILD || build <= BUILD) return { kind: 'none' }
  const asset = (name: string) => {
    const a = rel.assets.find((x) => x.name === name)
    // GitHub gives each asset's digest as "sha256:<hex>".
    return a && { url: a.browser_download_url, size: a.size, checksum: a.digest?.replace(/^sha256:/, '') ?? '' }
  }
  const web = asset('web.zip')
  // Same Android code: the new web files run on this APK.
  if (web?.checksum && native === NATIVE) return { kind: 'web', build, ...web }
  const apk = asset('monthly-budget.apk')
  return apk ? { kind: 'app', build, ...apk } : { kind: 'none' }
}

// The quiet download at launch and a tap on Update now can ask for the same build; they
// share one download, since two at once (or a second one later) fail.
let downloading: { build: number; bundle: Promise<BundleInfo> } | null = null

async function bundleFor(u: Available): Promise<BundleInfo> {
  if (downloading?.build === u.build) return downloading.bundle
  const bundle = (async () => {
    const { bundles } = await CapacitorUpdater.list()
    const have = bundles.find((b) => b.version === String(u.build) && (b.status === 'success' || b.status === 'pending'))
    return have ?? CapacitorUpdater.download({ url: u.url, version: String(u.build), checksum: u.checksum })
  })()
  downloading = { build: u.build, bundle }
  // A failed download can be tried again.
  bundle.catch(() => {
    if (downloading?.bundle === bundle) downloading = null
  })
  return bundle
}

/** Downloads new web files; `now` reloads into them, otherwise they load the next time the app opens. */
export async function applyWebUpdate(u: Available, now: boolean) {
  const bundle = await bundleFor(u)
  if (now) await CapacitorUpdater.set({ id: bundle.id })
  else await CapacitorUpdater.next({ id: bundle.id })
}

/**
 * At launch: confirm this version started fine (otherwise the updater rolls back to the
 * last good one), then fetch any web update quietly for next time.
 */
export function startUpdates() {
  if (!Capacitor.isNativePlatform()) return
  CapacitorUpdater.notifyAppReady().catch(() => {})
  checkForUpdate()
    .then((u) => (u.kind === 'web' ? applyWebUpdate(u, false) : undefined))
    .catch(() => {})
}
