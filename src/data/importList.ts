import { findAccount, guessType } from './accounts'
import type { Settings, Transaction } from './types'

// Reads a plain list of transactions, one per row, as budget apps like Money Manager
// export them: Date (with time) | Account | Category | Subcategory | Note | Amount |
// Income/Expense | Description. There are no month tabs; each row's month comes from
// its date. A transfer row names the account it went to under Category.

type Cell = string | number | boolean | Date | null | undefined
type Grid = Cell[][]

const text = (c: Cell) => (c === null || c === undefined ? '' : String(c).trim())
const pad = (n: number) => String(n).padStart(2, '0')

function num(c: Cell): number {
  if (typeof c === 'number') return c
  const n = Number(text(c).replace(/,/g, '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : NaN
}

/** HH:MM from a date-and-time cell, when it has a time. */
function timeOf(c: Cell): string | undefined {
  if (c instanceof Date) return c.getHours() || c.getMinutes() ? `${pad(c.getHours())}:${pad(c.getMinutes())}` : undefined
  if (typeof c === 'number' && c > 20000 && c % 1) {
    const mins = Math.round((c % 1) * 1440) % 1440
    return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`
  }
  const m = text(c).match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]m)?/i)
  if (!m) return undefined
  const h = (+m[1] % 12) + (m[3]?.toLowerCase() === 'pm' ? 12 : m[3] ? 0 : +m[1] >= 12 ? 12 : 0)
  return `${pad(h)}:${m[2]}`
}

/** YYYY-MM-DD, from a date cell, a spreadsheet serial number, or text like 30/10/2026 or 2026-10-30. */
function isoDate(c: Cell): string | null {
  if (c instanceof Date) return `${c.getFullYear()}-${pad(c.getMonth() + 1)}-${pad(c.getDate())}`
  if (typeof c === 'number' && c > 20000) {
    // Days since 1899-12-30; the fraction is the time of day.
    const d = new Date(Math.round((c - 25569) * 86400000))
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  }
  const t = text(c)
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/)
  return m ? `${m[3]}-${pad(+m[2])}-${pad(+m[1])}` : null
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z/]/g, '')

interface Columns {
  date: number
  account: number
  category: number
  sub: number
  note: number
  type: number
  description: number
  amount: number
}

/** Where each column is, when the first row is this kind of header; null for any other file. */
export function listColumns(grid: Grid): Columns | null {
  const head = (grid[0] ?? []).map((c) => norm(text(c)))
  const at = (...names: string[]) => head.findIndex((h) => names.includes(h))
  const date = at('date', 'datetime', 'time')
  const type = at('income/expense', 'type', 'incomeexpense')
  const account = at('account', 'accounts', 'wallet')
  if (date < 0 || type < 0 || account < 0) return null
  // Money Manager has both "EGP" (the amount in the main currency) and "Amount" (text); take the first that's there.
  let amount = at('amount', 'value')
  const currencyCol = head.findIndex((h, i) => i !== date && i !== type && /^[a-z]{3}$/.test(h) && h !== 'tag')
  if (currencyCol >= 0) amount = currencyCol
  if (amount < 0) return null
  return { date, account, type, amount, category: at('category'), sub: at('subcategory'), note: at('note', 'notes', 'memo'), description: at('description') }
}

export interface ListImport {
  settings: Settings
  transactions: Transaction[]
  /** Rows already in the budget (same day, type and amount), left out. */
  skipped: number
  first: string
  last: string
  newAccounts: string[]
  newCategories: string[]
}

/**
 * Turns the rows into entries. New accounts and categories are added to `current`;
 * nothing else in settings changes. Rows matching an entry already in `existing` are
 * skipped, so it can sit alongside the Google Sheet import or SMS entries.
 */
export function importList(grid: Grid, cols: Columns, current: Settings, existing: Transaction[]): ListImport {
  const settings: Settings = { ...current, accounts: [...current.accounts], categories: { expense: [...current.categories.expense], income: [...current.categories.income] } }
  const newAccounts: string[] = []
  const newCategories: string[] = []
  const account = (raw: string) => {
    const name = raw || settings.accounts[0]?.name || 'Cash'
    const found = findAccount(settings.accounts, name)
    if (found) return found.name
    settings.accounts.push({ name, type: guessType(name) })
    newAccounts.push(name)
    return name
  }
  const category = (kind: 'expense' | 'income', raw: string) => {
    const name = raw && raw !== '..' ? raw : 'Other'
    const list = settings.categories[kind]
    const found = list.find((c) => c.toLowerCase() === name.toLowerCase())
    if (found) return found
    list.push(name)
    if (!newCategories.includes(name)) newCategories.push(name)
    return name
  }
  // Ours from an earlier import of this kind are replaced by id, so only the rest count as duplicates.
  const have = new Set(existing.filter((t) => !t.id.startsWith('list-')).map((t) => `${t.date}|${t.kind}|${Math.round(t.amount * 100)}`))
  const ids = new Map<string, number>()
  const out: Transaction[] = []
  let skipped = 0

  for (const row of grid.slice(1)) {
    const date = isoDate(row[cols.date])
    const amount = num(row[cols.amount])
    const type = norm(text(row[cols.type]))
    if (!date || !Number.isFinite(amount) || amount === 0 || !type) continue
    const cell = (i: number) => (i >= 0 ? text(row[i]) : '')
    const cat = cell(cols.category)
    const note = [cell(cols.sub), cell(cols.note), cell(cols.description)].filter((s) => s && s !== '..').join(' · ')
    const time = timeOf(row[cols.date])
    const base = { date, ...(time && { time }), month: date.slice(0, 7), description: note, category: '' }
    const from = account(cell(cols.account))
    let t: Omit<Transaction, 'id'>
    if (type.startsWith('transfer')) {
      // Only the "Out" half is exported; it names the account the money went to as its category.
      if (type.includes('in')) continue
      t = { ...base, kind: 'transfer', amount: Math.abs(amount), account: from, toAccount: account(cat) }
    } else if (/modifiedbal|balance/i.test(norm(cat))) {
      // A balance correction in the other app, not real income or spending.
      t = { ...base, kind: 'adjust', amount: type.startsWith('exp') ? -Math.abs(amount) : Math.abs(amount), account: from, description: note || 'Balance correction' }
    } else if (type.startsWith('inc')) {
      t = { ...base, kind: 'income', amount: Math.abs(amount), account: from, category: category('income', cat) }
    } else if (type.startsWith('exp')) {
      t = { ...base, kind: 'expense', amount: Math.abs(amount), account: from, category: category('expense', cat) }
    } else continue
    if (have.has(`${t.date}|${t.kind}|${Math.round(t.amount * 100)}`)) {
      skipped++
      continue
    }
    // Stable ids, so importing the same export again replaces these entries.
    const stamp = typeof row[cols.date] === 'number' ? Math.round((row[cols.date] as number) * 86400) : date
    const baseId = `list-${stamp}-${t.kind}-${Math.round(t.amount * 100)}`
    const n = ids.get(baseId) ?? 0
    ids.set(baseId, n + 1)
    out.push({ ...t, id: n ? `${baseId}-${n}` : baseId })
  }
  if (!out.length && !skipped) throw new Error('No entries were found in this file.')
  const dates = out.map((t) => t.date).sort()
  return { settings, transactions: out, skipped, first: dates[0] ?? '', last: dates[dates.length - 1] ?? '', newAccounts, newCategories }
}
