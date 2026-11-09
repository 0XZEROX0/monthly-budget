import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'

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

/** Touches starting this close to the screen's side belong to Android's back gesture. */
const EDGE = 28
/** Sideways must beat up-and-down by this much before the pages start to move. */
const RATIO = 1.2
/** Pixels the finger moves before deciding between scrolling and swiping. */
const SLOP = 10
const SETTLE = 'transform 0.28s cubic-bezier(0.2, 0.9, 0.3, 1)'

export interface SwipeHandlers {
  /** Whether there is a page that way (1: next, -1: previous). */
  canGo: (dir: 1 | -1) => boolean
  /** Show the page that way beside this one (0: none). */
  onPeek: (dir: 1 | -1 | 0) => void
  /** The swipe went far or fast enough: make that page the current one. */
  onCommit: (dir: 1 | -1) => void
}

/**
 * Pages that follow the finger: a sideways drag across the middle of `el` moves `track`
 * (the current page with the next one beside it) along with the finger, then finishes
 * the move or springs back on release. Ignored on charts (they scrub sideways), the box being typed in,
 * pop-ups, anything that scrolls sideways, the screen edges, and while dragging an item.
 */
export function useSwipe(el: RefObject<HTMLElement | null>, track: RefObject<HTMLElement | null>, handlers: SwipeHandlers, enabled = true) {
  const latest = useRef(handlers)
  useLayoutEffect(() => {
    latest.current = handlers
  })
  useEffect(() => {
    const node = el.current
    if (!node || !enabled) return
    let start: { x: number; y: number } | null = null
    let mode: 'undecided' | 'x' | 'y' = 'y'
    let dir: 1 | -1 | 0 = 0
    let dx = 0
    let last = { x: 0, t: 0 }
    let speed = 0
    // The slide still finishing after the last swipe; a new touch completes it at once.
    let settling: (() => void) | null = null
    const move = (px: number, animate: boolean) => {
      const t = track.current
      if (!t) return
      t.style.transition = animate ? SETTLE : 'none'
      t.style.transform = px ? `translateX(${px}px)` : ''
    }
    const onStart = (e: TouchEvent) => {
      start = null
      mode = 'y'
      settling?.()
      if (e.touches.length !== 1) return
      const t = e.touches[0]
      if (t.clientX < EDGE || t.clientX > window.innerWidth - EDGE) return
      const target = e.target as Element
      if (target.closest?.('svg, textarea, select, [contenteditable], .sheet-backdrop, [data-noswipe]')) return
      // The Plan page is mostly boxes; swiping across one is fine unless it's being typed in.
      if (target.closest?.('input') && target.closest('input') === document.activeElement) return
      if (scrollsSideways(target, node)) return
      if (document.querySelector('.reorder-dragging, .sheet-backdrop')) return
      start = { x: t.clientX, y: t.clientY }
      last = { x: t.clientX, t: e.timeStamp }
      speed = 0
      dx = 0
      dir = 0
      mode = 'undecided'
    }
    const onMove = (e: TouchEvent) => {
      if (!start || mode === 'y') return
      const t = e.touches[0]
      const x = t.clientX - start.x
      const y = t.clientY - start.y
      if (mode === 'undecided') {
        if (Math.abs(x) < SLOP && Math.abs(y) < SLOP) return
        if (Math.abs(x) < Math.abs(y) * RATIO || document.querySelector('.reorder-dragging')) {
          mode = 'y'
          return
        }
        mode = 'x'
        node.dataset.swiping = '1'
      }
      e.preventDefault()
      const dt = e.timeStamp - last.t
      if (dt > 0) speed = (t.clientX - last.x) / dt
      last = { x: t.clientX, t: e.timeStamp }
      dx = x
      const want: 1 | -1 | 0 = x < 0 ? 1 : x > 0 ? -1 : 0
      const can = want !== 0 && latest.current.canGo(want)
      if (want !== dir) {
        dir = want
        latest.current.onPeek(can ? want : 0)
      }
      // No page that way: a little give, so the gesture still feels answered.
      move(can ? x : x * 0.25, false)
    }
    const onEnd = () => {
      const was = mode
      start = null
      mode = 'y'
      delete node.dataset.swiping
      if (was !== 'x') return
      const width = track.current?.clientWidth || window.innerWidth
      const d = dir
      // Far enough, or a quick flick the same way.
      const commit = d !== 0 && latest.current.canGo(d) && (Math.abs(dx) > width * 0.3 || (Math.abs(dx) > 40 && Math.abs(speed) > 0.45 && Math.sign(speed) === Math.sign(dx)))
      move(commit ? -d * width : 0, true)
      let done = false
      const finish = (e?: Event) => {
        // Only the track's own slide; a page's inner animations bubble up here too.
        if (done || (e && e.target !== track.current)) return
        done = true
        settling = null
        track.current?.removeEventListener('transitionend', finish)
        if (commit) latest.current.onCommit(d as 1 | -1)
        else latest.current.onPeek(0)
        move(0, false)
      }
      settling = finish
      track.current?.addEventListener('transitionend', finish)
      window.setTimeout(finish, 340)
    }
    node.addEventListener('touchstart', onStart, { passive: true })
    node.addEventListener('touchmove', onMove, { passive: false })
    node.addEventListener('touchend', onEnd, { passive: true })
    node.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      node.removeEventListener('touchstart', onStart)
      node.removeEventListener('touchmove', onMove)
      node.removeEventListener('touchend', onEnd)
      node.removeEventListener('touchcancel', onEnd)
    }
  }, [el, track, enabled])
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
