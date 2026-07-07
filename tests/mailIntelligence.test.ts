import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyEmail, isSenderMuted } from '../src/shared/mailIntelligence'
import type { SenderRule } from '../src/shared/types'
import { email } from './helpers'

test('classifies payment messages as high priority finance', () => {
  const insight = classifyEmail(
    email({
      id: '1',
      sender: 'Registered Agent',
      subject: 'Upcoming Payment for Registered Agent Service'
    })
  )

  assert.deepEqual(
    {
      category: insight.category,
      label: insight.label,
      priority: insight.priority,
      isLikelyNoise: insight.isLikelyNoise,
      confidence: insight.confidence,
      reasons: insight.reasons
    },
    {
      category: 'finance',
      label: 'Finance',
      priority: 'high',
      isLikelyNoise: false,
      confidence: 0.7,
      reasons: ['Finance', 'High-priority category', 'Payment likely']
    }
  )
  assert.equal(insight.attentionLevel, 'important')
  assert.equal(insight.attentionScore, 82)
  assert.equal(insight.nextAction, 'pay')
  assert.equal(insight.source, 'local')
})

test('classifies property search mail as home', () => {
  assert.equal(
    classifyEmail(
      email({
        id: '2',
        subject: 'New 2 bedroom flat in your search'
      })
    ).category,
    'home'
  )
})

test('keeps important job messages above newsletter noise', () => {
  const insight = classifyEmail(
    email({
      id: '3',
      senderAddress: 'newsletter@example.com',
      subject: 'Software Engineer interview',
      preview: 'unsubscribe here'
    })
  )

  assert.equal(insight.category, 'jobs')
  assert.equal(insight.priority, 'high')
  assert.equal(insight.isLikelyNoise, true)
})

test('classifies newsletters as low priority noise', () => {
  const insight = classifyEmail(
    email({
      id: '4',
      senderAddress: 'no-reply@example.com',
      subject: 'Weekly newsletter'
    })
  )

  assert.equal(insight.category, 'noise')
  assert.equal(insight.priority, 'low')
  assert.equal(insight.attentionLevel, 'silent')
  assert.equal(insight.attentionScore, 0)
  assert.equal(insight.nextAction, 'ignore')
  assert.ok(insight.reasons.includes('Can ignore'))
})

test('does not demote a Calendly invite to noise just because it is no-reply', () => {
  const insight = classifyEmail(
    email({
      id: '5',
      senderAddress: 'notifications@calendly.com',
      subject: 'Meeting invite: Design review',
      preview: 'no-reply@calendly.com'
    })
  )

  assert.equal(insight.category, 'calendar')
  assert.equal(insight.priority, 'normal')
})

test('does not classify a generic marketing "offer" as a job message', () => {
  const insight = classifyEmail(
    email({
      id: '6',
      subject: 'Exclusive offer: 20% off this weekend',
      preview: 'Shop the sale before it ends.'
    })
  )

  assert.equal(insight.category, 'promotions')
})

test('classifies a bank domain as finance even without a keyword hit', () => {
  const insight = classifyEmail(
    email({
      id: '7',
      senderAddress: 'noreply@chase.com',
      subject: 'Your monthly summary is ready'
    })
  )

  assert.equal(insight.category, 'finance')
  assert.equal(insight.priority, 'high')
})

test('a domain match yields higher confidence than a single keyword hit', () => {
  const domainMatch = classifyEmail(
    email({ id: '8', senderAddress: 'notifications@github.com', subject: 'Repository invitation' })
  )
  const keywordOnly = classifyEmail(email({ id: '9', subject: 'Please review this pull request' }))

  assert.equal(domainMatch.category, 'work')
  assert.equal(keywordOnly.category, 'work')
  assert.ok(domainMatch.confidence > keywordOnly.confidence)
})

test('uncategorized mail with no noise signal stays Inbox at normal priority', () => {
  const insight = classifyEmail(email({ id: '10', subject: 'Quick question about the trip' }))

  assert.equal(insight.category, 'other')
  assert.equal(insight.label, 'Inbox')
  assert.equal(insight.priority, 'normal')
  assert.equal(insight.isLikelyNoise, false)
})

test('a user "important" sender rule overrides the heuristic category entirely', () => {
  const rules: SenderRule[] = [
    { id: '1', action: 'important', matchType: 'sender', value: 'deals@shop.com', createdAt: '2026-01-01T00:00:00.000Z' }
  ]
  const insight = classifyEmail(
    email({ id: '11', senderAddress: 'deals@shop.com', subject: '50% off sale', preview: 'unsubscribe' }),
    rules
  )

  assert.equal(insight.category, 'important')
  assert.equal(insight.priority, 'high')
  assert.equal(insight.confidence, 1)
  assert.equal(insight.source, 'user-rule')
  assert.equal(insight.attentionLevel, 'important')
  assert.equal(insight.attentionScore, 80)
})

test('a user "important" domain rule matches any sender at that domain', () => {
  const rules: SenderRule[] = [
    { id: '1', action: 'important', matchType: 'domain', value: 'mycompany.com', createdAt: '2026-01-01T00:00:00.000Z' }
  ]
  const insight = classifyEmail(email({ id: '12', senderAddress: 'random.person@mycompany.com' }), rules)

  assert.equal(insight.category, 'important')
})

test('isSenderMuted matches sender and domain mute rules, ignores non-mute rules', () => {
  const rules: SenderRule[] = [
    { id: '1', action: 'mute', matchType: 'sender', value: 'spammer@example.com', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: '2', action: 'mute', matchType: 'domain', value: 'spamdomain.com', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: '3', action: 'important', matchType: 'sender', value: 'boss@example.com', createdAt: '2026-01-01T00:00:00.000Z' }
  ]

  assert.equal(isSenderMuted(email({ id: '13', senderAddress: 'spammer@example.com' }), rules), true)
  assert.equal(isSenderMuted(email({ id: '14', senderAddress: 'anyone@spamdomain.com' }), rules), true)
  assert.equal(isSenderMuted(email({ id: '15', senderAddress: 'boss@example.com' }), rules), false)
  assert.equal(isSenderMuted(email({ id: '16', senderAddress: 'nobody@elsewhere.com' }), rules), false)
})

test('a resolved cloud category overrides the local heuristic', () => {
  const insight = classifyEmail(email({ id: '17', subject: 'Quick question about the trip', cloudCategory: 'jobs' }))

  assert.equal(insight.category, 'jobs')
  assert.equal(insight.label, 'Jobs')
  assert.equal(insight.priority, 'high')
  assert.equal(insight.confidence, 0.85)
  assert.ok(insight.reasons.includes('Cloud classification'))
  assert.ok(insight.reasons.includes('High-priority category'))
  assert.equal(insight.source, 'cloud')
})

test('a cloud category of "noise" flags isLikelyNoise', () => {
  const insight = classifyEmail(email({ id: '18', cloudCategory: 'noise' }))
  assert.equal(insight.isLikelyNoise, true)
})

test('a user "important" sender rule still wins over a resolved cloud category', () => {
  const rules: SenderRule[] = [
    { id: '1', action: 'important', matchType: 'sender', value: 'boss@example.com', createdAt: '2026-01-01T00:00:00.000Z' }
  ]
  const insight = classifyEmail(
    email({ id: '19', senderAddress: 'boss@example.com', cloudCategory: 'noise' }),
    rules
  )

  assert.equal(insight.category, 'important')
})

test('a resolved cloud insight (v4 Phase 5) overrides attention/action/deadline/risk but not category', () => {
  const insight = classifyEmail(
    email({
      id: '19a',
      subject: 'Quick question about the trip',
      cloudInsight: {
        attentionLevel: 'urgent',
        nextAction: 'pay',
        deadline: { hasDeadline: true, urgency: 'today', label: 'Due today' },
        risk: { level: 'high', reasons: ['Payment request'] },
        reasons: ['Payment request', 'Due today']
      }
    })
  )

  // Category is untouched — cloudInsight only speaks to the other four axes.
  assert.equal(insight.category, 'other')
  assert.equal(insight.attentionLevel, 'urgent')
  assert.equal(insight.nextAction, 'pay')
  assert.deepEqual(insight.deadline, { hasDeadline: true, urgency: 'today', label: 'Due today' })
  assert.deepEqual(insight.risk, { level: 'high', reasons: ['Payment request'] })
  assert.ok(insight.reasons.includes('Payment request'))
  assert.ok(insight.reasons.includes('Due today'))
  assert.equal(insight.source, 'cloud')
})

test('a cloud insight combines with a resolved cloud category', () => {
  const insight = classifyEmail(
    email({
      id: '19b',
      cloudCategory: 'finance',
      cloudInsight: {
        attentionLevel: 'low',
        nextAction: 'archive',
        deadline: { hasDeadline: false, urgency: null, label: null },
        risk: { level: 'none', reasons: [] },
        reasons: []
      }
    })
  )

  assert.equal(insight.category, 'finance')
  assert.equal(insight.attentionLevel, 'low')
  assert.equal(insight.nextAction, 'archive')
})

test('detects urgent deadline and likely reply action', () => {
  const insight = classifyEmail(
    email({
      id: '20',
      sender: 'Client',
      subject: 'Can you respond by today?',
      preview: 'Please reply by end of day.'
    })
  )

  assert.equal(insight.attentionLevel, 'urgent')
  assert.equal(insight.attentionScore, 95)
  assert.equal(insight.nextAction, 'reply')
  assert.ok(insight.reasons.includes('Reply likely'))
  assert.ok(insight.reasons.includes('Due today'))
  assert.deepEqual(insight.deadline, {
    hasDeadline: true,
    urgency: 'today',
    label: 'Due today'
  })
})

test('detects security risk as a review action', () => {
  const insight = classifyEmail(
    email({
      id: '21',
      sender: 'Account Security',
      subject: 'Security alert: password reset requested',
      preview: 'Review this login attempt immediately.'
    })
  )

  assert.equal(insight.attentionLevel, 'urgent')
  assert.equal(insight.attentionScore, 100)
  assert.equal(insight.nextAction, 'review')
  assert.equal(insight.risk.level, 'high')
  assert.ok(insight.risk.reasons.includes('Sensitive/payment request'))
  assert.ok(insight.reasons.includes('Review likely'))
})

test('detects calendar mail as schedule action without forcing urgency', () => {
  const insight = classifyEmail(
    email({
      id: '22',
      senderAddress: 'invite@zoom.us',
      subject: 'Meeting rescheduled for next week'
    })
  )

  assert.equal(insight.category, 'calendar')
  assert.equal(insight.nextAction, 'schedule')
  assert.equal(insight.attentionLevel, 'normal')
  assert.equal(insight.attentionScore, 49)
  assert.deepEqual(insight.deadline, {
    hasDeadline: true,
    urgency: 'later',
    label: 'Upcoming'
  })
})

test('detects due invoice as urgent payment work', () => {
  const insight = classifyEmail(
    email({
      id: '23',
      sender: 'Vendor Billing',
      senderAddress: 'billing@vendor.com',
      subject: 'Invoice due tomorrow',
      preview: 'Please pay this invoice before Friday to avoid interruption.'
    })
  )

  assert.equal(insight.category, 'finance')
  assert.equal(insight.attentionLevel, 'urgent')
  assert.equal(insight.nextAction, 'pay')
  assert.equal(insight.deadline.urgency, 'soon')
  assert.ok(insight.attentionScore >= 90)
  assert.ok(insight.reasons.includes('Payment likely'))
  assert.ok(insight.reasons.includes('Due soon'))
})

test('detects direct client request as important reply work', () => {
  const insight = classifyEmail(
    email({
      id: '24',
      sender: 'Client',
      senderAddress: 'client@example.com',
      subject: 'Question about the proposal',
      preview: 'Could you review and respond when you can?'
    })
  )

  assert.equal(insight.category, 'other')
  assert.equal(insight.attentionLevel, 'important')
  assert.equal(insight.nextAction, 'review')
  assert.ok(insight.attentionScore >= 58)
  assert.ok(insight.reasons.includes('Review likely'))
})

test('keeps promotional sale as low attention archive work', () => {
  const insight = classifyEmail(
    email({
      id: '25',
      sender: 'Shop',
      senderAddress: 'deals@shop.com',
      subject: 'Weekend sale: 50% off',
      preview: 'Use this coupon before the offer expires.'
    })
  )

  assert.equal(insight.category, 'promotions')
  assert.equal(insight.attentionLevel, 'low')
  assert.equal(insight.nextAction, 'archive')
  assert.ok(insight.reasons.includes('Promotional mail'))
  assert.ok(insight.reasons.includes('Archive likely'))
})
