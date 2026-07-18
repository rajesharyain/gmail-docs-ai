import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isCredentialProvider,
  isEmailActionKind,
  isEmailId,
  isTrustedExternalEmailLink,
  sanitizeBulkEmailAction,
  sanitizeCredentialSave,
  sanitizeSearchQuery,
  sanitizeSettingsPatch,
  sanitizeSuggestionId
} from '../src/main/ipcValidation'

test('sanitizes settings patches and drops unknown or invalid fields', () => {
  assert.deepEqual(
    sanitizeSettingsPatch({
      pollIntervalMinutes: 10,
      notificationsEnabled: false,
      openIn: 'desktop',
      launchAtLogin: true,
      ai: {
        enabled: true,
        provider: 'github-models',
        model: 'openai/gpt-4.1',
        classificationEnabled: true,
        privacy: { allowExternalProcessing: true },
        providerConfig: { customEndpoint: 'https://gateway.example.com/chat' }
      },
      extra: 'drop me'
    }),
    {
      pollIntervalMinutes: 10,
      notificationsEnabled: false,
      openIn: 'desktop',
      launchAtLogin: true,
      ai: {
        enabled: true,
        provider: 'github-models',
        model: 'openai/gpt-4.1',
        classificationEnabled: true,
        privacy: {
          mode: 'message-preview',
          allowExternalProcessing: true,
          redactSensitiveData: true
        },
        providerConfig: {
          customEndpoint: 'https://gateway.example.com/chat'
        }
      }
    }
  )

  assert.deepEqual(
    sanitizeSettingsPatch({
      pollIntervalMinutes: Number.NaN,
      notificationsEnabled: 'yes',
      openIn: 'native',
      launchAtLogin: 1
    }),
    {}
  )
})

test('sanitizes rules patches', () => {
  assert.deepEqual(
    sanitizeSettingsPatch({
      rules: {
        senderRules: [
          {
            id: '1',
            action: 'mute',
            matchType: 'domain',
            value: 'Spam.com',
            createdAt: '2026-01-01T00:00:00.000Z'
          }
        ],
        hiddenCategories: ['noise', 'bogus-category'],
        sectionsEnabled: false,
        notifyLowAttention: true
      }
    }),
    {
      rules: {
        senderRules: [
          { id: '1', action: 'mute', matchType: 'domain', value: 'spam.com', createdAt: '2026-01-01T00:00:00.000Z' }
        ],
        hiddenCategories: ['noise'],
        sectionsEnabled: false,
        notifyLowAttention: true,
        autoDismissNoise: true,
        fullMessagePreview: true
      }
    }
  )
})

test('validates email ids', () => {
  assert.equal(isEmailId('abc'), true)
  assert.equal(isEmailId('   '), false)
  assert.equal(isEmailId(null), false)
})

test('validates AI credential IPC payloads', () => {
  assert.equal(isCredentialProvider('github-models'), true)
  assert.equal(isCredentialProvider('gemini'), true)
  assert.equal(isCredentialProvider('groq'), true)
  assert.equal(isCredentialProvider('custom'), true)
  assert.equal(isCredentialProvider('none'), false)

  assert.deepEqual(sanitizeCredentialSave({ provider: 'github-models', token: '  ghp_test  ' }), {
    provider: 'github-models',
    token: 'ghp_test'
  })
  assert.equal(sanitizeCredentialSave({ provider: 'none', token: 'secret' }), null)
  assert.equal(sanitizeCredentialSave({ provider: 'custom', token: '   ' }), null)
})

test('allows only trusted Gmail web links', () => {
  assert.equal(isTrustedExternalEmailLink('https://mail.google.com/mail/u/0/#all/id'), true)
  assert.equal(isTrustedExternalEmailLink('https://mail.google.com/mail/u/0/#inbox/id'), true)
  assert.equal(isTrustedExternalEmailLink('http://mail.google.com/mail/u/0/#all/id'), false)
  assert.equal(isTrustedExternalEmailLink('https://accounts.google.com/mail/id'), false)
  assert.equal(isTrustedExternalEmailLink('https://evil.example.com/mail/id'), false)
  assert.equal(isTrustedExternalEmailLink('not a url'), false)
})

test('sanitizes search queries, trimming and rejecting empty or overlong input', () => {
  assert.equal(sanitizeSearchQuery('  invoice  '), 'invoice')
  assert.equal(sanitizeSearchQuery(''), null)
  assert.equal(sanitizeSearchQuery('   '), null)
  assert.equal(sanitizeSearchQuery(42), null)
  assert.equal(sanitizeSearchQuery('a'.repeat(201)), null)
  assert.equal(sanitizeSearchQuery('a'.repeat(200)), 'a'.repeat(200))
})

test('sanitizes rule-suggestion ids, rejecting empty or oversized input', () => {
  assert.equal(sanitizeSuggestionId('mute:news@promo.com'), 'mute:news@promo.com')
  assert.equal(sanitizeSuggestionId('  important:boss@example.com  '), 'important:boss@example.com')
  assert.equal(sanitizeSuggestionId(''), null)
  assert.equal(sanitizeSuggestionId('   '), null)
  assert.equal(sanitizeSuggestionId(42), null)
  assert.equal(sanitizeSuggestionId('x'.repeat(321)), null)
})

test('validates email action kinds', () => {
  assert.equal(isEmailActionKind('markRead'), true)
  assert.equal(isEmailActionKind('archive'), true)
  assert.equal(isEmailActionKind('delete'), true)
  assert.equal(isEmailActionKind('snooze'), false)
  assert.equal(isEmailActionKind(undefined), false)
})

test('sanitizes bulk email action payloads, filtering bad ids and rejecting bad shapes', () => {
  assert.deepEqual(sanitizeBulkEmailAction({ ids: ['1', '  ', 2, '3'], action: 'archive' }), {
    ids: ['1', '3'],
    action: 'archive'
  })
  assert.deepEqual(sanitizeBulkEmailAction({ ids: ['1'], action: 'done' }), {
    ids: ['1'],
    action: 'done'
  })
  assert.equal(sanitizeBulkEmailAction({ ids: ['1'], action: 'snooze' }), null)
  assert.equal(sanitizeBulkEmailAction({ ids: [], action: 'markRead' }), null)
  assert.equal(sanitizeBulkEmailAction({ ids: 'not-an-array', action: 'markRead' }), null)
  assert.equal(
    sanitizeBulkEmailAction({ ids: Array.from({ length: 101 }, (_, i) => String(i)), action: 'delete' }),
    null
  )
  assert.equal(sanitizeBulkEmailAction(null), null)
})
