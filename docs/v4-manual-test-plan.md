# PostMail AI — V4 Manual Test Plan

Hands-on verification checklist for the v4 intelligence features (Phases 1–6
of `docs/v4-ai-intelligence-plan.md`), plus the still-outstanding
`Mail.ReadWrite` real-mailbox pass. Automated tests cover the logic; this
plan verifies the *experienced* behavior against a live mailbox.

Run the app with `npm run dev` and sign in.

> **Baseline rule (applies to Tests 2 and 3):** the first sync after launch
> only establishes a baseline. Notifications and the "since you last
> checked" briefing react only to mail that arrives **while the app is
> already running** — never to backlog.

## Setup: trigger emails

Send yourself these emails — each subject is crafted to hit a specific
local rule:

| Subject to send | Expected classification |
|---|---|
| `Can you respond by today?` (body: "Please reply by end of day.") | Urgent attention, "Due today" chip, reply action |
| `Security alert: password reset requested` | Urgent, high risk → "Use caution" chip |
| `Upcoming Payment for Registered Agent Service` | Finance category, "Payment likely" chip |
| `Meeting rescheduled for tomorrow` | Calendar, "Due soon" chip, schedule action |
| `50% off sale this weekend` | Silent/low attention → **no notification** |

## Test 1 — Quiet UI signals (Phase 3)

Open the popup and confirm:

- [ ] "Due soon" and "Needs attention" sections appear at the top of the
      inbox, above the normal category sections, containing the
      deadline/urgent emails.
- [ ] No email appears twice (attention sections vs. category sections).
- [ ] Rows carry small signal chips: "Due today", "Use caution",
      "Reply likely", "Payment likely", "Low attention".
- [ ] Hovering a row shows a tooltip with the *reasons* behind its top
      signal.
- [ ] Category chips (Finance, Calendar, …) appear only when the AI toggle
      is on in Settings; signal chips appear regardless.

## Test 2 — Inbox briefing (Phase 6)

Order matters — the briefing tracks "since you last opened the popup":

1. Open the popup once, then close it (marks current mail as seen).
2. Send 2–3 actionable trigger emails plus the promo one.
3. Click ↻ Check now (or wait for the poll), then open the popup.

- [ ] A quiet banner appears under the header, e.g.
      **"3 emails need action: one client reply, one payment issue, and one
      meeting change."** with "Everything else is low priority." beneath.
- [ ] Repeat with only the promo email → banner reads
      **"1 new email, nothing urgent right now."**
- [ ] Open the popup again with nothing new → **no banner at all**.

## Test 3 — Smart notifications (Phase 4)

With the app running and the popup closed:

- [ ] Send the **promo email** → no macOS notification. The log
      (`~/Library/Application Support/postmail-ai/logs/main.log`) shows
      "Skipped notification because new mail was low attention".
- [ ] Send the **"respond by today"** email → notification titled
      **"Needs attention: \<sender\>"**.
- [ ] Send an urgent + a normal email together → title like
      **"1 urgent, 2 new"**.
- [ ] Turn on **Settings → "Notify for low-priority mail too"**, resend the
      promo → now it **does** notify.

> Dev-mode quirk: macOS attributes notifications to "Electron" — allow them
> in System Settings → Notifications the first time.

## Test 4 — Cloud second opinion (Phase 5, optional — needs an API key)

Enable AI + classification in Settings with a Groq/Gemini/GitHub Models
credential and "allow external processing" on.

- [ ] Send an email with a vague subject ("Quick question about the trip" —
      low local confidence). After the next sync its attention/signal chip
      may change based on the provider's structured verdict.
- [ ] `~/Library/Application Support/postmail-ai/postmail-ai.sqlite3` gains
      `action: 'insight'` rows in `ai_audit_log` and rows in
      `ai_insight_cache`.
- [ ] With an invalid credential or offline, nothing breaks — the log shows
      "Cloud insight request failed" and local signals stand.

This feature is deliberately silent: the log and the DB are the observable
surface.

## Test 5 — Real-mailbox write actions (outstanding since the Mail.ReadWrite scope bump)

You may need to sign out/in once to re-consent to the read-write scope
(consent screen now says "Read and write access to your mail").

- [ ] Mark one email read via its unread dot → it disappears, **stays gone
      after an app restart**, and shows read in Outlook.
- [ ] Archive one email from the row ⋯ menu → lands in Outlook's Archive
      folder.
- [ ] Delete one email (confirm dialog appears) → lands in Deleted Items.
- [ ] Select several (☑ or Cmd-click) → bulk mark read / archive via the
      floating toolbar → all reflected in Outlook.
- [ ] "Mark all read" (header ⋯ menu) affects only the visible ~25, not the
      whole mailbox backlog.
- [ ] Search (🔍): type → instant local matches; press Enter → results from
      **all** Outlook mail, including read/older messages not in the popup.
