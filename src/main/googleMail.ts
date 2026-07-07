const TRUSTED_GMAIL_HOSTS = new Set(['mail.google.com'])

export function isTrustedGoogleMailLink(input: string | undefined): input is string {
  if (!input) return false
  try {
    const url = new URL(input)
    return url.protocol === 'https:' && TRUSTED_GMAIL_HOSTS.has(url.hostname)
  } catch {
    return false
  }
}
