import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAttentionSections, buildSections, sectionPeek } from '../src/renderer/src/popup/sections'
import { email } from './helpers'

test('buckets emails into category sections in fixed priority order, skipping empty categories', () => {
  const { sections, otherItems } = buildSections(
    [
      email({ id: '1', subject: 'Invoice payment due', receivedAt: '2026-07-05T09:00:00.000Z' }),
      email({ id: '2', subject: 'Interview scheduled', receivedAt: '2026-07-05T10:00:00.000Z' }),
      email({ id: '3', subject: 'Just saying hi', receivedAt: '2026-07-05T11:00:00.000Z' })
    ],
    []
  )

  assert.deepEqual(
    sections.map((s) => s.category),
    ['finance', 'jobs']
  )
  assert.equal(otherItems.length, 1)
})

test('uncategorized mail never becomes its own section', () => {
  const { sections, otherItems } = buildSections(
    [email({ id: '1', subject: 'Quick question about the trip' })],
    []
  )

  assert.equal(sections.length, 0)
  assert.equal(otherItems.length, 1)
})

test('promotions and noise default collapsed; everything else defaults expanded', () => {
  const { sections } = buildSections(
    [
      email({ id: '1', subject: '50% off sale this weekend' }),
      email({ id: '2', senderAddress: 'no-reply@example.com', subject: 'Weekly newsletter' }),
      email({ id: '3', subject: 'Interview scheduled' })
    ],
    []
  )

  const promo = sections.find((s) => s.category === 'promotions')
  const noise = sections.find((s) => s.category === 'noise')
  const jobs = sections.find((s) => s.category === 'jobs')

  assert.equal(promo?.defaultCollapsed, true)
  assert.equal(noise?.defaultCollapsed, true)
  assert.equal(jobs?.defaultCollapsed, false)
})

test('a user "important" rule pulls a sender out of its own section', () => {
  const { sections } = buildSections(
    [email({ id: '1', senderAddress: 'vip@example.com', subject: 'Just checking in' })],
    [{ id: 'r1', action: 'important', matchType: 'sender', value: 'vip@example.com', createdAt: '2026-01-01T00:00:00.000Z' }]
  )

  assert.deepEqual(
    sections.map((s) => s.category),
    ['important']
  )
})

test('section emailCount and newCount count across grouped and single items', () => {
  const { sections } = buildSections(
    [
      email({ id: '1', subject: 'Sale ends today', isNew: true }),
      email({ id: '2', subject: 'Last day for the sale', isNew: false }),
      email({ id: '3', subject: 'Flash sale extended', isNew: true })
    ],
    []
  )

  const promo = sections.find((s) => s.category === 'promotions')
  assert.equal(promo?.emailCount, 3)
  assert.equal(promo?.newCount, 2)
})

test('sectionPeek takes up to two subjects across mixed groups and singles', () => {
  const { sections } = buildSections(
    [
      email({ id: '1', subject: 'Sale A', receivedAt: '2026-07-05T12:00:00.000Z' }),
      email({ id: '2', subject: 'Sale B', receivedAt: '2026-07-05T11:00:00.000Z' }),
      email({ id: '3', subject: 'Sale C', receivedAt: '2026-07-05T10:00:00.000Z' })
    ],
    []
  )

  const promo = sections.find((s) => s.category === 'promotions')
  const peek = sectionPeek(promo?.items ?? [])
  assert.equal(peek.length, 2)
})

test('buildAttentionSections pulls due mail before other attention mail without duplicates', () => {
  const due = email({ id: '1', subject: 'Invoice due tomorrow', preview: 'Please pay before Friday.' })
  const client = email({ id: '2', sender: 'Client', subject: 'Question about proposal', preview: 'Could you review this?' })
  const normal = email({ id: '3', subject: 'Quick hello' })

  const { attentionSections, remainingEmails } = buildAttentionSections([normal, client, due], [])

  assert.deepEqual(
    attentionSections.map((section) => section.kind),
    ['due-soon', 'needs-attention']
  )
  assert.deepEqual(
    attentionSections.flatMap((section) =>
      section.items.flatMap((item) => (item.kind === 'group' ? item.emails.map((e) => e.id) : [item.email.id]))
    ),
    ['1', '2']
  )
  assert.deepEqual(
    remainingEmails.map((email) => email.id),
    ['3']
  )
})

test('buildAttentionSections sorts attention mail by attention score', () => {
  const urgent = email({ id: '1', subject: 'Security alert password reset', preview: 'Review this login attempt.' })
  const important = email({ id: '2', subject: 'Question about proposal', preview: 'Could you review this?' })

  const { attentionSections } = buildAttentionSections([important, urgent], [])
  const needsAttention = attentionSections.find((section) => section.kind === 'needs-attention')

  assert.deepEqual(
    needsAttention?.items.flatMap((item) => (item.kind === 'group' ? item.emails.map((e) => e.id) : [item.email.id])),
    ['1', '2']
  )
})
