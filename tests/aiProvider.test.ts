import test from 'node:test'
import assert from 'node:assert/strict'
import { MockAIProvider, AIProviderRegistry } from '../src/main/ai'

test('registers and resolves AI providers', () => {
  const registry = new AIProviderRegistry()
  const provider = new MockAIProvider()

  registry.register(provider)

  assert.equal(registry.get(provider.id), provider)
  assert.deepEqual(registry.list(), [provider])
  assert.equal(registry.get('missing'), null)
})

test('mock AI provider supports health checks and deterministic classification', async () => {
  const provider = new MockAIProvider()

  assert.deepEqual(await provider.healthCheck(), {
    ok: true,
    providerId: 'mock',
    message: 'Mock provider is ready.',
    models: ['local/mock-foundation']
  })

  const result = await provider.classify({
    email: { sender: 'Sender', senderAddress: 'sender@example.com', subject: 'Quarterly plan' },
    labels: ['work', 'noise']
  })

  assert.equal(result.label, 'work')
  assert.equal(result.providerId, 'mock')
  assert.equal(result.model, 'local/mock-foundation')
})
