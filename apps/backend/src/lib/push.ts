import { and, eq, inArray, lt, sql } from 'drizzle-orm'
// Purpose: Send push notifications to a user's devices, honouring their preferences.
import { Buffer } from 'node:buffer'

import type { WebPushTransport } from '@/lib/web-push'

import db from '@/db'
import { notificationPreferences } from '@/db/schemas/notification-preferences.schema'
import { pushSubscriptions } from '@/db/schemas/push-subscriptions.schema'
import env from '@/env'
import { countInBackground } from '@/lib/analytics'
import { recordNotifications, unreadCounts } from '@/lib/notification-inbox'
import { createWebPushTransport } from '@/lib/web-push'

// Students and tutors switch these off by push; the panel keeps them anyway.
export const USER_CATEGORIES = [
  'bookings',
  'reminders',
  'feedback',
  'lessons'
] as const
// Admins only; each one goes out by push and by email, switched on and off separately.
export const ADMIN_CATEGORIES = [
  'adminLowFeedback',
  'adminLateCancellations',
  'adminAbsences',
  'adminPendingAdmins',
  'adminSubjectRequests',
  'adminMissingPresence'
] as const
// Always sent, on every channel: news that changes what someone has to do or where they have
// to be, and that they did not decide themselves. No switch turns them off.
export const ALWAYS_ON_CATEGORIES = ['updates', 'account', 'adminEmptyWeek'] as const
export const PUSH_CATEGORIES = [
  ...USER_CATEGORIES,
  ...ADMIN_CATEGORIES,
  ...ALWAYS_ON_CATEGORIES
] as const
export type PushCategory = typeof PUSH_CATEGORIES[number]
export type AdminCategory = typeof ADMIN_CATEGORIES[number]
// What an admin notice goes out as: a switchable kind, or the empty week that is always sent.
export type AdminNoticeCategory = AdminCategory | 'adminEmptyWeek'
export type EmailPreference = `email${Capitalize<AdminCategory>}`

export function emailPreference<C extends AdminNoticeCategory>(category: C) {
  return `email${category.charAt(0).toUpperCase()}${category.slice(1)}` as `email${Capitalize<C>}`
}

export const SWITCHABLE_CATEGORIES = [
  ...USER_CATEGORIES,
  ...ADMIN_CATEGORIES
] as const
export const PREFERENCE_KEYS = [
  ...SWITCHABLE_CATEGORIES,
  ...ADMIN_CATEGORIES.map(emailPreference)
] as const
export type PreferenceKey = typeof SWITCHABLE_CATEGORIES[number] | EmailPreference

export function isPreferenceKey(key: string): key is PreferenceKey {
  return (PREFERENCE_KEYS as readonly string[]).includes(key)
}

export interface PushMessage {
  title: string
  body: string
  // A path on the site, opened when the notification is clicked.
  url: string
  // Notifications with the same tag replace each other on the device.
  tag?: string
}

// A device that went this long without a delivery or a refresh is most likely gone.
export const STALE_SUBSCRIPTION_DAYS = 120
export const MAX_SUBSCRIPTIONS_PER_USER = 10
// Lesson news is useless after a day; the push service drops it rather than deliver it late.
const TTL_SECONDS = 24 * 60 * 60

interface PushConfig {
  publicKey: string
  transport: WebPushTransport
}

function configFromEnv(): PushConfig | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) {
    return null
  }
  return {
    publicKey: env.VAPID_PUBLIC_KEY,
    transport: createWebPushTransport({
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
      subject: env.VAPID_SUBJECT
    })
  }
}

let config = configFromEnv()

// Tests replace the transport so that nothing leaves the machine.
export function setPushConfig(next: PushConfig | null) {
  config = next
}

export function isPushEnabled() {
  return config !== null
}

export function getPushPublicKey() {
  return config?.publicKey ?? null
}

export async function getPreferences(userId: string) {
  const row = await db.query.notificationPreferences.findFirst({
    where(fields, operators) {
      return operators.eq(fields.userId, userId)
    }
  })
  return Object.fromEntries(PREFERENCE_KEYS.map(key => [key, row?.[key] ?? true])) as Record<PreferenceKey, boolean>
}

// Users without a row have every kind switched on; an always-on kind reaches everyone.
export async function usersWanting(userIds: string[], key: PushCategory | `email${Capitalize<AdminNoticeCategory>}`) {
  if (userIds.length === 0 || !isPreferenceKey(key)) {
    return userIds
  }
  const optedOut = await db.select({ userId: notificationPreferences.userId })
    .from(notificationPreferences)
    .where(and(inArray(notificationPreferences.userId, userIds), eq(notificationPreferences[key], false)))
  const excluded = new Set(optedOut.map(row => row.userId))
  return userIds.filter(id => !excluded.has(id))
}

export interface PushResult {
  delivered: number
  // Failures that may succeed later; expired subscriptions are removed and not counted.
  failed: number
}

// Never throws: a lost notification must not break the request or the email beside it.
export async function deliverPush(userIds: string[], category: PushCategory, message: PushMessage): Promise<PushResult> {
  const result = { delivered: 0, failed: 0 }
  const current = config
  const unique = Array.from(new Set(userIds))
  if (!current || unique.length === 0) {
    return result
  }
  try {
    const recipients = await usersWanting(unique, category)
    if (recipients.length === 0) {
      return result
    }
    const targets = await db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, recipients))
    // Each user's unread count rides along, for the badge on the app icon.
    const unread = await unreadCounts(recipients)
    const payloads = new Map(recipients.map(userId => [
      userId,
      // The category lets the service worker count opens per kind of notification.
      Buffer.from(JSON.stringify({ ...message, category, badge: unread.get(userId) ?? 0 }))
    ]))

    await Promise.all(targets.map(async (target) => {
      try {
        const { status } = await current.transport(target, payloads.get(target.userId)!, {
          ttlSeconds: TTL_SECONDS,
          urgency: category === 'reminders'
            ? 'high'
            : 'normal',
          topic: message.tag
        })
        if (status === 404 || status === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, target.id))
          return
        }
        if (status < 200 || status >= 300) {
          throw new Error(`push service answered ${status}`)
        }
        result.delivered += 1
        await db.update(pushSubscriptions).set({
          lastSuccessAt: new Date()
        }).where(eq(pushSubscriptions.id, target.id))
      }
      catch (error) {
        result.failed += 1
        // The endpoint identifies the device: log only the service host.
        console.error(`Push to ${new URL(target.endpoint).host} failed:`, error instanceof Error
          ? error.message
          : error)
      }
    }))
  }
  catch (error) {
    result.failed += 1
    console.error('Push delivery failed:', error)
  }
  if (result.delivered > 0) {
    countInBackground(null, 'push_sent', category, result.delivered)
  }
  return result
}

const pendingPush = new Set<Promise<unknown>>()

// For request handlers: like sendMail, it is not awaited, so shutdown has to wait for it.
// The panel keeps every notification, so it is written even when push is off.
export function notifyUsers(userIds: string[], category: PushCategory, message: PushMessage) {
  const recorded = recordNotifications(userIds, category, message)
  trackNotificationTask(recorded)
  if (!config) {
    return
  }
  // After the panel entry, so the badge count sent with the push already includes it.
  const delivery = recorded.then(() => deliverPush(userIds, category, message))
  pendingPush.add(delivery)
  void delivery.finally(() => pendingPush.delete(delivery))
}

// Other fire-and-forget notification work that shutdown must wait for.
export function trackNotificationTask(task: Promise<unknown>) {
  pendingPush.add(task)
  void task.finally(() => pendingPush.delete(task))
}

// Tasks can start more deliveries (an admin notice does), so wait until none is left.
export async function waitForPendingPush() {
  while (pendingPush.size > 0) {
    await Promise.allSettled([...pendingPush])
  }
}

export async function saveSubscription(userId: string, subscription: { endpoint: string, p256dh: string, auth: string }) {
  const now = new Date()
  await db.transaction(async (tx) => {
    await tx.insert(pushSubscriptions)
      .values({ userId, ...subscription, updatedAt: now })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          userId,
          p256dh: subscription.p256dh,
          auth: subscription.auth,
          updatedAt: now
        }
      })
    // Keep the newest devices only, so a user cannot pile up endpoints without limit.
    const keep = tx.select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId))
      .orderBy(sql`${pushSubscriptions.updatedAt} desc`)
      .limit(MAX_SUBSCRIPTIONS_PER_USER)
    await tx.delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, userId), sql`${pushSubscriptions.id} not in ${keep}`))
  })
}

export async function removeSubscription(userId: string, endpoint: string) {
  await db.delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
}

export async function deleteStaleSubscriptions(now = new Date()) {
  const cutoff = new Date(now.getTime() - STALE_SUBSCRIPTION_DAYS * 24 * 60 * 60 * 1000)
  const result = await db.delete(pushSubscriptions)
    .where(lt(sql`greatest(${pushSubscriptions.updatedAt}, coalesce(${pushSubscriptions.lastSuccessAt}, ${pushSubscriptions.updatedAt}))`, cutoff))
  return result.rowCount ?? 0
}
