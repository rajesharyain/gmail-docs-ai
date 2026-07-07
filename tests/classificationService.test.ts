import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { ClassificationService } from '../src/main/ai/classificationService'
import { AICredentialStore, AIProviderRegistry, hashEmailId, type CredentialCrypto } from '../src/main/ai'
import type {
  AIClassificationRequest,
  AIClassificationResult,
  AIInsightRequest,
  AIInsightResult,
  AIProvider
} from '../src/main/ai/types'
import { SqliteStore } from '../src/main/storage/sqliteStore'
import { DEFAULT_SETTINGS } from '../src/shared/settings'
import type { EmailSummary, InboxState, Settings } from '../src/shared/types'
import { email } from './helpers'

const testCrypto: CredentialCrypto = {
  isAvailable: () => true,
  encryptString: (v) => v,
  decryptString: (v) => v
}

class FakeProvider implements AIProvider {
  readonly id = 'groq'
  readonly displayName = 'Fake Groq'
  calls: AIClassificationRequest[] = []

  constructor(private readonly outcome: AIClassificationResult | Error) {}

  async classify(request: AIClassificationRequest): Promise<AIClassificationResult> {
    this.calls.push(request)
    if (this.outcome instanceof Error) throw this.outcome
    return this.outcome
  }
}

class FakeInsightProvider implements AIProvider {
  readonly id = 'groq'
  readonly displayName = 'Fake Groq Insight'
  calls: AIInsightRequest[] = []

  constructor(private readonly outcome: AIInsightResult | Error) {}

  async analyzeInsight(request: AIInsightRequest): Promise<AIInsightResult> {
    this.calls.push(request)
    if (this.outcome instanceof Error) throw this.outcome
    return this.outcome
  }
}

function insightResult(patch: Partial<AIInsightResult> = {}): AIInsightResult {
  return {
    attentionLevel: 'urgent',
    nextAction: 'pay',
    deadline: { hasDeadline: true, urgency: 'today', label: 'Due today' },
    risk: { level: 'high', reasons: ['Payment request'] },
    reasons: ['Payment request', 'Due today'],
    providerId: 'groq',
    model: 'llama-3.1-8b-instant',
    ...patch
  }
}

function baseSettings(patch: Partial<Settings['ai']> = {}): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ai: {
      ...DEFAULT_SETTINGS.ai,
      enabled: true,
      provider: 'groq',
      model: 'llama-3.1-8b-instant',
      classificationEnabled: true,
      privacy: { ...DEFAULT_SETTINGS.ai.privacy, allowExternalProcessing: true },
      ...patch
    }
  }
}

function makeState(emails: EmailSummary[]): InboxState {
  return { unreadCount: emails.length, newCount: 0, emails, lastSyncAt: null, status: 'ok', account: null }
}

async function withHarness(
  run: (harness: {
    credentials: AICredentialStore
    store: SqliteStore
    getState: () => InboxState
    setState: (patch: Partial<InboxState>) => void
  }) => Promise<void>
): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'postmail-ai-classification-service-'))
  const credentials = new AICredentialStore(join(dir, 'credentials.json'), testCrypto)
  const store = await SqliteStore.open(join(dir, 'test.sqlite3'))
  let state = makeState([])
  const getState = () => state
  const setState = (patch: Partial<InboxState>) => {
    state = { ...state, ...patch }
  }

  try {
    await run({ credentials, store, getState, setState })
  } finally {
    store.close()
    rmSync(dir, { recursive: true, force: true })
  }
}

const ambiguousEmail = email({ id: 'ambiguous-1', subject: 'Quick question about the trip' })
const confidentEmail = email({ id: 'finance-1', subject: 'Invoice payment due' })
// Confident category (domain match) but a high-risk keyword in the subject —
// should still be worth a cloud second opinion despite the confident category.
const highRiskConfidentEmail = email({
  id: 'risk-1',
  senderAddress: 'billing@stripe.com',
  subject: 'Please send a gift card to complete your order'
})
// Confident category (domain match) but a "today" deadline signal in the subject.
const todayDeadlineConfidentEmail = email({
  id: 'deadline-1',
  senderAddress: 'ops@stripe.com',
  subject: 'Action needed immediately'
})

test('does nothing when AI is disabled', async () => {
  await withHarness(async ({ credentials, store, getState, setState }) => {
    credentials.save('groq', 'token')
    const registry = new AIProviderRegistry()
    const provider = new FakeProvider({ label: 'jobs', confidence: 0.9, providerId: 'groq', model: 'm' })
    registry.register(provider)
    setState(makeState([ambiguousEmail]))

    const settings = baseSettings({ enabled: false })
    const service = new ClassificationService(registry, credentials, store, () => settings, getState, setState)
    await service.classifyAmbiguous([ambiguousEmail])

    assert.equal(provider.calls.length, 0)
    assert.equal(getState().emails[0].cloudCategory, undefined)
  })
})

test('does nothing when the classification feature flag is off', async () => {
  await withHarness(async ({ credentials, store, getState, setState }) => {
    credentials.save('groq', 'token')
    const registry = new AIProviderRegistry()
    const provider = new FakeProvider({ label: 'jobs', confidence: 0.9, providerId: 'groq', model: 'm' })
    registry.register(provider)
    setState(makeState([ambiguousEmail]))

    const settings = baseSettings({ classificationEnabled: false })
    const service = new ClassificationService(registry, credentials, store, () => settings, getState, setState)
    await service.classifyAmbiguous([ambiguousEmail])

    assert.equal(provider.calls.length, 0)
  })
})

test('does nothing without a saved credential', async () => {
  await withHarness(async ({ credentials, store, getState, setState }) => {
    const registry = new AIProviderRegistry()
    const provider = new FakeProvider({ label: 'jobs', confidence: 0.9, providerId: 'groq', model: 'm' })
    registry.register(provider)
    setState(makeState([ambiguousEmail]))

    const settings = baseSettings()
    const service = new ClassificationService(registry, credentials, store, () => settings, getState, setState)
    await service.classifyAmbiguous([ambiguousEmail])

    assert.equal(provider.calls.length, 0)
  })
})

test('only classifies emails below the local confidence threshold', async () => {
  await withHarness(async ({ credentials, store, getState, setState }) => {
    credentials.save('groq', 'token')
    const registry = new AIProviderRegistry()
    const provider = new FakeProvider({ label: 'jobs', confidence: 0.9, providerId: 'groq', model: 'llama-3.1-8b-instant' })
    registry.register(provider)
    setState(makeState([ambiguousEmail, confidentEmail]))

    const settings = baseSettings()
    const service = new ClassificationService(registry, credentials, store, () => settings, getState, setState)
    await service.classifyAmbiguous([ambiguousEmail, confidentEmail])

    assert.equal(provider.calls.length, 1)
    const finalEmails = getState().emails
    assert.equal(finalEmails.find((e) => e.id === 'ambiguous-1')?.cloudCategory, 'jobs')
    assert.equal(finalEmails.find((e) => e.id === 'finance-1')?.cloudCategory, undefined)
  })
})

test('uses the SQLite cache instead of calling the provider', async () => {
  await withHarness(async ({ credentials, store, getState, setState }) => {
    credentials.save('groq', 'token')
    store.upsertAIClassification({
      emailIdHash: hashEmailId(ambiguousEmail.id),
      providerId: 'groq',
      model: 'llama-3.1-8b-instant',
      category: 'home'
    })
    const registry = new AIProviderRegistry()
    const provider = new FakeProvider({ label: 'jobs', confidence: 0.9, providerId: 'groq', model: 'llama-3.1-8b-instant' })
    registry.register(provider)
    setState(makeState([ambiguousEmail]))

    const settings = baseSettings()
    const service = new ClassificationService(registry, credentials, store, () => settings, getState, setState)
    await service.classifyAmbiguous([ambiguousEmail])

    assert.equal(provider.calls.length, 0)
    assert.equal(getState().emails[0].cloudCategory, 'home')
  })
})

test('respects a blocked privacy decision and records it, without calling the provider', async () => {
  await withHarness(async ({ credentials, store, getState, setState }) => {
    credentials.save('groq', 'token')
    const registry = new AIProviderRegistry()
    const provider = new FakeProvider({ label: 'jobs', confidence: 0.9, providerId: 'groq', model: 'm' })
    registry.register(provider)
    setState(makeState([ambiguousEmail]))

    const settings = baseSettings({ privacy: { ...DEFAULT_SETTINGS.ai.privacy, allowExternalProcessing: false } })
    const service = new ClassificationService(registry, credentials, store, () => settings, getState, setState)
    await service.classifyAmbiguous([ambiguousEmail])

    assert.equal(provider.calls.length, 0)
    assert.equal(getState().emails[0].cloudCategory, undefined)
    const decisions = store.listAIPrivacyDecisions(1)
    assert.equal(decisions[0].decision, 'blocked')
  })
})

test('caches a successful classification and records an audit entry', async () => {
  await withHarness(async ({ credentials, store, getState, setState }) => {
    credentials.save('groq', 'token')
    const registry = new AIProviderRegistry()
    const provider = new FakeProvider({ label: 'jobs', confidence: 0.9, providerId: 'groq', model: 'llama-3.1-8b-instant' })
    registry.register(provider)
    setState(makeState([ambiguousEmail]))

    const settings = baseSettings()
    const service = new ClassificationService(registry, credentials, store, () => settings, getState, setState)
    await service.classifyAmbiguous([ambiguousEmail])

    assert.equal(
      store.getAIClassification(hashEmailId(ambiguousEmail.id), 'groq')?.category,
      'jobs'
    )
    assert.equal(store.listAIAudit(1)[0].action, 'classify')
  })
})

test('does not apply an unrecognized category from the provider', async () => {
  await withHarness(async ({ credentials, store, getState, setState }) => {
    credentials.save('groq', 'token')
    const registry = new AIProviderRegistry()
    const provider = new FakeProvider({ label: 'not-a-real-category', confidence: 0.9, providerId: 'groq', model: 'm' })
    registry.register(provider)
    setState(makeState([ambiguousEmail]))

    const settings = baseSettings()
    const service = new ClassificationService(registry, credentials, store, () => settings, getState, setState)
    await service.classifyAmbiguous([ambiguousEmail])

    assert.equal(getState().emails[0].cloudCategory, undefined)
    assert.equal(store.getAIClassification(hashEmailId(ambiguousEmail.id), 'groq'), null)
  })
})

test('swallows a provider error without crashing the batch', async () => {
  await withHarness(async ({ credentials, store, getState, setState }) => {
    credentials.save('groq', 'token')
    const registry = new AIProviderRegistry()
    const provider = new FakeProvider(new Error('network down'))
    registry.register(provider)
    setState(makeState([ambiguousEmail]))

    const settings = baseSettings()
    const service = new ClassificationService(registry, credentials, store, () => settings, getState, setState)
    await assert.doesNotReject(() => service.classifyAmbiguous([ambiguousEmail]))

    assert.equal(getState().emails[0].cloudCategory, undefined)
  })
})

// --- analyzeInsight (v4 Phase 5 "Cloud Second Opinion") ---------------------

test('analyzeInsight does nothing when AI is disabled', async () => {
  await withHarness(async ({ credentials, store, getState, setState }) => {
    credentials.save('groq', 'token')
    const registry = new AIProviderRegistry()
    const provider = new FakeInsightProvider(insightResult())
    registry.register(provider)
    setState(makeState([ambiguousEmail]))

    const settings = baseSettings({ enabled: false })
    const service = new ClassificationService(registry, credentials, store, () => settings, getState, setState)
    await service.analyzeInsight([ambiguousEmail])

    assert.equal(provider.calls.length, 0)
    assert.equal(getState().emails[0].cloudInsight, undefined)
  })
})

test('analyzeInsight does nothing without a saved credential', async () => {
  await withHarness(async ({ credentials, store, getState, setState }) => {
    const registry = new AIProviderRegistry()
    const provider = new FakeInsightProvider(insightResult())
    registry.register(provider)
    setState(makeState([ambiguousEmail]))

    const settings = baseSettings()
    const service = new ClassificationService(registry, credentials, store, () => settings, getState, setState)
    await service.analyzeInsight([ambiguousEmail])

    assert.equal(provider.calls.length, 0)
  })
})

test('analyzeInsight triggers on low local confidence', async () => {
  await withHarness(async ({ credentials, store, getState, setState }) => {
    credentials.save('groq', 'token')
    const registry = new AIProviderRegistry()
    const provider = new FakeInsightProvider(insightResult())
    registry.register(provider)
    setState(makeState([ambiguousEmail]))

    const settings = baseSettings()
    const service = new ClassificationService(registry, credentials, store, () => settings, getState, setState)
    await service.analyzeInsight([ambiguousEmail])

    assert.equal(provider.calls.length, 1)
    assert.equal(getState().emails[0].cloudInsight?.attentionLevel, 'urgent')
  })
})

test('analyzeInsight does not trigger for a confident, unremarkable email', async () => {
  await withHarness(async ({ credentials, store, getState, setState }) => {
    credentials.save('groq', 'token')
    const registry = new AIProviderRegistry()
    const provider = new FakeInsightProvider(insightResult())
    registry.register(provider)
    setState(makeState([confidentEmail]))

    const settings = baseSettings()
    const service = new ClassificationService(registry, credentials, store, () => settings, getState, setState)
    await service.analyzeInsight([confidentEmail])

    assert.equal(provider.calls.length, 0)
    assert.equal(getState().emails[0].cloudInsight, undefined)
  })
})

test('analyzeInsight triggers on a high local risk signal even with a confident category', async () => {
  await withHarness(async ({ credentials, store, getState, setState }) => {
    credentials.save('groq', 'token')
    const registry = new AIProviderRegistry()
    const provider = new FakeInsightProvider(insightResult())
    registry.register(provider)
    setState(makeState([highRiskConfidentEmail]))

    const settings = baseSettings()
    const service = new ClassificationService(registry, credentials, store, () => settings, getState, setState)
    await service.analyzeInsight([highRiskConfidentEmail])

    assert.equal(provider.calls.length, 1)
  })
})

test('analyzeInsight triggers on a "due today" local deadline signal even with a confident category', async () => {
  await withHarness(async ({ credentials, store, getState, setState }) => {
    credentials.save('groq', 'token')
    const registry = new AIProviderRegistry()
    const provider = new FakeInsightProvider(insightResult())
    registry.register(provider)
    setState(makeState([todayDeadlineConfidentEmail]))

    const settings = baseSettings()
    const service = new ClassificationService(registry, credentials, store, () => settings, getState, setState)
    await service.analyzeInsight([todayDeadlineConfidentEmail])

    assert.equal(provider.calls.length, 1)
  })
})

test('analyzeInsight uses the SQLite cache instead of calling the provider', async () => {
  await withHarness(async ({ credentials, store, getState, setState }) => {
    credentials.save('groq', 'token')
    store.upsertAIInsight({
      emailIdHash: hashEmailId(ambiguousEmail.id),
      providerId: 'groq',
      model: 'llama-3.1-8b-instant',
      attentionLevel: 'low',
      nextAction: 'archive',
      hasDeadline: false,
      deadlineUrgency: null,
      deadlineLabel: null,
      riskLevel: 'none',
      riskReasonsJson: '[]',
      reasonsJson: '[]'
    })
    const registry = new AIProviderRegistry()
    const provider = new FakeInsightProvider(insightResult())
    registry.register(provider)
    setState(makeState([ambiguousEmail]))

    const settings = baseSettings()
    const service = new ClassificationService(registry, credentials, store, () => settings, getState, setState)
    await service.analyzeInsight([ambiguousEmail])

    assert.equal(provider.calls.length, 0)
    assert.equal(getState().emails[0].cloudInsight?.attentionLevel, 'low')
  })
})

test('analyzeInsight respects a blocked privacy decision and records it, without calling the provider', async () => {
  await withHarness(async ({ credentials, store, getState, setState }) => {
    credentials.save('groq', 'token')
    const registry = new AIProviderRegistry()
    const provider = new FakeInsightProvider(insightResult())
    registry.register(provider)
    setState(makeState([ambiguousEmail]))

    const settings = baseSettings({ privacy: { ...DEFAULT_SETTINGS.ai.privacy, allowExternalProcessing: false } })
    const service = new ClassificationService(registry, credentials, store, () => settings, getState, setState)
    await service.analyzeInsight([ambiguousEmail])

    assert.equal(provider.calls.length, 0)
    assert.equal(getState().emails[0].cloudInsight, undefined)
    const decisions = store.listAIPrivacyDecisions(1)
    assert.equal(decisions[0].decision, 'blocked')
  })
})

test('analyzeInsight caches a successful result and records an "insight" audit entry', async () => {
  await withHarness(async ({ credentials, store, getState, setState }) => {
    credentials.save('groq', 'token')
    const registry = new AIProviderRegistry()
    const provider = new FakeInsightProvider(insightResult())
    registry.register(provider)
    setState(makeState([ambiguousEmail]))

    const settings = baseSettings()
    const service = new ClassificationService(registry, credentials, store, () => settings, getState, setState)
    await service.analyzeInsight([ambiguousEmail])

    assert.equal(store.getAIInsight(hashEmailId(ambiguousEmail.id), 'groq')?.attentionLevel, 'urgent')
    assert.equal(store.listAIAudit(1)[0].action, 'insight')
  })
})

test('analyzeInsight does nothing when the provider does not support it (fails quietly)', async () => {
  await withHarness(async ({ credentials, store, getState, setState }) => {
    credentials.save('groq', 'token')
    const registry = new AIProviderRegistry()
    const provider = new FakeProvider({ label: 'jobs', confidence: 0.9, providerId: 'groq', model: 'm' })
    registry.register(provider)
    setState(makeState([ambiguousEmail]))

    const settings = baseSettings()
    const service = new ClassificationService(registry, credentials, store, () => settings, getState, setState)
    await assert.doesNotReject(() => service.analyzeInsight([ambiguousEmail]))

    assert.equal(getState().emails[0].cloudInsight, undefined)
  })
})

test('analyzeInsight swallows a provider error without crashing the batch', async () => {
  await withHarness(async ({ credentials, store, getState, setState }) => {
    credentials.save('groq', 'token')
    const registry = new AIProviderRegistry()
    const provider = new FakeInsightProvider(new Error('network down'))
    registry.register(provider)
    setState(makeState([ambiguousEmail]))

    const settings = baseSettings()
    const service = new ClassificationService(registry, credentials, store, () => settings, getState, setState)
    await assert.doesNotReject(() => service.analyzeInsight([ambiguousEmail]))

    assert.equal(getState().emails[0].cloudInsight, undefined)
  })
})
