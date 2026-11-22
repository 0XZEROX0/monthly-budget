// Exchange rates for bank SMS in another currency, like "USD 9.99 at NETFLIX". Without a rate
// the add form would start at 9.99 in the budget's own currency, about fifty times too little.
// Rates come from open.er-api.com (free, no key, updated daily) and are kept for 12 hours.
// They are an estimate: banks add their own margin, so the amount can still be edited.

const KEY = 'budget-app:rates'
const MAX_AGE_MS = 12 * 60 * 60 * 1000

/** How many units of `base` one unit of each currency is worth, e.g. { USD: 49.5 } for EGP. */
export type Rates = Record<string, number>

interface Saved {
  base: string
  at: number
  rates: Rates
}

function load(base: string): Saved | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Saved | null
    return s && s.base === base && typeof s.at === 'number' && s.rates && typeof s.rates === 'object' ? s : null
  } catch {
    return null
  }
}

/** The API gives how much of each currency one `base` buys; turn that into each currency's worth in `base`. */
export function invert(perBase: Record<string, unknown>): Rates {
  const out: Rates = {}
  for (const [code, v] of Object.entries(perBase)) if (/^[A-Z]{3}$/.test(code) && typeof v === 'number' && v > 0 && Number.isFinite(v)) out[code] = 1 / v
  return out
}

/** Rates into `base`: the saved ones while fresh, else fetched; the last saved ones (or none) when offline. */
export async function getRates(base: string, now = Date.now(), fetcher: typeof fetch = fetch): Promise<Rates> {
  const saved = load(base)
  if (saved && now - saved.at < MAX_AGE_MS) return saved.rates
  try {
    const res = await fetcher(`https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`)
    const json = (await res.json()) as { result?: string; rates?: Record<string, unknown> }
    if (!res.ok || json.result !== 'success' || !json.rates) throw new Error('no rates')
    const rates = invert(json.rates)
    try {
      localStorage.setItem(KEY, JSON.stringify({ base, at: now, rates } satisfies Saved))
    } catch {
      // Storage unavailable: fetch again next time.
    }
    return rates
  } catch {
    return saved?.rates ?? {}
  }
}

/** `amount` of `currency` in the budget's currency, to the cent, or null without a rate. */
export function convert(amount: number, currency: string, rates: Rates | undefined): number | null {
  const rate = rates?.[currency]
  return rate && rate > 0 ? Math.round(amount * rate * 100) / 100 : null
}
