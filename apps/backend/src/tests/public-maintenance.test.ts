// Purpose: Pin the public maintenance state the site reads before showing any page.
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import app from '@/app'
import db, { closeDb } from '@/db'
import { globalSettings } from '@/db/schemas/global-settings.schema'
import env from '@/env'
import { cleanDatabase } from '@/lib/db-cleanup'
import { assertLocalDatabase } from '@/lib/local-database'

async function setMaintenance(value: unknown) {
  await db.insert(globalSettings)
    .values({ key: 'maintenance', value })
    .onConflictDoUpdate({
      target: globalSettings.key,
      set: { value }
    })
}

beforeAll(async () => {
  assertLocalDatabase(env.DATABASE_URL, env.NODE_ENV)
  await cleanDatabase()
})

afterAll(async () => {
  await db.delete(globalSettings).where(eq(globalSettings.key, 'maintenance'))
  await closeDb()
})

describe('public maintenance state', () => {
  it('answers without a session, off by default', async () => {
    await db.delete(globalSettings).where(eq(globalSettings.key, 'maintenance'))
    const response = await app.request('/maintenance')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      enabled: false,
      message: null,
      roles: ['student', 'tutor']
    })
  })

  it('reports the message and the roles it applies to', async () => {
    await setMaintenance({
      enabled: true,
      message: 'Torniamo alle 18',
      roles: ['tutor']
    })
    const response = await app.request('/maintenance')
    expect(await response.json()).toEqual({
      enabled: true,
      message: 'Torniamo alle 18',
      roles: ['tutor']
    })
  })

  it('falls back to off when the stored value is malformed', async () => {
    await setMaintenance({ enabled: 'yes' })
    const response = await app.request('/maintenance')
    expect(await response.json()).toEqual({
      enabled: false,
      message: null,
      roles: ['student', 'tutor']
    })
  })
})
