import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'

const HOLD_MS = 350
/** Moving further than this before the hold ends means a scroll, not a drag. */
const SLOP = 8
const SLIDE = 'translate 220ms cubic-bezier(0.2, 0.8, 0.2, 1)'

const move = <T,>(list: T[], from: number, to: number) => {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

type Pt = { x: number; y: number }
const center = (el: HTMLElement): Pt => {
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

/**
 * Hold an item and it lifts under your finger; drag it and the others slide out of the
 * way; let go and it settles into its new place, which is saved. A quick tap still
 * works as a tap. Items are found by their data-reorder-key inside the same parent.
 */
export function useReorder(items: string[], onReorder: (next: string[]) => void) {
  const [drag, setDrag] = useState<{ key: string; to: number } | null>(null)
  const hold = useRef<{ timer: number; x: number; y: number } | null>(null)
  // The tap that ends a drag shouldn't also select the item.
  const swallowClick = useRef(false)
  const dragged = useRef<HTMLElement | null>(null)
  const pointer = useRef<Pt>({ x: 0, y: 0 })
  /** Where the finger is from the item's centre, so it doesn't jump to the finger. */
  const grab = useRef<Pt>({ x: 0, y: 0 })
  /** The resting centre of each place in the list, measured when the drag starts. */
  const slots = useRef<Pt[]>([])
  /** Each item's position on screen just before the order changed, to slide from. */
  const before = useRef<Map<HTMLElement, Pt> | null>(null)

  // The new order, shown from the drop until the saved list comes back, so nothing jumps back.
  const [pending, setPending] = useState<{ base: string[]; order: string[] } | null>(null)
  const from = drag ? items.indexOf(drag.key) : -1
  const order = drag && from >= 0 ? move(items, from, drag.to) : pending?.base === items ? pending.order : items

  const siblings = () => [...(dragged.current?.parentElement?.querySelectorAll<HTMLElement>('[data-reorder-key]') ?? [])]

  /** Puts the held item under the finger, wherever its slot in the list is now. */
  const follow = () => {
    const el = dragged.current
    if (!el) return
    el.style.translate = 'none'
    const c = center(el)
    el.style.translate = `${pointer.current.x - grab.current.x - c.x}px ${pointer.current.y - grab.current.y - c.y}px`
  }

  // After the order changes: the others slide from where they were to their new slots.
  useLayoutEffect(() => {
    const prev = before.current
    before.current = null
    if (prev) {
      for (const el of siblings()) {
        if (el === dragged.current) continue
        const was = prev.get(el)
        if (!was) continue
        el.style.transition = 'none'
        el.style.translate = 'none'
        const now = center(el)
        const dx = was.x - now.x
        const dy = was.y - now.y
        if (!dx && !dy) continue
        el.style.translate = `${dx}px ${dy}px`
        void el.offsetWidth
        el.style.transition = SLIDE
        el.style.translate = '0px 0px'
      }
    }
    follow()
  }, [drag?.to]) // eslint-disable-line react-hooks/exhaustive-deps

  // While dragging, stop the page from scrolling under the finger.
  useEffect(() => {
    if (!drag) return
    const stop = (e: TouchEvent) => e.preventDefault()
    document.addEventListener('touchmove', stop, { passive: false })
    return () => document.removeEventListener('touchmove', stop)
  }, [drag])

  const cancelHold = () => {
    if (hold.current) clearTimeout(hold.current.timer)
    hold.current = null
  }

  const settle = () => {
    const el = dragged.current
    dragged.current = null
    if (!el) return
    // Glide from under the finger into its slot.
    el.style.transition = `${SLIDE}, scale 180ms ease`
    el.style.translate = '0px 0px'
    window.setTimeout(() => {
      for (const s of [el, ...siblings()]) {
        s.style.transition = ''
        s.style.translate = ''
      }
    }, 260)
  }

  const itemProps = (key: string, className = '') => ({
    'data-reorder-key': key,
    className: `${className} reorder-item ${drag?.key === key ? 'reorder-dragging' : drag ? 'reorder-moving' : ''}`.trim(),
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0) return
      const el = e.currentTarget
      const id = e.pointerId
      cancelHold()
      pointer.current = { x: e.clientX, y: e.clientY }
      hold.current = {
        x: e.clientX,
        y: e.clientY,
        timer: window.setTimeout(() => {
          hold.current = null
          try {
            el.setPointerCapture(id)
          } catch {
            return // The finger is already gone.
          }
          const c = center(el)
          grab.current = { x: pointer.current.x - c.x, y: pointer.current.y - c.y }
          dragged.current = el
          // Places are fixed for the whole drag, so the target doesn't flicker while items slide.
          slots.current = siblings().map(center)
          el.style.transition = 'scale 160ms ease'
          navigator.vibrate?.(15)
          setDrag({ key, to: items.indexOf(key) })
        }, HOLD_MS),
      }
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      pointer.current = { x: e.clientX, y: e.clientY }
      const h = hold.current
      if (h && Math.hypot(e.clientX - h.x, e.clientY - h.y) > SLOP) cancelHold()
      if (!drag) return
      follow()
      // The nearest place to the finger. Measured from where places rest, not where the
      // sliding items happen to be, and only switching once clearly closer, so it never flip-flops.
      const p = pointer.current
      const dist = (i: number) => Math.hypot(slots.current[i].x - p.x, slots.current[i].y - p.y)
      let to = drag.to
      slots.current.forEach((_, i) => {
        if (dist(i) < dist(to) - 6) to = i
      })
      if (to === drag.to || to >= order.length) return
      before.current = new Map(siblings().map((s) => [s, center(s)]))
      setDrag({ key: drag.key, to })
    },
    onPointerUp: () => {
      cancelHold()
      if (!drag) return
      // A click may or may not follow the release; either way only swallow it straight after.
      swallowClick.current = true
      window.setTimeout(() => (swallowClick.current = false), 50)
      if (from >= 0 && drag.to !== from) {
        setPending({ base: items, order })
        onReorder(order)
      }
      settle()
      setDrag(null)
    },
    onPointerCancel: () => {
      cancelHold()
      if (!drag) return
      settle()
      setDrag(null)
    },
    onClickCapture: (e: ReactMouseEvent) => {
      if (!swallowClick.current) return
      swallowClick.current = false
      e.preventDefault()
      e.stopPropagation()
    },
    // Android's long-press menu would otherwise pop up over the drag.
    onContextMenu: (e: ReactMouseEvent) => e.preventDefault(),
  })

  return { order, itemProps, dragging: drag !== null }
}
