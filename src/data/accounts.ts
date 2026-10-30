import type { Account, AccountType } from './types'

/** A sensible type for an account named on the fly; it can be changed in Settings. */
export const guessType = (name: string): AccountType =>
  /cash|wallet|pocket/i.test(name) ? 'cash' : /invest|thndr|thandr|thunder|stock|fund|gold/i.test(name) ? 'investment' : 'bank'

// Thndr gets spelled several ways (Static's other app says "Thandr").
const key = (name: string) => {
  const k = name.toLowerCase().replace(/[^a-z0-9؀-ۿ]/g, '')
  return /^(thndr|thandr|thunder|thndar)$/.test(k) ? 'thndr' : k
}

/** The existing account this name means, ignoring case, spaces and Thndr's spellings. */
export const findAccount = (accounts: Account[], name: string) => accounts.find((a) => key(a.name) === key(name))
