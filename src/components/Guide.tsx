import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import { msg, t } from '../i18n'

// A short tour after the first-start setup, and from Settings › How to use the app.
// Each step shows a small speech bubble next to the button or section it's about, with an
// arrow pointing at it; everything else is dimmed. Steps open the page (or the add form,
// or the Settings section) they talk about first.

export type GuideTab = 'summary' | 'transactions' | 'plan' | 'reports' | 'settings'
/** The add form's four kinds. */
export type GuideForm = 'expense' | 'income' | 'transfer' | 'debt'

export interface GuideStep {
  title: string
  text: string
  /** The page shown behind the bubble. */
  tab: GuideTab
  /** What the bubble points at: an element marked data-guide="…". None: a bubble in the middle. */
  target?: string
  /** Opens the add form on this kind. */
  form?: GuideForm
  /** Opens this Settings section. */
  group?: string
}

const group = (id: string, title: string, text: string): GuideStep => ({ title, text, tab: 'settings', group: id, target: `group-${id}` })

const STEPS: GuideStep[] = [
  { title: msg('Welcome!'), text: msg('A quick tour of the app. Tap Next to go on.'), tab: 'summary' },
  { title: msg('Summary'), text: msg("Your month at a glance: what's left to spend, your balances and your debts. Tap any row for details."), tab: 'summary', target: 'summary' },
  { title: msg('Add'), text: msg('Tap + to add money going out or coming in.'), tab: 'summary', target: 'add' },
  { title: msg('Expense'), text: msg('Money you spend. Type the amount, pick a category and the account you paid from.'), tab: 'summary', form: 'expense', target: 'form-expense' },
  { title: msg('Income'), text: msg('Money you receive, like your salary. Pick the account it went into.'), tab: 'summary', form: 'income', target: 'form-income' },
  { title: msg('Transfer'), text: msg("Moving money between your accounts, like Bank to Cash. It isn't spending."), tab: 'summary', form: 'transfer', target: 'form-transfer' },
  { title: msg('Debt'), text: msg('Instalments and loans, one debt per lender. I borrowed adds to it, I paid back lowers it.'), tab: 'summary', form: 'debt', target: 'form-debt' },
  { title: msg('Transactions'), text: msg('Every entry this month. Tap one to change or delete it.'), tab: 'transactions', target: 'transactions' },
  { title: msg('Plan'), text: msg("Set a budget for each category. Summary shows what's left."), tab: 'plan', target: 'plan' },
  { title: msg('Reports'), text: msg('Charts of your spending and income over the months.'), tab: 'reports', target: 'reports' },
  { title: msg('Settings'), text: msg("Your accounts, categories and more. Let's look inside."), tab: 'settings', target: 'settings' },
  group('money', msg('Money'), msg('Your accounts, debts and their limits, and opening balances.')),
  group('categories', msg('Categories'), msg('Tap + New to add a category with its icon. Tap one to rename it, hold and drag to reorder.')),
  group('planning', msg('Bills, goals and alerts'), msg('Bill reminders, savings goals, and a warning when you near your budget.')),
  group('sms', msg('Bank SMS'), msg('In the Android app, tap Allow access to SMS. Payments from your bank messages then wait for you to add them.')),
  group('look', msg('Look and security'), msg('Colours, dark mode and an app lock.')),
  group('data', msg('Backup and import'), msg('Back up to Google Drive, or import from Excel.')),
  { title: msg('How to use the app'), text: msg('Watch this tour again any time from here.'), tab: 'settings', target: 'again' },
  { title: msg("You're all set"), text: msg("Start by adding today's expenses with the + button."), tab: 'summary' },
]

/** The element a step points at, as drawn now: not a neighbouring page kept off screen, nor a hidden panel. */
function findTarget(name: string): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>(`[data-guide="${name}"]`)
  for (const el of all) if (!el.closest('.pager-peek, [inert]') && el.getClientRects().length) return el
  return null
}

interface Box {
  top: number
  left: number
  width: number
  height: number
}

const same = (a: Box | null, b: Box | null) => a === b || (!!a && !!b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height)

interface Props {
  /** Shows the page (or add form, or Settings section) a step is about. */
  onStep: (step: GuideStep) => void
  onDone: () => void
}

export function Guide({ onStep, onDone }: Props) {
  const [i, setI] = useState(0)
  const step = STEPS[i]
  const last = i === STEPS.length - 1
  useEffect(() => onStep(step), [step, onStep])

  // Where the target is, followed every frame: pages slide, the form rises and sections
  // scroll into view after a step starts.
  const [box, setBox] = useState<Box | null>(null)
  useEffect(() => {
    let frame = 0
    let seen: Box | null = null
    const follow = () => {
      const el = step.target ? findTarget(step.target) : null
      const r = el?.getBoundingClientRect()
      const next = r ? { top: r.top, left: r.left, width: r.width, height: r.height } : null
      if (!same(seen, next)) setBox((seen = next))
      frame = requestAnimationFrame(follow)
    }
    follow()
    return () => cancelAnimationFrame(frame)
  }, [step])

  // The bubble goes on whichever side of the target has more room, kept on screen.
  const bubble = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<{ top: number; left: number; arrow: number; side: 'below' | 'above' | 'beside' } | null>(null)
  useLayoutEffect(() => {
    const el = bubble.current
    if (!el || !box) return setPlace(null)
    const vw = window.innerWidth
    const vh = window.innerHeight
    const w = el.offsetWidth
    const h = el.offsetHeight
    const gap = 16
    // A tall target (the desktop Reports panel): beside it, where there's room.
    if (box.height > vh * 0.5) {
      const left = box.left - w - gap >= 12 ? box.left - w - gap : Math.min(box.left + box.width + gap, vw - w - 12)
      return setPlace({ top: Math.min(Math.max(box.top + 24, 8), vh - h - 8), left, arrow: 0, side: 'beside' })
    }
    const below = box.top + box.height / 2 < vh / 2
    const top = below ? Math.min(box.top + box.height + gap, vh - h - 8) : Math.max(box.top - gap - h, 8)
    const center = box.left + box.width / 2
    const left = Math.min(Math.max(center - w / 2, 12), vw - w - 12)
    setPlace({ top, left, arrow: Math.min(Math.max(center - left, 22), w - 22), side: below ? 'below' : 'above' })
  }, [box, i])

  // The phone's back gesture clicks the backdrop (see closeTopPopup): go back a step, or
  // close on the first. A real tap outside the bubble does nothing, so a stray touch can't end it.
  const onBackdrop = (e: MouseEvent) => {
    if (e.isTrusted) return
    if (i > 0) setI(i - 1)
    else onDone()
  }

  const pad = 6
  return (
    <>
      <div className={`sheet-backdrop guide-backdrop ${box ? 'clear' : ''}`} onClick={onBackdrop} />
      {box && (
        <div
          className="guide-hole"
          aria-hidden
          style={{ top: box.top - pad, left: box.left - pad, width: box.width + pad * 2, height: box.height + pad * 2 }}
        />
      )}
      <div
        ref={bubble}
        className={`guide-bubble ${box ? (place?.side ?? 'below') : 'middle'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-title"
        style={box && place ? { top: place.top, left: place.left, ['--arrow' as string]: `${place.arrow}px` } : box ? { visibility: 'hidden' } : undefined}
      >
        <h2 id="guide-title">{t(step.title)}</h2>
        <p>{t(step.text)}</p>
        <div className="guide-foot">
          <span className="muted small">{t('{n} of {total}', { n: i + 1, total: STEPS.length })}</span>
          {!last && (
            <button className="link small" onClick={onDone}>
              {t('Skip')}
            </button>
          )}
          <span className="spacer" />
          {i > 0 && (
            <button className="small" onClick={() => setI(i - 1)}>
              {t('Back')}
            </button>
          )}
          <button className="primary small" autoFocus onClick={() => (last ? onDone() : setI(i + 1))}>
            {last ? t('Done') : t('Next')}
          </button>
        </div>
      </div>
    </>
  )
}
