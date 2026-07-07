import type { AIProvider } from './types'

export class AIProviderRegistry {
  private readonly providers = new Map<string, AIProvider>()

  register(provider: AIProvider): void {
    this.providers.set(provider.id, provider)
  }

  get(providerId: string): AIProvider | null {
    return this.providers.get(providerId) ?? null
  }

  list(): AIProvider[] {
    return Array.from(this.providers.values())
  }
}
