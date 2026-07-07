import {
  PublicClientApplication,
  InteractionRequiredAuthError,
  ServerError,
  type AccountInfo,
  type ICachePlugin,
  type TokenCacheContext
} from '@azure/msal-node'
import { app, safeStorage, shell } from 'electron'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { AUTHORITY, AZURE_CLIENT_ID, SCOPES } from './authConfig'
import type { AccountSummary } from '../shared/types'

const cacheFile = () => join(app.getPath('userData'), 'msal-cache.bin')

/**
 * Persists MSAL's token cache to disk, encrypted at rest.
 * On macOS, safeStorage keys the encryption to the user's Keychain.
 */
const keychainCachePlugin: ICachePlugin = {
  async beforeCacheAccess(ctx: TokenCacheContext) {
    if (!existsSync(cacheFile())) return
    try {
      const raw = readFileSync(cacheFile())
      const json = safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(raw)
        : raw.toString('utf-8')
      ctx.tokenCache.deserialize(json)
    } catch (err) {
      // Corrupt or undecryptable cache (e.g. Keychain reset) — start fresh.
      console.warn('Token cache unreadable, discarding:', err)
      try {
        unlinkSync(cacheFile())
      } catch {
        /* ignore */
      }
    }
  },
  async afterCacheAccess(ctx: TokenCacheContext) {
    if (!ctx.cacheHasChanged) return
    const json = ctx.tokenCache.serialize()
    const data = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(json)
      : Buffer.from(json, 'utf-8')
    if (!safeStorage.isEncryptionAvailable()) {
      console.warn('safeStorage unavailable — token cache stored unencrypted')
    }
    writeFileSync(cacheFile(), data, { mode: 0o600 })
  }
}

export class AuthManager {
  private pca = new PublicClientApplication({
    auth: { clientId: AZURE_CLIENT_ID, authority: AUTHORITY },
    cache: { cachePlugin: keychainCachePlugin }
  })

  private account: AccountInfo | null = null

  /** Try to restore a session from the encrypted cache. No UI. */
  async initialize(): Promise<AccountSummary | null> {
    const accounts = await this.pca.getTokenCache().getAllAccounts()
    if (accounts.length === 0) return null
    this.account = accounts[0]
    // Validate the session actually still works (refresh token alive).
    const token = await this.getAccessToken()
    return token ? this.summary() : null
  }

  /** Interactive sign-in via the system browser (PKCE + loopback redirect). */
  async signIn(): Promise<AccountSummary> {
    const result = await this.pca.acquireTokenInteractive({
      scopes: SCOPES,
      openBrowser: async (url) => {
        await shell.openExternal(url)
      },
      successTemplate:
        '<html><body style="font-family:-apple-system;display:grid;place-items:center;height:90vh">' +
        '<div style="text-align:center"><h2>Signed in ✓</h2>' +
        '<p>You can close this tab and return to PostMail AI.</p></div></body></html>',
      errorTemplate:
        '<html><body style="font-family:-apple-system;display:grid;place-items:center;height:90vh">' +
        '<div style="text-align:center"><h2>Sign-in failed</h2>' +
        '<p>Close this tab and try again from the app.</p></div></body></html>'
    })
    this.account = result.account
    return this.summary()!
  }

  /**
   * Access token for Graph calls. Uses the cache / refresh token silently;
   * returns null if interaction is required (caller should show sign-in).
   */
  async getAccessToken(): Promise<string | null> {
    if (!this.account) return null
    try {
      const result = await this.pca.acquireTokenSilent({
        account: this.account,
        scopes: SCOPES
      })
      return result.accessToken
    } catch (err) {
      if (err instanceof InteractionRequiredAuthError) {
        this.account = null
        return null
      }
      // A cached refresh token that doesn't cover a scope added after it was
      // issued (e.g. Mail.Read -> Mail.ReadWrite) fails silent acquisition
      // with a plain ServerError/invalid_grant (AADSTS70000), not
      // InteractionRequiredAuthError — same recovery either way.
      if (err instanceof ServerError && err.errorCode === 'invalid_grant') {
        this.account = null
        return null
      }
      throw err
    }
  }

  async signOut(): Promise<void> {
    const cache = this.pca.getTokenCache()
    for (const acc of await cache.getAllAccounts()) {
      await cache.removeAccount(acc)
    }
    this.account = null
    try {
      unlinkSync(cacheFile())
    } catch {
      /* already gone */
    }
  }

  isSignedIn(): boolean {
    return this.account !== null
  }

  summary(): AccountSummary | null {
    if (!this.account) return null
    return {
      name: this.account.name ?? this.account.username,
      email: this.account.username
    }
  }
}
