/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the same build works on any host and inside a Capacitor APK.
  base: './',
  // `npm test`: the maths in tests/. The sync tests in tests-emu/ need a local Firebase emulator (see that file).
  test: { include: ['tests/**/*.test.ts'] },
  build: {
    rolldownOptions: {
      output: {
        // Firebase and React change far less often than the app: in their own files, a returning
        // visitor to the website downloads only the app's part after an update.
        advancedChunks: {
          groups: [
            { name: 'firebase', test: /node_modules[\\/](@firebase|firebase)[\\/]/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
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
