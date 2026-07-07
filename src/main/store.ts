import { app } from 'electron'
import { readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { Settings } from '../shared/types'
import { normalizeSettings } from '../shared/settings'

/**
 * Minimal local persistence for the sync cache and settings.
 * Deliberately a JSON file store: the data is ~25 small records, so a
 * database adds native-module build pain for zero benefit at this size.
 * All persistence goes through this module — swapping in SQLite later
 * touches nothing else.
 */

const fileFor = (name: string) => join(app.getPath('userData'), name)

export function readJson<T>(name: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(fileFor(name), 'utf-8')) as T
  } catch {
    return fallback
  }
}

export function writeJson(name: string, value: unknown): void {
  try {
    writeFileSync(fileFor(name), JSON.stringify(value), { mode: 0o600 })
  } catch (err) {
    console.warn(`Failed to persist ${name}:`, err)
  }
}

export function deleteFile(name: string): void {
  try {
    unlinkSync(fileFor(name))
  } catch {
    /* already gone */
  }
}

// --- settings ---------------------------------------------------------------

const SETTINGS_FILE = 'settings.json'

export function readSettings(): Settings {
  const raw = readJson<Partial<Settings>>(SETTINGS_FILE, {})
  return normalizeSettings(raw)
}

/** Merge, persist, and return the normalized result. */
export function writeSettings(patch: Partial<Settings>): Settings {
  const current = readSettings()
  writeJson(SETTINGS_FILE, {
    ...current,
    ...patch,
    ai: patch.ai
      ? {
          ...current.ai,
          ...patch.ai,
          privacy: patch.ai.privacy ? { ...current.ai.privacy, ...patch.ai.privacy } : current.ai.privacy,
          providerConfig: patch.ai.providerConfig
            ? { ...current.ai.providerConfig, ...patch.ai.providerConfig }
            : current.ai.providerConfig
        }
      : current.ai,
    rules: patch.rules ?? current.rules
  })
  return readSettings()
}
