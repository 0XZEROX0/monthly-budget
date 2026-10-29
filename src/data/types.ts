export type Kind = 'expense' | 'income'

/**
 * expense: paid from `account` in `category`.  income: received into `account`.
 * transfer: `account` -> `toAccount` (e.g. Bank -> Cash, Bank -> Thndr); not spending.
 * repay: `account` pays down `debt`.  borrow: `debt` grows, optionally into `account`.
 * adjust: sets a balance straight (investment value change, or a correction) on
 * `account` or `debt`; `amount` is signed.
 */
export type TxnKind = 'expense' | 'income' | 'transfer' | 'repay' | 'borrow' | 'adjust'

export interface Transaction {
  id: string
  kind: TxnKind
  /** ISO date, YYYY-MM-DD */
  date: string
  /** YYYY-MM the entry counts toward; normally the date's month */
  month: string
  amount: number
  description: string
  category: string
  account?: string
  toAccount?: string
  debt?: string
}

export type NewTransaction = Omit<Transaction, 'id' | 'month'> & { month?: string }

export type AccountType = 'cash' | 'bank' | 'investment'

export interface Account {
  name: string
  type: AccountType
  /** Expected yearly return for investments, in percent; shown as estimated interest. */
  interestPct?: number
}

export interface Debt {
  name: string
  limit: number
}

/** Balances at the start of `month`; later months are computed from transactions. */
export interface Opening {
  month: string
  accounts: Record<string, number>
  debts: Record<string, number>
}

/** The plan for one month: planned amount per category. */
export interface MonthPlan {
  /** Unused since balances are computed; kept so older saved plans still load. */
  startingBalance?: number
  planned: Record<Kind, Record<string, number>>
}

export interface Settings {
  currency: string
  categories: Record<Kind, string[]>
  accounts: Account[]
  debts: Debt[]
  opening: Opening
}

export type Unsubscribe = () => void

export interface ImportData {
  settings: Settings
  plans: Record<string, MonthPlan>
  transactions: Transaction[]
}

export interface Backend {
  /** 'local' keeps data in this browser only; 'cloud' syncs through Firestore. */
  mode: 'local' | 'cloud'
  watchSettings(cb: (s: Settings) => void): Unsubscribe
  saveSettings(s: Settings): Promise<void>
  watchPlan(month: string, cb: (p: MonthPlan | null) => void): Unsubscribe
  savePlan(month: string, p: MonthPlan): Promise<void>
  watchTransactions(month: string, cb: (t: Transaction[]) => void): Unsubscribe
  /** Transactions for an inclusive range of months, e.g. for balances and trends. */
  watchRange(from: string, to: string, cb: (t: Transaction[]) => void): Unsubscribe
  addTransaction(t: NewTransaction): Promise<void>
  /** Creates or replaces the transaction with this id. */
  updateTransaction(id: string, t: NewTransaction): Promise<void>
  deleteTransaction(id: string): Promise<void>
  /** Writes imported data; transactions keep their ids so a re-import replaces them. */
  importAll(data: ImportData): Promise<void>
  /** Deletes every transaction and plan, and resets settings. */
  clearAll(): Promise<void>
}
