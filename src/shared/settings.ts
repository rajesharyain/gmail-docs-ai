import type {
  AIPrivacySettings,
  AIProviderConfig,
  AISettings,
  InboxRulesSettings,
  MailCategory,
  RuleAction,
  RuleMatchType,
  SenderRule,
  Settings
} from './types'

const MAIL_CATEGORIES: MailCategory[] = [
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

export const DEFAULT_AI_PRIVACY_SETTINGS: AIPrivacySettings = {
  mode: 'message-preview',
  allowExternalProcessing: false,
  redactSensitiveData: true
}

export const DEFAULT_AI_PROVIDER_CONFIG: AIProviderConfig = {
  customEndpoint: null
}

export const DEFAULT_AI_SETTINGS: AISettings = {
  enabled: false,
  provider: 'none',
  model: null,
  classificationEnabled: false,
  privacy: DEFAULT_AI_PRIVACY_SETTINGS,
  providerConfig: DEFAULT_AI_PROVIDER_CONFIG
}

export const DEFAULT_RULES_SETTINGS: InboxRulesSettings = {
  senderRules: [],
  hiddenCategories: [],
  sectionsEnabled: true,
  notifyLowAttention: false,
  autoDismissNoise: true,
  fullMessagePreview: true
}

export const DEFAULT_SETTINGS: Settings = {
  pollIntervalMinutes: 5,
  notificationsEnabled: true,
  openIn: 'web',
  launchAtLogin: true,
  ai: DEFAULT_AI_SETTINGS,
  rules: DEFAULT_RULES_SETTINGS
}

function normalizePrivacy(raw: unknown): AIPrivacySettings {
  const privacy = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const value = privacy as Partial<Record<keyof AIPrivacySettings, unknown>>
  return {
    mode:
      value.mode === 'metadata-only' || value.mode === 'message-preview' || value.mode === 'message-body'
        ? value.mode
        : DEFAULT_AI_PRIVACY_SETTINGS.mode,
    allowExternalProcessing:
      typeof value.allowExternalProcessing === 'boolean'
        ? value.allowExternalProcessing
        : DEFAULT_AI_PRIVACY_SETTINGS.allowExternalProcessing,
    redactSensitiveData:
      typeof value.redactSensitiveData === 'boolean'
        ? value.redactSensitiveData
        : DEFAULT_AI_PRIVACY_SETTINGS.redactSensitiveData
  }
}

function normalizeProviderConfig(raw: unknown): AIProviderConfig {
  const config = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const value = config as Partial<Record<keyof AIProviderConfig, unknown>>
  const endpoint = typeof value.customEndpoint === 'string' ? value.customEndpoint.trim() : ''

  return {
    customEndpoint: endpoint.startsWith('https://') ? endpoint : null
  }
}

export function normalizeAISettings(raw: unknown): AISettings {
  const ai = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const value = ai as Partial<Record<keyof AISettings, unknown>>
  const enabled = typeof value.enabled === 'boolean' ? value.enabled : DEFAULT_AI_SETTINGS.enabled
  const provider =
    value.provider === 'github-models' ||
    value.provider === 'gemini' ||
    value.provider === 'groq' ||
    value.provider === 'custom'
      ? value.provider
      : DEFAULT_AI_SETTINGS.provider

  return {
    enabled,
    provider: enabled ? provider : 'none',
    model: typeof value.model === 'string' && value.model.trim() ? value.model.trim() : null,
    classificationEnabled:
      typeof value.classificationEnabled === 'boolean'
        ? value.classificationEnabled
        : DEFAULT_AI_SETTINGS.classificationEnabled,
    privacy: normalizePrivacy(value.privacy),
    providerConfig: normalizeProviderConfig(value.providerConfig)
  }
}

function normalizeSenderRule(raw: unknown): SenderRule | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const value = raw as Partial<Record<keyof SenderRule, unknown>>

  const action: RuleAction | null =
    value.action === 'important' || value.action === 'mute' ? value.action : null
  const matchType: RuleMatchType | null =
    value.matchType === 'sender' || value.matchType === 'domain' ? value.matchType : null
  const id = typeof value.id === 'string' && value.id.trim() ? value.id.trim() : null
  const ruleValue = typeof value.value === 'string' && value.value.trim() ? value.value.trim().toLowerCase() : null
  const createdAt = typeof value.createdAt === 'string' && value.createdAt ? value.createdAt : null

  if (!action || !matchType || !id || !ruleValue || !createdAt) return null
  return { id, action, matchType, value: ruleValue, createdAt }
}

export function normalizeRulesSettings(raw: unknown): InboxRulesSettings {
  const rules = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const value = rules as Partial<Record<keyof InboxRulesSettings, unknown>>

  const senderRules = Array.isArray(value.senderRules)
    ? value.senderRules.map(normalizeSenderRule).filter((rule): rule is SenderRule => rule !== null)
    : DEFAULT_RULES_SETTINGS.senderRules

  const hiddenCategories = Array.isArray(value.hiddenCategories)
    ? value.hiddenCategories.filter((c): c is MailCategory => MAIL_CATEGORIES.includes(c as MailCategory))
    : DEFAULT_RULES_SETTINGS.hiddenCategories

  const sectionsEnabled =
    typeof value.sectionsEnabled === 'boolean' ? value.sectionsEnabled : DEFAULT_RULES_SETTINGS.sectionsEnabled

  const notifyLowAttention =
    typeof value.notifyLowAttention === 'boolean'
      ? value.notifyLowAttention
      : DEFAULT_RULES_SETTINGS.notifyLowAttention

  const autoDismissNoise =
    typeof value.autoDismissNoise === 'boolean'
      ? value.autoDismissNoise
      : DEFAULT_RULES_SETTINGS.autoDismissNoise

  const fullMessagePreview =
    typeof value.fullMessagePreview === 'boolean'
      ? value.fullMessagePreview
      : DEFAULT_RULES_SETTINGS.fullMessagePreview

  return { senderRules, hiddenCategories, sectionsEnabled, notifyLowAttention, autoDismissNoise, fullMessagePreview }
}

export function normalizeSettings(raw: Partial<Settings>): Settings {
  const minutes = Number(raw.pollIntervalMinutes)
  return {
    pollIntervalMinutes: Number.isFinite(minutes)
      ? Math.min(60, Math.max(1, Math.round(minutes)))
      : DEFAULT_SETTINGS.pollIntervalMinutes,
    notificationsEnabled:
      typeof raw.notificationsEnabled === 'boolean'
        ? raw.notificationsEnabled
        : DEFAULT_SETTINGS.notificationsEnabled,
    openIn: raw.openIn === 'desktop' ? 'desktop' : DEFAULT_SETTINGS.openIn,
    launchAtLogin:
      typeof raw.launchAtLogin === 'boolean' ? raw.launchAtLogin : DEFAULT_SETTINGS.launchAtLogin,
    ai: normalizeAISettings(raw.ai),
    rules: normalizeRulesSettings(raw.rules)
  }
}
