import { formatDistanceStrict } from 'date-fns'
import { it } from 'date-fns/locale'

import { schoolDayKey, schoolFormat } from '@/lib/school-time'

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

const timeFormat = schoolFormat({ hour: '2-digit', minute: '2-digit' })
const weekdayFormat = schoolFormat({ weekday: 'long' })
const dayMonthFormat = schoolFormat({ day: 'numeric', month: 'long' })
const dayMonthYearFormat = schoolFormat({ day: 'numeric', month: 'long', year: 'numeric' })

function keyTime(key: string) {
  return Date.parse(`${key}T00:00:00Z`)
}

// Days counted on Rome's calendar, like the lessons the notifications speak of.
export function formatNotificationTime(iso: string, now = new Date()) {
  const date = new Date(iso)
  const minutes = (now.getTime() - date.getTime()) / 60_000
  if (minutes < 1) return 'Adesso'
  if (minutes < 60) return `${formatDistanceStrict(date, now, { locale: it, unit: 'minute' })} fa`
  const dateKey = schoolDayKey(date)
  const nowKey = schoolDayKey(now)
  const days = Math.round((keyTime(nowKey) - keyTime(dateKey)) / 86_400_000)
  if (days === 0) return `${formatDistanceStrict(date, now, { locale: it, unit: 'hour' })} fa`
  if (days === 1) return `Ieri, ${timeFormat.format(date)}`
  if (days < 7) return `${weekdayFormat.format(date)}, ${timeFormat.format(date)}`.replace(/^./, c => c.toUpperCase())
  if (dateKey.slice(0, 4) === nowKey.slice(0, 4)) return dayMonthFormat.format(date)
  return dayMonthYearFormat.format(date)
}

export function badgeLabel(count: number) {
  return count > 9 ? '9+' : String(count)
}
