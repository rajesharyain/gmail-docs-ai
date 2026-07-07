import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { SqliteStore } from '../src/main/storage/sqliteStore'

async function withStore(run: (store: SqliteStore) => void): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'postmail-ai-sqlite-'))
  const store = await SqliteStore.open(join(dir, 'test.sqlite3'))
  try {
    run(store)
  } finally {
    store.close()
    rmSync(dir, { recursive: true, force: true })
  }
}

test('records and lists AI audit entries', async () => {
  await withStore((store) => {
    const id = store.recordAIAudit({
      action: 'summarize',
      providerId: 'mock',
      model: 'local/mock-foundation',
      emailIdHash: 'abc123',
      decision: 'allowed',
      reason: null
    })

    assert.equal(id, 1)
    assert.deepEqual(
      store.listAIAudit(1).map((entry) => ({
        action: entry.action,
        providerId: entry.providerId,
        model: entry.model,
        emailIdHash: entry.emailIdHash,
        decision: entry.decision,
        reason: entry.reason
      })),
      [
        {
          action: 'summarize',
          providerId: 'mock',
          model: 'local/mock-foundation',
          emailIdHash: 'abc123',
          decision: 'allowed',
          reason: null
        }
      ]
    )
  })
})

test('records and lists AI privacy decisions', async () => {
  await withStore((store) => {
    const id = store.recordAIPrivacyDecision({
      emailIdHash: 'hash-1',
      providerId: 'gemini',
      decision: 'blocked',
      reason: 'External AI processing is disabled.',
      redactionsJson: JSON.stringify(['email-address'])
    })

    assert.equal(id, 1)
    assert.deepEqual(
      store.listAIPrivacyDecisions(1).map((entry) => ({
        emailIdHash: entry.emailIdHash,
        providerId: entry.providerId,
        decision: entry.decision,
        reason: entry.reason,
        redactionsJson: entry.redactionsJson
      })),
      [
        {
          emailIdHash: 'hash-1',
          providerId: 'gemini',
          decision: 'blocked',
          reason: 'External AI processing is disabled.',
          redactionsJson: JSON.stringify(['email-address'])
        }
      ]
    )
  })
})

test('upserts and reads AI classification cache entries', async () => {
  await withStore((store) => {
    assert.equal(store.getAIClassification('message-1', 'groq'), null)

    store.upsertAIClassification({
      emailIdHash: 'message-1',
      providerId: 'groq',
      model: 'llama-3.1-8b-instant',
      category: 'finance'
    })

    assert.equal(store.getAIClassification('message-1', 'groq')?.category, 'finance')

    store.upsertAIClassification({
      emailIdHash: 'message-1',
      providerId: 'groq',
      model: 'llama-3.1-8b-instant',
      category: 'jobs'
    })

    assert.equal(store.getAIClassification('message-1', 'groq')?.category, 'jobs')
    // A different provider is a distinct cache entry, not overwritten.
    assert.equal(store.getAIClassification('message-1', 'gemini'), null)
  })
})

test('upserts and reads AI insight cache entries', async () => {
  await withStore((store) => {
    assert.equal(store.getAIInsight('message-1', 'groq'), null)

    store.upsertAIInsight({
      emailIdHash: 'message-1',
      providerId: 'groq',
      model: 'llama-3.1-8b-instant',
      attentionLevel: 'urgent',
      nextAction: 'pay',
      hasDeadline: true,
      deadlineUrgency: 'today',
      deadlineLabel: 'Due today',
      riskLevel: 'high',
      riskReasonsJson: JSON.stringify(['Payment request']),
      reasonsJson: JSON.stringify(['Payment request', 'Due today'])
    })

    const first = store.getAIInsight('message-1', 'groq')
    assert.equal(first?.attentionLevel, 'urgent')
    assert.equal(first?.hasDeadline, true)
    assert.deepEqual(JSON.parse(first?.reasonsJson ?? '[]'), ['Payment request', 'Due today'])

    store.upsertAIInsight({
      emailIdHash: 'message-1',
      providerId: 'groq',
      model: 'llama-3.1-8b-instant',
      attentionLevel: 'normal',
      nextAction: 'open',
      hasDeadline: false,
      deadlineUrgency: null,
      deadlineLabel: null,
      riskLevel: 'none',
      riskReasonsJson: '[]',
      reasonsJson: '[]'
    })

    const updated = store.getAIInsight('message-1', 'groq')
    assert.equal(updated?.attentionLevel, 'normal')
    assert.equal(updated?.hasDeadline, false)
    // A different provider is a distinct cache entry, not overwritten.
    assert.equal(store.getAIInsight('message-1', 'gemini'), null)
  })
})

test('creates and updates AI rules', async () => {
  await withStore((store) => {
    const id = store.saveAIRule({
      name: 'VIP summaries',
      enabled: true,
      conditionsJson: JSON.stringify({ fromDomain: 'example.com' }),
      actionsJson: JSON.stringify({ summarize: true })
    })

    store.saveAIRule({
      id,
      name: 'VIP summaries',
      enabled: false,
      conditionsJson: JSON.stringify({ fromDomain: 'example.com' }),
      actionsJson: JSON.stringify({ summarize: true })
    })

    assert.deepEqual(
      store.listAIRules().map((rule) => ({
        id: rule.id,
        name: rule.name,
        enabled: rule.enabled,
        conditionsJson: rule.conditionsJson,
        actionsJson: rule.actionsJson
      })),
      [
        {
          id,
          name: 'VIP summaries',
          enabled: false,
          conditionsJson: JSON.stringify({ fromDomain: 'example.com' }),
          actionsJson: JSON.stringify({ summarize: true })
        }
      ]
    )
  })
})
