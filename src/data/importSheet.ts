import { withDefaults } from './defaults'
import { effects } from './summary'
import type { Account, Debt, ImportData, MonthPlan, Settings, Transaction } from './types'

// Reads an .xlsx export of the "Monthly budget" Google Sheet: one tab per month
// named MM/YYYY with Expenses (A:E), Income (G:J) and the summary block (L:W).

type Cell = string | number | boolean | Date | null | undefined
type Grid = Cell[][]

const COL = { L: 11, N: 13, O: 14, R: 17, T: 19, U: 20, V: 21 }

const text = (c: Cell) => (c === null || c === undefined ? '' : String(c).trim())

function num(c: Cell): number {
  if (typeof c === 'number') return c
  const n = Number(text(c).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

const pad = (n: number) => String(n).padStart(2, '0')

function isoDate(c: Cell): string | null {
  if (c instanceof Date) return `${c.getFullYear()}-${pad(c.getMonth() + 1)}-${pad(c.getDate())}`
  if (typeof c === 'number' && c > 20000) {
    // Spreadsheet serial day number (days since 1899-12-30).
    const d = new Date(Math.round((c - 25569) * 86400000))
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  }
  const m = text(c).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  return m ? `${m[3]}-${pad(+m[2])}-${pad(+m[1])}` : null
}

interface MonthSheet {
  month: string
  txns: Transaction[]
  plan: MonthPlan
  /** Balances the sheet shows at the end of the month. */
  end: { accounts: Record<string, number>; debts: Record<string, number> }
  /** Balances carried in at the top of the Income table. */
  carry: Record<string, number>
  categories: string[]
  accounts: Account[]
  debts: Debt[]
  /** "Saved this month" as the sheet computed it, for checking. */
  sheetSaved: number | null
}

const findRow = (g: Grid, test: (r: Cell[]) => boolean, from = 0) => {
  for (let i = from; i < g.length; i++) if (test(g[i] ?? [])) return i
  return -1
}

function parseMonth(name: string, g: Grid): MonthSheet | null {
  // Excel forbids "/" in tab names, so the export may turn 10/2026 into 10_2026 or similar.
  const m = name.trim().match(/^(\d{1,2})\D(\d{4})$/)
  if (!m || +m[1] < 1 || +m[1] > 12) return null
  const month = `${m[2]}-${pad(+m[1])}`
  const monthStart = `${month}-01`

  // Accounts: the "Cash | Bank | Thndr" header with end balances on the next row.
  const balRow = findRow(
    g,
    (r) => [COL.R, COL.T, COL.V].every((c) => typeof r[c] === 'string' && text(r[c]) !== ''),
  )
  const hasBalances = balRow >= 0 && typeof g[balRow + 1]?.[COL.R] === 'number'
  const names = hasBalances ? [COL.R, COL.T, COL.V].map((c) => text(g[balRow][c])) : ['Cash', 'Bank', 'Thndr']
  const investName = names[2]
  const interestRow = findRow(g, (r) => /interest/i.test(text(r[COL.R])))
  const accounts: Account[] = [
    { name: names[0], type: /bank/i.test(names[0]) ? 'bank' : 'cash' },
    { name: names[1], type: /cash/i.test(names[1]) ? 'cash' : 'bank' },
    { name: investName, type: 'investment', interestPct: interestRow >= 0 ? num(g[interestRow][COL.T]) : undefined },
  ]
  const investRow = findRow(g, (r) => text(r[COL.R]) === investName, balRow + 2)
  const end = {
    accounts: {
      [names[0]]: hasBalances ? num(g[balRow + 1]?.[COL.R]) : 0,
      [names[1]]: hasBalances ? num(g[balRow + 1]?.[COL.T]) : 0,
      [investName]: investRow >= 0 ? num(g[investRow][COL.U]) : 0,
    },
    debts: {} as Record<string, number>,
  }

  // Debts: rows under the "Available | Debt" header.
  const debts: Debt[] = []
  const debtHead = findRow(g, (r) => text(r[COL.N]) === 'Available' && text(r[COL.O]) === 'Debt')
  if (debtHead >= 0) {
    for (let i = debtHead + 1; i < Math.min(g.length, debtHead + 15); i++) {
      const label = text(g[i]?.[COL.L])
      if (!label || label === 'Totals') continue
      debts.push({ name: label, limit: num(g[i][COL.N]) })
      end.debts[label] = num(g[i][COL.O])
    }
  }
  const accountNames = new Set(accounts.map((a) => a.name))
  const debtNames = new Set(debts.map((d) => d.name))

  // Categories and planned amounts: rows under the "Planned | Spend | Left" header.
  const plan: MonthPlan = { planned: { expense: {}, income: {} } }
  const categories: string[] = []
  const catHead = findRow(g, (r) => text(r[COL.N]) === 'Planned' && text(r[COL.O]) === 'Spend')
  if (catHead >= 0) {
    for (let i = catHead + 1; i < (debtHead >= 0 ? debtHead : catHead + 25); i++) {
      const label = text(g[i]?.[COL.L])
      if (!label || label === 'Totals' || label === 'Debt Payment' || accountNames.has(label) || debtNames.has(label)) continue
      categories.push(label)
      const planned = num(g[i][COL.N])
      if (planned) plan.planned.expense[label] = planned
    }
  }

  const savedLabel = findRow(g, (r) => /this month$/i.test(text(r[COL.V])))
  const sheetSaved = savedLabel > 0 ? num(g[savedLabel - 1][COL.V]) : null

  // Transactions.
  const head = findRow(g, (r) => text(r[0]) === 'Date' && text(r[6]) === 'Date')
  const txns: Transaction[] = []
  const carry: Record<string, number> = {}
  const base = { month, description: '', category: '' }
  for (let i = head + 1; head >= 0 && i < g.length; i++) {
    const r = g[i] ?? []
    // Expenses: Date, Amount, From, Description, Category
    const eAmount = num(r[1])
    if (eAmount) {
      const date = isoDate(r[0]) ?? monthStart
      const from = accountNames.has(text(r[2])) ? text(r[2]) : accounts[0].name
      const cat = text(r[4])
      const t = { ...base, id: `imp-${month}-e${i}`, date, amount: eAmount, description: text(r[3]), account: from }
      if (accountNames.has(cat)) txns.push({ ...t, kind: 'transfer', toAccount: cat })
      else if (debtNames.has(cat)) txns.push({ ...t, kind: 'repay', debt: cat })
      else txns.push({ ...t, kind: 'expense', category: cat || 'Other' })
    }
    // Income: Date, Amount, Description, Category (the receiving account or debt)
    const iAmount = num(r[7])
    if (iAmount) {
      const date = isoDate(r[6]) ?? monthStart
      const desc = text(r[8])
      const cat = text(r[9])
      // Opening balances copied from last month: dated the 1st of an earlier month, no description.
      if (date < monthStart && date.endsWith('-01') && !desc && (accountNames.has(cat) || debtNames.has(cat))) {
        carry[cat] = (carry[cat] ?? 0) + iAmount
        continue
      }
      const t = { ...base, id: `imp-${month}-i${i}`, date, amount: iAmount, description: desc }
      if (debtNames.has(cat)) txns.push({ ...t, kind: 'borrow', debt: cat })
      else
        txns.push({
          ...t,
          kind: 'income',
          account: accountNames.has(cat) ? cat : accounts[1].name,
          category: /payroll|salary|مرتب/i.test(desc) ? 'Salary' : 'Other',
        })
    }
  }
  return { month, txns, plan, end, carry, categories, accounts, debts, sheetSaved }
}

export interface ImportResult extends ImportData {
  months: { month: string; entries: number; sheetSaved: number | null }[]
}

/** Builds app data from the sheet's month tabs. Balances are reconciled to the sheet's own figures. */
export function importGrids(sheets: { name: string; grid: Grid }[], current?: Settings): ImportResult {
  const months = sheets
    .map((s) => parseMonth(s.name, s.grid))
    .filter((m): m is MonthSheet => m !== null)
    .sort((a, b) => a.month.localeCompare(b.month))
  if (!months.length) throw new Error('No month tabs (named like 10/2026) were found in this file.')

  const latest = months[months.length - 1]
  const expenseCats = [...latest.categories]
  for (const m of [...months].reverse()) for (const c of m.categories) if (!expenseCats.includes(c)) expenseCats.push(c)
  const base = withDefaults(current)
  const settings: Settings = {
    ...base,
    currency: 'EGP',
    categories: { expense: expenseCats, income: [...new Set(['Salary', 'Other', ...base.categories.income])] },
    accounts: latest.accounts,
    debts: latest.debts,
    opening: { month: months[0].month, accounts: {}, debts: {} },
  }

  const transactions: Transaction[] = []
  const plans: Record<string, MonthPlan> = {}
  let running = { accounts: {} as Record<string, number>, debts: {} as Record<string, number> }

  months.forEach((m, idx) => {
    plans[m.month] = m.plan
    transactions.push(...m.txns)
    // Flows this month, to compare against the sheet's end-of-month balances.
    const flow = { accounts: {} as Record<string, number>, debts: {} as Record<string, number> }
    for (const t of m.txns) {
      const e = effects(t, settings)
      for (const [k, v] of Object.entries(e.accounts)) flow.accounts[k] = (flow.accounts[k] ?? 0) + v
      for (const [k, v] of Object.entries(e.debts)) flow.debts[k] = (flow.debts[k] ?? 0) + v
    }
    for (const group of ['accounts', 'debts'] as const) {
      for (const [name, target] of Object.entries(m.end[group])) {
        const computed = (running[group][name] ?? 0) + (flow[group][name] ?? 0)
        const diff = Math.round((target - computed) * 100) / 100
        if (idx === 0) {
          // First month: whatever the sheet started with becomes the opening balance.
          settings.opening[group][name] = (running[group][name] ?? 0) + diff
        } else if (Math.abs(diff) >= 0.5) {
          transactions.push({
            id: `imp-${m.month}-adj-${group}-${name}`.replace(/\s+/g, '_'),
            kind: 'adjust',
            month: m.month,
            date: `${m.month}-01`,
            amount: diff,
            description: group === 'accounts' && m.accounts.find((a) => a.name === name)?.type === 'investment' ? 'Value change' : 'Balance correction from sheet',
            category: '',
            ...(group === 'debts' ? { debt: name } : { account: name }),
          })
        }
      }
    }
    running = { accounts: { ...m.end.accounts }, debts: { ...m.end.debts } }
  })

  return {
    settings,
    plans,
    transactions,
    months: months.map((m) => ({ month: m.month, entries: m.txns.length, sheetSaved: m.sheetSaved })),
  }
}

/** Reads every tab of an .xlsx (or .csv) File in the browser. */
export async function readWorkbook(file: File): Promise<{ name: string; grid: Grid }[]> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  return wb.SheetNames.map((name) => ({
    name,
    grid: XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[name], { header: 1, raw: true, defval: '' }),
  }))
}
