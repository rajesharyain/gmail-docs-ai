import { Notification } from 'electron'
import type { EmailSummary, Settings } from '../shared/types'
import { classifyEmail } from '../shared/mailIntelligence'
import { logger } from './logger'
import { readSettings } from './store'

export interface NotificationContent {
  title: string
  body: string
}

export function selectNotifiableMail(arrived: EmailSummary[], settings: Settings): EmailSummary[] {
  // Opt-in escape hatch: notify for everything, same as pre-v4 behavior.
  if (settings.rules.notifyLowAttention) return arrived
  return arrived.filter((email) => {
    const insight = classifyEmail(email, settings.rules.senderRules)
    return insight.attentionLevel !== 'low' && insight.attentionLevel !== 'silent'
  })
}

export function formatNewMailNotification(arrived: EmailSummary[], settings: Settings): NotificationContent {
  const urgentCount = arrived.filter((email) => {
    const insight = classifyEmail(email, settings.rules.senderRules)
    return insight.attentionLevel === 'urgent'
  }).length

  if (arrived.length === 1) {
    const [m] = arrived
    const prefix = urgentCount > 0 ? 'Needs attention: ' : ''
    return {
      title: `${prefix}${m.sender}`,
      body: m.preview ? `${m.subject}\n${m.preview}` : m.subject
    }
  }

  const senders = [...new Set(arrived.map((m) => m.sender))]
  const shown = senders.slice(0, 2).join(', ')
  const more = senders.length - 2
  const title = urgentCount > 0 ? `${urgentCount} urgent, ${arrived.length} new` : `${arrived.length} important emails`
  return {
    title,
    body: more > 0 ? `${shown} and ${more} more` : shown
  }
}

export function createNewMailNotifier(openPopup: () => void) {
  return (arrived: EmailSummary[]): void => {
    const settings = readSettings()
    if (!settings.notificationsEnabled) {
      logger.info('Skipped notification because notifications are disabled')
      return
    }
    if (!Notification.isSupported()) {
      logger.warn('Skipped notification because Notification API is unavailable')
      return
    }

    const notifiable = selectNotifiableMail(arrived, settings)
    if (notifiable.length === 0) {
      logger.info('Skipped notification because new mail was low attention', { count: arrived.length })
      return
    }
    const { title, body } = formatNewMailNotification(notifiable, settings)

    const notification = new Notification({ title, body, silent: false })
    notification.on('click', openPopup)
    notification.show()
    logger.info('Displayed new mail notification', {
      count: notifiable.length,
      suppressedCount: arrived.length - notifiable.length
    })
  }
}
