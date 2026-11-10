// The Android app's browser sign-in returns through monthlybudget://signin?id_token=…,
// a link any website or app can open. Without a check, someone could send a link with
// their own Google token and quietly switch the app to their account, so that bank SMS
// and new entries land where they can read them. So the app makes a one-time code before
// it opens the browser, the website hands it back with the token, and the app only takes
// a token that comes with the code it is waiting for.

const KEY = 'budget-app:signin-state'
/** How long the browser sign-in may take. */
export const STATE_TTL_MS = 15 * 60 * 1000

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>

/** Codes the bridge passes on: letters, digits and dashes, of a sensible length. */
export const isStateCode = (s: string | null | undefined): s is string => !!s && /^[A-Za-z0-9-]{16,100}$/.test(s)

/** A fresh code to send with the browser sign-in; kept so the app can check it on return. */
export function newSignInState(storage: Storage, now = Date.now(), code = randomCode()): string {
  storage.setItem(KEY, JSON.stringify({ code, at: now }))
  return code
}

/** True once for the code the app is waiting for, while it is fresh. A wrong code leaves it waiting. */
export function takeSignInState(storage: Storage, code: string | null | undefined, now = Date.now()): boolean {
  let saved: { code?: unknown; at?: unknown } | null = null
  try {
    saved = JSON.parse(storage.getItem(KEY) || 'null')
  } catch {
    saved = null
  }
  if (!saved || typeof saved.code !== 'string' || typeof saved.at !== 'number') {
    storage.removeItem(KEY)
    return false
  }
  const fresh = now - saved.at >= 0 && now - saved.at <= STATE_TTL_MS
  if (!fresh) storage.removeItem(KEY)
  if (!fresh || !isStateCode(code) || code !== saved.code) return false
  storage.removeItem(KEY)
  return true
}

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
