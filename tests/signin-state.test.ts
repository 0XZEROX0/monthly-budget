import { describe, expect, it } from 'vitest'
import { STATE_TTL_MS, isStateCode, newSignInState, takeSignInState } from '../src/data/signinState'

function memory() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  }
}

describe('browser sign-in code', () => {
  it('takes the code the app made, once', () => {
    const s = memory()
    const code = newSignInState(s, 1000)
    expect(isStateCode(code)).toBe(true)
    expect(takeSignInState(s, code, 2000)).toBe(true)
    expect(takeSignInState(s, code, 2000)).toBe(false)
  })

  it('refuses a link when the app started no sign-in', () => {
    expect(takeSignInState(memory(), 'a'.repeat(48), 1000)).toBe(false)
  })

  it('refuses a missing or wrong code, and keeps waiting for the right one', () => {
    const s = memory()
    const code = newSignInState(s, 1000)
    expect(takeSignInState(s, null, 2000)).toBe(false)
    expect(takeSignInState(s, 'b'.repeat(48), 2000)).toBe(false)
    expect(takeSignInState(s, code, 3000)).toBe(true)
  })

  it('refuses an old code', () => {
    const s = memory()
    const code = newSignInState(s, 1000)
    expect(takeSignInState(s, code, 1000 + STATE_TTL_MS + 1)).toBe(false)
  })

  it('refuses odd characters in a code', () => {
    expect(isStateCode('abc&id_token=x' + 'a'.repeat(20))).toBe(false)
    expect(isStateCode('short')).toBe(false)
  })
})
