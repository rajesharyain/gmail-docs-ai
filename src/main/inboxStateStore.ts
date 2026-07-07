import type { InboxState } from '../shared/types'

export type InboxStateListener = (state: InboxState) => void

const INITIAL_STATE: InboxState = {
  status: 'signed-out',
  account: null,
  unreadCount: 0,
  newCount: 0,
  emails: [],
  lastSyncAt: null
}

export class InboxStateStore {
  private state: InboxState = { ...INITIAL_STATE }
  private listeners = new Set<InboxStateListener>()

  getSnapshot(): InboxState {
    return this.state
  }

  update(patch: Partial<InboxState>): InboxState {
    this.state = { ...this.state, ...patch }
    this.emit()
    return this.state
  }

  reset(): InboxState {
    this.state = { ...INITIAL_STATE }
    this.emit()
    return this.state
  }

  subscribe(listener: InboxStateListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.state)
  }
}
