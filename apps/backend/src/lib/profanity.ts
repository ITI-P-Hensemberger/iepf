// Purpose: Profanity filtering for user-provided text.
import { englishDataset, englishRecommendedTransformers, RegExpMatcher } from 'obscenity'
import { profanities as profanitiesIt } from 'profanities/it'

import env from '@/env'

function parseExtraWords(value?: string) {
  if (!value) {
    return []
  }
  return value
    .split(/[\n,;]/)
    .map(word => word.trim())
    .filter(Boolean)
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers
})

const extraWords = parseExtraWords(env.PROFANITY_EXTRA_WORDS)
const italianWords = [
  ...profanitiesIt,
  ...extraWords
]
const italianPattern = italianWords.length > 0
  ? new RegExp(`\\b(?:${italianWords.map(escapeRegex).join('|')})\\b`, 'i')
  : null

export function containsProfanity(input: string) {
  if (matcher.hasMatch(input)) {
    return true
  }
  return italianPattern?.test(input) ?? false
}
