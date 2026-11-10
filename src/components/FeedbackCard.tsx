import { Capacitor } from '@capacitor/core'
import type { User } from 'firebase/auth'
import { useState } from 'react'
import { BUILD } from '../data/appUpdate'
import { firestore } from '../data/firebase'
import { FEEDBACK_GAP_S, FEEDBACK_MAX, sendFeedback, type FeedbackKind } from '../data/feedback'
import { showAlert } from './dialog'

const LAST_KEY = 'budget-app:feedback-last'
const lastSent = () => {
  try {
    return Number(localStorage.getItem(LAST_KEY)) || 0
  } catch {
    return 0
  }
}

const KINDS: { id: FeedbackKind; label: string; hint: string }[] = [
  { id: 'idea', label: '💡 Idea', hint: 'A feature you would like, or something that could work better.' },
  { id: 'bug', label: '🐞 Problem', hint: 'What you did, what you expected, and what happened instead.' },
]

/** Settings › Feedback: send an idea or a bug report to the developer. */
export function FeedbackCard({ user }: { user: User | null | undefined }) {
  const [kind, setKind] = useState<FeedbackKind>('idea')
  const [message, setMessage] = useState('')
  const [reply, setReply] = useState(true)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  if (!user || !firestore) {
    return (
      <section className="card">
        <h2>Send feedback</h2>
        <p className="muted small">Sign in with Google to send ideas and bug reports.</p>
      </section>
    )
  }

  const send = async () => {
    const wait = FEEDBACK_GAP_S - Math.floor((Date.now() - lastSent()) / 1000)
    if (wait > 0) return showAlert(`Thanks! Please wait ${wait} seconds before sending more.`)
    setBusy(true)
    try {
      const result = await sendFeedback(firestore!, user.uid, {
        kind,
        message,
        replyTo: reply ? user.email : null,
        platform: Capacitor.getPlatform(),
        build: BUILD,
      })
      try {
        localStorage.setItem(LAST_KEY, String(Date.now()))
      } catch {
        /* no wait between sends, which is fine */
      }
      setMessage('')
      setDone(result === 'sent' ? 'Thanks, your feedback was sent.' : "Thanks! You're offline, so it will be sent when you're back online.")
    } catch (e) {
      showAlert(`Could not send: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const hint = KINDS.find((k) => k.id === kind)!.hint
  return (
    <section className="card stack">
      <h2>Send feedback</h2>
      <p className="muted small">Suggest a feature or report a problem. It goes straight to the developer.</p>
      <div className="segmented" role="radiogroup" aria-label="Type of feedback">
        {KINDS.map((k) => (
          <button type="button" role="radio" aria-checked={kind === k.id} key={k.id} className={kind === k.id ? 'active' : ''} onClick={() => setKind(k.id)}>
            {k.label}
          </button>
        ))}
      </div>
      <label>
        <span className="sr-only">Message</span>
        <textarea
          className="feedback-text"
          rows={5}
          maxLength={FEEDBACK_MAX}
          placeholder={hint}
          value={message}
          onChange={(e) => {
            setMessage(e.target.value)
            setDone(null)
          }}
        />
        <span className="muted small feedback-count">
          {message.length} / {FEEDBACK_MAX}
        </span>
      </label>
      {user.email && (
        <label className="edit-row toggle-row">
          <span className="grow">
            Let the developer reply
            <span className="muted small block">Shares {user.email} with this message.</span>
          </span>
          <input type="checkbox" role="switch" checked={reply} onChange={(e) => setReply(e.target.checked)} />
        </label>
      )}
      <button className="primary" disabled={busy || !message.trim()} onClick={send}>
        {busy ? 'Sending…' : 'Send'}
      </button>
      {done && (
        <p className="small" role="status">
          {done}
        </p>
      )}
    </section>
  )
}
