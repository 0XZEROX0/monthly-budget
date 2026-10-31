import { useEffect, useRef, useState } from 'react'

// In-app replacements for alert(), confirm() and prompt(), which on Android show the
// system's plain grey dialog. Call them from anywhere; <DialogHost /> shows them.

interface Request {
  kind: 'alert' | 'confirm' | 'prompt' | 'form' | 'choice' | 'month'
  message: string
  title?: string
  ok?: string
  danger?: boolean
  placeholder?: string
  initial?: string
  inputMode?: 'text' | 'decimal'
  fields?: Field[]
  choices?: Choice[]
  current?: string
  /** Month dialog: the earliest and latest months that can be picked (YYYY-MM). */
  min?: string
  max?: string
  resolve: (v: Answer) => void
}

/** One input of a form dialog; an icon field shows a grid of icons to tap. */
export interface Field {
  key: string
  label: string
  placeholder?: string
  inputMode?: 'text' | 'decimal'
  /** 'date' gives the system's date picker; the value is YYYY-MM-DD. */
  type?: 'text' | 'date'
  initial?: string
  icons?: string[]
}

/** One option of a choice dialog. */
export interface Choice {
  value: string
  label: string
  icon?: string
}
type Answer = string | boolean | Record<string, string> | null

let show: ((r: Request) => void) | null = null
const queue: Request[] = []

function open(r: Omit<Request, 'resolve'>) {
  return new Promise<Answer>((resolve) => {
    const req = { ...r, resolve }
    if (show) show(req)
    else queue.push(req)
  })
}

type Opts = { title?: string; ok?: string; danger?: boolean }

export const showAlert = (message: string, opts: Opts = {}) => open({ kind: 'alert', message, ...opts }).then(() => undefined)
export const ask = (message: string, opts: Opts = {}) => open({ kind: 'confirm', message, ...opts }).then((v) => v === true)
export const askText = (message: string, opts: Opts & { placeholder?: string; initial?: string; inputMode?: 'text' | 'decimal' } = {}) =>
  open({ kind: 'prompt', message, ...opts }).then((v) => (typeof v === 'string' ? v : null))
/** A list to pick one from, in place of the system's dropdown; resolves with its value, or null. */
export const askChoice = (title: string, choices: Choice[], current?: string) =>
  open({ kind: 'choice', message: '', title, choices, current }).then((v) => (typeof v === 'string' ? v : null))
/** Several inputs at once; resolves with the typed values by key, or null if cancelled. */
export const askForm = (message: string, fields: Field[], opts: Opts = {}) =>
  open({ kind: 'form', message, fields, ...opts }).then((v) => (v && typeof v === 'object' ? v : null))

/** A year box and a month box, each with up and down arrows (or tap for a list); resolves with YYYY-MM, or null. */
export const askMonth = (title: string, current: string, min: string, max: string) =>
  open({ kind: 'month', message: '', title, current, min, max, ok: 'Show' }).then((v) => (typeof v === 'string' ? v : null))

/** Mounted once at the root of the app. */
export function DialogHost() {
  const [list, setList] = useState<Request[]>([])
  useEffect(() => {
    show = (r) => setList((l) => [...l, r])
    if (queue.length) setList(queue.splice(0))
    return () => {
      show = null
    }
  }, [])
  const current = list[0]
  if (!current) return null
  const done = (v: Answer) => {
    current.resolve(v)
    setList((l) => l.slice(1))
  }
  return <Dialog key={list.length + current.message} req={current} onDone={done} />
}

function Dialog({ req, onDone }: { req: Request; onDone: (v: Answer) => void }) {
  const [text, setText] = useState(req.initial ?? req.current ?? '')
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries((req.fields ?? []).filter((f) => f.initial != null).map((f) => [f.key, f.initial!])))
  const input = useRef<HTMLInputElement>(null)
  const typed = req.kind === 'prompt' || req.kind === 'form'
  const cancel = () => onDone(typed || req.kind === 'choice' ? null : false)
  const accept = () => onDone(req.kind === 'form' ? values : req.kind === 'prompt' || req.kind === 'month' ? text : true)
  useEffect(() => {
    // Opens the keyboard straight away for a question that needs typing.
    if (typed) setTimeout(() => input.current?.focus(), 60)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cancel()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="sheet-backdrop dialog-backdrop app-dialog" onClick={cancel}>
      <form
        className="dialog"
        role={req.kind === 'alert' ? 'alertdialog' : 'dialog'}
        aria-label={req.title ?? req.message}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          accept()
        }}
      >
        {req.title && <h2>{req.title}</h2>}
        {req.message && <p className={req.title ? 'muted small' : ''}>{req.message}</p>}
        {req.choices && (
          <div className="choice-list" role="listbox" aria-label={req.title}>
            {req.choices.map((c) => (
              <button type="button" role="option" aria-selected={c.value === req.current} key={c.value} className={c.value === req.current ? 'active' : ''} onClick={() => onDone(c.value)}>
                {c.icon && <span className="choice-icon">{c.icon}</span>}
                <span className="grow">{c.label}</span>
                {c.value === req.current && <span aria-hidden>✓</span>}
              </button>
            ))}
          </div>
        )}
        {req.kind === 'month' && <MonthPicker value={text} min={req.min!} max={req.max!} onChange={setText} />}
        {req.kind === 'prompt' && (
          <input ref={input} value={text} onChange={(e) => setText(e.target.value)} placeholder={req.placeholder} inputMode={req.inputMode} enterKeyHint="done" />
        )}
        {req.fields?.map((f, i) =>
          f.icons ? (
            <div className="field" key={f.key}>
              <span className="field-label">{f.label}</span>
              <div className="icon-grid" role="radiogroup" aria-label={f.label}>
                {f.icons.map((ic) => (
                  <button type="button" role="radio" aria-checked={values[f.key] === ic} key={ic} className={values[f.key] === ic ? 'active' : ''} onClick={() => setValues((v) => ({ ...v, [f.key]: ic }))}>
                    {ic}
                  </button>
                ))}
              </div>
            </div>
          ) : (
          <label className="field" key={f.key}>
            <span className="field-label">{f.label}</span>
            <input
              ref={i === 0 ? input : undefined}
              value={values[f.key] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              placeholder={f.placeholder}
              inputMode={f.inputMode}
              type={f.type}
            />
          </label>
          ),
        )}
        <div className="row">
          {req.kind !== 'alert' && (
            <button type="button" className="grow" onClick={cancel}>
              Cancel
            </button>
          )}
          {req.kind !== 'choice' && <button className={`grow ${req.danger ? 'danger solid' : 'primary'}`}>{req.ok ?? (req.kind === 'alert' ? 'OK' : typed ? 'Add' : 'OK')}</button>}
        </div>
      </form>
    </div>
  )
}

const MONTH_NAMES = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString(undefined, { month: 'long' }))
const pad = (n: number) => String(n).padStart(2, '0')

/** Two boxes, year and month: the arrows step through them, and tapping the value opens its list. */
function MonthPicker({ value, min, max, onChange }: { value: string; min: string; max: string; onChange: (v: string) => void }) {
  const [list, setList] = useState<'year' | 'month' | null>(null)
  const [y, m] = value.split('-').map(Number)
  const [minY, minM] = min.split('-').map(Number)
  const [maxY, maxM] = max.split('-').map(Number)
  const clamp = (v: string) => (v < min ? min : v > max ? max : v)
  const set = (year: number, month: number) => onChange(clamp(`${year}-${pad(month)}`))
  const years = Array.from({ length: maxY - minY + 1 }, (_, i) => maxY - i)
  const allowed = (month: number) => !((y === minY && month < minM) || (y === maxY && month > maxM))
  const stepMonth = (d: number) => {
    let month = m + d
    let year = y
    if (month < 1) (month = 12), (year -= 1)
    if (month > 12) (month = 1), (year += 1)
    set(year, month)
  }
  const box = (kind: 'year' | 'month', label: string, shown: string, up: () => void, down: () => void, canUp: boolean, canDown: boolean) => (
    <div className="month-box">
      <span className="field-label">{label}</span>
      <button type="button" className="month-step" aria-label={`Next ${kind}`} disabled={!canUp} onClick={up}>
        ▲
      </button>
      <button type="button" className={`month-value ${list === kind ? 'active' : ''}`} aria-label={`Choose ${kind}`} onClick={() => setList(list === kind ? null : kind)}>
        {shown}
      </button>
      <button type="button" className="month-step" aria-label={`Previous ${kind}`} disabled={!canDown} onClick={down}>
        ▼
      </button>
    </div>
  )
  return (
    <div className="month-picker">
      <div className="month-boxes">
        {box('month', 'Month', MONTH_NAMES[m - 1], () => stepMonth(1), () => stepMonth(-1), value < max, value > min)}
        {box('year', 'Year', String(y), () => set(y + 1, m), () => set(y - 1, m), y < maxY, y > minY)}
      </div>
      {list && (
        <div className={`choice-list month-list ${list}`} role="listbox" aria-label={list === 'year' ? 'Year' : 'Month'}>
          {list === 'year'
            ? years.map((year) => (
                <button type="button" role="option" aria-selected={year === y} key={year} className={year === y ? 'active' : ''} onClick={() => (set(year, m), setList(null))}>
                  {year}
                </button>
              ))
            : MONTH_NAMES.map((name, i) => (
                <button type="button" role="option" aria-selected={i + 1 === m} key={name} disabled={!allowed(i + 1)} className={i + 1 === m ? 'active' : ''} onClick={() => (set(y, i + 1), setList(null))}>
                  {name}
                </button>
              ))}
        </div>
      )}
    </div>
  )
}
