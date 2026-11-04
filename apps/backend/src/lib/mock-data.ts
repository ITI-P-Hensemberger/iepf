// Purpose: Shared fictional addresses and guards for the full local mock dataset.
import env from '@/env'
import { assertLocalDatabase } from '@/lib/local-database'

export const MOCK_EMAIL_DOMAIN = '@example.test'
export const MOCK_EMAIL_PREFIX = 'mock.'
export const MOCK_TUTOR_PATTERN = `${MOCK_EMAIL_PREFIX}tutor-%${MOCK_EMAIL_DOMAIN}`
export const MOCK_STUDENT_PATTERN = `${MOCK_EMAIL_PREFIX}student-%${MOCK_EMAIL_DOMAIN}`
export const MOCK_PASSWORD = 'Password123!'

export function buildMockEmail(alias: string) {
  return `${MOCK_EMAIL_PREFIX}${alias}${MOCK_EMAIL_DOMAIN}`
}

export function assertMockEnvironment() {
  assertLocalDatabase(env.DATABASE_URL, env.NODE_ENV)
  if (!['127.0.0.1', 'localhost', '::1'].includes(env.SMTP_HOST ?? '')) {
    throw new Error('Full mock seed requires local SMTP (Mailpit)')
  }
}
