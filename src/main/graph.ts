import type { EmailSummary } from '../shared/types'
import { logger } from './logger'

const GMAIL = 'https://gmail.googleapis.com/gmail/v1'
const PAGE_SIZE = 25

export class GraphError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
    this.name = 'GraphError'
  }
}

interface GmailListResponse {
  messages?: Array<{ id: string; threadId?: string }>
  resultSizeEstimate?: number
}

interface GmailLabel {
  messagesUnread?: number
}

interface GmailHeader {
  name: string
  value: string
}

interface GmailMessage {
  id: string
  threadId?: string
  snippet?: string
  internalDate?: string
  labelIds?: string[]
  payload?: {
    headers?: GmailHeader[]
  }
}

async function gmailFetch(
  token: string,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: unknown,
  retried = false
): Promise<Response> {
  const res = await fetch(`${GMAIL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  })

  if (res.status === 429 && !retried) {
    const wait = Math.min(30, Number(res.headers.get('Retry-After') ?? 5))
    logger.warn('Gmail throttled request; honoring Retry-After', { waitSeconds: wait })
    await new Promise((r) => setTimeout(r, wait * 1000))
    return gmailFetch(token, method, path, body, true)
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

async function gmailGet<T>(token: string, path: string): Promise<T> {
  const res = await gmailFetch(token, 'GET', path)
  return (await res.json()) as T
}

function firstLine(text: string | undefined): string {
  if (!text) return ''
  const line = text.split('\n')[0].trim()
  return line.length > 140 ? `${line.slice(0, 139)}...` : line
}

function header(message: GmailMessage, name: string): string {
  const match = message.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())
  return match?.value ?? ''
}

function parseSender(from: string): { sender: string; senderAddress: string } {
  const addressMatch = from.match(/<([^>]+)>/)
  const senderAddress = addressMatch?.[1]?.trim() ?? (from.includes('@') ? from.trim() : '')
  const sender = from
    .replace(/<[^>]+>/g, '')
    .trim()
    .replace(/^"|"$/g, '')
  return {
    sender: sender || senderAddress || 'Unknown sender',
    senderAddress
  }
}

function messageDate(message: GmailMessage): string {
  if (message.internalDate && Number.isFinite(Number(message.internalDate))) {
    return new Date(Number(message.internalDate)).toISOString()
  }
  const date = header(message, 'Date')
  const parsed = Date.parse(date)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString()
}

function toEmailSummary(message: GmailMessage): EmailSummary {
  const { sender, senderAddress } = parseSender(header(message, 'From'))
  const subject = header(message, 'Subject').trim() || '(no subject)'
  return {
    id: message.id,
    sender,
    senderAddress,
    subject,
    preview: firstLine(message.snippet),
    receivedAt: messageDate(message),
    isRead: !(message.labelIds ?? []).includes('UNREAD'),
    isNew: false,
    webLink: `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(message.id)}`
  }
}

function metadataPath(messageId: string): string {
  const params = new URLSearchParams({
    format: 'metadata'
  })
  for (const h of ['From', 'Subject', 'Date']) params.append('metadataHeaders', h)
  return `/users/me/messages/${encodeURIComponent(messageId)}?${params.toString()}`
}

async function fetchMessagesByIds(token: string, ids: string[]): Promise<EmailSummary[]> {
  const messages = await Promise.all(ids.map((id) => gmailGet<GmailMessage>(token, metadataPath(id))))
  return messages.map(toEmailSummary).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
}

export interface InboxSnapshot {
  unreadCount: number
  emails: EmailSummary[]
}

export async function fetchInboxUnread(token: string): Promise<InboxSnapshot> {
  const params = new URLSearchParams({
    maxResults: String(PAGE_SIZE)
  })
  params.append('labelIds', 'INBOX')
  params.append('labelIds', 'UNREAD')

  const [label, page] = await Promise.all([
    gmailGet<GmailLabel>(token, '/users/me/labels/UNREAD'),
    gmailGet<GmailListResponse>(token, `/users/me/messages?${params.toString()}`)
  ])

  const ids = (page.messages ?? []).map((m) => m.id)
  const emails = await fetchMessagesByIds(token, ids)
  return { unreadCount: label.messagesUnread ?? page.resultSizeEstimate ?? emails.length, emails }
}

export async function markMessageRead(token: string, messageId: string): Promise<void> {
  await gmailFetch(token, 'POST', `/users/me/messages/${encodeURIComponent(messageId)}/modify`, {
    removeLabelIds: ['UNREAD']
  })
}

export async function archiveMessage(token: string, messageId: string): Promise<void> {
  await gmailFetch(token, 'POST', `/users/me/messages/${encodeURIComponent(messageId)}/modify`, {
    removeLabelIds: ['INBOX']
  })
}

export async function deleteMessage(token: string, messageId: string): Promise<void> {
  await gmailFetch(token, 'POST', `/users/me/messages/${encodeURIComponent(messageId)}/trash`)
}

export interface BatchMarkReadResult {
  succeededIds: string[]
  failedIds: string[]
}

export async function markMessagesRead(
  token: string,
  messageIds: string[]
): Promise<BatchMarkReadResult> {
  const settled = await Promise.allSettled(messageIds.map((id) => markMessageRead(token, id)))
  return {
    succeededIds: messageIds.filter((_, index) => settled[index]?.status === 'fulfilled'),
    failedIds: messageIds.filter((_, index) => settled[index]?.status === 'rejected')
  }
}

export async function searchMessages(token: string, query: string): Promise<EmailSummary[]> {
  const params = new URLSearchParams({
    maxResults: String(PAGE_SIZE),
    q: query
  })
  const page = await gmailGet<GmailListResponse>(token, `/users/me/messages?${params.toString()}`)
  const ids = (page.messages ?? []).map((m) => m.id)
  return fetchMessagesByIds(token, ids)
}
