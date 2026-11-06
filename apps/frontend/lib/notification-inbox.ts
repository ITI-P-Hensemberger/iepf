import { differenceInCalendarDays, format, formatDistanceStrict } from 'date-fns'
import { it } from 'date-fns/locale'

export type InboxItem = {
  id: string
  category: string
  title: string
  body: string
  url: string
  createdAt: string
  readAt: string | null
}

export type InboxPage = {
  items: InboxItem[]
  nextCursor: string | null
  unread: number
}

// Sent by the service worker when a push arrives, and by the panel when it changes the count.
export const NOTIFICATION_EVENT = 'iepf:notification'

// Only paths on this site, like the service worker: a notification never opens another origin.
export function safeNotificationPath(url: string) {
  return url.startsWith('/') && !url.startsWith('//') ? url : '/'
}

export function formatNotificationTime(iso: string, now = new Date()) {
  const date = new Date(iso)
  const minutes = (now.getTime() - date.getTime()) / 60_000
  if (minutes < 1) return 'Adesso'
  if (minutes < 60) return `${formatDistanceStrict(date, now, { locale: it, unit: 'minute' })} fa`
  const days = differenceInCalendarDays(now, date)
  if (days === 0) return `${formatDistanceStrict(date, now, { locale: it, unit: 'hour' })} fa`
  if (days === 1) return `Ieri, ${format(date, 'HH:mm')}`
  if (days < 7) return format(date, "EEEE, HH:mm", { locale: it }).replace(/^./, c => c.toUpperCase())
  if (date.getFullYear() === now.getFullYear()) return format(date, 'd MMMM', { locale: it })
  return format(date, 'd MMMM yyyy', { locale: it })
}

export function badgeLabel(count: number) {
  return count > 9 ? '9+' : String(count)
}
