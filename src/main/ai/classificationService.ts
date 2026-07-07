import { classifyEmail } from '../../shared/mailIntelligence'
import type {
  CloudInsightOverride,
  EmailSummary,
  InboxState,
  MailCategory,
  MailInsight,
  Settings
} from '../../shared/types'
import { CLASSIFICATION_LABELS } from './classificationPrompt'
import { logger } from '../logger'
import { decideAIPrivacy, hashEmailId } from './privacy'
import type { AICredentialStore } from './credentialStore'
import type { AIInsightResult } from './types'
import type { AIProviderRegistry } from './registry'
import type { AIInsightCacheEntry, SqliteStore } from '../storage/sqliteStore'

/** Below this local confidence, a message is ambiguous enough to be worth an
 *  opt-in cloud call. Most mail scores well above this — see mailIntelligence.ts. */
const CONFIDENCE_THRESHOLD = 0.7

function isMailCategory(value: string): value is MailCategory {
  return (CLASSIFICATION_LABELS as string[]).includes(value)
}

function cacheEntryToOverride(cached: AIInsightCacheEntry): CloudInsightOverride {
  return {
    attentionLevel: cached.attentionLevel as CloudInsightOverride['attentionLevel'],
    nextAction: cached.nextAction as CloudInsightOverride['nextAction'],
    deadline: {
      hasDeadline: cached.hasDeadline,
      urgency: cached.deadlineUrgency as CloudInsightOverride['deadline']['urgency'],
      label: cached.deadlineLabel
    },
    risk: {
      level: cached.riskLevel as CloudInsightOverride['risk']['level'],
      reasons: JSON.parse(cached.riskReasonsJson) as string[]
    },
    reasons: JSON.parse(cached.reasonsJson) as string[]
  }
}

function resultToCacheEntry(emailIdHash: string, result: AIInsightResult): AIInsightCacheEntry {
  return {
    emailIdHash,
    providerId: result.providerId,
    model: result.model,
    attentionLevel: result.attentionLevel,
    nextAction: result.nextAction,
    hasDeadline: result.deadline.hasDeadline,
    deadlineUrgency: result.deadline.urgency,
    deadlineLabel: result.deadline.label,
    riskLevel: result.risk.level,
    riskReasonsJson: JSON.stringify(result.risk.reasons),
    reasonsJson: JSON.stringify(result.reasons)
  }
}

function resultToOverride(result: AIInsightResult): CloudInsightOverride {
  return {
    attentionLevel: result.attentionLevel,
    nextAction: result.nextAction,
    deadline: result.deadline,
    risk: result.risk,
    reasons: result.reasons
  }
}

/** High-impact enough that a second opinion is worth it even when the local
 *  category was confident — a risky or "due today" email is exactly the kind
 *  of mistake this app exists to catch. */
function isHighImpactLocally(insight: MailInsight): boolean {
  return insight.risk.level === 'high' || insight.deadline.urgency === 'today'
}

/**
 * Runs after every sync: for the (usually small) set of emails local rules
 * can't confidently place, ask the user's chosen provider — never for every
 * email, never without the existing privacy gate's approval. Silent by
 * design: results land whenever they resolve and the popup just re-renders
 * into the right category, no loading state.
 */
export class ClassificationService {
  constructor(
    private readonly registry: AIProviderRegistry,
    private readonly credentials: AICredentialStore,
    private readonly store: SqliteStore | null,
    private readonly getSettings: () => Settings,
    private readonly getState: () => InboxState,
    private readonly setState: (patch: Partial<InboxState>) => void
  ) {}

  /** Callers should treat this as fire-and-forget (`void classifyAmbiguous(...)`)
   *  — it never blocks or delays the sync that triggered it. Returns a real
   *  promise (rather than baking in the void-ness) so tests can await it. */
  async classifyAmbiguous(emails: EmailSummary[]): Promise<void> {
    const settings = this.getSettings()
    if (!settings.ai.enabled || !settings.ai.classificationEnabled) return
    if (settings.ai.provider === 'none') return
    if (!this.credentials.status(settings.ai.provider).hasCredential) return

    const candidates = emails.filter(
      (email) => classifyEmail(email, settings.rules.senderRules).confidence < CONFIDENCE_THRESHOLD
    )
    if (candidates.length === 0) return

    try {
      await this.runSequential(candidates, settings, (email, s) => this.classifyOne(email, s))
    } catch (err) {
      logger.warn('Cloud classification batch failed unexpectedly', {
        error: err instanceof Error ? err.message : String(err)
      })
    }
  }

  /**
   * v4 Phase 5 "Cloud Second Opinion": a separate pass from category
   * classification above — asks for attention/next-action/deadline/risk only,
   * and triggers on a slightly different condition (local confidence is low,
   * OR the local signal is high-impact enough — a high risk or "due today"
   * read — that it's worth double-checking even when category was obvious).
   * Same fire-and-forget contract as `classifyAmbiguous`.
   */
  async analyzeInsight(emails: EmailSummary[]): Promise<void> {
    const settings = this.getSettings()
    if (!settings.ai.enabled || !settings.ai.classificationEnabled) return
    if (settings.ai.provider === 'none') return
    if (!this.credentials.status(settings.ai.provider).hasCredential) return

    const candidates = emails.filter((email) => {
      const insight = classifyEmail(email, settings.rules.senderRules)
      return insight.confidence < CONFIDENCE_THRESHOLD || isHighImpactLocally(insight)
    })
    if (candidates.length === 0) return

    try {
      await this.runSequential(candidates, settings, (email, s) => this.analyzeOne(email, s))
    } catch (err) {
      logger.warn('Cloud insight batch failed unexpectedly', {
        error: err instanceof Error ? err.message : String(err)
      })
    }
  }

  /** Sequential, not parallel — this is a low-priority background pass over
   *  at most ~25 messages, not worth the complexity of a concurrency limiter. */
  private async runSequential(
    candidates: EmailSummary[],
    settings: Settings,
    run: (email: EmailSummary, settings: Settings) => Promise<void>
  ): Promise<void> {
    for (const email of candidates) {
      await run(email, settings)
    }
  }

  private async classifyOne(email: EmailSummary, settings: Settings): Promise<void> {
    const provider = this.registry.get(settings.ai.provider)
    if (!provider?.classify) return

    const emailIdHash = hashEmailId(email.id)
    const cached = this.store?.getAIClassification(emailIdHash, settings.ai.provider)
    if (cached && isMailCategory(cached.category)) {
      this.applyResult(email.id, cached.category)
      return
    }

    const decision = decideAIPrivacy({ email, settings })
    this.store?.recordAIPrivacyDecision({
      emailIdHash: decision.emailIdHash,
      providerId: settings.ai.provider,
      decision: decision.allowed ? 'allowed' : 'blocked',
      reason: decision.reason,
      redactionsJson: JSON.stringify(decision.redactions)
    })
    if (!decision.allowed || !decision.payload) return

    try {
      const result = await provider.classify({ email: decision.payload, labels: CLASSIFICATION_LABELS })
      if (!isMailCategory(result.label)) {
        logger.warn('Cloud classification returned an unrecognized category', {
          provider: settings.ai.provider,
          label: result.label
        })
        return
      }

      this.store?.upsertAIClassification({
        emailIdHash,
        providerId: result.providerId,
        model: result.model,
        category: result.label
      })
      this.store?.recordAIAudit({
        action: 'classify',
        providerId: result.providerId,
        model: result.model,
        emailIdHash,
        decision: 'allowed',
        reason: null
      })
      this.applyResult(email.id, result.label)
    } catch (err) {
      logger.warn('Cloud classification request failed', {
        provider: settings.ai.provider,
        error: err instanceof Error ? err.message : String(err)
      })
    }
  }

  private async analyzeOne(email: EmailSummary, settings: Settings): Promise<void> {
    const provider = this.registry.get(settings.ai.provider)
    if (!provider?.analyzeInsight) return // provider doesn't support this yet — fail quietly, local insight stands

    const emailIdHash = hashEmailId(email.id)
    const cached = this.store?.getAIInsight(emailIdHash, settings.ai.provider)
    if (cached) {
      this.applyInsight(email.id, cacheEntryToOverride(cached))
      return
    }

    const decision = decideAIPrivacy({ email, settings })
    this.store?.recordAIPrivacyDecision({
      emailIdHash: decision.emailIdHash,
      providerId: settings.ai.provider,
      decision: decision.allowed ? 'allowed' : 'blocked',
      reason: decision.reason,
      redactionsJson: JSON.stringify(decision.redactions)
    })
    if (!decision.allowed || !decision.payload) return

    try {
      const result = await provider.analyzeInsight({ email: decision.payload })

      this.store?.upsertAIInsight(resultToCacheEntry(emailIdHash, result))
      this.store?.recordAIAudit({
        action: 'insight',
        providerId: result.providerId,
        model: result.model,
        emailIdHash,
        decision: 'allowed',
        reason: null
      })
      this.applyInsight(email.id, resultToOverride(result))
    } catch (err) {
      // Fail quietly back to local intelligence — we never touched state, so
      // the email keeps whatever attention/action/risk/deadline it already had.
      logger.warn('Cloud insight request failed', {
        provider: settings.ai.provider,
        error: err instanceof Error ? err.message : String(err)
      })
    }
  }

  private applyResult(emailId: string, category: MailCategory): void {
    const state = this.getState()
    const emails = state.emails.map((e) => (e.id === emailId ? { ...e, cloudCategory: category } : e))
    this.setState({ emails })
  }

  private applyInsight(emailId: string, cloudInsight: CloudInsightOverride): void {
    const state = this.getState()
    const emails = state.emails.map((e) => (e.id === emailId ? { ...e, cloudInsight } : e))
    this.setState({ emails })
  }
}
