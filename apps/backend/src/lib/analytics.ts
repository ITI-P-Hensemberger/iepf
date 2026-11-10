// Purpose: Internal usage analytics, stored only as daily counts per role and school year.
// Nothing here may identify a person: no user id, no session id, no IP, no free text from
// the client. Each event's detail is checked against a fixed list or a strict pattern.
import { and, eq, gte, inArray, lt, lte, sql } from 'drizzle-orm'

import db from '@/db'
import { analyticsDaily } from '@/db/schemas/analytics-daily.schema'
import { studentProfiles } from '@/db/schemas/student-profiles.schema'
import { tutorProfiles } from '@/db/schemas/tutor-profiles.schema'
import { PUSH_CATEGORIES } from '@/lib/push'
import { schoolDayKey } from '@/lib/school-time'

// Events the browser may send. Everything else is counted on the server.
export const CLIENT_EVENTS = [
  'page_view',
  'book_dialog_open',
  'bell_open',
  'inbox_click',
  'push_open',
  'client_error'
] as const
export type ClientEvent = typeof CLIENT_EVENTS[number]

// link_click: detail is the link's id, so a renamed slug keeps its history.
export const SERVER_EVENTS = ['booking', 'push_sent', 'active_users', 'link_click'] as const
export type AnalyticsEvent = ClientEvent | typeof SERVER_EVENTS[number]

// The site's pages, with ids replaced by [id]. Visitors are not counted, so only pages a
// signed-in user can reach are listed; any other path is counted as 'other'.
export const PAGE_TEMPLATES = [
  '/',
  '/activator',
  '/admin',
  '/admin/admins',
  '/admin/admins/[id]',
  '/admin/announcements',
  '/admin/feedback',
  '/admin/lessons',
  '/admin/lessons/[id]',
  '/admin/pending',
  '/admin/settings',
  '/admin/stats',
  '/admin/students',
  '/admin/students/[id]',
  '/admin/tutors',
  '/admin/tutors/[id]',
  '/faq',
  '/privacy-policy',
  '/profile',
  '/student',
  '/student/book',
  '/student/lessons',
  '/student/pending',
  '/terms',
  '/tutor',
  '/tutor/lessons',
  '/tutor/lessons/[id]',
  '/tutor/onboarding',
  '/tutor/pending',
  '/tutor/settings'
] as const

// Why a student's booking did not go through, as the booking handler decides it.
export const BOOKING_OUTCOMES = [
  'ok',
  'not_found',
  'profanity',
  'closed',
  'too_late',
  'student_inactive',
  'tutor_year',
  'no_tokens',
  'already_booked',
  'daily_limit',
  'tutor_full',
  'lesson_full',
  'subject_invalid',
  'subject_taken'
] as const
export type BookingOutcome = typeof BOOKING_OUTCOMES[number]

export const ANALYTICS_RETENTION_MONTHS = 13
const ERROR_NAME = /^[A-Z][A-Za-z]{0,39}$/
const PAGES = new Set<string>(PAGE_TEMPLATES)

// YYYY-MM-DD in the school's time zone.
export function romeDay(date: Date) {
  return schoolDayKey(date)
}

function page(detail: string) {
  return PAGES.has(detail) ? detail : 'other'
}

// Reduces what the client sent to a value from a closed set.
export function sanitizeDetail(event: ClientEvent, detail: string) {
  switch (event) {
    case 'page_view':
      return page(detail)
    case 'inbox_click':
    case 'push_open':
      // Read at call time: push.ts imports this module too.
      return (PUSH_CATEGORIES as readonly string[]).includes(detail) ? detail : 'other'
    case 'client_error': {
      // "TypeError@/student/book": the error's name and the page, never its message.
      const [name = '', path = ''] = detail.split('@', 2)
      return `${ERROR_NAME.test(name) ? name : 'Error'}@${page(path)}`
    }
    default:
      return ''
  }
}

export interface Who {
  role: string
  year: number
}

const YEAR_TTL_MS = 10 * 60 * 1000
const YEAR_CACHE_MAX = 5_000
const yearCache = new Map<string, { year: number, expiresAt: number }>()

export function clearAnalyticsCache() {
  yearCache.clear()
}

// The school year is kept only to split counts; it is read from the profile and cached
// so a page left open does not query it on every batch.
export async function whoIs(user: { id: string, role: string }): Promise<Who> {
  if (user.role !== 'student' && user.role !== 'tutor') {
    return { role: user.role, year: 0 }
  }
  const now = Date.now()
  const cached = yearCache.get(user.id)
  if (cached && cached.expiresAt > now) {
    return { role: user.role, year: cached.year }
  }
  const table = user.role === 'student' ? studentProfiles : tutorProfiles
  const [row] = await db.select({ year: table.year }).from(table).where(eq(table.userId, user.id)).limit(1)
  const year = row?.year ?? 0
  if (yearCache.size >= YEAR_CACHE_MAX) {
    yearCache.clear()
  }
  yearCache.set(user.id, { year, expiresAt: now + YEAR_TTL_MS })
  return { role: user.role, year }
}

export interface CountRow {
  event: AnalyticsEvent
  detail: string
  count: number
}

// Adds the counts to today's rows in one statement.
export async function addCounts(who: Who, rows: CountRow[], now = new Date()) {
  const merged = new Map<string, CountRow>()
  for (const row of rows) {
    if (row.count <= 0)
      continue
    const key = `${row.event}\u0000${row.detail}`
    const existing = merged.get(key)
    if (existing)
      existing.count += row.count
    else merged.set(key, { ...row })
  }
  if (merged.size === 0)
    return
  const day = romeDay(now)
  await db.insert(analyticsDaily)
    .values([...merged.values()].map(row => ({ day, ...row, role: who.role, year: who.year })))
    .onConflictDoUpdate({
      target: [analyticsDaily.day, analyticsDaily.event, analyticsDaily.detail, analyticsDaily.role, analyticsDaily.year],
      set: { count: sql`${analyticsDaily.count} + excluded.count` }
    })
}

// For counters inside request handlers: analytics must never fail or slow the request.
const pendingCounts = new Set<Promise<unknown>>()

export function countInBackground(user: { id: string, role: string } | null, event: AnalyticsEvent, detail: string, count = 1) {
  const task = (async () => {
    const who = user ? await whoIs(user) : { role: '', year: 0 }
    await addCounts(who, [{ event, detail, count }])
  })().catch((error) => {
    console.error('Analytics count failed:', error instanceof Error ? error.message : error)
  })
  pendingCounts.add(task)
  void task.finally(() => pendingCounts.delete(task))
}

export async function waitForPendingCounts() {
  await Promise.all(pendingCounts)
}

const DAY_MS = 24 * 60 * 60 * 1000
const ROLLUP_DAYS = 7

// Distinct active users per day, role and school year, read from the audit log before it
// expires. Requests made while impersonating are left out. Recomputed for the last week
// each night (it is idempotent); the first run backfills everything the audit log still has.
export async function rollUpActiveUsers(now: Date, backfillDays: number) {
  const [existing] = await db.select({ day: analyticsDaily.day })
    .from(analyticsDaily)
    .where(eq(analyticsDaily.event, 'active_users'))
    .limit(1)
  const days = existing ? ROLLUP_DAYS : backfillDays
  const firstDay = romeDay(new Date(now.getTime() - days * DAY_MS))
  const lastDay = romeDay(new Date(now.getTime() - DAY_MS))
  // A day wider than needed, so the index on created_at still narrows the scan.
  const since = new Date(now.getTime() - (days + 1) * DAY_MS)

  const result = await db.execute(sql`
    insert into analytics_daily (day, event, detail, role, year, count)
    select day, 'active_users', '', role, year, count(distinct actor_id)::int
    from (
      select (a.created_at at time zone 'Europe/Rome')::date as day,
        a.actor_id,
        u.role,
        coalesce(sp.year, tp.year, 0) as year
      from audit_logs a
      join users u on u.id = a.actor_id
      left join student_profiles sp on sp.user_id = u.id
      left join tutor_profiles tp on tp.user_id = u.id
      where a.created_at >= ${since}
        and (a.metadata is null or (a.metadata::jsonb ->> 'impersonatedUserId') is null)
    ) activity
    where day between ${firstDay}::date and ${lastDay}::date
    group by day, role, year
    on conflict (day, event, detail, role, year) do update set count = excluded.count
  `)
  return result.rowCount ?? 0
}

export function analyticsCutoffDay(now: Date) {
  const cutoff = new Date(now)
  cutoff.setUTCMonth(cutoff.getUTCMonth() - ANALYTICS_RETENTION_MONTHS)
  return romeDay(cutoff)
}

export async function deleteOldAnalytics(now = new Date()) {
  const result = await db.delete(analyticsDaily).where(lt(analyticsDaily.day, analyticsCutoffDay(now)))
  return result.rowCount ?? 0
}

// Events drawn as daily lines on the admin page.
const DAILY_EVENTS = ['page_view', 'active_users', 'booking', 'push_sent', 'push_open', 'client_error'] as const

export async function readAnalytics(days: number, now = new Date()) {
  const from = romeDay(new Date(now.getTime() - (days - 1) * DAY_MS))
  const to = romeDay(now)
  const inRange = and(gte(analyticsDaily.day, from), lte(analyticsDaily.day, to))
  const total = sql<number>`sum(${analyticsDaily.count})::int`

  const daily = await db
    .select({ day: analyticsDaily.day, event: analyticsDaily.event, role: analyticsDaily.role, count: total })
    .from(analyticsDaily)
    .where(and(inRange, inArray(analyticsDaily.event, [...DAILY_EVENTS])))
    .groupBy(analyticsDaily.day, analyticsDaily.event, analyticsDaily.role)
    .orderBy(analyticsDaily.day)

  const byDetail = await db
    .select({ event: analyticsDaily.event, detail: analyticsDaily.detail, count: total })
    .from(analyticsDaily)
    .where(inRange)
    .groupBy(analyticsDaily.event, analyticsDaily.detail)

  const byGroup = await db
    .select({ event: analyticsDaily.event, role: analyticsDaily.role, year: analyticsDaily.year, count: total })
    .from(analyticsDaily)
    .where(inRange)
    .groupBy(analyticsDaily.event, analyticsDaily.role, analyticsDaily.year)

  return { from, to, days, daily, byDetail, byGroup }
}
