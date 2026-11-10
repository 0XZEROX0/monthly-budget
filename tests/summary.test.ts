import { describe, expect, it } from 'vitest'
import {
  balancesBefore,
  balancesThrough,
  budgetAlerts,
  capitalAt,
  countsAsIncome,
  countsAsSpending,
  effects,
  newestFirst,
  savedIn,
  spentIn,
  summarize,
} from '../src/data/summary'
import type { MonthPlan, Settings, Transaction, TxnKind } from '../src/data/types'

// A small budget worked out by hand. Cash and Bank are money to spend, Thndr is an investment.
const settings: Settings = {
  currency: 'EGP',
  categories: { expense: ['Food', 'Home', 'Instalment'], income: ['Salary', 'Other'] },
  accounts: [
    { name: 'Cash', type: 'cash' },
    { name: 'Bank', type: 'bank' },
    { name: 'Thndr', type: 'investment', interestPct: 5 },
  ],
  debts: [{ name: 'TRU', limit: 5000 }],
  opening: { month: '2026-09', accounts: { Cash: 500, Bank: 10000, Thndr: 2000 }, debts: { TRU: 1200 } },
  debtCategory: 'Instalment',
}

let n = 0
const txn = (kind: TxnKind, date: string, amount: number, more: Partial<Transaction> = {}): Transaction => ({
  id: `t${n++}`,
  kind,
  date,
  month: date.slice(0, 7),
  amount,
  description: '',
  category: '',
  ...more,
})

const september = [
  txn('income', '2026-09-01', 20000, { category: 'Salary', account: 'Bank' }),
  txn('expense', '2026-09-03', 1500.5, { category: 'Food', account: 'Cash' }),
  txn('transfer', '2026-09-05', 3000, { account: 'Bank', toAccount: 'Cash' }),
  txn('transfer', '2026-09-06', 4000, { account: 'Bank', toAccount: 'Thndr' }),
]
const october = [
  txn('income', '2026-10-01', 20000, { category: 'Salary', account: 'Bank' }),
  txn('expense', '2026-10-02', 2500, { category: 'Food', account: 'Bank' }),
  txn('expense', '2026-10-04', 800.25, { category: 'Home', account: 'Cash' }),
  txn('repay', '2026-10-05', 600, { account: 'Bank', debt: 'TRU' }),
  txn('borrow', '2026-10-10', 300, { debt: 'TRU' }),
  txn('adjust', '2026-10-12', 150, { account: 'Thndr' }),
  txn('expense', '2026-10-15', 1000, { category: 'Home', account: 'Bank', notSpending: true }),
  txn('income', '2026-10-16', 700, { category: 'Other', account: 'Cash', notSpending: true }),
]
const history = [...september, ...october]

describe('effects: how one entry moves balances', () => {
  const cases: [string, Transaction, Record<string, number>, Record<string, number>][] = [
    ['expense takes from its account', txn('expense', '2026-10-01', 40, { account: 'Cash' }), { Cash: -40 }, {}],
    ['income adds to its account', txn('income', '2026-10-01', 40, { account: 'Bank' }), { Bank: 40 }, {}],
    ['transfer moves between accounts', txn('transfer', '2026-10-01', 40, { account: 'Bank', toAccount: 'Thndr' }), { Bank: -40, Thndr: 40 }, {}],
    ['repay takes from the account and the debt', txn('repay', '2026-10-01', 40, { account: 'Bank', debt: 'TRU' }), { Bank: -40 }, { TRU: -40 }],
    ['borrow into an account grows both', txn('borrow', '2026-10-01', 40, { account: 'Bank', debt: 'TRU' }), { Bank: 40 }, { TRU: 40 }],
    ['borrow without an account grows only the debt', txn('borrow', '2026-10-01', 40, { debt: 'TRU' }), {}, { TRU: 40 }],
    ['adjust changes an account by a signed amount', txn('adjust', '2026-10-01', -40, { account: 'Thndr' }), { Thndr: -40 }, {}],
    ['adjust on a debt changes the debt only', txn('adjust', '2026-10-01', 40, { debt: 'TRU' }), {}, { TRU: 40 }],
    ['an entry without an account uses the first one', txn('expense', '2026-10-01', 40), { Cash: -40 }, {}],
  ]
  for (const [name, t, accounts, debts] of cases) it(name, () => expect(effects(t, settings)).toEqual({ accounts, debts }))
})

describe('balances', () => {
  it('start of the opening month is the opening balances', () => {
    expect(balancesBefore('2026-09', settings, history)).toEqual({ accounts: { Cash: 500, Bank: 10000, Thndr: 2000 }, debts: { TRU: 1200 } })
  })
  it('start of October adds September', () => {
    // Cash 500 - 1500.5 + 3000; Bank 10000 + 20000 - 3000 - 4000; Thndr 2000 + 4000
    expect(balancesBefore('2026-10', settings, history)).toEqual({ accounts: { Cash: 1999.5, Bank: 23000, Thndr: 6000 }, debts: { TRU: 1200 } })
  })
  it('entries from before the opening month are ignored', () => {
    const old = txn('expense', '2026-08-20', 999, { category: 'Food', account: 'Cash' })
    expect(balancesBefore('2026-10', settings, [old, ...history])).toEqual(balancesBefore('2026-10', settings, history))
  })
  it('through a date counts that day and nothing after', () => {
    // Through 5 Oct: Bank 23000 + 20000 - 2500 - 600; Cash 1999.5 - 800.25; debt 1200 - 600
    expect(balancesThrough('2026-10-05', settings, history)).toEqual({ accounts: { Cash: 1199.25, Bank: 39900, Thndr: 6000 }, debts: { TRU: 600 } })
  })
})

describe('what counts', () => {
  it('spending is expenses and repayments, unless marked not counted', () => {
    expect(october.filter(countsAsSpending).map((t) => t.amount)).toEqual([2500, 800.25, 600])
    expect(spentIn(october)).toBe(3900.25)
  })
  it('income leaves out entries marked not counted', () => {
    expect(october.filter(countsAsIncome).map((t) => t.amount)).toEqual([20000])
  })
  it('newest first: by date, then by time', () => {
    const a = txn('expense', '2026-10-02', 1, { time: '09:00' })
    const b = txn('expense', '2026-10-02', 1, { time: '21:30' })
    const c = txn('expense', '2026-10-03', 1)
    expect([a, b, c].sort(newestFirst)).toEqual([c, b, a])
  })
})

describe('saved in a month', () => {
  it('is income minus spending from money to spend', () => {
    // 20000 - 2500 - 800.25 - 600; the borrow has no account, the adjust is on an investment,
    // and the two entries marked not counted are left out.
    expect(savedIn(october, settings)).toBe(16099.75)
  })
  it('counts money moved into investments as saved, and between cash and bank as nothing', () => {
    // 20000 - 1500.5; neither transfer changes it.
    expect(savedIn(september, settings)).toBe(18499.5)
  })
  it('taking money back out of investments is not saving', () => {
    expect(savedIn([txn('transfer', '2026-10-01', 500, { account: 'Thndr', toAccount: 'Bank' })], settings)).toBe(0)
  })
})

describe('summarize: one month', () => {
  const plan: MonthPlan = { planned: { expense: { Food: 3000, Home: 1000, Instalment: 500 }, income: { Salary: 20000 } } }
  const s = summarize(plan, settings, october, balancesBefore('2026-10', settings, history))

  it('plans and actuals per category, repayments under the debt category', () => {
    expect(s.rows.expense).toEqual([
      { category: 'Food', planned: 3000, actual: 2500, diff: 500 },
      { category: 'Home', planned: 1000, actual: 800.25, diff: 199.75 },
      { category: 'Instalment', planned: 500, actual: 600, diff: -100 },
    ])
    expect(s.rows.income).toEqual([
      { category: 'Salary', planned: 20000, actual: 20000, diff: 0 },
      { category: 'Other', planned: 0, actual: 0, diff: 0 },
    ])
  })
  it('totals', () => {
    expect(s.planned).toEqual({ expense: 4500, income: 20000 })
    expect(s.actual).toEqual({ expense: 3900.25, income: 20000 })
    expect(s.debtPayments).toBe(600)
    // Repayments are already inside the Instalment row, so they aren't added twice.
    expect(s.spent).toBe(3900.25)
    expect(s.saved).toBe(16099.75)
    expect(s.savingsPct).toBeCloseTo(((20000 - 3900.25) / 20000) * 100, 10)
  })
  it('balances at the end, with entries marked not counted still moving their accounts', () => {
    // Cash 1999.5 - 800.25 + 700; Bank 23000 + 20000 - 2500 - 600 - 1000; Thndr 6000 + 150; debt 1200 - 600 + 300
    expect(s.end).toEqual({ accounts: { Cash: 1899.25, Bank: 38900, Thndr: 6150 }, debts: { TRU: 900 } })
    expect(s.liquidityStart).toBe(24999.5)
    expect(s.liquidityEnd).toBe(40799.25)
    expect(s.investments).toBe(6150)
    expect(s.interest).toBeCloseTo(307.5, 10)
    expect(s.capital).toBeCloseTo(40799.25 + 6150 + 307.5, 10)
  })
  it('repayments are added to spending when there is no debt category', () => {
    const noDebtRow = summarize(plan, { ...settings, debtCategory: undefined }, october, balancesBefore('2026-10', settings, history))
    expect(noDebtRow.actual.expense).toBe(3300.25)
    expect(noDebtRow.spent).toBe(3900.25)
  })
  it('a category no longer in settings still shows while it has entries', () => {
    const gone = summarize(plan, settings, [txn('expense', '2026-10-01', 75, { category: 'Gifts', account: 'Cash' })], balancesBefore('2026-10', settings, history))
    expect(gone.rows.expense.at(-1)).toEqual({ category: 'Gifts', planned: 0, actual: 75, diff: -75 })
  })
  it('no income means no savings rate', () => {
    expect(summarize(plan, settings, [], { accounts: {}, debts: {} }).savingsPct).toBeNull()
  })

  it('budget alerts at 80% and over', () => {
    expect(budgetAlerts(s, 80)).toEqual([
      { category: null, planned: 4500, actual: 3900.25, level: 'near' },
      { category: 'Food', planned: 3000, actual: 2500, level: 'near' },
      { category: 'Home', planned: 1000, actual: 800.25, level: 'near' },
      { category: 'Instalment', planned: 500, actual: 600, level: 'over' },
    ])
    expect(budgetAlerts(s, 90).map((a) => a.category)).toEqual(['Instalment'])
  })
})

describe('capitalAt: all accounts at the end of each day or month', () => {
  const total = (b: { accounts: Record<string, number> }) => settings.accounts.reduce((a, acc) => a + (b.accounts[acc.name] ?? 0), 0)
  it('by day matches adding up the history for each day', () => {
    const days = ['2026-08-31', '2026-09-01', '2026-09-05', '2026-09-30', '2026-10-05', '2026-10-12', '2026-10-31']
    expect(capitalAt(days, true, settings, history)).toEqual(days.map((d) => total(balancesThrough(d, settings, history))))
  })
  it('by month matches the balances at the start of the next month', () => {
    // Opening 12500. September +20000 -1500.5. October +20000 -2500 -800.25 -600 +150 -1000 +700.
    expect(capitalAt(['2026-09', '2026-10'], false, settings, history)).toEqual([30999.5, 46949.25])
    expect(capitalAt(['2026-09'], false, settings, history)[0]).toBe(total(balancesBefore('2026-10', settings, history)))
  })
  it('entries out of order give the same answer', () => {
    expect(capitalAt(['2026-09', '2026-10'], false, settings, [...history].reverse())).toEqual([30999.5, 46949.25])
  })
})
