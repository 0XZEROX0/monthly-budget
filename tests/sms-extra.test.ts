import { describe, expect, it } from 'vitest'
import { draftFor } from '../src/data/bankSms'
import { withDefaults } from '../src/data/defaults'
import { convert, getRates, invert } from '../src/data/rates'
import { dropDuplicates } from '../src/data/smsMatch'
import type { ParsedSms } from '../src/data/smsParser'

const MIN = 60_000
const sms = (smsId: string, sender: string, amount: number, at: number, body = smsId, currency = 'EGP'): ParsedSms =>
  ({ smsId, sender, direction: 'spend', transfer: false, amount, currency, merchant: 'NETFLIX.COM', card: '2244', date: '2026-11-05', at, body })

describe('dropDuplicates', () => {
  it('keeps one message when the bank and InstaPay both report a payment', () => {
    const kept = dropDuplicates([sms('a', 'CIB', 500, 0), sms('b', 'InstaPay', 500, 2 * MIN)])
    expect(kept.map((p) => p.smsId)).toEqual(['a'])
  })
  it('drops the same SMS delivered twice', () => {
    expect(dropDuplicates([sms('a', 'CIB', 50, 0, 'x'), sms('b', 'CIB', 50, MIN, 'x')]).map((p) => p.smsId)).toEqual(['a'])
  })
  it('keeps two real payments of the same amount from the same bank', () => {
    expect(dropDuplicates([sms('a', 'CIB', 50, 0, 'coffee 1'), sms('b', 'CIB', 50, MIN, 'coffee 2')])).toHaveLength(2)
  })
  it('keeps messages far apart in time or for other amounts', () => {
    expect(dropDuplicates([sms('a', 'CIB', 500, 0), sms('b', 'InstaPay', 500, 30 * MIN), sms('c', 'InstaPay', 501, MIN)])).toHaveLength(3)
  })
})

describe('foreign currency SMS', () => {
  const settings = withDefaults({ accounts: [{ name: 'Bank', type: 'bank' }] })
  it('converts at the rate given', () => {
    const t = draftFor(sms('a', 'CIB', 9.99, 0, 'x', 'USD'), settings, { USD: 50 })
    expect(t.amount).toBe(499.5)
    expect(t.description).toContain('USD 9.99')
  })
  it('leaves the amount empty without a rate, instead of using the foreign figure', () => {
    expect(draftFor(sms('a', 'CIB', 9.99, 0, 'x', 'USD'), settings, {}).amount).toBe(0)
  })
  it('turns the API answer into rates into the base currency', () => {
    expect(invert({ USD: 0.02, EUR: 'x', bad: 1, ZZZ: 0 })).toEqual({ USD: 50 })
    expect(convert(10, 'USD', { USD: 50 })).toBe(500)
    expect(convert(10, 'GBP', { USD: 50 })).toBeNull()
  })
  it('fetches, keeps and falls back to saved rates', async () => {
    const store = new Map<string, string>()
    Object.assign(globalThis, { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } })
    let calls = 0
    const ok = (async () => {
      calls++
      return new Response(JSON.stringify({ result: 'success', rates: { USD: 0.02 } }))
    }) as typeof fetch
    expect(await getRates('EGP', 0, ok)).toEqual({ USD: 50 })
    expect(await getRates('EGP', 1000, ok)).toEqual({ USD: 50 })
    expect(calls).toBe(1)
    const down = (async () => {
      throw new Error('offline')
    }) as typeof fetch
    expect(await getRates('EGP', 13 * 3600_000, down)).toEqual({ USD: 50 })
  })
})
