import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { AICredentialStore, type CredentialCrypto } from '../src/main/ai'

const testCrypto: CredentialCrypto = {
  isAvailable: () => true,
  encryptString: (value) => Buffer.from(`encrypted:${value}`, 'utf-8').toString('base64'),
  decryptString: (value) => Buffer.from(value, 'base64').toString('utf-8').replace(/^encrypted:/, '')
}

function withStore(run: (store: AICredentialStore) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'postmail-ai-credentials-'))
  try {
    run(new AICredentialStore(join(dir, 'credentials.json'), testCrypto))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('stores credential status without exposing the secret', () => {
  withStore((store) => {
    assert.deepEqual(store.status('github-models'), {
      provider: 'github-models',
      hasCredential: false,
      updatedAt: null,
      storageAvailable: true
    })

    const status = store.save('github-models', ' ghp_secret ')
    assert.equal(status.provider, 'github-models')
    assert.equal(status.hasCredential, true)
    assert.equal(typeof status.updatedAt, 'string')
    assert.equal(status.storageAvailable, true)
    assert.equal(store.readToken('github-models'), 'ghp_secret')
  })
})

test('clears credentials per provider', () => {
  withStore((store) => {
    store.save('github-models', 'github-token')
    store.save('custom', 'custom-token')

    store.clear('github-models')

    assert.equal(store.readToken('github-models'), null)
    assert.equal(store.readToken('custom'), 'custom-token')
  })
})
