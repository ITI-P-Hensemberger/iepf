// Purpose: Popup handlers: what the current user should see, closing it, and admin management.
import type { Context } from 'hono'

import { and, arrayContains, asc, count, desc, eq, getTableColumns, gt, isNull, lte, notExists, or, sql } from 'drizzle-orm'

import type { AppBindings, AppRouteHandler } from '@/lib/types'

import db from '@/db'
import { announcementDismissals, announcements } from '@/db/schemas/announcements.schema'
import { buildErrorResponse } from '@/lib/error-response'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'

import type { AdminCreateRoute, AdminDeleteRoute, AdminListRoute, AdminUpdateRoute, announcementInputSchema, DismissRoute, ListActiveRoute } from './announcements.routes'

import { ANNOUNCEMENT_ROLES } from './announcements.routes'

type AnnouncementRow = typeof announcements.$inferSelect
type AnnouncementInput = ReturnType<typeof announcementInputSchema.parse>

function isAudienceRole(role: string | undefined): role is typeof ANNOUNCEMENT_ROLES[number] {
  return (ANNOUNCEMENT_ROLES as readonly string[]).includes(role ?? '')
}

// Shown only while switched on and inside its optional time window.
export function visibleNow(now: Date) {
  return and(
    eq(announcements.active, true),
    or(isNull(announcements.startsAt), lte(announcements.startsAt, now)),
    or(isNull(announcements.expiresAt), gt(announcements.expiresAt, now))
  )
}

function forbidden(c: Context<AppBindings>) {
  return c.json(buildErrorResponse(HttpStatusPhrases.FORBIDDEN), HttpStatusCodes.FORBIDDEN)
}

function notFound(c: Context<AppBindings>) {
  return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
}

function isAdmin(c: Context<AppBindings>) {
  const currentUser = c.get('currentUser')
  return currentUser?.role === 'admin' && currentUser.isActive === true
}

function toValues(input: AnnouncementInput) {
  return {
    ...input,
    startsAt: input.startsAt ? new Date(input.startsAt) : null,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null
  }
}

function toAdminPayload(row: AnnouncementRow, dismissals: number) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    linkUrl: row.linkUrl,
    linkLabel: row.linkLabel,
    roles: row.roles.filter(isAudienceRole),
    dismissMode: row.dismissMode,
    active: row.active,
    startsAt: row.startsAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    dismissals,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  }
}

export const listActive: AppRouteHandler<ListActiveRoute> = async (c) => {
  const currentUser = c.get('currentUser')!
  if (!isAudienceRole(currentUser.role)) {
    return c.json([], HttpStatusCodes.OK)
  }
  const rows = await db.select({
    id: announcements.id,
    title: announcements.title,
    body: announcements.body,
    linkUrl: announcements.linkUrl,
    linkLabel: announcements.linkLabel,
    dismissMode: announcements.dismissMode
  })
    .from(announcements)
    .where(and(
      visibleNow(new Date()),
      arrayContains(announcements.roles, [currentUser.role]),
      or(
        sql`${announcements.dismissMode} <> 'once_account'`,
        notExists(db.select({ one: sql`1` })
          .from(announcementDismissals)
          .where(and(
            eq(announcementDismissals.announcementId, announcements.id),
            eq(announcementDismissals.userId, currentUser.id)
          )))
      )
    ))
    .orderBy(asc(announcements.createdAt))
  return c.json(rows, HttpStatusCodes.OK)
}

export const dismiss: AppRouteHandler<DismissRoute> = async (c) => {
  const currentUser = c.get('currentUser')!
  const { id } = c.req.valid('param')
  const announcement = await db.query.announcements.findFirst({
    where: eq(announcements.id, id),
    columns: { roles: true, dismissMode: true }
  })
  if (!announcement || !announcement.roles.includes(currentUser.role)) {
    return notFound(c)
  }
  // The other modes are remembered by the browser. An admin impersonating a student closes
  // it only for that visit: the student must still see it.
  if (announcement.dismissMode === 'once_account' && !c.get('impersonation')) {
    await db.insert(announcementDismissals)
      .values({ announcementId: id, userId: currentUser.id })
      .onConflictDoNothing()
  }
  return c.body(null, HttpStatusCodes.NO_CONTENT)
}

export const adminList: AppRouteHandler<AdminListRoute> = async (c) => {
  if (!isAdmin(c)) {
    return forbidden(c)
  }
  const rows = await db.select({
    ...getTableColumns(announcements),
    dismissals: count(announcementDismissals.userId)
  })
    .from(announcements)
    .leftJoin(announcementDismissals, eq(announcementDismissals.announcementId, announcements.id))
    .groupBy(announcements.id)
    .orderBy(desc(announcements.createdAt))
  return c.json(rows.map(({ dismissals, ...row }) => toAdminPayload(row, dismissals)), HttpStatusCodes.OK)
}

export const adminCreate: AppRouteHandler<AdminCreateRoute> = async (c) => {
  if (!isAdmin(c)) {
    return forbidden(c)
  }
  const [row] = await db.insert(announcements)
    .values({ ...toValues(c.req.valid('json')), createdBy: c.get('currentUser')!.id })
    .returning()
  return c.json(toAdminPayload(row, 0), HttpStatusCodes.CREATED)
}

export const adminUpdate: AppRouteHandler<AdminUpdateRoute> = async (c) => {
  if (!isAdmin(c)) {
    return forbidden(c)
  }
  const { id } = c.req.valid('param')
  const [row] = await db.update(announcements)
    .set(toValues(c.req.valid('json')))
    .where(eq(announcements.id, id))
    .returning()
  if (!row) {
    return notFound(c)
  }
  const [{ dismissals }] = await db.select({ dismissals: count() })
    .from(announcementDismissals)
    .where(eq(announcementDismissals.announcementId, id))
  return c.json(toAdminPayload(row, dismissals), HttpStatusCodes.OK)
}

export const adminDelete: AppRouteHandler<AdminDeleteRoute> = async (c) => {
  if (!isAdmin(c)) {
    return forbidden(c)
  }
  const { id } = c.req.valid('param')
  const deleted = await db.delete(announcements).where(eq(announcements.id, id)).returning({ id: announcements.id })
  if (deleted.length === 0) {
    return notFound(c)
  }
  return c.body(null, HttpStatusCodes.NO_CONTENT)
}
