import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'

/** The native side is android/app/src/main/java/com/monthlybudget/app/AppUpdaterPlugin.java. */
interface AppUpdaterPlugin {
  /** Downloads the APK and opens Android's installer. needsPermission: Android's "install unknown apps" screen opened instead. */
  downloadAndInstall(opts: { url: string }): Promise<{ needsPermission: boolean }>
  /** Opens the installer for the APK already downloaded. */
  installDownloaded(): Promise<{ needsPermission: boolean }>
  /** Checks GitHub for a newer build twice a day in the background and notifies when there is one. */
  watchForUpdates(opts: { build: number }): Promise<void>
  addListener(event: 'downloadProgress', cb: (p: { downloaded: number; total: number }) => void): Promise<PluginListenerHandle>
}

export const AppUpdater = registerPlugin<AppUpdaterPlugin>('AppUpdater')
