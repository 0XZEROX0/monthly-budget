import { Capacitor } from '@capacitor/core'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { startUpdates } from './data/appUpdate'
import { applyTheme, cachedTheme } from './data/theme'
import { DialogHost } from './components/dialog'

applyTheme(cachedTheme())

startUpdates()
if (!Capacitor.isNativePlatform())
  import('virtual:pwa-register').then(({ registerSW }) =>
    registerSW({
      immediate: true,
      // An open tab otherwise keeps the old version; check for a new one hourly and when the tab comes back.
      onRegisteredSW(_url, reg) {
        if (!reg) return
        setInterval(() => reg.update(), 60 * 60 * 1000)
        document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && reg.update())
      },
    }),
  )

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <DialogHost />
  </StrictMode>,
)
