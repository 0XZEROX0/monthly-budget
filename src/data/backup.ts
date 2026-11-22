// Checks a backup file before it is restored. A file can be old, edited by hand or not one of
// ours at all; an entry with a missing date, a text amount or an id with a slash in it would
// otherwise be saved as is and break the totals, or stop the whole restore half way.
import { withDefaults } from './defaults'
import type { ImportData, MonthPlan, Settings, Transaction, TxnKind } from './types'

const KINDS: TxnKind[] = ['expense', 'income', 'transfer', 'repay', 'borrow', 'adjust']
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
// Firestore document ids: no slashes, not . or .., and not too long.
const ID = /^(?!\.\.?$)[^/]{1,200}$/

const text = (v: unknown, max = 500) => (typeof v === 'string' ? v.slice(0, max) : '')
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** The entry as it should be saved, or null when it can't be one. */
export function cleanTransaction(v: unknown): Transaction | null {
  if (!isObject(v)) return null
  const { id, kind, date, amount } = v
  if (typeof id !== 'string' || !ID.test(id)) return null
  if (!KINDS.includes(kind as TxnKind)) return null
  if (typeof date !== 'string' || !DATE.test(date)) return null
  if (typeof amount !== 'number' || !Number.isFinite(amount) || Math.abs(amount) >= 1e12) return null
  const t: Transaction = {
    id,
    kind: kind as TxnKind,
    date,
    month: typeof v.month === 'string' && MONTH.test(v.month) ? v.month : date.slice(0, 7),
    amount,
    description: text(v.description),
    category: text(v.category, 100),
  }
  for (const k of ['account', 'toAccount', 'debt'] as const) if (typeof v[k] === 'string' && v[k]) t[k] = text(v[k], 100)
  if (typeof v.time === 'string' && TIME.test(v.time)) t.time = v.time
  if (v.notSpending === true) t.notSpending = true
  return t
}

function cleanPlan(v: unknown): MonthPlan | null {
  if (!isObject(v) || !isObject(v.planned)) return null
  const side = (s: unknown) =>
    Object.fromEntries(Object.entries(isObject(s) ? s : {}).filter(([, n]) => typeof n === 'number' && Number.isFinite(n))) as Record<string, number>
  const plan: MonthPlan = { planned: { expense: side(v.planned.expense), income: side(v.planned.income) } }
  if (typeof v.startingBalance === 'number' && Number.isFinite(v.startingBalance)) plan.startingBalance = v.startingBalance
  return plan
}

function cleanSettings(v: Record<string, unknown>): Settings {
  const s = withDefaults(v as Partial<Settings>)
  const defaults = withDefaults(undefined)
  const strings = (a: unknown) => (Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : null)
  const cats = isObject(v.categories) ? v.categories : {}
  return {
    ...s,
    currency: typeof s.currency === 'string' && /^[A-Z]{3}$/.test(s.currency) ? s.currency : defaults.currency,
    categories: { expense: strings(cats.expense) ?? defaults.categories.expense, income: strings(cats.income) ?? defaults.categories.income },
    accounts: Array.isArray(s.accounts) ? s.accounts.filter((a) => isObject(a) && typeof a.name === 'string' && typeof a.type === 'string') : defaults.accounts,
    debts: Array.isArray(s.debts) ? s.debts.filter((d) => isObject(d) && typeof d.name === 'string') : defaults.debts,
    opening: isObject(s.opening) && typeof s.opening.month === 'string' ? s.opening : defaults.opening,
  }
}

export interface CheckedBackup {
  data: ImportData
  /** Entries left out because they weren't valid. */
  dropped: number
}

/** A backup file's contents, checked and cleaned, or null when it isn't a Monthly Budget backup. */
export function checkBackup(raw: unknown): CheckedBackup | null {
  if (!isObject(raw) || raw.app !== 'monthly-budget' || !isObject(raw.settings) || !Array.isArray(raw.transactions)) return null
  const transactions = raw.transactions.map(cleanTransaction).filter((t): t is Transaction => t !== null)
  const plans = Object.fromEntries(
    Object.entries(isObject(raw.plans) ? raw.plans : {})
      .filter(([m]) => MONTH.test(m))
      .map(([m, p]) => [m, cleanPlan(p)] as const)
      .filter((e): e is readonly [string, MonthPlan] => e[1] !== null),
  )
  return { data: { settings: cleanSettings(raw.settings), plans, transactions }, dropped: raw.transactions.length - transactions.length }
}
