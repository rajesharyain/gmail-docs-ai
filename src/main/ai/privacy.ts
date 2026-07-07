import { createHash } from 'crypto'
import type { EmailSummary, Settings } from '../../shared/types'

export interface AIPrivacyInput {
  email: EmailSummary
  settings: Settings
}

export interface AIPrivacyPayload {
  sender: string
  senderAddress: string
  subject: string
  preview?: string
}

export interface AIPrivacyDecision {
  allowed: boolean
  reason: string | null
  emailIdHash: string
  payload: AIPrivacyPayload | null
  redactions: string[]
}

const SENSITIVE_PATTERNS: Array<{ label: string; pattern: RegExp; replacement: string }> = [
  {
    label: 'api-key',
    pattern: /\b(?:api[\s_-]?key|token|secret|password)\s*[:=]\s*\S+/gi,
    replacement: '[secret]'
  },
  {
    label: 'credit-card',
    pattern: /\b(?:\d[ -]*?){13,19}\b/g,
    replacement: '[card]'
  },
  {
    label: 'email-address',
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: '[email]'
  },
  {
    label: 'phone-number',
    pattern: /(?:\+?\d[\d .()-]{7,}\d)/g,
    replacement: '[phone]'
  }
]

export function decideAIPrivacy({ email, settings }: AIPrivacyInput): AIPrivacyDecision {
  const emailIdHash = hashEmailId(email.id)

  if (!settings.ai.enabled) {
    return {
      allowed: false,
      reason: 'AI is disabled.',
      emailIdHash,
      payload: null,
      redactions: []
    }
  }

  if (settings.ai.provider === 'none') {
    return {
      allowed: false,
      reason: 'No AI provider is selected.',
      emailIdHash,
      payload: null,
      redactions: []
    }
  }

  if (!settings.ai.privacy.allowExternalProcessing && settings.ai.provider !== 'custom') {
    return {
      allowed: false,
      reason: 'External AI processing is disabled.',
      emailIdHash,
      payload: null,
      redactions: []
    }
  }

  const redactions = new Set<string>()
  const redact = (value: string): string =>
    settings.ai.privacy.redactSensitiveData ? redactSensitiveText(value, redactions) : value

  const payload: AIPrivacyPayload = {
    sender: redact(email.sender),
    senderAddress: redact(email.senderAddress),
    subject: redact(email.subject)
  }

  if (settings.ai.privacy.mode === 'message-preview' || settings.ai.privacy.mode === 'message-body') {
    payload.preview = redact(email.preview)
  }

  return {
    allowed: true,
    reason: null,
    emailIdHash,
    payload,
    redactions: Array.from(redactions).sort()
  }
}

export function hashEmailId(id: string): string {
  return createHash('sha256').update(id).digest('hex')
}

function redactSensitiveText(value: string, redactions: Set<string>): string {
  let output = value
  for (const { label, pattern, replacement } of SENSITIVE_PATTERNS) {
    output = output.replace(pattern, () => {
      redactions.add(label)
      return replacement
    })
  }
  return output
}
