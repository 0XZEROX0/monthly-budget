import { SUMMARY_SECTIONS, type SectionKey, type SummaryLayout } from '../data/summaryLayout'
import { useReorder } from './useReorder'

/** Reorder the Summary cards by holding and dragging, and hide the ones you don't need. */
export function LayoutEditor({ layout, onChange, onDone }: { layout: SummaryLayout; onChange: (l: SummaryLayout) => void; onDone: () => void }) {
  const reorder = useReorder(layout.order, (order) => onChange({ ...layout, order: order as SectionKey[] }))
  const toggle = (k: SectionKey) => onChange({ ...layout, hidden: layout.hidden.includes(k) ? layout.hidden.filter((x) => x !== k) : [...layout.hidden, k] })
  const info = (k: string) => SUMMARY_SECTIONS.find((s) => s.key === k)!
  return (
    <div className="stack">
      <section className="card">
        <div className="card-head">
          <h2>Edit Summary layout</h2>
          <button className="primary small-btn" onClick={onDone}>
            Done
          </button>
        </div>
        <p className="muted small">Hold a card and drag it to move it. Tap the eye to show or hide it. Changes save as you go.</p>
        <ul className="layout-list">
          {reorder.order.map((k) => {
            const shown = !layout.hidden.includes(k as SectionKey)
            return (
              <li key={k} {...reorder.itemProps(k, shown ? '' : 'layout-off')}>
                <span className="layout-grip" aria-hidden>
                  ⠿
                </span>
                <span className="cat-icon plan-icon">{info(k).icon}</span>
                <span className="grow">{info(k).label}</span>
                <button className="icon ghost" aria-label={`${shown ? 'Hide' : 'Show'} ${info(k).label}`} aria-pressed={shown} onClick={() => toggle(k as SectionKey)}>
                  {shown ? '👁' : '🚫'}
                </button>
              </li>
            )
          })}
        </ul>
        <button className="link" onClick={() => onChange({ order: SUMMARY_SECTIONS.map((s) => s.key), hidden: [] })}>
          Reset to the default layout
        </button>
      </section>
    </div>
  )
}
