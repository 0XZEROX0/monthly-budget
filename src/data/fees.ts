// Transfer fees charged on top of what you send. Each fee is saved as its own expense
// from the same account, so the account balance and the spending both include it.
import type { FeeTemplate, Settings } from './types'

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
