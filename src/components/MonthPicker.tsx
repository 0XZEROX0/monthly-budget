import { useState } from 'react'
import { currentMonth, formatDateWith } from '../data/month'
import { t } from '../i18n'

interface Props {
  month: string
  onPick: (month: string) => void
  onClose: () => void
}

const months = () => Array.from({ length: 12 }, (_, i) => formatDateWith(new Date(2000, i, 1), { month: 'short' }))

/** A year of months to jump to; the year arrows only change the year shown. */
export function MonthPicker({ month, onPick, onClose }: Props) {
  const [year, setYear] = useState(Number(month.slice(0, 4)))
  const now = currentMonth()
  return (
    <div className="sheet-backdrop picker-backdrop" onClick={onClose}>
      <div className="sheet picker" role="dialog" aria-label={t('Choose a month')} onClick={(e) => e.stopPropagation()}>
        <div className="picker-head">
          <button className="icon ghost" aria-label={t('Previous year')} onClick={() => setYear((y) => y - 1)}>
            ‹
          </button>
          <strong>{year}</strong>
          <button className="icon ghost" aria-label={t('Next year')} onClick={() => setYear((y) => y + 1)}>
            ›
          </button>
        </div>
        <div className="picker-grid">
          {months().map((label, i) => {
            const m = `${year}-${String(i + 1).padStart(2, '0')}`
            return (
              <button
                key={m}
                className={`${m === month ? 'active' : ''} ${m === now ? 'today' : ''}`}
                aria-current={m === month ? 'date' : undefined}
                onClick={() => {
                  onPick(m)
                  onClose()
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
        {month !== now && (
          <button
            className="link center-link"
            onClick={() => {
              onPick(now)
              onClose()
            }}
          >
            {t('Go to current month')}
          </button>
        )}
      </div>
    </div>
  )
}
