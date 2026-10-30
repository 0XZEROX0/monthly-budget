import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

// Hand-drawn SVG charts. Colors come from CSS tokens (--income, --expense, ...) so
// light and dark mode swap in one place. Marks: 2px lines, columns <= 24px with
// 4px rounded tops, hairline grid, a tooltip on hover/tap.

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

/** Round up to a clean axis maximum and return evenly spaced ticks. */
function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0]
  const raw = max / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step)
}

/** Column path: square at the baseline, 4px rounded data end. */
function columnPath(x: number, y: number, w: number, h: number) {
  if (h <= 0) return ''
  const r = Math.min(4, w / 2, h)
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

/** Column hanging below the baseline at y0: square at the baseline, rounded at the bottom. */
function columnDownPath(x: number, y0: number, w: number, h: number) {
  if (h <= 0) return ''
  const r = Math.min(4, w / 2, h)
  const b = y0 + h
  return `M${x},${y0}V${b - r}Q${x},${b} ${x + r},${b}H${x + w - r}Q${x + w},${b} ${x + w},${b - r}V${y0}Z`
}

export function Legend({ items }: { items: { label: string; color: string; line?: boolean }[] }) {
  return (
    <div className="legend">
      {items.map((i) => (
        <span key={i.label}>
          <i className={i.line ? 'key-line' : 'key-dot'} style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  )
}

function Tooltip({ x, width, children }: { x: number; width: number; children: ReactNode }) {
  // Keep the tooltip inside the chart: flip to the left of the pointer near the right edge.
  const left = x > width / 2
  return (
    <div className="tooltip" style={left ? { right: width - x + 10 } : { left: x + 10 }}>
      {children}
    </div>
  )
}

const PAD = { top: 12, right: 8, bottom: 24, left: 44 }

export interface PacePoint {
  day: number
  spent: number | null
  pace: number
}

/** Cumulative spending through the month against an even budget pace. */
export function PaceChart({ points, format, axisFormat, dayName }: {
  points: PacePoint[]
  format: (n: number) => string
  axisFormat: (n: number) => string
  dayName: (day: number) => string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const height = 180
  const innerW = Math.max(0, width - PAD.left - PAD.right)
  const innerH = height - PAD.top - PAD.bottom
  const max = Math.max(1, ...points.map((p) => Math.max(p.spent ?? 0, p.pace)))
  const ticks = niceTicks(max)
  const top = ticks[ticks.length - 1]
  const n = points.length
  const x = (day: number) => PAD.left + ((day - 1) / Math.max(1, n - 1)) * innerW
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH

  const spent = points.filter((p) => p.spent !== null) as (PacePoint & { spent: number })[]
  const line = spent.map((p, i) => `${i ? 'L' : 'M'}${x(p.day)},${y(p.spent)}`).join('')
  const area = spent.length ? `${line}L${x(spent[spent.length - 1].day)},${y(0)}L${x(spent[0].day)},${y(0)}Z` : ''
  const pace = `M${x(1)},${y(points[0]?.pace ?? 0)}L${x(n)},${y(points[n - 1]?.pace ?? 0)}`
  const last = spent[spent.length - 1]
  const h = hover !== null ? points[hover] : null

  const onMove = (clientX: number, rect: DOMRect) => {
    const day = Math.round(((clientX - rect.left - PAD.left) / innerW) * (n - 1)) + 1
    setHover(Math.min(n, Math.max(1, day)) - 1)
  }

  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Cumulative spending this month compared with budget pace">
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} />
              <text className="tick" x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end">
                {axisFormat(t)}
              </text>
            </g>
          ))}
          {[1, Math.ceil(n / 2), n].map((d) => (
            <text key={d} className="tick" x={x(d)} y={height - 6} textAnchor={d === 1 ? 'start' : d === n ? 'end' : 'middle'}>
              {d}
            </text>
          ))}
          {points[n - 1]?.pace > 0 && <path d={pace} className="pace-line" />}
          <path d={area} className="area expense" />
          <path d={line} className="line expense" />
          {last && <circle className="dot expense" cx={x(last.day)} cy={y(last.spent)} r={4.5} />}
          {h && (
            <>
              <line className="crosshair" x1={x(h.day)} x2={x(h.day)} y1={PAD.top} y2={PAD.top + innerH} />
              {h.spent !== null && <circle className="dot expense" cx={x(h.day)} cy={y(h.spent)} r={4.5} />}
            </>
          )}
          <rect
            className="hit"
            x={PAD.left}
            y={0}
            width={innerW}
            height={height}
            onPointerMove={(e) => onMove(e.clientX, (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect())}
            onPointerDown={(e) => onMove(e.clientX, (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect())}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
      )}
      {h && (
        <Tooltip x={x(h.day)} width={width}>
          <strong>{dayName(h.day)}</strong>
          {h.spent !== null && (
            <span>
              <i className="key-dot" style={{ background: 'var(--expense)' }} />
              Spent {format(h.spent)}
            </span>
          )}
          {h.pace > 0 && (
            <span>
              <i className="key-line" style={{ background: 'var(--pace)' }} />
              Budget pace {format(h.pace)}
            </span>
          )}
        </Tooltip>
      )}
    </div>
  )
}

export interface MonthBar {
  month: string
  label: string
  income: number
  expense: number
}

/** Income and expenses side by side for recent months. Tap a month to open it. */
export function MonthsChart({ bars, current, format, axisFormat, onSelect }: {
  bars: MonthBar[]
  current: string
  format: (n: number) => string
  axisFormat: (n: number) => string
  onSelect: (month: string) => void
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const height = 180
  const innerW = Math.max(0, width - PAD.left - PAD.right)
  const innerH = height - PAD.top - PAD.bottom
  const ticks = niceTicks(Math.max(1, ...bars.map((b) => Math.max(b.income, b.expense))))
  const top = ticks[ticks.length - 1]
  const band = innerW / Math.max(1, bars.length)
  const barW = Math.min(20, (band - 12) / 2)
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH
  const h = hover !== null ? bars[hover] : null

  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Income and expenses by month">
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} />
              <text className="tick" x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end">
                {axisFormat(t)}
              </text>
            </g>
          ))}
          {bars.map((b, i) => {
            const cx = PAD.left + band * i + band / 2
            return (
              <g key={b.month} className={hover !== null && hover !== i ? 'dim' : ''}>
                {hover === i && <rect className="band-hover" x={cx - band / 2 + 2} y={PAD.top} width={band - 4} height={innerH} rx={6} />}
                <path className="col income" d={columnPath(cx - barW - 1, y(b.income), barW, y(0) - y(b.income))} />
                <path className="col expense" d={columnPath(cx + 1, y(b.expense), barW, y(0) - y(b.expense))} />
                <text className={`tick ${b.month === current ? 'tick-current' : ''}`} x={cx} y={height - 6} textAnchor="middle">
                  {b.label}
                </text>
                <rect
                  className="hit"
                  x={cx - band / 2}
                  y={0}
                  width={band}
                  height={height}
                  onPointerEnter={() => setHover(i)}
                  onPointerDown={() => setHover(i)}
                  onPointerLeave={() => setHover(null)}
                  onClick={() => onSelect(b.month)}
                />
              </g>
            )
          })}
          <line className="baseline" x1={PAD.left} x2={width - PAD.right} y1={y(0)} y2={y(0)} />
        </svg>
      )}
      {h && hover !== null && (
        <Tooltip x={PAD.left + band * hover + band / 2} width={width}>
          <strong>{h.label}</strong>
          <span>
            <i className="key-dot" style={{ background: 'var(--income)' }} />
            Income {format(h.income)}
          </span>
          <span>
            <i className="key-dot" style={{ background: 'var(--expense)' }} />
            Expenses {format(h.expense)}
          </span>
          <span className="muted">Net {format(h.income - h.expense)}</span>
        </Tooltip>
      )}
    </div>
  )
}

/** Circular meter for the share of the budget spent. */
export function BudgetRing({ pct, size = 76 }: { pct: number; size?: number }) {
  const r = size / 2 - 6
  const c = 2 * Math.PI * r
  const level = pct > 100 ? 'critical' : pct > 85 ? 'warning' : 'ok'
  return (
    <svg width={size} height={size} className={`ring ${level}`} aria-hidden>
      <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} />
      <circle
        className="ring-fill"
        cx={size / 2}
        cy={size / 2}
        r={r}
        strokeDasharray={`${(Math.min(pct, 100) / 100) * c} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dy="0.35em" textAnchor="middle">
        {Math.round(pct)}%
      </text>
    </svg>
  )
}

export interface SavedBar {
  month: string
  label: string
  saved: number
}

/** Saved (or overspent) per month, as on the sheet's Analysis tab. Tap a month to open it. */
export function SavedChart({ bars, current, format, axisFormat, onSelect }: {
  bars: SavedBar[]
  current: string
  format: (n: number) => string
  axisFormat: (n: number) => string
  onSelect: (month: string) => void
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const height = 180
  const innerW = Math.max(0, width - PAD.left - PAD.right)
  const innerH = height - PAD.top - PAD.bottom
  const maxUp = Math.max(0, ...bars.map((b) => b.saved))
  const maxDown = Math.max(0, ...bars.map((b) => -b.saved))
  const upTicks = niceTicks(Math.max(maxUp, maxDown ? 0 : 1), 3)
  const step = upTicks[1] ?? niceTicks(maxDown, 3)[1] ?? 1
  const top = Math.max(upTicks[upTicks.length - 1], 0)
  const bottom = maxDown ? -Math.ceil(maxDown / step) * step : 0
  const ticks: number[] = []
  for (let t = bottom; t <= top + 1e-9; t += step) ticks.push(t)
  const y = (v: number) => PAD.top + ((top - v) / (top - bottom || 1)) * innerH
  const band = innerW / Math.max(1, bars.length)
  const barW = Math.min(24, band - 14)
  const h = hover !== null ? bars[hover] : null

  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Saved each month">
          {ticks.map((t) => (
            <g key={t}>
              <line className={t === 0 ? 'baseline' : 'grid'} x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} />
              <text className="tick" x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end">
                {axisFormat(t)}
              </text>
            </g>
          ))}
          {bars.map((b, i) => {
            const cx = PAD.left + band * i + band / 2
            const up = b.saved >= 0
            const hgt = Math.abs(y(b.saved) - y(0))
            const d = up ? columnPath(cx - barW / 2, y(b.saved), barW, hgt) : columnDownPath(cx - barW / 2, y(0), barW, hgt)
            return (
              <g key={b.month} className={hover !== null && hover !== i ? 'dim' : ''}>
                {hover === i && <rect className="band-hover" x={cx - band / 2 + 2} y={PAD.top} width={band - 4} height={innerH} rx={6} />}
                <path className={`col ${up ? 'income' : 'expense'}`} d={d} />
                <text className={`tick ${b.month === current ? 'tick-current' : ''}`} x={cx} y={height - 6} textAnchor="middle">
                  {b.label}
                </text>
                <rect
                  className="hit"
                  x={cx - band / 2}
                  y={0}
                  width={band}
                  height={height}
                  onPointerEnter={() => setHover(i)}
                  onPointerDown={() => setHover(i)}
                  onPointerLeave={() => setHover(null)}
                  onClick={() => onSelect(b.month)}
                />
              </g>
            )
          })}
        </svg>
      )}
      {h && hover !== null && (
        <Tooltip x={PAD.left + band * hover + band / 2} width={width}>
          <strong>{h.label}</strong>
          <span>
            <i className="key-dot" style={{ background: h.saved >= 0 ? 'var(--income)' : 'var(--expense)' }} />
            {h.saved >= 0 ? 'Saved' : 'Overspent'} {format(Math.abs(h.saved))}
          </span>
        </Tooltip>
      )}
    </div>
  )
}

export interface LinePoint {
  month: string
  label: string
  value: number
}

/** One value per month as a line, e.g. capital at each month's end. Tap a month to open it. */
export function LineChart({ points, current, format, axisFormat, label, onSelect }: {
  points: LinePoint[]
  current: string
  format: (n: number) => string
  axisFormat: (n: number) => string
  label: string
  onSelect: (month: string) => void
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const height = 180
  const innerW = Math.max(0, width - PAD.left - PAD.right)
  const innerH = height - PAD.top - PAD.bottom
  const ticks = niceTicks(Math.max(1, ...points.map((p) => p.value)))
  const top = ticks[ticks.length - 1]
  const n = points.length
  const band = innerW / Math.max(1, n)
  const x = (i: number) => PAD.left + band * i + band / 2
  const y = (v: number) => PAD.top + innerH - (Math.max(0, v) / top) * innerH
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.value)}`).join('')
  const area = n ? `${line}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z` : ''
  const h = hover !== null ? points[hover] : null

  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} />
              <text className="tick" x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end">
                {axisFormat(t)}
              </text>
            </g>
          ))}
          <path d={area} className="area accent" />
          <path d={line} className="line accent" />
          {points.map((p, i) => (
            <g key={p.month}>
              {(n <= 7 || i % 2 === (n - 1) % 2) && (
                <text className={`tick ${p.month === current ? 'tick-current' : ''}`} x={x(i)} y={height - 6} textAnchor="middle">
                  {p.label}
                </text>
              )}
              {(hover === i || i === n - 1) && <circle className="dot accent" cx={x(i)} cy={y(p.value)} r={4.5} />}
              <rect
                className="hit"
                x={x(i) - band / 2}
                y={0}
                width={band}
                height={height}
                onPointerEnter={() => setHover(i)}
                onPointerDown={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
                onClick={() => onSelect(p.month)}
              />
            </g>
          ))}
        </svg>
      )}
      {h && hover !== null && (
        <Tooltip x={x(hover)} width={width}>
          <strong>{h.label}</strong>
          <span>{format(h.value)}</span>
        </Tooltip>
      )}
    </div>
  )
}
