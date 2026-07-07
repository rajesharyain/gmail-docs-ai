import assert from 'node:assert/strict'
import type { EmailSummary } from '../src/shared/types'

export function email(overrides: Partial<EmailSummary> & { id: string }): EmailSummary {
  return {
    sender: 'Sender',
    senderAddress: 'sender@example.com',
    subject: 'Subject',
    preview: 'Preview',
    receivedAt: '2026-07-05T12:00:00.000Z',
    isRead: false,
    isNew: false,
    webLink: 'https://outlook.office.com/mail/id',
    ...overrides
  }
}

export function assertKinds(items: Array<{ kind: string }>, kinds: string[]): void {
  assert.deepEqual(
    items.map((item) => item.kind),
    kinds
  )
}
