import { currentMonth } from './month'
import type { MonthPlan, Settings } from './types'

// Matches Static's "Monthly budget" sheet. Everything here is editable in Settings.
export const DEFAULT_SETTINGS: Settings = {
  currency: 'EGP',
  categories: {
    expense: [
      'Food',
      'Gifts',
      'Health/medical',
      'Home',
      'Transportation',
      'Personal',
      'Bank Fees',
      'A loan to someone',
      'Other',
      'Car',
      'Instalment',
    ],
    income: ['Salary', 'Other'],
  },
  accounts: [
    { name: 'Cash', type: 'cash' },
    { name: 'Bank', type: 'bank' },
    { name: 'Thndr', type: 'investment', interestPct: 5.2 },
  ],
  debts: [
    { name: 'Debt', limit: 55000 },
    { name: 'Debt TRU', limit: 40000 },
    { name: 'Debt Valu', limit: 4000 },
  ],
  opening: { month: currentMonth(), accounts: {}, debts: {} },
}

/** Fills in fields added after a user first saved settings. */
export const withDefaults = (s: Partial<Settings> | undefined): Settings => ({ ...DEFAULT_SETTINGS, ...s })

export const emptyPlan = (): MonthPlan => ({ planned: { expense: {}, income: {} } })
