// Purpose: Check that a reminder goes out once and that a failed send can be retried.
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import db, { closeDb } from '@/db'
import { reminderDeliveries } from '@/db/schemas/reminder-deliveries.schema'
import env from '@/env'
import { cleanDatabase } from '@/lib/db-cleanup'
import { assertLocalDatabase } from '@/lib/local-database'
import { createMailBatch } from '@/lib/mail-batch'
import { localDayKey, pruneReminderDeliveries, sendReminderOnce } from '@/lib/reminder-delivery'

const payload = { to: 'a@example.test', subject: 's', text: 't', html: 'h' }

beforeAll(async () => {
  assertLocalDatabase(env.DATABASE_URL, env.NODE_ENV)
  await cleanDatabase()
})

afterAll(async () => {
  await closeDb()
})

describe('sendReminderOnce', () => {
  it('sends the same reminder only once across runs', async () => {
    const send = vi.fn(async () => {})

    const firstRun = createMailBatch(send)
    expect(await sendReminderOnce(firstRun, 'once', payload)).toBe(true)
    await firstRun.finish()

    const secondRun = createMailBatch(send)
    expect(await sendReminderOnce(secondRun, 'once', payload)).toBe(false)
    await secondRun.finish()

    expect(send).toHaveBeenCalledOnce()
  })

  it('sends only once when two runs overlap', async () => {
    const send = vi.fn(async () => {})
    const batch = createMailBatch(send)
    const results = await Promise.all([1, 2, 3].map(() => sendReminderOnce(batch, 'overlap', payload)))
    await batch.finish()
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(send).toHaveBeenCalledOnce()
  })

  it('lets a rerun retry a reminder that failed to send', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failing = createMailBatch(async () => {
      throw new Error('smtp down')
    })
    await sendReminderOnce(failing, 'retry', payload)
    await expect(failing.finish()).rejects.toThrow('1 of 1 emails could not be sent')
    error.mockRestore()

    const send = vi.fn(async () => {})
    const rerun = createMailBatch(send)
    expect(await sendReminderOnce(rerun, 'retry', payload)).toBe(true)
    await rerun.finish()
    expect(send).toHaveBeenCalledOnce()
  })
})

describe('pruneReminderDeliveries', () => {
  it('removes only records older than a week', async () => {
    const now = new Date('2026-06-15T12:00:00Z')
    await db.insert(reminderDeliveries).values([
      { key: 'old', createdAt: new Date('2026-06-01T12:00:00Z') },
      { key: 'new', createdAt: new Date('2026-06-14T12:00:00Z') }
    ])
    await pruneReminderDeliveries(now)
    expect(await db.select().from(reminderDeliveries).where(eq(reminderDeliveries.key, 'old'))).toHaveLength(0)
    expect(await db.select().from(reminderDeliveries).where(eq(reminderDeliveries.key, 'new'))).toHaveLength(1)
  })
})

describe('localDayKey', () => {
  it('uses the local calendar day', () => {
    expect(localDayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})
