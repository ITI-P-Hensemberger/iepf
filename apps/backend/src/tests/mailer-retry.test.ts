// Purpose: Pin which SMTP failures are retried, and how many times.
import { describe, expect, it, vi } from 'vitest'

import { isTemporarySmtpError, retryTemporarySmtpErrors } from '@/lib/mailer'

function smtpError(responseCode?: number) {
  return Object.assign(new Error('Message failed'), { code: 'EMESSAGE', responseCode })
}

describe('retryTemporarySmtpErrors', () => {
  it('tells temporary replies from final ones', () => {
    expect(isTemporarySmtpError(smtpError(432))).toBe(true)
    expect(isTemporarySmtpError(smtpError(421))).toBe(true)
    expect(isTemporarySmtpError(smtpError(550))).toBe(false)
    expect(isTemporarySmtpError(smtpError())).toBe(false)
    expect(isTemporarySmtpError(null)).toBe(false)
  })

  it('sends again after a temporary failure', async () => {
    const wait = vi.fn(async () => {})
    const attempt = vi.fn()
      .mockRejectedValueOnce(smtpError(432))
      .mockResolvedValueOnce('sent')
    await expect(retryTemporarySmtpErrors(attempt, [5, 20], wait)).resolves.toBe('sent')
    expect(attempt).toHaveBeenCalledTimes(2)
    expect(wait).toHaveBeenCalledWith(5)
  })

  it('gives up after the last retry', async () => {
    const attempt = vi.fn().mockRejectedValue(smtpError(432))
    await expect(retryTemporarySmtpErrors(attempt, [5, 20], async () => {})).rejects.toMatchObject({ responseCode: 432 })
    expect(attempt).toHaveBeenCalledTimes(3)
  })

  it('does not retry a final failure', async () => {
    const attempt = vi.fn().mockRejectedValue(smtpError(550))
    await expect(retryTemporarySmtpErrors(attempt, [5, 20], async () => {})).rejects.toMatchObject({ responseCode: 550 })
    expect(attempt).toHaveBeenCalledTimes(1)
  })
})
