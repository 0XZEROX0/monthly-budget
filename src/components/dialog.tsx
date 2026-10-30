import { useEffect, useRef, useState } from 'react'

// In-app replacements for alert(), confirm() and prompt(), which on Android show the
// system's plain grey dialog. Call them from anywhere; <DialogHost /> shows them.

interface Request {
  kind: 'alert' | 'confirm' | 'prompt' | 'form'
  message: string
  title?: string
  ok?: string
  danger?: boolean
  placeholder?: string
  initial?: string
  inputMode?: 'text' | 'decimal'
  fields?: Field[]
  resolve: (v: Answer) => void
}

/** One input of a form dialog. */
export interface Field {
  key: string
  label: string
  placeholder?: string
  inputMode?: 'text' | 'decimal'
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
/** Several inputs at once; resolves with the typed values by key, or null if cancelled. */
export const askForm = (message: string, fields: Field[], opts: Opts = {}) =>
  open({ kind: 'form', message, fields, ...opts }).then((v) => (v && typeof v === 'object' ? v : null))

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
  const [text, setText] = useState(req.initial ?? '')
  const [values, setValues] = useState<Record<string, string>>({})
  const input = useRef<HTMLInputElement>(null)
  const typed = req.kind === 'prompt' || req.kind === 'form'
  const cancel = () => onDone(typed ? null : false)
  const accept = () => onDone(req.kind === 'form' ? values : req.kind === 'prompt' ? text : true)
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
        <p className={req.title ? 'muted small' : ''}>{req.message}</p>
        {req.kind === 'prompt' && (
          <input ref={input} value={text} onChange={(e) => setText(e.target.value)} placeholder={req.placeholder} inputMode={req.inputMode} enterKeyHint="done" />
        )}
        {req.fields?.map((f, i) => (
          <label className="field" key={f.key}>
            <span className="field-label">{f.label}</span>
            <input
              ref={i === 0 ? input : undefined}
              value={values[f.key] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              placeholder={f.placeholder}
              inputMode={f.inputMode}
            />
          </label>
        ))}
        <div className="row">
          {req.kind !== 'alert' && (
            <button type="button" className="grow" onClick={cancel}>
              Cancel
            </button>
          )}
          <button className={`grow ${req.danger ? 'danger solid' : 'primary'}`}>{req.ok ?? (req.kind === 'alert' ? 'OK' : typed ? 'Add' : 'OK')}</button>
        </div>
      </form>
    </div>
  )
}
