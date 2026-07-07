import type { AIProviderId, EmailActionKind, Settings } from '../shared/types'
import { normalizeAISettings, normalizeRulesSettings } from '../shared/settings'
import { isTrustedGoogleMailLink } from './googleMail'

const SETTING_KEYS = new Set([
  'pollIntervalMinutes',
  'notificationsEnabled',
  'openIn',
  'launchAtLogin',
  'ai',
  'rules'
])

export function sanitizeSettingsPatch(input: unknown): Partial<Settings> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}

  const patch = input as Record<string, unknown>
  const clean: Partial<Settings> = {}

  for (const key of Object.keys(patch)) {
    if (!SETTING_KEYS.has(key)) continue
    const value = patch[key]

    if (key === 'pollIntervalMinutes' && typeof value === 'number' && Number.isFinite(value)) {
      clean.pollIntervalMinutes = value
    }
    if (key === 'notificationsEnabled' && typeof value === 'boolean') {
      clean.notificationsEnabled = value
    }
    if (key === 'openIn' && (value === 'web' || value === 'desktop')) {
      clean.openIn = value
    }
    if (key === 'launchAtLogin' && typeof value === 'boolean') {
      clean.launchAtLogin = value
    }
    if (key === 'ai') {
      clean.ai = normalizeAISettings(value)
    }
    if (key === 'rules') {
      clean.rules = normalizeRulesSettings(value)
    }
  }

  return clean
}

export function isEmailId(input: unknown): input is string {
  return typeof input === 'string' && input.trim().length > 0
}

/** Suggestion ids are `${action}:${lowercased address}` — short, non-empty
 *  strings. The length cap only guards against garbage payloads. */
export function sanitizeSuggestionId(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  if (!trimmed || trimmed.length > 320) return null
  return trimmed
}

/** Matches the fetch page size — a bulk action can never exceed what's ever
 *  visible in the popup at once. */
const MAX_BULK_IDS = 25

export function isEmailActionKind(input: unknown): input is EmailActionKind {
  return input === 'markRead' || input === 'archive' || input === 'delete'
}

export function sanitizeBulkEmailAction(
  input: unknown
): { ids: string[]; action: EmailActionKind } | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const value = input as Record<string, unknown>
  if (!isEmailActionKind(value.action) || !Array.isArray(value.ids)) return null
  const ids = value.ids.filter(isEmailId)
  if (ids.length === 0 || ids.length > MAX_BULK_IDS) return null
  return { ids, action: value.action }
}

const MAX_SEARCH_QUERY_LENGTH = 200

/** Trims and length-caps a search query; empty or overlong input is rejected. */
export function sanitizeSearchQuery(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  if (!trimmed || trimmed.length > MAX_SEARCH_QUERY_LENGTH) return null
  return trimmed
}

export function isCredentialProvider(input: unknown): input is Exclude<AIProviderId, 'none'> {
  return input === 'github-models' || input === 'gemini' || input === 'groq' || input === 'custom'
}

export function sanitizeCredentialSave(input: unknown): { provider: Exclude<AIProviderId, 'none'>; token: string } | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const value = input as Record<string, unknown>
  if (!isCredentialProvider(value.provider) || typeof value.token !== 'string') return null
  const token = value.token.trim()
  return token ? { provider: value.provider, token } : null
}

export const isTrustedExternalEmailLink = isTrustedGoogleMailLink
