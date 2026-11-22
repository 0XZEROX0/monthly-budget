import { describe, expect, it } from 'vitest'
import { savedFromSms, smsTxnId } from '../src/data/bankSms'
import type { ParsedSms } from '../src/data/smsParser'
import type { Transaction } from '../src/data/types'

const sms = (smsId: string, date: string): ParsedSms =>
  ({ smsId, sender: 'CIB', direction: 'spend', transfer: false, amount: 100, currency: 'EGP', merchant: '', card: '2244', date, at: 0, body: '' })
const txn = (id: string, date: string): Transaction => ({ id, kind: 'expense', amount: 100, date, month: date.slice(0, 7), description: '', category: '' })
const byId = (...t: Transaction[]) => new Map(t.map((x) => [x.id, x]))

describe('SMS entry ids', () => {
  it('include the day, so a repeated inbox id on a new phone does not overwrite an old entry', () => {
    expect(smsTxnId(sms('123', '2026-11-05'))).toBe('sms-123-20261105')
    expect(smsTxnId(sms('123', '2026-11-05'))).not.toBe(smsTxnId(sms('123', '2025-03-01')))
  })
  it('treats a message as saved under its own id', () => {
    expect(savedFromSms(sms('5', '2026-11-05'), byId(txn('sms-5-20261105', '2026-11-05')))).toBe(true)
  })
  it('still recognises entries saved under the old bare id, when the dates are close', () => {
    expect(savedFromSms(sms('5', '2026-11-05'), byId(txn('sms-5', '2026-11-03')))).toBe(true)
    // The same inbox id months later is a different message.
    expect(savedFromSms(sms('5', '2026-11-05'), byId(txn('sms-5', '2026-06-01')))).toBe(false)
  })
})
