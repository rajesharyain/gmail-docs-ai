import { buildClassificationPrompt, classificationSystemPrompt, parseClassificationLabel } from '../classificationPrompt'
import { buildInsightPrompt, insightSystemPrompt, parseInsightResponse, type ParsedInsight } from '../insightPrompt'
import type { AIPrivacyPayload } from '../privacy'

type Fetch = typeof fetch

interface ChatCompletionsRequestOptions {
  endpoint: string
  token: string
  model: string
  systemPrompt: string
  userPrompt: string
  fetchImpl: Fetch
  extraHeaders?: Record<string, string>
  maxTokens: number
}

/** Shared request/response plumbing for OpenAI-compatible chat-completions
 *  APIs (Groq, GitHub Models). Gemini's shape differs and has its own client.
 *  Returns the raw message content — callers own their own parsing. */
async function requestChatCompletion(options: ChatCompletionsRequestOptions): Promise<string> {
  const { endpoint, token, model, systemPrompt, userPrompt, fetchImpl, extraHeaders, maxTokens } = options

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...extraHeaders
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
  })

  if (!response.ok) {
    throw new Error(`AI request failed: ${response.status}`)
  }

  const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
  return body.choices?.[0]?.message?.content ?? ''
}

export interface ChatCompletionsClassifyOptions {
  endpoint: string
  token: string
  model: string
  email: AIPrivacyPayload
  labels: string[]
  fetchImpl: Fetch
  extraHeaders?: Record<string, string>
}

export async function classifyViaChatCompletions(options: ChatCompletionsClassifyOptions): Promise<string> {
  const { endpoint, token, model, email, labels, fetchImpl, extraHeaders } = options

  const raw = await requestChatCompletion({
    endpoint,
    token,
    model,
    systemPrompt: classificationSystemPrompt(labels),
    userPrompt: buildClassificationPrompt(email),
    fetchImpl,
    extraHeaders,
    maxTokens: 8
  })

  const label = parseClassificationLabel(raw, labels)
  if (!label) throw new Error(`Unrecognized category in response: "${raw}"`)
  return label
}

export interface ChatCompletionsInsightOptions {
  endpoint: string
  token: string
  model: string
  email: AIPrivacyPayload
  fetchImpl: Fetch
  extraHeaders?: Record<string, string>
}

export async function analyzeInsightViaChatCompletions(
  options: ChatCompletionsInsightOptions
): Promise<ParsedInsight> {
  const { endpoint, token, model, email, fetchImpl, extraHeaders } = options

  const raw = await requestChatCompletion({
    endpoint,
    token,
    model,
    systemPrompt: insightSystemPrompt(),
    userPrompt: buildInsightPrompt(email),
    fetchImpl,
    extraHeaders,
    maxTokens: 200
  })

  const parsed = parseInsightResponse(raw)
  if (!parsed) throw new Error(`Unrecognized insight in response: "${raw}"`)
  return parsed
}
