// Purpose: Pin that the notification stream follows the unread count, whoever writes the rows.
import { sign } from 'hono/jwt'
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import app from '@/app'
import db, { closeDb } from '@/db'
import { notifications } from '@/db/schemas/notifications.schema'
import env from '@/env'
import { cleanDatabase } from '@/lib/db-cleanup'
import { DEV_PASSWORD, seedDevelopmentData } from '@/lib/dev-seed'
import { assertLocalDatabase } from '@/lib/local-database'
import { closeMailer, waitForPendingMail } from '@/lib/mailer'
import { recordNotifications } from '@/lib/notification-inbox'
import {
  closeNotificationStreams,
  MAX_STREAMS_PER_USER,
  openStreamCount,
  restartNotificationStreams,
  whenListening
} from '@/lib/notification-stream'
import { resetRateLimiters } from '@/middlewares/rate-limit'

const message = { title: 'Prenotazione confermata', body: 'Matematica, oggi alle 14:30', url: '/student/lessons' }

let ids: Record<string, string>
const tokens: Record<string, string> = {}
const opened: Array<{ cancel: () => Promise<void> }> = []

// Reads the stream as the browser does, one `unread` event at a time.
async function openStream(token: string) {
  const response = await app.request('/notifications/inbox/stream', {
    headers: { Authorization: `Bearer ${token}` }
  })
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toContain('text/event-stream')

  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader()
  const counts: number[] = []
  const waiters: Array<() => void> = []
  let buffer = ''
  let ended = false

  const done = (async () => {
    while (true) {
      const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }))
      if (done)
        break
      buffer += value
      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const block = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const data = block.split('\n').find(line => line.startsWith('data:'))
        if (block.includes('event: unread') && data) {
          counts.push(JSON.parse(data.slice(5)).count)
          waiters.splice(0).forEach(wake => wake())
        }
        boundary = buffer.indexOf('\n\n')
      }
    }
    ended = true
    waiters.splice(0).forEach(wake => wake())
  })()

  const stream = {
    counts,
    get ended() {
      return ended
    },
    done,
    // Waits until the latest count is the expected one.
    async until(expected: number, timeoutMs = 5_000) {
      const deadline = Date.now() + timeoutMs
      while (counts.at(-1) !== expected) {
        if (ended)
          throw new Error(`stream ended at ${JSON.stringify(counts)}, expected ${expected}`)
        const left = deadline - Date.now()
        if (left <= 0)
          throw new Error(`got ${JSON.stringify(counts)}, expected ${expected}`)
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, left)
          waiters.push(() => {
            clearTimeout(timer)
            resolve()
          })
        })
      }
    },
    cancel: async () => {
      await reader.cancel().catch(() => undefined)
      await done
    }
  }
  opened.push(stream)
  return stream
}

// Once listening, the streams read their count again: let those events pass first.
async function settled() {
  await whenListening()
  await new Promise(resolve => setTimeout(resolve, 200))
}

async function login(role: string) {
  const response = await app.request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `${role}@example.test`, password: DEV_PASSWORD })
  })
  return (await response.json()).accessToken as string
}

// Another process, like a scheduled job in its own container: its writes reach the API only
// through PostgreSQL.
async function insertFromAnotherProcess(userId: string) {
  const other = new Client({ connectionString: env.DATABASE_URL })
  await other.connect()
  try {
    await other.query(
      'insert into notifications (id, user_id, category, title, body, url) values ($1, $2, $3, $4, $5, $6)',
      [
        randomUUID(),
        userId,
        'lessons',
        message.title,
        message.body,
        message.url
      ]
    )
  }
  finally {
    await other.end()
  }
}

beforeAll(async () => {
  assertLocalDatabase(env.DATABASE_URL, env.NODE_ENV)
  await cleanDatabase()
  ids = await seedDevelopmentData()
  resetRateLimiters()
  for (const role of [
    'admin',
    'tutor',
    'student',
    'activator'
  ]) {
    tokens[role] = await login(role)
  }
})

beforeEach(async () => {
  await db.delete(notifications)
})

afterEach(async () => {
  await Promise.all(opened.splice(0).map(stream => stream.cancel()))
})

afterAll(async () => {
  await closeNotificationStreams()
  await waitForPendingMail()
  closeMailer()
  await closeDb()
})

describe('notification stream', () => {
  it('sends the count on opening, then after every change', async () => {
    await recordNotifications([ids.student], 'bookings', message)
    const stream = await openStream(tokens.student)
    await stream.until(1)
    await settled()

    await recordNotifications([ids.student], 'bookings', message)
    await stream.until(2)

    const read = await app.request('/notifications/inbox/read-all', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.student}` }
    })
    expect(read.status).toBe(204)
    await stream.until(0)
  })

  it('hears the rows a job writes from another process', async () => {
    const stream = await openStream(tokens.tutor)
    await stream.until(0)
    await settled()

    await insertFromAnotherProcess(ids.tutor)
    await stream.until(1)
  })

  it('tells each user only about their own count', async () => {
    const student = await openStream(tokens.student)
    await student.until(0)
    await settled()
    const before = student.counts.length

    await recordNotifications([ids.tutor], 'bookings', message)
    await recordNotifications([ids.student], 'bookings', message)
    await student.until(1)
    // Nothing for the tutor's row: the next event is the student's own.
    expect(student.counts.slice(before)).toEqual([1])
  })

  it('refuses activators and anonymous requests', async () => {
    const activator = await app.request('/notifications/inbox/stream', {
      headers: { Authorization: `Bearer ${tokens.activator}` }
    })
    expect(activator.status).toBe(403)
    expect((await app.request('/notifications/inbox/stream')).status).toBe(401)
  })

  it('ends when the access token expires', async () => {
    const now = Math.floor(Date.now() / 1000)
    const shortLived = await sign({
      sub: ids.student,
      email: 'student@example.test',
      role: 'student',
      exp: now + 2,
      iss: 'iepf-backend',
      iat: now,
      jti: randomUUID()
    }, env.JWT_SECRET)

    const stream = await openStream(shortLived)
    await stream.until(0)
    await stream.done
    expect(stream.ended).toBe(true)
  })

  it(`keeps at most ${MAX_STREAMS_PER_USER} streams per user, ending the oldest`, async () => {
    const first = await openStream(tokens.admin)
    await first.until(0)
    for (let index = 0; index < MAX_STREAMS_PER_USER; index++) {
      await openStream(tokens.admin)
    }
    await first.done
    expect(first.ended).toBe(true)
  })

  it('ends every stream on shutdown, and any opened during it', async () => {
    const streams = [await openStream(tokens.student), await openStream(tokens.tutor)]
    await Promise.all(streams.map(stream => stream.until(0)))

    await closeNotificationStreams()
    await Promise.all(streams.map(stream => stream.done))
    expect(openStreamCount()).toBe(0)

    const late = await openStream(tokens.student)
    await late.done
    expect(late.counts).toEqual([])

    restartNotificationStreams()
  })
})
