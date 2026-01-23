// Purpose: Lesson feedback handlers for tutors, students, and admins.
import type { Context } from 'hono'

import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'

import type { AppBindings, AppRouteHandler } from '@/lib/types'

import db from '@/db'
import { lessonFeedback } from '@/db/schemas/lesson-feedback.schema'
import { lessons } from '@/db/schemas/lessons.schema'
import { buildErrorResponse } from '@/lib/error-response'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { buildPagedResponse } from '@/lib/pagination'

import type {
  AdminCreateFeedbackRoute,
  AdminDeleteFeedbackRoute,
  AdminGetFeedbackRoute,
  AdminListFeedbackRoute,
  AdminUpdateFeedbackRoute,
  CreateLessonFeedbackRoute,
  ListMyFeedbackRoute,
  UpdateLessonFeedbackRoute
} from './feedback.routes'

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

async function fetchLesson(lessonId: string) {
  return db.query.lessons.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, lessonId)
    }
  })
}

async function fetchBooking(lessonId: string, bookingId: string) {
  return db.query.lessonBookings.findFirst({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.id, bookingId),
        operators.eq(fields.lessonId, lessonId)
      )
    }
  })
}

function ensureLessonStarted(lessonStart: Date) {
  if (new Date() < lessonStart) {
    return false
  }
  return true
}

function ensureTutorTextRequired(authorRole: string, text?: string | null) {
  if (authorRole === 'tutor' && (!text || text.trim().length === 0)) {
    return false
  }
  return true
}

export const createLessonFeedback: AppRouteHandler<CreateLessonFeedbackRoute> = async (c) => {
  const { lessonId } = c.req.valid('param')
  const payload = c.req.valid('json')
  const currentUser = c.get('currentUser')

  if (!currentUser || (currentUser.role !== 'student' && currentUser.role !== 'tutor')) {
    forbid()
  }

  if (currentUser.role === 'tutor' && currentUser.isActive !== true) {
    forbid()
  }

  const lesson = await fetchLesson(lessonId)
  if (!lesson) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  if (!ensureLessonStarted(lesson.startAt)) {
    return c.json(buildErrorResponse(HttpStatusPhrases.CONFLICT), HttpStatusCodes.CONFLICT)
  }

  const booking = await fetchBooking(lessonId, payload.bookingId)
  if (!booking) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  if (booking.status !== 'confirmed') {
    return c.json(buildErrorResponse(HttpStatusPhrases.CONFLICT), HttpStatusCodes.CONFLICT)
  }

  let authorRole: 'student' | 'tutor'
  let authorUserId: string
  let targetUserId: string

  if (currentUser.role === 'student') {
    if (booking.studentId !== currentUser.id) {
      forbid()
    }
    authorRole = 'student'
    authorUserId = currentUser.id
    targetUserId = lesson.tutorId
  }
  else {
    if (lesson.tutorId !== currentUser.id) {
      forbid()
    }
    authorRole = 'tutor'
    authorUserId = currentUser.id
    targetUserId = booking.studentId
  }

  if (!ensureTutorTextRequired(authorRole, payload.text)) {
    return c.json(buildErrorResponse(HttpStatusPhrases.UNPROCESSABLE_ENTITY), HttpStatusCodes.UNPROCESSABLE_ENTITY)
  }

  const existing = await db.query.lessonFeedback.findFirst({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.bookingId, booking.id),
        operators.eq(fields.authorUserId, authorUserId),
        operators.eq(fields.authorRole, authorRole)
      )
    }
  })

  if (existing) {
    return c.json(buildErrorResponse(HttpStatusPhrases.CONFLICT), HttpStatusCodes.CONFLICT)
  }

  const [created] = await db.insert(lessonFeedback).values({
    lessonId: lesson.id,
    bookingId: booking.id,
    authorUserId,
    targetUserId,
    authorRole,
    rating: payload.rating,
    text: payload.text ?? null
  }).returning()

  return c.json({
    id: created.id,
    lessonId: created.lessonId,
    bookingId: created.bookingId,
    authorUserId: created.authorUserId,
    targetUserId: created.targetUserId,
    authorRole: created.authorRole,
    rating: created.rating,
    text: created.text ?? null,
    createdAt: created.createdAt.toISOString(),
    updatedAt: created.updatedAt.toISOString()
  }, HttpStatusCodes.OK)
}

export const updateLessonFeedback: AppRouteHandler<UpdateLessonFeedbackRoute> = async (c) => {
  const { lessonId, feedbackId } = c.req.valid('param')
  const payload = c.req.valid('json')
  const currentUser = c.get('currentUser')

  if (!currentUser) {
    forbid()
  }

  if (currentUser.role === 'tutor' && currentUser.isActive !== true) {
    forbid()
  }

  if (currentUser.role !== 'tutor' && currentUser.role !== 'admin') {
    forbid()
  }

  const feedback = await db.query.lessonFeedback.findFirst({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.id, feedbackId),
        operators.eq(fields.lessonId, lessonId)
      )
    }
  })

  if (!feedback) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  if (currentUser.role === 'tutor') {
    if (feedback.authorUserId !== currentUser.id || feedback.authorRole !== 'tutor') {
      forbid()
    }
  }
  else {
    ensureAdmin(c)
  }

  const lesson = await fetchLesson(lessonId)
  if (!lesson) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  if (!ensureLessonStarted(lesson.startAt)) {
    return c.json(buildErrorResponse(HttpStatusPhrases.CONFLICT), HttpStatusCodes.CONFLICT)
  }

  const updates: Partial<typeof lessonFeedback.$inferInsert> = {}
  if (payload.rating !== undefined) {
    updates.rating = payload.rating
  }
  if (payload.text !== undefined) {
    updates.text = payload.text ?? null
  }

  if (!ensureTutorTextRequired(feedback.authorRole, updates.text ?? feedback.text)) {
    return c.json(buildErrorResponse(HttpStatusPhrases.UNPROCESSABLE_ENTITY), HttpStatusCodes.UNPROCESSABLE_ENTITY)
  }

  if (Object.keys(updates).length === 0) {
    return c.json(buildErrorResponse(HttpStatusPhrases.UNPROCESSABLE_ENTITY), HttpStatusCodes.UNPROCESSABLE_ENTITY)
  }

  const [updated] = await db.update(lessonFeedback)
    .set(updates)
    .where(eq(lessonFeedback.id, feedback.id))
    .returning()

  return c.json({
    id: updated.id,
    lessonId: updated.lessonId,
    bookingId: updated.bookingId,
    authorUserId: updated.authorUserId,
    targetUserId: updated.targetUserId,
    authorRole: updated.authorRole,
    rating: updated.rating,
    text: updated.text ?? null,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString()
  }, HttpStatusCodes.OK)
}

export const listMyFeedback: AppRouteHandler<ListMyFeedbackRoute> = async (c) => {
  const currentUser = c.get('currentUser')
  const query = c.req.valid('query')

  if (!currentUser || (currentUser.role !== 'student' && currentUser.role !== 'tutor')) {
    forbid()
  }

  const conditions = [eq(lessonFeedback.authorUserId, currentUser.id)]

  if (query.lessonId) {
    conditions.push(eq(lessonFeedback.lessonId, query.lessonId))
  }
  if (query.from) {
    conditions.push(gte(lessonFeedback.createdAt, new Date(query.from)))
  }
  if (query.to) {
    conditions.push(lte(lessonFeedback.createdAt, new Date(query.to)))
  }

  const rows = await db
    .select({
      id: lessonFeedback.id,
      lessonId: lessonFeedback.lessonId,
      bookingId: lessonFeedback.bookingId,
      authorUserId: lessonFeedback.authorUserId,
      targetUserId: lessonFeedback.targetUserId,
      authorRole: lessonFeedback.authorRole,
      rating: lessonFeedback.rating,
      text: lessonFeedback.text,
      createdAt: lessonFeedback.createdAt,
      updatedAt: lessonFeedback.updatedAt
    })
    .from(lessonFeedback)
    .where(and(...conditions))
    .orderBy(query.sortDir === 'desc' ? desc(lessonFeedback.createdAt) : asc(lessonFeedback.createdAt))
    .limit(query.limit)
    .offset(query.offset)

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(lessonFeedback)
    .where(and(...conditions))

  const data = rows.map(row => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    text: row.text ?? null
  }))

  return c.json(buildPagedResponse(data, Number(total), query.limit, query.offset), HttpStatusCodes.OK)
}

export const adminListFeedback: AppRouteHandler<AdminListFeedbackRoute> = async (c) => {
  ensureAdmin(c)
  const query = c.req.valid('query')

  const conditions = []

  if (query.lessonId) {
    conditions.push(eq(lessonFeedback.lessonId, query.lessonId))
  }
  if (query.bookingId) {
    conditions.push(eq(lessonFeedback.bookingId, query.bookingId))
  }
  if (query.authorUserId) {
    conditions.push(eq(lessonFeedback.authorUserId, query.authorUserId))
  }
  if (query.targetUserId) {
    conditions.push(eq(lessonFeedback.targetUserId, query.targetUserId))
  }
  if (query.authorRole) {
    conditions.push(eq(lessonFeedback.authorRole, query.authorRole))
  }
  if (query.rating !== undefined) {
    conditions.push(eq(lessonFeedback.rating, query.rating))
  }
  if (query.lessonFrom) {
    conditions.push(gte(lessons.startAt, new Date(query.lessonFrom)))
  }
  if (query.lessonTo) {
    conditions.push(lte(lessons.startAt, new Date(query.lessonTo)))
  }
  if (query.from) {
    conditions.push(gte(lessonFeedback.createdAt, new Date(query.from)))
  }
  if (query.to) {
    conditions.push(lte(lessonFeedback.createdAt, new Date(query.to)))
  }

  const whereClause = conditions.length ? and(...conditions) : undefined

  const orderField = (() => {
    switch (query.sortBy) {
      case 'rating':
        return lessonFeedback.rating
      case 'lessonStartAt':
        return lessons.startAt
      default:
        return lessonFeedback.createdAt
    }
  })()

  let listQuery = db
    .select({
      id: lessonFeedback.id,
      lessonId: lessonFeedback.lessonId,
      bookingId: lessonFeedback.bookingId,
      authorUserId: lessonFeedback.authorUserId,
      targetUserId: lessonFeedback.targetUserId,
      authorRole: lessonFeedback.authorRole,
      rating: lessonFeedback.rating,
      text: lessonFeedback.text,
      createdAt: lessonFeedback.createdAt,
      updatedAt: lessonFeedback.updatedAt
    })
    .from(lessonFeedback)
    .innerJoin(lessons, eq(lessonFeedback.lessonId, lessons.id))

  if (whereClause) {
    listQuery = listQuery.where(whereClause)
  }

  const rows = await listQuery
    .orderBy(query.sortDir === 'desc' ? desc(orderField) : asc(orderField))
    .limit(query.limit)
    .offset(query.offset)

  const totalQuery = db
    .select({ total: sql<number>`count(*)` })
    .from(lessonFeedback)
  if (query.lessonFrom || query.lessonTo) {
    totalQuery.innerJoin(lessons, eq(lessonFeedback.lessonId, lessons.id))
  }
  if (whereClause) {
    totalQuery.where(whereClause)
  }
  const [{ total }] = await totalQuery

  const data = rows.map(row => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    text: row.text ?? null
  }))

  return c.json(buildPagedResponse(data, Number(total), query.limit, query.offset), HttpStatusCodes.OK)
}

export const adminGetFeedback: AppRouteHandler<AdminGetFeedbackRoute> = async (c) => {
  ensureAdmin(c)
  const { feedbackId } = c.req.valid('param')

  const feedback = await db.query.lessonFeedback.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, feedbackId)
    }
  })

  if (!feedback) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  return c.json({
    id: feedback.id,
    lessonId: feedback.lessonId,
    bookingId: feedback.bookingId,
    authorUserId: feedback.authorUserId,
    targetUserId: feedback.targetUserId,
    authorRole: feedback.authorRole,
    rating: feedback.rating,
    text: feedback.text ?? null,
    createdAt: feedback.createdAt.toISOString(),
    updatedAt: feedback.updatedAt.toISOString()
  }, HttpStatusCodes.OK)
}

export const adminCreateFeedback: AppRouteHandler<AdminCreateFeedbackRoute> = async (c) => {
  ensureAdmin(c)
  const payload = c.req.valid('json')

  const lesson = await fetchLesson(payload.lessonId)
  if (!lesson) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  if (!ensureLessonStarted(lesson.startAt)) {
    return c.json(buildErrorResponse(HttpStatusPhrases.CONFLICT), HttpStatusCodes.CONFLICT)
  }

  const booking = await fetchBooking(payload.lessonId, payload.bookingId)
  if (!booking) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  const isStudentAuthor = payload.authorRole === 'student'
  const expectedAuthorId = isStudentAuthor ? booking.studentId : lesson.tutorId
  const expectedTargetId = isStudentAuthor ? lesson.tutorId : booking.studentId

  if (payload.authorUserId !== expectedAuthorId || payload.targetUserId !== expectedTargetId) {
    return c.json(buildErrorResponse(HttpStatusPhrases.UNPROCESSABLE_ENTITY), HttpStatusCodes.UNPROCESSABLE_ENTITY)
  }

  if (!ensureTutorTextRequired(payload.authorRole, payload.text)) {
    return c.json(buildErrorResponse(HttpStatusPhrases.UNPROCESSABLE_ENTITY), HttpStatusCodes.UNPROCESSABLE_ENTITY)
  }

  const existing = await db.query.lessonFeedback.findFirst({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.bookingId, booking.id),
        operators.eq(fields.authorUserId, payload.authorUserId),
        operators.eq(fields.authorRole, payload.authorRole)
      )
    }
  })

  if (existing) {
    return c.json(buildErrorResponse(HttpStatusPhrases.CONFLICT), HttpStatusCodes.CONFLICT)
  }

  const [created] = await db.insert(lessonFeedback).values({
    lessonId: payload.lessonId,
    bookingId: payload.bookingId,
    authorUserId: payload.authorUserId,
    targetUserId: payload.targetUserId,
    authorRole: payload.authorRole,
    rating: payload.rating,
    text: payload.text ?? null
  }).returning()

  return c.json({
    id: created.id,
    lessonId: created.lessonId,
    bookingId: created.bookingId,
    authorUserId: created.authorUserId,
    targetUserId: created.targetUserId,
    authorRole: created.authorRole,
    rating: created.rating,
    text: created.text ?? null,
    createdAt: created.createdAt.toISOString(),
    updatedAt: created.updatedAt.toISOString()
  }, HttpStatusCodes.OK)
}

export const adminUpdateFeedback: AppRouteHandler<AdminUpdateFeedbackRoute> = async (c) => {
  ensureAdmin(c)
  const { feedbackId } = c.req.valid('param')
  const payload = c.req.valid('json')

  const feedback = await db.query.lessonFeedback.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, feedbackId)
    }
  })

  if (!feedback) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  const lesson = await fetchLesson(feedback.lessonId)
  if (!lesson) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  if (!ensureLessonStarted(lesson.startAt)) {
    return c.json(buildErrorResponse(HttpStatusPhrases.CONFLICT), HttpStatusCodes.CONFLICT)
  }

  const updates: Partial<typeof lessonFeedback.$inferInsert> = {}
  if (payload.rating !== undefined) {
    updates.rating = payload.rating
  }
  if (payload.text !== undefined) {
    updates.text = payload.text ?? null
  }

  if (!ensureTutorTextRequired(feedback.authorRole, updates.text ?? feedback.text)) {
    return c.json(buildErrorResponse(HttpStatusPhrases.UNPROCESSABLE_ENTITY), HttpStatusCodes.UNPROCESSABLE_ENTITY)
  }

  if (Object.keys(updates).length === 0) {
    return c.json(buildErrorResponse(HttpStatusPhrases.UNPROCESSABLE_ENTITY), HttpStatusCodes.UNPROCESSABLE_ENTITY)
  }

  const [updated] = await db.update(lessonFeedback)
    .set(updates)
    .where(eq(lessonFeedback.id, feedback.id))
    .returning()

  return c.json({
    id: updated.id,
    lessonId: updated.lessonId,
    bookingId: updated.bookingId,
    authorUserId: updated.authorUserId,
    targetUserId: updated.targetUserId,
    authorRole: updated.authorRole,
    rating: updated.rating,
    text: updated.text ?? null,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString()
  }, HttpStatusCodes.OK)
}

export const adminDeleteFeedback: AppRouteHandler<AdminDeleteFeedbackRoute> = async (c) => {
  ensureAdmin(c)
  const { feedbackId } = c.req.valid('param')

  const [deleted] = await db.delete(lessonFeedback)
    .where(eq(lessonFeedback.id, feedbackId))
    .returning({ id: lessonFeedback.id })

  if (!deleted) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  return c.json({ message: 'Feedback deleted.' }, HttpStatusCodes.OK)
}
