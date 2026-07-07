# Gmail Docs AI

A macOS menu-bar assistant for Gmail, attachments, and Google Drive cleanup.

This project was cloned from the PostMail AI Electron/React/macOS foundation.
The product direction is different: instead of only watching unread mail, Gmail
Docs AI should help people find document-heavy email, search attachments and
Drive files, understand what is consuming storage, and clean up safely.

## Product Goal

Answer three questions quickly:

- Which Gmail messages or attachments matter right now?
- Where is the document I am looking for?
- Which files/messages are consuming the most space, and what can I safely move or delete?

## Planned Provider Scope

The current app shell is cloned from the Outlook version. The Gmail provider is
not implemented yet.

The intended Google integrations are:

- **Gmail API** for mail search, message metadata, labels, attachments, and message actions.
- **Google Drive API** for Drive/Docs search, file metadata, size/quota fields, and moving files to trash.
- **Google OAuth desktop flow** with local encrypted token storage.

Important product note: Gmail search can find messages with attachments and
Google-file links, but searching the actual contents/metadata of Drive files is
a Drive API responsibility. For Google Docs/Sheets/Slides, the app should treat
Drive as a first-class source instead of pretending those are normal email
attachments.

## Planned Core Features

- Gmail unread/new mail awareness in the menu bar.
- Search tab with separate result lanes:
  - Mail
  - Attachments
  - Google Docs / Drive files
- Attachment-focused search: filename, MIME type, sender, date, and containing message.
- Drive document search: name, MIME type, owner, modified time, size/quota fields.
- Storage cleanup view:
  - largest Drive files
  - largest Gmail attachment messages where detectable
  - old large files
  - duplicate-looking files by name/size
- Safe cleanup actions:
  - move Drive file to trash
  - open containing Gmail message
  - open Drive file
  - apply Gmail label
  - archive/delete Gmail message only after confirmation
- Local intelligence:
  - categorize documents: invoice, contract, resume, tax, travel, identity, screenshot, archive
  - flag likely important documents
  - explain why a file/message is suggested for cleanup

## Google Cloud Setup

Planned setup will require a Google Cloud OAuth client for a desktop app.

Expected APIs:

- Gmail API
- Google Drive API

Expected scopes will be finalized during implementation. Start minimal:

- Gmail read/search scope for message discovery.
- Gmail modify scope only if the app performs labels/archive/delete.
- Drive metadata/read scope for file search.
- Drive file write/trash scope only if cleanup actions are enabled.

Gmail scopes are sensitive/restricted and may require Google OAuth verification
before public release. This is a real launch consideration, not just an
engineering detail.

## Current Status

Completed:

- Project cloned into a standalone repository.
- macOS Electron/React menu-bar foundation retained.
- Package identity changed to `Gmail Docs AI`.
- Separate roadmap added in `docs/gmail-docs-ai-roadmap.md`.

Not yet done:

- Google OAuth.
- Gmail provider.
- Drive provider.
- Attachment indexing.
- Document/Drive search tab.
- Storage cleanup UI.
- Google-specific packaging verification beyond renamed app identity.

## Development

```bash
npm install
npm run dev
```

The cloned app still contains Microsoft/Outlook implementation code until the
provider migration milestones replace it.

## Verification

```bash
npm run typecheck
npm test
npm run build
```

