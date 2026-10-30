import type { Backend, Kind, MonthPlan, Settings } from './types'

/**
 * Renames a category everywhere it's used: the category list, bills, the debt payment
 * category, remembered SMS merchants, every month's plan and every past entry, so
 * nothing loses its link. Written in one batch.
 */
export async function renameCategory(backend: Backend, settings: Settings, kind: Kind, from: string, to: string) {
  const swap = (c: string | undefined) => (c === from ? to : c)
  const next: Settings = {
    ...settings,
    categories: { ...settings.categories, [kind]: settings.categories[kind].map((c) => (c === from ? to : c)) },
  }
  if (kind === 'expense') {
    next.debtCategory = swap(settings.debtCategory)
    if (settings.bills) next.bills = settings.bills.map((b) => (b.category === from ? { ...b, category: to } : b))
    if (settings.sms) next.sms = { ...settings.sms, merchants: Object.fromEntries(Object.entries(settings.sms.merchants).map(([m, c]) => [m, swap(c)!])) }
  }
  const { plans, transactions } = await backend.exportAll()
  const changedPlans: Record<string, MonthPlan> = {}
  for (const [month, p] of Object.entries(plans)) {
    const planned = p.planned?.[kind]
    if (!planned || !(from in planned)) continue
    const { [from]: amount, ...rest } = planned
    changedPlans[month] = { ...p, planned: { ...p.planned, [kind]: { ...rest, [to]: (rest[to] ?? 0) + amount } } }
  }
  await backend.importAll({
    settings: next,
    plans: changedPlans,
    transactions: transactions.filter((t) => t.kind === kind && t.category === from).map((t) => ({ ...t, category: to })),
  })
}
