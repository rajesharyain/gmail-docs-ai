import { app } from 'electron'
import { appendFileSync, mkdirSync, statSync, renameSync } from 'fs'
import { dirname, join } from 'path'

const MAX_LOG_BYTES = 512 * 1024

type LogLevel = 'info' | 'warn' | 'error'

function logFile(): string {
  return join(app.getPath('userData'), 'logs', 'main.log')
}

function serialize(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function rotateIfNeeded(file: string): void {
  try {
    if (statSync(file).size <= MAX_LOG_BYTES) return
    renameSync(file, `${file}.1`)
  } catch {
    /* missing file or rotation failure; logging must never crash the app */
  }
}

function write(level: LogLevel, message: string, meta?: unknown): void {
  const line = `${new Date().toISOString()} ${level.toUpperCase()} ${message}${
    meta === undefined ? '' : ` ${serialize(meta)}`
  }\n`

  if (level === 'error') console.error(message, meta ?? '')
  else if (level === 'warn') console.warn(message, meta ?? '')
  else console.log(message, meta ?? '')

  try {
    const file = logFile()
    mkdirSync(dirname(file), { recursive: true })
    rotateIfNeeded(file)
    appendFileSync(file, line, { mode: 0o600 })
  } catch {
    /* ignore */
  }
}

export const logger = {
  info: (message: string, meta?: unknown) => write('info', message, meta),
  warn: (message: string, meta?: unknown) => write('warn', message, meta),
  error: (message: string, meta?: unknown) => write('error', message, meta)
}
