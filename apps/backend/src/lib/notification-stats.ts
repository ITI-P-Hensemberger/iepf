// Purpose: Notification figures for admins, shared by the stats page and the year report:
// panel notifications by category, push devices by service, push kinds people turned off.
import { sql } from 'drizzle-orm'

import db from '@/db'
import { notificationPreferences } from '@/db/schemas/notification-preferences.schema'
import { notifications } from '@/db/schemas/notifications.schema'
import { pushSubscriptions } from '@/db/schemas/push-subscriptions.schema'
import { KEEP_NOTIFICATIONS_DAYS } from '@/lib/notification-inbox'
import { SWITCHABLE_CATEGORIES } from '@/lib/push'

export interface NotificationStats {
  keepDays: number
  inbox: Array<{ category: string, total: number, read: number }>
  devices: Array<{ service: string, devices: number, workingLast30Days: number }>
  optOuts: Array<{ category: string, users: number }>
}

// The push service a device uses, from the host of its endpoint: it says which browsers people use.
const pushService = sql<string>`case
  when ${pushSubscriptions.endpoint} like 'https://fcm.googleapis.com/%' then 'google'
  when ${pushSubscriptions.endpoint} like 'https://web.push.apple.com/%' then 'apple'
  when ${pushSubscriptions.endpoint} like '%.mozilla.com/%' then 'mozilla'
  when ${pushSubscriptions.endpoint} like '%.notify.windows.com/%' then 'microsoft'
  else 'other' end`

export async function readNotificationStats(): Promise<NotificationStats> {
  const [inbox, devices, preferenceRows] = await Promise.all([
    db.select({
      category: notifications.category,
      total: sql<number>`count(*)::int`,
      read: sql<number>`count(${notifications.readAt})::int`
    }).from(notifications).groupBy(notifications.category),
    db.select({
      service: pushService,
      devices: sql<number>`count(*)::int`,
      workingLast30Days: sql<number>`count(*) filter (where ${pushSubscriptions.lastSuccessAt} > now() - interval '30 days')::int`
    }).from(pushSubscriptions).groupBy(pushService),
    db.select(Object.fromEntries(SWITCHABLE_CATEGORIES.map(category => [
      category,
      sql<number>`count(*) filter (where ${notificationPreferences[category]} = false)::int`
    ])) as Record<typeof SWITCHABLE_CATEGORIES[number], ReturnType<typeof sql<number>>>).from(notificationPreferences)
  ])
  const optOuts = preferenceRows[0] as Record<string, number> | undefined
  return {
    keepDays: KEEP_NOTIFICATIONS_DAYS,
    inbox: inbox.sort((a, b) => b.total - a.total),
    devices: devices.sort((a, b) => b.devices - a.devices),
    optOuts: SWITCHABLE_CATEGORIES.map(category => ({ category, users: Number(optOuts?.[category] ?? 0) })).filter(row => row.users > 0)
  }
}
