import { Capacitor } from '@capacitor/core'
import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, indexedDBLocalPersistence, initializeAuth } from 'firebase/auth'
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const firebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId)

const app: FirebaseApp | null = firebaseConfigured ? initializeApp(config) : null

// The Android app signs in with a token from the browser (see App.tsx), so it needs no
// popup or redirect support; getAuth's defaults for those don't work inside its WebView.
export const auth = app ? (Capacitor.isNativePlatform() ? initializeAuth(app, { persistence: indexedDBLocalPersistence }) : getAuth(app)) : null

/** The website, where the Android app sends Google sign-in. */
export const WEB_URL = import.meta.env.VITE_WEB_URL || 'https://0xzerox0.github.io/monthly-budget/'

// Offline cache: the app keeps working without a connection and syncs when back online.
export const firestore = app
  ? initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })
  : null
