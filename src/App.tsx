import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut, type User } from 'firebase/auth'
import { useEffect, useMemo, useState } from 'react'
import { MonthView } from './components/MonthView'
import { auth, firebaseConfigured, firestore } from './data/firebase'
import { createFirestoreBackend } from './data/firestoreBackend'
import { createLocalBackend } from './data/localBackend'

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(firebaseConfigured ? undefined : null)

  useEffect(() => (auth ? onAuthStateChanged(auth, setUser) : undefined), [])

  const backend = useMemo(() => {
    if (!firebaseConfigured) return createLocalBackend()
    return user && firestore ? createFirestoreBackend(firestore, user.uid) : null
  }, [user])

  if (firebaseConfigured && user === undefined) return <div className="center muted">Loading…</div>
  if (!backend) return <SignIn />
  return <MonthView backend={backend} user={user} onSignOut={auth ? () => signOut(auth!) : undefined} />
}

function SignIn() {
  const [error, setError] = useState('')
  const signIn = async () => {
    if (!auth) return
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
      {error && <p className="error">{error}</p>}
    </div>
  )
}
