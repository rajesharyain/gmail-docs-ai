import { useEffect, useState } from 'react'
import type {
  AICredentialStatus,
  AIConnectionTestResult,
  AIProviderId,
  AIPrivacyMode,
  AISettings,
  InboxRulesSettings,
  MailCategory,
  RuleAction,
  RuleMatchType,
  SenderRule,
  Settings
} from '../../../shared/types'
import { MoreHorizontalIcon, StarIcon, VolumeXIcon } from './Icons'

const INTERVALS = [1, 2, 5, 10, 15, 30, 60]

/**
 * Placeholder options shown before a connection test returns the provider's
 * real catalog. Replaced by `AIConnectionTestResult.models` once available —
 * hand-picking model ids here would drift as providers add/retire models.
 */
const DEFAULT_MODELS: Record<Exclude<AIProviderId, 'none'>, string[]> = {
  'github-models': ['openai/gpt-4.1-mini', 'openai/gpt-4.1'],
  gemini: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
  groq: ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile'],
  custom: ['']
}

type ConnectionState = 'unavailable' | 'no-credential' | 'ready' | 'testing' | 'connected' | 'failed'

const CONNECTION_COPY: Record<ConnectionState, { label: string; dot: string }> = {
  unavailable: { label: 'Secure storage unavailable', dot: 'error' },
  'no-credential': { label: 'No credential saved', dot: 'idle' },
  ready: { label: 'Credential saved — click Test', dot: 'idle' },
  testing: { label: 'Connecting…', dot: 'pending' },
  connected: { label: 'Connected', dot: 'ok' },
  failed: { label: 'Connection failed — retry Test', dot: 'error' }
}

const CATEGORY_OPTIONS: Array<{ value: MailCategory; label: string }> = [
  { value: 'important', label: 'Important' },
  { value: 'finance', label: 'Finance' },
  { value: 'jobs', label: 'Jobs' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'work', label: 'Work' },
  { value: 'home', label: 'Home' },
  { value: 'promotions', label: 'Promo' },
  { value: 'noise', label: 'Noise' },
  { value: 'other', label: 'Inbox' }
]


export function SettingsPanel() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [credentialStatus, setCredentialStatus] = useState<AICredentialStatus | null>(null)
  const [credentialInput, setCredentialInput] = useState('')
  const [connectionResult, setConnectionResult] = useState<AIConnectionTestResult | null>(null)
  const [fetchedModels, setFetchedModels] = useState<string[] | null>(null)
  const [credentialBusy, setCredentialBusy] = useState(false)
  const [testingConnection, setTestingConnection] = useState(false)
  const [newRuleValue, setNewRuleValue] = useState('')
  const [newRuleMatchType, setNewRuleMatchType] = useState<RuleMatchType>('sender')
  const [newRuleAction, setNewRuleAction] = useState<RuleAction>('important')

  useEffect(() => {
    window.notifier.getSettings().then(setSettings)
  }, [])

  const providerForStatus =
    settings?.ai.provider && settings.ai.provider !== 'none' ? settings.ai.provider : 'github-models'

  useEffect(() => {
    window.notifier.getAICredentialStatus(providerForStatus).then(setCredentialStatus)
    setCredentialInput('')
    setConnectionResult(null)
    setFetchedModels(null)
  }, [providerForStatus])

  // A credential saved in an earlier session is already trustworthy — quietly
  // re-verify it in the background so returning users don't have to click
  // Test again just to unlock the model picker below. A brand-new credential
  // still requires the explicit Test button (nothing to re-verify yet).
  useEffect(() => {
    if (!settings?.ai.enabled || !credentialStatus?.hasCredential || connectionResult) return
    let cancelled = false
    setTestingConnection(true)
    window.notifier
      .testAIConnection()
      .then((result) => {
        if (cancelled) return
        setConnectionResult(result)
        if (result.ok && result.models && result.models.length > 0) setFetchedModels(result.models)
      })
      .finally(() => {
        if (!cancelled) setTestingConnection(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credentialStatus?.hasCredential, providerForStatus, settings?.ai.enabled])

  if (!settings) return <div className="settings-loading">Loading…</div>

  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    window.notifier.setSettings(patch)
  }

  const updateAI = (patch: Partial<AISettings>) => {
    const ai = {
      ...settings.ai,
      ...patch,
      privacy: patch.privacy ? { ...settings.ai.privacy, ...patch.privacy } : settings.ai.privacy,
      providerConfig: patch.providerConfig
        ? { ...settings.ai.providerConfig, ...patch.providerConfig }
        : settings.ai.providerConfig
    }

    update({ ai })
  }

  const updateRules = (patch: Partial<InboxRulesSettings>) => {
    update({ rules: { ...settings.rules, ...patch } })
  }

  const toggleCategoryVisible = (category: MailCategory, hidden: boolean) => {
    updateRules({
      hiddenCategories: hidden
        ? [...settings.rules.hiddenCategories, category]
        : settings.rules.hiddenCategories.filter((c) => c !== category)
    })
  }

  const addSenderRule = () => {
    const value = newRuleValue.trim().toLowerCase()
    if (!value) return
    const exists = settings.rules.senderRules.some(
      (r) => r.action === newRuleAction && r.matchType === newRuleMatchType && r.value === value
    )
    setNewRuleValue('')
    if (exists) return
    const rule: SenderRule = {
      id: crypto.randomUUID(),
      action: newRuleAction,
      matchType: newRuleMatchType,
      value,
      createdAt: new Date().toISOString()
    }
    updateRules({ senderRules: [...settings.rules.senderRules, rule] })
  }

  const removeSenderRule = (id: string) => {
    updateRules({ senderRules: settings.rules.senderRules.filter((r) => r.id !== id) })
  }

  const selectedProvider = settings.ai.provider === 'none' ? 'github-models' : settings.ai.provider
  const providerModels =
    fetchedModels && fetchedModels.length > 0 ? fetchedModels : DEFAULT_MODELS[selectedProvider]
  const selectedModel = settings.ai.model ?? providerModels[0]
  const canSaveCredential = settings.ai.enabled && credentialInput.trim().length > 0 && !credentialBusy
  const canTestConnection = settings.ai.enabled && Boolean(credentialStatus?.hasCredential) && !testingConnection

  const saveCredential = async () => {
    if (!canSaveCredential) return
    setCredentialBusy(true)
    try {
      const status = await window.notifier.saveAICredential(selectedProvider, credentialInput)
      setCredentialStatus(status)
      setCredentialInput('')
      setConnectionResult(null)
    } finally {
      setCredentialBusy(false)
    }
  }

  const clearCredential = async () => {
    setCredentialBusy(true)
    try {
      const status = await window.notifier.clearAICredential(selectedProvider)
      setCredentialStatus(status)
      setCredentialInput('')
      setConnectionResult(null)
    } finally {
      setCredentialBusy(false)
    }
  }

  const testConnection = async () => {
    if (!canTestConnection) return
    setTestingConnection(true)
    try {
      const result = await window.notifier.testAIConnection()
      setConnectionResult(result)
      if (result.ok && result.models && result.models.length > 0) {
        setFetchedModels(result.models)
      }
    } finally {
      setTestingConnection(false)
    }
  }

  const connectionState: ConnectionState =
    credentialStatus?.storageAvailable === false
      ? 'unavailable'
      : testingConnection
        ? 'testing'
        : connectionResult?.ok
          ? 'connected'
          : connectionResult
            ? 'failed'
            : credentialStatus?.hasCredential
              ? 'ready'
              : 'no-credential'
  const isConnected = connectionState === 'connected'

  return (
    <div className="settings">
      <label className="setting-row">
        <span className="setting-label">
          Check for new mail
          <span className="setting-hint">How often the inbox is polled</span>
        </span>
        <select
          className="setting-select"
          value={settings.pollIntervalMinutes}
          onChange={(e) => update({ pollIntervalMinutes: Number(e.target.value) })}
        >
          {INTERVALS.map((m) => (
            <option key={m} value={m}>
              {m === 60 ? 'Every hour' : `Every ${m} min`}
            </option>
          ))}
        </select>
      </label>

      <label className="setting-row">
        <span className="setting-label">
          Notifications
          <span className="setting-hint">Alert when new mail arrives</span>
        </span>
        <input
          type="checkbox"
          className="setting-toggle"
          checked={settings.notificationsEnabled}
          onChange={(e) => update({ notificationsEnabled: e.target.checked })}
        />
      </label>

      {settings.notificationsEnabled && (
        <label className="setting-row setting-row-compact">
          <span className="setting-label">
            Notify for low-priority mail too
            <span className="setting-hint">
              Off (recommended): only urgent and important mail triggers a notification. On: also notify for
              newsletters and other low-attention mail.
            </span>
          </span>
          <input
            type="checkbox"
            className="setting-toggle"
            checked={settings.rules.notifyLowAttention}
            onChange={(e) => updateRules({ notifyLowAttention: e.target.checked })}
          />
        </label>
      )}

      <label className="setting-row">
        <span className="setting-label">
          Open emails in
          <span className="setting-hint">Opens the exact message in Gmail</span>
        </span>
        <select
          className="setting-select"
          value={settings.openIn}
          onChange={(e) => update({ openIn: e.target.value as Settings['openIn'] })}
        >
          <option value="web">Gmail on the web</option>
          <option value="desktop">Default browser</option>
        </select>
      </label>

      <label className="setting-row">
        <span className="setting-label">
          Launch at login
          <span className="setting-hint">Applies to the installed app, not `npm run dev`</span>
        </span>
        <input
          type="checkbox"
          className="setting-toggle"
          checked={settings.launchAtLogin}
          onChange={(e) => update({ launchAtLogin: e.target.checked })}
        />
      </label>

      <section className="settings-section settings-section-stacked" aria-labelledby="rules-settings-title">
        <div className="settings-section-header">
          <span className="setting-label" id="rules-settings-title">
            Rules & Preferences
            <span className="setting-hint">Local overrides — always on, no provider required.</span>
          </span>
        </div>

        <label className="setting-row setting-row-compact">
          <span className="setting-label">
            Smart sections
            <span className="setting-hint">Group the inbox by category (Important, Finance, …) instead of one flat list.</span>
          </span>
          <input
            type="checkbox"
            className="setting-toggle"
            checked={settings.rules.sectionsEnabled}
            onChange={(e) => updateRules({ sectionsEnabled: e.target.checked })}
          />
        </label>

        <div className="setting-field">
          <span className="setting-field-label">Visible categories</span>
          <div className="feature-toggle-row" aria-label="Category visibility">
            {CATEGORY_OPTIONS.map((option) => {
              const hidden = settings.rules.hiddenCategories.includes(option.value)
              return (
                <label key={option.value} className="feature-chip">
                  <input
                    type="checkbox"
                    checked={!hidden}
                    onChange={(e) => toggleCategoryVisible(option.value, !e.target.checked)}
                  />
                  <span>{option.label}</span>
                </label>
              )
            })}
          </div>
        </div>

        <div className="setting-field ai-field-wide">
          <span className="setting-field-label">Sender rules</span>
          {settings.rules.senderRules.length === 0 ? (
            <p className="setting-hint rule-empty-hint">
              No rules yet — use <MoreHorizontalIcon size={11} /> on any email to mark a sender important or mute them.
            </p>
          ) : (
            <ul className="sender-rule-list">
              {settings.rules.senderRules.map((rule) => (
                <li key={rule.id} className="sender-rule-item">
                  <span className={`rule-badge rule-badge-${rule.action}`}>
                    {rule.action === 'important' ? <><StarIcon size={11} /> Important</> : <><VolumeXIcon size={11} /> Muted</>}
                  </span>
                  <span className="rule-value">{rule.value}</span>
                  <button
                    type="button"
                    className="small-action-btn"
                    onClick={() => removeSenderRule(rule.id)}
                    aria-label={`Remove rule for ${rule.value}`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="rule-add-row">
            <select
              className="setting-select"
              value={newRuleAction}
              onChange={(e) => setNewRuleAction(e.target.value as RuleAction)}
              aria-label="New rule action"
            >
              <option value="important">Mark important</option>
              <option value="mute">Mute</option>
            </select>
            <select
              className="setting-select"
              value={newRuleMatchType}
              onChange={(e) => setNewRuleMatchType(e.target.value as RuleMatchType)}
              aria-label="New rule match type"
            >
              <option value="sender">Sender address</option>
              <option value="domain">Domain</option>
            </select>
            <input
              className="setting-input"
              value={newRuleValue}
              placeholder={newRuleMatchType === 'domain' ? 'example.com' : 'name@example.com'}
              onChange={(e) => setNewRuleValue(e.target.value)}
              aria-label="New rule value"
            />
            <button type="button" className="small-action-btn primary-action-btn" onClick={addSenderRule}>
              Add
            </button>
          </div>
        </div>
      </section>

      <section className="settings-section settings-section-stacked" aria-labelledby="ai-settings-title">
        <div className="settings-section-header">
          <span className="setting-label" id="ai-settings-title">
            Gmail Docs AI
            <span className="setting-hint">
              Opt-in cloud classification for the emails local rules can't confidently place.
            </span>
          </span>
          <label className="setting-switch">
            <span className="sr-only">Enable Gmail Docs AI intelligence</span>
            <input
              type="checkbox"
              className="setting-toggle"
              checked={settings.ai.enabled}
              onChange={(e) =>
                updateAI({
                  enabled: e.target.checked,
                  provider: e.target.checked ? selectedProvider : 'none'
                })
              }
            />
            <span className="settings-pill">{settings.ai.enabled ? 'On' : 'Off'}</span>
          </label>
        </div>

        <div className={`ai-settings-grid ${settings.ai.enabled ? '' : 'ai-settings-muted'}`}>
          <label className="setting-field">
            <span className="setting-field-label">Provider</span>
            <select
              className="setting-select"
              value={selectedProvider}
              disabled={!settings.ai.enabled}
              onChange={(e) => {
                const provider = e.target.value as Exclude<AIProviderId, 'none'>
                updateAI({
                  provider,
                  model: DEFAULT_MODELS[provider][0] || null
                })
              }}
            >
              <option value="github-models">GitHub Models</option>
              <option value="gemini">Gemini</option>
              <option value="groq">Groq</option>
              <option value="custom">Custom endpoint</option>
            </select>
          </label>

          <label className="setting-field">
            <span className="setting-field-label">
              Model
              {!isConnected && <span className="setting-hint"> 🔒 Unlocks once connected</span>}
            </span>
            {selectedProvider === 'custom' ? (
              <input
                className="setting-input"
                value={settings.ai.model ?? ''}
                disabled={!settings.ai.enabled || !isConnected}
                placeholder={isConnected ? 'your-model-id' : CONNECTION_COPY[connectionState].label}
                onChange={(e) => updateAI({ model: e.target.value })}
              />
            ) : (
              <select
                className="setting-select"
                value={isConnected ? selectedModel : '__locked__'}
                disabled={!settings.ai.enabled || !isConnected}
                onChange={(e) => updateAI({ model: e.target.value })}
              >
                {isConnected ? (
                  providerModels.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))
                ) : (
                  <option value="__locked__">{CONNECTION_COPY[connectionState].label}</option>
                )}
              </select>
            )}
          </label>

          {selectedProvider === 'custom' && (
            <label className="setting-field ai-field-wide">
              <span className="setting-field-label">Endpoint</span>
              <input
                className="setting-input"
                value={settings.ai.providerConfig.customEndpoint ?? ''}
                disabled={!settings.ai.enabled}
                placeholder="https://api.example.com/chat"
                onChange={(e) =>
                  updateAI({
                    providerConfig: {
                      ...settings.ai.providerConfig,
                      customEndpoint: e.target.value
                    }
                  })
                }
              />
            </label>
          )}

          <label className="setting-field ai-field-wide">
            <span className="setting-field-label">Credential</span>
            <input
              className="setting-input"
              type="password"
              value={credentialInput}
              disabled={!settings.ai.enabled || credentialBusy}
              placeholder={credentialStatus?.hasCredential ? 'Saved securely' : 'Paste provider token'}
              onChange={(e) => setCredentialInput(e.target.value)}
            />
          </label>

          <div className="credential-actions ai-field-wide">
            <button
              type="button"
              className="small-action-btn"
              disabled={!canSaveCredential}
              onClick={saveCredential}
            >
              Save
            </button>
            <button
              type="button"
              className="small-action-btn"
              disabled={!settings.ai.enabled || !credentialStatus?.hasCredential || credentialBusy}
              onClick={clearCredential}
            >
              Remove
            </button>
            <button
              type="button"
              className="small-action-btn primary-action-btn"
              disabled={!canTestConnection}
              onClick={testConnection}
            >
              {testingConnection ? 'Testing…' : 'Test'}
            </button>
            <span className="credential-status">
              <span className={`status-dot status-dot-${CONNECTION_COPY[connectionState].dot}`} aria-hidden />
              {connectionState === 'connected' && connectionResult?.modelCount
                ? `Connected · ${connectionResult.modelCount} models`
                : CONNECTION_COPY[connectionState].label}
            </span>
          </div>

          <label className="setting-field">
            <span className="setting-field-label">Privacy</span>
            <select
              className="setting-select"
              value={settings.ai.privacy.mode}
              disabled={!settings.ai.enabled}
              onChange={(e) =>
                updateAI({
                  privacy: { ...settings.ai.privacy, mode: e.target.value as AIPrivacyMode }
                })
              }
            >
              <option value="metadata-only">Metadata only</option>
              <option value="message-preview">Message preview</option>
              <option value="message-body">Message body</option>
            </select>
          </label>

          <label className="setting-row setting-row-compact ai-field-wide">
            <span className="setting-label">
              External processing
              <span className="setting-hint">Allow selected email data to leave this Mac.</span>
            </span>
            <input
              type="checkbox"
              className="setting-toggle"
              checked={settings.ai.privacy.allowExternalProcessing}
              disabled={!settings.ai.enabled}
              onChange={(e) =>
                updateAI({
                  privacy: { ...settings.ai.privacy, allowExternalProcessing: e.target.checked }
                })
              }
            />
          </label>

          <label className="setting-row setting-row-compact ai-field-wide">
            <span className="setting-label">
              Redact sensitive data
              <span className="setting-hint">Mask likely secrets before an AI request.</span>
            </span>
            <input
              type="checkbox"
              className="setting-toggle"
              checked={settings.ai.privacy.redactSensitiveData}
              disabled={!settings.ai.enabled}
              onChange={(e) =>
                updateAI({
                  privacy: { ...settings.ai.privacy, redactSensitiveData: e.target.checked }
                })
              }
            />
          </label>
        </div>

        <label className="setting-row setting-row-compact">
          <span className="setting-label">
            Cloud classification
            <span className="setting-hint">
              Ask the provider to categorize only the emails local rules can't confidently place.
            </span>
          </span>
          <input
            type="checkbox"
            className="setting-toggle"
            checked={settings.ai.classificationEnabled}
            disabled={!settings.ai.enabled}
            onChange={(e) => updateAI({ classificationEnabled: e.target.checked })}
          />
        </label>

        <p className="setting-hint ai-settings-note">
          Credentials are encrypted locally. Connection tests do not send mailbox content.
        </p>
        {connectionResult && (
          <p className={`connection-result ${connectionResult.ok ? 'connection-ok' : 'connection-error'}`}>
            {connectionResult.message}
          </p>
        )}
      </section>
    </div>
  )
}
