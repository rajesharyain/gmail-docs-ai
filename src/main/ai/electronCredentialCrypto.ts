import { safeStorage } from 'electron'
import type { CredentialCrypto } from './credentialStore'

export const electronCredentialCrypto: CredentialCrypto = {
  isAvailable: () => safeStorage.isEncryptionAvailable(),
  encryptString: (value) => safeStorage.encryptString(value).toString('base64'),
  decryptString: (value) => safeStorage.decryptString(Buffer.from(value, 'base64'))
}
