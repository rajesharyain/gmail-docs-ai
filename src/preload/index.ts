import { contextBridge, ipcRenderer } from 'electron'
import {
  AICredentialStatus,
  AIConnectionTestResult,
  AIProviderId,
  EmailActionKind,
  EmailSummary,
  IPC,
  InboxState,
  InboxStats,
  RuleSuggestion,
  Settings
} from '../shared/types'

const api = {
  togglePopup: () => ipcRenderer.send(IPC.toggleP),
  signIn: () => ipcRenderer.send(IPC.signIn),
  signOut: () => ipcRenderer.send(IPC.signOut),
  syncNow: () => ipcRenderer.send(IPC.syncNow),
  openEmail: (id: string) => ipcRenderer.send(IPC.openEmail, id),
  markEmailRead: (id: string) => ipcRenderer.send(IPC.emailMarkRead, id),
  archiveEmail: (id: string) => ipcRenderer.send(IPC.emailArchive, id),
  deleteEmail: (id: string) => ipcRenderer.send(IPC.emailDelete, id),
  doneEmail: (id: string) => ipcRenderer.send(IPC.emailDone, id),
  markAllVisibleRead: () => ipcRenderer.send(IPC.emailMarkAllRead),
  bulkEmailAction: (ids: string[], action: EmailActionKind) =>
    ipcRenderer.send(IPC.emailBulkAction, { ids, action }),
  searchMail: (query: string): Promise<EmailSummary[]> => ipcRenderer.invoke(IPC.emailSearch, query),
  fetchEmailBody: (id: string): Promise<string> => ipcRenderer.invoke(IPC.emailBody, id),
  fetchInboxStats: (): Promise<InboxStats> => ipcRenderer.invoke(IPC.inboxStats),
  getRuleSuggestions: (): Promise<RuleSuggestion[]> => ipcRenderer.invoke(IPC.learningSuggestions),
  dismissRuleSuggestion: (id: string) => ipcRenderer.send(IPC.learningDismiss, id),
  getSettings: (): Promise<Settings> => ipcRenderer.invoke(IPC.settingsGet),
  setSettings: (patch: Partial<Settings>) => ipcRenderer.send(IPC.settingsSet, patch),
  getAICredentialStatus: (
    provider: Exclude<AIProviderId, 'none'>
  ): Promise<AICredentialStatus | null> => ipcRenderer.invoke(IPC.aiCredentialStatus, provider),
  saveAICredential: (
    provider: Exclude<AIProviderId, 'none'>,
    token: string
  ): Promise<AICredentialStatus | null> =>
    ipcRenderer.invoke(IPC.aiCredentialSave, { provider, token }),
  clearAICredential: (
    provider: Exclude<AIProviderId, 'none'>
  ): Promise<AICredentialStatus | null> => ipcRenderer.invoke(IPC.aiCredentialClear, provider),
  testAIConnection: (): Promise<AIConnectionTestResult> => ipcRenderer.invoke(IPC.aiConnectionTest),
  quit: () => ipcRenderer.send(IPC.quit),
  getInboxState: (): Promise<InboxState> => ipcRenderer.invoke(IPC.requestState),
  onInboxState: (cb: (state: InboxState) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, state: InboxState) => cb(state)
    ipcRenderer.on(IPC.inboxState, listener)
    return () => {
      ipcRenderer.removeListener(IPC.inboxState, listener)
    }
  }
}

export type NotifierApi = typeof api

contextBridge.exposeInMainWorld('notifier', api)
