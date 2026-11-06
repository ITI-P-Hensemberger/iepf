// Purpose: Push subscription and notification preference handlers.
import type { Context } from 'hono'

import { count, eq } from 'drizzle-orm'
import { streamSSE } from 'hono/streaming'

import type { AppBindings, AppRouteHandler } from '@/lib/types'

import db from '@/db'
import { notificationPreferences } from '@/db/schemas/notification-preferences.schema'
import { pushSubscriptions } from '@/db/schemas/push-subscriptions.schema'
import { buildPushSetupLinkMessage } from '@/lib/email-templates'
import { buildErrorResponse } from '@/lib/error-response'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { sendMail } from '@/lib/mailer'
import * as inbox from '@/lib/notification-inbox'
import * as notificationStream from '@/lib/notification-stream'
import { getPushPublicKey, isPushEnabled, getPreferences as readPreferences, removeSubscription, saveSubscription } from '@/lib/push'
import { isAllowedPushEndpoint, isValidSubscriptionKeys } from '@/lib/web-push'

import type { GetDevicesRoute, GetInboxRoute, GetPreferencesRoute, GetPushConfigRoute, GetUnreadRoute, MarkAllReadRoute, MarkReadRoute, SendSetupLinkRoute, StreamInboxRoute, SubscribeRoute, UnsubscribeRoute, UpdatePreferencesRoute } from './notifications.routes'

// Activators get no notifications.
const RECIPIENT_ROLES = new Set(['student', 'tutor', 'admin'])

// Only the user in person: an admin impersonating a student must not route the student's
// notifications to the admin's browser, nor change what a minor receives.
function personalUser(c: Context<AppBindings>) {
  const currentUser = c.get('currentUser')
  if (!currentUser || c.get('impersonation') || !RECIPIENT_ROLES.has(currentUser.role)) {
    return null
  }
  return currentUser
}

function forbidden(c: Context<AppBindings>) {
  return c.json(buildErrorResponse(HttpStatusPhrases.FORBIDDEN), HttpStatusCodes.FORBIDDEN)
}

export const getPushConfig: AppRouteHandler<GetPushConfigRoute> = async (c) => {
  return c.json({ enabled: isPushEnabled(), publicKey: getPushPublicKey() }, HttpStatusCodes.OK)
}

export const subscribe: AppRouteHandler<SubscribeRoute> = async (c) => {
  const user = personalUser(c)
  if (!user) {
    return forbidden(c)
  }
  if (!isPushEnabled()) {
    return c.json(buildErrorResponse(HttpStatusPhrases.SERVICE_UNAVAILABLE), HttpStatusCodes.SERVICE_UNAVAILABLE)
  }
  const { endpoint, keys } = c.req.valid('json')
  if (!isAllowedPushEndpoint(endpoint) || !isValidSubscriptionKeys(keys.p256dh, keys.auth)) {
    return c.json(buildErrorResponse('Sottoscrizione non valida'), HttpStatusCodes.UNPROCESSABLE_ENTITY)
  }
  await saveSubscription(user.id, { endpoint, p256dh: keys.p256dh, auth: keys.auth })
  return c.body(null, HttpStatusCodes.NO_CONTENT)
}

// Allowed while impersonating too: it can only remove the current user's own device.
export const unsubscribe: AppRouteHandler<UnsubscribeRoute> = async (c) => {
  const currentUser = c.get('currentUser')!
  const { endpoint } = c.req.valid('json')
  await removeSubscription(currentUser.id, endpoint)
  return c.body(null, HttpStatusCodes.NO_CONTENT)
}

export const getPreferences: AppRouteHandler<GetPreferencesRoute> = async (c) => {
  const currentUser = c.get('currentUser')
  if (!currentUser || !RECIPIENT_ROLES.has(currentUser.role)) {
    return forbidden(c)
  }
  return c.json(await readPreferences(currentUser.id), HttpStatusCodes.OK)
}

export const updatePreferences: AppRouteHandler<UpdatePreferencesRoute> = async (c) => {
  const user = personalUser(c)
  if (!user) {
    return forbidden(c)
  }
  const changes = c.req.valid('json')
  const merged = { ...(await readPreferences(user.id)), ...changes }
  await db.insert(notificationPreferences)
    .values({ userId: user.id, ...merged })
    .onConflictDoUpdate({ target: notificationPreferences.userId, set: merged })
  return c.json(merged, HttpStatusCodes.OK)
}

// Lets a computer know whether the user already receives push on some device, the phone above all.
export const getDevices: AppRouteHandler<GetDevicesRoute> = async (c) => {
  const currentUser = c.get('currentUser')!
  const [row] = await db.select({ count: count() })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, currentUser.id))
  return c.json({ count: row?.count ?? 0 }, HttpStatusCodes.OK)
}

// The link goes only to the user's own address, which already holds their account.
export const sendSetupLink: AppRouteHandler<SendSetupLinkRoute> = async (c) => {
  const user = personalUser(c)
  if (!user) {
    return forbidden(c)
  }
  const message = buildPushSetupLinkMessage()
  void sendMail({ to: user.email, ...message }).catch(() => undefined)
  return c.body(null, HttpStatusCodes.NO_CONTENT)
}

// The panel belongs to the user being viewed, so an impersonating admin sees the student's
// notifications; only reading them is reserved to the user in person.
function inboxUser(c: Context<AppBindings>) {
  const currentUser = c.get('currentUser')
  if (!currentUser || !RECIPIENT_ROLES.has(currentUser.role)) {
    return null
  }
  return currentUser
}

export const getInbox: AppRouteHandler<GetInboxRoute> = async (c) => {
  const user = inboxUser(c)
  if (!user) {
    return forbidden(c)
  }
  const { cursor, limit } = c.req.valid('query')
  const decoded = cursor ? inbox.decodeCursor(cursor) : null
  if (cursor && !decoded) {
    return c.json(buildErrorResponse('Cursore non valido'), HttpStatusCodes.UNPROCESSABLE_ENTITY)
  }
  const [page, unread] = await Promise.all([
    inbox.listNotifications(user.id, decoded, limit),
    inbox.countUnread(user.id)
  ])
  return c.json({
    items: page.items.map(item => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      readAt: item.readAt?.toISOString() ?? null
    })),
    nextCursor: page.nextCursor,
    unread
  }, HttpStatusCodes.OK)
}

export const getUnread: AppRouteHandler<GetUnreadRoute> = async (c) => {
  const user = inboxUser(c)
  if (!user) {
    return forbidden(c)
  }
  return c.json({ count: await inbox.countUnread(user.id) }, HttpStatusCodes.OK)
}

// A comment line now and then keeps idle proxies and the frontend's fetch from dropping it.
export const STREAM_HEARTBEAT_MS = 25_000
// setTimeout cannot wait longer than this.
const MAX_TIMER_MS = 2_147_483_647

export const streamInbox: AppRouteHandler<StreamInboxRoute> = async (c) => {
  const user = inboxUser(c)
  if (!user) {
    return forbidden(c)
  }
  const expiresAt = c.get('accessTokenExpiresAt')
  c.header('Cache-Control', 'no-cache, no-transform')
  c.header('X-Accel-Buffering', 'no')

  return streamSSE(c, async (stream) => {
    // Changed from callbacks, so kept on an object the loop reads each time round.
    const state = { dirty: true, ended: false }
    let wake: (() => void) | null = null
    const nudge = () => {
      const resolve = wake
      wake = null
      resolve?.()
    }
    const end = () => {
      state.ended = true
      nudge()
    }

    const unsubscribe = notificationStream.subscribe(user.id, {
      changed: () => {
        state.dirty = true
        nudge()
      },
      close: end
    })
    stream.onAbort(end)
    const heartbeat = setInterval(() => {
      stream.write(': ping\n\n').catch(end)
    }, STREAM_HEARTBEAT_MS)
    // Past the token's expiry the user may be gone or deactivated: the client must reconnect.
    const expiry = expiresAt
      ? setTimeout(end, Math.min(Math.max(0, expiresAt * 1000 - Date.now()), MAX_TIMER_MS))
      : null

    try {
      while (!state.ended) {
        if (!state.dirty) {
          await new Promise<void>((resolve) => {
            wake = resolve
          })
          continue
        }
        // Many changes in a row collapse into one read of the count.
        state.dirty = false
        const unread = await inbox.countUnread(user.id)
        if (!state.ended) {
          await stream.writeSSE({ event: 'unread', data: JSON.stringify({ count: unread }) })
        }
      }
    }
    finally {
      clearInterval(heartbeat)
      if (expiry) {
        clearTimeout(expiry)
      }
      unsubscribe()
    }
  }, async (error) => {
    console.error('Notification stream failed:', error)
  })
}

export const markRead: AppRouteHandler<MarkReadRoute> = async (c) => {
  const user = inboxUser(c)
  if (!user) {
    return forbidden(c)
  }
  if (!c.get('impersonation')) {
    await inbox.markRead(user.id, c.req.valid('param').id)
  }
  return c.body(null, HttpStatusCodes.NO_CONTENT)
}

export const markAllRead: AppRouteHandler<MarkAllReadRoute> = async (c) => {
  const user = inboxUser(c)
  if (!user) {
    return forbidden(c)
  }
  if (!c.get('impersonation')) {
    await inbox.markAllRead(user.id)
  }
  return c.body(null, HttpStatusCodes.NO_CONTENT)
}
