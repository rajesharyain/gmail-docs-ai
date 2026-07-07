import type { AICredentialStore } from '../credentialStore'
import type { AIClassificationRequest, AIClassificationResult, AIInsightRequest, AIInsightResult, AIProvider } from '../types'
import { analyzeInsightViaChatCompletions, classifyViaChatCompletions } from './chatCompletionsClassifier'

type Fetch = typeof fetch

const ENDPOINT = 'https://models.github.ai/inference/chat/completions'
const API_VERSION_HEADER = { 'X-GitHub-Api-Version': '2026-03-10' }

export class GitHubModelsProvider implements AIProvider {
  readonly id = 'github-models'
  readonly displayName = 'GitHub Models'

  constructor(
    private readonly credentials: AICredentialStore,
    private readonly getModel: () => string | null,
    private readonly fetchImpl: Fetch = fetch
  ) {}

  async classify(request: AIClassificationRequest): Promise<AIClassificationResult> {
    const token = this.credentials.readToken('github-models')
    if (!token) throw new Error('No GitHub Models credential saved.')
    const model = this.getModel()
    if (!model) throw new Error('No GitHub Models model selected.')

    const label = await classifyViaChatCompletions({
      endpoint: ENDPOINT,
      token,
      model,
      email: request.email,
      labels: request.labels,
      fetchImpl: this.fetchImpl,
      extraHeaders: API_VERSION_HEADER
    })

    return { label, confidence: 0.75, providerId: this.id, model }
  }

  async analyzeInsight(request: AIInsightRequest): Promise<AIInsightResult> {
    const token = this.credentials.readToken('github-models')
    if (!token) throw new Error('No GitHub Models credential saved.')
    const model = this.getModel()
    if (!model) throw new Error('No GitHub Models model selected.')

    const parsed = await analyzeInsightViaChatCompletions({
      endpoint: ENDPOINT,
      token,
      model,
      email: request.email,
      fetchImpl: this.fetchImpl,
      extraHeaders: API_VERSION_HEADER
    })

    return { ...parsed, providerId: this.id, model }
  }
}
