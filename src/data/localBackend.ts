import { DEFAULT_SETTINGS, withDefaults } from './defaults'
import type { Backend, MonthPlan, NewTransaction, Settings, Transaction } from './types'

// Browser-only storage, used when no Firebase project is configured.
const KEY = 'budget-app:v1'

interface Db {
  settings: Settings
  plans: Record<string, MonthPlan>
  transactions: Transaction[]
}

function load(): Db {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const db = JSON.parse(raw) as Db
      return { ...db, settings: withDefaults(db.settings) }
    }
  } catch {
    // Storage blocked or corrupt: start fresh in memory.
  }
  return { settings: DEFAULT_SETTINGS, plans: {}, transactions: [] }
}

export const toTxn = (id: string, t: NewTransaction): Transaction => ({ ...t, id, month: t.month ?? t.date.slice(0, 7) })

export function createLocalBackend(): Backend {
  let db = load()
  const listeners = new Set<() => void>()
  const commit = async () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(db))
    } catch {
      // Keep working in memory if storage is unavailable.
    }
    listeners.forEach((l) => l())
  }
  const watch = (fn: () => void) => {
    fn()
    listeners.add(fn)
    return () => void listeners.delete(fn)
  }
  const upsert = (list: Transaction[], t: Transaction) => [...list.filter((x) => x.id !== t.id), t]

  return {
    mode: 'local',
    watchSettings: (cb) => watch(() => cb(db.settings)),
    saveSettings: (s) => {
      db = { ...db, settings: s }
      return commit()
    },
    watchPlan: (month, cb) => watch(() => cb(db.plans[month] ?? null)),
    savePlan: (month, p) => {
      db = { ...db, plans: { ...db.plans, [month]: p } }
      return commit()
    },
    watchTransactions: (month, cb) =>
      watch(() => cb(db.transactions.filter((t) => t.month === month).sort((a, b) => b.date.localeCompare(a.date)))),
    watchRange: (from, to, cb) => watch(() => cb(db.transactions.filter((t) => t.month >= from && t.month <= to))),
    addTransaction: (t) => {
      db = { ...db, transactions: [...db.transactions, toTxn(crypto.randomUUID(), t)] }
      return commit()
    },
    updateTransaction: (id, t) => {
      db = { ...db, transactions: upsert(db.transactions, toTxn(id, t)) }
      return commit()
    },
    deleteTransaction: (id) => {
      db = { ...db, transactions: db.transactions.filter((x) => x.id !== id) }
      return commit()
    },
    importAll: (data) => {
      const ids = new Set(data.transactions.map((t) => t.id))
      db = {
        settings: data.settings,
        plans: { ...db.plans, ...data.plans },
        transactions: [...db.transactions.filter((t) => !ids.has(t.id)), ...data.transactions],
      }
      return commit()
    },
    clearAll: () => {
      db = { settings: DEFAULT_SETTINGS, plans: {}, transactions: [] }
      return commit()
    },
  }
}
