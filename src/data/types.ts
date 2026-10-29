export type Kind = 'expense' | 'income'

export interface Transaction {
  id: string
  kind: Kind
  /** ISO date, YYYY-MM-DD */
  date: string
  /** YYYY-MM, derived from date; used to query a month */
  month: string
  amount: number
  description: string
  category: string
}

export type NewTransaction = Omit<Transaction, 'id' | 'month'>

/** The plan for one month: starting balance and planned amount per category. */
export interface MonthPlan {
  startingBalance: number
  planned: Record<Kind, Record<string, number>>
}

export interface Settings {
  currency: string
  categories: Record<Kind, string[]>
}

export type Unsubscribe = () => void

export interface Backend {
  /** 'local' keeps data in this browser only; 'cloud' syncs through Firestore. */
  mode: 'local' | 'cloud'
  watchSettings(cb: (s: Settings) => void): Unsubscribe
  saveSettings(s: Settings): Promise<void>
  watchPlan(month: string, cb: (p: MonthPlan | null) => void): Unsubscribe
  savePlan(month: string, p: MonthPlan): Promise<void>
  watchTransactions(month: string, cb: (t: Transaction[]) => void): Unsubscribe
  addTransaction(t: NewTransaction): Promise<void>
  updateTransaction(id: string, t: NewTransaction): Promise<void>
  deleteTransaction(id: string): Promise<void>
}
