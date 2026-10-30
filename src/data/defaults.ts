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
  // Everyone adds their own lenders, in Settings or under Opening balances.
  debts: [],
  opening: { month: currentMonth(), accounts: {}, debts: {} },
  debtCategory: 'Instalment',
}

/** Fills in fields added after a user first saved settings. */
export const withDefaults = (s: Partial<Settings> | undefined): Settings => ({ ...DEFAULT_SETTINGS, ...s })

export const emptyPlan = (): MonthPlan => ({ planned: { expense: {}, income: {} } })
