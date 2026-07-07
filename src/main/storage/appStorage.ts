import { app } from 'electron'
import { join } from 'path'
import { SqliteStore } from './sqliteStore'

export function createAppSqliteStore(): Promise<SqliteStore> {
  const wasmPath = app.isPackaged
    ? join(process.resourcesPath, 'sql-wasm.wasm')
    : join(app.getAppPath(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')

  return SqliteStore.open(join(app.getPath('userData'), 'gmail-docs-ai.sqlite3'), wasmPath)
}

export type { AIAuditEntry, AIClassificationCacheEntry, AIPrivacyDecisionEntry, AIRule } from './sqliteStore'
