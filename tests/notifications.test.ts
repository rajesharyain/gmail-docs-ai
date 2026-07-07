import test from 'node:test'
import assert from 'node:assert/strict'
import { formatNewMailNotification, selectNotifiableMail } from '../src/main/notifications'
import { DEFAULT_SETTINGS } from '../src/shared/settings'
import { email } from './helpers'

test('selectNotifiableMail suppresses low-attention promotional and noise mail', () => {
  const important = email({ id: '1', sender: 'Client', subject: 'Question about proposal', preview: 'Could you review this?' })
  const promo = email({ id: '2', sender: 'Shop', subject: 'Weekend sale: 50% off', preview: 'Use this coupon.' })
  const noise = email({ id: '3', senderAddress: 'no-reply@example.com', subject: 'Weekly newsletter' })

  const selected = selectNotifiableMail([important, promo, noise], DEFAULT_SETTINGS)

  assert.deepEqual(
    selected.map((item) => item.id),
    ['1']
  )
})

test('selectNotifiableMail notifies for everything when the user opts into low-attention notifications', () => {
  const important = email({ id: '1', sender: 'Client', subject: 'Question about proposal', preview: 'Could you review this?' })
  const promo = email({ id: '2', sender: 'Shop', subject: 'Weekend sale: 50% off', preview: 'Use this coupon.' })
  const noise = email({ id: '3', senderAddress: 'no-reply@example.com', subject: 'Weekly newsletter' })
  const settings = { ...DEFAULT_SETTINGS, rules: { ...DEFAULT_SETTINGS.rules, notifyLowAttention: true } }

  const selected = selectNotifiableMail([important, promo, noise], settings)

  assert.deepEqual(
    selected.map((item) => item.id),
    ['1', '2', '3']
  )
})

test('formatNewMailNotification marks a single urgent email as needing attention', () => {
  const urgent = email({
    id: '1',
    sender: 'Account Security',
    subject: 'Security alert password reset',
    preview: 'Review this login attempt.'
  })

  const notification = formatNewMailNotification([urgent], DEFAULT_SETTINGS)

  assert.equal(notification.title, 'Needs attention: Account Security')
  assert.equal(notification.body, 'Security alert password reset\nReview this login attempt.')
})

test('formatNewMailNotification summarizes urgent and important mail together', () => {
  const urgent = email({
    id: '1',
    sender: 'Account Security',
    subject: 'Security alert password reset',
    preview: 'Review this login attempt.'
  })
  const important = email({ id: '2', sender: 'Client', subject: 'Question about proposal', preview: 'Could you review this?' })

  const notification = formatNewMailNotification([important, urgent], DEFAULT_SETTINGS)

  assert.equal(notification.title, '1 urgent, 2 new')
  assert.equal(notification.body, 'Client, Account Security')
})
