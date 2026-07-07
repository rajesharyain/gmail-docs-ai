import type { MailCategory } from '../../shared/types'
import type { AIPrivacyPayload } from './privacy'

/** Every category the cloud classifier is allowed to return, including
 *  'other' as the explicit "none of these fit" answer. */
export const CLASSIFICATION_LABELS: MailCategory[] = [
  'important',
  'finance',
  'jobs',
  'home',
  'work',
  'calendar',
  'promotions',
  'noise',
  'other'
]

export function classificationSystemPrompt(labels: string[]): string {
  return (
    `Classify the email into exactly one of these categories: ${labels.join(', ')}. ` +
    'Reply with only the category id, in lowercase, with no punctuation or explanation.'
  )
}

export function buildClassificationPrompt(email: AIPrivacyPayload): string {
  const lines = [`Sender: ${email.sender} <${email.senderAddress}>`, `Subject: ${email.subject}`]
  if (email.preview) lines.push(`Preview: ${email.preview}`)
  return lines.join('\n')
}

/** Defensive parsing — models don't always follow instructions exactly. */
export function parseClassificationLabel(raw: string, labels: string[]): string | null {
  const cleaned = raw.trim().toLowerCase().replace(/[^a-z]/g, '')
  return labels.includes(cleaned) ? cleaned : null
}
