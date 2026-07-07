import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EMPTY_LEARNING_DATA,
  buildRuleSuggestions,
  dismissSuggestion,
  normalizeLearningData,
  recordLearningEvent
} from '../src/shared/learning'
import type { LearningData, SenderRule } from '../src/shared/types'

function record(data: LearningData, senderAddress: string, kind: 'open' | 'archive' | 'delete', times = 1): LearningData {
  let next = data
  for (let i = 0; i < times; i++) {
    next = recordLearningEvent(next, { senderAddress, senderName: 'Newsletter Co', kind, at: `2026-07-0${(i % 6) + 1}T00:00:00.000Z` })
  }
  return next
}

test('records events per sender, lowercasing the address', () => {
  let data = recordLearningEvent(EMPTY_LEARNING_DATA, {
    senderAddress: 'News@Promo.com',
    senderName: 'Newsletter Co',
    kind: 'archive',
    at: '2026-07-06T00:00:00.000Z'
  })
  data = recordLearningEvent(data, {
    senderAddress: 'news@promo.com',
    senderName: 'Newsletter Co',
    kind: 'open',
    at: '2026-07-06T01:00:00.000Z'
  })

  assert.deepEqual(data.senders['news@promo.com'], {
    name: 'Newsletter Co',
    open: 1,
    archive: 1,
    delete: 0,
    lastEventAt: '2026-07-06T01:00:00.000Z'
  })
})

test('ignores events with a blank sender address', () => {
  const data = recordLearningEvent(EMPTY_LEARNING_DATA, {
    senderAddress: '   ',
    senderName: 'Nobody',
    kind: 'open'
  })
  assert.deepEqual(data, EMPTY_LEARNING_DATA)
})

test('normalizeLearningData degrades malformed content to empty instead of crashing', () => {
  assert.deepEqual(normalizeLearningData(null), EMPTY_LEARNING_DATA)
  assert.deepEqual(normalizeLearningData('garbage'), EMPTY_LEARNING_DATA)
  assert.deepEqual(normalizeLearningData([1, 2]), EMPTY_LEARNING_DATA)

  const cleaned = normalizeLearningData({
    senders: {
      'News@Promo.com': { name: 'Newsletter Co', open: 'not-a-number', archive: 2.7, delete: -1 },
      broken: 'not an object'
    },
    dismissed: ['mute:x', 42, '']
  })
  assert.deepEqual(cleaned.senders['news@promo.com'], {
    name: 'Newsletter Co',
    open: 0,
    archive: 3,
    delete: 0,
    lastEventAt: new Date(0).toISOString()
  })
  assert.equal(cleaned.senders['broken'], undefined)
  assert.deepEqual(cleaned.dismissed, ['mute:x'])
})

test('suggests muting after 3 one-sided archives/deletes, with an explainable reason', () => {
  let data = record(EMPTY_LEARNING_DATA, 'news@promo.com', 'archive', 2)
  data = record(data, 'news@promo.com', 'delete', 1)

  const [suggestion] = buildRuleSuggestions(data, [])

  assert.deepEqual(suggestion, {
    id: 'mute:news@promo.com',
    action: 'mute',
    matchType: 'sender',
    value: 'news@promo.com',
    senderName: 'Newsletter Co',
    reason: "You've archived or deleted 3 emails from this sender.",
    evidenceCount: 3
  })
})

test('suggests marking important after 3 one-sided opens', () => {
  const data = record(EMPTY_LEARNING_DATA, 'boss@example.com', 'open', 3)

  const [suggestion] = buildRuleSuggestions(data, [])

  assert.equal(suggestion.id, 'important:boss@example.com')
  assert.equal(suggestion.action, 'important')
  assert.equal(suggestion.reason, "You've opened 3 emails from this sender.")
})

test('mixed behavior generates no suggestion in either direction', () => {
  let data = record(EMPTY_LEARNING_DATA, 'mixed@example.com', 'archive', 3)
  data = record(data, 'mixed@example.com', 'open', 3)

  assert.deepEqual(buildRuleSuggestions(data, []), [])
})

test('below the threshold generates no suggestion', () => {
  const data = record(EMPTY_LEARNING_DATA, 'news@promo.com', 'archive', 2)
  assert.deepEqual(buildRuleSuggestions(data, []), [])
})

test('an existing sender or domain rule suppresses suggestions for that sender', () => {
  const data = record(EMPTY_LEARNING_DATA, 'news@promo.com', 'archive', 5)

  const senderRule: SenderRule[] = [
    { id: '1', action: 'important', matchType: 'sender', value: 'news@promo.com', createdAt: '2026-01-01T00:00:00.000Z' }
  ]
  const domainRule: SenderRule[] = [
    { id: '2', action: 'mute', matchType: 'domain', value: 'promo.com', createdAt: '2026-01-01T00:00:00.000Z' }
  ]

  assert.deepEqual(buildRuleSuggestions(data, senderRule), [])
  assert.deepEqual(buildRuleSuggestions(data, domainRule), [])
})

test('a dismissed suggestion never comes back, even as evidence grows', () => {
  let data = record(EMPTY_LEARNING_DATA, 'news@promo.com', 'archive', 3)
  data = dismissSuggestion(data, 'mute:news@promo.com')
  data = record(data, 'news@promo.com', 'archive', 4)

  assert.deepEqual(buildRuleSuggestions(data, []), [])
  // Dismissing twice is a no-op, not a duplicate record.
  assert.deepEqual(dismissSuggestion(data, 'mute:news@promo.com').dismissed, ['mute:news@promo.com'])
})

test('suggestions are sorted by evidence, strongest first', () => {
  let data = record(EMPTY_LEARNING_DATA, 'weak@promo.com', 'archive', 3)
  data = record(data, 'strong@promo.com', 'archive', 6)

  const suggestions = buildRuleSuggestions(data, [])

  assert.deepEqual(
    suggestions.map((s) => s.value),
    ['strong@promo.com', 'weak@promo.com']
  )
})

test('tracked senders are capped, pruning the least recently active', () => {
  let data = EMPTY_LEARNING_DATA
  for (let i = 0; i < 201; i++) {
    data = recordLearningEvent(data, {
      senderAddress: `sender-${i}@example.com`,
      senderName: `Sender ${i}`,
      kind: 'open',
      at: `2026-07-06T00:00:${String(i % 60).padStart(2, '0')}.${String(i).padStart(3, '0')}Z`
    })
  }

  assert.equal(Object.keys(data.senders).length, 200)
  // sender-0 has the oldest lastEventAt, so it's the one pruned.
  assert.equal(data.senders['sender-0@example.com'], undefined)
  assert.ok(data.senders['sender-200@example.com'])
})
