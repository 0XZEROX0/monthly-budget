import type { MonthPlan, Settings } from './types'

// Categories from Google Sheets' "Monthly budget" template. Edit them in Settings.
export const DEFAULT_SETTINGS: Settings = {
  currency: 'USD',
  categories: {
    expense: [
      'Food',
      'Gifts',
      'Health/medical',
      'Home',
      'Transportation',
      'Personal',
      'Pets',
      'Utilities',
      'Travel',
      'Debt',
      'Other',
    ],
    income: ['Savings', 'Paycheck', 'Bonus', 'Interest', 'Other'],
  },
}

export const emptyPlan = (): MonthPlan => ({
  startingBalance: 0,
  planned: { expense: {}, income: {} },
})
