import { currentMonth } from './month'
import type { MonthPlan, Settings } from './types'

// Where a new user starts: common Egyptian spending categories and two simple accounts.
// First-run setup (FirstRunSetup.tsx) replaces the accounts with the user's own, and everything
// here is editable in Settings.
export const DEFAULT_SETTINGS: Settings = {
  currency: 'EGP',
  categories: {
    expense: [
      'Food',
      'Bills & utilities',
      'Transportation',
      'Home',
      'Health/medical',
      'Personal',
      'Education',
      'Gifts',
      'Bank Fees',
      'A loan to someone',
      'Instalment',
      'Other',
    ],
    income: ['Salary', 'Other'],
  },
  accounts: [
    { name: 'Cash', type: 'cash' },
    { name: 'Bank', type: 'bank' },
  ],
  // Everyone adds their own lenders, in Settings or under Opening balances.
  debts: [],
  opening: { month: currentMonth(), accounts: {}, debts: {} },
  debtCategory: 'Instalment',
}

/** The same starting categories in Arabic, for someone who sets the app up in Arabic. */
export const ARABIC_CATEGORIES: Settings['categories'] = {
  expense: ['طعام', 'فواتير ومرافق', 'مواصلات', 'البيت', 'صحة وعلاج', 'شخصي', 'تعليم', 'هدايا', 'رسوم بنكية', 'سلفة لشخص', 'أقساط', 'أخرى'],
  income: ['الراتب', 'أخرى'],
}

/** Fills in fields added after a user first saved settings. */
export const withDefaults = (s: Partial<Settings> | undefined): Settings => ({ ...DEFAULT_SETTINGS, ...s })

export const emptyPlan = (): MonthPlan => ({ planned: { expense: {}, income: {} } })
