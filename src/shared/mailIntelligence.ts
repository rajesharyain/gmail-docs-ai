import type {
  EmailSummary,
  MailAttentionLevel,
  MailCategory,
  MailDeadlineSignal,
  MailInsight,
  MailInsightSource,
  MailNextAction,
  MailPriority,
  MailRiskSignal,
  RuleAction,
  SenderRule
} from './types'

export type { MailCategory, MailInsight, MailPriority }

interface CategoryRule {
  category: MailCategory
  label: string
  priority: MailPriority
  patterns: RegExp[]
  /** Sender domains that strongly imply this category even with no keyword hit. */
  domains?: string[]
}

const CATEGORY_RULES: CategoryRule[] = [
  {
    category: 'important',
    label: 'Important',
    priority: 'high',
    patterns: [
      /\burgent\b/i,
      /\baction required\b/i,
      /\bverification code\b/i,
      /\bsecurity alert\b/i,
      /\bpassword reset\b/i
    ]
  },
  {
    category: 'finance',
    label: 'Finance',
    priority: 'high',
    patterns: [/\bpayment\b/i, /\binvoice\b/i, /\breceipt\b/i, /\bbank\b/i, /\btax\b/i, /\bstatement\b/i],
    domains: [
      'stripe.com',
      'paypal.com',
      'venmo.com',
      'chase.com',
      'wellsfargo.com',
      'bankofamerica.com',
      'americanexpress.com',
      'coinbase.com'
    ]
  },
  {
    category: 'jobs',
    label: 'Jobs',
    priority: 'high',
    patterns: [
      /\binterview\b/i,
      /\brecruit/i,
      /\bjob offer\b/i,
      /\bhiring\b/i,
      /\bcareer opportunit/i,
      /\bapplication (?:received|status)\b/i
    ],
    domains: ['linkedin.com', 'greenhouse.io', 'lever.co', 'workday.com', 'indeed.com', 'ziprecruiter.com']
  },
  {
    category: 'calendar',
    label: 'Calendar',
    priority: 'normal',
    patterns: [/\bmeeting\b/i, /\binvite\b/i, /\bcalendar\b/i, /\brescheduled\b/i, /\bevent reminder\b/i],
    domains: ['calendly.com', 'zoom.us']
  },
  {
    category: 'work',
    label: 'Work',
    priority: 'normal',
    patterns: [/\bpull request\b/i, /\bjira\b/i, /\bfigma\b/i, /\bslack\b/i, /\bdeploy(?:ed|ment)?\b/i],
    domains: ['github.com', 'gitlab.com', 'atlassian.net', 'slack.com', 'figma.com', 'notion.so', 'asana.com']
  },
  {
    category: 'home',
    label: 'Home',
    priority: 'normal',
    patterns: [/\bapartment\b/i, /\bflat\b/i, /\bbedroom\b/i, /\bproperty\b/i, /\brent\b/i, /\blease\b/i]
  },
  {
    category: 'promotions',
    label: 'Promo',
    priority: 'low',
    patterns: [/\bsale\b/i, /\bdeal\b/i, /\boffer ends\b/i, /\bdiscount\b/i, /%\s?off\b/i, /\bcoupon\b/i]
  }
]

/** label/priority for every category, including the two with no keyword rule. */
const CATEGORY_META: Record<MailCategory, { label: string; priority: MailPriority }> = {
  ...Object.fromEntries(
    CATEGORY_RULES.map((rule) => [rule.category, { label: rule.label, priority: rule.priority }])
  ),
  noise: { label: 'Noise', priority: 'low' },
  other: { label: 'Inbox', priority: 'normal' }
} as Record<MailCategory, { label: string; priority: MailPriority }>

/** Content signals strong enough on their own to demote a matched category to noise. */
const STRONG_NOISE_PATTERNS = [/\bunsubscribe\b/i, /\bnewsletter\b/i, /\bmarketing\b/i, /\bdigest\b/i]

/**
 * Sender-shape signals that show up on both noise AND plenty of legitimate
 * transactional/calendar mail (Calendly invites, shipping updates, ticket
 * systems all send from a no-reply address). Too weak to demote a matched
 * category on its own — only tips an otherwise-uncategorized message toward
 * noise.
 */
const WEAK_NOISE_PATTERNS = [/\bno[- ]?reply\b/i, /\bnoreply\b/i, /\bdo[- ]?not[- ]?reply\b/i]

/** A sender-domain match is a stronger signal than a single keyword hit. */
const DOMAIN_MATCH_WEIGHT = 2

type CategoryInsightBase = Pick<
  MailInsight,
  'category' | 'label' | 'priority' | 'isLikelyNoise' | 'confidence' | 'reasons'
>

const TODAY_DEADLINE_PATTERNS = [
  /\btoday\b/i,
  /\bby end of day\b/i,
  /\beod\b/i,
  /\basap\b/i,
  /\bimmediately\b/i,
  /\bnow\b/i
]

const SOON_DEADLINE_PATTERNS = [
  /\btomorrow\b/i,
  /\bdue\b/i,
  /\bdeadline\b/i,
  /\bexpires?\b/i,
  /\bexpiring\b/i,
  /\brespond by\b/i,
  /\breply by\b/i,
  /\baction required by\b/i,
  /\bbefore (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\bby (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i
]

const LATER_DEADLINE_PATTERNS = [/\bnext week\b/i, /\bnext month\b/i, /\brenewal\b/i, /\bscheduled\b/i]

const HIGH_RISK_PATTERNS = [
  /\bgift card\b/i,
  /\bwire transfer\b/i,
  /\bbank transfer\b/i,
  /\burgent payment\b/i,
  /\bsend money\b/i,
  /\bupdate your payment method\b/i,
  /\bpassword\b/i,
  /\blogin\b/i,
  /\bsign[- ]?in\b/i,
  /\bverify your account\b/i
]

const MEDIUM_RISK_PATTERNS = [
  /\bsecurity alert\b/i,
  /\bpassword reset\b/i,
  /\bverification code\b/i,
  /\bsuspicious\b/i,
  /\baccount locked\b/i,
  /\binvoice attached\b/i,
  /\bnew device\b/i
]

const LOW_RISK_PATTERNS = [/\bexternal sender\b/i, /\bunusual activity\b/i, /\bunknown sender\b/i]

const PAY_ACTION_PATTERNS = [/\bpayment\b/i, /\binvoice\b/i, /\bbill\b/i, /\btax\b/i, /\bpay\b/i, /\breceipt\b/i]
const SCHEDULE_ACTION_PATTERNS = [/\bmeeting\b/i, /\binvite\b/i, /\bcalendar\b/i, /\brescheduled\b/i, /\binterview\b/i]
const REPLY_ACTION_PATTERNS = [
  /\bplease reply\b/i,
  /\breply by\b/i,
  /\brespond\b/i,
  /\bcan you\b/i,
  /\bcould you\b/i,
  /\bquestion\b/i
]
const REVIEW_ACTION_PATTERNS = [
  /\breview\b/i,
  /\bapprove\b/i,
  /\baction required\b/i,
  /\bsecurity alert\b/i,
  /\bpassword reset\b/i,
  /\bdocument required\b/i,
  /\bverify\b/i,
  /\bconfirm\b/i
]
const TRACK_ACTION_PATTERNS = [/\btracking\b/i, /\bshipment\b/i, /\bdelivered\b/i, /\bstatus update\b/i, /\border\b/i]

interface SignalMatch {
  matched: boolean
  reason: string
}

function matchesDomain(domain: string, candidates: string[]): boolean {
  return candidates.some((d) => domain === d || domain.endsWith(`.${d}`))
}

function hasAnyPattern(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text))
}

function signal(text: string, patterns: RegExp[], reason: string): SignalMatch {
  return { matched: hasAnyPattern(text, patterns), reason }
}

function detectDeadline(text: string): MailDeadlineSignal {
  if (hasAnyPattern(text, TODAY_DEADLINE_PATTERNS)) {
    return { hasDeadline: true, urgency: 'today', label: 'Due today' }
  }
  if (hasAnyPattern(text, SOON_DEADLINE_PATTERNS)) {
    return { hasDeadline: true, urgency: 'soon', label: 'Due soon' }
  }
  if (hasAnyPattern(text, LATER_DEADLINE_PATTERNS)) {
    return { hasDeadline: true, urgency: 'later', label: 'Upcoming' }
  }
  return { hasDeadline: false, urgency: null, label: null }
}

function detectRisk(text: string): MailRiskSignal {
  const reasons: string[] = []
  if (hasAnyPattern(text, HIGH_RISK_PATTERNS)) reasons.push('Sensitive/payment request')
  if (hasAnyPattern(text, MEDIUM_RISK_PATTERNS)) reasons.push('Account/security signal')
  if (hasAnyPattern(text, LOW_RISK_PATTERNS)) reasons.push('Caution signal')

  if (reasons.some((reason) => reason === 'Sensitive/payment request')) {
    return { level: 'high', reasons }
  }
  if (reasons.some((reason) => reason === 'Account/security signal')) {
    return { level: 'medium', reasons }
  }
  if (reasons.length > 0) return { level: 'low', reasons }
  return { level: 'none', reasons: [] }
}

function inferNextAction(text: string, base: CategoryInsightBase, risk: MailRiskSignal): MailNextAction {
  const review = signal(text, REVIEW_ACTION_PATTERNS, 'Review requested')
  const pay = signal(text, PAY_ACTION_PATTERNS, 'Payment action')
  const schedule = signal(text, SCHEDULE_ACTION_PATTERNS, 'Scheduling action')
  const reply = signal(text, REPLY_ACTION_PATTERNS, 'Reply requested')
  const track = signal(text, TRACK_ACTION_PATTERNS, 'Tracking update')

  if (risk.level === 'high' || risk.level === 'medium' || review.matched) return 'review'
  if (pay.matched) return 'pay'
  if (schedule.matched) return 'schedule'
  if (reply.matched) return 'reply'
  if (track.matched) return 'track'
  if (base.category === 'noise') return 'ignore'
  if (base.category === 'promotions') return 'archive'
  return 'open'
}

function insightSignalReasons(
  text: string,
  base: CategoryInsightBase,
  deadline: MailDeadlineSignal,
  risk: MailRiskSignal,
  nextAction: MailNextAction
): string[] {
  const reasons: string[] = []

  if (base.priority === 'high') reasons.push('High-priority category')
  if (base.category === 'promotions') reasons.push('Promotional mail')
  if (base.category === 'noise') reasons.push('Noise or automated mail')
  if (deadline.label) reasons.push(deadline.label)
  for (const riskReason of risk.reasons) reasons.push(riskReason)

  const actionReasonByAction: Partial<Record<MailNextAction, string>> = {
    reply: 'Reply likely',
    review: 'Review likely',
    pay: 'Payment likely',
    schedule: 'Scheduling likely',
    track: 'Tracking likely',
    archive: 'Archive likely',
    ignore: 'Can ignore'
  }
  const actionReason = actionReasonByAction[nextAction]
  if (actionReason) reasons.push(actionReason)
  if (hasAnyPattern(text, TODAY_DEADLINE_PATTERNS)) reasons.push('Time-sensitive wording')

  return [...new Set(reasons)]
}

function inferAttentionScore(
  base: CategoryInsightBase,
  deadline: MailDeadlineSignal,
  risk: MailRiskSignal,
  nextAction: MailNextAction
): number {
  let score = base.priority === 'high' ? 60 : base.priority === 'normal' ? 35 : 15

  if (base.category === 'important') score += 20
  if (base.category === 'finance' || base.category === 'jobs') score += 10
  if (base.category === 'promotions') score -= 10
  if (base.category === 'noise') score -= 25

  if (deadline.urgency === 'today') score += 35
  else if (deadline.urgency === 'soon') score += 22
  else if (deadline.urgency === 'later') score += 6

  if (risk.level === 'high') score += 40
  else if (risk.level === 'medium') score += 25
  else if (risk.level === 'low') score += 10

  if (nextAction === 'reply' || nextAction === 'review') score += 25
  else if (nextAction === 'pay') score += 12
  else if (nextAction === 'schedule') score += 8
  else if (nextAction === 'archive') score -= 8
  else if (nextAction === 'ignore') score -= 15

  return Math.max(0, Math.min(100, score))
}

function inferAttentionLevel(score: number, base: CategoryInsightBase): MailAttentionLevel {
  if (score >= 85) return 'urgent'
  if (score >= 58) return 'important'
  if (score >= 30) return 'normal'
  if (base.category === 'noise' || score < 12) return 'silent'
  return 'low'
}

/** Representative 0–100 score for a cloud-affirmed attention level — the
 *  cloud "second opinion" doesn't return a numeric score, only a level, so
 *  this keeps `attentionScore` meaningful for any code that still reads it. */
function attentionScoreForLevel(level: MailAttentionLevel): number {
  return { urgent: 90, important: 65, normal: 40, low: 20, silent: 5 }[level]
}

function enrichInsight(email: EmailSummary, base: CategoryInsightBase, source: MailInsightSource): MailInsight {
  const text = `${email.sender} ${email.senderAddress} ${email.subject} ${email.preview}`
  const deadline = detectDeadline(text)
  const risk = detectRisk(text)
  const nextAction = inferNextAction(text, base, risk)
  const attentionScore = inferAttentionScore(base, deadline, risk, nextAction)
  const attentionLevel = inferAttentionLevel(attentionScore, base)
  const reasons = [...new Set([...base.reasons, ...insightSignalReasons(text, base, deadline, risk, nextAction)])]

  // v4 Phase 5: an opt-in cloud "second opinion" overrides only the
  // attention/action/deadline/risk axes — category still comes from
  // cloudCategory/local rules above, untouched here.
  if (email.cloudInsight) {
    const cloud = email.cloudInsight
    return {
      ...base,
      reasons: [...new Set([...reasons, ...cloud.reasons])],
      attentionLevel: cloud.attentionLevel,
      attentionScore: attentionScoreForLevel(cloud.attentionLevel),
      nextAction: cloud.nextAction,
      deadline: cloud.deadline,
      risk: cloud.risk,
      source: 'cloud'
    }
  }

  return {
    ...base,
    reasons,
    attentionLevel,
    attentionScore,
    nextAction,
    deadline,
    risk,
    source
  }
}

/** Finds the first user rule of the given action that matches this email's sender or domain. */
function findSenderRule(
  senderAddress: string,
  domain: string,
  senderRules: SenderRule[],
  action: RuleAction
): SenderRule | undefined {
  return senderRules.find((rule) => {
    if (rule.action !== action) return false
    return rule.matchType === 'sender' ? rule.value === senderAddress : matchesDomain(domain, [rule.value])
  })
}

/** True if the user has explicitly muted this sender or its domain. Callers
 *  that filter emails from counts/notifications (not just display) should
 *  check this before a message ever reaches `classifyEmail`. */
export function isSenderMuted(email: EmailSummary, senderRules: SenderRule[]): boolean {
  const senderAddress = email.senderAddress.toLowerCase()
  const domain = senderAddress.split('@')[1] ?? ''
  return Boolean(findSenderRule(senderAddress, domain, senderRules, 'mute'))
}

/**
 * @param senderRules User overrides (mark important / mute), checked before
 * the heuristic rules below. A muted sender should already have been
 * filtered out upstream via `isSenderMuted` — this only handles "important".
 */
export function classifyEmail(email: EmailSummary, senderRules: SenderRule[] = []): MailInsight {
  const senderAddress = email.senderAddress.toLowerCase()
  const domain = senderAddress.split('@')[1] ?? ''

  if (findSenderRule(senderAddress, domain, senderRules, 'important')) {
    return enrichInsight(
      email,
      {
        category: 'important',
        label: 'Important',
        priority: 'high',
        isLikelyNoise: false,
        confidence: 1,
        reasons: ['User rule: always important']
      },
      'user-rule'
    )
  }

  // Cloud classification only ever runs when local confidence was already
  // low (see ClassificationService), so a resolved result is trusted over
  // the heuristics below — but a user's explicit "important" rule above still
  // wins over an AI guess.
  if (email.cloudCategory) {
    const meta = CATEGORY_META[email.cloudCategory]
    return enrichInsight(
      email,
      {
        category: email.cloudCategory,
        label: meta.label,
        priority: meta.priority,
        isLikelyNoise: email.cloudCategory === 'noise',
        confidence: 0.85,
        reasons: ['Cloud classification']
      },
      'cloud'
    )
  }

  const text = `${email.sender} ${email.senderAddress} ${email.subject} ${email.preview}`

  const strongNoise = STRONG_NOISE_PATTERNS.some((pattern) => pattern.test(text))
  const weakNoise = WEAK_NOISE_PATTERNS.some((pattern) => pattern.test(text))
  const anyNoiseSignal = strongNoise || weakNoise

  let best: { rule: CategoryRule; score: number; reasons: string[] } | null = null

  for (const rule of CATEGORY_RULES) {
    const reasons: string[] = []
    let score = 0
    for (const pattern of rule.patterns) {
      if (pattern.test(text)) {
        score += 1
        reasons.push(rule.label)
      }
    }
    if (rule.domains && matchesDomain(domain, rule.domains)) {
      score += DOMAIN_MATCH_WEIGHT
      reasons.push(`${rule.label} sender`)
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { rule, score, reasons }
    }
  }

  if (!best) {
    return enrichInsight(
      email,
      {
        category: anyNoiseSignal ? 'noise' : 'other',
        label: anyNoiseSignal ? 'Noise' : 'Inbox',
        priority: anyNoiseSignal ? 'low' : 'normal',
        isLikelyNoise: anyNoiseSignal,
        confidence: anyNoiseSignal ? 0.6 : 0.3,
        reasons: anyNoiseSignal ? ['Noise signal'] : []
      },
      'local'
    )
  }

  // Only strong, content-based noise demotes a matched category — a
  // no-reply sender alone must not drown out a real category match.
  const demote = strongNoise && best.rule.priority !== 'high'

  return enrichInsight(
    email,
    {
      category: demote ? 'noise' : best.rule.category,
      label: demote ? 'Noise' : best.rule.label,
      priority: demote ? 'low' : best.rule.priority,
      isLikelyNoise: anyNoiseSignal,
      confidence: demote ? 0.6 : Math.min(1, 0.5 + best.score * 0.2),
      reasons: demote ? [...best.reasons, 'Noise signal'] : best.reasons
    },
    'local'
  )
}
