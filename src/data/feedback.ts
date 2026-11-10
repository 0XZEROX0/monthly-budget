import { t } from '../i18n'
import { addDoc, collection, serverTimestamp, type Firestore } from 'firebase/firestore'

// Feedback goes into one shared Firestore collection that the app can only add to (see
// firestore.rules): nobody can read it back from the app, not even its sender. The
// developer reads it in the Firebase console, and scripts/feedback-mailer emails each new
// one to them, so their address is never in the app or this repo.

export type FeedbackKind = 'idea' | 'bug'
export const FEEDBACK_MAX = 2000
/** Seconds between two sends from one device, so a double tap doesn't send twice. */
export const FEEDBACK_GAP_S = 60

export interface FeedbackInput {
  kind: FeedbackKind
  message: string
  /** The sender's own sign-in address, only when they agreed to be replied to. */
  replyTo?: string | null
  platform: string
  build: number
}

/** The document as stored. Keep these fields in step with the rule in firestore.rules. */
export function feedbackDoc(uid: string, f: FeedbackInput) {
  const message = f.message.trim().slice(0, FEEDBACK_MAX)
  if (!message) throw new Error(t('Write a message first.'))
  return {
    uid,
    kind: f.kind,
    message,
    ...(f.replyTo ? { replyTo: f.replyTo } : {}),
    platform: f.platform.slice(0, 20),
    build: Math.max(0, Math.floor(f.build) || 0),
    emailed: false,
  }
}

/**
 * Sends the feedback. Resolves once the server has it, or after a few seconds when the
 * phone is offline: the write then waits in the offline cache and goes out on reconnect.
 */
export async function sendFeedback(db: Firestore, uid: string, f: FeedbackInput): Promise<'sent' | 'queued'> {
  const write = addDoc(collection(db, 'feedback'), { ...feedbackDoc(uid, f), createdAt: serverTimestamp() })
  const timeout = new Promise<'queued'>((r) => setTimeout(() => r('queued'), 8000))
  return Promise.race([write.then(() => 'sent' as const), timeout])
}
