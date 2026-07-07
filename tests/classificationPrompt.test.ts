import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CLASSIFICATION_LABELS,
  buildClassificationPrompt,
  classificationSystemPrompt,
  parseClassificationLabel
} from '../src/main/ai/classificationPrompt'

test('classification labels cover every category including the "none of these" option', () => {
  assert.deepEqual(CLASSIFICATION_LABELS, [
    'important',
    'finance',
    'jobs',
    'home',
    'work',
    'calendar',
    'promotions',
    'noise',
    'other'
  ])
})

test('system prompt names every label and asks for a bare answer', () => {
  const prompt = classificationSystemPrompt(['important', 'noise'])
  assert.match(prompt, /important, noise/)
  assert.match(prompt, /only the category id/i)
})

test('builds a prompt from sender/subject, omitting preview when absent', () => {
  const withoutPreview = buildClassificationPrompt({
    sender: 'Jane Doe',
    senderAddress: 'jane@example.com',
    subject: 'Quarterly report'
  })
  assert.equal(withoutPreview, 'Sender: Jane Doe <jane@example.com>\nSubject: Quarterly report')

  const withPreview = buildClassificationPrompt({
    sender: 'Jane Doe',
    senderAddress: 'jane@example.com',
    subject: 'Quarterly report',
    preview: 'Please review by Friday'
  })
  assert.match(withPreview, /Preview: Please review by Friday/)
})

test('parses a clean label and rejects anything outside the allowed set', () => {
  assert.equal(parseClassificationLabel('important', ['important', 'noise']), 'important')
  assert.equal(parseClassificationLabel('  Important.\n', ['important', 'noise']), 'important')
  assert.equal(parseClassificationLabel('uncategorized', ['important', 'noise']), null)
  assert.equal(parseClassificationLabel('', ['important', 'noise']), null)
})
