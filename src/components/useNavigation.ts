import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { useEffect, useRef, type RefObject } from 'react'

/**
 * Closes the pop-up on top, if there is one. Every pop-up in the app sits on a
 * `.sheet-backdrop` that closes it when tapped, so "back" taps the topmost one.
 * Returns true when a pop-up was there (even one that can't be closed right now,
 * like an update that is downloading), so back does nothing else.
 */
export function closeTopPopup(): boolean {
  const all = Array.from(document.querySelectorAll<HTMLElement>('.sheet-backdrop'))
  if (!all.length) return false
  // Highest on screen wins; among equals, the one added last.
  let top = all[0]
  let topZ = -Infinity
  for (const el of all) {
    const z = Number(getComputedStyle(el).zIndex) || 0
    if (z >= topZ) {
      top = el
      topZ = z
    }
  }
  top.click()
  return true
}

/** Android's back button and edge-swipe gesture; the handler always sees the latest render. */
export function useBackButton(handler: () => void) {
  const latest = useRef(handler)
  useEffect(() => {
    latest.current = handler
  })
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const h = CapApp.addListener('backButton', () => latest.current())
    return () => void h.then((x) => x.remove())
  }, [])
}

/** Distance (px) the finger must travel sideways to count as a swipe. */
const MIN_DX = 70
/** Sideways must clearly beat up-and-down, so scrolling the page never flips tabs. */
const RATIO = 1.8
/** Touches starting this close to the screen's side belong to Android's back gesture. */
const EDGE = 28
/** Slow drags are more likely reading or selecting than a flick between pages. */
const MAX_MS = 700

/**
 * A left or right swipe across the middle of `el` calls onSwipe(+1) for the next
 * page or onSwipe(-1) for the previous one. Ignored on charts (they scrub sideways),
 * inputs, pop-ups, anything that scrolls sideways, and while an item is being dragged.
 */
export function useSwipe(el: RefObject<HTMLElement | null>, onSwipe: (dir: 1 | -1) => void, enabled = true) {
  const latest = useRef(onSwipe)
  useEffect(() => {
    latest.current = onSwipe
  })
  useEffect(() => {
    const node = el.current
    if (!node || !enabled) return
    let start: { x: number; y: number; t: number } | null = null
    const onStart = (e: TouchEvent) => {
      start = null
      if (e.touches.length !== 1) return
      const t = e.touches[0]
      if (t.clientX < EDGE || t.clientX > window.innerWidth - EDGE) return
      const target = e.target as Element
      if (target.closest?.('svg, input, textarea, select, [contenteditable], .sheet-backdrop, [data-noswipe]')) return
      if (scrollsSideways(target, node)) return
      start = { x: t.clientX, y: t.clientY, t: Date.now() }
    }
    const onEnd = (e: TouchEvent) => {
      const s = start
      start = null
      if (!s) return
      const t = e.changedTouches[0]
      const dx = t.clientX - s.x
      const dy = t.clientY - s.y
      if (Math.abs(dx) < MIN_DX || Math.abs(dx) < Math.abs(dy) * RATIO || Date.now() - s.t > MAX_MS) return
      if (document.querySelector('.reorder-dragging, .sheet-backdrop')) return
      if (window.getSelection()?.toString()) return
      latest.current(dx < 0 ? 1 : -1)
    }
    const onCancel = () => (start = null)
    node.addEventListener('touchstart', onStart, { passive: true })
    node.addEventListener('touchend', onEnd, { passive: true })
    node.addEventListener('touchcancel', onCancel, { passive: true })
    return () => {
      node.removeEventListener('touchstart', onStart)
      node.removeEventListener('touchend', onEnd)
      node.removeEventListener('touchcancel', onCancel)
    }
  }, [el, enabled])
}

function scrollsSideways(from: Element, stop: Element) {
  for (let n: Element | null = from; n && n !== stop; n = n.parentElement) {
    if (n.scrollWidth > n.clientWidth + 1) {
      const o = getComputedStyle(n).overflowX
      if (o === 'auto' || o === 'scroll') return true
    }
  }
  return false
}
