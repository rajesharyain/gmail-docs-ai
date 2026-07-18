import { logger } from './logger'
import {
  archiveMessage,
  archiveMessages,
  deleteMessage,
  deleteMessages,
  markMessageRead,
  markMessagesRead,
  markMessagesReadAndArchive,
  searchMessages
} from './graph'
import type { EmailActionKind, EmailSummary, InboxState } from '../shared/types'

/** Only the slice of AuthManager these actions need - keeps this testable
 *  without a real Google OAuth-backed AuthManager instance. */
export interface TokenProvider {
  getAccessToken(): Promise<string | null>
}

interface EmailActionsOptions {
  auth: TokenProvider
  getState: () => InboxState
  setState: (patch: Partial<InboxState>) => void
  /** Suppresses this id from future syncs until Gmail confirms the change -
   *  the same mechanism EmailOpener uses (SyncEngine.markOpened). Gmail's
   *  filtered queries can lag real read-status/folder changes by a short
   *  window, so without this the very next sync (including on app
   *  restart) re-fetches the message as if nothing happened. */
  markSuppressed: (id: string) => void
  /** Personal-learning hook (v4 Phase 7): called on a *successful* archive or
   *  delete. Mark-read is deliberately not recorded — it's too weak a signal
   *  to say anything about how the user feels about a sender. */
  recordLearning?: (email: EmailSummary, kind: 'archive' | 'delete') => void
}

/**
 * Direct Gmail writes with immediate optimistic removal - a different
 * concern from EmailOpener, which hands off to an external client and waits
 * for Gmail to catch up on its own schedule. These calls ARE the source of
 * truth changing, but Gmail's read model can still take a moment to catch up,
 * so the id needs the same post-write suppression EmailOpener relies on.
 */
export class EmailActions {
  constructor(private options: EmailActionsOptions) {}

  async markRead(id: string): Promise<void> {
    await this.runSingle(id, 'markRead', (token) => markMessageRead(token, id))
  }

  async archive(id: string): Promise<void> {
    await this.runSingle(id, 'archive', (token) => archiveMessage(token, id))
  }

  async delete(id: string): Promise<void> {
    await this.runSingle(id, 'delete', (token) => deleteMessage(token, id))
  }

  async done(id: string): Promise<void> {
    await this.runSingle(id, 'done', async (token) => {
      await markMessageRead(token, id)
      await archiveMessage(token, id)
    })
  }

  /** Marks every currently visible/fetched email read — bounded to what's
   *  actually on screen, never the whole mailbox's unread backlog. */
  async markAllVisibleRead(): Promise<void> {
    const state = this.options.getState()
    await this.markManyRead(state.emails.map((e) => e.id))
  }

  /** Batched mark-read for an arbitrary id set (e.g. a checkbox selection),
   *  reusing the same Gmail modify path `markAllVisibleRead` is built on. */
  async markManyRead(ids: string[]): Promise<void> {
    if (ids.length === 0) return
    const token = await this.options.auth.getAccessToken()
    if (!token) return

    try {
      const { succeededIds, failedIds } = await markMessagesRead(token, ids)
      if (failedIds.length > 0) {
        logger.warn('Some messages failed to mark read in bulk', { failedCount: failedIds.length })
      }
      for (const id of succeededIds) this.options.markSuppressed(id)
      this.removeFromState(succeededIds)
    } catch (err) {
      logger.warn('Bulk mark-read failed', {
        error: err instanceof Error ? err.message : String(err)
      })
    }
  }

  async bulkAction(ids: string[], action: EmailActionKind): Promise<void> {
    if (ids.length === 0) return
    if (ids.length === 1) {
      if (action === 'markRead') await this.markRead(ids[0])
      else if (action === 'archive') await this.archive(ids[0])
      else if (action === 'done') await this.done(ids[0])
      else await this.delete(ids[0])
      return
    }

    const token = await this.options.auth.getAccessToken()
    if (!token) return

    const emailsBeforeRemoval = this.options.getState().emails
    let result: { succeededIds: string[]; failedIds: string[] }

    try {
      if (action === 'markRead') {
        result = await markMessagesRead(token, ids)
      } else if (action === 'archive') {
        result = await archiveMessages(token, ids)
      } else if (action === 'done') {
        result = await markMessagesReadAndArchive(token, ids)
      } else {
        result = await deleteMessages(token, ids)
      }
    } catch (err) {
      logger.warn('Bulk action failed entirely', {
        action,
        count: ids.length,
        error: err instanceof Error ? err.message : String(err)
      })
      return
    }

    if (result.failedIds.length > 0) {
      logger.warn('Some messages failed in bulk action', {
        action,
        failedCount: result.failedIds.length
      })
    }

    for (const id of result.succeededIds) this.options.markSuppressed(id)
    if (action !== 'markRead') {
      const learningKind = action === 'done' ? 'archive' : action
      for (const id of result.succeededIds) {
        const email = emailsBeforeRemoval.find((e) => e.id === id)
        if (email) this.options.recordLearning?.(email, learningKind as 'archive' | 'delete')
      }
    }
    this.removeFromState(result.succeededIds)
  }

  async search(query: string): Promise<EmailSummary[]> {
    const token = await this.options.auth.getAccessToken()
    if (!token) return []
    try {
      return await searchMessages(token, query)
    } catch (err) {
      logger.warn('Mail search failed', { error: err instanceof Error ? err.message : String(err) })
      return []
    }
  }

  private async runSingle(
    id: string,
    kind: EmailActionKind,
    action: (token: string) => Promise<void>
  ): Promise<void> {
    const token = await this.options.auth.getAccessToken()
    if (!token) return

    try {
      await action(token)
      this.options.markSuppressed(id)
      if (kind !== 'markRead') {
        const email = this.options.getState().emails.find((e) => e.id === id)
        const learningKind = kind === 'done' ? 'archive' : kind
        if (email) this.options.recordLearning?.(email, learningKind)
      }
      this.removeFromState([id])
    } catch (err) {
      logger.warn('Email action failed', { id, error: err instanceof Error ? err.message : String(err) })
    }
  }

  private removeFromState(ids: string[]): void {
    if (ids.length === 0) return
    const removed = new Set(ids)
    const state = this.options.getState()
    const emails = state.emails.filter((e) => !removed.has(e.id))
    this.options.setState({
      emails,
      unreadCount: Math.max(0, state.unreadCount - ids.length),
      newCount: emails.filter((e) => e.isNew).length
    })
  }
}
