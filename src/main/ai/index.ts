export { MockAIProvider } from './mockProvider'
export { AIProviderRegistry } from './registry'
export { AIConnectionTester } from './connectionTester'
export { AICredentialStore } from './credentialStore'
export { electronCredentialCrypto } from './electronCredentialCrypto'
export { decideAIPrivacy, hashEmailId } from './privacy'
export type { AIPrivacyDecision, AIPrivacyPayload } from './privacy'
export type { CredentialCrypto } from './credentialStore'
export { GroqProvider } from './providers/groqProvider'
export { GitHubModelsProvider } from './providers/githubModelsProvider'
export { GeminiProvider } from './providers/geminiProvider'
export { CLASSIFICATION_LABELS } from './classificationPrompt'
export { ClassificationService } from './classificationService'
export type {
  AIClassificationRequest,
  AIClassificationResult,
  AIHealthCheckResult,
  AIInsightRequest,
  AIInsightResult,
  AIProvider,
  AIProviderRequestContext
} from './types'
