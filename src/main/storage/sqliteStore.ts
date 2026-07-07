import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { createRequire } from 'module'
import { dirname, join } from 'path'
import type { Database, SqlJsStatic, SqlValue } from 'sql.js'

export interface AIAuditEntry {
  id?: number
  action: string
  providerId: string
  model: string | null
  emailIdHash: string | null
  decision: 'allowed' | 'blocked' | 'skipped'
  reason: string | null
  createdAt?: string
}

export interface AIRule {
  id?: number
  name: string
  enabled: boolean
  conditionsJson: string
  actionsJson: string
  createdAt?: string
  updatedAt?: string
}

export interface AIPrivacyDecisionEntry {
  id?: number
  emailIdHash: string
  providerId: string
  decision: 'allowed' | 'blocked' | 'skipped'
  reason: string | null
  redactionsJson: string
  createdAt?: string
}

export interface AIClassificationCacheEntry {
  emailIdHash: string
  providerId: string
  model: string | null
  category: string
  createdAt?: string
}

export interface AIInsightCacheEntry {
  emailIdHash: string
  providerId: string
  model: string | null
  attentionLevel: string
  nextAction: string
  hasDeadline: boolean
  deadlineUrgency: string | null
  deadlineLabel: string | null
  riskLevel: string
  riskReasonsJson: string
  reasonsJson: string
  createdAt?: string
}

type Row = Record<string, SqlValue>

export class SqliteStore {
  private constructor(
    private readonly path: string,
    private readonly db: Database
  ) {
    this.migrate()
    this.persist()
  }

  static async open(path: string, wasmPath = defaultWasmPath()): Promise<SqliteStore> {
    const SQL = await loadSql(wasmPath)
    const data = existsSync(path) ? readFileSync(path) : null
    return new SqliteStore(path, data ? new SQL.Database(data) : new SQL.Database())
  }

  close(): void {
    this.persist()
    this.db.close()
  }

  recordAIAudit(entry: AIAuditEntry): number {
    this.db.run(
      `INSERT INTO ai_audit_log (
        action,
        provider_id,
        model,
        email_id_hash,
        decision,
        reason
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [entry.action, entry.providerId, entry.model, entry.emailIdHash, entry.decision, entry.reason]
    )
    this.persist()
    return this.maxId('ai_audit_log')
  }

  listAIAudit(limit = 50): AIAuditEntry[] {
    return this.all(
      `SELECT
        id,
        action,
        provider_id AS providerId,
        model,
        email_id_hash AS emailIdHash,
        decision,
        reason,
        created_at AS createdAt
      FROM ai_audit_log
      ORDER BY id DESC
      LIMIT ?`,
      [Math.min(500, Math.max(1, Math.round(limit)))]
    ) as unknown as AIAuditEntry[]
  }

  recordAIPrivacyDecision(entry: AIPrivacyDecisionEntry): number {
    this.db.run(
      `INSERT INTO ai_privacy_decisions (
        email_id_hash,
        provider_id,
        decision,
        reason,
        redactions_json
      ) VALUES (?, ?, ?, ?, ?)`,
      [entry.emailIdHash, entry.providerId, entry.decision, entry.reason, entry.redactionsJson]
    )
    this.persist()
    return this.maxId('ai_privacy_decisions')
  }

  listAIPrivacyDecisions(limit = 50): AIPrivacyDecisionEntry[] {
    return this.all(
      `SELECT
        id,
        email_id_hash AS emailIdHash,
        provider_id AS providerId,
        decision,
        reason,
        redactions_json AS redactionsJson,
        created_at AS createdAt
      FROM ai_privacy_decisions
      ORDER BY id DESC
      LIMIT ?`,
      [Math.min(500, Math.max(1, Math.round(limit)))]
    ) as unknown as AIPrivacyDecisionEntry[]
  }

  upsertAIClassification(entry: AIClassificationCacheEntry): void {
    this.db.run(
      `INSERT INTO ai_classification_cache (
        email_id_hash,
        provider_id,
        model,
        category
      ) VALUES (?, ?, ?, ?)
      ON CONFLICT(email_id_hash, provider_id) DO UPDATE SET
        model = excluded.model,
        category = excluded.category,
        created_at = CURRENT_TIMESTAMP`,
      [entry.emailIdHash, entry.providerId, entry.model, entry.category]
    )
    this.persist()
  }

  getAIClassification(emailIdHash: string, providerId: string): AIClassificationCacheEntry | null {
    const [row] = this.all(
      `SELECT
        email_id_hash AS emailIdHash,
        provider_id AS providerId,
        model,
        category,
        created_at AS createdAt
      FROM ai_classification_cache
      WHERE email_id_hash = ?
        AND provider_id = ?`,
      [emailIdHash, providerId]
    )

    return (row as unknown as AIClassificationCacheEntry | undefined) ?? null
  }

  upsertAIInsight(entry: AIInsightCacheEntry): void {
    this.db.run(
      `INSERT INTO ai_insight_cache (
        email_id_hash,
        provider_id,
        model,
        attention_level,
        next_action,
        has_deadline,
        deadline_urgency,
        deadline_label,
        risk_level,
        risk_reasons_json,
        reasons_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(email_id_hash, provider_id) DO UPDATE SET
        model = excluded.model,
        attention_level = excluded.attention_level,
        next_action = excluded.next_action,
        has_deadline = excluded.has_deadline,
        deadline_urgency = excluded.deadline_urgency,
        deadline_label = excluded.deadline_label,
        risk_level = excluded.risk_level,
        risk_reasons_json = excluded.risk_reasons_json,
        reasons_json = excluded.reasons_json,
        created_at = CURRENT_TIMESTAMP`,
      [
        entry.emailIdHash,
        entry.providerId,
        entry.model,
        entry.attentionLevel,
        entry.nextAction,
        entry.hasDeadline ? 1 : 0,
        entry.deadlineUrgency,
        entry.deadlineLabel,
        entry.riskLevel,
        entry.riskReasonsJson,
        entry.reasonsJson
      ]
    )
    this.persist()
  }

  getAIInsight(emailIdHash: string, providerId: string): AIInsightCacheEntry | null {
    const [row] = this.all(
      `SELECT
        email_id_hash AS emailIdHash,
        provider_id AS providerId,
        model,
        attention_level AS attentionLevel,
        next_action AS nextAction,
        has_deadline AS hasDeadline,
        deadline_urgency AS deadlineUrgency,
        deadline_label AS deadlineLabel,
        risk_level AS riskLevel,
        risk_reasons_json AS riskReasonsJson,
        reasons_json AS reasonsJson,
        created_at AS createdAt
      FROM ai_insight_cache
      WHERE email_id_hash = ?
        AND provider_id = ?`,
      [emailIdHash, providerId]
    )

    if (!row) return null
    return { ...(row as unknown as AIInsightCacheEntry), hasDeadline: Boolean(row.hasDeadline) }
  }

  saveAIRule(rule: AIRule): number {
    if (rule.id) {
      this.db.run(
        `UPDATE ai_rules
        SET
          name = ?,
          enabled = ?,
          conditions_json = ?,
          actions_json = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [rule.name, rule.enabled ? 1 : 0, rule.conditionsJson, rule.actionsJson, rule.id]
      )
      this.persist()
      return rule.id
    }

    this.db.run(
      `INSERT INTO ai_rules (
        name,
        enabled,
        conditions_json,
        actions_json
      ) VALUES (?, ?, ?, ?)`,
      [rule.name, rule.enabled ? 1 : 0, rule.conditionsJson, rule.actionsJson]
    )
    this.persist()
    return this.maxId('ai_rules')
  }

  listAIRules(): AIRule[] {
    const rows = this.all(
      `SELECT
        id,
        name,
        enabled,
        conditions_json AS conditionsJson,
        actions_json AS actionsJson,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM ai_rules
      ORDER BY name COLLATE NOCASE ASC`
    ) as Array<Omit<AIRule, 'enabled'> & { enabled: number }>

    return rows.map((row) => ({ ...row, enabled: row.enabled === 1 }))
  }

  private migrate(): void {
    const version = Number(this.one('PRAGMA user_version')?.user_version ?? 0)
    if (version < 1) {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS ai_audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          action TEXT NOT NULL,
          provider_id TEXT NOT NULL,
          model TEXT,
          email_id_hash TEXT,
          decision TEXT NOT NULL CHECK (decision IN ('allowed', 'blocked', 'skipped')),
          reason TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_ai_audit_log_created_at
          ON ai_audit_log(created_at);

        CREATE TABLE IF NOT EXISTS ai_rules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
          conditions_json TEXT NOT NULL,
          actions_json TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        PRAGMA user_version = 1;
      `)
    }
    if (version < 2) {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS ai_privacy_decisions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email_id_hash TEXT NOT NULL,
          provider_id TEXT NOT NULL,
          decision TEXT NOT NULL CHECK (decision IN ('allowed', 'blocked', 'skipped')),
          reason TEXT,
          redactions_json TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_ai_privacy_decisions_created_at
          ON ai_privacy_decisions(created_at);

        PRAGMA user_version = 2;
      `)
    }
    if (version < 3) {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS ai_classification_cache (
          email_id_hash TEXT NOT NULL,
          provider_id TEXT NOT NULL,
          model TEXT,
          category TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (email_id_hash, provider_id)
        );

        PRAGMA user_version = 3;
      `)
    }
    if (version < 4) {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS ai_insight_cache (
          email_id_hash TEXT NOT NULL,
          provider_id TEXT NOT NULL,
          model TEXT,
          attention_level TEXT NOT NULL,
          next_action TEXT NOT NULL,
          has_deadline INTEGER NOT NULL CHECK (has_deadline IN (0, 1)),
          deadline_urgency TEXT,
          deadline_label TEXT,
          risk_level TEXT NOT NULL,
          risk_reasons_json TEXT NOT NULL,
          reasons_json TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (email_id_hash, provider_id)
        );

        PRAGMA user_version = 4;
      `)
    }
  }

  private all(sql: string, params?: SqlValue[]): Row[] {
    const statement = this.db.prepare(sql, params ?? [])
    const rows: Row[] = []
    try {
      while (statement.step()) rows.push(statement.getAsObject())
    } finally {
      statement.free()
    }
    return rows
  }

  private one(sql: string, params?: SqlValue[]): Row | null {
    return this.all(sql, params)[0] ?? null
  }

  private maxId(table: 'ai_audit_log' | 'ai_privacy_decisions' | 'ai_rules'): number {
    return Number(this.one(`SELECT MAX(id) AS id FROM ${table}`)?.id ?? 0)
  }

  private persist(): void {
    mkdirSync(dirname(this.path), { recursive: true })
    writeFileSync(this.path, this.db.export())
  }
}

let sqlPromise: Promise<SqlJsStatic> | null = null
const nodeRequire = createRequire(import.meta.url)

function loadSql(wasmPath: string): Promise<SqlJsStatic> {
  const initSqlJs = nodeRequire('sql.js') as (config?: {
    locateFile?: (file: string) => string
  }) => Promise<SqlJsStatic>

  sqlPromise ??= initSqlJs({
    locateFile: (file) => (file === 'sql-wasm.wasm' ? wasmPath : file)
  })
  return sqlPromise
}

function defaultWasmPath(): string {
  return join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
}
