// Purpose: FAQ handlers: anyone reads them, admins add, edit, delete and reorder them.
import type { Context } from 'hono'

import { asc, eq, sql } from 'drizzle-orm'

import type { AppBindings, AppRouteHandler } from '@/lib/types'

import db from '@/db'
import { faqs } from '@/db/schemas/faqs.schema'
import { buildErrorResponse } from '@/lib/error-response'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'

import type { CreateRoute, ListRoute, RemoveRoute, ReorderRoute, UpdateRoute } from './faqs.routes'

type FaqRow = typeof faqs.$inferSelect

function toPayload(row: FaqRow) {
  return { id: row.id, question: row.question, answer: row.answer, position: row.position }
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

async function ordered() {
  return db.select().from(faqs).orderBy(asc(faqs.position), asc(faqs.createdAt))
}

export const list: AppRouteHandler<ListRoute> = async (c) => {
  return c.json((await ordered()).map(toPayload), HttpStatusCodes.OK)
}

export const create: AppRouteHandler<CreateRoute> = async (c) => {
  if (!isAdmin(c)) {
    return forbidden(c)
  }
  const input = c.req.valid('json')
  const [row] = await db.insert(faqs)
    .values({ ...input, position: sql`(select coalesce(max(${faqs.position}) + 1, 0) from ${faqs})` })
    .returning()
  return c.json(toPayload(row), HttpStatusCodes.CREATED)
}

export const update: AppRouteHandler<UpdateRoute> = async (c) => {
  if (!isAdmin(c)) {
    return forbidden(c)
  }
  const { id } = c.req.valid('param')
  const [row] = await db.update(faqs).set(c.req.valid('json')).where(eq(faqs.id, id)).returning()
  return row ? c.json(toPayload(row), HttpStatusCodes.OK) : notFound(c)
}

export const remove: AppRouteHandler<RemoveRoute> = async (c) => {
  if (!isAdmin(c)) {
    return forbidden(c)
  }
  const { id } = c.req.valid('param')
  const deleted = await db.transaction(async (tx) => {
    const [row] = await tx.delete(faqs).where(eq(faqs.id, id)).returning({ position: faqs.position })
    if (row) {
      await tx.update(faqs).set({ position: sql`${faqs.position} - 1` }).where(sql`${faqs.position} > ${row.position}`)
    }
    return Boolean(row)
  })
  return deleted ? c.body(null, HttpStatusCodes.NO_CONTENT) : notFound(c)
}

export const reorder: AppRouteHandler<ReorderRoute> = async (c) => {
  if (!isAdmin(c)) {
    return forbidden(c)
  }
  const { ids } = c.req.valid('json')
  const ok = await db.transaction(async (tx) => {
    const current = await tx.select({ id: faqs.id }).from(faqs).for('update')
    const known = new Set(current.map(row => row.id))
    // The whole list, each question once: a stale page must not drop or duplicate one.
    if (ids.length !== known.size || new Set(ids).size !== ids.length || ids.some(id => !known.has(id))) {
      return false
    }
    for (const [position, id] of ids.entries()) {
      await tx.update(faqs).set({ position }).where(eq(faqs.id, id))
    }
    return true
  })
  if (!ok) {
    return c.json(buildErrorResponse('L\'elenco è cambiato: ricarica la pagina.'), HttpStatusCodes.CONFLICT)
  }
  return c.json((await ordered()).map(toPayload), HttpStatusCodes.OK)
}
