import { classifyEmail } from './mailIntelligence'
import type { EmailSummary, MailInsight, MailNextAction, SenderRule } from './types'

export interface InboxBriefing {
  headline: string
  detail: string | null
}

/** Short noun phrase per next action — combined with a count into something
 *  like "one payment issue" or "two client replies". */
const ACTION_PHRASES: Record<MailNextAction, string> = {
  reply: 'client reply',
  review: 'item to review',
  pay: 'payment issue',
  schedule: 'meeting change',
  track: 'delivery to track',
  archive: 'promotional item',
  ignore: 'low-priority item',
  open: 'message to check'
}

function joinPhrases(phrases: string[]): string {
  const items = phrases.map((p) => `one ${p}`)
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

/** Up to `max` *distinct* next-action phrases — representative, not
 *  exhaustive (same philosophy as `sectionPeek` elsewhere), and avoids the
 *  awkward "one client reply, one client reply" repeat when several new
 *  emails share the same next action. */
function representativeActionPhrases(insights: MailInsight[], max = 3): string[] {
  const seen = new Set<MailNextAction>()
  const phrases: string[] = []
  for (const insight of insights) {
    if (seen.has(insight.nextAction)) continue
    seen.add(insight.nextAction)
    phrases.push(ACTION_PHRASES[insight.nextAction])
    if (phrases.length >= max) break
  }
  return phrases
}

/**
 * A short "since you last checked" summary built from structured
 * attention/next-action signals — never a full-message AI summary of every
 * new email. "Since last checked" reuses the existing `isNew` flag (backed
 * by `sync.ts`'s `seenIds`/`markSeen`), so no separate last-opened state is
 * needed here. Returns null when nothing arrived since the popup was last
 * opened, so callers render nothing instead of a redundant "all good".
 */
export function buildInboxBriefing(emails: EmailSummary[], senderRules: SenderRule[] = []): InboxBriefing | null {
  const arrived = emails.filter((e) => e.isNew)
  if (arrived.length === 0) return null

  const insights = arrived.map((e) => classifyEmail(e, senderRules))
  const actionable = insights.filter((i) => i.attentionLevel === 'urgent' || i.attentionLevel === 'important')

  if (actionable.length === 0) {
    const noun = arrived.length === 1 ? 'email' : 'emails'
    return { headline: `${arrived.length} new ${noun}, nothing urgent right now.`, detail: null }
  }

  const noun = actionable.length === 1 ? 'email' : 'emails'
  const verb = actionable.length === 1 ? 'needs' : 'need'
  const headline = `${actionable.length} ${noun} ${verb} action: ${joinPhrases(representativeActionPhrases(actionable))}.`
  const lowPriorityCount = arrived.length - actionable.length
  const detail = lowPriorityCount > 0 ? 'Everything else is low priority.' : null

  return { headline, detail }
}
