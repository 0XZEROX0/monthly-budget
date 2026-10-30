import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
  writeBatch,
  type DocumentReference,
  type Firestore,
} from 'firebase/firestore'
import { withDefaults } from './defaults'
import type { Backend, MonthPlan, NewTransaction, Settings, Transaction } from './types'
import { newestFirst } from './summary'

// Layout: users/{uid}/settings/main, users/{uid}/plans/{YYYY-MM}, users/{uid}/transactions/{id}
export function createFirestoreBackend(db: Firestore, uid: string): Backend {
  const userDoc = (...path: string[]) => doc(db, 'users', uid, ...path)
  const txns = collection(db, 'users', uid, 'transactions')
  const plans = collection(db, 'users', uid, 'plans')
  // Firestore rejects undefined fields, so drop them.
  const clean = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))
  const withMonth = (t: NewTransaction) => clean({ ...t, month: t.month ?? t.date.slice(0, 7) })
  const read = (d: { id: string; data(): unknown }) => ({ ...(d.data() as Omit<Transaction, 'id'>), id: d.id })

  // A batch holds at most 500 writes.
  async function commitInChunks(writes: [DocumentReference, object | null][]) {
    for (let i = 0; i < writes.length; i += 450) {
      const batch = writeBatch(db)
      for (const [ref, data] of writes.slice(i, i + 450)) {
        if (data) batch.set(ref, data)
        else batch.delete(ref)
      }
      await batch.commit()
    }
  }

  return {
    mode: 'cloud',
    watchSettings: (cb) =>
      onSnapshot(userDoc('settings', 'main'), (snap) => cb(withDefaults(snap.data() as Partial<Settings> | undefined))),
    saveSettings: (s) => setDoc(userDoc('settings', 'main'), s),
    watchPlan: (month, cb) =>
      onSnapshot(userDoc('plans', month), (snap) => cb((snap.data() as MonthPlan | undefined) ?? null)),
    savePlan: (month, p) => setDoc(userDoc('plans', month), clean(p)),
    watchTransactions: (month, cb) =>
      // Sorted here rather than with orderBy so no composite index is needed.
      onSnapshot(query(txns, where('month', '==', month)), (snap) =>
        cb(snap.docs.map(read).sort(newestFirst)),
      ),
    watchRange: (from, to, cb) =>
      onSnapshot(query(txns, where('month', '>=', from), where('month', '<=', to)), (snap) => cb(snap.docs.map(read))),
    addTransaction: async (t) => {
      await addDoc(txns, withMonth(t))
    },
    updateTransaction: (id, t) => setDoc(doc(txns, id), withMonth(t)),
    deleteTransaction: (id) => deleteDoc(doc(txns, id)),
    importAll: async (data) => {
      await commitInChunks([
        [userDoc('settings', 'main'), data.settings],
        ...Object.entries(data.plans).map(([m, p]) => [doc(plans, m), clean(p)] as [DocumentReference, object]),
        ...data.transactions.map(({ id, ...t }) => [doc(txns, id), withMonth(t)] as [DocumentReference, object]),
      ])
    },
    exportAll: async () => {
      const [t, p, s] = await Promise.all([getDocs(txns), getDocs(plans), getDoc(userDoc('settings', 'main'))])
      return {
        settings: withDefaults(s.data() as Partial<Settings> | undefined),
        plans: Object.fromEntries(p.docs.map((d) => [d.id, d.data() as MonthPlan])),
        transactions: t.docs.map(read),
      }
    },
    clearAll: async () => {
      const [t, p] = await Promise.all([getDocs(txns), getDocs(plans)])
      await commitInChunks([...t.docs, ...p.docs, { ref: userDoc('settings', 'main') }].map((d) => [d.ref, null]))
    },
  }
}
