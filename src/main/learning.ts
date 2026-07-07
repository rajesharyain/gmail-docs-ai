import {
  buildRuleSuggestions,
  dismissSuggestion,
  normalizeLearningData,
  recordLearningEvent
} from '../shared/learning'
import type { EmailSummary, LearningEventKind, RuleSuggestion, SenderRule } from '../shared/types'
import { readJson, writeJson } from './store'

const LEARNING_FILE = 'learning.json'

/**
 * Persistence wrapper around the pure shared/learning.ts logic — a JSON file
 * store, consistent with how settings and seen-ids persist. All the actual
 * counting/suggestion rules live in shared/learning.ts where they're unit
 * tested without Electron.
 */
export class LearningStore {
  private data = normalizeLearningData(readJson<unknown>(LEARNING_FILE, null))

  record(email: EmailSummary, kind: LearningEventKind): void {
    this.data = recordLearningEvent(this.data, {
      senderAddress: email.senderAddress,
      senderName: email.sender,
      kind
    })
    writeJson(LEARNING_FILE, this.data)
  }

  suggestions(senderRules: SenderRule[]): RuleSuggestion[] {
    return buildRuleSuggestions(this.data, senderRules)
  }

  dismiss(id: string): void {
    this.data = dismissSuggestion(this.data, id)
    writeJson(LEARNING_FILE, this.data)
  }
}
