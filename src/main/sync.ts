import type { AuthManager } from './auth'
import { fetchInboxUnread, GraphError } from './graph'
import { logger } from './logger'
import { isSenderMuted } from '../shared/mailIntelligence'
import { deleteFile, readJson, readSettings, writeJson } from './store'
import type { EmailSummary, InboxState } from '../shared/types'

const CACHE_FILE = 'inbox-cache.json'
const SEEN_FILE = 'seen-ids.json'
/** Cap the persisted seen-set so it can't grow forever. */
const SEEN_LIMIT = 500
/** How long an opened email stays suppressed if Gmail keeps returning it as
 *  unread (covers the user marking it unread again on purpose). */
const OPENED_TTL_MS = 30 * 60_000
const MIN_RETRY_MS = 30_000
const MAX_RETRY_MS = 15 * 60_000
const RESUME_QUIET_MS = 20_000

interface CachedInbox {
  unreadCount: number
  emails: EmailSummary[]
  lastSyncAt: string
}

/**
 * Owns the background polling loop and the "what counts as new" logic.
 *
 * "New" = the message id was not present the last time the user opened the
 * popup (seen ids are persisted, so this survives restarts).
 */
export class SyncEngine {
  private timer: ReturnType<typeof setTimeout> | null = null
  private syncing = false
  private running = false
  private failureCount = 0
  private quietUntil = 0
  private seenIds = new Set<string>(readJson<string[]>(SEEN_FILE, []))
  /** Ids present in the previous successful sync — the notification baseline. */
  private lastSyncIds: Set<string> | null = null
  /**
   * Emails the user opened from the app, mapped to when. Gmail's filtered
   * queries can lag behind read-status changes, so these stay hidden until Gmail
   * stops returning them (or the TTL passes).
   */
  private openedIds = new Map<string, number>()

  constructor(
    private auth: AuthManager,
    private setState: (patch: Partial<InboxState>) => void,
    /** Called with messages that arrived since the previous check. */
    private onNewMail?: (emails: EmailSummary[]) => void,
    /** Called with the full visible list after every successful sync — the
     *  hook for the opt-in cloud classification fallback. Fire-and-forget. */
    private onSyncComplete?: (emails: EmailSummary[]) => void
  ) {}

  /** Restore the last snapshot so the UI is populated before the first sync. */
  loadCache(): void {
    const cached = readJson<CachedInbox | null>(CACHE_FILE, null)
    if (!cached) return
    this.setState({
      unreadCount: cached.unreadCount,
      emails: cached.emails.map((e) => ({ ...e, isNew: !this.seenIds.has(e.id) })),
      newCount: cached.emails.filter((e) => !this.seenIds.has(e.id)).length,
      lastSyncAt: cached.lastSyncAt
    })
  }

  start(): void {
    this.stop()
    this.running = true
    this.scheduleNext(this.normalIntervalMs())
  }

  stop(): void {
    this.running = false
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  syncAfterResume(): void {
    if (!this.auth.isSignedIn()) return
    this.quietUntil = Date.now() + RESUME_QUIET_MS
    logger.info('Scheduling quiet sync after wake')
    this.scheduleNext(3_000)
  }

  async syncNow(options: { quiet?: boolean; scheduled?: boolean } = {}): Promise<void> {
    if (this.syncing) return
    this.syncing = true
    this.setState({ status: 'syncing' })
    if (options.quiet) this.quietUntil = Date.now() + RESUME_QUIET_MS

    try {
      const token = await this.auth.getAccessToken()
      if (!token) {
        // Refresh token expired/revoked — user must sign in again.
        this.stop()
        this.setState({
          status: 'signed-out',
          account: null,
          errorMessage: 'Your session expired. Please sign in again.'
        })
        logger.warn('Sync stopped because access token is unavailable')
        return
      }

      const snapshot = await fetchInboxUnread(token)

      // Prune opened-ids that Gmail has caught up on (no longer returned as
      // unread) or that outlived the TTL.
      const returnedIds = new Set(snapshot.emails.map((e) => e.id))
      for (const [id, openedAt] of this.openedIds) {
        if (!returnedIds.has(id) || Date.now() - openedAt > OPENED_TTL_MS) {
          this.openedIds.delete(id)
        }
      }

      const senderRules = readSettings().rules.senderRules
      const visible = snapshot.emails.filter(
        (e) => !this.openedIds.has(e.id) && !isSenderMuted(e, senderRules)
      )
      const suppressed = snapshot.emails.length - visible.length
      const emails = visible.map((e) => ({
        ...e,
        isNew: !this.seenIds.has(e.id)
      }))
      const unreadCount = Math.max(0, snapshot.unreadCount - suppressed)
      const lastSyncAt = new Date().toISOString()

      writeJson(CACHE_FILE, {
        unreadCount,
        emails,
        lastSyncAt
      } satisfies CachedInbox)

      this.setState({
        status: 'ok',
        unreadCount,
        newCount: emails.filter((e) => e.isNew).length,
        emails,
        lastSyncAt,
        errorMessage: undefined
      })
      this.failureCount = 0

      // Notify only for mail that arrived since the *previous* check of this
      // session. On the first sync (lastSyncIds === null) we just establish
      // the baseline — no notification blast for a backlog of unread mail.
      const quiet = Date.now() < this.quietUntil
      if (this.lastSyncIds !== null && this.onNewMail && !quiet) {
        const arrived = emails.filter((e) => e.isNew && !this.lastSyncIds!.has(e.id))
        if (arrived.length > 0) this.onNewMail(arrived)
      } else if (quiet) {
        logger.info('Suppressed notifications during quiet sync window')
      }
      this.lastSyncIds = returnedIds
      logger.info('Inbox sync succeeded', { unreadCount, visibleCount: emails.length })
      this.onSyncComplete?.(emails)
    } catch (err) {
      // Keep the last good data on screen; just surface the problem.
      this.failureCount += 1
      this.setState({ status: 'error', errorMessage: friendlySyncError(err) })
      logger.warn('Inbox sync failed', {
        failureCount: this.failureCount,
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err)
      })
    } finally {
      this.syncing = false
      if (this.running || options.scheduled) {
        this.scheduleNext(this.failureCount > 0 ? this.retryDelayMs() : this.normalIntervalMs())
      }
    }
  }

  /** Popup was opened: everything currently listed no longer counts as new. */
  markSeen(ids: string[]): void {
    for (const id of ids) this.seenIds.add(id)
    // Trim oldest entries if the set grows too large (insertion order).
    if (this.seenIds.size > SEEN_LIMIT) {
      this.seenIds = new Set([...this.seenIds].slice(-SEEN_LIMIT))
    }
    writeJson(SEEN_FILE, [...this.seenIds])
  }

  /** User opened this email from the app - suppress it until Gmail confirms. */
  markOpened(id: string): void {
    this.openedIds.set(id, Date.now())
  }

  /** Sign-out: forget everything local. */
  clearLocal(): void {
    this.stop()
    this.seenIds.clear()
    this.lastSyncIds = null
    this.openedIds.clear()
    deleteFile(SEEN_FILE)
    deleteFile(CACHE_FILE)
    logger.info('Cleared local sync cache')
  }

  private normalIntervalMs(): number {
    return readSettings().pollIntervalMinutes * 60_000
  }

  private retryDelayMs(): number {
    const delay = MIN_RETRY_MS * 2 ** Math.max(0, this.failureCount - 1)
    return Math.min(MAX_RETRY_MS, delay)
  }

  private scheduleNext(delayMs: number): void {
    if (!this.running) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.syncNow({ scheduled: true }), delayMs)
  }
}

function friendlySyncError(err: unknown): string {
  if (err instanceof GraphError) {
    if (err.status === 401 || err.status === 403) {
      return 'Gmail denied access. Try signing out and back in.'
    }
    if (err.status === 429) {
      return 'Gmail is rate-limiting requests. Will retry on the next check.'
    }
    if (err.status >= 500) {
      return 'Gmail is having trouble. Will retry on the next check.'
    }
    return `Gmail error: ${err.message}`
  }
  if (err instanceof TypeError) {
    // fetch network failure
    return 'No connection to Gmail. Will retry on the next check.'
  }
  return `Sync failed: ${err instanceof Error ? err.message : String(err)}`
}
