import type { EmailSummary } from '../../../shared/types'

export interface EmailGroup {
  kind: 'group'
  key: string
  label: string
  emails: EmailSummary[] // newest first
  newCount: number
  newestAt: string
}

export interface SingleEmail {
  kind: 'single'
  email: EmailSummary
}

export type ListItem = EmailGroup | SingleEmail

interface Rule {
  key: string
  label: string
  match: (e: EmailSummary) => boolean
}

const addr = (e: EmailSummary) => e.senderAddress.toLowerCase()
const local = (e: EmailSummary) => addr(e).split('@')[0]

/** Named categories. Order matters: first match wins. */
const RULES: Rule[] = [
  {
    key: 'github',
    label: 'GitHub',
    match: (e) => addr(e).endsWith('@github.com')
  },
  {
    key: 'gitlab',
    label: 'GitLab',
    match: (e) => addr(e).endsWith('@gitlab.com')
  },
  {
    key: 'jira',
    label: 'Jira',
    match: (e) => addr(e).includes('atlassian') || local(e) === 'jira'
  },
  {
    key: 'slack',
    label: 'Slack',
    match: (e) => addr(e).endsWith('@slack.com')
  },
  {
    key: 'figma',
    label: 'Figma',
    match: (e) => addr(e).endsWith('@figma.com')
  },
  {
    key: 'calendar-invites',
    label: 'Calendar invites',
    match: (e) => addr(e).endsWith('@calendly.com') || addr(e).endsWith('@zoom.us')
  },
  {
    key: 'linkedin',
    label: 'LinkedIn',
    match: (e) => addr(e).endsWith('@linkedin.com')
  },
  {
    key: 'newsletters',
    label: 'Newsletters',
    match: (e) =>
      /^(newsletter|news|digest|weekly|updates|marketing)(s)?([._-].*)?$/.test(local(e)) ||
      e.sender.toLowerCase().includes('newsletter')
  },
  {
    key: 'alerts',
    label: 'System Alerts',
    match: (e) =>
      /^(no-?reply|do-?not-?reply|alerts?|notifications?|system|monitoring|status|security)([._-].*)?$/.test(
        local(e)
      ) ||
      /@(pagerduty|opsgenie|datadoghq|statuspage)\./.test(addr(e))
  }
]

/** Named-rule groups need ≥2 members; same-sender fallback needs ≥3. */
const RULE_MIN = 2
const SENDER_MIN = 3

/**
 * Groups emails for display. Pure presentation logic:
 * - Try named rules first; a rule forms a group only with ≥2 matches.
 * - Remaining mail from the same sender address groups at ≥3 messages.
 * - Everything else stays a single row.
 * Result is sorted by each item's newest message, descending.
 */
export function groupEmails(emails: EmailSummary[]): ListItem[] {
  const remaining = new Set(emails.map((e) => e.id))
  const items: ListItem[] = []

  const takeGroup = (key: string, label: string, members: EmailSummary[]) => {
    for (const m of members) remaining.delete(m.id)
    items.push({
      kind: 'group',
      key,
      label,
      emails: members,
      newCount: members.filter((m) => m.isNew).length,
      newestAt: members[0].receivedAt
    })
  }

  // Each email is claimed by the FIRST rule that matches it — a lone GitLab
  // mail must not leak into the generic "System Alerts" bucket just because
  // its rule didn't reach the group minimum.
  const buckets = new Map<string, EmailSummary[]>()
  for (const e of emails) {
    const rule = RULES.find((r) => r.match(e))
    if (!rule) continue
    const list = buckets.get(rule.key) ?? []
    list.push(e)
    buckets.set(rule.key, list)
  }
  for (const rule of RULES) {
    const members = buckets.get(rule.key) ?? []
    if (members.length >= RULE_MIN) takeGroup(rule.key, rule.label, members)
    else for (const m of members) remaining.delete(m.id) && items.push({ kind: 'single', email: m })
  }

  // Same-sender fallback for chatty senders not covered by a named rule.
  const bySender = new Map<string, EmailSummary[]>()
  for (const e of emails) {
    if (!remaining.has(e.id) || !e.senderAddress) continue
    const list = bySender.get(addr(e)) ?? []
    list.push(e)
    bySender.set(addr(e), list)
  }
  for (const [address, members] of bySender) {
    if (members.length >= SENDER_MIN) {
      takeGroup(`sender:${address}`, members[0].sender, members)
    }
  }

  for (const e of emails) {
    if (remaining.has(e.id)) items.push({ kind: 'single', email: e })
  }

  return items.sort((a, b) => {
    const ta = a.kind === 'group' ? a.newestAt : a.email.receivedAt
    const tb = b.kind === 'group' ? b.newestAt : b.email.receivedAt
    return tb.localeCompare(ta)
  })
}
