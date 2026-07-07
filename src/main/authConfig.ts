/**
 * Microsoft identity configuration.
 *
 * ── SETUP (one time, ~5 min) ─────────────────────────────────────────────
 * 1. Go to https://entra.microsoft.com → Applications → App registrations
 *    → "New registration".
 * 2. Name: anything (e.g. "PostMail AI").
 *    Supported account types: "Accounts in any organizational directory and
 *    personal Microsoft accounts" (this is what makes tenant 'common' work,
 *    including Microsoft-hosted consumer mailboxes such as outlook.com,
 *    hotmail.com, live.com and msn.com).
 * 3. Under "Redirect URI", choose platform "Mobile and desktop applications"
 *    (NOT "Web") — you can also add it after creation under Manage →
 *    Authentication → Add a platform. Enter exactly:  http://localhost
 * 4. Create, then copy the "Application (client) ID" from the Overview page
 *    and paste it below (or export AZURE_CLIENT_ID before `npm run dev`).
 *
 * No client secret is needed — this is a public client using PKCE.
 * ─────────────────────────────────────────────────────────────────────────
 */
export const AZURE_CLIENT_ID =
  process.env.AZURE_CLIENT_ID ?? '4f984061-d577-442b-bdda-fd8041bba700'

/** 'common' = works with both personal and work/school accounts. */
export const AUTHORITY = 'https://login.microsoftonline.com/common'

/**
 * Mail.ReadWrite — needed for the in-app actions (mark read, archive,
 * delete) and search, not just inbox awareness. This is a stronger consent
 * screen ("Read and write access to your mail") than the previous
 * Mail.Read-only scope, and more likely to hit an "admin approval required"
 * wall on locked-down work/school accounts. MSAL adds openid, profile and
 * offline_access (refresh tokens) automatically.
 */
export const SCOPES = ['User.Read', 'Mail.ReadWrite']

export const isConfigured = () =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(AZURE_CLIENT_ID)
