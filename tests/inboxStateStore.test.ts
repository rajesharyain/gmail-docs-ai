import test from 'node:test'
import assert from 'node:assert/strict'
import { InboxStateStore } from '../src/main/inboxStateStore'

test('updates and resets inbox state', () => {
  const store = new InboxStateStore()
  const seen: number[] = []
  const unsubscribe = store.subscribe((state) => seen.push(state.unreadCount))

  store.update({ unreadCount: 4, status: 'ok' })
  assert.equal(store.getSnapshot().unreadCount, 4)
  assert.equal(store.getSnapshot().status, 'ok')

  store.reset()
  assert.equal(store.getSnapshot().unreadCount, 0)
  assert.equal(store.getSnapshot().status, 'signed-out')
  assert.deepEqual(seen, [4, 0])

  unsubscribe()
  store.update({ unreadCount: 2 })
  assert.deepEqual(seen, [4, 0])
})
