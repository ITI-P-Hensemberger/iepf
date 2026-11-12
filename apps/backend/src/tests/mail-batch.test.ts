import { describe, expect, it, vi } from 'vitest'

import { createMailBatch } from '@/lib/mail-batch'

const payload = {
  to: 'a@example.test',
  subject: 's',
  text: 't',
  html: 'h'
}

describe('createMailBatch', () => {
  it('finishes when every email is sent', async () => {
    const batch = createMailBatch(async () => {})
    batch.send(payload)
    batch.send(payload)
    await expect(batch.finish()).resolves.toBeUndefined()
  })

  it('finishes with nothing to send', async () => {
    await expect(createMailBatch(async () => {}).finish()).resolves.toBeUndefined()
  })

  it('rejects with the number of lost emails, after trying them all', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const send = vi.fn()
      .mockRejectedValueOnce(new Error('smtp down'))
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('smtp down'))
    const batch = createMailBatch(send)
    batch.send(payload)
    batch.send(payload)
    batch.send(payload)
    await expect(batch.finish()).rejects.toThrow('2 of 3 emails could not be sent')
    expect(send).toHaveBeenCalledTimes(3)
    error.mockRestore()
  })
})
