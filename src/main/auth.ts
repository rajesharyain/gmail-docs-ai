import { createHash, randomBytes } from 'crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { app, safeStorage, shell } from 'electron'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  GOOGLE_AUTH_URL,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_SCOPES,
  GOOGLE_TOKEN_URL,
  GOOGLE_USERINFO_URL
} from './authConfig'
import type { AccountSummary } from '../shared/types'

interface GoogleTokenCache {
  accessToken: string
  refreshToken: string | null
  expiresAt: number
  scope: string
  account: AccountSummary | null
}

interface GoogleTokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  token_type?: string
  error?: string
  error_description?: string
}

interface GoogleUserInfo {
  name?: string
  email?: string
}

const cacheFile = () => join(app.getPath('userData'), 'google-token-cache.bin')
const TOKEN_REFRESH_WINDOW_MS = 60_000

function encodeBase64Url(value: Buffer): string {
  return value.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function makePkcePair(): { verifier: string; challenge: string } {
  const verifier = encodeBase64Url(randomBytes(32))
  const challenge = encodeBase64Url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

function readCache(): GoogleTokenCache | null {
  if (!existsSync(cacheFile())) return null
  try {
    const raw = readFileSync(cacheFile())
    const json = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(raw)
      : raw.toString('utf-8')
    return JSON.parse(json) as GoogleTokenCache
  } catch (err) {
    console.warn('Google token cache unreadable, discarding:', err)
    try {
      unlinkSync(cacheFile())
    } catch {
      /* ignore */
    }
    return null
  }
}

function writeCache(cache: GoogleTokenCache): void {
  const json = JSON.stringify(cache)
  const data = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(json)
    : Buffer.from(json, 'utf-8')
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('safeStorage unavailable — Google token cache stored unencrypted')
  }
  writeFileSync(cacheFile(), data, { mode: 0o600 })
}

function successPage(): string {
  return (
    '<html><body style="font-family:-apple-system;display:grid;place-items:center;height:90vh">' +
    '<div style="text-align:center"><h2>Signed in</h2>' +
    '<p>You can close this tab and return to Gmail Docs AI.</p></div></body></html>'
  )
}

function errorPage(message: string): string {
  return (
    '<html><body style="font-family:-apple-system;display:grid;place-items:center;height:90vh">' +
    '<div style="text-align:center"><h2>Sign-in failed</h2>' +
    `<p>${message}</p></div></body></html>`
  )
}

function sendHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(html)
}

function startOAuthCallback(expectedState: string): Promise<{
  redirectUri: string
  waitForCode: Promise<string>
}> {
  return new Promise((resolve, reject) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      try {
        const host = req.headers.host
        if (!host || !req.url) throw new Error('Missing OAuth callback URL')
        const url = new URL(req.url, `http://${host}`)
        const error = url.searchParams.get('error')
        if (error) {
          sendHtml(res, errorPage(error))
          codeReject(new Error(error))
          server.close()
          return
        }
        const state = url.searchParams.get('state')
        const code = url.searchParams.get('code')
        if (!code || state !== expectedState) {
          sendHtml(res, errorPage('Invalid sign-in response.'))
          codeReject(new Error('Invalid OAuth callback state'))
          server.close()
          return
        }
        sendHtml(res, successPage())
        codeResolve(code)
        server.close()
      } catch (err) {
        codeReject(err)
        server.close()
      }
    })
    let codeResolve: (code: string) => void = () => undefined
    let codeReject: (err: unknown) => void = () => undefined
    const waitForCode = new Promise<string>((codeRes, codeRej) => {
      codeResolve = codeRes
      codeReject = codeRej
    })
    server.on('error', (err) => {
      codeReject(err)
      reject(err)
    })
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      resolve({ redirectUri: `http://127.0.0.1:${port}`, waitForCode })
    })
  })
}

async function postToken(body: URLSearchParams): Promise<GoogleTokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  })
  const payload = (await res.json()) as GoogleTokenResponse
  if (!res.ok || payload.error) {
    throw new Error(payload.error_description ?? payload.error ?? `Google token request failed: ${res.status}`)
  }
  return payload
}

async function fetchUserInfo(accessToken: string): Promise<AccountSummary> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { authorization: `Bearer ${accessToken}` }
  })
  if (!res.ok) throw new Error(`Google userinfo failed: ${res.status}`)
  const info = (await res.json()) as GoogleUserInfo
  const email = info.email ?? 'Google account'
  return {
    name: info.name ?? email,
    email
  }
}

export class AuthManager {
  private cache: GoogleTokenCache | null = null

  async initialize(): Promise<AccountSummary | null> {
    this.cache = readCache()
    if (!this.cache) return null
    const token = await this.getAccessToken()
    return token ? this.summary() : null
  }

  async signIn(): Promise<AccountSummary> {
    const { verifier, challenge } = makePkcePair()
    const state = encodeBase64Url(randomBytes(16))
    const callback = await startOAuthCallback(state)
    const authUrl = new URL(GOOGLE_AUTH_URL)
    authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID)
    authUrl.searchParams.set('redirect_uri', callback.redirectUri)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', GOOGLE_SCOPES.join(' '))
    authUrl.searchParams.set('access_type', 'offline')
    authUrl.searchParams.set('prompt', 'consent')
    authUrl.searchParams.set('code_challenge', challenge)
    authUrl.searchParams.set('code_challenge_method', 'S256')
    authUrl.searchParams.set('state', state)

    await shell.openExternal(authUrl.toString())
    const code = await callback.waitForCode

    const body = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: callback.redirectUri
    })
    if (GOOGLE_CLIENT_SECRET) body.set('client_secret', GOOGLE_CLIENT_SECRET)

    const token = await postToken(body)
    if (!token.access_token) throw new Error('Google did not return an access token')
    const account = await fetchUserInfo(token.access_token)
    this.cache = {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
      scope: token.scope ?? GOOGLE_SCOPES.join(' '),
      account
    }
    writeCache(this.cache)
    return account
  }

  async getAccessToken(): Promise<string | null> {
    if (!this.cache) return null
    if (Date.now() < this.cache.expiresAt - TOKEN_REFRESH_WINDOW_MS) return this.cache.accessToken
    if (!this.cache.refreshToken) {
      this.cache = null
      return null
    }

    const body = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: this.cache.refreshToken
    })
    if (GOOGLE_CLIENT_SECRET) body.set('client_secret', GOOGLE_CLIENT_SECRET)

    try {
      const token = await postToken(body)
      if (!token.access_token) throw new Error('Google did not return an access token')
      this.cache = {
        ...this.cache,
        accessToken: token.access_token,
        refreshToken: token.refresh_token ?? this.cache.refreshToken,
        expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
        scope: token.scope ?? this.cache.scope
      }
      writeCache(this.cache)
      return this.cache.accessToken
    } catch {
      this.cache = null
      return null
    }
  }

  async signOut(): Promise<void> {
    this.cache = null
    try {
      unlinkSync(cacheFile())
    } catch {
      /* already gone */
    }
  }

  isSignedIn(): boolean {
    return this.cache !== null
  }

  summary(): AccountSummary | null {
    return this.cache?.account ?? null
  }
}
