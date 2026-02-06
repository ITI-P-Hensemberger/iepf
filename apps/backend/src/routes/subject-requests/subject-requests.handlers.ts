// Purpose: Subject request handlers.
import type { Context } from 'hono'

import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'

import type { AppBindings, AppRouteHandler } from '@/lib/types'

import db from '@/db'
import { subjectRequests } from '@/db/schemas/subject-requests.schema'
import { subjects } from '@/db/schemas/subjects.schema'
import { users } from '@/db/schemas/users.schema'
import { buildErrorResponse } from '@/lib/error-response'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { buildPagedResponse } from '@/lib/pagination'

import type { CreateRoute, ListRoute } from './subject-requests.routes'

type HandlerContext = Context<AppBindings>

function forbid(): never {
  throw new HTTPException(HttpStatusCodes.FORBIDDEN, {
    message: HttpStatusPhrases.FORBIDDEN
  })
}

function ensureAdmin(c: HandlerContext) {
  const currentUser = c.get('currentUser')
  if (!currentUser || currentUser.role !== 'admin' || currentUser.isActive !== true) {
    forbid()
  }
  return currentUser
}

function ensureStudent(c: HandlerContext) {
  const currentUser = c.get('currentUser')
  if (!currentUser || currentUser.role !== 'student') {
    forbid()
  }
  return currentUser
}

export const create: AppRouteHandler<CreateRoute> = async (c) => {
  const currentUser = ensureStudent(c)
  const payload = c.req.valid('json')
  const subject = await db.query.subjects.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, payload.subjectId)
    },
    columns: {
      id: true
    }
  })
  if (!subject) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  const [inserted] = await db
    .insert(subjectRequests)
    .values({
      studentId: currentUser.id,
      subjectId: subject.id
    })
    .returning({
      id: subjectRequests.id,
      studentId: subjectRequests.studentId,
      subjectId: subjectRequests.subjectId,
      createdAt: subjectRequests.createdAt
    })

  return c.json(
    {
      ...inserted,
      createdAt: new Date(inserted.createdAt ?? 0).toISOString()
    },
    HttpStatusCodes.CREATED
  )
}

export const list: AppRouteHandler<ListRoute> = async (c) => {
  ensureAdmin(c)
  const query = c.req.valid('query')
  const isSummary = query.mode === 'summary'

  const conditions = []
  if (query.q) {
    const q = `%${query.q}%`
    const subjectFilters = or(
      ilike(subjects.name, q),
      ilike(subjects.canonicalName, q)
    )
    if (isSummary) {
      conditions.push(subjectFilters)
    }
    else {
      conditions.push(or(
        subjectFilters,
        ilike(users.email, q),
        ilike(users.firstName, q),
        ilike(users.lastName, q)
      ))
    }
  }
  if (query.studentId && !isSummary) {
    conditions.push(eq(subjectRequests.studentId, query.studentId))
  }
  if (query.subjectId) {
    conditions.push(eq(subjectRequests.subjectId, query.subjectId))
  }

  const whereClause = conditions.length > 0
    ? and(...conditions)
    : undefined

  if (isSummary) {
    const requestCount = sql<number>`count(distinct ${subjectRequests.studentId})`
    const sortDir = query.sortDir === 'asc' ? asc : desc
    const sortField = query.sortBy === 'requestCount'
      ? requestCount
      : query.sortBy === 'canonicalName'
        ? subjects.canonicalName
        : subjects.name

    const summaryBaseQuery = db
      .select({
        subjectName: subjects.name,
        canonicalName: subjects.canonicalName,
        requestCount
      })
      .from(subjectRequests)
      .innerJoin(subjects, eq(subjectRequests.subjectId, subjects.id))
    const summaryQuery = (whereClause ? summaryBaseQuery.where(whereClause) : summaryBaseQuery)
      .groupBy(subjects.id, subjects.name, subjects.canonicalName)
      .orderBy(sortDir(sortField))
      .limit(query.limit)
      .offset(query.offset)
    const rows = await summaryQuery

    const summaryCountBase = db
      .select({ subjectId: subjectRequests.subjectId })
      .from(subjectRequests)
      .innerJoin(subjects, eq(subjectRequests.subjectId, subjects.id))
    const summaryBase = (whereClause ? summaryCountBase.where(whereClause) : summaryCountBase)
      .groupBy(subjectRequests.subjectId)
      .as('summary')

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)` })
      .from(summaryBase)

    return c.json(buildPagedResponse(rows, Number(total), query.limit, query.offset), HttpStatusCodes.OK)
  }

  const sortDir = query.sortDir === 'asc' ? asc : desc
  const sortFieldMap = {
    createdAt: subjectRequests.createdAt,
    subjectName: subjects.name,
    canonicalName: subjects.canonicalName,
    studentEmail: users.email,
    studentFirstName: users.firstName,
    studentLastName: users.lastName
  } as const
  const sortField = sortFieldMap[query.sortBy as keyof typeof sortFieldMap] ?? subjectRequests.createdAt

  const listBaseQuery = db
    .select({
      id: subjectRequests.id,
      studentId: subjectRequests.studentId,
      subjectId: subjectRequests.subjectId,
      subjectName: subjects.name,
      canonicalName: subjects.canonicalName,
      createdAt: subjectRequests.createdAt,
      studentEmail: users.email,
      studentFirstName: users.firstName,
      studentLastName: users.lastName
    })
    .from(subjectRequests)
    .innerJoin(subjects, eq(subjectRequests.subjectId, subjects.id))
    .innerJoin(users, eq(subjectRequests.studentId, users.id))
  const listQuery = (whereClause ? listBaseQuery.where(whereClause) : listBaseQuery)
    .orderBy(sortDir(sortField))
    .limit(query.limit)
    .offset(query.offset)
  const rows = await listQuery

  const totalBaseQuery = db
    .select({ total: sql<number>`count(*)` })
    .from(subjectRequests)
    .innerJoin(subjects, eq(subjectRequests.subjectId, subjects.id))
    .innerJoin(users, eq(subjectRequests.studentId, users.id))

  const [{ total }] = await (whereClause ? totalBaseQuery.where(whereClause) : totalBaseQuery)

  const data = rows.map(row => ({
    ...row,
    createdAt: new Date(row.createdAt ?? 0).toISOString()
  }))

  return c.json(buildPagedResponse(data, Number(total), query.limit, query.offset), HttpStatusCodes.OK)
}
