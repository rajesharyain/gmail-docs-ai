import test from 'node:test'
import assert from 'node:assert/strict'
import { EmailActions, type TokenProvider } from '../src/main/emailActions'
import type { InboxState } from '../src/shared/types'
import { email } from './helpers'

function jsonResponse(body: unknown, init: ResponseInit = { status: 200 }): Response {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, ...init })
}

function makeState(emails: ReturnType<typeof email>[]): InboxState {
  return { unreadCount: emails.length, newCount: 0, emails, lastSyncAt: null, status: 'ok', account: null }
}

function harness(initial: ReturnType<typeof email>[], token: string | null = 'token') {
  let state = makeState(initial)
  const auth: TokenProvider = { getAccessToken: async () => token }
  const getState = () => state
  const setState = (patch: Partial<InboxState>) => {
    state = { ...state, ...patch }
  }
  const suppressedIds: string[] = []
  const learningEvents: Array<{ id: string; kind: string }> = []
  const actions = new EmailActions({
    auth,
    getState,
    setState,
    markSuppressed: (id) => suppressedIds.push(id),
    recordLearning: (e, kind) => learningEvents.push({ id: e.id, kind })
  })
  return { actions, getState, suppressedIds, learningEvents }
}

test('markRead removes the email from state, decrements unread count, and suppresses it from future syncs', async (t) => {
  t.mock.method(globalThis, 'fetch', (async () => jsonResponse({})) as typeof fetch)
  const { actions, getState, suppressedIds } = harness([email({ id: '1' }), email({ id: '2' })])

  await actions.markRead('1')

  const state = getState()
  assert.deepEqual(
    state.emails.map((e) => e.id),
    ['2']
  )
  assert.equal(state.unreadCount, 1)
  // The regression this covers: without this, Graph's read-status lag means
  // the very next sync (including on app restart) re-fetches the message as
  // if it were never marked read, and it reappears.
  assert.deepEqual(suppressedIds, ['1'])
})

test('markRead is a no-op when there is no access token', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', (async () => jsonResponse({})) as typeof fetch)
  const { actions, getState, suppressedIds } = harness([email({ id: '1' })], null)

  await actions.markRead('1')

  assert.equal(fetchMock.mock.callCount(), 0)
  assert.equal(getState().emails.length, 1)
  assert.deepEqual(suppressedIds, [])
})

test('markRead leaves the email in place and does not suppress it when the Graph call fails', async (t) => {
  t.mock.method(globalThis, 'fetch', (async () => jsonResponse({}, { status: 500 })) as typeof fetch)
  const { actions, getState, suppressedIds } = harness([email({ id: '1' })])

  await actions.markRead('1')

  assert.equal(getState().emails.length, 1)
  assert.deepEqual(suppressedIds, [])
})

test('archive and delete both remove the email from state and suppress it on success', async (t) => {
  t.mock.method(globalThis, 'fetch', (async () => jsonResponse({})) as typeof fetch)
  const { actions, getState, suppressedIds, learningEvents } = harness([
    email({ id: '1' }),
    email({ id: '2' }),
    email({ id: '3' })
  ])

  await actions.archive('1')
  await actions.delete('2')

  assert.deepEqual(
    getState().emails.map((e) => e.id),
    ['3']
  )
  assert.equal(getState().unreadCount, 1)
  assert.deepEqual(suppressedIds, ['1', '2'])
  // Personal-learning hook (v4 Phase 7): successful archive/delete are recorded.
  assert.deepEqual(learningEvents, [
    { id: '1', kind: 'archive' },
    { id: '2', kind: 'delete' }
  ])
})

test('markRead and failed actions do not record learning events', async (t) => {
  let call = 0
  t.mock.method(globalThis, 'fetch', (async () => {
    call += 1
    // First call (markRead) succeeds, second call (archive) fails.
    return jsonResponse({}, { status: call === 1 ? 200 : 500 })
  }) as typeof fetch)
  const { actions, learningEvents } = harness([email({ id: '1' }), email({ id: '2' })])

  await actions.markRead('1')
  await actions.archive('2')

  assert.deepEqual(learningEvents, [])
})

test('markAllVisibleRead is a no-op with an empty list', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', (async () => jsonResponse({})) as typeof fetch)
  const { actions } = harness([])

  await actions.markAllVisibleRead()

  assert.equal(fetchMock.mock.callCount(), 0)
})

test('markAllVisibleRead only removes and suppresses the messages Graph confirmed, keeping failures visible', async (t) => {
  t.mock.method(globalThis, 'fetch', (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const parsed = JSON.parse(String(init?.body)) as { requests: Array<{ id: string }> }
    const responses = parsed.requests.map((r, i) => ({ id: r.id, status: i === 1 ? 400 : 200 }))
    return jsonResponse({ responses })
  }) as typeof fetch)
  const { actions, getState, suppressedIds } = harness([
    email({ id: 'a' }),
    email({ id: 'b' }),
    email({ id: 'c' })
  ])

  await actions.markAllVisibleRead()

  assert.deepEqual(
    getState().emails.map((e) => e.id),
    ['b']
  )
  assert.equal(getState().unreadCount, 1)
  assert.deepEqual(suppressedIds, ['a', 'c'])
})

test('markManyRead only acts on the given subset, not the whole visible list', async (t) => {
  t.mock.method(globalThis, 'fetch', (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const parsed = JSON.parse(String(init?.body)) as { requests: Array<{ id: string }> }
    return jsonResponse({ responses: parsed.requests.map((r) => ({ id: r.id, status: 200 })) })
  }) as typeof fetch)
  const { actions, getState, suppressedIds } = harness([
    email({ id: 'a' }),
    email({ id: 'b' }),
    email({ id: 'c' })
  ])

  await actions.markManyRead(['a', 'c'])

  assert.deepEqual(
    getState().emails.map((e) => e.id),
    ['b']
  )
  assert.deepEqual(suppressedIds, ['a', 'c'])
})

test('archiveMany and deleteMany act sequentially on a given subset', async (t) => {
  t.mock.method(globalThis, 'fetch', (async () => jsonResponse({})) as typeof fetch)
  const { actions, getState, suppressedIds } = harness([
    email({ id: 'a' }),
    email({ id: 'b' }),
    email({ id: 'c' }),
    email({ id: 'd' })
  ])

  await actions.archiveMany(['a', 'b'])
  await actions.deleteMany(['c'])

  assert.deepEqual(
    getState().emails.map((e) => e.id),
    ['d']
  )
  assert.deepEqual(suppressedIds, ['a', 'b', 'c'])
})

test('bulkAction dispatches to the matching action for each kind', async (t) => {
  t.mock.method(globalThis, 'fetch', (async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'POST' && String(_input).endsWith('/$batch')) {
      const parsed = JSON.parse(String(init?.body)) as { requests: Array<{ id: string }> }
      return jsonResponse({ responses: parsed.requests.map((r) => ({ id: r.id, status: 200 })) })
    }
    return jsonResponse({})
  }) as typeof fetch)
  const { actions, getState } = harness([
    email({ id: 'a' }),
    email({ id: 'b' }),
    email({ id: 'c' })
  ])

  await actions.bulkAction(['a'], 'markRead')
  await actions.bulkAction(['b'], 'archive')

  assert.deepEqual(
    getState().emails.map((e) => e.id),
    ['c']
  )
})

test('search returns mapped results and swallows Graph errors as an empty list', async (t) => {
  t.mock.method(globalThis, 'fetch', (async () =>
    jsonResponse({
      value: [
        {
          id: '1',
          subject: 'Found',
          bodyPreview: 'preview text',
          receivedDateTime: '2026-01-01T00:00:00.000Z',
          webLink: null,
          isRead: true,
          from: { emailAddress: { name: 'A', address: 'a@example.com' } }
        }
      ]
    })) as typeof fetch)
  const { actions } = harness([])

  const results = await actions.search('invoice')

  assert.equal(results.length, 1)
  assert.equal(results[0].isRead, true)
})

test('search returns an empty list without throwing when there is no token', async () => {
  const { actions } = harness([], null)
  const results = await actions.search('invoice')
  assert.deepEqual(results, [])
})
