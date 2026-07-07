import type { MailAttentionLevel, MailDeadlineSignal, MailNextAction, MailRiskSignal } from '../../shared/types'
import type { AIPrivacyPayload } from './privacy'

export interface AIProviderRequestContext {
  accountEmail?: string
  signal?: AbortSignal
}

export interface AIClassificationRequest {
  /** Already redacted by decideAIPrivacy() — never the raw EmailSummary. */
  email: AIPrivacyPayload
  labels: string[]
  context?: AIProviderRequestContext
}

export interface AIClassificationResult {
  label: string
  confidence: number
  providerId: string
  model: string | null
}

/** v4 Phase 5 "Cloud Second Opinion" — attention/action/deadline/risk only,
 *  never category (that stays the `classify` request's job). */
export interface AIInsightRequest {
  /** Already redacted by decideAIPrivacy() — never the raw EmailSummary. */
  email: AIPrivacyPayload
  context?: AIProviderRequestContext
}

export interface AIInsightResult {
  attentionLevel: MailAttentionLevel
  nextAction: MailNextAction
  deadline: MailDeadlineSignal
  risk: MailRiskSignal
  reasons: string[]
  providerId: string
  model: string | null
}

export interface AIHealthCheckResult {
  ok: boolean
  providerId: string
  message: string
  models?: string[]
}

export interface AIProvider {
  id: string
  displayName: string
  /** Only `classify` is wired into a real code path today — the rest are
   *  optional so a provider doesn't need to fake methods no caller uses. */
  healthCheck?(context?: AIProviderRequestContext): Promise<AIHealthCheckResult>
  listModels?(context?: AIProviderRequestContext): Promise<string[]>
  classify?(request: AIClassificationRequest): Promise<AIClassificationResult>
  analyzeInsight?(request: AIInsightRequest): Promise<AIInsightResult>
}
