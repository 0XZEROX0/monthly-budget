import {
  collection,
  doc,
  getDoc,
  getDocs,
  getDocsFromCache,
  getDocsFromServer,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  writeBatch,
  type CollectionReference,
  type DocumentReference,
  type Firestore,
  type QuerySnapshot,
} from 'firebase/firestore'
import { withDefaults } from './defaults'
import { currentMonth } from './month'
import type { Backend, MonthPlan, NewTransaction, Settings, Transaction } from './types'
import { newestFirst } from './summary'
import { notifyWatch } from '../native/wear'

/**
 * Every transaction write stamps `updatedAt` with the server's clock, and a delete only marks
 * the document `deleted` (without a month, so month queries skip it). That lets the phone and
 * the watch ask Firestore for "what changed since I last looked" instead of reading every entry
 * again: Firebase's free plan counts each document a query returns as one read, 50,000 a day.
 */
export const DELETED = 'deleted'

/** Re-asks for a little before the last change seen, in case two writes landed close together. */
const OVERLAP_MS = 30_000
/** Once a day the current month is read in full anyway, to repair anything a delta missed. */
const MONTH_CHECK_MS = 20 * 60 * 60_000

interface SyncMark {
  /** Newest updatedAt seen from the server, in ms. */
  lastSeen: number
  /** When the current month was last read in full. */
  monthAt: number
  month: string
}

/**
 * All of the user's transactions, kept in memory and in Firestore's offline cache. The first
 * start on a device reads them all once; after that a start reads them from the cache and
 * listens only for documents changed since the last one seen.
 */
function createTxnStore(uid: string, txns: CollectionReference) {
  const key = `budget-sync:${uid}`
  const docs = new Map<string, Transaction>()
  const listeners = new Set<() => void>()
  let mark: SyncMark | null = null
  let loading: Promise<void> | null = null
  let ready = false
  let stopDelta: (() => void) | null = null
  let idleTimer: ReturnType<typeof setTimeout> | undefined

  const readMark = (): SyncMark | null => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? 'null') as SyncMark | null
    } catch {
      return null
    }
  }
  const saveMark = () => {
    try {
      if (mark) localStorage.setItem(key, JSON.stringify(mark))
    } catch {
      // Without storage the next start just reads everything again.
    }
  }
  const emit = () => listeners.forEach((l) => l())

  /** Applies a document as the server (or this device) has it. */
  function apply(id: string, data: Record<string, unknown> | undefined) {
    const stamp = data?.updatedAt
    if (stamp instanceof Timestamp && mark) mark.lastSeen = Math.max(mark.lastSeen, stamp.toMillis())
    if (!data || data[DELETED]) docs.delete(id)
    else docs.set(id, fromDoc(id, data))
  }
  const applySnap = (snap: QuerySnapshot) => snap.docs.forEach((d) => apply(d.id, d.data()))

  async function load() {
    const saved = readMark()
    const month = currentMonth()
    let cached: QuerySnapshot | null = null
    if (saved) cached = await getDocsFromCache(txns).catch(() => null)
    if (saved && cached && !cached.empty) {
      mark = saved
      applySnap(cached)
      // A daily full read of this month: cheap insurance, and it picks up entries from
      // watch builds older than this change, which don't stamp updatedAt.
      if (saved.month !== month || Date.now() - saved.monthAt > MONTH_CHECK_MS) {
        const fresh = await getDocsFromServer(query(txns, where('month', '==', month))).catch(() => null)
        if (fresh) {
          applySnap(fresh)
          mark = { ...mark, month, monthAt: Date.now() }
        }
      }
    } else {
      // First start on this device (or its cache was cleared): read everything, once.
      mark = { lastSeen: 0, month, monthAt: Date.now() }
      applySnap(await getDocs(txns))
    }
    saveMark()
    ready = true
    emit()
  }

  function startDelta() {
    if (stopDelta || !mark || document.visibilityState === 'hidden') return
    const since = Timestamp.fromMillis(Math.max(0, mark.lastSeen - OVERLAP_MS))
    stopDelta = onSnapshot(query(txns, where('updatedAt', '>', since)), (snap) => {
      const changes = snap.docChanges().filter((c) => c.type !== 'removed')
      if (!changes.length) return
      changes.forEach((c) => apply(c.doc.id, c.doc.data()))
      if (!snap.metadata.hasPendingWrites) saveMark()
      emit()
    })
  }
  function stop() {
    stopDelta?.()
    stopDelta = null
  }

  // A listener left open while the app is in the background would be billed again in full
  // when it reconnects, so close it and open a fresh one (from the newest change) on return.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') stop()
    else if (listeners.size) startDelta()
  })

  function ensure() {
    loading ??= load().catch((e) => {
      loading = null
      throw e
    })
    return loading
  }

  return {
    ready: () => ensure().then(() => [...docs.values()]),
    all: () => [...docs.values()],
    /** Calls cb now (once loaded) and after every change. */
    watch(cb: () => void) {
      clearTimeout(idleTimer)
      listeners.add(cb)
      ensure().then(startDelta, () => {})
      if (ready) cb()
      return () => {
        listeners.delete(cb)
        // Switching months unsubscribes and resubscribes; only stop when nothing is left.
        if (!listeners.size) idleTimer = setTimeout(() => !listeners.size && stop(), 5_000)
      }
    },
    /** Shows a write on this device straight away, before Firestore confirms it. */
    local(id: string, data: Record<string, unknown> | null) {
      apply(id, data ?? undefined)
      emit()
    },
  }
}

function fromDoc(id: string, data: Record<string, unknown>): Transaction {
  const { updatedAt: _u, [DELETED]: _d, ...rest } = data
  return { ...(rest as Omit<Transaction, 'id'>), id }
}

// Layout: users/{uid}/settings/main, users/{uid}/plans/{YYYY-MM}, users/{uid}/transactions/{id}
export function createFirestoreBackend(db: Firestore, uid: string): Backend {
  const userDoc = (...path: string[]) => doc(db, 'users', uid, ...path)
  const txns = collection(db, 'users', uid, 'transactions')
  const plans = collection(db, 'users', uid, 'plans')
  const store = createTxnStore(uid, txns)
  // Firestore rejects undefined fields, so drop them.
  const clean = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))
  const withMonth = (t: NewTransaction) => {
    const { id: _id, ...rest } = t as NewTransaction & { id?: string }
    return clean({ ...rest, month: t.month ?? t.date.slice(0, 7) })
  }
  const stamped = (o: object) => ({ ...o, updatedAt: serverTimestamp() })
  const tombstone = () => ({ [DELETED]: true, updatedAt: serverTimestamp() })

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

  async function saveTxn(id: string, t: NewTransaction) {
    const data = withMonth(t)
    store.local(id, data)
    notifyWatch()
    await setDoc(doc(txns, id), stamped(data))
  }

  const view = (pick: (t: Transaction) => boolean, sort?: typeof newestFirst) => (cb: (t: Transaction[]) => void) =>
    store.watch(() => {
      const list = store.all().filter(pick)
      cb(sort ? list.sort(sort) : list)
    })

  return {
    mode: 'cloud',
    watchSettings: (cb) =>
      onSnapshot(userDoc('settings', 'main'), (snap) => cb(withDefaults(snap.data() as Partial<Settings> | undefined))),
    saveSettings: async (s) => {
      notifyWatch()
      await setDoc(userDoc('settings', 'main'), s)
    },
    watchPlan: (month, cb) =>
      onSnapshot(userDoc('plans', month), (snap) => cb((snap.data() as MonthPlan | undefined) ?? null)),
    savePlan: async (month, p) => {
      notifyWatch()
      await setDoc(userDoc('plans', month), clean(p))
    },
    watchTransactions: (month, cb) => view((t) => t.month === month, newestFirst)(cb),
    watchRange: (from, to, cb) => view((t) => t.month >= from && t.month <= to)(cb),
    addTransaction: (t) => saveTxn(doc(txns).id, t),
    updateTransaction: (id, t) => saveTxn(id, t),
    deleteTransaction: async (id) => {
      store.local(id, null)
      notifyWatch()
      await setDoc(doc(txns, id), tombstone())
    },
    importAll: async (data) => {
      await store.ready()
      for (const { id, ...t } of data.transactions) store.local(id, withMonth(t))
      notifyWatch()
      await commitInChunks([
        [userDoc('settings', 'main'), data.settings],
        ...Object.entries(data.plans).map(([m, p]) => [doc(plans, m), clean(p)] as [DocumentReference, object]),
        ...data.transactions.map(({ id, ...t }) => [doc(txns, id), stamped(withMonth(t))] as [DocumentReference, object]),
      ])
    },
    exportAll: async () => {
      // Transactions come from the synced copy, not a fresh read of every document.
      const [t, p, s] = await Promise.all([store.ready(), getDocs(plans), getDoc(userDoc('settings', 'main'))])
      return {
        settings: withDefaults(s.data() as Partial<Settings> | undefined),
        plans: Object.fromEntries(p.docs.map((d) => [d.id, d.data() as MonthPlan])),
        transactions: t,
      }
    },
    clearAll: async () => {
      const [t, p] = await Promise.all([store.ready(), getDocs(plans)])
      for (const x of t) store.local(x.id, null)
      notifyWatch()
      // Entries become tombstones so the watch and other devices see them go.
      await commitInChunks([
        ...t.map((x) => [doc(txns, x.id), tombstone()] as [DocumentReference, object]),
        ...p.docs.map((d) => [d.ref, null] as [DocumentReference, null]),
        [userDoc('settings', 'main'), null],
      ])
    },
  }
}
