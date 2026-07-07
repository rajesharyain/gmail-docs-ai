# PostMail AI — V4 AI Intelligence Plan

V4 should make PostMail AI feel like an attention assistant, not an email
summarizer. The product should stay lightweight, menu-bar native, and useful
without requiring an AI API key.

## Current Baseline

Already built and available from `develop`:

- macOS menu-bar application with hidden Dock icon.
- Custom tray icon with unread count.
- Microsoft OAuth via MSAL PKCE.
- Microsoft-hosted mailbox support through Microsoft Graph.
- Inbox polling and local unread cache.
- Native macOS notifications for genuinely new mail.
- Open message in Outlook web or Outlook desktop.
- Mark read, archive, delete, bulk actions, and mark-all-visible-read.
- Outlook-backed search across the mailbox.
- Smart sections and local category intelligence.
- Sender rules: mark important and mute.
- Category visibility settings.
- Settings for poll interval, launch at login, open target, notifications.
- Optional AI provider setup: Groq, Gemini, GitHub Models, custom endpoint.
- Keychain-encrypted AI credential storage.
- AI provider connection testing.
- Privacy/redaction gate before any external AI processing.
- SQLite WASM storage for AI audit, privacy decisions, rules, and classification cache.
- Optional cloud categorization for low-confidence local classification.

## What V4 Should Add

V4 should focus on practical intelligence:

- Attention detection: whether an email deserves interruption.
- Next-action detection: what the user probably needs to do next.
- Deadline and commitment detection.
- Risk/scam detection.
- Smarter notification policy.
- Inbox briefing based on structured signals.
- Personal learning from user actions.
- Client-demo mode and pitch workflow.

## Product Rule

Do not add a big visible "AI" workflow in the inbox.

AI should work quietly in the background and show only useful outcomes:

- "Needs attention"
- "Reply likely"
- "Payment due"
- "Use caution"
- "Due soon"
- "Can ignore"

## Phase 1 — V4 Intelligence Contract

Complexity: Medium

Status: Complete

Create a shared structured insight model that can be used by the renderer,
main process, notifications, provider prompts, and storage.

Suggested shape:

- `attentionLevel`: urgent, important, normal, low, silent
- `nextAction`: reply, review, pay, schedule, track, archive, ignore, open
- `deadline`: has deadline, urgency, label
- `risk`: level and reasons
- `confidence`
- `reasons`
- `source`: local, cloud, user-rule

Deliverables:

- Shared TypeScript types.
- Backward-compatible integration with existing category/priority output.
- Tests proving finance/job/calendar/noise behavior still works.
- Tests for basic attention/action/risk/deadline signals.

Definition of done:

- Current UI behavior does not regress.
- Existing tests pass.
- New insight fields are available without requiring provider calls.

Completed in this branch:

- Added shared `MailInsight` fields for attention level, next action,
  deadline, risk, confidence, reasons, and source.
- Kept the existing category/priority contract intact for the current UI.
- Enriched `classifyEmail()` with deterministic local signals only.
- Added tests for deadline, risk, next action, source, and attention level.

## Phase 2 — Local Attention Engine

Complexity: Medium

Status: Complete

Build deterministic local rules for attention, action, deadline, and risk.
This should be useful even when AI provider settings are disabled.

Examples:

- invoice/payment due → high attention, pay/review
- interview/reschedule → important, schedule/open
- password/security alert → urgent, review, medium/high risk
- newsletter/sale → low/silent, archive/ignore
- direct question/request → important, reply

Deliverables:

- Local scoring rules.
- Explainable reason strings.
- Confidence scores.
- Tests with realistic mailbox examples.

Definition of done:

- The app can identify "needs attention" without cloud AI.
- Rules are predictable and easy to adjust.

Completed in this branch:

- Added a local `attentionScore` from 0–100.
- Tuned attention levels from the score: urgent, important, normal, low,
  silent.
- Added explainable signal reasons such as `Due today`, `Payment likely`,
  `Reply likely`, `Review likely`, and risk reasons.
- Expanded local deadline, risk, payment, reply, review, schedule, and
  tracking patterns.
- Added realistic tests for due invoices, client requests, security alerts,
  scheduling, and promotional mail.

## Phase 3 — Quiet Inbox UI Signals

Complexity: Medium

Status: Complete

Show the intelligence without making the popup noisy.

UI direction:

- Add a "Needs attention" section only when relevant.
- Add a "Due soon" section only when relevant.
- Use subtle row hints or icons.
- Put details in hover/menu/details surface.
- Do not add a permanent AI button to every row.

Deliverables:

- Small visual hints for attention/action/risk/deadline.
- Accessible labels.
- No layout crowding.
- Screenshot/browser verification.

Definition of done:

- A user can glance and know what matters.
- The app still feels like a lightweight menu-bar utility.

Completed in this branch:

- Added top-of-inbox `Due soon` and `Needs attention` sections.
- Avoided duplicate emails between attention sections and normal category
  sections.
- Kept the category drawer/counts based on the full visible inbox.
- Added compact row-level signal chips such as `Use caution`, `Due soon`,
  `Reply likely`, `Payment likely`, and `Low attention`.
- Added hover/title reasons for the top row signal without adding a visible AI
  workflow.
- Added tests for attention-section ordering and de-duplication.

## Phase 4 — Smart Notifications

Complexity: Medium to High

Status: Complete

Use attention intelligence to decide when to interrupt.

Policy examples:

- Urgent: notify immediately.
- Important: notify normally.
- Normal: show in tray/popup.
- Low/silent: do not notify unless user opts in.

Deliverables:

- Notification policy setting.
- Attention-aware new-mail notification logic.
- Tests for first-sync baseline, muted senders, low-priority mail, urgent mail.

Definition of done:

- The app reduces notification noise instead of amplifying it.

Completed in this branch:

- Added `selectNotifiableMail()` in `src/main/notifications.ts`, which
  suppresses new-mail notifications for `low`/`silent` attention-level mail
  by default so urgent/important mail doesn't get lost in newsletter noise.
- Added `formatNewMailNotification()`, which escalates wording when urgent
  mail is present (`Needs attention: <sender>` for a single message,
  `N urgent, M new` for a batch) instead of a flat "N new emails" title.
- Added the missing policy setting: `rules.notifyLowAttention` (default
  `false`), with a Settings toggle — "Notify for low-priority mail too" —
  shown only while notifications are enabled. Turning it on opts back into
  notifying for everything, matching the plan's "do not notify unless user
  opts in" requirement.
- First-sync baseline and muted-sender suppression predate this phase and
  still live untouched in `sync.ts` — verified no regression, so no new
  tests were needed there.
- Added tests for low-attention suppression (default), the opt-in override,
  and both urgent-wording paths in `tests/notifications.test.ts`; extended
  `tests/settings.test.ts` and `tests/ipcValidation.test.ts` to cover
  `notifyLowAttention` normalization and IPC sanitization.

## Phase 5 — Cloud Second Opinion

Complexity: High

Status: Complete

Use external AI only when local rules are uncertain or the signal is high
impact, such as risk or deadline detection.

Important constraints:

- Always pass through the privacy/redaction layer.
- Require explicit external-processing permission.
- Require a saved provider credential.
- Cache structured results.
- Fail quietly back to local intelligence.

Deliverables:

- Structured prompt for attention/action/risk/deadline.
- Strict JSON parser and validator.
- SQLite insight cache.
- Audit records.
- Provider tests with mocked responses.

Definition of done:

- Cloud AI improves uncertain cases without becoming required.

Completed in this branch:

- Added `EmailSummary.cloudInsight` (`CloudInsightOverride`): attention
  level, next action, deadline, risk, and reasons — a separate axis from
  `cloudCategory`, so a cloud "second opinion" can correct attention/risk
  without ever touching the category a user's rule or cloud classification
  already settled on. `mailIntelligence.ts`'s `enrichInsight()` applies it
  when present and marks `source: 'cloud'`.
- Added `src/main/ai/insightPrompt.ts`: a strict system prompt asking for a
  compact JSON object (`attentionLevel`, `nextAction`, `deadline`, `risk`,
  `reasons`) and a defensive parser that rejects anything outside the known
  enums, tolerates a stray markdown code fence, and caps `reasons` at 3 —
  a malformed or half-right response fails the whole parse rather than
  quietly producing a wrong risk/deadline signal.
- Added `AIProvider.analyzeInsight` as a new optional capability (mirroring
  how `classify` was already optional) and implemented it for all three
  built-in providers: Groq and GitHub Models share the refactored
  `chatCompletionsClassifier.ts` (now exposes a generic
  `requestChatCompletion` used by both the category and insight paths);
  Gemini has its own `generateContent` request, refactored the same way.
  `MockAIProvider` intentionally doesn't implement it — a provider skipping
  this capability is exactly the "fail quietly" path exercised in tests.
- Added the `ai_insight_cache` SQLite table (migration v4) plus
  `upsertAIInsight`/`getAIInsight`, mirroring the existing classification
  cache's shape and conflict-upsert pattern.
- Added `ClassificationService.analyzeInsight()` as a sibling pass to
  `classifyAmbiguous()` — separately gated and separately triggered, since
  the plan calls for a different condition: local confidence below the
  existing 0.7 threshold, **or** a high local risk signal, **or** a "due
  today" local deadline signal, even when the category itself was
  confident. Reuses the same privacy gate, audit log (`action: 'insight'`),
  and fail-quiet-on-error behavior as the category pass. Wired into
  `main/index.ts`'s existing sync-completion callback alongside
  `classifyAmbiguous`.
- Tests: `tests/insightPrompt.test.ts` (parser/prompt), extended
  `tests/aiClassificationProviders.test.ts` (all three providers' new
  `analyzeInsight`, including a malformed-response rejection case),
  extended `tests/classificationService.test.ts` (gating, both trigger
  conditions, the "confident and unremarkable" non-trigger case, caching,
  privacy block, audit, provider-missing-the-capability, and
  provider-error paths), extended `tests/sqliteStore.test.ts` (insight
  cache upsert/read), and extended `tests/mailIntelligence.test.ts`
  (cloud insight overriding attention/action/deadline/risk while leaving
  category untouched, and combining with a resolved cloud category).

## Phase 6 — Inbox Briefing

Complexity: Medium

Status: Complete

Generate a short "since last checked" briefing from structured insight data,
not from full message summaries.

Example:

> 3 emails need action: one payment issue, one client reply, and one meeting
> change. Everything else is low priority.

Deliverables:

- Briefing generator.
- Last-opened / since-last-check state.
- Compact briefing panel.
- Tests for wording and counts.

Definition of done:

- Briefing helps the user decide whether to open the popup or keep working.

Completed in this branch:

- Added `src/shared/briefing.ts`: `buildInboxBriefing(emails, senderRules)`
  builds a two-sentence summary from local/cloud `MailInsight` signals over
  whatever arrived since the popup was last opened — never a full-message
  AI summary. Returns `null` when nothing new arrived, so the caller renders
  nothing instead of a redundant "all good" line.
- "Last-opened / since-last-check" state deliberately reuses the existing
  `isNew`/`seenIds` mechanism in `sync.ts` (already tracks exactly "arrived
  since the popup was last opened" for the blue new-mail dot) rather than
  adding a second, competing notion of "last checked" — confirmed the
  timing is safe: `markNewAsSeen()` only updates `seenIds` for the *next*
  sync's `isNew` computation, so the briefing still sees accurate `isNew`
  flags for the entire time the popup stays open after this look.
  Wording: "N emails need action: <up to 3 representative, deduped
  next-action phrases>." plus "Everything else is low priority." when there
  are additional new-but-not-actionable emails; "N new emails, nothing
  urgent right now." when nothing new is actionable; `null` when nothing is
  new at all. "Actionable" = `attentionLevel` is `urgent` or `important`,
  reusing the same boundary Phase 4's notification suppression already
  uses, so the briefing and the notification policy agree on what counts as
  worth surfacing.
- Added a compact, non-interactive `.inbox-briefing` panel in `Popup.tsx`,
  directly under the header — shown only in the plain inbox view (not
  while searching, category-filtered, or in Settings) and only when there's
  something to report. Verified live in a browser harness against the
  plan's own motivating example and confirmed it renders the exact wording.
- Tests: `tests/briefing.test.ts` (10 cases) covering the motivating
  example verbatim, singular/plural wording, the "nothing urgent" fallback,
  the null/empty-inbox cases, ignoring already-seen mail, deduping repeated
  next actions, and capping representative phrases at 3.

## Phase 7 — Personal Learning

Complexity: Medium to High

Status: Complete

Use user behavior to improve local rules.

Signals:

- Mark sender important.
- Mute sender.
- Repeated archive/delete by sender/category.
- Frequent opens from a sender/category.
- Ignored categories.

Deliverables:

- Local learning events.
- Suggested rules.
- Accept/dismiss controls.
- Explainable adjustments.

Definition of done:

- The app becomes more personal without hiding logic from the user.

Completed in this branch:

- Added `src/shared/learning.ts`: pure, deterministic, fully unit-tested
  logic — no model, no black box. `recordLearningEvent` counts per-sender
  opens/archives/deletes (capped at 200 senders, pruning the least recently
  active); `buildRuleSuggestions` converts those counts into at most one
  suggestion per sender once behavior crosses a plain threshold (3
  one-sided actions). Opens and archives/deletes are treated as opposing
  signals, so a sender the user sometimes reads and sometimes clears never
  generates a rule in either direction. Every suggestion carries an
  explainable reason string ("You've archived or deleted 3 emails from
  this sender.").
- Learning events are recorded in the main process where the actions
  actually succeed: `EmailActions` records archive/delete on a *successful*
  Graph write only (mark-read is deliberately not recorded — too weak a
  signal), and `EmailOpener` records opens. Persistence is a JSON file
  (`learning.json`) through the existing store module, consistent with
  settings/seen-ids.
- A sender already covered by any user rule (sender or domain match, either
  action) never generates a suggestion, and a dismissed suggestion is
  remembered permanently — it never resurfaces even as evidence grows.
  Accepting a suggestion also records a dismissal, so removing the rule
  later doesn't resurrect the prompt.
- UI: one quiet suggestion banner at a time in the popup ("Mute Newsletter
  Co? — You've archived or deleted 3 emails from this sender."), with
  accept and dismiss controls, styled alongside the Phase 6 briefing.
  Accepting reuses the exact same sender-rule path as the row menu's
  "Mute/Mark important" (including the immediate resync on mute). New IPC:
  `learning:suggestions` (invoke) and `learning:dismiss` (send, sanitized).
- Deliberately not built: category-level learning ("ignored categories")
  and the "mark important / mute sender" events themselves as learning
  inputs — an explicit rule already *is* the strongest signal, so feeding
  it back into suggestions would only ever re-suggest what the user
  already decided. Left for a future pass if per-category suggestions turn
  out to be wanted.
- Tests: `tests/learning.test.ts` (11 cases: counting, normalization of
  malformed data, both suggestion directions, mixed-behavior suppression,
  threshold, existing-rule suppression, permanent dismissal, evidence
  ordering, sender cap), plus extended `tests/emailActions.test.ts`
  (archive/delete record events; mark-read and failed actions don't) and
  `tests/ipcValidation.test.ts` (suggestion-id sanitizer). Accept and
  dismiss flows verified live in a browser harness.

## Phase 8 — Client Demo Package

Complexity: Low to Medium

Prepare a polished client pitch path.

Deliverables:

- Demo fixture mode.
- Scripted demo flow.
- Updated README/pitch docs.
- Release checklist.

Definition of done:

- The value story is easy to show in under 3 minutes.

## Recommended Build Order

Start with Phase 1 only.

Reason: V4 needs a stable shared contract before UI, notifications, provider
prompts, or storage can be built safely.

After Phase 1 passes, move to Phase 2. Do not start cloud work until the local
engine is genuinely useful.
