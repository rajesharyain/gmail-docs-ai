import { app, powerMonitor } from 'electron'
import { join } from 'path'
import type { InboxState, Settings } from '../shared/types'
import {
  AIConnectionTester,
  AICredentialStore,
  AIProviderRegistry,
  ClassificationService,
  electronCredentialCrypto,
  GeminiProvider,
  GitHubModelsProvider,
  GroqProvider
} from './ai'
import { AuthManager } from './auth'
import { isConfigured } from './authConfig'
import { EmailActions } from './emailActions'
import { EmailOpener } from './emailOpener'
import { InboxStateStore } from './inboxStateStore'
import { LearningStore } from './learning'
import { registerIpcHandlers } from './ipcRouter'
import { logger } from './logger'
import { createNewMailNotifier } from './notifications'
import { SyncEngine } from './sync'
import { createAppSqliteStore } from './storage/appStorage'
import { readSettings, writeSettings } from './store'
import { WindowManager } from './windows'

// ---------------------------------------------------------------------------
// Inbox state — driven by AuthManager + SyncEngine.
// ---------------------------------------------------------------------------
const auth = new AuthManager()
const inbox = new InboxStateStore()
const windows = new WindowManager(markNewAsSeen)

function setState(patch: Partial<InboxState>) {
  inbox.update(patch)
}

// Assigned once app.whenReady() has the SQLite store open — the sync loop is
// constructed before that, so this stays null (safe no-op) until then.
let classificationService: ClassificationService | null = null

const notifyNewMail = createNewMailNotifier(() => windows.showPopup())
const sync = new SyncEngine(auth, setState, notifyNewMail, (emails) => {
  void classificationService?.classifyAmbiguous(emails)
  void classificationService?.analyzeInsight(emails)
})
const learning = new LearningStore()
const emailOpener = new EmailOpener({
  getState: () => inbox.getSnapshot(),
  setState,
  markOpened: (id) => sync.markOpened(id),
  recordLearning: (email) => learning.record(email, 'open')
})
const emailActions = new EmailActions({
  auth,
  getState: () => inbox.getSnapshot(),
  setState,
  markSuppressed: (id) => sync.markOpened(id),
  recordLearning: (email, kind) => learning.record(email, kind)
})

/**
 * Persist a settings change and apply its side effects immediately:
 * a new poll interval restarts the timer, launch-at-login updates the
 * macOS login item (packaged app only — in dev it would register the bare
 * Electron binary, which is never what anyone wants).
 */
function applySettings(patch: Partial<Settings>) {
  const before = readSettings()
  const after = writeSettings(patch)

  if (after.pollIntervalMinutes !== before.pollIntervalMinutes && auth.isSignedIn()) {
    logger.info('Restarting sync with updated poll interval', {
      pollIntervalMinutes: after.pollIntervalMinutes
    })
    sync.start()
  }
  if (after.launchAtLogin !== before.launchAtLogin) {
    syncLoginItem(after.launchAtLogin)
  }
}

function syncLoginItem(enabled: boolean) {
  if (!app.isPackaged) return // dev build: persist the preference only
  app.setLoginItemSettings({ openAtLogin: enabled })
}

/**
 * Popup opened: clear the menu-bar "new" state and remember these ids as seen.
 * The blue dots stay visible for this viewing and disappear naturally on the
 * next sync.
 */
function markNewAsSeen() {
  const state = inbox.getSnapshot()
  sync.markSeen(state.emails.map((e) => e.id))
  if (state.newCount !== 0) setState({ newCount: 0 })
}

async function handleSignIn() {
  if (!isConfigured()) {
    setState({
      status: 'signed-out',
      errorMessage:
        'No Google client ID configured. Set GOOGLE_CLIENT_ID before signing in (see README).'
    })
    return
  }
  setState({ status: 'signing-in', errorMessage: undefined })
  try {
    const account = await auth.signIn()
    logger.info('Interactive sign-in succeeded')
    setState({ status: 'syncing', account })
    sync.start()
    await sync.syncNow()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    setState({
      status: 'signed-out',
      account: null,
      errorMessage: friendlyAuthError(message)
    })
    logger.warn('Interactive sign-in failed', message)
  }
}

async function handleSignOut() {
  sync.clearLocal()
  await auth.signOut()
  inbox.reset()
  logger.info('Signed out')
}

async function restoreSession() {
  if (!isConfigured()) return
  try {
    const account = await auth.initialize()
    if (!account) return
    logger.info('Restored cached session')
    setState({ status: 'syncing', account })
    sync.loadCache() // instant UI from last snapshot while the sync runs
    sync.start()
    await sync.syncNow()
  } catch (err) {
    logger.warn('Silent session restore failed', err)
  }
}

function friendlyAuthError(raw: string): string {
  if (raw.toLowerCase().includes('access_denied')) {
    return 'Google sign-in was denied.'
  }
  if (raw.includes('user_cancelled')) {
    return 'Sign-in was cancelled.'
  }
  return `Sign-in failed: ${raw.slice(0, 160)}`
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => windows.showPopup())
  app.whenReady().then(async () => {
    logger.info('App ready', { packaged: app.isPackaged })
    // Background companion: no Dock icon.
    if (process.platform === 'darwin') app.dock.hide()

    const aiCredentials = new AICredentialStore(
      join(app.getPath('userData'), 'ai-credentials.json'),
      electronCredentialCrypto
    )
    const aiConnectionTester = new AIConnectionTester(aiCredentials)

    const aiProviderRegistry = new AIProviderRegistry()
    const getModel = () => readSettings().ai.model
    aiProviderRegistry.register(new GroqProvider(aiCredentials, getModel))
    aiProviderRegistry.register(new GitHubModelsProvider(aiCredentials, getModel))
    aiProviderRegistry.register(new GeminiProvider(aiCredentials, getModel))

    const sqliteStore = await createAppSqliteStore().catch((err) => {
      logger.warn('Failed to open local database; classification cache disabled', err)
      return null
    })
    classificationService = new ClassificationService(
      aiProviderRegistry,
      aiCredentials,
      sqliteStore,
      () => readSettings(),
      () => inbox.getSnapshot(),
      setState
    )

    registerIpcHandlers({
      getState: () => inbox.getSnapshot(),
      getSettings: () => readSettings(),
      setSettings: applySettings,
      getAICredentialStatus: (provider) => aiCredentials.status(provider),
      saveAICredential: (provider, token) => aiCredentials.save(provider, token),
      clearAICredential: (provider) => aiCredentials.clear(provider),
      testAIConnection: () => aiConnectionTester.test(readSettings()),
      togglePopup: () => windows.togglePopup(),
      markSeen: markNewAsSeen,
      syncNow: () => void sync.syncNow(),
      openEmail: (id) => emailOpener.open(id),
      markEmailRead: (id) => void emailActions.markRead(id),
      archiveEmail: (id) => void emailActions.archive(id),
      deleteEmail: (id) => void emailActions.delete(id),
      markAllVisibleRead: () => void emailActions.markAllVisibleRead(),
      bulkEmailAction: (ids, action) => void emailActions.bulkAction(ids, action),
      searchMail: (query) => emailActions.search(query),
      getRuleSuggestions: () => learning.suggestions(readSettings().rules.senderRules),
      dismissRuleSuggestion: (id) => learning.dismiss(id),
      signIn: () => void handleSignIn(),
      signOut: () => void handleSignOut()
    })
    inbox.subscribe((state) => windows.broadcastState(state))

    windows.createAll()
    syncLoginItem(readSettings().launchAtLogin)
    powerMonitor.on('resume', () => sync.syncAfterResume())
    restoreSession()
  })
}

// Keep running when all windows are "closed" (popup hidden) — this is a
// background app; quitting happens explicitly from the popup menu.
app.on('window-all-closed', () => {
  /* no-op on purpose */
})
