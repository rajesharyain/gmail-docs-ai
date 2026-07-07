# Gmail Docs AI — Product & Architecture Roadmap

This project starts as a clone of PostMail AI's macOS menu-bar app foundation.
The goal is to convert the provider layer from Microsoft Graph to Google
Workspace APIs and then add document/search/storage intelligence on top.

## What Can Be Reused

- Electron menu-bar app shell.
- React popup structure.
- Native macOS notifications.
- Launch-at-login packaging.
- Local settings storage.
- SQLite WASM storage pattern.
- AI provider abstraction and privacy/redaction layer.
- Local intelligence/scoring approach.
- Bulk action and confirmation UX patterns.
- Existing tests and folder organization style.

## What Must Change

- Microsoft OAuth/MSAL must be replaced with Google OAuth.
- Microsoft Graph client must be replaced with Gmail + Drive clients.
- Outlook open links must become Gmail and Drive open links.
- Mail action methods must map to Gmail labels/archive/trash semantics.
- Search must split into mail, attachment, and Drive/document result types.
- Storage cleanup needs Drive quota/file metadata and Gmail attachment metadata.
- Settings copy, docs, bundle identifiers, and user-data paths must become Google-specific.

## API Feasibility

Based on current Google docs:

- Gmail API `users.messages.list` supports a `q` search query similar to the Gmail search box.
- Gmail search can find messages with attachment-style operators such as `has:attachment` and Google file links.
- Gmail message payloads expose MIME parts and attachment IDs; the app can list/download attachments after selecting a message.
- Drive API `files.list` supports search queries and file metadata fields.
- Drive API file metadata can include `size` for binary files and `quotaBytesUsed`, which is useful for storage cleanup.
- Drive API `about.get` can return storage quota information.

Important limitation:

- Google Docs/Sheets/Slides are Drive files, not normal binary Gmail attachments. Search and storage cleanup for those should use Drive APIs directly.

## Proposed Data Model

### Mail Result

- id
- threadId
- sender
- subject
- snippet
- receivedAt
- labels
- hasAttachment
- webLink

### Attachment Result

- messageId
- attachmentId
- filename
- mimeType
- estimatedSize
- sender
- subject
- receivedAt
- localCategory

### Drive File Result

- id
- name
- mimeType
- webViewLink
- owners
- modifiedTime
- size
- quotaBytesUsed
- trashed
- localCategory

### Cleanup Candidate

- source: gmailAttachment, driveFile
- id
- title
- reason
- estimatedBytes
- riskLevel
- recommendedAction
- safeActionOnly

## Milestones

### Milestone 1 — Project Split & Identity

Status: Complete

Deliverables:

- Standalone project folder.
- Independent git repository.
- Package name, bundle id, product name, and README changed.
- Roadmap added.

### Milestone 2 — Google OAuth Foundation

Complexity: Medium to High

Deliverables:

- Google desktop OAuth configuration.
- Secure encrypted token cache.
- Sign in/out flow.
- Minimal scopes for read-only Gmail + Drive metadata.
- Settings copy for Google account connection.
- Tests around token/cache behavior where possible.

Notes:

- Gmail scopes can trigger Google verification for public release.
- Start read-only; add modify/trash scopes only when cleanup actions are ready.

### Milestone 3 — Gmail Provider

Complexity: High

Deliverables:

- Fetch unread/recent Gmail messages.
- Map Gmail messages to the existing inbox state.
- Support Gmail search using `q`.
- Detect messages with attachments.
- Open Gmail message in browser.
- Archive/trash/mark-read mappings, behind confirmations.

### Milestone 4 — Attachment Index

Complexity: High

Deliverables:

- Parse Gmail MIME parts.
- Extract attachment metadata.
- Add an attachment search result type.
- Download attachment only on demand.
- Local SQLite cache for attachment metadata.

### Milestone 5 — Drive / Docs Provider

Complexity: High

Deliverables:

- Search Drive files.
- Separate Google Docs/Sheets/Slides from binary files.
- Retrieve file metadata: name, MIME type, owner, modified time, size/quota.
- Open Drive files.
- Optional move-to-trash action with confirmation.

### Milestone 6 — Unified Search UI

Complexity: Medium to High

Deliverables:

- Search tab with result lanes:
  - Mail
  - Attachments
  - Docs / Drive
- Filters for sender, type, size, date, owner.
- Keyboard-accessible result actions.
- No heavy AI UI; show intelligence as small signals.

### Milestone 7 — Storage Cleanup

Complexity: High

Deliverables:

- Largest Drive files view.
- Large Gmail attachment candidates.
- Old/large cleanup suggestions.
- Safe actions:
  - open
  - move Drive file to trash
  - open containing email
  - label/archive Gmail message
- No irreversible deletes in v1.

### Milestone 8 — Document Intelligence

Complexity: Medium to High

Deliverables:

- Local document categorization:
  - invoices
  - contracts
  - resumes
  - tax
  - travel
  - identity
  - screenshots
  - archives
- Optional cloud classification only for low-confidence metadata.
- Privacy gate reused from PostMail AI.

### Milestone 9 — Packaging, Verification, Release

Complexity: Medium

Deliverables:

- Rename all remaining PostMail/Outlook/Microsoft copy.
- Package verifier updated.
- Manual Google OAuth pass.
- Gmail search pass.
- Drive search pass.
- Cleanup action pass.
- Release checklist.

## Recommended Next Step

Do not start with cleanup actions.

Start with Google OAuth and read-only Gmail/Drive metadata access. Once sign-in
and read-only search work reliably, add actions carefully.

