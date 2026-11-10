import { useEffect, useState, type MouseEvent } from 'react'
import { msg, t } from '../i18n'

// A short tour after the first-start setup, and from Settings › Show the guide.
// Each step opens the page it talks about and lights up the button it means.

export type GuideTab = 'summary' | 'transactions' | 'plan' | 'reports' | 'settings'
/** What a step points at: a page's tab, or the + button. */
export type GuideSpot = GuideTab | 'add'

interface Step {
  icon: string
  title: string
  lines: string[]
  /** The page shown behind the card. */
  tab: GuideTab
  spot?: GuideSpot
}

const STEPS: Step[] = [
  {
    icon: '👋',
    title: msg('A quick tour'),
    lines: [msg('Your accounts are ready. This short tour shows what each page does and how to add your money in and out.'), msg('Tap Next to go on, or Skip to start using the app.')],
    tab: 'summary',
  },
  {
    icon: '📊',
    title: msg('Summary'),
    lines: [
      msg('Your month at a glance: how much you have left to spend, your income and spending, every account balance and what you owe.'),
      msg('Tap any row to see the entries behind it. Tap the month at the top to look at another month.'),
    ],
    tab: 'summary',
    spot: 'summary',
  },
  {
    icon: '💸',
    title: msg('Add an expense'),
    lines: [
      msg('Tap the + button, then Expense.'),
      msg('Type the amount, pick a category, and pick the account you paid from.'),
      msg('Tap Add expense. That account goes down by the amount.'),
    ],
    tab: 'summary',
    spot: 'add',
  },
  {
    icon: '💰',
    title: msg('Add income'),
    lines: [msg('Tap +, then Income.'), msg('Type the amount, pick a category like Salary, and pick the account it went into.'), msg('That account goes up by the amount.')],
    tab: 'summary',
    spot: 'add',
  },
  {
    icon: '🔁',
    title: msg('Move money between accounts'),
    lines: [
      msg('Tap +, then Transfer. Pick where the money comes from and where it goes.'),
      msg('For example: Bank to Cash when you take money from an ATM, or Bank to Thndr when you invest.'),
      msg("A transfer isn't spending. Your total stays the same; only where the money sits changes. If the bank took a fee, pick it under Fee."),
    ],
    tab: 'summary',
    spot: 'add',
  },
  {
    icon: '💳',
    title: msg('Debts and instalments'),
    lines: [
      msg('Each lender is its own debt, like valU, TRU or a credit card, so you always see what you owe each one. Add more in Settings › Money › Debts.'),
      msg('Bought something on instalments? Tap +, then Debt, choose I borrowed, and pick the lender.'),
      msg('Paid an instalment? Tap +, then Debt, choose I paid back, pick the lender and the account you paid from.'),
    ],
    tab: 'summary',
    spot: 'add',
  },
  {
    icon: '📋',
    title: msg('Transactions'),
    lines: [msg("Every entry for the month, newest first, grouped by day."), msg('Tap an entry to change it or delete it.')],
    tab: 'transactions',
    spot: 'transactions',
  },
  {
    icon: '✏️',
    title: msg('Plan'),
    lines: [
      msg('Set how much you want to spend in each category this month, and the income you expect.'),
      msg("Summary then shows what's left in each one, and the app warns you when you get close to a limit."),
    ],
    tab: 'plan',
    spot: 'plan',
  },
  {
    icon: '📈',
    title: msg('Reports'),
    lines: [msg('Charts over the months: where your money goes, income against spending, and how much you saved.')],
    tab: 'reports',
    spot: 'reports',
  },
  {
    icon: '⚙️',
    title: msg('Settings'),
    lines: [
      msg('Change your accounts, debts, categories and opening balances.'),
      msg('Bill reminders, savings goals, language, theme and backup are here too.'),
      msg('You can watch this tour again any time from Settings.'),
    ],
    tab: 'settings',
    spot: 'settings',
  },
  {
    icon: '✅',
    title: msg("You're all set"),
    lines: [msg('Start by adding today’s expenses with the + button. A minute a day keeps your budget right.')],
    tab: 'summary',
    spot: 'add',
  },
]

interface Props {
  /** Shows a page behind the card and lights up what the step points at. */
  onStep: (tab: GuideTab, spot: GuideSpot | undefined) => void
  onDone: () => void
}

export function Guide({ onStep, onDone }: Props) {
  const [i, setI] = useState(0)
  const step = STEPS[i]
  const last = i === STEPS.length - 1
  useEffect(() => onStep(step.tab, step.spot), [step, onStep])

  // The phone's back gesture clicks the backdrop (see closeTopPopup): go back a step, or
  // close on the first. A real tap outside the card does nothing, so a stray touch can't end it.
  const onBackdrop = (e: MouseEvent) => {
    if (e.target !== e.currentTarget || e.isTrusted) return
    if (i > 0) setI(i - 1)
    else onDone()
  }

  return (
    <div className="sheet-backdrop guide-backdrop" onClick={onBackdrop}>
      <section className="guide-card" role="dialog" aria-modal="true" aria-labelledby="guide-title">
        <div className="guide-top">
          <span className="guide-icon" aria-hidden>
            {step.icon}
          </span>
          <span className="muted small">{t('{n} of {total}', { n: i + 1, total: STEPS.length })}</span>
          {!last && (
            <button className="link guide-skip" onClick={onDone}>
              {t('Skip')}
            </button>
          )}
        </div>
        <h2 id="guide-title">{t(step.title)}</h2>
        <ul className="guide-lines">
          {step.lines.map((l) => (
            <li key={l}>{t(l)}</li>
          ))}
        </ul>
        <div className="guide-dots" aria-hidden>
          {STEPS.map((_, j) => (
            <span key={j} className={j === i ? 'on' : ''} />
          ))}
        </div>
        <div className="row">
          {i > 0 && <button onClick={() => setI(i - 1)}>{t('Back')}</button>}
          <button className="primary grow" autoFocus onClick={() => (last ? onDone() : setI(i + 1))}>
            {last ? t('Start using the app') : t('Next')}
          </button>
        </div>
      </section>
    </div>
  )
}
