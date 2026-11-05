import { describe, expect, it } from 'vitest'

import { redactSendError } from '@/lib/mailer'

describe('redactSendError', () => {
  it('keeps the cause but drops every address', () => {
    const error = Object.assign(new Error('Can\'t send mail - recipient mario.rossi@example.test refused'), {
      code: 'EENVELOPE',
      responseCode: 550,
      rejected: ['mario.rossi@example.test'],
      envelope: { to: ['mario.rossi@example.test'] }
    })
    const redacted = redactSendError(error)
    expect(redacted.message).toBe('SMTP send failed: EENVELOPE (550)')
    expect(JSON.stringify({ ...redacted, message: redacted.message, stack: redacted.stack })).not.toContain('mario.rossi')
  })

  it('handles errors without details', () => {
    expect(redactSendError(new Error('boom')).message).toBe('SMTP send failed: unknown')
    expect(redactSendError(null).message).toBe('SMTP send failed: unknown')
  })
})
