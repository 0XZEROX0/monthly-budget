import { describe, expect, it } from 'vitest'
import { billStatus, billTxnId, dueDay, isPaid, ordinal, paymentFor, reminderDays } from '../src/data/bills'
import { defaultFee, feeCategory, feeFollowing, feeFor, feeIdFor } from '../src/data/fees'
import { goalProgress } from '../src/data/goals'
import { settingsChanges } from '../src/data/settingsDiff'
import { alreadyRecorded } from '../src/data/smsMatch'
import type { ParsedSms } from '../src/data/smsParser'
import type { Bill, Settings, Transaction } from '../src/data/types'

const settings: Settings = {
  currency: 'EGP',
  categories: { expense: ['Food', 'Bank Fees'], income: ['Salary'] },
  accounts: [
    { name: 'Thndr', type: 'investment' },
    { name: 'Bank', type: 'bank' },
  ],
  debts: [{ name: 'Debt TRU', limit: 0 }],
  opening: { month: '2026-01', accounts: {}, debts: {} },
}
const tru: Bill = { id: 'b1', name: 'TRU', type: 'instalment', amount: 750, day: 1, windowDays: 5, debt: 'Debt TRU' }
const card: Bill = { id: 'b2', name: 'CIB card', type: 'card', amount: 0, day: 31, windowDays: 1, category: 'Food' }
const txn = (more: Partial<Transaction>): Transaction => ({ id: 'x', kind: 'expense', date: '2026-11-03', month: '2026-11', amount: 1, description: '', category: '', ...more })

describe('bills', () => {
  it('due day moves to the last day of a short month', () => {
    expect(dueDay(card, '2026-02')).toBe(28)
    expect(dueDay(card, '2026-04')).toBe(30)
    expect(dueDay(card, '2026-12')).toBe(31)
    expect(dueDay({ ...card, day: 0 }, '2026-12')).toBe(1)
  })
  it('reminder days: the due day and the days after, inside the month', () => {
    expect(reminderDays(tru, '2026-11')).toEqual([1, 2, 3, 4, 5])
    expect(reminderDays(card, '2026-02')).toEqual([28])
    expect(reminderDays({ ...tru, day: 29 }, '2026-11')).toEqual([29, 30])
    expect(reminderDays({ ...tru, windowDays: 0 }, '2026-11')).toEqual([1])
  })
  it('paid by its own entry, or by any repayment to its debt that month', () => {
    expect(isPaid(tru, '2026-11', [])).toBe(false)
    expect(isPaid(tru, '2026-11', [txn({ id: billTxnId(tru, '2026-11') })])).toBe(true)
    expect(isPaid(tru, '2026-11', [txn({ kind: 'repay', debt: 'Debt TRU' })])).toBe(true)
    expect(isPaid(tru, '2026-11', [txn({ kind: 'repay', debt: 'Debt TRU', month: '2026-10' })])).toBe(false)
    expect(isPaid(tru, '2026-11', [txn({ kind: 'repay', debt: 'Debt Valu' })])).toBe(false)
    expect(isPaid(card, '2026-11', [txn({ kind: 'repay', debt: 'Debt TRU' })])).toBe(false)
  })
  it('status follows the reminder days', () => {
    expect(billStatus({ ...tru, day: 10 }, '2026-11', [], '2026-11-09')).toBe('upcoming')
    expect(billStatus({ ...tru, day: 10 }, '2026-11', [], '2026-11-10')).toBe('due')
    expect(billStatus({ ...tru, day: 10 }, '2026-11', [], '2026-11-14')).toBe('due')
    expect(billStatus({ ...tru, day: 10 }, '2026-11', [], '2026-11-15')).toBe('late')
    expect(billStatus(tru, '2026-12', [], '2026-11-15')).toBe('upcoming')
    expect(billStatus(tru, '2026-10', [], '2026-11-15')).toBe('late')
    expect(billStatus(tru, '2026-11', [txn({ id: 'bill-b1-2026-11' })], '2026-11-15')).toBe('paid')
  })
  it('paying: a repayment for a debt bill, an expense otherwise, from a spendable account', () => {
    expect(paymentFor(tru, '2026-10', settings, 750)).toEqual({ kind: 'repay', amount: 750, date: '2026-10-01', month: '2026-10', description: 'TRU instalment', category: '', account: 'Bank', debt: 'Debt TRU' })
    expect(paymentFor(card, '2026-02', settings, 1234.5)).toEqual({ kind: 'expense', amount: 1234.5, date: '2026-02-28', month: '2026-02', description: 'CIB card payment', category: 'Food', account: 'Bank' })
  })
  it('ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '31st'])
  })
})

describe('savings goals', () => {
  const balances = { accounts: { Bank: 3000, Thndr: 1000 }, debts: {} }
  it('adds up its accounts against the target', () => {
    expect(goalProgress({ id: 'g', name: 'Car', accounts: ['Bank', 'Thndr'], target: 10000 }, balances, '2026-11-10')).toEqual({ saved: 4000, pct: 40, left: 6000, monthsLeft: null, perMonth: null, daysLeft: null })
  })
  it('with a deadline: months left count this one, and what is needed each month', () => {
    const p = goalProgress({ id: 'g', name: 'Car', accounts: ['Bank', 'Thndr'], target: 10000, deadline: '2027-01-31' }, balances, '2026-11-10')
    expect(p.monthsLeft).toBe(3)
    expect(p.perMonth).toBe(2000)
    expect(p.daysLeft).toBe(82)
  })
  it('reached, and past its deadline', () => {
    expect(goalProgress({ id: 'g', name: 'Car', accounts: ['Bank'], target: 2000 }, balances).pct).toBe(100)
    expect(goalProgress({ id: 'g', name: 'Car', accounts: ['Bank'], target: 2000 }, balances).left).toBe(0)
    const late = goalProgress({ id: 'g', name: 'Car', accounts: ['Bank'], target: 9000, deadline: '2026-10-31' }, balances, '2026-11-10')
    expect(late.monthsLeft).toBe(0)
    expect(late.perMonth).toBeNull()
    expect(late.daysLeft).toBe(-10)
  })
  it('a target of zero or a negative balance never divides by zero or goes below 0%', () => {
    expect(goalProgress({ id: 'g', name: 'x', accounts: ['Bank'], target: 0 }, balances).pct).toBe(0)
    expect(goalProgress({ id: 'g', name: 'x', accounts: ['Bank'], target: 100 }, { accounts: { Bank: -50 }, debts: {} }).pct).toBe(0)
  })
})

describe('fees', () => {
  const instapay = { id: 'instapay', name: 'InstaPay', pct: 0.1, min: 0.5, max: 20 }
  it('InstaPay: 0.1%, at least 0.5 and at most 20', () => {
    expect(feeFor(instapay, 100)).toBe(0.5)
    expect(feeFor(instapay, 500)).toBe(0.5)
    expect(feeFor(instapay, 1010)).toBe(1.01)
    expect(feeFor(instapay, 12345)).toBe(12.35)
    expect(feeFor(instapay, 20000)).toBe(20)
    expect(feeFor(instapay, 70000)).toBe(20)
  })
  it('a plain percentage, and nothing for no amount or no template', () => {
    expect(feeFor({ id: 'wallet', name: 'E-wallet', pct: 1 }, 250)).toBe(2.5)
    expect(feeFor({ id: 'wallet', name: 'E-wallet', pct: 1 }, 0)).toBe(0)
    expect(feeFor({ id: 'wallet', name: 'E-wallet', pct: 1 }, NaN)).toBe(0)
    expect(feeFor(undefined, 250)).toBe(0)
  })
  it('the usual fee comes from the account name', () => {
    expect(defaultFee('Instapay')).toBe('instapay')
    expect(defaultFee('Orange Cash')).toBe('wallet')
    expect(defaultFee('Bank')).toBe('none')
    expect(defaultFee('CIB transfer', [{ id: 'mine', name: 'cib', pct: 0.2 }])).toBe('mine')
  })
  it('fees go to a category about fees', () => {
    expect(feeCategory(['Food', 'Bank Fees'])).toBe('Bank Fees')
    expect(feeCategory(['Food', 'رسوم بنكية'])).toBe('رسوم بنكية')
    expect(feeCategory(['Food'])).toBe('Bank Fees')
  })
  it('a fee follows its entry when the date, time or account changes, keeping its own amount', () => {
    const fee = txn({ id: feeIdFor('abc'), amount: 0.5, category: 'Bank Fees', account: 'Bank', time: '09:15', description: 'InstaPay fee' })
    expect(fee.id).toBe('abc-fee')
    const main = { kind: 'transfer' as const, amount: 500, date: '2026-11-03', time: '09:15', description: '', category: '', account: 'Bank', toAccount: 'Thndr' }
    expect(feeFollowing(fee, main)).toBeNull()
    expect(feeFollowing(fee, { ...main, date: '2026-12-01', time: '18:00', account: 'Cash' })).toEqual({ kind: 'expense', amount: 0.5, date: '2026-12-01', month: '2026-12', time: '18:00', description: 'InstaPay fee', category: 'Bank Fees', account: 'Cash' })
    // An entry kept in another month than its date keeps its fee there too.
    expect(feeFollowing(fee, { ...main, date: '2026-10-31', month: '2026-11' })?.month).toBe('2026-11')
  })
})

describe('settings saved field by field', () => {
  it('only what changed is written', () => {
    const next = { ...settings, currency: 'USD', categories: { ...settings.categories, expense: ['Food', 'Bank Fees', 'Car'] } }
    expect(settingsChanges(settings, next)).toEqual({ set: { currency: 'USD', categories: next.categories }, remove: [] })
  })
  it('nothing changed means nothing to write, whatever the key order', () => {
    const copy = JSON.parse(JSON.stringify(settings)) as Settings
    const reordered = { ...copy, opening: { debts: {}, accounts: {}, month: '2026-01' } }
    expect(settingsChanges(settings, reordered)).toEqual({ set: {}, remove: [] })
  })
  it('a field taken away is removed, a new one is added', () => {
    const before: Settings = { ...settings, debtCategory: 'Food', clock12: true }
    const after: Settings = { ...settings, clock12: true, decimals: true, debtCategory: undefined }
    expect(settingsChanges(before, after)).toEqual({ set: { decimals: true }, remove: ['debtCategory'] })
  })
  it('a change deep inside a field rewrites that field only', () => {
    const before: Settings = { ...settings, icons: { Food: '🍔' }, sms: { senders: [], cards: { '4275': 'account:Bank' }, merchants: {}, since: '2026-11-01' } }
    const after: Settings = { ...before, sms: { ...before.sms!, merchants: { carrefour: 'Food' } } }
    expect(settingsChanges(before, after)).toEqual({ set: { sms: after.sms }, remove: [] })
  })
})

describe('bank SMS already in the budget', () => {
  const sms = (smsId: string, date: string, amount: number, direction: 'spend' | 'credit' = 'spend') => ({ smsId, date, amount, direction, currency: 'EGP' }) as ParsedSms
  it('matches the same amount within three days, once per entry, closest date first', () => {
    const txns = [txn({ id: 'a', amount: 100, date: '2026-11-03' }), txn({ id: 'b', amount: 100, date: '2026-11-06' })]
    expect([...alreadyRecorded([sms('1', '2026-11-05', 100)], txns)]).toEqual(['1'])
    expect([...alreadyRecorded([sms('1', '2026-11-05', 100), sms('2', '2026-11-05', 100), sms('3', '2026-11-05', 100)], txns)]).toEqual(['1', '2'])
    expect(alreadyRecorded([sms('1', '2026-11-10', 100)], txns).size).toBe(0)
    expect(alreadyRecorded([sms('1', '2026-11-03', 100.5)], txns).size).toBe(0)
  })
  it('money in does not match an expense', () => {
    expect(alreadyRecorded([sms('1', '2026-11-03', 100, 'credit')], [txn({ id: 'a', amount: 100 })]).size).toBe(0)
    expect(alreadyRecorded([sms('1', '2026-11-03', 100, 'credit')], [txn({ id: 'a', amount: 100, kind: 'income' })]).size).toBe(1)
  })
})
