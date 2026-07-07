# Security Policy

Gmail Docs AI handles Google OAuth tokens and email metadata, so security
reports are welcome.

Please do not open public issues for token handling, OAuth redirect, IPC,
storage, or packaged-app security concerns. Share a private report with enough
detail to reproduce the problem.

## Current Data Handling

- Google tokens are stored in the app user-data directory and encrypted with
  Electron `safeStorage` when available.
- Email cache data is stored locally on the Mac.
- AI provider credentials are stored locally and are not shown back in the UI.
- Cloud AI processing is opt-in and guarded by privacy settings.
