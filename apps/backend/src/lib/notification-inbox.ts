import { and, count, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm'
// Purpose: Keep every notification in the user's panel, whatever their push preferences.
import { Buffer } from 'node:buffer'

import type { PushCategory, PushMessage } from '@/lib/push'

import db from '@/db'
import { notifications } from '@/db/schemas/notifications.schema'

export const KEEP_NOTIFICATIONS_DAYS = 90
export const NOTIFICATIONS_PAGE_SIZE = 20

// Never throws, like push: the panel must not break the request or the email beside it.
// Returns false when nothing could be written, so a reminder can give its claim back.
export async function recordNotifications(userIds: string[], category: PushCategory, message: PushMessage) {
  const unique = Array.from(new Set(userIds))
  if (unique.length === 0) {
    return true
  }
  try {
    await db.insert(notifications).values(unique.map(userId => ({
      userId,
      category,
      title: message.title,
      body: message.body,
      url: message.url
    })))
    return true
  }
  catch (error) {
    console.error('Failed to record notification:', error)
    return false
  }
}

// The cursor is the last row of the previous page: createdAt and id, so rows written in the
// same instant are neither skipped nor repeated, and new arrivals do not shift the pages.
export interface NotificationCursor {
  createdAt: Date
  id: string
}

export function encodeCursor(cursor: NotificationCursor) {
  return Buffer.from(`${cursor.createdAt.toISOString()}|${cursor.id}`).toString('base64url')
}

export function decodeCursor(value: string): NotificationCursor | null {
  const [iso, id] = Buffer.from(value, 'base64url').toString().split('|')
  const createdAt = new Date(iso ?? '')
  if (!id || Number.isNaN(createdAt.getTime()) || !/^[0-9a-f-]{36}$/i.test(id)) {
    return null
  }
  return { createdAt, id }
}

export async function listNotifications(userId: string, cursor: NotificationCursor | null, limit = NOTIFICATIONS_PAGE_SIZE) {
  const rows = await db.select({
    id: notifications.id,
    category: notifications.category,
    title: notifications.title,
    body: notifications.body,
    url: notifications.url,
    createdAt: notifications.createdAt,
    readAt: notifications.readAt
  })
    .from(notifications)
    .where(and(
      eq(notifications.userId, userId),
      isNull(notifications.archivedAt),
      cursor
        ? or(
            lt(notifications.createdAt, cursor.createdAt),
            and(eq(notifications.createdAt, cursor.createdAt), lt(notifications.id, cursor.id))
          )
        : undefined
    ))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit + 1)

  const page = rows.slice(0, limit)
  const last = page.at(-1)
  return {
    items: page,
    nextCursor: rows.length > limit && last ? encodeCursor(last) : null
  }
}

export async function countUnread(userId: string) {
  return db.$count(notifications, and(eq(notifications.userId, userId), isNull(notifications.readAt), isNull(notifications.archivedAt)))
}

export async function unreadCounts(userIds: string[]) {
  if (userIds.length === 0) {
    return new Map<string, number>()
  }
  const rows = await db.select({ userId: notifications.userId, count: count() })
    .from(notifications)
    .where(and(inArray(notifications.userId, userIds), isNull(notifications.readAt), isNull(notifications.archivedAt)))
    .groupBy(notifications.userId)
  return new Map(rows.map(row => [row.userId, row.count]))
}

// Only the user's own notification: another id simply matches nothing.
export async function markRead(userId: string, id: string) {
  await db.update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId), isNull(notifications.readAt)))
}

export async function markAllRead(userId: string) {
  await db.update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
}

// "Elimina" in the panel: the notification is read and archived, not deleted, so the
// statistics and the retention keep seeing it.
export async function archive(userId: string, id: string) {
  const now = new Date()
  await db.update(notifications)
    .set({ readAt: sql`coalesce(${notifications.readAt}, ${now})`, archivedAt: now })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId), isNull(notifications.archivedAt)))
}
