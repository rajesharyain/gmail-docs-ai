# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Gmail Docs AI is a macOS menu-bar Electron app for Gmail, attachments, and Google Drive document cleanup. It runs as a background companion (no Dock icon) with a popup window for the inbox UI. Built on electron-vite with React in the renderer and TypeScript throughout.

## Commands

```bash
npm run dev          # Start in development mode (electron-vite dev)
npm run build        # Build all targets (electron-vite build)
npm run typecheck    # Check types for both node and web tsconfigs
npm test             # Run all tests (node --import tsx --test)
node --import tsx --test tests/someFile.test.ts  # Run a single test file
npm run package      # Package unsigned macOS .dmg/.zip
```

## Architecture

**Process model (Electron):**
- `src/main/` — Main process: auth, sync, IPC handlers, AI classification, storage
- `src/preload/` — Context bridge exposing `window.notifier` API to renderer
- `src/renderer/src/popup/` — React popup UI (single entry: `popup.html`)
- `src/shared/` — Types and pure logic shared across all processes

**Key flows:**
- `AuthManager` (`auth.ts`) handles Google OAuth desktop flow with PKCE, using a local HTTP callback server. Tokens are encrypted via `safeStorage` and cached in `userData`.
- `SyncEngine` (`sync.ts`) polls Gmail via the Graph module, tracks seen/opened IDs, and triggers notifications + AI classification on new mail.
- `ipcRouter.ts` registers all IPC handlers; `ipcValidation.ts` sanitizes all renderer inputs.
- `InboxStateStore` (`inboxStateStore.ts`) holds the canonical inbox state; changes are broadcast to the renderer via `windows.broadcastState`.
- The renderer subscribes to state via `window.notifier.onInboxState(cb)` and can invoke actions (signIn, openEmail, archive, etc.) through the preload bridge.

**AI subsystem (`src/main/ai/`):**
- Opt-in cloud classification with multiple provider backends (Groq, GitHub Models, Gemini).
- `ClassificationService` orchestrates classification + insight prompts.
- `AICredentialStore` persists provider API keys encrypted on disk.
- Privacy modes control what email data is sent externally (`metadata-only`, `message-preview`, `message-body`).

**Local intelligence (`src/shared/mailIntelligence.ts`):**
- Heuristic email categorization (important, finance, jobs, noise, etc.) runs without any AI provider.
- Sender rules, attention scoring, deadline/risk detection are all local-first.

**Storage:**
- `store.ts` — JSON file store for settings, inbox cache, seen IDs (in `app.getPath('userData')`)
- `storage/sqliteStore.ts` — sql.js-backed SQLite for classification cache (WASM, no native deps)

## TypeScript Configuration

Two tsconfigs split the codebase:
- `tsconfig.node.json` — main + preload + shared (target ES2022, module ESNext, no DOM)
- `tsconfig.web.json` — renderer + shared + preload types (includes DOM libs, jsx: react-jsx)

Both use `moduleResolution: "bundler"`. The root `tsconfig.json` is a project-references file only.

## Testing

Tests use Node's built-in test runner (`node:test`) with `tsx` for TypeScript. No external test framework. Test files live in `tests/` and import from `src/` directly. The `tests/helpers.ts` module provides an `email()` factory for creating test `EmailSummary` objects.

## Environment

Requires a `.env` file (copy from `.env.example`) with:
- `GOOGLE_CLIENT_ID` — Google Cloud desktop OAuth client ID (required for sign-in)
- `GOOGLE_CLIENT_SECRET` — optional for desktop apps using PKCE

## IPC Contract

All IPC channel names are defined in `src/shared/types.ts` as the `IPC` const object. The renderer uses `ipcRenderer.send` for fire-and-forget actions and `ipcRenderer.invoke` for request/response. All inputs from the renderer are validated in `ipcValidation.ts` before reaching handlers.
