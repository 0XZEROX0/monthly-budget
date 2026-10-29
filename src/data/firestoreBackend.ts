import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  setDoc,
  where,
  type Firestore,
} from 'firebase/firestore'
import { DEFAULT_SETTINGS } from './defaults'
import type { Backend, MonthPlan, NewTransaction, Settings, Transaction } from './types'

// Layout: users/{uid}/settings/main, users/{uid}/plans/{YYYY-MM}, users/{uid}/transactions/{id}
export function createFirestoreBackend(db: Firestore, uid: string): Backend {
  const userDoc = (...path: string[]) => doc(db, 'users', uid, ...path)
  const txns = collection(db, 'users', uid, 'transactions')
  const withMonth = (t: NewTransaction) => ({ ...t, month: t.date.slice(0, 7) })

  return {
    mode: 'cloud',
    watchSettings: (cb) =>
      onSnapshot(userDoc('settings', 'main'), (snap) => cb((snap.data() as Settings | undefined) ?? DEFAULT_SETTINGS)),
    saveSettings: (s) => setDoc(userDoc('settings', 'main'), s),
    watchPlan: (month, cb) =>
      onSnapshot(userDoc('plans', month), (snap) => cb((snap.data() as MonthPlan | undefined) ?? null)),
    savePlan: (month, p) => setDoc(userDoc('plans', month), p),
    watchTransactions: (month, cb) =>
      // Sorted here rather than with orderBy so no composite index is needed.
      onSnapshot(query(txns, where('month', '==', month)), (snap) =>
        cb(
          snap.docs
            .map((d) => ({ ...(d.data() as Omit<Transaction, 'id'>), id: d.id }))
            .sort((a, b) => b.date.localeCompare(a.date)),
        ),
      ),
    watchRange: (from, to, cb) =>
      onSnapshot(query(txns, where('month', '>=', from), where('month', '<=', to)), (snap) =>
        cb(snap.docs.map((d) => ({ ...(d.data() as Omit<Transaction, 'id'>), id: d.id }))),
      ),
    addTransaction: async (t) => {
      await addDoc(txns, withMonth(t))
    },
    updateTransaction: (id, t) => setDoc(doc(txns, id), withMonth(t)),
    deleteTransaction: (id) => deleteDoc(doc(txns, id)),
  }
}
