import type { EmailSummary } from '../shared/types'
import { logger } from './logger'

const GRAPH = 'https://graph.microsoft.com/v1.0'
const PAGE_SIZE = 25
/** Microsoft Graph's JSON batching limit — requests per $batch call. */
const BATCH_SIZE = 20

export class GraphError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
    this.name = 'GraphError'
  }
}

interface GraphMessage {
  id: string
  subject: string | null
  bodyPreview: string | null
  receivedDateTime: string
  webLink: string | null
  isRead?: boolean
  from?: { emailAddress?: { name?: string; address?: string } }
}

/**
 * Shared request path for every Graph call: honors one 429 Retry-After
 * retry, then surfaces a GraphError on any other non-2xx. Callers parse the
 * body themselves (GET callers want JSON; most writes don't need it).
 */
async function graphFetch(
  token: string,
  method: 'GET' | 'PATCH' | 'POST' | 'DELETE',
  path: string,
  body?: unknown,
  retried = false
): Promise<Response> {
  const res = await fetch(`${GRAPH}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  })

  // Throttled: honor Retry-After once, then give up until the next tick.
  if (res.status === 429 && !retried) {
    const wait = Math.min(30, Number(res.headers.get('Retry-After') ?? 5))
    logger.warn('Graph throttled request; honoring Retry-After', { waitSeconds: wait })
    await new Promise((r) => setTimeout(r, wait * 1000))
    return graphFetch(token, method, path, body, true)
  }

  if (!res.ok) {
    let detail = res.statusText
    try {
      const errorBody = (await res.json()) as { error?: { message?: string } }
      detail = errorBody.error?.message ?? detail
    } catch {
      /* non-JSON error body */
    }
    throw new GraphError(res.status, detail)
  }

  return res
}

async function graphGet<T>(token: string, path: string): Promise<T> {
  const res = await graphFetch(token, 'GET', path)
  return (await res.json()) as T
}

function firstLine(text: string | null): string {
  if (!text) return ''
  const line = text.split('\n')[0].trim()
  return line.length > 140 ? `${line.slice(0, 139)}…` : line
}

function toEmailSummary(m: GraphMessage): EmailSummary {
  return {
    id: m.id,
    sender: m.from?.emailAddress?.name || m.from?.emailAddress?.address || 'Unknown sender',
    senderAddress: m.from?.emailAddress?.address ?? '',
    subject: m.subject?.trim() || '(no subject)',
    preview: firstLine(m.bodyPreview),
    receivedAt: m.receivedDateTime,
    isRead: m.isRead ?? false,
    isNew: false,
    webLink: m.webLink ?? undefined
  }
}

export interface InboxSnapshot {
  /** True unread total for the inbox (can exceed the fetched page). */
  unreadCount: number
  /** Up to PAGE_SIZE most recent unread messages. `isNew` is left false —
   *  the sync engine owns that flag. */
  emails: EmailSummary[]
}

export async function fetchInboxUnread(token: string): Promise<InboxSnapshot> {
  const [folder, page] = await Promise.all([
    graphGet<{ unreadItemCount: number }>(
      token,
      '/me/mailFolders/inbox?$select=unreadItemCount'
    ),
    graphGet<{ value: GraphMessage[] }>(
      token,
      `/me/mailFolders/inbox/messages?$filter=isRead%20eq%20false` +
        `&$select=id,subject,bodyPreview,receivedDateTime,webLink,from` +
        `&$top=${PAGE_SIZE}`
    )
  ])

  const emails = page.value
    .map(toEmailSummary)
    // Sort client-side: combining $orderby with $filter on messages trips
    // Graph's "restriction too complex" limits on some mailboxes.
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))

  return { unreadCount: folder.unreadItemCount, emails }
}

/** Marks a single message read. Non-destructive — it just stops matching
 *  the unread filter, so it naturally drops off the next sync. */
export async function markMessageRead(token: string, messageId: string): Promise<void> {
  await graphFetch(token, 'PATCH', `/me/messages/${encodeURIComponent(messageId)}`, {
    isRead: true
  })
}

/** Moves a message to the Archive folder. */
export async function archiveMessage(token: string, messageId: string): Promise<void> {
  await graphFetch(token, 'POST', `/me/messages/${encodeURIComponent(messageId)}/move`, {
    destinationId: 'archive'
  })
}

/** Deletes a message — Graph's normal behavior moves it to Deleted Items,
 *  not a hard delete, so it's recoverable from Outlook itself. */
export async function deleteMessage(token: string, messageId: string): Promise<void> {
  await graphFetch(token, 'DELETE', `/me/messages/${encodeURIComponent(messageId)}`)
}

export interface BatchMarkReadResult {
  succeededIds: string[]
  failedIds: string[]
}

interface BatchResponseItem {
  id: string
  status: number
}

/** Marks many messages read via Graph's JSON batching, chunked at the
 *  batch size limit. Reports per-message success/failure — a batch request
 *  itself can return 200 even when some of its sub-requests failed. */
export async function markMessagesRead(
  token: string,
  messageIds: string[]
): Promise<BatchMarkReadResult> {
  const succeededIds: string[] = []
  const failedIds: string[] = []

  for (let i = 0; i < messageIds.length; i += BATCH_SIZE) {
    const chunk = messageIds.slice(i, i + BATCH_SIZE)
    const res = await graphFetch(token, 'POST', '/$batch', {
      requests: chunk.map((id, index) => ({
        id: String(index),
        method: 'PATCH',
        url: `/me/messages/${id}`,
        headers: { 'Content-Type': 'application/json' },
        body: { isRead: true }
      }))
    })
    const { responses } = (await res.json()) as { responses: BatchResponseItem[] }
    for (const item of responses) {
      const messageId = chunk[Number(item.id)]
      if (messageId === undefined) continue
      if (item.status >= 200 && item.status < 300) succeededIds.push(messageId)
      else failedIds.push(messageId)
    }
  }

  return { succeededIds, failedIds }
}

/**
 * Searches the full mailbox (read and unread), not just the cached unread
 * page. Exact $search query encoding and whether Graph requires a
 * ConsistencyLevel header for this endpoint needs verification against a
 * real mailbox — flagging that honestly rather than assuming.
 */
export async function searchMessages(token: string, query: string): Promise<EmailSummary[]> {
  const page = await graphGet<{ value: GraphMessage[] }>(
    token,
    `/me/messages?$search=${encodeURIComponent(`"${query}"`)}` +
      `&$select=id,subject,bodyPreview,receivedDateTime,webLink,from,isRead` +
      `&$top=${PAGE_SIZE}`
  )

  return page.value.map(toEmailSummary).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
}
