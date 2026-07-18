import { config } from 'dotenv'
import { join } from 'path'
import { app } from 'electron'

// Load .env from project root in dev, or from userData in production
const envPath = app.isPackaged
  ? join(app.getPath('userData'), '.env')
  : join(process.cwd(), '.env')
config({ path: envPath })

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
