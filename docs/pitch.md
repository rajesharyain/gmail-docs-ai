# PostMail AI — Problem, Solution & Client Pitch

_Written after a full pass over the current codebase (v2.0.0 + the unreleased
inbox-actions, redesign, and category-drawer work). This is the "what are we
actually building and why" document — for `docs/v2-roadmap.md`'s
feature-by-feature build log, see that file instead._

## The problem

Knowledge workers on Microsoft 365 / Outlook check their inbox constantly not
because they want to, but because they're afraid of missing one thing: the
email that actually matters, buried under three newsletters, a calendar
auto-reply, and a Slack digest that arrived in the same ten minutes. Two bad
solutions exist today:

1. **Live in the mail client.** Outlook/Mail.app open all day, a browser tab
   pinned, constant context-switching away from real work just to "stay on
   top of it."
2. **Turn off notifications and check in batches.** Fixes the interruption
   problem, creates a new one — now you *do* miss things, or find out about
   something time-sensitive four hours late.

Most "menu bar email" utilities on the market don't actually fix this — they
either (a) just mirror the full mail client in a smaller window, recreating
the same clutter and decision fatigue, or (b) are read-only notifiers that
tell you mail arrived but make you leave the popup to do anything about it,
which defeats the point of a glanceable tool.

## What we're actually solving

PostMail AI's scope, distilled from every round of this project (including
the point where we deliberately cut back from a heavier feature set): **you
should never miss an important email, and clearing the ones that don't
matter should take one click, without ever opening the real mail client.**

Concretely, that means:

- **Local, instant categorization** (`Important`, `Finance`, `Jobs`,
  `Calendar`, `Work`, `Home`, `Promotions`, `Noise`) computed on-device from
  keyword and sender-domain rules — no network call, no AI required, so it
  works the instant mail arrives.
- **User-correctable, not just algorithmic**: mark a sender "always
  important" or "mute" from the same popup, and the rule sticks — the app
  adapts to how *you* actually triage, instead of guessing forever.
- **An optional cloud-AI second opinion** (Groq / GitHub Models / Gemini),
  used *only* for the borderline emails local rules can't confidently place,
  gated behind a privacy-redaction layer and fully opt-in — most users will
  never need to touch this.
- **Real actions, not just a read-only mirror**: mark read, archive, delete,
  and bulk-select all write back to the actual Outlook mailbox via Microsoft
  Graph, so acting in the popup means it's actually handled — it won't
  reappear on the next check.
- **Search that isn't limited to what's cached**: instant local search over
  what's already fetched, falling through to a live Outlook-wide query
  (read + unread, not just the unread page) when you need to find something
  older.
- **A category drawer, not a folder tree**: since categories — not folders —
  are the primary way this app organizes mail, the one navigational surface
  it has is a lightweight slide-out list of categories with counts, not a
  second mail client's worth of chrome.

## Who it's for

Anyone on a Microsoft-hosted mailbox (M365 work/school, Outlook.com, Hotmail,
Live, MSN) who wants situational awareness — "is there anything I need to
deal with right now?" — without keeping a full mail client open. It is
explicitly **not** trying to replace Outlook/Mail.app for composing,
organizing folders, or managing attachments; it's the fast layer on top that
handles the 90% case (glance, triage, clear) and hands off to the real
client for everything else via "Open."

## What it deliberately does not do (yet)

Being clear about this is part of the pitch, not a weakness — it's why the
tool stays fast and calm instead of becoming another bloated inbox app:

- No Gmail/IMAP — Microsoft-hosted mailboxes only, by design for this
  release.
- No multi-account / multi-mailbox in one popup.
- No compose, no folder management beyond the fixed category set, no
  drafts/sent-mail views.
- macOS only (menu bar / Tray architecture); no Windows/Linux build yet.
- No org/admin features (shared inboxes, MDM policy, fleet telemetry).
- No pricing/business model decided yet — currently free, unmonetized.

## How to pitch it to a client

**One-line pitch:** *"A menu-bar companion that guarantees you never miss an
important email, and lets you clear everything else — read, archived,
deleted — in one click, without ever opening Outlook."*

**The narrative arc for a client demo:**

1. **Open with the pain, not the product.** Ask how they currently keep up
   with email — most answers are "I just keep Outlook open all day" or "I
   check obsessively." That's the cost this tool removes.
2. **Show the glance, not a feature tour.** Click the menu-bar icon. Point
   out that Important/Finance/Calendar are already sorted, before they've
   done anything — this lands harder than describing the categorization
   engine.
3. **Show one action end-to-end.** Mark something read, or archive it, and
   note out loud: *"that just happened in your real Outlook mailbox — it
   won't come back."* This is the moment that differentiates it from a
   read-only notifier.
4. **Show search reaching past the cache.** Type something not in the
   current unread list, hit Enter, show it pulling from all of Outlook.
   Proves it isn't just a local snapshot toy.
5. **Name the boundary honestly.** State plainly what it isn't (see above) —
   clients trust a tool more when its limits are stated up front instead of
   discovered later.
6. **Close on the trust story, not just features.** Microsoft OAuth (no
   password ever touches this app), Keychain-encrypted token storage, opt-in
   AI with a redaction layer that strips secrets/cards/emails/phones before
   anything leaves the machine if they ever turn cloud classification on.

**Where the project actually stands right now** (say this part out loud,
don't oversell): local categorization, sender rules, real Graph-backed
actions, mailbox-wide search, and the redesigned popup/category drawer are
built and covered by the automated suite — but a manual pass against a real,
live mailbox (re-consent to the new write scope, verify archive/delete/mark
read/search against actual Outlook data) still has to happen. That's the
honest gate before calling this demo-ready for a client, let alone shippable.
