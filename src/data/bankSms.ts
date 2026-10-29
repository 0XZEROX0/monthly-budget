import { App } from '@capacitor/app'
import type { PermissionState } from '@capacitor/core'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { SmsReader, smsAvailable } from '../native/smsReader'
import { bankName, KNOWN_BANK_SENDERS, senderKey } from './egyptBanks'
import { shiftMonth, today } from './month'
import { parseBankSms, type ParsedSms, type SmsMessage } from './smsParser'
import { alreadyRecorded } from './smsMatch'
import type { Backend, NewTransaction, Settings, SmsSettings, SmsTarget, Transaction } from './types'

export const smsTxnId = (p: ParsedSms) => `sms-${p.smsId}`

export const smsSettings = (s: Settings): SmsSettings => ({ senders: [], cards: {}, merchants: {}, since: today(), ...s.sms })

/** For cards with nothing saved: the chosen default, else the first bank account. */
export function defaultTarget(settings: Settings): SmsTarget {
  const bank = settings.accounts.find((a) => a.type === 'bank') ?? settings.accounts[0]
  return settings.sms?.defaultTarget ?? `account:${bank?.name ?? 'Bank'}`
}

/** Where a card's (or account's) money goes. */
export const targetFor = (card: string, settings: Settings): SmsTarget => settings.sms?.cards[card] ?? defaultTarget(settings)

export const splitTarget = (t: SmsTarget) => {
  const i = t.indexOf(':')
  return { type: t.slice(0, i) as 'account' | 'debt', name: t.slice(i + 1) }
}

export const describe = (p: ParsedSms) =>
  p.merchant || (p.transfer ? (p.direction === 'credit' ? 'Transfer in' : 'Transfer out') : p.sender)

/** A transaction to review in the form. Category is left empty unless this merchant has one saved. */
export function draftFor(p: ParsedSms, settings: Settings): NewTransaction {
  const target = splitTarget(targetFor(p.card, settings))
  const category = smsSettings(settings).merchants[describe(p).toLowerCase()] ?? ''
  const foreign = p.currency !== settings.currency ? ` (${p.currency} ${p.amount})` : ''
  const base = { amount: p.amount, date: p.date, description: describe(p) + foreign, category }
  if (target.type === 'debt') {
    // A credit card is a debt: spending grows it, money coming back pays it down.
    const bank = settings.accounts.find((a) => a.type === 'bank')?.name
    return p.direction === 'spend' ? { ...base, kind: 'borrow', debt: target.name } : { ...base, kind: 'repay', debt: target.name, account: bank }
  }
  return { ...base, kind: p.direction === 'spend' ? 'expense' : 'income', account: target.name }
}

// Skipped messages are remembered on this phone only, since the SMS live here too.
const SKIPPED_KEY = 'budget.sms.skipped'
const loadSkipped = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(SKIPPED_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

export interface BankSms {
  available: boolean
  permission: PermissionState | 'unknown'
  requestPermission: () => Promise<void>
  /** Every sender with at least one card message since the start date. */
  detectedSenders: string[]
  /** Whether messages from this sender are read: known banks and senders turned on, minus those turned off. */
  isWatched: (sender: string) => boolean
  /** Messages from the chosen senders that aren't added or skipped yet, newest first. */
  pending: ParsedSms[]
  skip: (p: ParsedSms) => void
  refresh: () => void
  error: string
}

export function useBankSms(backend: Backend, settings: Settings | null): BankSms {
  const [permission, setPermission] = useState<BankSms['permission']>('unknown')
  const [messages, setMessages] = useState<SmsMessage[]>([])
  const [skipped, setSkipped] = useState(loadSkipped)
  const [txns, setTxns] = useState<Transaction[]>([])
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)
  const refresh = useCallback(() => setTick((t) => t + 1), [])

  const sms = settings ? smsSettings(settings) : null
  const since = sms?.since ?? today()

  useEffect(() => {
    if (!smsAvailable) return
    let stop = false
    SmsReader.checkPermissions()
      .then(async (p) => {
        if (stop) return
        setPermission(p.sms)
        if (p.sms !== 'granted') return
        const res = await SmsReader.list({ since: new Date(since + 'T00:00').getTime() })
        if (!stop) setMessages(res.messages)
      })
      .catch((e: Error) => setError(e.message))
    return () => {
      stop = true
    }
  }, [since, tick])

  // Look again whenever the app comes back to the front or a new SMS arrives.
  useEffect(() => {
    if (!smsAvailable) return
    const handles = [App.addListener('resume', refresh), SmsReader.addListener('smsReceived', refresh)]
    return () => handles.forEach((h) => h.then((x) => x.remove()))
  }, [refresh])

  // Entries since the start date (and the month before, for dates a few days apart), so
  // messages already added, or entered another way, aren't offered again.
  useEffect(() => {
    if (!smsAvailable) return
    return backend.watchRange(shiftMonth(since.slice(0, 7), -1), '9999-12', setTxns)
  }, [backend, since])

  const parsed = useMemo(() => messages.map(parseBankSms).filter((p): p is ParsedSms => p !== null), [messages])
  const detectedSenders = useMemo(() => [...new Set(parsed.map((p) => p.sender))].sort(), [parsed])
  const on = (sms?.senders ?? []).map(senderKey).join('\n')
  const off = (sms?.excluded ?? []).map(senderKey).join('\n')
  const isWatched = useCallback(
    (sender: string) => {
      const k = senderKey(sender)
      return !off.split('\n').includes(k) && (bankName(sender) !== null || on.split('\n').includes(k))
    },
    [on, off],
  )

  // The phone matches senders the same way, to notify about new bank messages while the app is closed.
  useEffect(() => {
    if (!smsAvailable || permission !== 'granted') return
    const offList = off.split('\n')
    const watched = [...KNOWN_BANK_SENDERS, ...on.split('\n')].filter((k) => k && !offList.includes(k))
    SmsReader.setWatchedSenders({ senders: watched }).catch(() => {})
  }, [on, off, permission])

  const pending = useMemo(() => {
    const ids = new Set(txns.map((t) => t.id))
    const fresh = parsed.filter((p) => isWatched(p.sender) && !skipped.has(p.smsId) && !ids.has(smsTxnId(p)))
    // Entries saved from SMS already matched their own message by id, so they can't match another.
    const recorded = alreadyRecorded(fresh, txns.filter((t) => !t.id.startsWith('sms-')))
    return fresh.filter((p) => !recorded.has(p.smsId))
  }, [parsed, isWatched, skipped, txns])

  const skip = (p: ParsedSms) => {
    const next = new Set(skipped).add(p.smsId)
    setSkipped(next)
    try {
      localStorage.setItem(SKIPPED_KEY, JSON.stringify([...next]))
    } catch {
      // Storage unavailable: the skip lasts until the app restarts.
    }
  }

  const requestPermission = async () => {
    try {
      const p = await SmsReader.requestPermissions({ permissions: ['sms', 'notifications'] })
      setPermission(p.sms)
      // The first time, offer the last week only, so months already entered by hand don't come back as pending.
      if (p.sms === 'granted' && settings && !settings.sms) {
        const d = new Date()
        d.setDate(d.getDate() - 7)
        const weekAgo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        await backend.saveSettings({ ...settings, sms: { ...smsSettings(settings), since: weekAgo } })
      }
      refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return { available: smsAvailable, permission, requestPermission, detectedSenders, isWatched, pending, skip, refresh, error }
}
