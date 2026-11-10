// Purpose: Short link handlers: admins manage the links, anyone opens an active one.
import type { Context } from 'hono'

import { and, asc, eq, sql } from 'drizzle-orm'

import type { AppBindings, AppRouteHandler } from '@/lib/types'

import db from '@/db'
import { links } from '@/db/schemas/links.schema'
import { countInBackground } from '@/lib/analytics'
import { isUniqueConstraintError } from '@/lib/db-errors'
import { buildErrorResponse } from '@/lib/error-response'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'

import type { CreateRoute, ListRoute, OpenRoute, RemoveRoute, UpdateRoute } from './links.routes'

type LinkRow = typeof links.$inferSelect

function toPayload(row: LinkRow) {
  return {
    id: row.id,
    slug: row.slug,
    url: row.url,
    active: row.active,
    clicks: row.clicks,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  }
}

function isAdmin(c: Context<AppBindings>) {
  const currentUser = c.get('currentUser')
  return currentUser?.role === 'admin' && currentUser.isActive === true
}

function forbidden(c: Context<AppBindings>) {
  return c.json(buildErrorResponse(HttpStatusPhrases.FORBIDDEN), HttpStatusCodes.FORBIDDEN)
}

function notFound(c: Context<AppBindings>) {
  return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
}

function duplicate(c: Context<AppBindings>) {
  return c.json(buildErrorResponse('Esiste già un link con questo nome.'), HttpStatusCodes.CONFLICT)
}

export const list: AppRouteHandler<ListRoute> = async (c) => {
  if (!isAdmin(c)) {
    return forbidden(c)
  }
  const rows = await db.select().from(links).orderBy(asc(links.slug))
  return c.json(rows.map(toPayload), HttpStatusCodes.OK)
}

export const create: AppRouteHandler<CreateRoute> = async (c) => {
  if (!isAdmin(c)) {
    return forbidden(c)
  }
  try {
    const [row] = await db.insert(links).values(c.req.valid('json')).returning()
    return c.json(toPayload(row), HttpStatusCodes.CREATED)
  }
  catch (error) {
    if (isUniqueConstraintError(error)) {
      return duplicate(c)
    }
    throw error
  }
}

export const update: AppRouteHandler<UpdateRoute> = async (c) => {
  if (!isAdmin(c)) {
    return forbidden(c)
  }
  const { id } = c.req.valid('param')
  try {
    const [row] = await db.update(links).set(c.req.valid('json')).where(eq(links.id, id)).returning()
    return row ? c.json(toPayload(row), HttpStatusCodes.OK) : notFound(c)
  }
  catch (error) {
    if (isUniqueConstraintError(error)) {
      return duplicate(c)
    }
    throw error
  }
}

export const remove: AppRouteHandler<RemoveRoute> = async (c) => {
  if (!isAdmin(c)) {
    return forbidden(c)
  }
  const { id } = c.req.valid('param')
  const [row] = await db.delete(links).where(eq(links.id, id)).returning({ id: links.id })
  return row ? c.body(null, HttpStatusCodes.NO_CONTENT) : notFound(c)
}

// Finds the link and counts the click in one statement; a disabled link is as good as missing.
export const open: AppRouteHandler<OpenRoute> = async (c) => {
  const { slug } = c.req.valid('param')
  const [row] = await db.update(links)
    .set({ clicks: sql`${links.clicks} + 1`, updatedAt: sql`${links.updatedAt}` })
    .where(and(eq(links.slug, slug), eq(links.active, true)))
    .returning({ id: links.id, url: links.url })
  if (!row) {
    return notFound(c)
  }
  countInBackground(null, 'link_click', row.id)
  return c.json({ url: row.url }, HttpStatusCodes.OK)
}
