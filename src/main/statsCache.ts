import type { InboxStats } from '../shared/types'
import {
  fetchGmailProfile,
  fetchHistory,
  fetchInboxStats,
  fetchLabelCounts,
  fetchMessageAttachmentMeta
} from './graph'
import { logger } from './logger'
import { deleteFile, readJson, writeJson } from './store'

const CACHE_FILE = 'inbox-stats-cache.json'
const METADATA_BATCH = 25

interface CachedStats {
  stats: InboxStats
  historyId: string
  lastSyncedAt: string
}

export class StatsCache {
  private cache: CachedStats | null = null

  constructor() {
    this.cache = readJson<CachedStats | null>(CACHE_FILE, null)
  }

  getCached(): InboxStats | null {
    return this.cache?.stats ?? null
  }

  async refresh(token: string): Promise<InboxStats> {
    if (!this.cache) {
      return this.fullRefresh(token)
    }
    return this.incrementalRefresh(token)
  }

  clear(): void {
    this.cache = null
    deleteFile(CACHE_FILE)
  }

  private async fullRefresh(token: string): Promise<InboxStats> {
    logger.info('Stats cache: performing full refresh')
    const [stats, profile] = await Promise.all([
      fetchInboxStats(token),
      fetchGmailProfile(token)
    ])
    this.cache = {
      stats,
      historyId: profile.historyId ?? '',
      lastSyncedAt: new Date().toISOString()
    }
    this.persist()
    return stats
  }

  private async incrementalRefresh(token: string): Promise<InboxStats> {
    const cached = this.cache!

    const [labelCounts, historyResult] = await Promise.all([
      fetchLabelCounts(token),
      fetchHistory(token, cached.historyId)
    ])

    cached.stats.totalEmails = labelCounts.totalEmails
    cached.stats.trashEmails = labelCounts.trashEmails

    if (!historyResult) {
      logger.info('Stats cache: history expired, doing full refresh')
      return this.fullRefresh(token)
    }

    const { messageIds, historyId } = historyResult

    if (messageIds.length === 0) {
      cached.historyId = historyId
      cached.lastSyncedAt = new Date().toISOString()
      this.persist()
      return cached.stats
    }

    logger.info('Stats cache: incremental update', { newMessages: messageIds.length })

    for (let i = 0; i < messageIds.length; i += METADATA_BATCH) {
      const batch = messageIds.slice(i, i + METADATA_BATCH)
      const results = await Promise.allSettled(
        batch.map((id) => fetchMessageAttachmentMeta(token, id))
      )
      for (const result of results) {
        if (result.status !== 'fulfilled') continue
        const meta = result.value
        cached.stats.imageAttachments += meta.imageCount
        cached.stats.videoAttachments += meta.videoCount
        cached.stats.imageSize += meta.imageSize
        cached.stats.videoSize += meta.videoSize
      }
    }

    cached.historyId = historyId
    cached.lastSyncedAt = new Date().toISOString()
    this.persist()
    return cached.stats
  }

  private persist(): void {
    writeJson(CACHE_FILE, this.cache)
  }
}
