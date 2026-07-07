import type { AICredentialStore } from '../credentialStore'
import { buildClassificationPrompt, classificationSystemPrompt, parseClassificationLabel } from '../classificationPrompt'
import { buildInsightPrompt, insightSystemPrompt, parseInsightResponse } from '../insightPrompt'
import type { AIClassificationRequest, AIClassificationResult, AIInsightRequest, AIInsightResult, AIProvider } from '../types'

type Fetch = typeof fetch

async function requestGeminiText(options: {
  model: string
  token: string
  prompt: string
  maxOutputTokens: number
  fetchImpl: Fetch
}): Promise<{ text: string; ok: boolean; status: number }> {
  const { model, token, prompt, maxOutputTokens, fetchImpl } = options
  const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': token
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, maxOutputTokens }
    })
  })

  if (!response.ok) return { text: '', ok: false, status: response.status }

  const body = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  return { text: body.candidates?.[0]?.content?.parts?.[0]?.text ?? '', ok: true, status: response.status }
}

export class GeminiProvider implements AIProvider {
  readonly id = 'gemini'
  readonly displayName = 'Gemini'

  constructor(
    private readonly credentials: AICredentialStore,
    private readonly getModel: () => string | null,
    private readonly fetchImpl: Fetch = fetch
  ) {}

  async classify(request: AIClassificationRequest): Promise<AIClassificationResult> {
    const token = this.credentials.readToken('gemini')
    if (!token) throw new Error('No Gemini credential saved.')
    const model = this.getModel()
    if (!model) throw new Error('No Gemini model selected.')

    const prompt = `${classificationSystemPrompt(request.labels)}\n\n${buildClassificationPrompt(request.email)}`
    const { text: raw, ok, status } = await requestGeminiText({
      model,
      token,
      prompt,
      maxOutputTokens: 8,
      fetchImpl: this.fetchImpl
    })
    if (!ok) throw new Error(`Gemini classification request failed: ${status}`)

    const label = parseClassificationLabel(raw, request.labels)
    if (!label) throw new Error(`Unrecognized category in response: "${raw}"`)

    return { label, confidence: 0.75, providerId: this.id, model }
  }

  async analyzeInsight(request: AIInsightRequest): Promise<AIInsightResult> {
    const token = this.credentials.readToken('gemini')
    if (!token) throw new Error('No Gemini credential saved.')
    const model = this.getModel()
    if (!model) throw new Error('No Gemini model selected.')

    const prompt = `${insightSystemPrompt()}\n\n${buildInsightPrompt(request.email)}`
    const { text: raw, ok, status } = await requestGeminiText({
      model,
      token,
      prompt,
      maxOutputTokens: 200,
      fetchImpl: this.fetchImpl
    })
    if (!ok) throw new Error(`Gemini insight request failed: ${status}`)

    const parsed = parseInsightResponse(raw)
    if (!parsed) throw new Error(`Unrecognized insight in response: "${raw}"`)

    return { ...parsed, providerId: this.id, model }
  }
}
