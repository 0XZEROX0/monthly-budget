import { deleteUser, type User } from 'firebase/auth'
import { collection, doc, getDocsFromServer, writeBatch, type DocumentReference, type Firestore } from 'firebase/firestore'

// Deleting an account for good (Settings › Account): every document under users/{uid},
// then the sign-in itself. Unlike "Erase all data", nothing is left behind, not even the
// tombstones other devices use to see entries go. Google Play and the privacy policy
// (public/privacy.html) promise this.

/** Everything the app and the watch keep for a user: users/{uid}/settings/main, plans/*, transactions/*. */
const COLLECTIONS = ['transactions', 'plans'] as const

export type DeleteResult = 'deleted' | 'sign-in-again'

export async function deleteAccount(db: Firestore, user: User): Promise<DeleteResult> {
  const refs: DocumentReference[] = [doc(db, 'users', user.uid, 'settings', 'main')]
  // From the server, not this device's cache: the cache may not hold every month.
  for (const name of COLLECTIONS) {
    const snap = await getDocsFromServer(collection(db, 'users', user.uid, name))
    refs.push(...snap.docs.map((d) => d.ref))
  }
  // A batch holds at most 500 writes.
  for (let i = 0; i < refs.length; i += 450) {
    const batch = writeBatch(db)
    for (const ref of refs.slice(i, i + 450)) batch.delete(ref)
    await batch.commit()
  }
  clearDeviceData()
  try {
    await deleteUser(user)
    return 'deleted'
  } catch (e) {
    // Firebase only deletes a sign-in made in the last few minutes. The data is gone
    // already; signing in again and repeating this removes the sign-in too.
    if ((e as { code?: string }).code === 'auth/requires-recent-login') return 'sign-in-again'
    throw e
  }
}

/** This app's keys in this browser (the website shares its origin with other pages, so not all of them). */
const OWN_KEY = /^(budget-app:|budget\.|reports-range$|update-notify)/

/** This device's own copies: remembered choices, skipped bank SMS and the like. */
function clearDeviceData() {
  try {
    for (const key of Object.keys(localStorage)) if (OWN_KEY.test(key)) localStorage.removeItem(key)
  } catch {
    /* storage blocked; nothing to clear */
  }
}
