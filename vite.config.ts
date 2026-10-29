import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the same build works on any host and inside a Capacitor APK.
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registered from main.tsx, and only on the website: the Android app ships its files inside the APK.
      injectRegister: false,
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Monthly Budget',
        short_name: 'Budget',
        description: 'Plan your monthly budget and track income and expenses.',
        theme_color: '#1f6f5c',
        background_color: '#f6f7f5',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
