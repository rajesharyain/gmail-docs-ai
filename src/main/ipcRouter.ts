import { app, ipcMain } from 'electron'
import {
  IPC,
  type AICredentialStatus,
  type AIConnectionTestResult,
  type EmailActionKind,
  type EmailSummary,
  type InboxState,
  type InboxStats,
  type RuleSuggestion,
  type Settings
} from '../shared/types'
import {
  isCredentialProvider,
  isEmailId,
  sanitizeBulkEmailAction,
  sanitizeCredentialSave,
  sanitizeSearchQuery,
  sanitizeSettingsPatch,
  sanitizeSuggestionId
} from './ipcValidation'

interface IpcRouterOptions {
  getState: () => InboxState
  getSettings: () => Settings
  setSettings: (patch: Partial<Settings>) => void
  getAICredentialStatus: (provider: Exclude<Settings['ai']['provider'], 'none'>) => AICredentialStatus
  saveAICredential: (
    provider: Exclude<Settings['ai']['provider'], 'none'>,
    token: string
  ) => AICredentialStatus
  clearAICredential: (provider: Exclude<Settings['ai']['provider'], 'none'>) => AICredentialStatus
  testAIConnection: () => Promise<AIConnectionTestResult>
  togglePopup: () => void
  markSeen: () => void
  syncNow: () => void
  openEmail: (id: string) => void
  markEmailRead: (id: string) => void
  archiveEmail: (id: string) => void
  deleteEmail: (id: string) => void
  doneEmail: (id: string) => void
  markAllVisibleRead: () => void
  bulkEmailAction: (ids: string[], action: EmailActionKind) => void
  searchMail: (query: string) => Promise<EmailSummary[]>
  fetchEmailBody: (id: string) => Promise<string>
  fetchInboxStats: () => Promise<InboxStats>
  getRuleSuggestions: () => RuleSuggestion[]
  dismissRuleSuggestion: (id: string) => void
  signIn: () => void
  signOut: () => void
}

export function registerIpcHandlers(options: IpcRouterOptions): void {
  ipcMain.on(IPC.toggleP, options.togglePopup)
  ipcMain.on(IPC.markSeen, options.markSeen)
  ipcMain.on(IPC.syncNow, options.syncNow)
  ipcMain.on(IPC.openEmail, (_e, id: unknown) => {
    if (isEmailId(id)) options.openEmail(id)
  })
  ipcMain.on(IPC.emailMarkRead, (_e, id: unknown) => {
    if (isEmailId(id)) options.markEmailRead(id)
  })
  ipcMain.on(IPC.emailArchive, (_e, id: unknown) => {
    if (isEmailId(id)) options.archiveEmail(id)
  })
  ipcMain.on(IPC.emailDelete, (_e, id: unknown) => {
    if (isEmailId(id)) options.deleteEmail(id)
  })
  ipcMain.on(IPC.emailDone, (_e, id: unknown) => {
    if (isEmailId(id)) options.doneEmail(id)
  })
  ipcMain.on(IPC.emailMarkAllRead, options.markAllVisibleRead)
  ipcMain.on(IPC.emailBulkAction, (_e, payload: unknown) => {
    const clean = sanitizeBulkEmailAction(payload)
    if (clean) options.bulkEmailAction(clean.ids, clean.action)
  })
  ipcMain.handle(IPC.emailSearch, (_e, query: unknown) => {
    const clean = sanitizeSearchQuery(query)
    if (!clean) return []
    return options.searchMail(clean)
  })
  ipcMain.handle(IPC.emailBody, (_e, id: unknown) => {
    if (!isEmailId(id)) return ''
    return options.fetchEmailBody(id)
  })
  ipcMain.handle(IPC.inboxStats, () => options.fetchInboxStats())
  ipcMain.handle(IPC.settingsGet, options.getSettings)
  ipcMain.on(IPC.settingsSet, (_e, patch: unknown) => {
    options.setSettings(sanitizeSettingsPatch(patch))
  })
  ipcMain.handle(IPC.aiCredentialStatus, (_e, provider: unknown) => {
    if (!isCredentialProvider(provider)) return null
    return options.getAICredentialStatus(provider)
  })
  ipcMain.handle(IPC.aiCredentialSave, (_e, input: unknown) => {
    const clean = sanitizeCredentialSave(input)
    if (!clean) return null
    return options.saveAICredential(clean.provider, clean.token)
  })
  ipcMain.handle(IPC.aiCredentialClear, (_e, provider: unknown) => {
    if (!isCredentialProvider(provider)) return null
    return options.clearAICredential(provider)
  })
  ipcMain.handle(IPC.aiConnectionTest, options.testAIConnection)
  ipcMain.handle(IPC.learningSuggestions, options.getRuleSuggestions)
  ipcMain.on(IPC.learningDismiss, (_e, id: unknown) => {
    const clean = sanitizeSuggestionId(id)
    if (clean) options.dismissRuleSuggestion(clean)
  })
  ipcMain.on(IPC.signIn, options.signIn)
  ipcMain.on(IPC.signOut, options.signOut)
  ipcMain.on(IPC.quit, () => app.quit())
  ipcMain.handle(IPC.requestState, options.getState)
}
