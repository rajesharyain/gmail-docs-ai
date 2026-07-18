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

function gmailMessage(id: string, subject: string, internalDate: string, labels = ['INBOX', 'UNREAD']) {
  return {
    id,
    snippet: `${subject} preview`,
    internalDate,
    labelIds: labels,
    payload: {
      headers: [
        { name: 'From', value: `"Sender ${id}" <sender-${id}@example.com>` },
        { name: 'Subject', value: subject },
        { name: 'Date', value: new Date(Number(internalDate)).toUTCString() }
      ]
    }
  }
}

test('fetchInboxUnread maps Gmail messages and sorts newest first', async (t) => {
  t.mock.method(globalThis, 'fetch', (async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/users/me/labels/UNREAD')) return jsonResponse({ messagesUnread: 5 })
    if (url.includes('/users/me/messages?')) {
      assert.match(url, /labelIds=INBOX/)
      assert.match(url, /labelIds=UNREAD/)
      return jsonResponse({ messages: [{ id: '1' }, { id: '2' }], resultSizeEstimate: 2 })
    }
    if (url.endsWith('/users/me/messages/1?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date')) {
      return jsonResponse(gmailMessage('1', 'Older', '1767225600000'))
    }
    return jsonResponse(gmailMessage('2', 'Newer', '1767312000000'))
  }) as typeof fetch)

  const snapshot = await fetchInboxUnread('token')

  assert.equal(snapshot.unreadCount, 5)
  assert.deepEqual(
    snapshot.emails.map((e) => e.id),
    ['2', '1']
  )
  assert.equal(snapshot.emails[0].sender, 'Sender 2')
  assert.equal(snapshot.emails[0].senderAddress, 'sender-2@example.com')
  assert.equal(snapshot.emails[0].isRead, false)
  assert.equal(snapshot.emails[0].webLink, 'https://mail.google.com/mail/u/0/#all/2')
})

test('markMessageRead removes the Gmail UNREAD label', async (t) => {
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

  assert.equal(method, 'POST')
  assert.equal(url, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/msg-1/modify')
  assert.deepEqual(body, { removeLabelIds: ['UNREAD'] })
  assert.equal(authorization, 'Bearer token-1')
})

test('archiveMessage removes the Gmail INBOX label', async (t) => {
  let url = ''
  let body: unknown = null

  t.mock.method(globalThis, 'fetch', (async (input: RequestInfo | URL, init?: RequestInit) => {
    url = String(input)
    body = JSON.parse(String(init?.body))
    return jsonResponse({})
  }) as typeof fetch)

  await archiveMessage('token', 'msg-2')

  assert.equal(url, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/msg-2/modify')
  assert.deepEqual(body, { removeLabelIds: ['INBOX'] })
})

test('deleteMessage moves the Gmail message to trash', async (t) => {
  let method = ''
  let url = ''
  let hadContentType = false

  t.mock.method(globalThis, 'fetch', (async (input: RequestInfo | URL, init?: RequestInit) => {
    method = String(init?.method)
    url = String(input)
    hadContentType = Boolean((init?.headers as Record<string, string> | undefined)?.['Content-Type'])
    return jsonResponse({})
  }) as typeof fetch)

  await deleteMessage('token', 'msg-3')

  assert.equal(method, 'POST')
  assert.equal(url, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/msg-3/trash')
  assert.equal(hadContentType, false)
})

test('markMessagesRead uses batchModify for multiple IDs and reports all as succeeded', async (t) => {
  let batchUrl = ''
  t.mock.method(globalThis, 'fetch', (async (input: RequestInfo | URL) => {
    batchUrl = String(input)
    return jsonResponse({})
  }) as typeof fetch)

  const result = await markMessagesRead('token', ['a', 'b', 'c'])

  assert.match(batchUrl, /batchModify/)
  assert.deepEqual(result.succeededIds, ['a', 'b', 'c'])
  assert.deepEqual(result.failedIds, [])
})

test('markMessagesRead falls back to individual calls on batchModify failure', async (t) => {
  let callCount = 0
  t.mock.method(globalThis, 'fetch', (async (input: RequestInfo | URL) => {
    callCount++
    const url = String(input)
    if (url.includes('batchModify')) return jsonResponse({ error: { message: 'Fail' } }, { status: 500 })
    if (url.includes('bad')) return jsonResponse({ error: { message: 'Missing' } }, { status: 404 })
    return jsonResponse({})
  }) as typeof fetch)

  const result = await markMessagesRead('token', ['good-1', 'bad-1', 'good-2'])

  assert.deepEqual(result.succeededIds, ['good-1', 'good-2'])
  assert.deepEqual(result.failedIds, ['bad-1'])
  assert.ok(callCount >= 4) // 1 batch + 3 individual fallback
})

test('searchMessages uses Gmail q search and maps read state', async (t) => {
  let searchUrl = ''
  t.mock.method(globalThis, 'fetch', (async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/users/me/messages?')) {
      searchUrl = url
      return jsonResponse({ messages: [{ id: '1' }] })
    }
    return jsonResponse(gmailMessage('1', 'Found it', '1767225600000', ['INBOX']))
  }) as typeof fetch)

  const results = await searchMessages('token', 'invoice has:attachment')

  assert.match(searchUrl, /q=invoice\+has%3Aattachment/)
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
