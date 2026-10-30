import { useEffect, useState } from 'react'
import { setCustomIcons } from './icons'
import { setShowDecimals } from './month'
import type { Backend, MonthPlan, Settings, Transaction } from './types'

export function useSettings(backend: Backend) {
  const [settings, setSettings] = useState<Settings | null>(null)
  useEffect(
    () =>
      backend.watchSettings((s) => {
        // Display choices that every amount and icon reads, set before the next render.
        setShowDecimals(!!s.decimals)
        setCustomIcons(s.icons)
        setSettings(s)
      }),
    [backend],
  )
  return settings
}

/** undefined while loading, null when the month has no saved plan yet. */
export function usePlan(backend: Backend, month: string) {
  const [plan, setPlan] = useState<{ month: string; plan: MonthPlan | null } | undefined>()
  useEffect(() => backend.watchPlan(month, (p) => setPlan({ month, plan: p })), [backend, month])
  return plan?.month === month ? plan.plan : undefined
}

export function useRange(backend: Backend, from: string, to: string) {
  const key = `${from}:${to}`
  const [state, setState] = useState<{ key: string; txns: Transaction[] } | undefined>()
  useEffect(() => backend.watchRange(from, to, (txns) => setState({ key: `${from}:${to}`, txns })), [backend, from, to])
  return state?.key === key ? state.txns : undefined
}

export function useTransactions(backend: Backend, month: string) {
  const [state, setState] = useState<{ month: string; txns: Transaction[] } | undefined>()
  useEffect(() => backend.watchTransactions(month, (txns) => setState({ month, txns })), [backend, month])
  return state?.month === month ? state.txns : undefined
}
