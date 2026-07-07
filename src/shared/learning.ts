import type {
  LearningData,
  LearningEventKind,
  RuleSuggestion,
  SenderLearningStats,
  SenderRule
} from './types'

/** Deterministic and inspectable by design (per the v4 plan): a plain count
 *  threshold, not a model. Three one-sided actions on the same sender is
 *  enough of a pattern to be worth asking about — fewer is coincidence. */
export const SUGGESTION_THRESHOLD = 3

/** Bounded so learning.json can't grow without limit; the least recently
 *  active senders are pruned first. */
const MAX_TRACKED_SENDERS = 200

export const EMPTY_LEARNING_DATA: LearningData = { senders: {}, dismissed: [] }

export interface LearningEvent {
  senderAddress: string
  senderName: string
  kind: LearningEventKind
  /** Injectable for tests; defaults to now. */
  at?: string
}

/** Defensive read of learning.json — malformed or legacy content degrades to
 *  empty rather than crashing (same philosophy as normalizeSettings). */
export function normalizeLearningData(raw: unknown): LearningData {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return EMPTY_LEARNING_DATA
  const value = raw as Partial<Record<keyof LearningData, unknown>>

  const senders: Record<string, SenderLearningStats> = {}
  if (value.senders && typeof value.senders === 'object' && !Array.isArray(value.senders)) {
    for (const [address, stats] of Object.entries(value.senders as Record<string, unknown>)) {
      if (!stats || typeof stats !== 'object' || Array.isArray(stats)) continue
      const s = stats as Partial<Record<keyof SenderLearningStats, unknown>>
      senders[address.toLowerCase()] = {
        name: typeof s.name === 'string' ? s.name : address,
        open: typeof s.open === 'number' && Number.isFinite(s.open) ? Math.max(0, Math.round(s.open)) : 0,
        archive: typeof s.archive === 'number' && Number.isFinite(s.archive) ? Math.max(0, Math.round(s.archive)) : 0,
        delete: typeof s.delete === 'number' && Number.isFinite(s.delete) ? Math.max(0, Math.round(s.delete)) : 0,
        lastEventAt: typeof s.lastEventAt === 'string' ? s.lastEventAt : new Date(0).toISOString()
      }
    }
  }

  const dismissed = Array.isArray(value.dismissed)
    ? value.dismissed.filter((d): d is string => typeof d === 'string' && d.trim().length > 0)
    : []

  return { senders, dismissed }
}

export function recordLearningEvent(data: LearningData, event: LearningEvent): LearningData {
  const address = event.senderAddress.trim().toLowerCase()
  if (!address) return data

  const at = event.at ?? new Date().toISOString()
  const existing: SenderLearningStats = data.senders[address] ?? {
    name: event.senderName,
    open: 0,
    archive: 0,
    delete: 0,
    lastEventAt: at
  }

  const senders: Record<string, SenderLearningStats> = {
    ...data.senders,
    [address]: {
      ...existing,
      name: event.senderName || existing.name,
      [event.kind]: existing[event.kind] + 1,
      lastEventAt: at
    }
  }

  return { ...data, senders: pruneOldest(senders) }
}

function pruneOldest(senders: Record<string, SenderLearningStats>): Record<string, SenderLearningStats> {
  const entries = Object.entries(senders)
  if (entries.length <= MAX_TRACKED_SENDERS) return senders
  entries.sort((a, b) => b[1].lastEventAt.localeCompare(a[1].lastEventAt))
  return Object.fromEntries(entries.slice(0, MAX_TRACKED_SENDERS))
}

export function dismissSuggestion(data: LearningData, id: string): LearningData {
  if (data.dismissed.includes(id)) return data
  return { ...data, dismissed: [...data.dismissed, id] }
}

/** True if any existing user rule (either action) already covers this
 *  address — a covered sender never generates a suggestion. */
function hasAnyRule(address: string, senderRules: SenderRule[]): boolean {
  const domain = address.split('@')[1] ?? ''
  return senderRules.some((rule) =>
    rule.matchType === 'sender'
      ? rule.value === address
      : domain === rule.value || domain.endsWith(`.${rule.value}`)
  )
}

/**
 * Converts recorded behavior into at most one suggestion per sender,
 * strongest evidence first. Opens and archives/deletes are opposing
 * signals, so a suggestion only fires when the behavior is one-sided —
 * a sender the user sometimes reads and sometimes clears generates
 * nothing in either direction.
 */
export function buildRuleSuggestions(data: LearningData, senderRules: SenderRule[]): RuleSuggestion[] {
  const dismissed = new Set(data.dismissed)
  const suggestions: RuleSuggestion[] = []

  for (const [address, stats] of Object.entries(data.senders)) {
    if (hasAnyRule(address, senderRules)) continue

    const clearCount = stats.archive + stats.delete
    let suggestion: RuleSuggestion | null = null

    if (clearCount >= SUGGESTION_THRESHOLD && clearCount > stats.open) {
      suggestion = {
        id: `mute:${address}`,
        action: 'mute',
        matchType: 'sender',
        value: address,
        senderName: stats.name,
        reason: `You've archived or deleted ${clearCount} emails from this sender.`,
        evidenceCount: clearCount
      }
    } else if (stats.open >= SUGGESTION_THRESHOLD && stats.open > clearCount) {
      suggestion = {
        id: `important:${address}`,
        action: 'important',
        matchType: 'sender',
        value: address,
        senderName: stats.name,
        reason: `You've opened ${stats.open} emails from this sender.`,
        evidenceCount: stats.open
      }
    }

    if (suggestion && !dismissed.has(suggestion.id)) suggestions.push(suggestion)
  }

  return suggestions.sort(
    (a, b) => b.evidenceCount - a.evidenceCount || a.value.localeCompare(b.value)
  )
}
