// Transfer fees charged on top of what you send. Each fee is saved as its own expense
// from the same account, so the account balance and the spending both include it.

export type FeeKind = 'none' | 'instapay' | 'wallet' | 'custom'

export const FEES: { id: FeeKind; label: string; hint: string }[] = [
  { id: 'none', label: 'No fee', hint: '' },
  { id: 'instapay', label: 'InstaPay', hint: '0.1%, at least 0.5 and at most 20' },
  { id: 'wallet', label: 'E-wallet', hint: '1%' },
  { id: 'custom', label: 'Other', hint: 'Type the fee' },
]

const round2 = (n: number) => Math.round(n * 100) / 100

/** The fee for sending `amount`; custom fees are typed in, so they're not computed here. */
export function feeFor(kind: FeeKind, amount: number): number {
  if (!(amount > 0)) return 0
  if (kind === 'instapay') return round2(Math.min(20, Math.max(0.5, amount * 0.001)))
  if (kind === 'wallet') return round2(amount * 0.01)
  return 0
}

/** The usual fee for an account, from its name: InstaPay, or a mobile wallet like Vodafone Cash or OrangeCash. */
export function defaultFee(account: string): FeeKind {
  if (/insta/i.test(account)) return 'instapay'
  if (/wallet|orange|vodafone|etisalat|e&|we ?pay|محفظ/i.test(account)) return 'wallet'
  return 'none'
}

/** The expense category fees go to: one already about fees if there is one, otherwise Bank Fees. */
export const feeCategory = (categories: string[]) => categories.find((c) => /fee|عمول|رسوم/i.test(c)) ?? 'Bank Fees'
