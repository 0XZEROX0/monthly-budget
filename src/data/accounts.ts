import type { Account, AccountType } from './types'

/** A sensible type for an account named on the fly; it can be changed in Settings. */
export const guessType = (name: string): AccountType =>
  /wallet|vodafone|orange|etisalat|e&|we ?pay|محفظ/i.test(name)
    ? 'wallet'
    : /cash|pocket/i.test(name)
      ? 'cash'
      : /invest|thndr|thandr|thunder|stock|fund|gold/i.test(name)
        ? 'investment'
        : 'bank'

export const ACCOUNT_TYPES: { id: AccountType; label: string }[] = [
  { id: 'cash', label: 'Cash' },
  { id: 'bank', label: 'Bank' },
  { id: 'wallet', label: 'E-wallet' },
  { id: 'investment', label: 'Investment' },
]

// Thndr gets spelled several ways (Static's other app says "Thandr").
const key = (name: string) => {
  const k = name.toLowerCase().replace(/[^a-z0-9؀-ۿ]/g, '')
  return /^(thndr|thandr|thunder|thndar)$/.test(k) ? 'thndr' : k
}

/** The existing account this name means, ignoring case, spaces and Thndr's spellings. */
export const findAccount = (accounts: Account[], name: string) => accounts.find((a) => key(a.name) === key(name))
