import type { MailCategory } from '../../../shared/types'
import type { InboxSection } from './sections'

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

/**
 * Overlay panel, not a layout push — the popup never resizes. Selecting a
 * category filters the inbox in place; it doesn't navigate anywhere, so the
 * filter can stay active after the drawer itself is dismissed.
 */
export function CategoryDrawer({
  open,
  onClose,
  accountName,
  accountEmail,
  sections,
  totalCount,
  selectedCategory,
  onSelectCategory,
  onManageCategories,
  onAddCategory
}: {
  open: boolean
  onClose: () => void
  accountName: string | null
  accountEmail: string | null
  sections: InboxSection[]
  totalCount: number
  selectedCategory: MailCategory | null
  onSelectCategory: (category: MailCategory | null) => void
  onManageCategories: () => void
  onAddCategory: () => void
}) {
  return (
    <>
      <div
        className={`drawer-backdrop ${open ? 'drawer-backdrop-open' : ''}`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        className={`category-drawer ${open ? 'category-drawer-open' : ''}`}
        aria-label="Categories"
        aria-hidden={!open}
      >
        <div className="drawer-account">
          <span className="drawer-avatar" aria-hidden>
            {accountName ? initials(accountName) : '?'}
          </span>
          <span className="drawer-account-info">
            <span className="drawer-account-name">{accountName ?? 'Not signed in'}</span>
            {accountEmail && <span className="drawer-account-email">{accountEmail}</span>}
          </span>
          <button className="drawer-chevron" type="button" aria-label="Switch account" title="Switch account">
            ⌄
          </button>
        </div>

        <div className="drawer-divider" />

        <div className="drawer-section-header">
          <span className="drawer-section-title">Categories</span>
          <button
            className="drawer-add-btn"
            type="button"
            onClick={onAddCategory}
            aria-label="Add category"
            title="Add category"
          >
            +
          </button>
        </div>

        <nav className="drawer-cat-list">
          <button
            type="button"
            className={`drawer-cat-row ${selectedCategory === null ? 'drawer-cat-row-selected' : ''}`}
            onClick={() => onSelectCategory(null)}
          >
            <span className="drawer-cat-icon" aria-hidden>
              📥
            </span>
            <span className="drawer-cat-name">All Mail</span>
            <span className="drawer-cat-count">{totalCount}</span>
          </button>
          {sections.map((section) => (
            <button
              key={section.category}
              type="button"
              className={`drawer-cat-row drawer-cat-${section.category} ${
                selectedCategory === section.category ? 'drawer-cat-row-selected' : ''
              }`}
              onClick={() => onSelectCategory(section.category)}
            >
              <span className="drawer-cat-icon" aria-hidden>
                {section.icon}
              </span>
              <span className="drawer-cat-name">{section.label}</span>
              <span className="drawer-cat-count">{section.emailCount}</span>
            </button>
          ))}
        </nav>

        <div className="drawer-spacer" />
        <div className="drawer-divider" />

        <button className="drawer-footer-item" type="button" onClick={onManageCategories}>
          ⚙ Manage Categories
        </button>
      </aside>
    </>
  )
}
