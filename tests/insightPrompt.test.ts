import test from 'node:test'
import assert from 'node:assert/strict'
import { buildInsightPrompt, insightSystemPrompt, parseInsightResponse } from '../src/main/ai/insightPrompt'

test('parseInsightResponse parses a valid structured response', () => {
  const raw = JSON.stringify({
    attentionLevel: 'urgent',
    nextAction: 'pay',
    deadline: 'today',
    risk: 'high',
    reasons: ['Payment request', 'Time-sensitive wording', 'Extra reason', 'Dropped reason']
  })

  const parsed = parseInsightResponse(raw)

  assert.ok(parsed)
  assert.equal(parsed?.attentionLevel, 'urgent')
  assert.equal(parsed?.nextAction, 'pay')
  assert.deepEqual(parsed?.deadline, { hasDeadline: true, urgency: 'today', label: 'Due today' })
  assert.deepEqual(parsed?.risk, { level: 'high', reasons: ['Payment request', 'Time-sensitive wording', 'Extra reason'] })
  // Capped at 3, even though the model returned 4.
  assert.equal(parsed?.reasons.length, 3)
})

test('parseInsightResponse maps "none" deadline/risk to the empty signal shape', () => {
  const raw = JSON.stringify({
    attentionLevel: 'low',
    nextAction: 'archive',
    deadline: 'none',
    risk: 'none',
    reasons: ['Promotional mail']
  })

  const parsed = parseInsightResponse(raw)

  assert.ok(parsed)
  assert.deepEqual(parsed?.deadline, { hasDeadline: false, urgency: null, label: null })
  assert.deepEqual(parsed?.risk, { level: 'none', reasons: [] })
})

test('parseInsightResponse strips a markdown code fence some models add despite instructions', () => {
  const raw = '```json\n' + JSON.stringify({
    attentionLevel: 'normal',
    nextAction: 'open',
    deadline: 'none',
    risk: 'none',
    reasons: []
  }) + '\n```'

  const parsed = parseInsightResponse(raw)

  assert.ok(parsed)
  assert.equal(parsed?.attentionLevel, 'normal')
})

test('parseInsightResponse rejects invalid JSON', () => {
  assert.equal(parseInsightResponse('not json'), null)
})

test('parseInsightResponse rejects an unrecognized attentionLevel', () => {
  const raw = JSON.stringify({
    attentionLevel: 'panic',
    nextAction: 'open',
    deadline: 'none',
    risk: 'none',
    reasons: []
  })
  assert.equal(parseInsightResponse(raw), null)
})

test('parseInsightResponse rejects an unrecognized nextAction', () => {
  const raw = JSON.stringify({
    attentionLevel: 'normal',
    nextAction: 'delete-everything',
    deadline: 'none',
    risk: 'none',
    reasons: []
  })
  assert.equal(parseInsightResponse(raw), null)
})

test('parseInsightResponse rejects an unrecognized deadline or risk value', () => {
  const badDeadline = JSON.stringify({
    attentionLevel: 'normal',
    nextAction: 'open',
    deadline: 'eventually',
    risk: 'none',
    reasons: []
  })
  const badRisk = JSON.stringify({
    attentionLevel: 'normal',
    nextAction: 'open',
    deadline: 'none',
    risk: 'extreme',
    reasons: []
  })
  assert.equal(parseInsightResponse(badDeadline), null)
  assert.equal(parseInsightResponse(badRisk), null)
})

test('parseInsightResponse tolerates a missing/malformed reasons array', () => {
  const raw = JSON.stringify({
    attentionLevel: 'normal',
    nextAction: 'open',
    deadline: 'none',
    risk: 'none'
  })
  const parsed = parseInsightResponse(raw)
  assert.ok(parsed)
  assert.deepEqual(parsed?.reasons, [])
})

test('buildInsightPrompt includes sender, subject, and preview when present', () => {
  const prompt = buildInsightPrompt({
    sender: 'Jane',
    senderAddress: 'jane@example.com',
    subject: 'Invoice due',
    preview: 'Please pay by Friday'
  })
  assert.match(prompt, /Sender: Jane <jane@example.com>/)
  assert.match(prompt, /Subject: Invoice due/)
  assert.match(prompt, /Preview: Please pay by Friday/)
})

test('insightSystemPrompt names the four structured fields', () => {
  const prompt = insightSystemPrompt()
  assert.match(prompt, /attentionLevel/)
  assert.match(prompt, /nextAction/)
  assert.match(prompt, /deadline/)
  assert.match(prompt, /risk/)
})
