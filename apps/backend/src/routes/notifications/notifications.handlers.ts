// Purpose: Push subscription and notification preference handlers.
import type { Context } from 'hono'

import { count, eq } from 'drizzle-orm'

import type { AppBindings, AppRouteHandler } from '@/lib/types'

import db from '@/db'
import { notificationPreferences } from '@/db/schemas/notification-preferences.schema'
import { pushSubscriptions } from '@/db/schemas/push-subscriptions.schema'
import { buildPushSetupLinkMessage } from '@/lib/email-templates'
import { buildErrorResponse } from '@/lib/error-response'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { sendMail } from '@/lib/mailer'
import { getPushPublicKey, isPushEnabled, getPreferences as readPreferences, removeSubscription, saveSubscription } from '@/lib/push'
import { isAllowedPushEndpoint, isValidSubscriptionKeys } from '@/lib/web-push'

import type { GetDevicesRoute, GetPreferencesRoute, GetPushConfigRoute, SendSetupLinkRoute, SubscribeRoute, UnsubscribeRoute, UpdatePreferencesRoute } from './notifications.routes'

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
