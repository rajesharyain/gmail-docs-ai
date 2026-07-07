import type { AIConnectionTestResult, Settings } from '../../shared/types'
import type { AICredentialStore } from './credentialStore'

type Fetch = typeof fetch

export class AIConnectionTester {
  constructor(
    private readonly credentials: AICredentialStore,
    private readonly fetchImpl: Fetch = fetch
  ) {}

  async test(settings: Settings): Promise<AIConnectionTestResult> {
    const checkedAt = new Date().toISOString()
    const provider = settings.ai.provider

    if (!settings.ai.enabled || provider === 'none') {
      return { ok: false, provider, checkedAt, message: 'Enable PostMail AI and choose a provider first.' }
    }

    const token = this.credentials.readToken(provider)
    if (!token) {
      return { ok: false, provider, checkedAt, message: 'Save a credential before testing the connection.' }
    }

    if (provider === 'github-models') {
      return this.testGitHubModels(token, checkedAt)
    }
    if (provider === 'gemini') {
      return this.testGemini(token, checkedAt)
    }
    if (provider === 'groq') {
      return this.testGroq(token, checkedAt)
    }

    return this.testCustomProvider(settings, token, checkedAt)
  }

  private async testGitHubModels(token: string, checkedAt: string): Promise<AIConnectionTestResult> {
    const response = await this.fetchWithTimeout('https://models.github.ai/catalog/models', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2026-03-10'
      }
    })

    if (!response.ok) {
      return {
        ok: false,
        provider: 'github-models',
        checkedAt,
        message: `GitHub Models returned ${response.status}. Check the token and models access.`
      }
    }

    const body = (await response.json()) as unknown
    const models = Array.isArray(body)
      ? (body as Array<{ id?: unknown }>).map((m) => m.id).filter((id): id is string => typeof id === 'string')
      : undefined
    const modelCount = models?.length
    return {
      ok: true,
      provider: 'github-models',
      checkedAt,
      modelCount,
      models,
      message: modelCount ? `Connected. ${modelCount} models available.` : 'Connected to GitHub Models.'
    }
  }

  private async testGemini(token: string, checkedAt: string): Promise<AIConnectionTestResult> {
    const response = await this.fetchWithTimeout('https://generativelanguage.googleapis.com/v1beta/models', {
      headers: {
        Accept: 'application/json',
        'x-goog-api-key': token
      }
    })

    if (!response.ok) {
      return {
        ok: false,
        provider: 'gemini',
        checkedAt,
        message: `Gemini returned ${response.status}. Check the API key and project access.`
      }
    }

    const body = (await response.json()) as { models?: Array<{ name?: unknown }> }
    const models = Array.isArray(body.models)
      ? body.models
          .map((m) => (typeof m.name === 'string' ? m.name.replace(/^models\//, '') : null))
          .filter((name): name is string => Boolean(name))
      : undefined
    const modelCount = models?.length
    return {
      ok: true,
      provider: 'gemini',
      checkedAt,
      modelCount,
      models,
      message: modelCount ? `Connected. ${modelCount} models available.` : 'Connected to Gemini.'
    }
  }

  private async testGroq(token: string, checkedAt: string): Promise<AIConnectionTestResult> {
    const response = await this.fetchWithTimeout('https://api.groq.com/openai/v1/models', {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`
      }
    })

    if (!response.ok) {
      return {
        ok: false,
        provider: 'groq',
        checkedAt,
        message: `Groq returned ${response.status}. Check the API key and account access.`
      }
    }

    const body = (await response.json()) as { data?: Array<{ id?: unknown }> }
    const models = Array.isArray(body.data)
      ? body.data.map((m) => m.id).filter((id): id is string => typeof id === 'string')
      : undefined
    const modelCount = models?.length
    return {
      ok: true,
      provider: 'groq',
      checkedAt,
      modelCount,
      models,
      message: modelCount ? `Connected. ${modelCount} models available.` : 'Connected to Groq.'
    }
  }

  private async testCustomProvider(
    settings: Settings,
    token: string,
    checkedAt: string
  ): Promise<AIConnectionTestResult> {
    const endpoint = settings.ai.providerConfig.customEndpoint
    if (!endpoint) {
      return {
        ok: false,
        provider: 'custom',
        checkedAt,
        message: 'Enter a secure custom endpoint before testing.'
      }
    }

    const response = await this.fetchWithTimeout(endpoint, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`
      }
    })

    return {
      ok: response.ok,
      provider: 'custom',
      checkedAt,
      message: response.ok
        ? 'Connected to the custom provider.'
        : `Custom provider returned ${response.status}.`
    }
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal })
    } finally {
      clearTimeout(timeout)
    }
  }
}
