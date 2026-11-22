import { describe, expect, it } from 'vitest'
import { checkBackup } from '../src/data/backup'

const good = { id: 'a', kind: 'expense', date: '2026-11-05', month: '2026-11', amount: 50, description: 'Lunch', category: 'Food' }

describe('checkBackup', () => {
  it('refuses files that are not a backup', () => {
    expect(checkBackup(null)).toBeNull()
    expect(checkBackup({ app: 'other', settings: {}, transactions: [] })).toBeNull()
    expect(checkBackup({ app: 'monthly-budget', settings: {}, transactions: {} })).toBeNull()
  })
  it('keeps valid entries and leaves out broken ones', () => {
    const r = checkBackup({
      app: 'monthly-budget',
      settings: {},
      transactions: [
        good,
        { ...good, id: 'b', amount: '50' },
        { ...good, id: 'c/d' },
        { ...good, id: 'e', date: '05/11/2026' },
        { ...good, id: 'f', kind: 'steal' },
        { ...good, id: 'g', amount: Infinity },
        { ...good, id: 'h', month: undefined },
        null,
      ],
    })!
    expect(r.data.transactions.map((t) => t.id)).toEqual(['a', 'h'])
    expect(r.data.transactions[1].month).toBe('2026-11')
    expect(r.dropped).toBe(6)
  })
  it('fills settings the file is missing and drops bad plan months', () => {
    const r = checkBackup({ app: 'monthly-budget', settings: { currency: 'egp!', categories: { expense: 'x' } }, transactions: [], plans: { 'bad/x': {}, '2026-11': { planned: { expense: { Food: 100, Bad: 'x' } } } } })!
    expect(Array.isArray(r.data.settings.categories.expense)).toBe(true)
    expect(r.data.settings.currency).toMatch(/^[A-Z]{3}$/)
    expect(Object.keys(r.data.plans)).toEqual(['2026-11'])
    expect(r.data.plans['2026-11'].planned.expense).toEqual({ Food: 100 })
  })
})
