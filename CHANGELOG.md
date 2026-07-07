# Changelog

All notable changes to PostMail AI will be documented in this file.

## v2.0.0 - 2026-07-06

### Added

- Added local, rule-based inbox intelligence: category scoring (Important, Finance, Jobs, Calendar, Work, Home, Promotions, Noise) from keyword and sender-domain signals, with a confidence score for each result.
- Added smart inbox sections that group the popup by category in a fixed priority order, with low-value categories (Promo, Noise) collapsed by default; toggleable back to a flat chronological list.
- Added sender rules: mark a sender or domain as always-important or muted, inline from a per-email menu or in Settings.
- Added opt-in cloud classification: for the emails local rules can't confidently place, ask a connected provider (Groq, GitHub Models, or Gemini) to categorize it — never for every email, always behind the existing privacy redaction gate, with results cached locally.
- Added a live model catalog to the AI provider connection test, replacing a hardcoded list.

### Changed

- Muting a sender now affects the unread count and notifications, not just what's displayed in the popup.
- Narrowed the AI settings surface to the one feature that's actually implemented (cloud classification), removing four feature-flag toggles and a database table that never did anything.

### Improved

- Fixed accessibility issues found in a live QA pass: a contrast shortfall on low-priority category pills, a touch-target size violation on the row actions menu, and a missing focus outline on interactive menu items.

### Notes

- This release folds in all of the v2 AI-foundation work: local inbox intelligence, category-based sections, sender rules, and one narrow opt-in cloud AI feature.
- See `docs/v2-roadmap.md` for the full gap analysis and milestone history behind this release.

## v1.0.0 - 2026-07-05

### Added

- Created the initial open-source Electron, React, TypeScript macOS app.
- Added Microsoft OAuth sign-in with MSAL and encrypted token cache storage.
- Added Microsoft Graph inbox sync for unread mail.
- Added native macOS notifications for newly arrived mail.
- Added click-to-open support for Microsoft mail on the web and the Outlook desktop app.
- Added smart grouping for common sender categories and high-volume senders.
- Added settings for poll interval, notifications, launch at login, and open target.
- Added a true macOS menu-bar Tray app experience.
- Added real PNG Tray assets for reliable menu-bar rendering.
- Added package verification and release packaging scripts.
- Added focused logic tests for grouping, IPC validation, and inbox state.

### Changed

- Renamed the product to PostMail AI.
- Reworked the main process into focused services for windows, IPC, state, notifications, and email opening.
- Replaced row-click opening with an explicit Open action on each email.
- Improved popup layout, spacing, focus states, contrast, and accessibility labels.
- Clarified Microsoft mailbox support for Microsoft 365, Outlook.com, Hotmail, Live, and MSN mailboxes.

### Improved

- Added sync retry backoff after failures.
- Added wake-from-sleep refresh handling with quiet notification behavior.
- Added lightweight privacy-conscious logging.
- Hardened macOS packaging configuration with signing and notarization scaffolding.

### Notes

- Yahoo Mail, Gmail, and other non-Microsoft mailbox providers are not supported in v1.0.0.
- Local builds are unsigned unless packaged with a Developer ID certificate.
