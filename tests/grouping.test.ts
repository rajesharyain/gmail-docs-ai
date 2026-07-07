import test from 'node:test'
import assert from 'node:assert/strict'
import { groupEmails } from '../src/renderer/src/popup/grouping'
import { assertKinds, email } from './helpers'

test('groups two GitHub messages into one named group', () => {
  const items = groupEmails([
    email({
      id: '1',
      sender: 'GitHub',
      senderAddress: 'notifications@github.com',
      receivedAt: '2026-07-05T12:00:00.000Z',
      isNew: true
    }),
    email({
      id: '2',
      sender: 'GitHub',
      senderAddress: 'noreply@github.com',
      receivedAt: '2026-07-05T11:00:00.000Z'
    })
  ])

  assertKinds(items, ['group'])
  const [group] = items
  assert.equal(group.kind, 'group')
  assert.equal(group.label, 'GitHub')
  assert.equal(group.newCount, 1)
})

test('keeps a single named-rule match as a single item', () => {
  const items = groupEmails([
    email({ id: '1', senderAddress: 'notifications@gitlab.com' }),
    email({ id: '2', senderAddress: 'person@example.com', receivedAt: '2026-07-05T13:00:00.000Z' })
  ])

  assertKinds(items, ['single', 'single'])
})

test('groups two Slack messages into one named group', () => {
  const items = groupEmails([
    email({ id: '1', senderAddress: 'notifications@slack.com' }),
    email({ id: '2', senderAddress: 'no-reply@slack.com', receivedAt: '2026-07-05T13:00:00.000Z' })
  ])

  assertKinds(items, ['group'])
  const [group] = items
  assert.equal(group.kind, 'group')
  assert.equal(group.label, 'Slack')
})

test('groups Calendly and Zoom under one calendar-invites group', () => {
  const items = groupEmails([
    email({ id: '1', senderAddress: 'notifications@calendly.com' }),
    email({ id: '2', senderAddress: 'no-reply@zoom.us', receivedAt: '2026-07-05T13:00:00.000Z' })
  ])

  assertKinds(items, ['group'])
  const [group] = items
  assert.equal(group.kind, 'group')
  assert.equal(group.label, 'Calendar invites')
})

test('groups same sender fallback at three messages', () => {
  const items = groupEmails([
    email({ id: '1', sender: 'Rajesh', senderAddress: 'rajesh@example.com' }),
    email({ id: '2', sender: 'Rajesh', senderAddress: 'rajesh@example.com' }),
    email({ id: '3', sender: 'Rajesh', senderAddress: 'rajesh@example.com' })
  ])

  assertKinds(items, ['group'])
  const [group] = items
  assert.equal(group.kind, 'group')
  assert.equal(group.key, 'sender:rajesh@example.com')
})
