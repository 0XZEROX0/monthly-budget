// Run with feedback.test.ts. Syncing, against Firebase's local emulator rather than the real project: two devices on one
// account saving settings, entries and deletes, the clean-up of old delete markers, and a
// device that comes back after months away. Not part of `npm test`, since it needs the emulator:
//
//   npm i -g firebase-tools
//   echo '{"firestore":{"rules":"firestore.rules"},"emulators":{"firestore":{"port":8085},"auth":{"port":9099}}}' > /tmp/firebase.json
//   firebase emulators:exec --config /tmp/firebase.json --only firestore,auth --project demo-budget "npm run test:sync"
import { beforeAll, expect, it } from 'vitest'
import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { collection, connectFirestoreEmulator, deleteDoc, disableNetwork, doc, enableNetwork, getDoc, getDocs, getDocsFromServer, initializeFirestore, memoryLocalCache, setDoc, Timestamp, type Firestore } from 'firebase/firestore'

const store = new Map<string, string>()
Object.assign(globalThis, {
  localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
  document: { visibilityState: 'visible', addEventListener() {} },
})
const { createFirestoreBackend, STALE_MS } = await import('../src/data/firestoreBackend')
const { withDefaults } = await import('../src/data/defaults')

let uid = ''
const dbs: Firestore[] = []
async function device(name: string) {
  const app = initializeApp({ apiKey: 'demo', projectId: 'demo-budget', appId: 'x' }, name)
  const auth = getAuth(app)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  const db = initializeFirestore(app, { localCache: memoryLocalCache() })
  connectFirestoreEmulator(db, '127.0.0.1', 8085)
  dbs.push(db)
  return { auth, db }
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const until = async (ok: () => boolean | Promise<boolean>, what: string) => {
  for (let i = 0; i < 100; i++) {
    if (await ok()) return
    await wait(50)
  }
  throw new Error('timed out: ' + what)
}

let A: Awaited<ReturnType<typeof device>>, B: Awaited<ReturnType<typeof device>>
beforeAll(async () => {
  A = await device('a')
  const { createUserWithEmailAndPassword, signInWithEmailAndPassword } = await import('firebase/auth')
  const email = `t${Date.now()}@example.com`
  uid = (await createUserWithEmailAndPassword(A.auth, email, 'secret-pass')).user.uid
  B = await device('b')
  await signInWithEmailAndPassword(B.auth, email, 'secret-pass')
  expect(B.auth.currentUser?.uid).toBe(uid)
})

const settingsRef = (db: Firestore) => doc(db, 'users', uid, 'settings', 'main')
const txnsOf = (db: Firestore) => collection(db, 'users', uid, 'transactions')

it('settings: two devices saving different things both keep theirs', async () => {
  const a = createFirestoreBackend(A.db, uid)
  const b = createFirestoreBackend(B.db, uid)
  let sa = withDefaults(undefined), sb = withDefaults(undefined)
  a.watchSettings((s) => (sa = s))
  b.watchSettings((s) => (sb = s))
  await wait(300)
  // First save: nothing there yet, so the whole document is written.
  await a.saveSettings({ ...sa, currency: 'EGP', debtCategory: 'Instalment', icons: { Food: 'F', Home: 'H' } })
  await until(() => sb.icons?.Food === 'F', 'B sees first save')
  const first = (await getDoc(settingsRef(B.db))).data()!
  expect(first.categories.expense.length).toBeGreaterThan(3)

  // A goes offline and changes the clock; meanwhile B adds a category and removes an icon.
  await disableNetwork(A.db)
  const offline = a.saveSettings({ ...sa, clock12: true })
  await b.saveSettings({ ...sb, categories: { ...sb.categories, expense: [...sb.categories.expense, 'Pets'] }, icons: { Food: 'F' } })
  await enableNetwork(A.db)
  await offline
  await until(async () => (await getDoc(settingsRef(B.db))).data()?.clock12 === true, 'A upload')
  const merged = (await getDoc(settingsRef(B.db))).data()!
  expect(merged.clock12).toBe(true)
  expect(merged.categories.expense).toContain('Pets')
  // A whole field is replaced, not merged key by key: the removed icon stays removed.
  expect(merged.icons).toEqual({ Food: 'F' })

  // Taking a field away removes it on the server.
  await until(() => sb.clock12 === true, 'B sees clock')
  await b.saveSettings({ ...sb, debtCategory: undefined })
  const after = (await getDoc(settingsRef(A.db))).data()!
  expect('debtCategory' in after).toBe(false)
  expect(after.currency).toBe('EGP')
})

it('entries: add, edit, delete, and a fee beside its entry', async () => {
  const a = createFirestoreBackend(A.db, uid)
  let list: { id: string; amount: number }[] = []
  a.watchRange('2026-01', '2026-12', (t) => (list = t))
  await a.updateTransaction('one', { kind: 'expense', amount: 10, date: '2026-11-01', description: '', category: 'Food', account: 'Cash' })
  await a.updateTransaction('one-fee', { kind: 'expense', amount: 0.5, date: '2026-11-01', description: 'fee', category: 'Bank Fees', account: 'Cash' })
  await a.updateTransaction('one', { kind: 'expense', amount: 12, date: '2026-11-02', description: '', category: 'Food', account: 'Cash' })
  expect(list.map((t) => [t.id, t.amount]).sort()).toEqual([['one', 12], ['one-fee', 0.5]])
  await a.deleteTransaction('one')
  await a.deleteTransaction('one-fee')
  expect(list).toEqual([])
  const raw = await getDocsFromServer(txnsOf(B.db))
  expect(raw.docs.map((d) => [d.id, d.data().deleted]).sort()).toEqual([['one', true], ['one-fee', true]])
})

it('old delete markers are removed after 90 days; newer ones and live entries stay', async () => {
  const days = (n: number) => Timestamp.fromMillis(Date.now() - n * 86_400_000)
  await setDoc(doc(txnsOf(B.db), 'old-marker'), { deleted: true, updatedAt: days(100) })
  await setDoc(doc(txnsOf(B.db), 'new-marker'), { deleted: true, updatedAt: days(20) })
  await setDoc(doc(txnsOf(B.db), 'old-entry'), { kind: 'expense', amount: 5, date: '2026-01-05', month: '2026-01', description: '', category: 'Food', updatedAt: Timestamp.now() })
  // This device last looked for markers 40 days ago.
  store.set(`budget-sync:${uid}`, JSON.stringify({ lastSeen: 0, monthAt: Date.now(), month: '2026-11', syncedAt: Date.now(), cleanedAt: Date.now() - 40 * 86_400_000 }))
  const a = createFirestoreBackend(A.db, uid)
  let list: { id: string }[] = []
  a.watchRange('2026-01', '2026-12', (t) => (list = t))
  await until(async () => !(await getDocsFromServer(txnsOf(B.db))).docs.some((d) => d.id === 'old-marker'), 'old marker removed')
  const ids = (await getDocsFromServer(txnsOf(B.db))).docs.map((d) => d.id).sort()
  expect(ids).toEqual(['new-marker', 'old-entry', 'one', 'one-fee'])
  await until(() => list.length > 0, 'entries arrive')
  expect(list.map((t) => t.id)).toEqual(['old-entry'])
  expect(JSON.parse(store.get(`budget-sync:${uid}`)!).cleanedAt).toBeGreaterThan(Date.now() - 60_000)
})

it('a device away for months drops entries deleted meanwhile, marker and all', async () => {
  await setDoc(doc(txnsOf(B.db), 'ghost'), { kind: 'expense', amount: 7, date: '2026-02-01', month: '2026-02', description: '', category: 'Food', updatedAt: Timestamp.fromMillis(Date.now() - 300 * 86_400_000) })
  // A has it in its cache, then is away while it is deleted and its marker cleaned up.
  await getDocs(txnsOf(A.db))
  await disableNetwork(A.db)
  await deleteDoc(doc(txnsOf(B.db), 'ghost'))
  await enableNetwork(A.db)
  const mark = { lastSeen: Date.now(), monthAt: Date.now(), month: '2026-11', cleanedAt: Date.now() }

  store.set(`budget-sync:${uid}`, JSON.stringify({ ...mark, syncedAt: Date.now() - STALE_MS - 86_400_000 }))
  let list: { id: string }[] = [{ id: '?' }]
  createFirestoreBackend(A.db, uid).watchRange('2026-01', '2026-12', (t) => (list = t))
  await until(() => !list.some((t) => t.id === '?'), 'loaded')
  expect(list.map((t) => t.id)).toEqual(['old-entry'])
  const saved = JSON.parse(store.get(`budget-sync:${uid}`)!)
  expect(saved.syncedAt).toBeGreaterThan(Date.now() - 60_000)

  // The next ordinary start reads the cache, and still leaves it out.
  let again: { id: string }[] = [{ id: '?' }]
  createFirestoreBackend(A.db, uid).watchRange('2026-01', '2026-12', (t) => (again = t))
  await until(() => !again.some((t) => t.id === '?'), 'loaded again')
  expect(again.map((t) => t.id)).toEqual(['old-entry'])
})
