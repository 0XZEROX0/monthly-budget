import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.monthlybudget.app',
  appName: 'Monthly Budget',
  webDir: 'dist',
  plugins: {
    // Updates are checked and applied by src/data/appUpdate.ts from our GitHub releases,
    // not by Capgo's cloud, and nothing is reported to it.
    CapacitorUpdater: { autoUpdate: false, statsUrl: '', updateUrl: '', channelUrl: '' },
  },
}

export default config
