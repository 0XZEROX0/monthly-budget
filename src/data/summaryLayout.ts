import type { Settings } from './types'

/** The Summary page's cards, in their default order. */
export const SUMMARY_SECTIONS = [
  { key: 'hero', label: 'Left to spend', icon: '🎯' },
  { key: 'alerts', label: 'Budget alerts', icon: '⚠️' },
  { key: 'bills', label: 'Bills', icon: '📆' },
  { key: 'accounts', label: 'Accounts', icon: '🏦' },
  { key: 'goals', label: 'Savings goals', icon: '🐷' },
  { key: 'pace', label: 'Spending this month', icon: '📉' },
  { key: 'categories', label: 'Where your money went', icon: '🧾' },
  { key: 'debts', label: 'Debts', icon: '💳' },
  { key: 'saved', label: 'Saved each month', icon: '💰' },
  { key: 'trend', label: 'Income vs spending', icon: '📊' },
  { key: 'income', label: 'Income', icon: '💼' },
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
