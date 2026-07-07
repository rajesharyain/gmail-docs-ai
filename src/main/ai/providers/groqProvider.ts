import type { AICredentialStore } from '../credentialStore'
import type { AIClassificationRequest, AIClassificationResult, AIInsightRequest, AIInsightResult, AIProvider } from '../types'
import { analyzeInsightViaChatCompletions, classifyViaChatCompletions } from './chatCompletionsClassifier'

type Fetch = typeof fetch

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'

export class GroqProvider implements AIProvider {
  readonly id = 'groq'
  readonly displayName = 'Groq'

  constructor(
    private readonly credentials: AICredentialStore,
    private readonly getModel: () => string | null,
    private readonly fetchImpl: Fetch = fetch
  ) {}

  async classify(request: AIClassificationRequest): Promise<AIClassificationResult> {
    const token = this.credentials.readToken('groq')
    if (!token) throw new Error('No Groq credential saved.')
    const model = this.getModel()
    if (!model) throw new Error('No Groq model selected.')

    const label = await classifyViaChatCompletions({
      endpoint: ENDPOINT,
      token,
      model,
      email: request.email,
      labels: request.labels,
      fetchImpl: this.fetchImpl
    })

    return { label, confidence: 0.75, providerId: this.id, model }
  }

  async analyzeInsight(request: AIInsightRequest): Promise<AIInsightResult> {
    const token = this.credentials.readToken('groq')
    if (!token) throw new Error('No Groq credential saved.')
    const model = this.getModel()
    if (!model) throw new Error('No Groq model selected.')

    const parsed = await analyzeInsightViaChatCompletions({
      endpoint: ENDPOINT,
      token,
      model,
      email: request.email,
      fetchImpl: this.fetchImpl
    })

    return { ...parsed, providerId: this.id, model }
  }
}
