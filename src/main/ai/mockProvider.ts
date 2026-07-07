import type { AIClassificationRequest, AIClassificationResult, AIHealthCheckResult, AIProvider } from './types'

const PROVIDER_ID = 'mock'
const MODEL_ID = 'local/mock-foundation'

/** Reference implementation of the AIProvider contract — no network calls,
 *  used to exercise AIProviderRegistry without needing a real credential. */
export class MockAIProvider implements AIProvider {
  readonly id = PROVIDER_ID
  readonly displayName = 'Mock AI Provider'

  async healthCheck(): Promise<AIHealthCheckResult> {
    return {
      ok: true,
      providerId: this.id,
      message: 'Mock provider is ready.',
      models: [MODEL_ID]
    }
  }

  async listModels(): Promise<string[]> {
    return [MODEL_ID]
  }

  async classify(request: AIClassificationRequest): Promise<AIClassificationResult> {
    return {
      label: request.labels[0] ?? 'uncategorized',
      confidence: 0,
      providerId: this.id,
      model: MODEL_ID
    }
  }
}
