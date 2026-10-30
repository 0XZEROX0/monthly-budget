import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'

const HOLD_MS = 350
/** Moving further than this before the hold ends means a scroll, not a drag. */
const SLOP = 8

const move = <T,>(list: T[], from: number, to: number) => {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/**
 * Hold an item, then drag it to a new place: the list rearranges under your finger
 * and the new order is saved when you let go. A quick tap still works as a tap.
 */
export function useReorder(items: string[], onReorder: (next: string[]) => void) {
  const [drag, setDrag] = useState<{ key: string; to: number } | null>(null)
  const hold = useRef<{ timer: number; x: number; y: number; key: string } | null>(null)
  // The tap that ends a drag shouldn't also select the item.
  const swallowClick = useRef(false)

  const from = drag ? items.indexOf(drag.key) : -1
  const order = drag && from >= 0 ? move(items, from, drag.to) : items

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

  const itemProps = (key: string, className = '') => ({
    'data-reorder-key': key,
    className: `${className} reorder-item ${drag?.key === key ? 'reorder-dragging' : ''}`.trim(),
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0) return
      const el = e.currentTarget
      const id = e.pointerId
      cancelHold()
      hold.current = {
        x: e.clientX,
        y: e.clientY,
        key,
        timer: window.setTimeout(() => {
          hold.current = null
          try {
            el.setPointerCapture(id)
          } catch {
            // The pointer is already gone.
            return
          }
          navigator.vibrate?.(15)
          setDrag({ key, to: items.indexOf(key) })
        }, HOLD_MS),
      }
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const h = hold.current
      if (h && Math.hypot(e.clientX - h.x, e.clientY - h.y) > SLOP) cancelHold()
      if (!drag) return
      const under = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-reorder-key]')
      const k = under?.dataset.reorderKey
      if (k === undefined || k === drag.key) return
      const to = order.indexOf(k)
      if (to >= 0 && to !== drag.to) setDrag({ key: drag.key, to })
    },
    onPointerUp: () => {
      cancelHold()
      if (!drag) return
      // A click may or may not follow the release; either way only swallow it straight after.
      swallowClick.current = true
      window.setTimeout(() => (swallowClick.current = false), 50)
      if (from >= 0 && drag.to !== from) onReorder(order)
      setDrag(null)
    },
    onPointerCancel: () => {
      cancelHold()
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
