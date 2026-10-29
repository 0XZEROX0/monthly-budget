import { useEffect, useRef } from 'react'

/**
 * The page scrolls inside `scroller` rather than the window, so the tab bar and +
 * button (fixed, outside `content`) stay put. Android's own overscroll stretch would
 * otherwise pull them along; instead `content` gets a gentle elastic pull at the top
 * and bottom edges and springs back on release.
 */
export function usePull<S extends HTMLElement, C extends HTMLElement>() {
  const scroller = useRef<S>(null)
  const content = useRef<C>(null)
  useEffect(() => {
    const s = scroller.current
    const c = content.current
    if (!s || !c) return
    let startY = 0
    let pulling = false
    const atTop = () => s.scrollTop <= 0
    const atBottom = () => s.scrollTop + s.clientHeight >= s.scrollHeight - 1
    const set = (px: number, animate: boolean) => {
      c.style.transition = animate ? 'transform 0.35s cubic-bezier(0.2, 0.9, 0.3, 1)' : 'none'
      c.style.transform = px ? `translateY(${px}px)` : ''
    }
    let ignore = false
    const onStart = (e: TouchEvent) => {
      startY = e.touches[0].clientY
      pulling = false
      // Pop-up sheets scroll on their own; don't move the page under them.
      ignore = !!(e.target as Element).closest?.('.sheet-backdrop')
    }
    const onMove = (e: TouchEvent) => {
      if (ignore) return
      const dy = e.touches[0].clientY - startY
      if ((dy > 0 && atTop()) || (dy < 0 && atBottom())) {
        pulling = true
        // Resistance grows with distance, capped so it stays a hint.
        const pull = Math.sign(dy) * Math.min(110, Math.abs(dy) * 0.35)
        set(pull, false)
      } else if (pulling) {
        pulling = false
        set(0, false)
      }
    }
    const onEnd = () => {
      if (pulling) set(0, true)
      pulling = false
    }
    s.addEventListener('touchstart', onStart, { passive: true })
    s.addEventListener('touchmove', onMove, { passive: true })
    s.addEventListener('touchend', onEnd)
    s.addEventListener('touchcancel', onEnd)
    return () => {
      s.removeEventListener('touchstart', onStart)
      s.removeEventListener('touchmove', onMove)
      s.removeEventListener('touchend', onEnd)
      s.removeEventListener('touchcancel', onEnd)
    }
  }, [])
  return { scroller, content }
}
