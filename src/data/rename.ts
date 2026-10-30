import type { Backend, Kind, MonthPlan, Settings, SmsTarget } from './types'

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
  if (settings.icons?.[from]) {
    const { [from]: icon, ...icons } = settings.icons
    next.icons = { ...icons, [to]: icon }
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

const renameKey = <T,>(rec: Record<string, T> | undefined, from: string, to: string) => {
  if (!rec || !(from in rec)) return rec
  const { [from]: v, ...rest } = rec
  return { ...rest, [to]: v }
}

/**
 * Renames an account or a debt everywhere it's used: the list, opening balances, bills,
 * goals, SMS card targets, its icon and every past entry, so balances stay the same.
 */
export async function renameMoneyHolder(backend: Backend, settings: Settings, what: 'account' | 'debt', from: string, to: string) {
  const swap = (n: string | undefined) => (n === from ? to : n)
  const target = (t: SmsTarget | undefined) => (t === `${what}:${from}` ? (`${what}:${to}` as SmsTarget) : t)
  const next: Settings = { ...settings, ...(settings.icons && { icons: renameKey(settings.icons, from, to) }) }
  if (what === 'account') {
    next.accounts = settings.accounts.map((a) => (a.name === from ? { ...a, name: to } : a))
    next.opening = { ...settings.opening, accounts: renameKey(settings.opening.accounts, from, to)! }
    if (settings.goals) next.goals = settings.goals.map((g) => ({ ...g, accounts: g.accounts.map((a) => swap(a)!) }))
    if (settings.bills) next.bills = settings.bills.map((b) => (b.account === from ? { ...b, account: to } : b))
  } else {
    next.debts = settings.debts.map((d) => (d.name === from ? { ...d, name: to } : d))
    next.opening = { ...settings.opening, debts: renameKey(settings.opening.debts, from, to)! }
    if (settings.bills) next.bills = settings.bills.map((b) => (b.debt === from ? { ...b, debt: to } : b))
  }
  if (settings.sms) {
    next.sms = {
      ...settings.sms,
      cards: Object.fromEntries(Object.entries(settings.sms.cards).map(([k, t]) => [k, target(t)!])),
      ...(settings.sms.defaultTarget && { defaultTarget: target(settings.sms.defaultTarget) }),
    }
  }
  const { transactions } = await backend.exportAll()
  const changed =
    what === 'account'
      ? transactions.filter((t) => t.account === from || t.toAccount === from).map((t) => ({ ...t, ...(t.account && { account: swap(t.account) }), ...(t.toAccount && { toAccount: swap(t.toAccount) }) }))
      : transactions.filter((t) => t.debt === from).map((t) => ({ ...t, debt: to }))
  await backend.importAll({ settings: next, plans: {}, transactions: changed })
}
