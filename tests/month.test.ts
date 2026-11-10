import { describe, expect, it } from 'vitest'
import { daysInMonth, parseAmount, shiftDay, shiftMonth, showTime } from '../src/data/month'

describe('dates', () => {
  it('shiftMonth crosses years both ways', () => {
    expect(shiftMonth('2026-11', 1)).toBe('2026-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-03', -5)).toBe('2025-10')
    expect(shiftMonth('2026-03', 22)).toBe('2028-01')
  })
  it('shiftDay crosses months, years and leap days', () => {
    expect(shiftDay('2026-11-01', -1)).toBe('2026-10-31')
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01')
    expect(shiftDay('2028-02-28', 1)).toBe('2028-02-29')
    expect(shiftDay('2026-02-28', 1)).toBe('2026-03-01')
    expect(shiftDay('2026-03-10', -30)).toBe('2026-02-08')
  })
  it('daysInMonth', () => {
    expect(daysInMonth('2026-02')).toBe(28)
    expect(daysInMonth('2028-02')).toBe(29)
    expect(daysInMonth('2026-04')).toBe(30)
    expect(daysInMonth('2026-12')).toBe(31)
  })
  it('showTime on a 12-hour clock', () => {
    expect(showTime('20:30')).toBe('20:30')
    expect(showTime('00:05', true)).toBe('12:05 AM')
    expect(showTime('12:00', true)).toBe('12:00 PM')
    expect(showTime('20:30', true)).toBe('8:30 PM')
  })
})

describe('parseAmount: what the amount boxes accept', () => {
  const ok: [string, number][] = [
    ['250', 250],
    ['99.50', 99.5],
    ['99,5', 99.5],
    [' 1 250 ', 1250],
    ['١٢٣٫٥', 123.5],
    ['١٢٣', 123],
    ['۴۵۶', 456],
    ['١٬٢٥٠', 1250],
    ['-40', -40],
    ['0', 0],
  ]
  for (const [text, value] of ok) it(`"${text}" is ${value}`, () => expect(parseAmount(text)).toBe(value))
  for (const text of ['', '   ', 'abc', '1,234.5', '12..5', '5 EGP']) it(`"${text}" is not a number`, () => expect(parseAmount(text)).toBeNaN())
})
