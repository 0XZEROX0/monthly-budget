// firestore.rules for users/{uid}: only documents shaped like the app's and the watch's own.
// Run with the emulator, like backend.test.ts.
import { beforeAll, expect, it } from 'vitest'
import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from 'firebase/auth'
import { collection, connectFirestoreEmulator, deleteDoc, doc, initializeFirestore, memoryLocalCache, serverTimestamp, setDoc, updateDoc, type Firestore } from 'firebase/firestore'

let db: Firestore
let uid = ''
beforeAll(async () => {
  const app = initializeApp({ apiKey: 'demo', projectId: 'demo-budget', appId: 'x' }, 'rules')
  const auth = getAuth(app)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  db = initializeFirestore(app, { localCache: memoryLocalCache() })
  connectFirestoreEmulator(db, '127.0.0.1', 8085)
  uid = (await createUserWithEmailAndPassword(auth, `r${Date.now()}@example.com`, 'secret-pass')).user.uid
})

const entry = { kind: 'expense', amount: 10, date: '2026-11-01', month: '2026-11', description: '', category: 'Food', account: 'Cash' }
const txn = (id: string) => doc(collection(db, 'users', uid, 'transactions'), id)
const denied = (p: Promise<unknown>) => expect(p).rejects.toMatchObject({ code: 'permission-denied' })

it('allows the app and watch writes', async () => {
  await setDoc(txn('a'), { ...entry, updatedAt: serverTimestamp() })
  await setDoc(txn('b'), { ...entry, kind: 'transfer', toAccount: 'Bank', time: '09:30', notSpending: true })
  await setDoc(txn('a'), { deleted: true, updatedAt: serverTimestamp() })
  await deleteDoc(txn('b'))
  await setDoc(doc(db, 'users', uid, 'plans', '2026-11'), { planned: { expense: { Food: 100 }, income: {} }, startingBalance: 5 })
  await setDoc(doc(db, 'users', uid, 'settings', 'main'), { currency: 'EGP', categories: { expense: [], income: [] } })
  await updateDoc(doc(db, 'users', uid, 'settings', 'main'), { clock12: true })
})

it('refuses junk', async () => {
  await denied(setDoc(txn('c'), { ...entry, amount: '10' }))
  await denied(setDoc(txn('c'), { ...entry, kind: 'steal' }))
  await denied(setDoc(txn('c'), { ...entry, date: '01/11/2026' }))
  await denied(setDoc(txn('c'), { ...entry, extra: 'x'.repeat(1000) }))
  await denied(setDoc(txn('c'), { ...entry, description: 'x'.repeat(2001) }))
  await denied(setDoc(txn('c'), { deleted: false }))
  await denied(setDoc(doc(db, 'users', uid, 'plans', 'junk'), { planned: {} }))
  await denied(setDoc(doc(db, 'users', uid, 'settings', 'other'), { currency: 'EGP' }))
  await denied(setDoc(doc(db, 'users', uid, 'settings', 'main'), { junk: true }))
  await denied(setDoc(doc(db, 'users', uid, 'anything', 'x'), { a: 1 }))
  await denied(setDoc(doc(db, 'users', 'someone-else', 'transactions', 'x'), entry))
})
