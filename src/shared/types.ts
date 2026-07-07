/** Shared types across main process and renderers. */

export interface EmailSummary {
  id: string
  sender: string
  senderAddress: string
  subject: string
  preview: string
  receivedAt: string // ISO 8601
  isRead: boolean
  isNew: boolean // arrived since last time the popup was opened
  webLink?: string // Graph API webLink, used to open the Microsoft mailbox item
  /** Set by the opt-in cloud classification fallback when local rules were unsure. */
  cloudCategory?: MailCategory
  /**
   * Set by the opt-in cloud "second opinion" (v4 Phase 5) when local rules
   * were unsure, or the local risk/deadline signal was high-impact enough to
   * be worth double-checking. Overrides the attention/action/deadline/risk
   * axes only — category still comes from `cloudCategory`/local rules.
   */
  cloudInsight?: CloudInsightOverride
}

export interface CloudInsightOverride {
  attentionLevel: MailAttentionLevel
  nextAction: MailNextAction
  deadline: MailDeadlineSignal
  risk: MailRiskSignal
  reasons: string[]
}

export interface AccountSummary {
  name: string
  email: string
}

/** The three direct Graph-writing actions available on an email. */
export type EmailActionKind = 'markRead' | 'archive' | 'delete'

export type MailCategory =
  | 'important'
  | 'finance'
  | 'jobs'
  | 'home'
  | 'work'
  | 'calendar'
  | 'promotions'
  | 'noise'
  | 'other'

export type MailPriority = 'high' | 'normal' | 'low'

export type MailAttentionLevel = 'urgent' | 'important' | 'normal' | 'low' | 'silent'

export type MailNextAction = 'reply' | 'review' | 'pay' | 'schedule' | 'track' | 'archive' | 'ignore' | 'open'

export type MailInsightSource = 'local' | 'cloud' | 'user-rule'

export type MailDeadlineUrgency = 'today' | 'soon' | 'later'

export interface MailDeadlineSignal {
  hasDeadline: boolean
  urgency: MailDeadlineUrgency | null
  label: string | null
}

export type MailRiskLevel = 'none' | 'low' | 'medium' | 'high'

export interface MailRiskSignal {
  level: MailRiskLevel
  reasons: string[]
}

export interface MailInsight {
  /** Existing v2 category contract, still used by sections and category chips. */
  category: MailCategory
  label: string
  priority: MailPriority
  isLikelyNoise: boolean
  /** 0–1: confidence in the structured insight. */
  confidence: number
  /** Human-readable explanations for why the result was chosen. */
  reasons: string[]
  /** V4 attention layer: whether this mail deserves interruption or emphasis. */
  attentionLevel: MailAttentionLevel
  /** 0–100 local attention score; higher means the app should surface it more prominently. */
  attentionScore: number
  /** Best single action to guide the user without opening the message first. */
  nextAction: MailNextAction
  /** Time-sensitive signal, if one is visible from sender/subject/preview. */
  deadline: MailDeadlineSignal
  /** Safety signal for suspicious or risky messages. */
  risk: MailRiskSignal
  /** Where the strongest insight came from. */
  source: MailInsightSource
}

export type RuleAction = 'important' | 'mute'
export type RuleMatchType = 'sender' | 'domain'

export interface SenderRule {
  id: string
  action: RuleAction
  matchType: RuleMatchType
  /** Lowercased sender address (matchType 'sender') or bare domain (matchType 'domain'). */
  value: string
  createdAt: string
}

/** Behavior signals the local learning layer records per sender (v4 Phase 7). */
export type LearningEventKind = 'open' | 'archive' | 'delete'

export interface SenderLearningStats {
  /** Display name from the most recent event, for suggestion wording. */
  name: string
  open: number
  archive: number
  delete: number
  lastEventAt: string
}

export interface LearningData {
  /** Keyed by lowercased sender address. */
  senders: Record<string, SenderLearningStats>
  /** Suggestion ids the user dismissed — never re-suggested. */
  dismissed: string[]
}

export interface RuleSuggestion {
  /** Stable key `${action}:${value}` — doubles as the dismissal record. */
  id: string
  action: RuleAction
  matchType: RuleMatchType
  /** Lowercased sender address the suggested rule would apply to. */
  value: string
  senderName: string
  /** Explainable, e.g. "You've archived 3 emails from this sender." */
  reason: string
  evidenceCount: number
}

export interface InboxRulesSettings {
  /** User overrides — checked before the heuristic rules in mailIntelligence.ts. */
  senderRules: SenderRule[]
  /** Categories hidden from the popup list. Display-only: does not affect unread count or notifications. */
  hiddenCategories: MailCategory[]
  /** Group the popup into category sections (Important, Finance, …). Off falls back to the flat recency list. */
  sectionsEnabled: boolean
  /**
   * Notification policy (v4 Smart Notifications). Default off: new-mail
   * notifications are suppressed for `low`/`silent` attention-level mail so
   * urgent/important mail doesn't get lost in newsletter noise. Turning this
   * on opts back into the old "notify for everything" behavior.
   */
  notifyLowAttention: boolean
}

export type AIProviderId = 'none' | 'github-models' | 'gemini' | 'groq' | 'custom'

export type AIPrivacyMode = 'metadata-only' | 'message-preview' | 'message-body'

export interface AIPrivacySettings {
  mode: AIPrivacyMode
  allowExternalProcessing: boolean
  redactSensitiveData: boolean
}

export interface AIProviderConfig {
  customEndpoint: string | null
}

export interface AISettings {
  /** AI stays opt-in. The notifier must work fully without an AI provider. */
  enabled: boolean
  provider: AIProviderId
  model: string | null
  /** The only cloud AI feature that's actually wired up — see ClassificationService. */
  classificationEnabled: boolean
  privacy: AIPrivacySettings
  providerConfig: AIProviderConfig
}

export interface AICredentialStatus {
  provider: AIProviderId
  hasCredential: boolean
  updatedAt: string | null
  storageAvailable: boolean
}

export interface AIConnectionTestResult {
  ok: boolean
  provider: AIProviderId
  checkedAt: string
  message: string
  modelCount?: number
  models?: string[]
}

export interface Settings {
  /** How often to check the Microsoft mailbox, in minutes. Clamped to 1–60. */
  pollIntervalMinutes: number
  /** Show a macOS notification when new mail arrives. */
  notificationsEnabled: boolean
  /**
   * Where clicking an email opens it:
   * - 'web'     → exact message in Microsoft mail on the web (default)
   * - 'desktop' → the Outlook app (inbox; falls back to web if not installed)
   */
  openIn: 'web' | 'desktop'
  /** Start the app automatically when logging into macOS (packaged app only). */
  launchAtLogin: boolean
  /** V2 foundation: AI features are disabled unless the user explicitly enables them. */
  ai: AISettings
  /** Local, always-on inbox rules — independent of the AI provider toggle above. */
  rules: InboxRulesSettings
}

export interface InboxState {
  unreadCount: number
  newCount: number
  emails: EmailSummary[]
  lastSyncAt: string | null
  status: 'signed-out' | 'signing-in' | 'syncing' | 'ok' | 'error'
  account: AccountSummary | null
  errorMessage?: string
}

/** IPC channel names — single source of truth. */
export const IPC = {
  toggleP: 'popup:toggle',
  inboxState: 'inbox:state',
  requestState: 'inbox:request-state',
  markSeen: 'inbox:mark-seen',
  syncNow: 'inbox:sync-now',
  openEmail: 'email:open',
  emailMarkRead: 'email:mark-read',
  emailArchive: 'email:archive',
  emailDelete: 'email:delete',
  emailMarkAllRead: 'email:mark-all-read',
  emailBulkAction: 'email:bulk-action',
  emailSearch: 'email:search',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  aiCredentialStatus: 'ai:credential-status',
  aiCredentialSave: 'ai:credential-save',
  aiCredentialClear: 'ai:credential-clear',
  aiConnectionTest: 'ai:connection-test',
  learningSuggestions: 'learning:suggestions',
  learningDismiss: 'learning:dismiss',
  signIn: 'auth:sign-in',
  signOut: 'auth:sign-out',
  quit: 'app:quit'
} as const
