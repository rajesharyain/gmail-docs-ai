import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { AIConnectionTester, AICredentialStore, type CredentialCrypto } from '../src/main/ai'
import { DEFAULT_SETTINGS } from '../src/shared/settings'

const testCrypto: CredentialCrypto = {
  isAvailable: () => true,
  encryptString: (value) => value,
  decryptString: (value) => value
}

function response(body: unknown, init: ResponseInit = { status: 200 }): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    ...init
  })
}

function withStore(run: (store: AICredentialStore) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'postmail-ai-connection-'))
  const store = new AICredentialStore(join(dir, 'credentials.json'), testCrypto)
  return run(store).finally(() => rmSync(dir, { recursive: true, force: true }))
}

test('connection test asks for credentials before network access', async () => {
  await withStore(async (store) => {
    let called = false
    const tester = new AIConnectionTester(store, (async () => {
      called = true
      return response([])
    }) as typeof fetch)

    const result = await tester.test({
      ...DEFAULT_SETTINGS,
      ai: { ...DEFAULT_SETTINGS.ai, enabled: true, provider: 'github-models' }
    })

    assert.equal(result.ok, false)
    assert.equal(called, false)
  })
})

test('connection test checks GitHub Models catalog without email data', async () => {
  await withStore(async (store) => {
    store.save('github-models', 'github-token')

    let requestedUrl = ''
    let authorization = ''
    const tester = new AIConnectionTester(store, (async (input, init) => {
      requestedUrl = String(input)
      authorization = String(init?.headers && (init.headers as Record<string, string>).Authorization)
      return response([{ id: 'openai/gpt-4.1' }, { id: 'openai/gpt-4.1-mini' }])
    }) as typeof fetch)

    const result = await tester.test({
      ...DEFAULT_SETTINGS,
      ai: { ...DEFAULT_SETTINGS.ai, enabled: true, provider: 'github-models' }
    })

    assert.equal(result.ok, true)
    assert.equal(result.modelCount, 2)
    assert.deepEqual(result.models, ['openai/gpt-4.1', 'openai/gpt-4.1-mini'])
    assert.equal(requestedUrl, 'https://models.github.ai/catalog/models')
    assert.equal(authorization, 'Bearer github-token')
  })
})

test('connection test checks Gemini models without email data', async () => {
  await withStore(async (store) => {
    store.save('gemini', 'gemini-token')

    let requestedUrl = ''
    let apiKey = ''
    const tester = new AIConnectionTester(store, (async (input, init) => {
      requestedUrl = String(input)
      apiKey = String(init?.headers && (init.headers as Record<string, string>)['x-goog-api-key'])
      return response({ models: [{ name: 'models/gemini-2.5-flash' }] })
    }) as typeof fetch)

    const result = await tester.test({
      ...DEFAULT_SETTINGS,
      ai: { ...DEFAULT_SETTINGS.ai, enabled: true, provider: 'gemini' }
    })

    assert.equal(result.ok, true)
    assert.equal(result.modelCount, 1)
    assert.deepEqual(result.models, ['gemini-2.5-flash'])
    assert.equal(requestedUrl, 'https://generativelanguage.googleapis.com/v1beta/models')
    assert.equal(apiKey, 'gemini-token')
  })
})

test('connection test checks Groq models without email data', async () => {
  await withStore(async (store) => {
    store.save('groq', 'groq-token')

    let requestedUrl = ''
    let authorization = ''
    const tester = new AIConnectionTester(store, (async (input, init) => {
      requestedUrl = String(input)
      authorization = String(init?.headers && (init.headers as Record<string, string>).Authorization)
      return response({ data: [{ id: 'llama-3.1-8b-instant' }, { id: 'llama-3.3-70b-versatile' }] })
    }) as typeof fetch)

    const result = await tester.test({
      ...DEFAULT_SETTINGS,
      ai: { ...DEFAULT_SETTINGS.ai, enabled: true, provider: 'groq' }
    })

    assert.equal(result.ok, true)
    assert.equal(result.modelCount, 2)
    assert.deepEqual(result.models, ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile'])
    assert.equal(requestedUrl, 'https://api.groq.com/openai/v1/models')
    assert.equal(authorization, 'Bearer groq-token')
  })
})
