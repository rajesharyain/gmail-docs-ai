import { useEffect, useMemo, useRef, useState } from 'react'
import { buildInboxBriefing } from '../../../shared/briefing'
import { classifyEmail } from '../../../shared/mailIntelligence'
import type {
  EmailActionKind,
  EmailSummary,
  InboxState,
  MailCategory,
  RuleAction,
  RuleSuggestion,
  SenderRule,
  Settings
} from '../../../shared/types'
import { CategoryDrawer } from './CategoryDrawer'
import { groupEmails, type EmailGroup, type ListItem } from './grouping'
import { buildAttentionSections, buildSections, sectionPeek, type AttentionSection, type InboxSection } from './sections'
import { SettingsPanel } from './SettingsPanel'

type EmailActionHandler = (email: EmailSummary, action: EmailActionKind) => void
type RuleActionHandler = (email: EmailSummary, action: RuleAction) => void
/** Row clicks select in select mode; Cmd/Ctrl-click always selects and turns select mode on (Finder convention). */
type SelectHandler = (id: string, opts: { viaModifier: boolean }) => void

function timeLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

/** Deterministic accent per sender so avatars are stable between opens. */
function avatarHue(sender: string): number {
  let h = 0
  for (let i = 0; i < sender.length; i++) h = (h * 31 + sender.charCodeAt(i)) % 360
  return h
}

function primaryInsightLabel(insight: ReturnType<typeof classifyEmail>): { label: string; tone: string } | null {
  if (insight.risk.level === 'high' || insight.risk.level === 'medium') return { label: 'Use caution', tone: 'risk' }
  if (insight.deadline.label) return { label: insight.deadline.label, tone: 'deadline' }
  if (insight.attentionLevel === 'urgent') return { label: 'Needs attention', tone: 'urgent' }
  if (insight.nextAction === 'reply') return { label: 'Reply likely', tone: 'action' }
  if (insight.nextAction === 'review') return { label: 'Review likely', tone: 'action' }
  if (insight.nextAction === 'pay') return { label: 'Payment likely', tone: 'action' }
  if (insight.nextAction === 'schedule') return { label: 'Scheduling', tone: 'action' }
  if (insight.nextAction === 'archive' || insight.nextAction === 'ignore') return { label: 'Low attention', tone: 'quiet' }
  return null
}

function RowMenu({
  email,
  onRuleAction,
  onEmailAction
}: {
  email: EmailSummary
  onRuleAction: RuleActionHandler
  onEmailAction: EmailActionHandler
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  return (
    // Clicks anywhere in the kebab (button or menu) never bubble to the row,
    // so opening this menu or choosing an item can't also toggle selection.
    <div className="row-menu" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="icon-btn row-menu-btn"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`More actions for ${email.sender}`}
        title="More actions"
      >
        ⋯
      </button>
      {open && (
        <div className="row-menu-list" role="menu">
          <button
            type="button"
            role="menuitem"
            className="row-menu-item"
            onClick={() => {
              window.notifier.openEmail(email.id)
              setOpen(false)
            }}
          >
            📧 Open
          </button>
          {!email.isRead && (
            <button
              type="button"
              role="menuitem"
              className="row-menu-item"
              onClick={() => {
                onEmailAction(email, 'markRead')
                setOpen(false)
              }}
            >
              ✓ Mark as read
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="row-menu-item"
            onClick={() => {
              onEmailAction(email, 'archive')
              setOpen(false)
            }}
          >
            🗄 Archive
          </button>
          <button
            type="button"
            role="menuitem"
            className="row-menu-item"
            onClick={() => {
              onEmailAction(email, 'delete')
              setOpen(false)
            }}
          >
            🗑 Delete
          </button>
          <button
            type="button"
            role="menuitem"
            className="row-menu-item"
            onClick={() => {
              onRuleAction(email, 'important')
              setOpen(false)
            }}
          >
            ⭐ Mark sender important
          </button>
          <button
            type="button"
            role="menuitem"
            className="row-menu-item"
            onClick={() => {
              onRuleAction(email, 'mute')
              setOpen(false)
            }}
          >
            🔇 Mute sender
          </button>
        </div>
      )}
    </div>
  )
}

function EmailRow({
  email,
  indented = false,
  showInsights,
  senderRules,
  onRuleAction,
  onEmailAction,
  selectMode,
  selected,
  onSelectRow
}: {
  email: EmailSummary
  indented?: boolean
  showInsights: boolean
  senderRules: SenderRule[]
  onRuleAction: RuleActionHandler
  onEmailAction: EmailActionHandler
  selectMode: boolean
  selected: boolean
  onSelectRow: SelectHandler
}) {
  const insight = classifyEmail(email, senderRules)
  const unread = !email.isRead
  const signal = primaryInsightLabel(insight)

  const handleRowClick = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      onSelectRow(email.id, { viaModifier: true })
      return
    }
    if (selectMode) onSelectRow(email.id, { viaModifier: false })
  }

  const handleRowKeyDown = (e: React.KeyboardEvent) => {
    if (!selectMode) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelectRow(email.id, { viaModifier: false })
    }
  }

  return (
    <article
      className={`email-card ${showInsights ? `priority-${insight.priority} category-${insight.category}` : ''} ${
        indented ? 'email-row-indented' : ''
      } ${selected ? 'email-card-selected' : ''}`}
      title={signal ? `${signal.label}: ${insight.reasons.slice(0, 3).join(', ')}` : undefined}
    >
      <div
        className="email-row"
        onClick={handleRowClick}
        onKeyDown={handleRowKeyDown}
        role={selectMode ? 'checkbox' : undefined}
        aria-checked={selectMode ? selected : undefined}
        tabIndex={selectMode ? 0 : undefined}
        aria-label={`${email.sender}, ${email.subject}, ${insight.label}, ${timeLabel(email.receivedAt)}${
          email.isNew ? ', new' : ''
        }`}
      >
        <span className="row-avatar" aria-hidden style={!selectMode ? { background: `hsl(${avatarHue(email.senderAddress)} 42% 46%)` } : undefined}>
          {selectMode ? <span className={`row-check ${selected ? 'row-check-on' : ''}`} /> : initials(email.sender)}
        </span>
        <span className="email-main">
          <span className="email-top">
            {unread && (
              <button
                type="button"
                className={`unread-dot ${insight.priority === 'high' ? 'unread-dot-amber' : ''} ${
                  email.isNew ? 'unread-dot-new' : ''
                }`}
                onClick={(e) => {
                  e.stopPropagation()
                  onEmailAction(email, 'markRead')
                }}
                title="Mark read"
                aria-label={`Mark read: ${email.subject}`}
              />
            )}
            <span className="email-sender">{email.sender}</span>
            {showInsights && (
              <span className={`cat-chip cat-chip-${insight.category}`}>{insight.label}</span>
            )}
            {signal && (
              <span className={`insight-chip insight-chip-${signal.tone}`}>{signal.label}</span>
            )}
          </span>
          <span className="email-subject">{email.subject}</span>
          <span className="email-preview">{email.preview || 'No preview available'}</span>
        </span>
        <span className="email-side">
          <time className="email-time" dateTime={email.receivedAt}>
            {timeLabel(email.receivedAt)}
          </time>
          <RowMenu email={email} onRuleAction={onRuleAction} onEmailAction={onEmailAction} />
        </span>
      </div>
    </article>
  )
}

function GroupRow({
  group,
  showInsights,
  senderRules,
  onRuleAction,
  onEmailAction,
  selectMode,
  selectedIds,
  onSelectRow
}: {
  group: EmailGroup
  showInsights: boolean
  senderRules: SenderRule[]
  onRuleAction: RuleActionHandler
  onEmailAction: EmailActionHandler
  selectMode: boolean
  selectedIds: Set<string>
  onSelectRow: SelectHandler
}) {
  const [open, setOpen] = useState(false)
  const bodyId = `group-${group.key.replace(/[^a-z0-9_-]/gi, '-')}`
  return (
    <div className="group">
      <button
        className="group-header"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={bodyId}
        aria-label={`${open ? 'Collapse' : 'Expand'} ${group.label}, ${group.emails.length} emails${
          group.newCount > 0 ? `, ${group.newCount} new` : ''
        }`}
      >
        <span className={`chevron ${open ? 'chevron-open' : ''}`} aria-hidden>
          ›
        </span>
        <span className="group-label">
          {group.newCount > 0 && <span className="new-dot" aria-hidden />}
          {group.label}
        </span>
        <span className="group-count">{group.emails.length}</span>
        <span className="group-time">{timeLabel(group.newestAt)}</span>
      </button>
      {open && (
        <div className="group-body" id={bodyId}>
          {group.emails.map((e) => (
            <EmailRow
              key={e.id}
              email={e}
              indented
              showInsights={showInsights}
              senderRules={senderRules}
              onRuleAction={onRuleAction}
              onEmailAction={onEmailAction}
              selectMode={selectMode}
              selected={selectedIds.has(e.id)}
              onSelectRow={onSelectRow}
            />
          ))}
        </div>
      )}
      {!open && (
        <div className="group-peek">
          {group.emails.slice(0, 2).map((e) => (
            <span key={e.id} className="peek-line">
              {e.subject}
            </span>
          ))}
          {group.emails.length > 2 && (
            <span className="peek-line peek-more">+{group.emails.length - 2} more</span>
          )}
        </div>
      )}
    </div>
  )
}

function ListItemRow({
  item,
  showInsights,
  senderRules,
  onRuleAction,
  onEmailAction,
  selectMode,
  selectedIds,
  onSelectRow
}: {
  item: ListItem
  showInsights: boolean
  senderRules: SenderRule[]
  onRuleAction: RuleActionHandler
  onEmailAction: EmailActionHandler
  selectMode: boolean
  selectedIds: Set<string>
  onSelectRow: SelectHandler
}) {
  return item.kind === 'group' ? (
    <GroupRow
      group={item}
      showInsights={showInsights}
      senderRules={senderRules}
      onRuleAction={onRuleAction}
      onEmailAction={onEmailAction}
      selectMode={selectMode}
      selectedIds={selectedIds}
      onSelectRow={onSelectRow}
    />
  ) : (
    <EmailRow
      email={item.email}
      showInsights={showInsights}
      senderRules={senderRules}
      onRuleAction={onRuleAction}
      onEmailAction={onEmailAction}
      selectMode={selectMode}
      selected={selectedIds.has(item.email.id)}
      onSelectRow={onSelectRow}
    />
  )
}

function SectionBlock({
  section,
  showInsights,
  senderRules,
  onRuleAction,
  onEmailAction,
  selectMode,
  selectedIds,
  onSelectRow
}: {
  section: InboxSection
  showInsights: boolean
  senderRules: SenderRule[]
  onRuleAction: RuleActionHandler
  onEmailAction: EmailActionHandler
  selectMode: boolean
  selectedIds: Set<string>
  onSelectRow: SelectHandler
}) {
  const [open, setOpen] = useState(!section.defaultCollapsed)
  const bodyId = `section-${section.category}`
  const peek = sectionPeek(section.items)

  return (
    <div className={`inbox-section inbox-section-${section.category}`}>
      <button
        className="section-header"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={bodyId}
        aria-label={`${open ? 'Collapse' : 'Expand'} ${section.label}, ${section.emailCount} emails${
          section.newCount > 0 ? `, ${section.newCount} new` : ''
        }`}
      >
        <span className={`chevron ${open ? 'chevron-open' : ''}`} aria-hidden>
          ›
        </span>
        <span className="section-icon" aria-hidden>
          {section.icon}
        </span>
        <span className="section-label">
          {section.newCount > 0 && <span className="new-dot" aria-hidden />}
          {section.label}
        </span>
        <span className="section-count">{section.emailCount}</span>
      </button>
      {open ? (
        <div className="section-body" id={bodyId}>
          {section.items.map((item) => (
            <ListItemRow
              key={item.kind === 'group' ? item.key : item.email.id}
              item={item}
              showInsights={showInsights}
              senderRules={senderRules}
              onRuleAction={onRuleAction}
              onEmailAction={onEmailAction}
              selectMode={selectMode}
              selectedIds={selectedIds}
              onSelectRow={onSelectRow}
            />
          ))}
        </div>
      ) : (
        <div className="section-peek">
          {peek.map((e) => (
            <span key={e.id} className="peek-line">
              {e.subject}
            </span>
          ))}
          {section.emailCount > peek.length && (
            <span className="peek-line peek-more">+{section.emailCount - peek.length} more</span>
          )}
        </div>
      )}
    </div>
  )
}

function AttentionSectionBlock({
  section,
  showInsights,
  senderRules,
  onRuleAction,
  onEmailAction,
  selectMode,
  selectedIds,
  onSelectRow
}: {
  section: AttentionSection
  showInsights: boolean
  senderRules: SenderRule[]
  onRuleAction: RuleActionHandler
  onEmailAction: EmailActionHandler
  selectMode: boolean
  selectedIds: Set<string>
  onSelectRow: SelectHandler
}) {
  const [open, setOpen] = useState(!section.defaultCollapsed)
  const bodyId = `attention-section-${section.kind}`
  const peek = sectionPeek(section.items)

  return (
    <div className={`attention-section attention-section-${section.kind}`}>
      <button
        className="section-header attention-section-header"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={bodyId}
        aria-label={`${open ? 'Collapse' : 'Expand'} ${section.label}, ${section.emailCount} emails${
          section.newCount > 0 ? `, ${section.newCount} new` : ''
        }`}
      >
        <span className={`chevron ${open ? 'chevron-open' : ''}`} aria-hidden>
          ›
        </span>
        <span className="section-icon" aria-hidden>
          {section.icon}
        </span>
        <span className="section-label">
          {section.newCount > 0 && <span className="new-dot" aria-hidden />}
          {section.label}
        </span>
        <span className="section-count">{section.emailCount}</span>
      </button>
      {open ? (
        <div className="section-body" id={bodyId}>
          {section.items.map((item) => (
            <ListItemRow
              key={item.kind === 'group' ? item.key : item.email.id}
              item={item}
              showInsights={showInsights}
              senderRules={senderRules}
              onRuleAction={onRuleAction}
              onEmailAction={onEmailAction}
              selectMode={selectMode}
              selectedIds={selectedIds}
              onSelectRow={onSelectRow}
            />
          ))}
        </div>
      ) : (
        <div className="section-peek">
          {peek.map((e) => (
            <span key={e.id} className="peek-line">
              {e.subject}
            </span>
          ))}
          {section.emailCount > peek.length && (
            <span className="peek-line peek-more">+{section.emailCount - peek.length} more</span>
          )}
        </div>
      )}
    </div>
  )
}

/** Spotlight-style: slides in under the header, never navigates away from the inbox. */
function InlineSearchBar({
  query,
  onQueryChange,
  onSubmit,
  searching,
  onClose
}: {
  query: string
  onQueryChange: (q: string) => void
  onSubmit: () => void
  searching: boolean
  onClose: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])

  return (
    <div className="search-bar">
      <span className="search-icon" aria-hidden>
        🔍
      </span>
      <input
        ref={ref}
        type="text"
        className="search-input"
        placeholder="Search mail…"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit()
          if (e.key === 'Escape') onClose()
        }}
        aria-label="Search mail"
      />
      {searching && <span className="search-status">Searching…</span>}
      <button
        type="button"
        className="icon-btn search-close"
        onClick={onClose}
        aria-label="Close search"
        title="Close search"
      >
        ✕
      </button>
    </div>
  )
}

/** Header overflow menu: infrequent actions live here so the icon row stays calm. */
function HeaderMenu({
  showMarkAllRead,
  onMarkAllRead,
  onSettings,
  signedIn,
  onSignOut,
  onQuit
}: {
  showMarkAllRead: boolean
  onMarkAllRead: () => void
  onSettings: () => void
  signedIn: boolean
  onSignOut: () => void
  onQuit: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  return (
    <div className="row-menu header-menu" ref={ref}>
      <button
        type="button"
        className="icon-btn"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More"
        title="More"
      >
        ⋯
      </button>
      {open && (
        <div className="row-menu-list header-menu-list" role="menu">
          {showMarkAllRead && (
            <button
              type="button"
              role="menuitem"
              className="row-menu-item"
              onClick={() => {
                onMarkAllRead()
                setOpen(false)
              }}
            >
              🧹 Mark all read
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="row-menu-item"
            onClick={() => {
              onSettings()
              setOpen(false)
            }}
          >
            ⚙ Settings
          </button>
          {signedIn && (
            <button
              type="button"
              role="menuitem"
              className="row-menu-item"
              onClick={() => {
                onSignOut()
                setOpen(false)
              }}
            >
              ↪ Sign out
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="row-menu-item"
            onClick={() => {
              onQuit()
              setOpen(false)
            }}
          >
            ⏻ Quit
          </button>
        </div>
      )}
    </div>
  )
}

export function Popup() {
  const [state, setState] = useState<InboxState | null>(null)
  const [view, setView] = useState<'inbox' | 'settings'>('inbox')
  const [settings, setSettings] = useState<Settings | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [serverResults, setServerResults] = useState<EmailSummary[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<MailCategory | null>(null)
  const [suggestion, setSuggestion] = useState<RuleSuggestion | null>(null)

  useEffect(() => {
    window.notifier.getInboxState().then(setState)
    return window.notifier.onInboxState(setState)
  }, [])

  // Selections are scoped to whatever list is currently on screen — switching
  // between Inbox/Settings clears them and drops out of select mode rather
  // than risk a stale count referring to emails from a different view.
  useEffect(() => {
    setSelectMode(false)
    setSelectedIds(new Set())
    setDrawerOpen(false)
  }, [view])

  // While staying in the inbox view, drop selections for emails that
  // disappeared from a live sync tick (synced away, acted on elsewhere) so
  // the floating toolbar never shows a stale count.
  useEffect(() => {
    if (view !== 'inbox') return
    const currentIds = new Set((state?.emails ?? []).map((e) => e.id))
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => currentIds.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [state, view])

  useEffect(() => {
    window.notifier.getSettings().then(setSettings)
  }, [view])

  // One suggestion at a time, refreshed as actions land (each archive/delete/
  // open may push a sender over the threshold) and when rules change (a new
  // rule retires its own suggestion).
  useEffect(() => {
    if (view !== 'inbox') return
    let cancelled = false
    window.notifier.getRuleSuggestions().then((list) => {
      if (!cancelled) setSuggestion(list[0] ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [state, view, settings])

  const closeSearch = () => {
    setSearchOpen(false)
    setSearchQuery('')
    setServerResults(null)
  }

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (drawerOpen) {
        setDrawerOpen(false)
        return
      }
      if (searchOpen) {
        closeSearch()
        return
      }
      if (selectMode) {
        exitSelectMode()
        return
      }
      window.notifier.togglePopup()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen, searchOpen, selectMode])

  const emails = state?.emails ?? []
  const unread = state?.unreadCount ?? 0
  const status = state?.status ?? 'signed-out'
  const signedOut = status === 'signed-out' || status === 'signing-in'
  const senderRules = useMemo(() => settings?.rules.senderRules ?? [], [settings])
  const hiddenCategories = settings?.rules.hiddenCategories ?? []
  const visibleEmails = useMemo(() => {
    if (hiddenCategories.length === 0) return emails
    return emails.filter((e) => !hiddenCategories.includes(classifyEmail(e, senderRules).category))
  }, [emails, senderRules, hiddenCategories])
  const sectionsEnabled = settings?.rules.sectionsEnabled ?? true
  const items = useMemo(() => groupEmails(visibleEmails), [visibleEmails])
  const { attentionSections, remainingEmails } = useMemo(
    () => buildAttentionSections(visibleEmails, senderRules),
    [visibleEmails, senderRules]
  )
  const { sections: allSections } = useMemo(
    () => buildSections(visibleEmails, senderRules),
    [visibleEmails, senderRules]
  )
  const { sections, otherItems } = useMemo(
    () => buildSections(remainingEmails, senderRules),
    [remainingEmails, senderRules]
  )
  // Priority sections bracket the plain "everything else" inbox flow — Promo
  // and Noise sit below it (collapsed), not above ordinary mail.
  const sectionsAboveInbox = sections.filter((s) => s.category !== 'promotions' && s.category !== 'noise')
  const sectionsBelowInbox = sections.filter((s) => s.category === 'promotions' || s.category === 'noise')
  const showInsights = Boolean(settings?.ai.enabled)

  // "Since you last checked" — reuses the existing isNew/seenIds mechanism,
  // no separate last-opened state needed. null means nothing new to report.
  const briefing = useMemo(() => buildInboxBriefing(visibleEmails, senderRules), [visibleEmails, senderRules])

  // The drawer's category selection is a lens on the inbox, not a page — it
  // narrows the same visibleEmails list to a flat view of just that category.
  const categoryFilteredEmails = useMemo(() => {
    if (!categoryFilter) return []
    return visibleEmails.filter((e) => classifyEmail(e, senderRules).category === categoryFilter)
  }, [visibleEmails, senderRules, categoryFilter])

  // Instant, local — this is all `emails` ever holds (the unread page already
  // fetched), so no IPC round trip needed for this pass.
  const trimmedQuery = searchQuery.trim().toLowerCase()
  const localMatches = useMemo(() => {
    if (!trimmedQuery) return []
    return emails.filter(
      (e) =>
        e.sender.toLowerCase().includes(trimmedQuery) ||
        e.subject.toLowerCase().includes(trimmedQuery) ||
        e.preview.toLowerCase().includes(trimmedQuery)
    )
  }, [emails, trimmedQuery])
  // Explicit trigger only (Enter), not on every keystroke — this one hits
  // Outlook, across all mail, not just the cached unread page.
  const searchResults = useMemo(() => {
    if (!serverResults) return localMatches
    const seen = new Set(serverResults.map((e) => e.id))
    return [...serverResults, ...localMatches.filter((e) => !seen.has(e.id))]
  }, [serverResults, localMatches])
  const isSearching = searchOpen && trimmedQuery.length > 0

  const runServerSearch = async () => {
    const trimmed = searchQuery.trim()
    if (!trimmed) return
    setSearching(true)
    try {
      setServerResults(await window.notifier.searchMail(trimmed))
    } finally {
      setSearching(false)
    }
  }

  const addRule = (action: RuleAction, address: string) => {
    if (!settings) return
    const value = address.toLowerCase()
    const exists = settings.rules.senderRules.some(
      (r) => r.action === action && r.matchType === 'sender' && r.value === value
    )
    if (exists) return
    const rule: SenderRule = {
      id: crypto.randomUUID(),
      action,
      matchType: 'sender',
      value,
      createdAt: new Date().toISOString()
    }
    const rules = { ...settings.rules, senderRules: [...settings.rules.senderRules, rule] }
    setSettings({ ...settings, rules })
    window.notifier.setSettings({ rules })
    // Muting changes what counts as unread and whether it notifies — resync
    // now instead of waiting out the poll interval. Marking important is
    // display-only, so no resync needed.
    if (action === 'mute') window.notifier.syncNow()
  }

  const addSenderRule = (email: EmailSummary, action: RuleAction) => addRule(action, email.senderAddress)

  const acceptSuggestion = (s: RuleSuggestion) => {
    addRule(s.action, s.value)
    // Also mark it dismissed so it never resurfaces, even if the rule is
    // later removed in Settings.
    window.notifier.dismissRuleSuggestion(s.id)
    setSuggestion(null)
  }

  const declineSuggestion = (s: RuleSuggestion) => {
    window.notifier.dismissRuleSuggestion(s.id)
    setSuggestion(null)
  }

  const confirmMailboxAction = (action: EmailActionKind, count: number, email?: EmailSummary) => {
    if (action === 'delete') {
      const target = count === 1 && email ? `"${email.subject}"` : `${count} selected emails`
      return window.confirm(`Move ${target} to Deleted Items?`)
    }
    if (action === 'archive' && count > 1) {
      return window.confirm(`Archive ${count} selected emails?`)
    }
    return true
  }

  const handleEmailAction = (email: EmailSummary, action: EmailActionKind) => {
    if (!confirmMailboxAction(action, 1, email)) return
    if (action === 'markRead') window.notifier.markEmailRead(email.id)
    else if (action === 'archive') window.notifier.archiveEmail(email.id)
    else window.notifier.deleteEmail(email.id)
  }

  const onSelectRow: SelectHandler = (id, { viaModifier }) => {
    if (viaModifier && !selectMode) setSelectMode(true)
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearSelection = () => setSelectedIds(new Set())

  // What "Select all" applies to depends on what's on screen right now —
  // inbox selects everything currently visible after category filters,
  // search selects whatever the search pass is currently rendering.
  const selectableIds = isSearching ? searchResults.map((e) => e.id) : visibleEmails.map((e) => e.id)
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id))
  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(selectableIds))
  }

  const handleBulkAction = (action: EmailActionKind) => {
    if (selectedIds.size === 0) return
    if (!confirmMailboxAction(action, selectedIds.size)) return
    window.notifier.bulkEmailAction([...selectedIds], action)
    clearSelection()
  }

  const accountLabel = state?.account?.email ?? null

  return (
    <div className="popup">
      <div className={`popup-content ${drawerOpen ? 'popup-content-shifted' : ''}`}>
      <header className="popup-header">
        <span className="header-left">
          {view === 'inbox' && !signedOut && (
            <button
              className="icon-btn"
              title={drawerOpen ? 'Close categories' : 'Categories'}
              onClick={() => setDrawerOpen((o) => !o)}
              aria-label={drawerOpen ? 'Close categories' : 'Categories'}
              aria-pressed={drawerOpen}
            >
              ☰
            </button>
          )}
          <span className="title-stack">
            <span className="popup-title">{view === 'settings' ? 'Settings' : 'Inbox'}</span>
            {view === 'inbox' && accountLabel && <span className="account-subtitle">{accountLabel}</span>}
            {view === 'inbox' && status !== 'ok' && (
              <span className={`popup-sub status-${status}`} role="status" aria-live="polite">
                {status === 'syncing' && 'Checking…'}
                {status === 'signing-in' && 'Waiting for browser…'}
                {status === 'signed-out' && 'Signed out'}
                {status === 'error' && 'Sync problem'}
              </span>
            )}
          </span>
        </span>
        {view === 'inbox' ? (
          <span className="header-right">
            {!signedOut && (
              <button
                className="icon-btn"
                title="Search mail"
                onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
                aria-label={searchOpen ? 'Close search' : 'Search mail'}
                aria-pressed={searchOpen}
              >
                🔍
              </button>
            )}
            {!signedOut && (
              <button
                className="icon-btn"
                title={selectMode ? 'Cancel selection' : 'Select emails'}
                onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                aria-label={selectMode ? 'Cancel selection' : 'Select emails'}
                aria-pressed={selectMode}
              >
                {selectMode ? '☒' : '☑'}
              </button>
            )}
            {!signedOut && (
              <button
                className="icon-btn"
                title="Check now"
                onClick={() => window.notifier.syncNow()}
                disabled={status === 'syncing'}
                aria-label="Check now"
              >
                ↻
              </button>
            )}
            {!signedOut && (
              <HeaderMenu
                showMarkAllRead={emails.length > 0}
                onMarkAllRead={() => window.notifier.markAllVisibleRead()}
                onSettings={() => setView('settings')}
                signedIn={Boolean(state?.account)}
                onSignOut={() => window.notifier.signOut()}
                onQuit={() => window.notifier.quit()}
              />
            )}
          </span>
        ) : (
          <button
            className="icon-btn"
            title="Back to inbox"
            onClick={() => setView('inbox')}
            aria-label="Back to inbox"
          >
            ✕
          </button>
        )}
      </header>

      {view === 'inbox' && state?.errorMessage && (
        <div className="error-banner" role="alert">{state.errorMessage}</div>
      )}

      {view === 'inbox' && !isSearching && !categoryFilter && briefing && (
        <div className="inbox-briefing" role="status">
          <p className="inbox-briefing-headline">{briefing.headline}</p>
          {briefing.detail && <p className="inbox-briefing-detail">{briefing.detail}</p>}
        </div>
      )}

      {view === 'inbox' && !isSearching && !categoryFilter && !signedOut && suggestion && (
        <div className="rule-suggestion" role="status">
          <span className="rule-suggestion-text">
            <span className="rule-suggestion-title">
              {suggestion.action === 'mute'
                ? `Mute ${suggestion.senderName}?`
                : `Mark ${suggestion.senderName} as important?`}
            </span>
            <span className="rule-suggestion-reason">{suggestion.reason}</span>
          </span>
          <span className="rule-suggestion-actions">
            <button type="button" className="link-btn" onClick={() => acceptSuggestion(suggestion)}>
              {suggestion.action === 'mute' ? 'Mute' : 'Mark important'}
            </button>
            <button
              type="button"
              className="icon-btn rule-suggestion-close"
              onClick={() => declineSuggestion(suggestion)}
              aria-label="Dismiss suggestion"
              title="Dismiss"
            >
              ✕
            </button>
          </span>
        </div>
      )}

      {view === 'inbox' && searchOpen && (
        <InlineSearchBar
          query={searchQuery}
          onQueryChange={(q) => {
            setSearchQuery(q)
            setServerResults(null)
          }}
          onSubmit={runServerSearch}
          searching={searching}
          onClose={closeSearch}
        />
      )}

      {view === 'inbox' && categoryFilter && !isSearching && (
        <div className="category-filter-pill">
          <span aria-hidden>{allSections.find((s) => s.category === categoryFilter)?.icon ?? '📁'}</span>
          <span>{allSections.find((s) => s.category === categoryFilter)?.label ?? categoryFilter}</span>
          <button
            type="button"
            className="category-filter-clear"
            onClick={() => setCategoryFilter(null)}
            aria-label="Clear category filter"
            title="Clear filter"
          >
            ✕
          </button>
        </div>
      )}

      {view === 'settings' ? (
        <main className="email-list" aria-label="Settings">
          <SettingsPanel />
        </main>
      ) : isSearching ? (
        <main className="email-list" aria-label="Search results">
          {searchResults.length === 0 && !searching ? (
            <div className="empty">
              <p className="empty-sub">
                {serverResults ? 'No matches in Outlook.' : 'No local matches yet — press Enter to search Outlook.'}
              </p>
            </div>
          ) : (
            searchResults.map((email) => (
              <EmailRow
                key={email.id}
                email={email}
                showInsights={false}
                senderRules={senderRules}
                onRuleAction={addSenderRule}
                onEmailAction={handleEmailAction}
                selectMode={selectMode}
                selected={selectedIds.has(email.id)}
                onSelectRow={onSelectRow}
              />
            ))
          )}
        </main>
      ) : categoryFilter ? (
        <main className="email-list" aria-label={`${categoryFilter} emails`}>
          {categoryFilteredEmails.length === 0 ? (
            <div className="empty">
              <span className="empty-icon empty-mail" aria-hidden />
              <p>No emails in this category</p>
            </div>
          ) : (
            categoryFilteredEmails.map((email) => (
              <EmailRow
                key={email.id}
                email={email}
                showInsights={showInsights}
                senderRules={senderRules}
                onRuleAction={addSenderRule}
                onEmailAction={handleEmailAction}
                selectMode={selectMode}
                selected={selectedIds.has(email.id)}
                onSelectRow={onSelectRow}
              />
            ))
          )}
        </main>
      ) : (
      <main className="email-list" aria-label="Unread email list">
        {signedOut ? (
          <div className="empty">
            <span className="empty-icon empty-lock" aria-hidden />
            <p>Connect your Microsoft mailbox</p>
            <p className="empty-sub">Sign-in opens in your browser. Your session is encrypted on this Mac.</p>
            <button
              className="signin-btn"
              onClick={() => window.notifier.signIn()}
              disabled={status === 'signing-in'}
              aria-label="Sign in with Microsoft"
            >
              {status === 'signing-in' ? 'Waiting for browser…' : 'Sign in with Microsoft'}
            </button>
          </div>
        ) : emails.length === 0 ? (
          <div className="empty">
            <span className="empty-icon empty-mail" aria-hidden />
            <p>No unread email</p>
            <p className="empty-sub">New messages will show up here.</p>
          </div>
        ) : visibleEmails.length === 0 ? (
          <div className="empty">
            <span className="empty-icon empty-mail" aria-hidden />
            <p>All caught up</p>
            <p className="empty-sub">
              {emails.length} email{emails.length === 1 ? '' : 's'} hidden by your category filters in Settings.
            </p>
          </div>
        ) : sectionsEnabled ? (
          <>
            {attentionSections.map((section) => (
              <AttentionSectionBlock
                key={section.kind}
                section={section}
                showInsights={showInsights}
                senderRules={senderRules}
                onRuleAction={addSenderRule}
                onEmailAction={handleEmailAction}
                selectMode={selectMode}
                selectedIds={selectedIds}
                onSelectRow={onSelectRow}
              />
            ))}
            {sectionsAboveInbox.map((section) => (
              <SectionBlock
                key={section.category}
                section={section}
                showInsights={showInsights}
                senderRules={senderRules}
                onRuleAction={addSenderRule}
                onEmailAction={handleEmailAction}
                selectMode={selectMode}
                selectedIds={selectedIds}
                onSelectRow={onSelectRow}
              />
            ))}
            {otherItems.map((item) => (
              <ListItemRow
                key={item.kind === 'group' ? item.key : item.email.id}
                item={item}
                showInsights={showInsights}
                senderRules={senderRules}
                onRuleAction={addSenderRule}
                onEmailAction={handleEmailAction}
                selectMode={selectMode}
                selectedIds={selectedIds}
                onSelectRow={onSelectRow}
              />
            ))}
            {sectionsBelowInbox.map((section) => (
              <SectionBlock
                key={section.category}
                section={section}
                showInsights={showInsights}
                senderRules={senderRules}
                onRuleAction={addSenderRule}
                onEmailAction={handleEmailAction}
                selectMode={selectMode}
                selectedIds={selectedIds}
                onSelectRow={onSelectRow}
              />
            ))}
          </>
        ) : (
          <>
            {items.map((item) => (
              <ListItemRow
                key={item.kind === 'group' ? item.key : item.email.id}
                item={item}
                showInsights={showInsights}
                senderRules={senderRules}
                onRuleAction={addSenderRule}
                onEmailAction={handleEmailAction}
                selectMode={selectMode}
                selectedIds={selectedIds}
                onSelectRow={onSelectRow}
              />
            ))}
          </>
        )}
      </main>
      )}

      {selectMode && view !== 'settings' && (
        <div className="floating-toolbar">
          <label className="select-all">
            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
            <span>{selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}</span>
          </label>
          {selectedIds.size > 0 && (
            <button type="button" className="link-btn" onClick={clearSelection}>
              Clear selection
            </button>
          )}
          <span className="floating-toolbar-actions">
            <button
              className="icon-btn"
              title="Mark read"
              aria-label={`Mark ${selectedIds.size} selected read`}
              disabled={selectedIds.size === 0}
              onClick={() => handleBulkAction('markRead')}
            >
              ✓
            </button>
            <button
              className="icon-btn"
              title="Archive"
              aria-label={`Archive ${selectedIds.size} selected`}
              disabled={selectedIds.size === 0}
              onClick={() => handleBulkAction('archive')}
            >
              🗄
            </button>
            <button
              className="icon-btn"
              title="Delete"
              aria-label={`Delete ${selectedIds.size} selected`}
              disabled={selectedIds.size === 0}
              onClick={() => handleBulkAction('delete')}
            >
              🗑
            </button>
            <button
              className="icon-btn"
              title="Cancel selection"
              aria-label="Cancel selection"
              onClick={exitSelectMode}
            >
              ✕
            </button>
          </span>
        </div>
      )}
      </div>

      <CategoryDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        accountName={state?.account?.name ?? null}
        accountEmail={accountLabel}
        sections={allSections}
        totalCount={visibleEmails.length}
        selectedCategory={categoryFilter}
        onSelectCategory={(category) => {
          setCategoryFilter(category)
          setDrawerOpen(false)
        }}
        onManageCategories={() => {
          setView('settings')
          setDrawerOpen(false)
        }}
        onAddCategory={() => {
          setView('settings')
          setDrawerOpen(false)
        }}
      />
    </div>
  )
}
