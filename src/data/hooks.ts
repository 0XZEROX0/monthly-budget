import { useEffect, useState } from 'react'
import { applyLang } from '../i18n'
import { setCustomIcons } from './icons'
import { setShowDecimals, today } from './month'
import type { Backend, MonthPlan, Settings, Transaction } from './types'

/** The settings, and whether this is a brand-new user with nothing saved yet. */
export function useSettings(backend: Backend) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [fresh, setFresh] = useState(false)
  useEffect(
    () =>
      backend.watchSettings((s, isFresh) => {
        setFresh(isFresh)
        // Display choices that every amount and icon reads, set before the next render.
        setShowDecimals(!!s.decimals)
        applyLang(s.lang)
        setCustomIcons(s.icons)
        setSettings(s)
      }),
    [backend],
  )
  return [settings, fresh] as const
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

/** Today's date (YYYY-MM-DD), kept right when the app stays open past midnight or comes back the next day. */
export function useToday() {
  const [day, setDay] = useState(today)
  useEffect(() => {
    const check = () => setDay(today())
    const timer = window.setInterval(check, 60_000)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])
  return day
}
