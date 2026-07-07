import test from 'node:test'
import assert from 'node:assert/strict'
import { decideAIPrivacy, hashEmailId } from '../src/main/ai'
import { DEFAULT_SETTINGS } from '../src/shared/settings'
import type { Settings } from '../src/shared/types'
import { email } from './helpers'

function settings(overrides: Partial<Settings['ai']> = {}): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ai: {
      ...DEFAULT_SETTINGS.ai,
      enabled: true,
      provider: 'gemini',
      model: 'gemini-3.5-flash',
      privacy: {
        ...DEFAULT_SETTINGS.ai.privacy,
        allowExternalProcessing: true
      },
      ...overrides
    }
  }
}

test('blocks AI processing when external processing is disabled', () => {
  const decision = decideAIPrivacy({
    email: email({ id: 'message-1' }),
    settings: settings({
      privacy: {
        ...DEFAULT_SETTINGS.ai.privacy,
        allowExternalProcessing: false
      }
    })
  })

  assert.equal(decision.allowed, false)
  assert.equal(decision.reason, 'External AI processing is disabled.')
  assert.equal(decision.payload, null)
  assert.equal(decision.emailIdHash, hashEmailId('message-1'))
})

test('builds metadata-only payload without preview content', () => {
  const decision = decideAIPrivacy({
    email: email({
      id: 'message-2',
      subject: 'Hello',
      preview: 'This should stay local.'
    }),
    settings: settings({
      privacy: {
        ...DEFAULT_SETTINGS.ai.privacy,
        mode: 'metadata-only',
        allowExternalProcessing: true
      }
    })
  })

  assert.equal(decision.allowed, true)
  assert.deepEqual(decision.payload, {
    sender: 'Sender',
    senderAddress: '[email]',
    subject: 'Hello'
  })
})

test('redacts sensitive data from allowed payloads', () => {
  const decision = decideAIPrivacy({
    email: email({
      id: 'message-3',
      sender: 'Jane jane@example.com',
      senderAddress: 'jane@example.com',
      subject: 'API key: abc123',
      preview: 'Call me at +1 415 555 0101 with card 4242 4242 4242 4242'
    }),
    settings: settings()
  })

  assert.equal(decision.allowed, true)
  assert.deepEqual(decision.redactions, ['api-key', 'credit-card', 'email-address', 'phone-number'])
  assert.deepEqual(decision.payload, {
    sender: 'Jane [email]',
    senderAddress: '[email]',
    subject: '[secret]',
    preview: 'Call me at [phone] with card [card]'
  })
})

test('can keep sensitive text when redaction is disabled', () => {
  const decision = decideAIPrivacy({
    email: email({
      id: 'message-4',
      subject: 'password: letmein'
    }),
    settings: settings({
      privacy: {
        ...DEFAULT_SETTINGS.ai.privacy,
        allowExternalProcessing: true,
        redactSensitiveData: false
      }
    })
  })

  assert.equal(decision.allowed, true)
  assert.deepEqual(decision.redactions, [])
  assert.equal(decision.payload?.subject, 'password: letmein')
})
