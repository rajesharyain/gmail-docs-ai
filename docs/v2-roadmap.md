# PostMail AI — v2 Roadmap & Gap Notes

Internal planning doc for the `feature/v2-ai-foundation` branch. Captures what
v1 + the AI-foundation work actually deliver today, what's explicitly out of
scope for now, and the agreed milestone plan for shipping v2 to `develop`.

**Current scope decision:** Microsoft-hosted mailboxes only (M365, Outlook.com,
Hotmail, Live, MSN). Gmail/IMAP support, multi-account, Windows/Linux builds,
and org/admin-policy features are noted below as **deferred** — revisit after
v2 ships, not part of this branch.

## What exists today

- **Core app (v1):** menu-bar Electron app, MSAL PKCE sign-in, Graph inbox
  polling (1–60 min), native notifications for genuinely new mail, rule-based
  sender grouping, explicit "Open" action (web or desktop Outlook), settings
  UI, launch-at-login, signed/notarized packaging.
- **AI foundation:** provider abstraction (`AIProvider` interface),
  Keychain-encrypted credential store per provider, a connection tester for
  GitHub Models / Gemini / Groq / custom endpoint, a privacy/redaction layer
  (`decideAIPrivacy`) that strips secrets/cards/emails/phones before anything
  would leave the machine, and a SQLite store for classification cache plus
  AI audit/privacy records.
- **The thing users actually see:** `classifyEmail` in
  `src/shared/mailIntelligence.ts` assigns a category (Finance, Jobs, Work,
  Promo, Noise, …) and priority, shown as pills/sections in the popup. Local
  rules run first; optional cloud classification only handles low-confidence
  cases and stays silent in the UI.

## Gap found before this session

The Settings UI promises more than the backend delivers: `AIProviderRegistry`
and `MockAIProvider` are never registered in `src/main/index.ts`, no code
calls `summarize()` / `classify()` / `generateReply()` against a real
provider, the SQLite summary cache is never instantiated
(`createAppSqliteStore()` has no caller outside tests), and none of the 5
feature-flag toggles (Summaries, Classification, Replies, Tasks, Translation)
gate any actual behavior. Toggling AI on + testing a connection gives a green
check but produces no summary/classification/reply anywhere.

**Resolution:** narrow scope instead of building out all five features (see
milestone 4 below) — ship local rules well, add cloud classification only for
the emails local rules can't confidently place, and cut the unused pieces
(summary cache, reply/task/translation flags) rather than build backends for
promises that aren't part of this release.

### Fixed this session
Model dropdown in Settings was a hardcoded list with at least one fabricated
model id (`gemini-3.5-flash` doesn't exist). `AIConnectionTester` now returns
the real model catalog from the provider (`AIConnectionTestResult.models`);
`SettingsPanel` uses that list once a Test succeeds and only falls back to a
small hardcoded placeholder list beforehand.

## Deferred (not this branch)

- Gmail/IMAP support — mailbox stays Microsoft-only for v2.
- Multi-account / multi-mailbox.
- Windows/Linux packaging.
- Org features: admin-pushed AI policy, shared/delegated inboxes, MDM config,
  fleet telemetry.
- Auto-update channel (`electron-builder` `publish` config).
- Opt-in crash/error telemetry.
- Business/pricing model (free vs. pro vs. team tiers).

## v2 Milestone Plan

Order matters — each milestone builds on the previous one's data model.
Executing 1 → 3 → 2 → 4 (rules before sectioned UI, since the UI should
respect user overrides from the start).

1. ✅ **Inbox Intelligence Polish** — `classifyEmail` category rules are now
   scored (keyword + sender-domain signals) instead of first-match-wins, with
   a `confidence` score and split strong/weak noise detection (fixed two real
   bugs: no-reply senders no longer drown out legit calendar/transactional
   mail; a bare "offer" no longer misfiles marketing as Jobs). Grouping picked
   up matching named buckets (Slack, Figma, Calendly/Zoom, LinkedIn). Also
   fixed the AI-provider model dropdown to use the live catalog from
   `AIConnectionTester` instead of a hardcoded (partly fabricated) list, and
   locked the Model field in Settings behind a verified connection.
2. ✅ **Smart Inbox UI** — new `sections.ts` buckets the visible inbox by
   category in a fixed priority order (Important, Finance, Jobs, Calendar,
   Work, Home), skipping empty categories so the popover never shows dead
   section headers. Uncategorized "Inbox" mail deliberately never gets its own
   section — it stays the plain recency list, sandwiched between the priority
   sections above and the low-value ones below, so ordinary correspondence
   isn't buried under a redundant header. Promo and Noise render collapsed by
   default (peek + count, same interaction as the existing sender-group
   collapse) to keep the popover from feeling crowded; everything else is
   expanded by default. Section order is fixed by priority, not recency, so
   the layout doesn't reshuffle every sync. Added a "Smart sections" toggle in
   Rules & Preferences (`rules.sectionsEnabled`, default on) that falls back
   to the flat chronological list for anyone who prefers the v1 layout.
3. ✅ **Rules & Preferences** — `Settings.rules` (`InboxRulesSettings`:
   `senderRules` + `hiddenCategories`) persists through the existing
   settings.json path (no new IPC needed — rides `settings:get`/`settings:set`
   like `ai` does). Per-email ⋯ menu in the popup adds "Mark sender important"
   / "Mute sender" rules inline; a new Settings section manages the full list
   plus category-visibility checkboxes. `classifyEmail` now takes
   `senderRules` and short-circuits to `important` on a match; muted senders
   are filtered in `sync.ts` (via `isSenderMuted`) so they're excluded from
   unread count and notifications too, not just the display list — hidden
   categories, by contrast, are display-only (same philosophy as grouping).
   Marking a sender important updates instantly (display-only); muting
   triggers an immediate `syncNow()` so counts/notifications catch up right
   away instead of waiting out the poll interval.
4. ✅ **Optional Cloud Classification** — real `classify()` implementations for
   Groq, GitHub Models (shared OpenAI-compatible chat-completions client), and
   Gemini (`generateContent`), each constructed with the credential store +
   an injectable fetch for testing. `ClassificationService` runs after every
   sync (`SyncEngine.onSyncComplete`): gated on `ai.enabled` +
   `ai.classificationEnabled` + a saved credential, it only considers emails
   whose local `classifyEmail()` confidence is below 0.7, checks the new
   SQLite `ai_classification_cache` first, and only calls the provider for a
   genuine cache miss — routed through the existing `decideAIPrivacy()` gate
   the whole time (finally exercising code that was previously dead). Results
   land on `EmailSummary.cloudCategory`, which `classifyEmail` now prefers
   over the heuristic (but a user's "important" sender rule still wins over
   an AI guess). Silent by design, per plan — no loading spinner; the popup
   just re-renders once a result resolves.
5. ✅ **Performance Cleanup** — went one step further than originally scoped
   here: rather than keep `summaries` + `classification` as two flags and cut
   the other three, cut **all** the unused ones. Nothing ever called
   `summarize()`/`generateReply()` in production (confirmed by grep before
   deleting), so `AIFeatureFlags` (5 booleans, only 1 ever wired to real
   behavior) is gone entirely — `AISettings.classificationEnabled: boolean`
   replaces it, with a single matching toggle in Settings instead of a
   5-chip row. Removed the now-fully-dead `ai_summary_cache` table,
   `upsertAISummary`/`getAISummary`, and the `AISummaryRequest`/
   `AIGenerateReplyRequest`/`AITextResult` types. `MockAIProvider` and the
   `AIProvider` interface now only carry `healthCheck`/`listModels`/
   `classify` — the three that have a real caller or real test value.
6. ✅ **UX QA & Accessibility** — verified in a real browser, not read as
   static CSS: built a temporary harness mounting the actual `Popup`/
   `SettingsPanel` components with a mocked `window.notifier` and realistic
   fixture data (deleted after use, never shipped). Confirmed every
   click handler is on a real `<button>` (full keyboard operability) and
   every new interactive element has a `:focus-visible` rule. Found and
   fixed: a WCAG contrast failure on `.insight-low` pills (4.46:1, needs
   4.5:1 — bumped text alpha 0.48→0.56), a touch-target violation on the row
   ⋯ menu button (22px→24px, WCAG 2.5.8's 24px minimum), a focus-visible
   anti-pattern on the row-menu dropdown items (`outline: none` with only a
   subtle background tint as replacement — restored a proper outline), a
   missing focus ring on `.small-action-btn` (Save/Remove/Test/Add — was
   silently relying on the browser default), and stale Settings copy still
   promising "summaries" after milestone 5 removed that feature.
7. 🔶 **Integration Branch** — [PR #1](https://github.com/rajesharyain/postmail-ai/pull/1)
   merged into `develop` (merge commit `4c348fe`). `develop` typechecks and
   passes all 97 tests post-merge. `npm run package` + `npm run verify:package`
   pass on the actual `.dmg`/`.app`. **Still not done**: a manual interactive
   pass on the packaged app — an attempt to launch the fresh build collided
   with an already-running signed-in instance on the dev machine, so this
   still needs a manual click-through (sign-in, sync, notifications,
   sections, rules, cloud classification with a real key) before cutting a
   release.
8. 🔶 **V2 Packaging & Release** — `package.json` bumped 0.1.0→2.0.0
   (previous release never bumped it, which left artifacts misleadingly
   named `...-0.1.0-...`), `CHANGELOG.md` updated, annotated tag `v2.0.0`
   created on `develop` and pushed, GitHub release created as a **draft**
   (matching the v1.0.0 precedent) targeting `develop` with both
   `.dmg`/`.zip` assets uploaded. **Not done yet**: publishing the draft,
   and merging `develop` into `main` (planned next, workflow TBD).
9. ✅ **Real inbox actions + Outlook-backed search** (post-v2.0.0, not yet
   tagged/released) — closes the "surfacing but never acting" gap every
   prior milestone left open. Scope bumped `Mail.Read` → `Mail.ReadWrite`
   (confirmed the existing `InteractionRequiredAuthError` handling in
   `auth.ts` already covers the resulting re-consent, no new code needed).
   New Graph calls (`markMessageRead`, `archiveMessage`, `deleteMessage`,
   batched `markMessagesRead`, `searchMessages`) sit behind a new
   `EmailActions` handler with immediate optimistic local removal on
   success. Per-email actions: a checkmark for "Mark read" always visible
   next to Open, "Archive"/"Delete" added to the existing ⋯ row menu. A
   header "Mark all read" (🧹) acts only on the currently visible/fetched
   list, never the mailbox's full unread backlog. Search (🔍) filters the
   local cache instantly as you type; pressing Enter also queries all of
   Outlook (read and unread) and merges the results in, server matches
   first. Verified interactively via the same disposable browser-harness
   technique from milestone 6 (mark-read round trip and the local→server
   search merge both confirmed working, not just typechecked). Needs a real
   mailbox test before shipping — this is the first phase that performs
   real writes against live Outlook data.

## Latest release-readiness check

- [x] `npm run typecheck` and `npm test` clean (97 passing tests)
- [x] `npm run package` + `npm run verify:package` on the actual `.dmg`
- [ ] Manual pass on installed app: sign-in, sync, notifications, grouping,
      sections, rules, opt-in cloud classification (with a real key)
- [x] Settings UI has no toggle that doesn't do something (recheck after
      milestone 5 cleanup)
- [x] Changelog generated, version bumped, release notes written
