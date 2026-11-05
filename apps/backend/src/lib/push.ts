import { and, eq, inArray, lt, sql } from 'drizzle-orm'
// Purpose: Send push notifications to a user's devices, honouring their preferences.
import { Buffer } from 'node:buffer'

import type { WebPushTransport } from '@/lib/web-push'

import db from '@/db'
import { notificationPreferences } from '@/db/schemas/notification-preferences.schema'
import { pushSubscriptions } from '@/db/schemas/push-subscriptions.schema'
import env from '@/env'
import { createWebPushTransport } from '@/lib/web-push'

export const PUSH_CATEGORIES = ['bookings', 'reminders', 'feedback', 'account', 'lessons'] as const
export type PushCategory = typeof PUSH_CATEGORIES[number]

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
  return Object.fromEntries(PUSH_CATEGORIES.map(category => [category, row?.[category] ?? true])) as Record<PushCategory, boolean>
}

async function usersWanting(userIds: string[], category: PushCategory) {
  const optedOut = await db.select({ userId: notificationPreferences.userId })
    .from(notificationPreferences)
    .where(and(inArray(notificationPreferences.userId, userIds), eq(notificationPreferences[category], false)))
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
    const payload = Buffer.from(JSON.stringify(message))

    await Promise.all(targets.map(async (target) => {
      try {
        const { status } = await current.transport(target, payload, {
          ttlSeconds: TTL_SECONDS,
          urgency: category === 'reminders' ? 'high' : 'normal',
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
        await db.update(pushSubscriptions).set({ lastSuccessAt: new Date() }).where(eq(pushSubscriptions.id, target.id))
      }
      catch (error) {
        result.failed += 1
        // The endpoint identifies the device: log only the service host.
        console.error(`Push to ${new URL(target.endpoint).host} failed:`, error instanceof Error ? error.message : error)
      }
    }))
  }
  catch (error) {
    result.failed += 1
    console.error('Push delivery failed:', error)
  }
  return result
}

const pendingPush = new Set<Promise<unknown>>()

// For request handlers: like sendMail, it is not awaited, so shutdown has to wait for it.
export function notifyUsers(userIds: string[], category: PushCategory, message: PushMessage) {
  if (!config) {
    return
  }
  const delivery = deliverPush(userIds, category, message)
  pendingPush.add(delivery)
  void delivery.finally(() => pendingPush.delete(delivery))
}

export async function waitForPendingPush() {
  await Promise.allSettled(pendingPush)
}

export async function saveSubscription(userId: string, subscription: { endpoint: string, p256dh: string, auth: string }) {
  const now = new Date()
  await db.transaction(async (tx) => {
    await tx.insert(pushSubscriptions)
      .values({ userId, ...subscription, updatedAt: now })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { userId, p256dh: subscription.p256dh, auth: subscription.auth, updatedAt: now }
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
