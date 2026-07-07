import test from 'node:test'
import assert from 'node:assert/strict'
import {
  GraphError,
  archiveMessage,
  deleteMessage,
  fetchInboxUnread,
  markMessageRead,
  markMessagesRead,
  searchMessages
} from '../src/main/graph'

function jsonResponse(body: unknown, init: ResponseInit = { status: 200 }): Response {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, ...init })
}

test('fetchInboxUnread maps Graph messages and sorts newest first', async (t) => {
  t.mock.method(globalThis, 'fetch', (async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('unreadItemCount')) return jsonResponse({ unreadItemCount: 5 })
    return jsonResponse({
      value: [
        {
          id: '1',
          subject: 'Older',
          bodyPreview: 'a',
          receivedDateTime: '2026-01-01T00:00:00.000Z',
          webLink: null,
          from: { emailAddress: { name: 'A', address: 'a@example.com' } }
        },
        {
          id: '2',
          subject: 'Newer',
          bodyPreview: 'b',
          receivedDateTime: '2026-01-02T00:00:00.000Z',
          webLink: null,
          from: { emailAddress: { name: 'B', address: 'b@example.com' } }
        }
      ]
    })
  }) as typeof fetch)

  const snapshot = await fetchInboxUnread('token')

  assert.equal(snapshot.unreadCount, 5)
  assert.deepEqual(
    snapshot.emails.map((e) => e.id),
    ['2', '1']
  )
  assert.equal(snapshot.emails[0].isRead, false)
})

test('markMessageRead PATCHes isRead=true to the message endpoint', async (t) => {
  let method = ''
  let url = ''
  let body: unknown = null
  let authorization = ''

  t.mock.method(globalThis, 'fetch', (async (input: RequestInfo | URL, init?: RequestInit) => {
    method = String(init?.method)
    url = String(input)
    body = JSON.parse(String(init?.body))
    authorization = String((init?.headers as Record<string, string>).Authorization)
    return jsonResponse({})
  }) as typeof fetch)

  await markMessageRead('token-1', 'msg-1')

  assert.equal(method, 'PATCH')
  assert.equal(url, 'https://graph.microsoft.com/v1.0/me/messages/msg-1')
  assert.deepEqual(body, { isRead: true })
  assert.equal(authorization, 'Bearer token-1')
})

test('archiveMessage POSTs a move to the archive folder', async (t) => {
  let url = ''
  let body: unknown = null

  t.mock.method(globalThis, 'fetch', (async (input: RequestInfo | URL, init?: RequestInit) => {
    url = String(input)
    body = JSON.parse(String(init?.body))
    return jsonResponse({})
  }) as typeof fetch)

  await archiveMessage('token', 'msg-2')

  assert.equal(url, 'https://graph.microsoft.com/v1.0/me/messages/msg-2/move')
  assert.deepEqual(body, { destinationId: 'archive' })
})

test('deleteMessage DELETEs the message with no body', async (t) => {
  let method = ''
  let url = ''
  let hadContentType = false

  t.mock.method(globalThis, 'fetch', (async (input: RequestInfo | URL, init?: RequestInit) => {
    method = String(init?.method)
    url = String(input)
    hadContentType = Boolean((init?.headers as Record<string, string> | undefined)?.['Content-Type'])
    return new Response(null, { status: 204 })
  }) as typeof fetch)

  await deleteMessage('token', 'msg-3')

  assert.equal(method, 'DELETE')
  assert.equal(url, 'https://graph.microsoft.com/v1.0/me/messages/msg-3')
  assert.equal(hadContentType, false)
})

test('markMessagesRead chunks at 20 requests per batch and reports per-item results', async (t) => {
  const ids = Array.from({ length: 25 }, (_, i) => `msg-${i}`)
  const batchSizes: number[] = []

  t.mock.method(globalThis, 'fetch', (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const parsed = JSON.parse(String(init?.body)) as { requests: Array<{ id: string }> }
    batchSizes.push(parsed.requests.length)
    // Fail the last item of each batch, succeed the rest.
    const responses = parsed.requests.map((r, i) => ({
      id: r.id,
      status: i === parsed.requests.length - 1 ? 400 : 200
    }))
    return jsonResponse({ responses })
  }) as typeof fetch)

  const result = await markMessagesRead('token', ids)

  assert.deepEqual(batchSizes, [20, 5])
  assert.equal(result.succeededIds.length, 23)
  assert.equal(result.failedIds.length, 2)
  assert.equal(result.failedIds[0], 'msg-19')
  assert.equal(result.failedIds[1], 'msg-24')
})

test('searchMessages passes through the real isRead value instead of hardcoding false', async (t) => {
  let url = ''
  t.mock.method(globalThis, 'fetch', (async (input: RequestInfo | URL) => {
    url = String(input)
    return jsonResponse({
      value: [
        {
          id: '1',
          subject: 'Found it',
          bodyPreview: 'preview',
          receivedDateTime: '2026-01-01T00:00:00.000Z',
          webLink: null,
          isRead: true,
          from: { emailAddress: { name: 'A', address: 'a@example.com' } }
        }
      ]
    })
  }) as typeof fetch)

  const results = await searchMessages('token', 'invoice')

  assert.match(url, /\$search=/)
  assert.equal(results[0].isRead, true)
})

test('throws GraphError with the server-provided message on a non-2xx response', async (t) => {
  t.mock.method(globalThis, 'fetch', (async () =>
    jsonResponse({ error: { message: 'Message not found' } }, { status: 404 })) as typeof fetch)

  await assert.rejects(
    () => markMessageRead('token', 'missing'),
    (err: unknown) => {
      assert.ok(err instanceof GraphError)
      assert.equal(err.status, 404)
      assert.equal(err.message, 'Message not found')
      return true
    }
  )
})

test('retries once after a 429 and then succeeds', async (t) => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', (async () => {
    calls += 1
    if (calls === 1) return jsonResponse({}, { status: 429, headers: { 'Retry-After': '0' } })
    return jsonResponse({})
  }) as typeof fetch)

  await markMessageRead('token', 'msg-1')

  assert.equal(calls, 2)
})
