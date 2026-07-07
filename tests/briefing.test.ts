import test from 'node:test'
import assert from 'node:assert/strict'
import { buildInboxBriefing } from '../src/shared/briefing'
import { email } from './helpers'

// Reuses fixtures already proven in mailIntelligence.test.ts to give known
// attentionLevel/nextAction combinations, rather than re-deriving them here.
const paymentEmail = email({
  id: 'pay-1',
  sender: 'Registered Agent',
  subject: 'Upcoming Payment for Registered Agent Service',
  isNew: true
})
const replyEmail = email({
  id: 'reply-1',
  sender: 'Client',
  subject: 'Can you respond by today?',
  preview: 'Please reply by end of day.',
  isNew: true
})
const scheduleEmail = email({
  id: 'schedule-1',
  senderAddress: 'invite@zoom.us',
  subject: 'Meeting rescheduled for tomorrow',
  isNew: true
})
const promoEmail = email({
  id: 'promo-1',
  senderAddress: 'deals@shop.com',
  subject: '50% off sale this weekend',
  isNew: true
})

test('returns null when nothing arrived since the popup was last opened', () => {
  const seen = email({ id: 'seen-1', subject: 'Upcoming Payment for Registered Agent Service', isNew: false })
  assert.equal(buildInboxBriefing([seen]), null)
})

test('returns null for an empty inbox', () => {
  assert.equal(buildInboxBriefing([]), null)
})

test('builds the motivating three-item briefing with a low-priority tail', () => {
  const briefing = buildInboxBriefing([paymentEmail, replyEmail, scheduleEmail, promoEmail])

  assert.ok(briefing)
  assert.equal(
    briefing?.headline,
    '3 emails need action: one payment issue, one client reply, and one meeting change.'
  )
  assert.equal(briefing?.detail, 'Everything else is low priority.')
})

test('has no low-priority detail when every new email is actionable', () => {
  const briefing = buildInboxBriefing([paymentEmail, replyEmail])

  assert.equal(briefing?.headline, '2 emails need action: one payment issue and one client reply.')
  assert.equal(briefing?.detail, null)
})

test('uses singular wording for exactly one actionable email', () => {
  const briefing = buildInboxBriefing([paymentEmail])

  assert.equal(briefing?.headline, '1 email needs action: one payment issue.')
  assert.equal(briefing?.detail, null)
})

test('falls back to a calm "nothing urgent" line when nothing new is actionable', () => {
  const briefing = buildInboxBriefing([promoEmail])

  assert.equal(briefing?.headline, '1 new email, nothing urgent right now.')
  assert.equal(briefing?.detail, null)
})

test('pluralizes the "nothing urgent" line for multiple new low-priority emails', () => {
  const secondPromo = email({ id: 'promo-2', senderAddress: 'deals@shop.com', subject: 'Flash sale ends soon', isNew: true })
  const briefing = buildInboxBriefing([promoEmail, secondPromo])

  assert.equal(briefing?.headline, '2 new emails, nothing urgent right now.')
})

test('ignores already-seen mail even when it would otherwise be actionable', () => {
  const seenPayment = { ...paymentEmail, id: 'pay-seen', isNew: false }
  const briefing = buildInboxBriefing([seenPayment, promoEmail])

  // Only the promo email is new, and it isn't actionable.
  assert.equal(briefing?.headline, '1 new email, nothing urgent right now.')
})

test('dedupes repeated next actions instead of repeating the same phrase', () => {
  const secondPayment = email({
    id: 'pay-2',
    sender: 'Landlord',
    subject: 'Upcoming Payment for Registered Agent Service',
    isNew: true
  })
  const briefing = buildInboxBriefing([paymentEmail, secondPayment])

  assert.equal(briefing?.headline, '2 emails need action: one payment issue.')
})

test('caps the listed phrases at 3 even with more distinct actionable emails', () => {
  const trackEmail = email({
    id: 'track-1',
    subject: 'Your order has shipped',
    preview: 'Tracking status update available now.',
    isNew: true
  })
  const briefing = buildInboxBriefing([paymentEmail, replyEmail, scheduleEmail, trackEmail])

  assert.equal(briefing?.headline, '4 emails need action: one payment issue, one client reply, and one meeting change.')
})
