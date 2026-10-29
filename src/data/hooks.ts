import { useEffect, useState } from 'react'
import type { Backend, MonthPlan, Settings, Transaction } from './types'

export function useSettings(backend: Backend) {
  const [settings, setSettings] = useState<Settings | null>(null)
  useEffect(() => backend.watchSettings(setSettings), [backend])
  return settings
}

/** undefined while loading, null when the month has no saved plan yet. */
export function usePlan(backend: Backend, month: string) {
  const [plan, setPlan] = useState<{ month: string; plan: MonthPlan | null } | undefined>()
  useEffect(() => backend.watchPlan(month, (p) => setPlan({ month, plan: p })), [backend, month])
  return plan?.month === month ? plan.plan : undefined
}

export function useTransactions(backend: Backend, month: string) {
  const [state, setState] = useState<{ month: string; txns: Transaction[] } | undefined>()
  useEffect(() => backend.watchTransactions(month, (txns) => setState({ month, txns })), [backend, month])
  return state?.month === month ? state.txns : undefined
}
