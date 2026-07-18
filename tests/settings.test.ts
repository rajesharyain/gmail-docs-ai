import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETTINGS, normalizeAISettings, normalizeRulesSettings, normalizeSettings } from '../src/shared/settings'

test('normalizes legacy settings with AI disabled by default', () => {
  assert.deepEqual(
    normalizeSettings({
      pollIntervalMinutes: 500,
      notificationsEnabled: false,
      openIn: 'desktop',
      launchAtLogin: false
    }),
    {
      ...DEFAULT_SETTINGS,
      pollIntervalMinutes: 60,
      notificationsEnabled: false,
      openIn: 'desktop',
      launchAtLogin: false
    }
  )
})

test('keeps AI disabled unless explicitly enabled with a supported provider', () => {
  assert.equal(normalizeAISettings({ enabled: true, provider: 'github-models' }).provider, 'github-models')
  assert.equal(normalizeAISettings({ enabled: true, provider: 'gemini' }).provider, 'gemini')
  assert.equal(normalizeAISettings({ enabled: true, provider: 'groq' }).provider, 'groq')
  assert.equal(normalizeAISettings({ enabled: true, provider: 'custom' }).provider, 'custom')
  assert.equal(normalizeAISettings({ enabled: false, provider: 'github-models' }).provider, 'none')
  assert.equal(normalizeAISettings({ enabled: true, provider: 'copilot-internal' }).provider, 'none')
})

test('normalizes AI privacy and classification flag defensively', () => {
  assert.deepEqual(
    normalizeAISettings({
      enabled: true,
      provider: 'custom',
      model: '  custom-model  ',
      classificationEnabled: 'yes',
      privacy: {
        mode: 'message-body',
        allowExternalProcessing: true,
        redactSensitiveData: false
      },
      providerConfig: {
        customEndpoint: 'https://gateway.example.com/chat'
      }
    }),
    {
      enabled: true,
      provider: 'custom',
      model: 'custom-model',
      classificationEnabled: false,
      privacy: {
        mode: 'message-body',
        allowExternalProcessing: true,
        redactSensitiveData: false
      },
      providerConfig: {
        customEndpoint: 'https://gateway.example.com/chat'
      }
    }
  )
})

test('accepts a valid boolean for classificationEnabled', () => {
  assert.equal(normalizeAISettings({ enabled: true, classificationEnabled: true }).classificationEnabled, true)
})

test('rejects unsafe custom AI endpoints', () => {
  assert.equal(
    normalizeAISettings({
      enabled: true,
      provider: 'custom',
      providerConfig: { customEndpoint: 'http://gateway.example.com/chat' }
    }).providerConfig.customEndpoint,
    null
  )
})

test('normalizes rules settings, dropping malformed sender rules and unknown categories', () => {
  assert.deepEqual(
    normalizeRulesSettings({
      senderRules: [
        { id: '1', action: 'important', matchType: 'sender', value: 'Boss@Example.com', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: '2', action: 'mute', matchType: 'domain', value: 'spam.com', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: '3', action: 'snooze', matchType: 'sender', value: 'x@y.com', createdAt: '2026-01-01T00:00:00.000Z' },
        { action: 'mute', matchType: 'sender', value: 'missing-id@example.com', createdAt: '2026-01-01T00:00:00.000Z' },
        'not an object'
      ],
      hiddenCategories: ['noise', 'promotions', 'not-a-real-category'],
      sectionsEnabled: false,
      notifyLowAttention: true
    }),
    {
      senderRules: [
        { id: '1', action: 'important', matchType: 'sender', value: 'boss@example.com', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: '2', action: 'mute', matchType: 'domain', value: 'spam.com', createdAt: '2026-01-01T00:00:00.000Z' }
      ],
      hiddenCategories: ['noise', 'promotions'],
      sectionsEnabled: false,
      notifyLowAttention: true,
      autoDismissNoise: true,
      fullMessagePreview: true
    }
  )
})

test('defaults rules settings to empty (sections on, low-attention notifications off) when missing', () => {
  assert.deepEqual(normalizeRulesSettings(undefined), {
    senderRules: [],
    hiddenCategories: [],
    sectionsEnabled: true,
    notifyLowAttention: false,
    autoDismissNoise: true,
    fullMessagePreview: true
  })
})
