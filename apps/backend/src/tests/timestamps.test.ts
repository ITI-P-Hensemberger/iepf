// Purpose: Pin that DB defaults (now()) and Node Dates name the same instant.
import { and, eq, gte, lt, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import db, { closeDb } from '@/db'
import { auditLogs } from '@/db/schemas/audit-logs.schema'
import { reminderDeliveries } from '@/db/schemas/reminder-deliveries.schema'
import { users } from '@/db/schemas/users.schema'
import env from '@/env'
import { AUDIT_LOG_RETENTION_DAYS, cleanUpExpiredData } from '@/lib/data-retention'
import { cleanDatabase } from '@/lib/db-cleanup'
import { assertLocalDatabase } from '@/lib/local-database'
import { KEEP_DELIVERIES_DAYS, pruneReminderDeliveries } from '@/lib/reminder-delivery'

const MINUTE = 60 * 1000
const DAY = 24 * 60 * MINUTE

beforeAll(async () => {
  assertLocalDatabase(env.DATABASE_URL, env.NODE_ENV)
  await cleanDatabase()
})

afterAll(async () => {
  await closeDb()
})

describe('timestamp columns', () => {
  it('are all timestamp with time zone', async () => {
    const result = await db.execute<{ table_name: string, column_name: string }>(sql`
      select table_name, column_name from information_schema.columns
      where table_schema = 'public' and data_type = 'timestamp without time zone'
    `)
    expect(result.rows).toEqual([])
  })

  it('read a default now() as the current instant, whatever the session time zone', async () => {
    for (const zone of ['Europe/Rome', 'UTC', 'America/New_York']) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('timezone', ${zone}, true)`)
        const before = Date.now()
        const [row] = await tx.insert(auditLogs)
          .values({
            action: 'GET /tz',
            method: 'GET',
            path: `/tz/${zone}`,
            status: 200,
            durationMs: 1
          })
          .returning({ createdAt: auditLogs.createdAt })
        // now() is the transaction start, so allow a little slack before `before`.
        expect(row.createdAt.getTime()).toBeGreaterThan(before - MINUTE)
        expect(row.createdAt.getTime()).toBeLessThanOrEqual(Date.now())
      })
    }
  })

  it('compare a default created_at with Node Dates to the minute', async () => {
    await db.delete(users)
    const [user] = await db.insert(users).values({
      email: 'tz@example.test',
      firstName: 'Tz',
      lastName: 'Test',
      passwordHash: 'x'
    }).returning({ id: users.id })
    const now = Date.now()
    const found = (from: number, to: number) => db.select({ id: users.id }).from(users).where(and(eq(users.id, user.id), gte(users.createdAt, new Date(from)), lt(users.createdAt, new Date(to))))
    expect(await found(now - MINUTE, now + MINUTE)).toHaveLength(1)
    expect(await found(now + MINUTE, now + 2 * 60 * MINUTE)).toHaveLength(0)
    expect(await found(now - 2 * 60 * MINUTE, now - MINUTE)).toHaveLength(0)
  })

  it('keep updated_at on the same clock as created_at after an update', async () => {
    const [user] = await db.insert(users).values({
      email: 'tz-update@example.test',
      firstName: 'Tz',
      lastName: 'Update',
      passwordHash: 'x'
    }).returning({ id: users.id })
    const [updated] = await db.update(users).set({ firstName: 'Changed' }).where(eq(users.id, user.id)).returning({ createdAt: users.createdAt, updatedAt: users.updatedAt })
    const drift = updated.updatedAt.getTime() - updated.createdAt.getTime()
    expect(drift).toBeGreaterThanOrEqual(0)
    expect(drift).toBeLessThan(MINUTE)
  })
})

describe('cutoffs against default created_at', () => {
  it('deletes an audit log exactly once its retention has passed', async () => {
    await db.delete(auditLogs)
    const [row] = await db.insert(auditLogs)
      .values({
        action: 'GET /cutoff',
        method: 'GET',
        path: '/cutoff',
        status: 200,
        durationMs: 1
      })
      .returning({ createdAt: auditLogs.createdAt })
    const expiry = row.createdAt.getTime() + AUDIT_LOG_RETENTION_DAYS * DAY
    expect((await cleanUpExpiredData(new Date(expiry - MINUTE))).auditLogs).toBe(0)
    expect((await cleanUpExpiredData(new Date(expiry + MINUTE))).auditLogs).toBe(1)
  })

  it('prunes a reminder delivery exactly once it is old enough', async () => {
    const [row] = await db.insert(reminderDeliveries).values({ key: 'tz-cutoff' }).returning({ createdAt: reminderDeliveries.createdAt })
    const expiry = row.createdAt.getTime() + KEEP_DELIVERIES_DAYS * DAY
    const exists = async () => (await db.select().from(reminderDeliveries).where(eq(reminderDeliveries.key, 'tz-cutoff'))).length
    await pruneReminderDeliveries(new Date(expiry - MINUTE))
    expect(await exists()).toBe(1)
    await pruneReminderDeliveries(new Date(expiry + MINUTE))
    expect(await exists()).toBe(0)
  })
})
