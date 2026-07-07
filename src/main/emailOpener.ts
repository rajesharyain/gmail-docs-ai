import { shell } from 'electron'
import type { EmailSummary, InboxState } from '../shared/types'
import { isTrustedExternalEmailLink } from './ipcValidation'

interface EmailOpenerOptions {
  getState: () => InboxState
  setState: (patch: Partial<InboxState>) => void
  markOpened: (id: string) => void
  /** Personal-learning hook (v4 Phase 7): repeated opens from the same
   *  sender eventually suggest a "mark important" rule. */
  recordLearning?: (email: EmailSummary) => void
}

export class EmailOpener {
  constructor(private options: EmailOpenerOptions) {}

  open(id: string): void {
    const state = this.options.getState()
    const email = state.emails.find((e) => e.id === id)
    if (!email) return

    // Optimistic removal: the user is reading it now, so it leaves the list
    // immediately. The sync engine keeps it suppressed until Gmail agrees.
    this.options.markOpened(id)
    this.options.recordLearning?.(email)
    const emails = state.emails.filter((e) => e.id !== id)
    this.options.setState({
      emails,
      unreadCount: Math.max(0, state.unreadCount - 1),
      newCount: emails.filter((e) => e.isNew).length
    })

    if (isTrustedExternalEmailLink(email.webLink)) void shell.openExternal(email.webLink)
  }
}
