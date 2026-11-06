// Purpose: Tell the open notification streams when a user's unread count may have changed.
// The rows are written by this process and by scheduled jobs in other containers, so the
// signal comes from PostgreSQL: a trigger on notifications sends NOTIFY, one client LISTENs.
import { Client } from 'pg'

import env from '@/env'

export const NOTIFICATION_CHANNEL = 'iepf_notifications'
// Enough for every tab and device a person really uses; older streams give way to newer ones.
export const MAX_STREAMS_PER_USER = 10

const RETRY_MIN_MS = 1_000
const RETRY_MAX_MS = 30_000

export interface StreamSubscriber {
  // The count may have changed: read it again.
  changed: () => void
  // The stream must end now: the server is stopping, or the user opened too many.
  close: () => void
}

const byUser = new Map<string, Set<StreamSubscriber>>()
let client: Client | null = null
let connecting: Promise<void> | null = null
let retryTimer: NodeJS.Timeout | null = null
let retryDelay = RETRY_MIN_MS
let stopped = false

function everySubscriber() {
  return Array.from(byUser.values()).flatMap(set => Array.from(set))
}

function scheduleRetry() {
  if (stopped || retryTimer || byUser.size === 0) {
    return
  }
  retryTimer = setTimeout(() => {
    retryTimer = null
    ensureListening()
  }, retryDelay)
  retryTimer.unref()
  retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS)
}

function lost(which: Client) {
  if (client !== which) {
    return
  }
  client = null
  scheduleRetry()
}

async function connect() {
  const next = new Client({ connectionString: env.DATABASE_URL })
  next.on('notification', (message) => {
    if (message.channel !== NOTIFICATION_CHANNEL || !message.payload) {
      return
    }
    byUser.get(message.payload)?.forEach(subscriber => subscriber.changed())
  })
  next.on('error', (error) => {
    console.error('Notification listener error:', error)
    lost(next)
  })
  next.on('end', () => lost(next))

  try {
    await next.connect()
    await next.query(`LISTEN ${NOTIFICATION_CHANNEL}`)
  }
  catch (error) {
    console.error('Notification listener failed to start:', error)
    await next.end().catch(() => undefined)
    scheduleRetry()
    return
  }

  if (stopped) {
    await next.end().catch(() => undefined)
    return
  }
  client = next
  retryDelay = RETRY_MIN_MS
  // Whatever happened while nobody was listening is unknown: every stream reads its count again.
  everySubscriber().forEach(subscriber => subscriber.changed())
}

function ensureListening() {
  if (stopped || client || connecting) {
    return
  }
  connecting = connect().finally(() => {
    connecting = null
  })
}

// Returns the function that removes the subscriber again.
export function subscribe(userId: string, subscriber: StreamSubscriber) {
  // A request that arrives on a kept-alive connection during shutdown ends at once.
  if (stopped) {
    queueMicrotask(subscriber.close)
    return () => undefined
  }
  let set = byUser.get(userId)
  if (!set) {
    set = new Set()
    byUser.set(userId, set)
  }
  set.add(subscriber)
  if (set.size > MAX_STREAMS_PER_USER) {
    const oldest = set.values().next().value
    if (oldest) {
      set.delete(oldest)
      oldest.close()
    }
  }
  ensureListening()

  return () => {
    const current = byUser.get(userId)
    current?.delete(subscriber)
    if (current?.size === 0) {
      byUser.delete(userId)
    }
  }
}

// Resolves once the listener is connected, or at once if it is not starting.
export async function whenListening() {
  await connecting
}

export function openStreamCount() {
  return everySubscriber().length
}

// A shutdown step: ends every stream, so server.close() finds no response still open.
export async function closeNotificationStreams() {
  stopped = true
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
  const subscribers = everySubscriber()
  byUser.clear()
  subscribers.forEach(subscriber => subscriber.close())
  await connecting
  const current = client
  client = null
  await current?.end().catch(() => undefined)
}

// Tests only: lets a suite open streams again after closing them.
export function restartNotificationStreams() {
  stopped = false
  retryDelay = RETRY_MIN_MS
}
