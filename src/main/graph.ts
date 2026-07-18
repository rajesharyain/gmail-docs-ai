import type { EmailSummary } from '../shared/types'
import { logger } from './logger'

const GMAIL = 'https://gmail.googleapis.com/gmail/v1'
const PAGE_SIZE = 100
const METADATA_BATCH_SIZE = 25

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
  nextPageToken?: string
}

interface GmailLabel {
  messagesTotal?: number
  messagesUnread?: number
}

export interface GmailProfile {
  messagesTotal?: number
  threadsTotal?: number
  historyId?: string
}

export interface HistoryResponse {
  history?: Array<{
    id: string
    messagesAdded?: Array<{ message: { id: string; labelIds?: string[] } }>
  }>
  historyId?: string
  nextPageToken?: string
}

export interface AttachmentMeta {
  imageCount: number
  videoCount: number
  imageSize: number
  videoSize: number
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
  const messages: GmailMessage[] = []
  for (let i = 0; i < ids.length; i += METADATA_BATCH_SIZE) {
    const batch = ids.slice(i, i + METADATA_BATCH_SIZE)
    const results = await Promise.all(batch.map((id) => gmailGet<GmailMessage>(token, metadataPath(id))))
    messages.push(...results)
  }
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

  const [label, firstPage] = await Promise.all([
    gmailGet<GmailLabel>(token, '/users/me/labels/UNREAD'),
    gmailGet<GmailListResponse>(token, `/users/me/messages?${params.toString()}`)
  ])

  const allIds = (firstPage.messages ?? []).map((m) => m.id)

  let nextPageToken = firstPage.nextPageToken
  while (nextPageToken) {
    const nextParams = new URLSearchParams({
      maxResults: String(PAGE_SIZE),
      pageToken: nextPageToken
    })
    nextParams.append('labelIds', 'INBOX')
    nextParams.append('labelIds', 'UNREAD')
    const nextPage = await gmailGet<GmailListResponse>(token, `/users/me/messages?${nextParams.toString()}`)
    allIds.push(...(nextPage.messages ?? []).map((m) => m.id))
    nextPageToken = nextPage.nextPageToken
  }

  logger.info('Fetched all unread message IDs', { count: allIds.length })
  const emails = await fetchMessagesByIds(token, allIds)
  return { unreadCount: label.messagesUnread ?? emails.length, emails }
}

export async function fetchMessageBody(token: string, messageId: string): Promise<string> {
  const msg = await gmailGet<{
    payload?: {
      mimeType?: string
      body?: { data?: string }
      parts?: Array<{ mimeType?: string; body?: { data?: string }; parts?: Array<{ mimeType?: string; body?: { data?: string } }> }>
    }
  }>(token, `/users/me/messages/${encodeURIComponent(messageId)}?format=full`)

  function decodeBase64Url(data: string): string {
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/')
    return Buffer.from(base64, 'base64').toString('utf-8')
  }

  function extractText(payload: typeof msg.payload): string {
    if (!payload) return ''
    if (payload.mimeType === 'text/plain' && payload.body?.data) {
      return decodeBase64Url(payload.body.data)
    }
    if (payload.parts) {
      const textPart = payload.parts.find((p) => p.mimeType === 'text/plain')
      if (textPart?.body?.data) return decodeBase64Url(textPart.body.data)
      for (const part of payload.parts) {
        if (part.parts) {
          const nested = part.parts.find((p) => p.mimeType === 'text/plain')
          if (nested?.body?.data) return decodeBase64Url(nested.body.data)
        }
      }
      const htmlPart = payload.parts.find((p) => p.mimeType === 'text/html')
      if (htmlPart?.body?.data) {
        const html = decodeBase64Url(htmlPart.body.data)
        return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      }
    }
    if (payload.body?.data) return decodeBase64Url(payload.body.data)
    return ''
  }

  return extractText(msg.payload)
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

export interface BatchActionResult {
  succeededIds: string[]
  failedIds: string[]
}

const BATCH_MODIFY_LIMIT = 1000

async function batchModifyMessages(
  token: string,
  ids: string[],
  addLabelIds: string[],
  removeLabelIds: string[]
): Promise<BatchActionResult> {
  const succeededIds: string[] = []
  const failedIds: string[] = []

  for (let i = 0; i < ids.length; i += BATCH_MODIFY_LIMIT) {
    const batch = ids.slice(i, i + BATCH_MODIFY_LIMIT)
    try {
      await gmailFetch(token, 'POST', '/users/me/messages/batchModify', {
        ids: batch,
        ...(addLabelIds.length > 0 ? { addLabelIds } : {}),
        removeLabelIds
      })
      succeededIds.push(...batch)
    } catch (err) {
      logger.warn('batchModify failed for chunk, falling back to individual calls', {
        chunkSize: batch.length,
        error: err instanceof Error ? err.message : String(err)
      })
      for (const id of batch) {
        try {
          await gmailFetch(token, 'POST', `/users/me/messages/${encodeURIComponent(id)}/modify`, {
            ...(addLabelIds.length > 0 ? { addLabelIds } : {}),
            removeLabelIds
          })
          succeededIds.push(id)
        } catch {
          failedIds.push(id)
        }
      }
    }
  }

  return { succeededIds, failedIds }
}

export async function markMessagesRead(
  token: string,
  messageIds: string[]
): Promise<BatchActionResult> {
  if (messageIds.length === 1) {
    try {
      await markMessageRead(token, messageIds[0])
      return { succeededIds: messageIds, failedIds: [] }
    } catch {
      return { succeededIds: [], failedIds: messageIds }
    }
  }
  return batchModifyMessages(token, messageIds, [], ['UNREAD'])
}

export async function archiveMessages(
  token: string,
  messageIds: string[]
): Promise<BatchActionResult> {
  if (messageIds.length === 1) {
    try {
      await archiveMessage(token, messageIds[0])
      return { succeededIds: messageIds, failedIds: [] }
    } catch {
      return { succeededIds: [], failedIds: messageIds }
    }
  }
  return batchModifyMessages(token, messageIds, [], ['INBOX'])
}

export async function markMessagesReadAndArchive(
  token: string,
  messageIds: string[]
): Promise<BatchActionResult> {
  if (messageIds.length === 1) {
    try {
      await markMessageRead(token, messageIds[0])
      await archiveMessage(token, messageIds[0])
      return { succeededIds: messageIds, failedIds: [] }
    } catch {
      return { succeededIds: [], failedIds: messageIds }
    }
  }
  return batchModifyMessages(token, messageIds, [], ['UNREAD', 'INBOX'])
}

export async function deleteMessages(
  token: string,
  messageIds: string[]
): Promise<BatchActionResult> {
  if (messageIds.length === 1) {
    try {
      await deleteMessage(token, messageIds[0])
      return { succeededIds: messageIds, failedIds: [] }
    } catch {
      return { succeededIds: [], failedIds: messageIds }
    }
  }
  const succeededIds: string[] = []
  const failedIds: string[] = []
  const settled = await Promise.allSettled(messageIds.map((id) => deleteMessage(token, id)))
  for (let i = 0; i < messageIds.length; i++) {
    if (settled[i]?.status === 'fulfilled') succeededIds.push(messageIds[i])
    else failedIds.push(messageIds[i])
  }
  return { succeededIds, failedIds }
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

export interface InboxStats {
  totalEmails: number
  trashEmails: number
  imageAttachments: number
  videoAttachments: number
  imageSize: number
  videoSize: number
}

async function searchCount(token: string, query: string): Promise<number> {
  const params = new URLSearchParams({ maxResults: '1', q: query })
  const page = await gmailGet<GmailListResponse>(token, `/users/me/messages?${params.toString()}`)
  return page.resultSizeEstimate ?? 0
}

interface GmailFullMessage {
  id: string
  sizeEstimate?: number
  payload?: {
    mimeType?: string
    parts?: Array<{
      mimeType?: string
      body?: { size?: number }
      parts?: Array<{ mimeType?: string; body?: { size?: number } }>
    }>
  }
}

function sumAttachmentSizes(msg: GmailFullMessage, mimePrefix: string): number {
  let total = 0
  const parts = msg.payload?.parts ?? []
  for (const part of parts) {
    if (part.mimeType?.startsWith(mimePrefix) && part.body?.size) {
      total += part.body.size
    }
    if (part.parts) {
      for (const nested of part.parts) {
        if (nested.mimeType?.startsWith(mimePrefix) && nested.body?.size) {
          total += nested.body.size
        }
      }
    }
  }
  return total
}

export async function fetchInboxStatsQuick(token: string): Promise<InboxStats> {
  const [inboxLabel, trashLabel] = await Promise.all([
    gmailGet<GmailLabel>(token, '/users/me/labels/INBOX'),
    gmailGet<GmailLabel>(token, '/users/me/labels/TRASH')
  ])
  return {
    totalEmails: inboxLabel.messagesTotal ?? 0,
    trashEmails: trashLabel.messagesTotal ?? 0,
    imageAttachments: 0,
    videoAttachments: 0,
    imageSize: 0,
    videoSize: 0
  }
}

export async function fetchInboxStatsAttachments(token: string): Promise<Pick<InboxStats, 'imageAttachments' | 'videoAttachments' | 'imageSize' | 'videoSize'>> {
  const [imageCount, videoCount] = await Promise.all([
    searchCount(token, 'has:attachment filename:(jpg OR jpeg OR png OR gif OR webp OR heic)'),
    searchCount(token, 'has:attachment filename:(mp4 OR mov OR avi OR mkv OR webm)')
  ])

  let imageSize = 0
  let videoSize = 0

  const sampleSize = 10
  const [imageIds, videoIds] = await Promise.all([
    gmailGet<GmailListResponse>(token, `/users/me/messages?${new URLSearchParams({
      maxResults: String(sampleSize),
      q: 'has:attachment filename:(jpg OR jpeg OR png OR gif OR webp OR heic)'
    }).toString()}`),
    gmailGet<GmailListResponse>(token, `/users/me/messages?${new URLSearchParams({
      maxResults: String(sampleSize),
      q: 'has:attachment filename:(mp4 OR mov OR avi OR mkv OR webm)'
    }).toString()}`)
  ])

  const imageMsgIds = (imageIds.messages ?? []).map((m) => m.id)
  const videoMsgIds = (videoIds.messages ?? []).map((m) => m.id)

  if (imageMsgIds.length > 0) {
    const msgs = await Promise.all(
      imageMsgIds.map((id) => gmailGet<GmailFullMessage>(token, `/users/me/messages/${encodeURIComponent(id)}?format=metadata&fields=id,sizeEstimate,payload(parts(mimeType,body(size)))`))
    )
    const sampleTotal = msgs.reduce((sum, msg) => sum + sumAttachmentSizes(msg, 'image/'), 0)
    const avgSize = sampleTotal / imageMsgIds.length
    imageSize = Math.round(avgSize * imageCount)
  }

  if (videoMsgIds.length > 0) {
    const msgs = await Promise.all(
      videoMsgIds.map((id) => gmailGet<GmailFullMessage>(token, `/users/me/messages/${encodeURIComponent(id)}?format=metadata&fields=id,sizeEstimate,payload(parts(mimeType,body(size)))`))
    )
    const sampleTotal = msgs.reduce((sum, msg) => sum + sumAttachmentSizes(msg, 'video/'), 0)
    const avgSize = sampleTotal / videoMsgIds.length
    videoSize = Math.round(avgSize * videoCount)
  }

  return { imageAttachments: imageCount, videoAttachments: videoCount, imageSize, videoSize }
}

export async function fetchGmailProfile(token: string): Promise<GmailProfile> {
  return gmailGet<GmailProfile>(token, '/users/me/profile')
}

export async function fetchLabelCounts(token: string): Promise<{ totalEmails: number; trashEmails: number }> {
  const [inbox, trash] = await Promise.all([
    gmailGet<GmailLabel>(token, '/users/me/labels/INBOX'),
    gmailGet<GmailLabel>(token, '/users/me/labels/TRASH')
  ])
  return {
    totalEmails: inbox.messagesTotal ?? 0,
    trashEmails: trash.messagesTotal ?? 0
  }
}

export async function fetchHistory(
  token: string,
  startHistoryId: string
): Promise<{ messageIds: string[]; historyId: string } | null> {
  const allIds: string[] = []
  let pageToken: string | undefined
  try {
    do {
      const params = new URLSearchParams({
        startHistoryId,
        historyTypes: 'messageAdded',
        maxResults: '500'
      })
      if (pageToken) params.set('pageToken', pageToken)
      const res = await gmailGet<HistoryResponse>(token, `/users/me/history?${params.toString()}`)
      for (const entry of res.history ?? []) {
        for (const added of entry.messagesAdded ?? []) {
          allIds.push(added.message.id)
        }
      }
      pageToken = res.nextPageToken
      if (!pageToken && res.historyId) {
        return { messageIds: allIds, historyId: res.historyId }
      }
    } while (pageToken)
    return { messageIds: allIds, historyId: startHistoryId }
  } catch (err) {
    if (err instanceof GraphError && (err.status === 404 || err.status === 400)) {
      return null
    }
    throw err
  }
}

export async function fetchMessageAttachmentMeta(token: string, messageId: string): Promise<AttachmentMeta> {
  const msg = await gmailGet<GmailFullMessage>(
    token,
    `/users/me/messages/${encodeURIComponent(messageId)}?format=metadata&fields=id,payload(parts(mimeType,body(size),parts(mimeType,body(size))))`
  )
  return {
    imageCount: countParts(msg, 'image/'),
    videoCount: countParts(msg, 'video/'),
    imageSize: sumAttachmentSizes(msg, 'image/'),
    videoSize: sumAttachmentSizes(msg, 'video/')
  }
}

function countParts(msg: GmailFullMessage, mimePrefix: string): number {
  let count = 0
  const parts = msg.payload?.parts ?? []
  for (const part of parts) {
    if (part.mimeType?.startsWith(mimePrefix)) count++
    if (part.parts) {
      for (const nested of part.parts) {
        if (nested.mimeType?.startsWith(mimePrefix)) count++
      }
    }
  }
  return count
}
