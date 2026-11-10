import { msg } from '../i18n'
import type { Settings } from './types'

/** The Summary page's cards, in their default order. */
export const SUMMARY_SECTIONS = [
  { key: 'hero', label: msg('Left to spend'), icon: '🎯' },
  { key: 'alerts', label: msg('Budget alerts'), icon: '⚠️' },
  { key: 'bills', label: msg('Bills'), icon: '📆' },
  { key: 'accounts', label: msg('Accounts'), icon: '🏦' },
  { key: 'goals', label: msg('Savings goals'), icon: '🐷' },
  { key: 'pace', label: msg('Spending this month'), icon: '📉' },
  { key: 'categories', label: msg('Where your money went'), icon: '🧾' },
  { key: 'debts', label: msg('Debts'), icon: '💳' },
  { key: 'saved', label: msg('Saved each month'), icon: '💰' },
  { key: 'trend', label: msg('Income vs spending'), icon: '📊' },
  { key: 'income', label: msg('Income'), icon: '💼' },
] as const

export type SectionKey = (typeof SUMMARY_SECTIONS)[number]['key']

export interface SummaryLayout {
  order: SectionKey[]
  hidden: SectionKey[]
}

const KEYS = SUMMARY_SECTIONS.map((s) => s.key) as SectionKey[]

/** The saved layout, with any card added since it was saved put back in its default place. */
export function summaryLayout(settings: Settings): SummaryLayout {
  const saved = settings.summaryLayout
  const order = (saved?.order ?? []).filter((k): k is SectionKey => (KEYS as string[]).includes(k))
  for (const [i, k] of KEYS.entries()) if (!order.includes(k)) order.splice(Math.min(i, order.length), 0, k)
  return { order, hidden: (saved?.hidden ?? []).filter((k): k is SectionKey => (KEYS as string[]).includes(k)) }
}
