import type { Settings } from './types'

/**
 * What changed between the settings last seen and the ones being saved, one top-level
 * field at a time. Saving only these, instead of the whole document, means a phone that
 * changes the theme can't undo a category the website added a moment earlier.
 */
export function settingsChanges(prev: Settings, next: Settings): { set: Partial<Settings>; remove: (keyof Settings)[] } {
  const set: Record<string, unknown> = {}
  const remove: (keyof Settings)[] = []
  const a = prev as unknown as Record<string, unknown>
  const b = next as unknown as Record<string, unknown>
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (b[key] === undefined) {
      if (a[key] !== undefined) remove.push(key as keyof Settings)
    } else if (!same(a[key], b[key])) set[key] = b[key]
  }
  return { set: set as Partial<Settings>, remove }
}

/** Equal as saved data: same values, whatever order an object's keys are in. */
function same(x: unknown, y: unknown): boolean {
  if (x === y) return true
  if (typeof x !== 'object' || typeof y !== 'object' || x === null || y === null) return false
  if (Array.isArray(x) !== Array.isArray(y)) return false
  if (Array.isArray(x) && Array.isArray(y)) return x.length === y.length && x.every((v, i) => same(v, y[i]))
  const xo = x as Record<string, unknown>
  const yo = y as Record<string, unknown>
  const keys = new Set([...Object.keys(xo), ...Object.keys(yo)])
  for (const k of keys) if (!same(xo[k], yo[k])) return false
  return true
}
