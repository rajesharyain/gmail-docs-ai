import { classifyEmail } from '../../../shared/mailIntelligence'
import type { EmailSummary, MailCategory, SenderRule } from '../../../shared/types'
import { groupEmails, type ListItem } from './grouping'

export interface InboxSection {
  category: MailCategory
  label: string
  icon: string
  items: ListItem[]
  emailCount: number
  newCount: number
  defaultCollapsed: boolean
}

export type AttentionSectionKind = 'needs-attention' | 'due-soon'

export interface AttentionSection {
  kind: AttentionSectionKind
  label: string
  icon: string
  items: ListItem[]
  emailCount: number
  newCount: number
  defaultCollapsed: boolean
}

type SectionCategory = Exclude<MailCategory, 'other'>

/**
 * Priority order, not recency — a section's position must not shuffle every
 * sync just because a low-priority category happened to get a new message.
 * 'other' never becomes its own section; it stays in the plain, unsectioned
 * inbox flow.
 */
const SECTION_ORDER: SectionCategory[] = [
  'important',
  'finance',
  'jobs',
  'calendar',
  'work',
  'home',
  'promotions',
  'noise'
]

const SECTION_META: Record<SectionCategory, { label: string; icon: string; collapsed: boolean }> = {
  important: { label: 'Important', icon: 'zap', collapsed: false },
  finance: { label: 'Finance', icon: 'wallet', collapsed: false },
  jobs: { label: 'Jobs', icon: 'briefcase', collapsed: false },
  calendar: { label: 'Calendar', icon: 'calendar', collapsed: false },
  work: { label: 'Work', icon: 'sparkles', collapsed: false },
  home: { label: 'Home', icon: 'home', collapsed: false },
  promotions: { label: 'Promo', icon: 'tag', collapsed: true },
  noise: { label: 'Noise', icon: 'bell-off', collapsed: true }
}

function itemCount(items: ListItem[]): number {
  return items.reduce((n, item) => n + (item.kind === 'group' ? item.emails.length : 1), 0)
}

function newCount(items: ListItem[]): number {
  return items.reduce((n, item) => {
    if (item.kind === 'group') return n + item.emails.filter((e) => e.isNew).length
    return n + (item.email.isNew ? 1 : 0)
  }, 0)
}

function sortByAttention(emails: EmailSummary[], senderRules: SenderRule[]): EmailSummary[] {
  return [...emails].sort((a, b) => {
    const scoreDiff = classifyEmail(b, senderRules).attentionScore - classifyEmail(a, senderRules).attentionScore
    if (scoreDiff !== 0) return scoreDiff
    return new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
  })
}

/** Up to two representative subjects for a collapsed section's peek line. */
export function sectionPeek(items: ListItem[]): EmailSummary[] {
  const out: EmailSummary[] = []
  for (const item of items) {
    if (out.length >= 2) break
    if (item.kind === 'group') out.push(...item.emails.slice(0, 2 - out.length))
    else out.push(item.email)
  }
  return out
}

/**
 * Splits the inbox into named category sections (highest priority first,
 * low-value categories collapsed) plus whatever's left uncategorized, which
 * stays a plain recency-sorted list rather than a redundant "Inbox" section.
 */
export function buildSections(
  emails: EmailSummary[],
  senderRules: SenderRule[]
): { sections: InboxSection[]; otherItems: ListItem[] } {
  const buckets = new Map<MailCategory, EmailSummary[]>()
  const other: EmailSummary[] = []

  for (const email of emails) {
    const category = classifyEmail(email, senderRules).category
    if (category === 'other') {
      other.push(email)
      continue
    }
    const list = buckets.get(category) ?? []
    list.push(email)
    buckets.set(category, list)
  }

  const sections: InboxSection[] = []
  for (const category of SECTION_ORDER) {
    const members = buckets.get(category)
    if (!members || members.length === 0) continue
    const items = groupEmails(members)
    const meta = SECTION_META[category]
    sections.push({
      category,
      label: meta.label,
      icon: meta.icon,
      items,
      emailCount: itemCount(items),
      newCount: newCount(items),
      defaultCollapsed: meta.collapsed
    })
  }

  return { sections, otherItems: groupEmails(other) }
}

export function buildAttentionSections(
  emails: EmailSummary[],
  senderRules: SenderRule[]
): { attentionSections: AttentionSection[]; remainingEmails: EmailSummary[] } {
  const assigned = new Set<string>()
  const dueSoon = sortByAttention(
    emails.filter((email) => {
      const insight = classifyEmail(email, senderRules)
      return insight.deadline.urgency === 'today' || insight.deadline.urgency === 'soon'
    }),
    senderRules
  )
  for (const email of dueSoon) assigned.add(email.id)

  const needsAttention = sortByAttention(
    emails.filter((email) => {
      if (assigned.has(email.id)) return false
      const insight = classifyEmail(email, senderRules)
      return insight.attentionLevel === 'urgent' || insight.attentionLevel === 'important'
    }),
    senderRules
  )
  for (const email of needsAttention) assigned.add(email.id)

  const attentionSections: AttentionSection[] = []
  const dueItems = groupEmails(dueSoon)
  if (dueItems.length > 0) {
    attentionSections.push({
      kind: 'due-soon',
      label: 'Due soon',
      icon: 'clock',
      items: dueItems,
      emailCount: itemCount(dueItems),
      newCount: newCount(dueItems),
      defaultCollapsed: false
    })
  }

  const attentionItems = groupEmails(needsAttention)
  if (attentionItems.length > 0) {
    attentionSections.push({
      kind: 'needs-attention',
      label: 'Needs attention',
      icon: 'alert-circle',
      items: attentionItems,
      emailCount: itemCount(attentionItems),
      newCount: newCount(attentionItems),
      defaultCollapsed: false
    })
  }

  return {
    attentionSections,
    remainingEmails: emails.filter((email) => !assigned.has(email.id))
  }
}
