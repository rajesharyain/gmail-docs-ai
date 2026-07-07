/**
 * Google identity configuration.
 *
 * Create a Google Cloud OAuth client for a Desktop app, then provide:
 *
 *   export GOOGLE_CLIENT_ID="..."
 *   export GOOGLE_CLIENT_SECRET="..."   # optional, if your client has one
 *
 * Enable these APIs in the same Google Cloud project:
 *
 * - Gmail API
 * - Google Drive API
 *
 * Gmail modify is required for mark-read, archive, and trash actions. Drive
 * remains metadata-only until cleanup actions are implemented.
 */
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? ''
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? ''

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
export const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo'

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/drive.metadata.readonly'
]

export const isConfigured = () => GOOGLE_CLIENT_ID.trim().length > 0
