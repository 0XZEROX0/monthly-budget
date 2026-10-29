import { App as CapApp } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'
import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
  type UserCredential,
} from 'firebase/auth'
import { useEffect, useMemo, useState } from 'react'
import { MonthView } from './components/MonthView'
import { auth, firebaseConfigured, firestore, WEB_URL } from './data/firebase'
import { createFirestoreBackend } from './data/firestoreBackend'
import { createLocalBackend } from './data/localBackend'
import { GoogleSignIn } from './native/googleSignIn'

// Google doesn't allow its sign-in page inside an app's WebView. The Android app shows
// Google's own account picker instead (GoogleSignInPlugin). If that isn't set up, it opens
// the website in the browser at ?app-signin, signs in there, and the website hands the
// Google ID token back through monthlybudget://signin, which the app signs in with.
const native = Capacitor.isNativePlatform()
const APP_PACKAGE = 'com.monthlybudget.app'
const isBridge = !native && new URLSearchParams(location.search).has('app-signin')

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(firebaseConfigured ? undefined : null)
  const [authError, setAuthError] = useState('')

  useEffect(() => (auth ? onAuthStateChanged(auth, setUser) : undefined), [])

  useEffect(() => {
    if (!native || !auth) return
    const handle = CapApp.addListener('appUrlOpen', ({ url }) => {
      const u = new URL(url)
      const token = u.host === 'signin' ? u.searchParams.get('id_token') : null
      if (!token) return
      Browser.close().catch(() => {})
      signInWithCredential(auth!, GoogleAuthProvider.credential(token)).catch((e: Error) => setAuthError(e.message))
    })
    return () => {
      handle.then((h) => h.remove())
    }
  }, [])

  const backend = useMemo(() => {
    if (!firebaseConfigured) return createLocalBackend()
    return user && firestore ? createFirestoreBackend(firestore, user.uid) : null
  }, [user])

  if (isBridge) return <AppSignInBridge />
  if (firebaseConfigured && user === undefined) return <div className="center muted">Loading…</div>
  if (!backend) return <SignIn error={authError} />
  return <MonthView backend={backend} user={user} onSignOut={auth ? () => signOut(auth!) : undefined} />
}

function SignIn({ error: outerError }: { error: string }) {
  const [error, setError] = useState('')
  const signIn = async () => {
    if (!auth) return
    if (native) {
      const clientId = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID
      try {
        if (!clientId) throw new Error('no web client id')
        const { idToken } = await GoogleSignIn.signIn({ serverClientId: clientId })
        await signInWithCredential(auth, GoogleAuthProvider.credential(idToken))
        return
      } catch (e) {
        if ((e as { code?: string }).code === 'CANCELED') return
        // Not set up for this app in Firebase yet, or no Google account on the phone.
        return Browser.open({ url: `${WEB_URL}?app-signin=1` })
      }
    }
    const provider = new GoogleAuthProvider()
    try {
      await signInWithPopup(auth, provider)
    } catch (e) {
      // Some mobile browsers block popups; fall back to a full-page redirect.
      if ((e as { code?: string }).code === 'auth/popup-blocked') await signInWithRedirect(auth, provider)
      else setError((e as Error).message)
    }
  }
  return (
    <div className="center signin">
      <img src="./favicon.svg" alt="" width={72} height={72} />
      <h1>Monthly Budget</h1>
      <p className="muted">Sign in to sync your budget across all your devices.</p>
      <button className="primary" onClick={signIn}>
        Sign in with Google
      </button>
      {(error || outerError) && <p className="error">{error || outerError}</p>}
    </div>
  )
}

/** The website's half of the Android sign-in: sign in with Google, then pass the token to the app. */
function AppSignInBridge() {
  const [link, setLink] = useState('')
  const [error, setError] = useState('')

  const finish = (result: UserCredential) => {
    const token = GoogleAuthProvider.credentialFromResult(result)?.idToken
    if (!token) return setError('Google did not return a sign-in token. Please try again.')
    // An intent link opens the installed app straight from Chrome.
    const url = `intent://signin?id_token=${encodeURIComponent(token)}#Intent;scheme=monthlybudget;package=${APP_PACKAGE};end`
    setLink(url)
    location.href = url
  }

  useEffect(() => {
    if (auth) getRedirectResult(auth).then((r) => r && finish(r)).catch((e: Error) => setError(e.message))
  }, [])

  const signIn = async () => {
    if (!auth) return
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: 'select_account' })
    try {
      finish(await signInWithPopup(auth, provider))
    } catch (e) {
      if ((e as { code?: string }).code === 'auth/popup-blocked') await signInWithRedirect(auth, provider)
      else setError((e as Error).message)
    }
  }

  return (
    <div className="center signin">
      <img src="./favicon.svg" alt="" width={72} height={72} />
      <h1>Sign in to the app</h1>
      {link ? (
        <>
          <p className="muted">You're signed in. Head back to the Monthly Budget app.</p>
          <a className="button primary" href={link}>
            Open Monthly Budget
          </a>
        </>
      ) : (
        <>
          <p className="muted">Choose your Google account, and you'll go straight back to the Monthly Budget app.</p>
          <button className="primary" onClick={signIn}>
            Sign in with Google
          </button>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
