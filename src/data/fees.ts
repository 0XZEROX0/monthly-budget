// Transfer fees charged on top of what you send. Each fee is saved as its own expense
// from the same account, so the account balance and the spending both include it.
import type { ParsedSms } from './smsParser'
import type { FeeTemplate, NewTransaction, Settings, Transaction } from './types'

/** 'none', 'custom' (typed in), or the id of a fee template. */
export type FeeKind = string

/** The fees every account gets; the user's own templates are added after these. */
export const BUILT_IN_FEES: FeeTemplate[] = [
  { id: 'instapay', name: 'InstaPay', pct: 0.1, min: 0.5, max: 20 },
  { id: 'wallet', name: 'E-wallet', pct: 1 },
]

export const feeTemplates = (settings: Settings) => [...BUILT_IN_FEES, ...(settings.feeTemplates ?? [])]

const round2 = (n: number) => Math.round(n * 100) / 100
const num = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 })

/** How a template works it out, like "0.1%, at least 0.5 and at most 20". */
export function feeHint(t: FeeTemplate): string {
  const limits = [t.min != null && `at least ${num(t.min)}`, t.max != null && `at most ${num(t.max)}`].filter(Boolean)
  return `${num(t.pct)}%${limits.length ? `, ${limits.join(' and ')}` : ''}`
}

/** The fee for sending `amount` with a template. */
export function feeFor(t: FeeTemplate | undefined, amount: number): number {
  if (!t || !(amount > 0)) return 0
  let fee = (amount * t.pct) / 100
  if (t.min != null) fee = Math.max(t.min, fee)
  if (t.max != null) fee = Math.min(t.max, fee)
  return round2(fee)
}

/** The usual fee for an account, from its name: one of the user's templates it's named after, InstaPay, or a mobile wallet. */
export function defaultFee(account: string, templates: FeeTemplate[] = []): FeeKind {
  const own = templates.find((t) => t.name.trim() && account.toLowerCase().includes(t.name.trim().toLowerCase()))
  if (own) return own.id
  if (/insta/i.test(account)) return 'instapay'
  if (/wallet|orange|vodafone|etisalat|e&|we ?pay|محفظ/i.test(account)) return 'wallet'
  return 'none'
}

/** The expense category fees go to: one already about fees if there is one, otherwise Bank Fees. */
export const feeCategory = (categories: string[]) => categories.find((c) => /fee|عمول|رسوم/i.test(c)) ?? 'Bank Fees'

/**
 * The fee to start the add form on: the one the message states, else for money sent out,
 * the account's usual fee or InstaPay's for an instant transfer. Purchases get none.
 */
export function smsFee(p: ParsedSms, account: string, settings: Settings): { fee: FeeKind; amount?: number } {
  if (p.direction !== 'spend') return { fee: 'none' }
  if (p.fee) return { fee: 'custom', amount: p.fee }
  if (!p.transfer && !p.instant) return { fee: 'none' }
  const usual = defaultFee(account, settings.feeTemplates)
  return { fee: usual !== 'none' ? usual : p.instant || p.wallet === 'InstaPay' ? 'instapay' : 'none' }
}

/** The id a fee is saved under: next to the entry it belongs to, so the two can be found together. */
export const feeIdFor = (id: string) => `${id}-fee`

/**
 * A fee entry after the entry it belongs to was edited: it keeps its own amount and note,
 * and follows the date, time, month and account. Null when nothing about it changes.
 */
export function feeFollowing(fee: Transaction, main: NewTransaction): NewTransaction | null {
  const { id: _id, ...rest } = fee
  const next: NewTransaction = { ...rest, date: main.date, month: main.month ?? main.date.slice(0, 7), account: main.account ?? fee.account }
  if (main.time) next.time = main.time
  else delete next.time
  const same = next.date === fee.date && next.month === fee.month && next.account === fee.account && next.time === fee.time
  return same ? null : next
}
