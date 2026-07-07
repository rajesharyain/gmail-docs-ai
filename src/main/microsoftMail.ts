const TRUSTED_OUTLOOK_WEB_HOSTS = [
  'outlook.office.com',
  'outlook.office365.com',
  'outlook.live.com'
]

export const MICROSOFT_CONSUMER_MAIL_DOMAINS = [
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com'
]

export function isTrustedMicrosoftMailLink(input: string | undefined): input is string {
  if (!input) return false
  try {
    const url = new URL(input)
    return (
      url.protocol === 'https:' &&
      TRUSTED_OUTLOOK_WEB_HOSTS.some(
        (host) => url.hostname === host || url.hostname.endsWith(`.${host}`)
      )
    )
  } catch {
    return false
  }
}
