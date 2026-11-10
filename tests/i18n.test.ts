import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AR } from '../src/i18n/ar'
import { applyLang, t } from '../src/i18n'

/** Every piece of text the app wraps in t(), tr() or msg() with a plain string. */
function appTexts(): Set<string> {
  const out = new Set<string>()
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (/\.tsx?$/.test(name) && !path.includes('i18n')) {
        const src = readFileSync(path, 'utf8')
        for (const m of src.matchAll(/\b(?:t|tr|msg)\(\s*(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)")/g)) out.add((m[1] ?? m[2]).replace(/\\(.)/g, '$1'))
      }
    }
  }
  walk(join(__dirname, '../src'))
  return out
}

describe('Arabic', () => {
  const texts = appTexts()

  it('has a translation for every piece of app text', () => {
    expect([...texts].filter((s) => !(s in AR))).toEqual([])
  })

  it('keeps the same {slots} as the English', () => {
    const slots = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    expect(Object.entries(AR).filter(([en, ar]) => slots(en).join() !== slots(ar).join())).toEqual([])
  })

  it('has no leftover entries the app no longer uses', () => {
    expect(Object.keys(AR).filter((en) => !texts.has(en))).toEqual([])
  })

  it('switches text and fills slots', () => {
    applyLang('ar')
    expect(t('{n} entries', { n: 3 })).toBe('3 عمليات')
    applyLang('en')
    expect(t('{n} entries', { n: 3 })).toBe('3 entries')
  })
})
