// The feedback rules in firestore.rules, against the emulator (see backend.test.ts for how
// to run): a signed-in user can add feedback but never read it back, and can't fake
// someone else's uid or reply address.
import { beforeAll, expect, it } from 'vitest'
import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from 'firebase/auth'
import { addDoc, collection, connectFirestoreEmulator, doc, getDoc, getDocs, initializeFirestore, memoryLocalCache, serverTimestamp, updateDoc, type Firestore } from 'firebase/firestore'
import { feedbackDoc, sendFeedback } from '../src/data/feedback'

let db: Firestore
let uid = ''
const email = `fb${Date.now()}@example.com`

beforeAll(async () => {
  const app = initializeApp({ apiKey: 'demo', projectId: 'demo-budget', appId: 'x' }, 'feedback')
  const auth = getAuth(app)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  db = initializeFirestore(app, { localCache: memoryLocalCache() })
  connectFirestoreEmulator(db, '127.0.0.1', 8085)
  uid = (await createUserWithEmailAndPassword(auth, email, 'secret123')).user.uid
})

const DENIED = { code: 'permission-denied' }
const base = { kind: 'idea' as const, message: 'Dark widgets please', platform: 'android', build: 42 }
const add = (data: object) => addDoc(collection(db, 'feedback'), { ...data, createdAt: serverTimestamp() })

it('adds feedback, with or without a reply address', async () => {
  expect(await sendFeedback(db, uid, base)).toBe('sent')
  expect(await sendFeedback(db, uid, { ...base, kind: 'bug', replyTo: email })).toBe('sent')
})

it('never reads feedback back, not even your own', async () => {
  const ref = await add(feedbackDoc(uid, base))
  await expect(getDoc(doc(db, 'feedback', ref.id))).rejects.toMatchObject(DENIED)
  await expect(getDocs(collection(db, 'feedback'))).rejects.toMatchObject(DENIED)
  await expect(updateDoc(ref, { emailed: true })).rejects.toMatchObject(DENIED)
})

it('refuses fakes and junk', async () => {
  await expect(add(feedbackDoc('someone-else', base))).rejects.toMatchObject(DENIED)
  await expect(add(feedbackDoc(uid, { ...base, replyTo: 'other@example.com' }))).rejects.toMatchObject(DENIED)
  await expect(add({ ...feedbackDoc(uid, base), message: 'x'.repeat(2001) })).rejects.toMatchObject(DENIED)
  await expect(add({ ...feedbackDoc(uid, base), emailed: true })).rejects.toMatchObject(DENIED)
  await expect(add({ ...feedbackDoc(uid, base), extra: 1 })).rejects.toMatchObject(DENIED)
  await expect(add({ ...feedbackDoc(uid, base), kind: 'spam' })).rejects.toMatchObject(DENIED)
})

it('trims and caps the message before sending', () => {
  expect(feedbackDoc(uid, { ...base, message: '  hi  ' }).message).toBe('hi')
  expect(feedbackDoc(uid, { ...base, message: 'x'.repeat(3000) }).message).toHaveLength(2000)
  expect(() => feedbackDoc(uid, { ...base, message: '   ' })).toThrow()
})
