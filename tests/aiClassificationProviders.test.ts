import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { AICredentialStore, CLASSIFICATION_LABELS, type CredentialCrypto } from '../src/main/ai'
import { GroqProvider } from '../src/main/ai/providers/groqProvider'
import { GitHubModelsProvider } from '../src/main/ai/providers/githubModelsProvider'
import { GeminiProvider } from '../src/main/ai/providers/geminiProvider'

const testCrypto: CredentialCrypto = {
  isAvailable: () => true,
  encryptString: (value) => value,
  decryptString: (value) => value
}

function response(body: unknown, init: ResponseInit = { status: 200 }): Response {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, ...init })
}

async function withStore(run: (store: AICredentialStore) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'postmail-ai-classify-'))
  const store = new AICredentialStore(join(dir, 'credentials.json'), testCrypto)
  await run(store).finally(() => rmSync(dir, { recursive: true, force: true }))
}

const email = { sender: 'Sender', senderAddress: 'sender@example.com', subject: 'Subject', preview: 'Preview' }

test('GroqProvider posts an OpenAI-compatible chat completion and parses the label', async () => {
  await withStore(async (store) => {
    store.save('groq', 'groq-token')
    let requestedUrl = ''
    let requestBody: Record<string, unknown> = {}
    let authorization = ''

    const provider = new GroqProvider(store, () => 'llama-3.1-8b-instant', (async (input, init) => {
      requestedUrl = String(input)
      authorization = String((init?.headers as Record<string, string>).Authorization)
      requestBody = JSON.parse(String(init?.body))
      return response({ choices: [{ message: { content: 'finance' } }] })
    }) as typeof fetch)

    const result = await provider.classify({ email, labels: CLASSIFICATION_LABELS })

    assert.equal(result.label, 'finance')
    assert.equal(result.providerId, 'groq')
    assert.equal(result.model, 'llama-3.1-8b-instant')
    assert.equal(requestedUrl, 'https://api.groq.com/openai/v1/chat/completions')
    assert.equal(authorization, 'Bearer groq-token')
    assert.equal(requestBody.model, 'llama-3.1-8b-instant')
    assert.equal((requestBody.messages as unknown[]).length, 2)
  })
})

test('GroqProvider throws without a saved credential', async () => {
  await withStore(async (store) => {
    const provider = new GroqProvider(store, () => 'llama-3.1-8b-instant', (async () => response({})) as typeof fetch)
    await assert.rejects(() => provider.classify({ email, labels: CLASSIFICATION_LABELS }))
  })
})

test('GroqProvider rejects an unrecognized label rather than guessing', async () => {
  await withStore(async (store) => {
    store.save('groq', 'groq-token')
    const provider = new GroqProvider(
      store,
      () => 'llama-3.1-8b-instant',
      (async () => response({ choices: [{ message: { content: 'not-a-real-category' } }] })) as typeof fetch
    )
    await assert.rejects(() => provider.classify({ email, labels: CLASSIFICATION_LABELS }))
  })
})

test('GroqProvider surfaces non-ok responses as errors', async () => {
  await withStore(async (store) => {
    store.save('groq', 'groq-token')
    const provider = new GroqProvider(
      store,
      () => 'llama-3.1-8b-instant',
      (async () => response({}, { status: 429 })) as typeof fetch
    )
    await assert.rejects(() => provider.classify({ email, labels: CLASSIFICATION_LABELS }))
  })
})

test('GitHubModelsProvider posts to the inference endpoint with the API version header', async () => {
  await withStore(async (store) => {
    store.save('github-models', 'gh-token')
    let requestedUrl = ''
    let apiVersion = ''

    const provider = new GitHubModelsProvider(store, () => 'openai/gpt-4.1-mini', (async (input, init) => {
      requestedUrl = String(input)
      apiVersion = String((init?.headers as Record<string, string>)['X-GitHub-Api-Version'])
      return response({ choices: [{ message: { content: 'jobs' } }] })
    }) as typeof fetch)

    const result = await provider.classify({ email, labels: CLASSIFICATION_LABELS })

    assert.equal(result.label, 'jobs')
    assert.equal(requestedUrl, 'https://models.github.ai/inference/chat/completions')
    assert.equal(apiVersion, '2026-03-10')
  })
})

test('GeminiProvider posts to generateContent and parses the text response', async () => {
  await withStore(async (store) => {
    store.save('gemini', 'gemini-token')
    let requestedUrl = ''
    let apiKey = ''

    const provider = new GeminiProvider(store, () => 'gemini-2.5-flash', (async (input, init) => {
      requestedUrl = String(input)
      apiKey = String((init?.headers as Record<string, string>)['x-goog-api-key'])
      return response({ candidates: [{ content: { parts: [{ text: ' Noise ' }] } }] })
    }) as typeof fetch)

    const result = await provider.classify({ email, labels: CLASSIFICATION_LABELS })

    assert.equal(result.label, 'noise')
    assert.equal(requestedUrl, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent')
    assert.equal(apiKey, 'gemini-token')
  })
})

test('GeminiProvider throws without a model selected', async () => {
  await withStore(async (store) => {
    store.save('gemini', 'gemini-token')
    const provider = new GeminiProvider(store, () => null, (async () => response({})) as typeof fetch)
    await assert.rejects(() => provider.classify({ email, labels: CLASSIFICATION_LABELS }))
  })
})

const insightJson = JSON.stringify({
  attentionLevel: 'urgent',
  nextAction: 'pay',
  deadline: 'today',
  risk: 'high',
  reasons: ['Payment request', 'Time-sensitive wording']
})

test('GroqProvider.analyzeInsight posts to the same chat-completions endpoint and parses structured insight', async () => {
  await withStore(async (store) => {
    store.save('groq', 'groq-token')
    let requestBody: Record<string, unknown> = {}

    const provider = new GroqProvider(store, () => 'llama-3.1-8b-instant', (async (_input, init) => {
      requestBody = JSON.parse(String(init?.body))
      return response({ choices: [{ message: { content: insightJson } }] })
    }) as typeof fetch)

    const result = await provider.analyzeInsight({ email })

    assert.equal(result.attentionLevel, 'urgent')
    assert.equal(result.nextAction, 'pay')
    assert.deepEqual(result.deadline, { hasDeadline: true, urgency: 'today', label: 'Due today' })
    assert.deepEqual(result.risk, { level: 'high', reasons: ['Payment request', 'Time-sensitive wording'] })
    assert.equal(result.providerId, 'groq')
    assert.equal((requestBody.messages as unknown[]).length, 2)
  })
})

test('GroqProvider.analyzeInsight rejects a malformed response rather than guessing', async () => {
  await withStore(async (store) => {
    store.save('groq', 'groq-token')
    const provider = new GroqProvider(
      store,
      () => 'llama-3.1-8b-instant',
      (async () => response({ choices: [{ message: { content: 'not json at all' } }] })) as typeof fetch
    )
    await assert.rejects(() => provider.analyzeInsight({ email }))
  })
})

test('GitHubModelsProvider.analyzeInsight posts to the inference endpoint with the API version header', async () => {
  await withStore(async (store) => {
    store.save('github-models', 'gh-token')
    let apiVersion = ''

    const provider = new GitHubModelsProvider(store, () => 'openai/gpt-4.1-mini', (async (_input, init) => {
      apiVersion = String((init?.headers as Record<string, string>)['X-GitHub-Api-Version'])
      return response({ choices: [{ message: { content: insightJson } }] })
    }) as typeof fetch)

    const result = await provider.analyzeInsight({ email })

    assert.equal(result.attentionLevel, 'urgent')
    assert.equal(apiVersion, '2026-03-10')
  })
})

test('GeminiProvider.analyzeInsight posts to generateContent and parses structured insight', async () => {
  await withStore(async (store) => {
    store.save('gemini', 'gemini-token')

    const provider = new GeminiProvider(
      store,
      () => 'gemini-2.5-flash',
      (async () => response({ candidates: [{ content: { parts: [{ text: insightJson }] } }] })) as typeof fetch
    )

    const result = await provider.analyzeInsight({ email })

    assert.equal(result.attentionLevel, 'urgent')
    assert.equal(result.nextAction, 'pay')
    assert.equal(result.providerId, 'gemini')
  })
})

test('GeminiProvider.analyzeInsight surfaces non-ok responses as errors', async () => {
  await withStore(async (store) => {
    store.save('gemini', 'gemini-token')
    const provider = new GeminiProvider(
      store,
      () => 'gemini-2.5-flash',
      (async () => response({}, { status: 500 })) as typeof fetch
    )
    await assert.rejects(() => provider.analyzeInsight({ email }))
  })
})
