import type {
  MailAttentionLevel,
  MailDeadlineSignal,
  MailDeadlineUrgency,
  MailNextAction,
  MailRiskLevel,
  MailRiskSignal
} from '../../shared/types'
import type { AIPrivacyPayload } from './privacy'

const ATTENTION_LEVELS: MailAttentionLevel[] = ['urgent', 'important', 'normal', 'low', 'silent']
const NEXT_ACTIONS: MailNextAction[] = ['reply', 'review', 'pay', 'schedule', 'track', 'archive', 'ignore', 'open']
const DEADLINE_URGENCIES = ['today', 'soon', 'later', 'none'] as const
const RISK_LEVELS = ['high', 'medium', 'low', 'none'] as const

const DEADLINE_LABELS: Record<Exclude<(typeof DEADLINE_URGENCIES)[number], 'none'>, string> = {
  today: 'Due today',
  soon: 'Due soon',
  later: 'Upcoming'
}

export interface ParsedInsight {
  attentionLevel: MailAttentionLevel
  nextAction: MailNextAction
  deadline: MailDeadlineSignal
  risk: MailRiskSignal
  reasons: string[]
}

export function insightSystemPrompt(): string {
  return (
    'You triage a single email for a menu-bar inbox assistant. Reply with ONLY a compact JSON object, ' +
    'no markdown, no explanation, matching exactly this shape:\n' +
    `{"attentionLevel":"${ATTENTION_LEVELS.join('|')}",` +
    `"nextAction":"${NEXT_ACTIONS.join('|')}",` +
    `"deadline":"${DEADLINE_URGENCIES.join('|')}",` +
    `"risk":"${RISK_LEVELS.join('|')}",` +
    '"reasons":["short phrase", "..."]}\n' +
    'attentionLevel: how much this deserves to interrupt the user. ' +
    'nextAction: the single most likely thing the user needs to do. ' +
    'deadline: how soon, if any, a response or action is due — "none" if no deadline is implied. ' +
    'risk: how likely this is a scam, phishing, or otherwise unsafe request — "none" if nothing suspicious. ' +
    'reasons: at most 3 short phrases explaining the call.'
  )
}

export function buildInsightPrompt(email: AIPrivacyPayload): string {
  const lines = [`Sender: ${email.sender} <${email.senderAddress}>`, `Subject: ${email.subject}`]
  if (email.preview) lines.push(`Preview: ${email.preview}`)
  return lines.join('\n')
}

/** Defensive, strict parsing — models don't always follow instructions
 *  exactly, and a malformed/half-right response must never quietly become a
 *  wrong risk or deadline signal. Any invalid field fails the whole parse. */
export function parseInsightResponse(raw: string): ParsedInsight | null {
  let data: unknown
  try {
    // Models sometimes wrap JSON in a code fence despite instructions.
    const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    data = JSON.parse(cleaned)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null

  const value = data as Record<string, unknown>
  const attentionLevel = value.attentionLevel
  const nextAction = value.nextAction
  const deadlineUrgency = value.deadline
  const riskLevel = value.risk
  const rawReasons = value.reasons

  if (typeof attentionLevel !== 'string' || !ATTENTION_LEVELS.includes(attentionLevel as MailAttentionLevel)) {
    return null
  }
  if (typeof nextAction !== 'string' || !NEXT_ACTIONS.includes(nextAction as MailNextAction)) {
    return null
  }
  if (typeof deadlineUrgency !== 'string' || !DEADLINE_URGENCIES.includes(deadlineUrgency as never)) {
    return null
  }
  if (typeof riskLevel !== 'string' || !RISK_LEVELS.includes(riskLevel as never)) {
    return null
  }

  const reasons = Array.isArray(rawReasons)
    ? rawReasons.filter((r): r is string => typeof r === 'string' && r.trim().length > 0).slice(0, 3)
    : []

  const deadline: MailDeadlineSignal =
    deadlineUrgency === 'none'
      ? { hasDeadline: false, urgency: null, label: null }
      : {
          hasDeadline: true,
          urgency: deadlineUrgency as MailDeadlineUrgency,
          label: DEADLINE_LABELS[deadlineUrgency as Exclude<(typeof DEADLINE_URGENCIES)[number], 'none'>]
        }

  const risk: MailRiskSignal =
    riskLevel === 'none' ? { level: 'none', reasons: [] } : { level: riskLevel as MailRiskLevel, reasons }

  return {
    attentionLevel: attentionLevel as MailAttentionLevel,
    nextAction: nextAction as MailNextAction,
    deadline,
    risk,
    reasons
  }
}
