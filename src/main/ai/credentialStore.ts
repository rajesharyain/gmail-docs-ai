import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import type { AICredentialStatus, AIProviderId } from '../../shared/types'

export interface CredentialCrypto {
  isAvailable: () => boolean
  encryptString: (value: string) => string
  decryptString: (value: string) => string
}

interface StoredCredential {
  encryptedToken: string
  updatedAt: string
}

interface CredentialFile {
  version: 1
  credentials: Partial<Record<AIProviderId, StoredCredential>>
}

function emptyFile(): CredentialFile {
  return {
    version: 1,
    credentials: {}
  }
}

export class AICredentialStore {
  constructor(
    private readonly path: string,
    private readonly crypto: CredentialCrypto
  ) {}

  status(provider: AIProviderId): AICredentialStatus {
    const entry = this.read().credentials[provider]
    return {
      provider,
      hasCredential: Boolean(entry),
      updatedAt: entry?.updatedAt ?? null,
      storageAvailable: this.crypto.isAvailable()
    }
  }

  save(provider: AIProviderId, token: string): AICredentialStatus {
    const clean = token.trim()
    if (!this.crypto.isAvailable()) {
      throw new Error('Secure credential storage is not available on this Mac.')
    }
    if (!clean) {
      throw new Error('Credential cannot be empty.')
    }

    const file = this.read()
    file.credentials[provider] = {
      encryptedToken: this.crypto.encryptString(clean),
      updatedAt: new Date().toISOString()
    }
    this.write(file)
    return this.status(provider)
  }

  clear(provider: AIProviderId): AICredentialStatus {
    const file = this.read()
    delete file.credentials[provider]

    if (Object.keys(file.credentials).length === 0) {
      try {
        unlinkSync(this.path)
      } catch {
        /* already gone */
      }
      return this.status(provider)
    }

    this.write(file)
    return this.status(provider)
  }

  readToken(provider: AIProviderId): string | null {
    const entry = this.read().credentials[provider]
    if (!entry) return null
    return this.crypto.decryptString(entry.encryptedToken)
  }

  private read(): CredentialFile {
    try {
      if (!existsSync(this.path)) return emptyFile()
      const parsed = JSON.parse(readFileSync(this.path, 'utf-8')) as CredentialFile
      return parsed.version === 1 && parsed.credentials ? parsed : emptyFile()
    } catch {
      return emptyFile()
    }
  }

  private write(value: CredentialFile): void {
    mkdirSync(dirname(this.path), { recursive: true })
    writeFileSync(this.path, JSON.stringify(value), { mode: 0o600 })
  }
}
