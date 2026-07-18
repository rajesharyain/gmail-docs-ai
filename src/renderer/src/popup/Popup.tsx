import { useEffect, useMemo, useRef, useState } from 'react'
import { buildInboxBriefing } from '../../../shared/briefing'
import { classifyEmail } from '../../../shared/mailIntelligence'
import type {
  EmailActionKind,
  EmailSummary,
  InboxState,
  InboxStats,
  MailCategory,
  RuleAction,
  RuleSuggestion,
  SenderRule,
  Settings
} from '../../../shared/types'
import { CategoryDrawer } from './CategoryDrawer'
import { groupEmails, type EmailGroup, type ListItem } from './grouping'
import {
  ArchiveIcon,
  CheckCheckIcon,
  CheckIcon,
  ChevronRightIcon,
  FilmIcon,
  ImageIcon,
  InboxIcon,
  LogOutIcon,
  MailIcon,
  MailOpenIcon,
  MenuIcon,
  MoreHorizontalIcon,
  PowerIcon,
  RefreshCwIcon,
  SearchIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SectionIcon,
  SquareCheckIcon,
  SquareMinusIcon,
  StarIcon,
  Trash2Icon,
  VolumeXIcon,
  XIcon
} from './Icons'
import { buildAttentionSections, buildSections, sectionPeek, type AttentionSection, type InboxSection } from './sections'
import { SettingsPanel } from './SettingsPanel'

type EmailActionHandler = (email: EmailSummary, action: EmailActionKind) => void
type RuleActionHandler = (email: EmailSummary, action: RuleAction) => void
/** Row clicks select in select mode; Cmd/Ctrl-click always selects and turns select mode on (Finder convention). */
type SelectHandler = (id: string, opts: { viaModifier: boolean }) => void
type PreviewRequest = { email: EmailSummary; anchorY: number }

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
  isHighPriority,
  onRuleAction,
  onEmailAction
}: {
  email: EmailSummary
  isHighPriority: boolean
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
        <MoreHorizontalIcon size={14} />
      </button>
      {open && (
        <div className="row-menu-list" role="menu">
          {isHighPriority && (
            <button
              type="button"
              role="menuitem"
              className="row-menu-item row-menu-item-done"
              onClick={() => {
                onEmailAction(email, 'done')
                setOpen(false)
              }}
            >
              <CheckCheckIcon size={13} /> Done
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="row-menu-item"
            onClick={() => {
              window.notifier.openEmail(email.id)
              setOpen(false)
            }}
          >
            <MailOpenIcon size={13} /> Open
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
              <CheckIcon size={13} /> Mark as read
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
            <ArchiveIcon size={13} /> Archive
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
            <Trash2Icon size={13} /> Delete
          </button>
          <div className="menu-divider" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="row-menu-item"
            onClick={() => {
              onRuleAction(email, 'important')
              setOpen(false)
            }}
          >
            <StarIcon size={13} /> Mark sender important
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
            <VolumeXIcon size={13} /> Mute sender
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
  onSelectRow,
  onPreview,
  exiting = false
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
  onPreview: (request: PreviewRequest) => void
  exiting?: boolean
}) {
  const insight = classifyEmail(email, senderRules)
  const unread = !email.isRead
  const signal = primaryInsightLabel(insight)
  const isHighPriority = insight.attentionLevel === 'urgent' || insight.attentionLevel === 'important' || insight.deadline.hasDeadline

  const handleRowClick = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      onSelectRow(email.id, { viaModifier: true })
      return
    }
    if (selectMode) onSelectRow(email.id, { viaModifier: false })
    else onPreview({ email, anchorY: e.clientY })
  }

  const handleRowKeyDown = (e: React.KeyboardEvent) => {
    if (selectMode && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      onSelectRow(email.id, { viaModifier: false })
      return
    }
    if (!selectMode && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      onPreview({ email, anchorY: window.innerHeight / 2 })
    }
  }

  return (
    <article
      className={`email-card ${showInsights ? `priority-${insight.priority} category-${insight.category}` : ''} ${
        indented ? 'email-row-indented' : ''
      } ${selected ? 'email-card-selected' : ''} ${exiting ? 'email-card-exiting' : ''}`}
      title={signal ? `${signal.label}: ${insight.reasons.slice(0, 3).join(', ')}` : undefined}
    >
      <div
        className="email-row"
        onClick={handleRowClick}
        onKeyDown={handleRowKeyDown}
        role={selectMode ? 'checkbox' : 'button'}
        aria-checked={selectMode ? selected : undefined}
        tabIndex={0}
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
          <RowMenu email={email} isHighPriority={isHighPriority} onRuleAction={onRuleAction} onEmailAction={onEmailAction} />
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
  onSelectRow,
  onPreview,
  exitingIds
}: {
  group: EmailGroup
  showInsights: boolean
  senderRules: SenderRule[]
  onRuleAction: RuleActionHandler
  onEmailAction: EmailActionHandler
  selectMode: boolean
  selectedIds: Set<string>
  onSelectRow: SelectHandler
  onPreview: (request: PreviewRequest) => void
  exitingIds: Set<string>
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
          <ChevronRightIcon size={14} />
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
              onPreview={onPreview}
              exiting={exitingIds.has(e.id)}
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
  onSelectRow,
  onPreview,
  exitingIds
}: {
  item: ListItem
  showInsights: boolean
  senderRules: SenderRule[]
  onRuleAction: RuleActionHandler
  onEmailAction: EmailActionHandler
  selectMode: boolean
  selectedIds: Set<string>
  onSelectRow: SelectHandler
  onPreview: (request: PreviewRequest) => void
  exitingIds: Set<string>
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
      onPreview={onPreview}
      exitingIds={exitingIds}
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
      onPreview={onPreview}
      exiting={exitingIds.has(item.email.id)}
    />
  )
}

function SectionBlock({
  section,
  showInsights,
  senderRules,
  onRuleAction,
  onEmailAction,
  onSectionAction,
  selectMode,
  selectedIds,
  onSelectRow,
  onPreview,
  exitingIds
}: {
  section: InboxSection
  showInsights: boolean
  senderRules: SenderRule[]
  onRuleAction: RuleActionHandler
  onEmailAction: EmailActionHandler
  onSectionAction: (ids: string[], action: EmailActionKind) => void
  selectMode: boolean
  selectedIds: Set<string>
  onSelectRow: SelectHandler
  onPreview: (request: PreviewRequest) => void
  exitingIds: Set<string>
}) {
  const [open, setOpen] = useState(!section.defaultCollapsed)
  const bodyId = `section-${section.category}`
  const peek = sectionPeek(section.items)
  const sectionEmailIds = useMemo(() => {
    const ids: string[] = []
    for (const item of section.items) {
      if (item.kind === 'group') ids.push(...item.emails.map((e) => e.id))
      else ids.push(item.email.id)
    }
    return ids
  }, [section.items])

  const isLowPriority = section.category === 'promotions' || section.category === 'noise'

  return (
    <div className={`inbox-section inbox-section-${section.category}`}>
      <div className="section-header-row">
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
          <SectionIcon icon={section.icon} size={13} className="section-icon" />
          <span className="section-label">
            {section.newCount > 0 && <span className="new-dot" aria-hidden />}
            {section.label}
          </span>
          <span className="section-count">{section.emailCount}</span>
        </button>
        {sectionEmailIds.length > 0 && (
          <span className="section-actions" onClick={(e) => e.stopPropagation()}>
            {isLowPriority ? (
              <button
                type="button"
                className="section-action-btn"
                title={`Mark all ${section.label} as read`}
                onClick={() => onSectionAction(sectionEmailIds, 'markRead')}
              >
                <CheckIcon size={11} /> All read
              </button>
            ) : (
              <button
                type="button"
                className="section-action-btn section-action-done"
                title={`Done with all ${section.label}`}
                onClick={() => onSectionAction(sectionEmailIds, 'done')}
              >
                <CheckCheckIcon size={11} /> All done
              </button>
            )}
          </span>
        )}
      </div>
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
              onPreview={onPreview}
              exitingIds={exitingIds}
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
  onSectionAction,
  selectMode,
  selectedIds,
  onSelectRow,
  onPreview,
  exitingIds
}: {
  section: AttentionSection
  showInsights: boolean
  senderRules: SenderRule[]
  onRuleAction: RuleActionHandler
  onEmailAction: EmailActionHandler
  onSectionAction: (ids: string[], action: EmailActionKind) => void
  selectMode: boolean
  selectedIds: Set<string>
  onSelectRow: SelectHandler
  onPreview: (request: PreviewRequest) => void
  exitingIds: Set<string>
}) {
  const [open, setOpen] = useState(!section.defaultCollapsed)
  const bodyId = `attention-section-${section.kind}`
  const peek = sectionPeek(section.items)
  const sectionEmailIds = useMemo(() => {
    const ids: string[] = []
    for (const item of section.items) {
      if (item.kind === 'group') ids.push(...item.emails.map((e) => e.id))
      else ids.push(item.email.id)
    }
    return ids
  }, [section.items])

  return (
    <div className={`attention-section attention-section-${section.kind}`}>
      <div className="section-header-row">
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
          <SectionIcon icon={section.icon} size={13} className="section-icon" />
          <span className="section-label">
            {section.newCount > 0 && <span className="new-dot" aria-hidden />}
            {section.label}
          </span>
          <span className="section-count">{section.emailCount}</span>
        </button>
        {sectionEmailIds.length > 0 && (
          <span className="section-actions" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="section-action-btn section-action-done"
              title={`Done with all ${section.label}`}
              onClick={() => onSectionAction(sectionEmailIds, 'done')}
            >
              ✔ All done
            </button>
          </span>
        )}
      </div>
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
              onPreview={onPreview}
              exitingIds={exitingIds}
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

function EmailPreviewPopover({
  email,
  anchorY,
  senderRules,
  fullMessagePreview,
  onClose,
  onOpenExternal,
  onEmailAction,
  onRuleAction
}: {
  email: EmailSummary
  anchorY: number
  senderRules: SenderRule[]
  fullMessagePreview: boolean
  onClose: () => void
  onOpenExternal: () => void
  onEmailAction: EmailActionHandler
  onRuleAction: RuleActionHandler
}) {
  const insight = classifyEmail(email, senderRules)
  const signal = primaryInsightLabel(insight)
  const [fullBody, setFullBody] = useState<string | null>(null)
  const [loadingBody, setLoadingBody] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (!fullMessagePreview) return
    setLoadingBody(true)
    window.notifier.fetchEmailBody(email.id).then((body) => {
      setFullBody(body || null)
      setLoadingBody(false)
    }).catch(() => setLoadingBody(false))
  }, [email.id, fullMessagePreview])

  const isHighPriority = insight.attentionLevel === 'urgent' || insight.attentionLevel === 'important' || insight.deadline.hasDeadline

  return (
    <div className="message-preview-layer" onMouseDown={onClose}>
      <aside
        className="message-preview"
        aria-label={`Preview: ${email.subject}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden />
        <header className="message-preview-header">
          <span
            className="message-preview-avatar"
            aria-hidden
            style={{ background: `hsl(${avatarHue(email.senderAddress)} 42% 46%)` }}
          >
            {initials(email.sender)}
          </span>
          <span className="message-preview-title">
            <span className="message-preview-sender">{email.sender}</span>
            <span className="message-preview-address">{email.senderAddress || 'Unknown address'}</span>
          </span>
          <button type="button" className="icon-btn preview-close" onClick={onClose} aria-label="Close preview">
            <XIcon size={14} />
          </button>
        </header>

        <div className="message-preview-body">
          <div className="message-preview-meta">
            <time dateTime={email.receivedAt}>{timeLabel(email.receivedAt)}</time>
            <span className={`cat-chip cat-chip-${insight.category}`}>{insight.label}</span>
            {signal && <span className={`insight-chip insight-chip-${signal.tone}`}>{signal.label}</span>}
          </div>
          <h2 className="message-preview-subject">{email.subject}</h2>
          {fullMessagePreview && loadingBody && (
            <div className="message-preview-text">
              <span className="skeleton skeleton-line-full" />
              <span className="skeleton skeleton-line-medium" />
              <span className="skeleton skeleton-line-full" />
              <span className="skeleton skeleton-line-short" />
            </div>
          )}
          {fullMessagePreview && fullBody ? (
            <div className="message-preview-full">{fullBody}</div>
          ) : (
            <p className="message-preview-text">{email.preview || 'No preview available.'}</p>
          )}
          {insight.reasons.length > 0 && (
            <ul className="message-preview-reasons">
              {insight.reasons.slice(0, 2).map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
        </div>

        <footer className="message-preview-actions">
          {isHighPriority ? (
            <button
              type="button"
              className="small-action-btn done-action-btn"
              onClick={() => onEmailAction(email, 'done')}
            >
              Done
            </button>
          ) : (
            <button type="button" className="small-action-btn" onClick={() => onEmailAction(email, 'archive')}>
              Archive
            </button>
          )}
          <button type="button" className="small-action-btn primary-action-btn" onClick={onOpenExternal}>
            Open in Gmail
          </button>
          {!email.isRead && (
            <button type="button" className="small-action-btn" onClick={() => onEmailAction(email, 'markRead')}>
              Mark read
            </button>
          )}
          <button
            type="button"
            className="small-action-btn"
            onClick={() => {
              onRuleAction(email, 'important')
              onClose()
            }}
          >
            Important
          </button>
        </footer>
      </aside>
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function StatsCards({ stats }: { stats: InboxStats }) {
  return (
    <div className="stats-cards">
      <div className="stat-card">
        <span className="stat-icon"><InboxIcon size={15} /></span>
        <span className="stat-info">
          <span className="stat-value">{stats.totalEmails.toLocaleString()}</span>
          <span className="stat-label">Total</span>
        </span>
      </div>
      <div className="stat-card">
        <span className="stat-icon"><Trash2Icon size={15} /></span>
        <span className="stat-info">
          <span className="stat-value">{stats.trashEmails.toLocaleString()}</span>
          <span className="stat-label">Trash</span>
        </span>
      </div>
      <div className="stat-card">
        <span className="stat-icon"><ImageIcon size={15} /></span>
        <span className="stat-info">
          <span className="stat-value">{stats.imageAttachments.toLocaleString()}</span>
          <span className="stat-label">{formatSize(stats.imageSize)}</span>
        </span>
      </div>
      <div className="stat-card">
        <span className="stat-icon"><FilmIcon size={15} /></span>
        <span className="stat-info">
          <span className="stat-value">{stats.videoAttachments.toLocaleString()}</span>
          <span className="stat-label">{formatSize(stats.videoSize)}</span>
        </span>
      </div>
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
        <SearchIcon size={14} />
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
        <XIcon size={14} />
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
        <MoreHorizontalIcon size={15} />
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
              <CheckCheckIcon size={13} /> Mark all read
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
            <SettingsIcon size={13} /> Settings
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
              <LogOutIcon size={13} /> Sign out
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
            <PowerIcon size={13} /> Quit
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
  const [preview, setPreview] = useState<PreviewRequest | null>(null)
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set())
  const [inboxStats, setInboxStats] = useState<InboxStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const statsLoaded = useRef(false)

  useEffect(() => {
    window.notifier.getInboxState().then(setState)
    return window.notifier.onInboxState(setState)
  }, [])

  useEffect(() => {
    if (statsLoaded.current) return
    if (state?.status === 'ok') {
      statsLoaded.current = true
      setStatsLoading(true)
      window.notifier.fetchInboxStats()
        .then(setInboxStats)
        .catch(() => {})
        .finally(() => setStatsLoading(false))
    }
  }, [state?.status])

  // Selections are scoped to whatever list is currently on screen — switching
  // between Inbox/Settings clears them and drops out of select mode rather
  // than risk a stale count referring to emails from a different view.
  useEffect(() => {
    setSelectMode(false)
    setSelectedIds(new Set())
    setDrawerOpen(false)
    setPreview(null)
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
    // Clean up exiting IDs for emails already removed from state
    setExitingIds((prev) => {
      if (prev.size === 0) return prev
      const next = new Set([...prev].filter((id) => currentIds.has(id)))
      return next.size === prev.size ? prev : next
    })
    if (preview && !currentIds.has(preview.email.id)) setPreview(null)
  }, [state, view, preview])

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
    setPreview(null)
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
      if (preview) {
        setPreview(null)
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
  }, [drawerOpen, preview, searchOpen, selectMode])

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
  // Gmail, across all mail, not just the cached unread page.
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
    // Trigger exit animation for actions that remove the email from the list
    if (action === 'archive' || action === 'delete' || action === 'done') {
      setExitingIds((prev) => new Set([...prev, email.id]))
    }
    if (action === 'markRead') window.notifier.markEmailRead(email.id)
    else if (action === 'archive') window.notifier.archiveEmail(email.id)
    else if (action === 'done') window.notifier.doneEmail(email.id)
    else window.notifier.deleteEmail(email.id)
    setPreview(null)
  }

  const onSelectRow: SelectHandler = (id, { viaModifier }) => {
    if (viaModifier && !selectMode) setSelectMode(true)
    setPreview(null)
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearSelection = () => setSelectedIds(new Set())

  const showPreview = (request: PreviewRequest) => {
    if (drawerOpen) setDrawerOpen(false)
    setPreview(request)
  }

  // What "Select all" applies to depends on what's on screen right now:
  // search > category filter > full visible inbox.
  const selectableIds = isSearching
    ? searchResults.map((e) => e.id)
    : categoryFilter
      ? categoryFilteredEmails.map((e) => e.id)
      : visibleEmails.map((e) => e.id)
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id))
  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(selectableIds))
  }

  const handleBulkAction = (action: EmailActionKind) => {
    if (selectedIds.size === 0) return
    if (!confirmMailboxAction(action, selectedIds.size)) return
    // Trigger exit animation for actions that remove emails from the list
    if (action === 'archive' || action === 'delete' || action === 'done') {
      setExitingIds((prev) => new Set([...prev, ...selectedIds]))
    }
    window.notifier.bulkEmailAction([...selectedIds], action)
    clearSelection()
  }

  const handleSectionAction = (ids: string[], action: EmailActionKind) => {
    if (ids.length === 0) return
    if (!confirmMailboxAction(action, ids.length)) return
    // Trigger exit animation for actions that remove emails from the list
    if (action === 'archive' || action === 'delete' || action === 'done') {
      setExitingIds((prev) => new Set([...prev, ...ids]))
    }
    window.notifier.bulkEmailAction(ids, action)
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
              <MenuIcon size={15} />
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
                <SearchIcon size={15} />
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
                {selectMode ? <SquareMinusIcon size={15} /> : <SquareCheckIcon size={15} />}
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
                <RefreshCwIcon size={15} />
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
            <XIcon size={15} />
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

      {view === 'inbox' && !isSearching && !categoryFilter && !signedOut && (inboxStats || statsLoading) && (
        inboxStats ? <StatsCards stats={inboxStats} /> : (
          <div className="stats-cards">
            {[0, 1, 2, 3].map((i) => (
              <div className="stat-card" key={i}>
                <span className="skeleton skeleton-icon" />
                <span className="stat-info">
                  <span className="skeleton skeleton-stat-value" />
                  <span className="skeleton skeleton-stat-label" />
                </span>
              </div>
            ))}
          </div>
        )
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
              <XIcon size={12} />
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
          <SectionIcon icon={allSections.find((s) => s.category === categoryFilter)?.icon ?? 'inbox'} size={13} />
          <span>{allSections.find((s) => s.category === categoryFilter)?.label ?? categoryFilter}</span>
          <button
            type="button"
            className="category-filter-clear"
            onClick={() => setCategoryFilter(null)}
            aria-label="Clear category filter"
            title="Clear filter"
          >
            <XIcon size={10} />
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
                {serverResults ? 'No matches in Gmail.' : 'No local matches yet — press Enter to search Gmail.'}
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
                onPreview={showPreview}
                exiting={exitingIds.has(email.id)}
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
                onPreview={showPreview}
                exiting={exitingIds.has(email.id)}
              />
            ))
          )}
        </main>
      ) : (
      <main className="email-list" aria-label="Unread email list">
        {signedOut ? (
          <div className="empty empty-signin">
            <span className="empty-icon empty-shield" aria-hidden>
              <ShieldCheckIcon size={20} />
            </span>
            <p className="empty-heading">Connect your Gmail account</p>
            <p className="empty-sub">Sign-in opens in your browser. Your session is encrypted on this Mac.</p>
            <button
              className="signin-btn google-signin-btn"
              onClick={() => window.notifier.signIn()}
              disabled={status === 'signing-in'}
              aria-label="Sign in with Google"
            >
              <span className="google-g" aria-hidden>G</span>
              {status === 'signing-in' ? 'Waiting for browser…' : 'Sign in with Google'}
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
                onSectionAction={handleSectionAction}
                selectMode={selectMode}
                selectedIds={selectedIds}
                onSelectRow={onSelectRow}
                onPreview={showPreview}
                exitingIds={exitingIds}
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
                onSectionAction={handleSectionAction}
                selectMode={selectMode}
                selectedIds={selectedIds}
                onSelectRow={onSelectRow}
                onPreview={showPreview}
                exitingIds={exitingIds}
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
                onPreview={showPreview}
                exitingIds={exitingIds}
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
                onSectionAction={handleSectionAction}
                selectMode={selectMode}
                selectedIds={selectedIds}
                onSelectRow={onSelectRow}
                onPreview={showPreview}
                exitingIds={exitingIds}
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
                onPreview={showPreview}
                exitingIds={exitingIds}
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
              title="Done (mark read + archive)"
              aria-label={`Mark ${selectedIds.size} selected as done`}
              disabled={selectedIds.size === 0}
              onClick={() => handleBulkAction('done')}
            >
              <CheckCheckIcon size={15} />
            </button>
            <button
              className="icon-btn"
              title="Mark read"
              aria-label={`Mark ${selectedIds.size} selected read`}
              disabled={selectedIds.size === 0}
              onClick={() => handleBulkAction('markRead')}
            >
              <CheckIcon size={15} />
            </button>
            <button
              className="icon-btn"
              title="Archive"
              aria-label={`Archive ${selectedIds.size} selected`}
              disabled={selectedIds.size === 0}
              onClick={() => handleBulkAction('archive')}
            >
              <ArchiveIcon size={15} />
            </button>
            <button
              className="icon-btn"
              title="Delete"
              aria-label={`Delete ${selectedIds.size} selected`}
              disabled={selectedIds.size === 0}
              onClick={() => handleBulkAction('delete')}
            >
              <Trash2Icon size={15} />
            </button>
            <button
              className="icon-btn"
              title="Cancel selection"
              aria-label="Cancel selection"
              onClick={exitSelectMode}
            >
              <XIcon size={15} />
            </button>
          </span>
        </div>
      )}
      {preview && view === 'inbox' && !selectMode && (
        <EmailPreviewPopover
          email={preview.email}
          anchorY={preview.anchorY}
          senderRules={senderRules}
          fullMessagePreview={settings?.rules.fullMessagePreview ?? true}
          onClose={() => setPreview(null)}
          onOpenExternal={() => {
            window.notifier.openEmail(preview.email.id)
            setPreview(null)
          }}
          onEmailAction={handleEmailAction}
          onRuleAction={addSenderRule}
        />
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
