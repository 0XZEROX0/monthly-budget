import { useEffect, useState, type MouseEvent } from 'react'
import { msg, t } from '../i18n'

// A short tour after the first-start setup, and from Settings › Show the guide.
// Each step opens the page it talks about and lights up the button it means.

export type GuideTab = 'summary' | 'transactions' | 'plan' | 'reports' | 'settings'
/** What a step points at: a page's tab, or the + button. */
export type GuideSpot = GuideTab | 'add'
/** The add form's four kinds. */
export type GuideForm = 'expense' | 'income' | 'transfer' | 'debt'

/** A bullet, or a bold heading followed by its text. */
type Line = string | [string, string]

export interface GuideStep {
  icon: string
  title: string
  lines: Line[]
  /** The page shown behind the card. */
  tab: GuideTab
  spot?: GuideSpot
  /** Opens the add form on this kind and points at its button. */
  form?: GuideForm
  /** Opens this Settings section and points at it. */
  group?: string
}

const STEPS: GuideStep[] = [
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
    icon: '➕',
    title: msg('The + button'),
    lines: [
      msg('Tap + whenever money comes in or goes out.'),
      msg("It opens one form with four kinds: Expense, Income, Transfer and Debt. Let's look at each one."),
    ],
    tab: 'summary',
    spot: 'add',
  },
  {
    icon: '💸',
    title: msg('Expense'),
    lines: [
      msg('For anything you pay for: food, bills, shopping.'),
      msg('Type the amount, pick a category, and pick the account you paid from.'),
      msg('You can change the date and time, and add a note or a fee. Tap Add expense: that account goes down by the amount.'),
    ],
    tab: 'summary',
    form: 'expense',
  },
  {
    icon: '💰',
    title: msg('Income'),
    lines: [
      msg('For money you receive: your salary, a bonus, money paid back to you.'),
      msg('Type the amount, pick a category like Salary, and pick the account it went into.'),
      msg('Tap Add income: that account goes up by the amount.'),
    ],
    tab: 'summary',
    form: 'income',
  },
  {
    icon: '🔁',
    title: msg('Transfer'),
    lines: [
      msg('For moving your own money from one account to another. Pick From and To.'),
      msg('For example: Bank to Cash when you take money from an ATM, or Bank to Thndr when you invest.'),
      msg("A transfer isn't spending. Your total stays the same; only where the money sits changes. If the bank took a fee, pick it under Fee."),
    ],
    tab: 'summary',
    form: 'transfer',
  },
  {
    icon: '💳',
    title: msg('Debt'),
    lines: [
      msg('Each lender is its own debt (valU, TRU, a credit card), so you see what you owe each one.'),
      [msg('I borrowed'), msg('you bought on instalments or took a loan. The debt goes up.')],
      [msg('I paid back'), msg('you paid an instalment from one of your accounts. The debt goes down.')],
      msg('More lenders: Settings › Money › Debts.'),
    ],
    tab: 'summary',
    form: 'debt',
  },
  {
    icon: '📋',
    title: msg('Transactions'),
    lines: [msg('Every entry for the month, newest first, grouped by day.'), msg('Tap an entry to change it or delete it.')],
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
      [msg('Language'), msg('English or Arabic.')],
      [msg('Money'), msg('your currency, accounts, debts and their limits, and opening balances.')],
      [msg('Categories'), msg('your expense and income categories, with their icons and order.')],
      [msg('Bills, goals and alerts'), msg('reminders for bills and instalments, savings goals, and a warning when you get near your budget.')],
      [msg('Bank SMS'), msg('add payments from your bank messages (Android app).')],
      [msg('Look and security'), msg('colours, dark mode, decimals, the clock and an app lock.')],
      [msg('Backup and import'), msg('back up to Google Drive, export a spreadsheet, or import from Excel.')],
      [msg('Feedback'), msg('send an idea or report a problem.')],
      [msg('App'), msg('updates, and erasing your data. You can also watch this tour again from Settings.')],
    ],
    tab: 'settings',
    spot: 'settings',
  },
  {
    icon: '🏷️',
    title: msg('Set up your categories'),
    lines: [
      msg('Open Settings › Categories to see your expense and income categories.'),
      msg('Tap + New to add one and pick its icon. Tap a category to rename it or change its icon, or hold and drag it to change the order.'),
      msg('You can also add one while adding an entry: tap + New under Category.'),
    ],
    tab: 'settings',
    group: 'categories',
  },
  {
    icon: '✉️',
    title: msg('Add payments from bank SMS'),
    lines: [
      msg('In the Android app, your bank and e-wallet messages can become entries, so you type less.'),
      msg('To turn it on: Settings › Bank SMS › Allow access to SMS, then tap Allow when Android asks.'),
      msg('Pick which account or debt each card belongs to. New payments then wait at the top of Summary and Transactions: tap one, check the category, and add it. Nothing is added on its own.'),
    ],
    tab: 'settings',
    group: 'sms',
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
  /** Shows a page (or the add form) behind the card and lights up what the step points at. */
  onStep: (step: GuideStep) => void
  onDone: () => void
}

export function Guide({ onStep, onDone }: Props) {
  const [i, setI] = useState(0)
  const step = STEPS[i]
  const last = i === STEPS.length - 1
  useEffect(() => onStep(step), [step, onStep])

  // The phone's back gesture clicks the backdrop (see closeTopPopup): go back a step, or
  // close on the first. A real tap outside the card does nothing, so a stray touch can't end it.
  const onBackdrop = (e: MouseEvent) => {
    if (e.target !== e.currentTarget || e.isTrusted) return
    if (i > 0) setI(i - 1)
    else onDone()
  }

  return (
    // With the add form open the card sits at the bottom, over the form, leaving its kinds in view.
    // The card is drawn beside the dimming, not in it, so it stays above whatever is lit up.
    <>
      <div className={`sheet-backdrop guide-backdrop ${step.form ? 'over-form' : ''}`} onClick={onBackdrop} />
      <div className={`guide-wrap ${step.form ? 'over-form' : ''}`}>
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
          {step.lines.map((l) =>
            typeof l === 'string' ? (
              <li key={l}>{t(l)}</li>
            ) : (
              <li key={l[0]}>
                <strong>{t(l[0])}</strong>
                {t(': ')}
                {t(l[1])}
              </li>
            ),
          )}
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
    </>
  )
}
