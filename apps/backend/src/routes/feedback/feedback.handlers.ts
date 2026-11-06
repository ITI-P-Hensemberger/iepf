// Purpose: Lesson feedback handlers for tutors, students, and admins.
import type { Context } from 'hono'

import { and, asc, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'

import type { FeedbackEditorRole, FeedbackSummary } from '@/lib/feedback-history'
import type { AppBindings, AppRouteHandler } from '@/lib/types'

import db from '@/db'
import { lessonFeedback } from '@/db/schemas/lesson-feedback.schema'
import { lessons } from '@/db/schemas/lessons.schema'
import { users } from '@/db/schemas/users.schema'
import { LOW_FEEDBACK_RATING, notifyLowFeedback } from '@/lib/admin-notifications'
import { buildErrorResponse } from '@/lib/error-response'
import { feedbackChanged, feedbackEditableUntil, feedbackSummaries, fullName, isFeedbackEditable, listFeedbackVersions, recordFeedbackVersion } from '@/lib/feedback-history'
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
  GetFeedbackHistoryRoute,
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

type FeedbackRow = typeof lessonFeedback.$inferSelect

const EDIT_WINDOW_CLOSED = 'Il feedback si può modificare entro 7 giorni dalla lezione.'

function toFeedbackResponse(row: FeedbackRow, summary: FeedbackSummary | undefined, editableUntil: Date | null = null) {
  return {
    id: row.id,
    lessonId: row.lessonId,
    bookingId: row.bookingId,
    authorUserId: row.authorUserId,
    targetUserId: row.targetUserId,
    authorRole: row.authorRole,
    rating: row.rating,
    text: row.text ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    versionCount: summary?.versionCount ?? 1,
    lastEditorRole: summary?.lastEditorRole ?? row.authorRole,
    editableUntil: editableUntil ? editableUntil.toISOString() : null,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null
  }
}

async function withSummaries(rows: FeedbackRow[], editableUntil?: (row: FeedbackRow) => Date | null) {
  const summaries = await feedbackSummaries(rows.map(row => row.id))
  return rows.map(row => toFeedbackResponse(row, summaries.get(row.id), editableUntil?.(row) ?? null))
}

async function findActiveFeedback(bookingId: string, authorUserId: string, authorRole: string) {
  return db.query.lessonFeedback.findFirst({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.bookingId, bookingId),
        operators.eq(fields.authorUserId, authorUserId),
        operators.eq(fields.authorRole, authorRole),
        operators.isNull(fields.deletedAt)
      )
    }
  })
}

// Writes the feedback and its first version together: a feedback never exists without history.
async function insertFeedback(values: typeof lessonFeedback.$inferInsert & { rating: number }, editor: { userId: string, role: FeedbackEditorRole }) {
  return db.transaction(async (tx) => {
    const [created] = await tx.insert(lessonFeedback).values(values).returning()
    await recordFeedbackVersion(tx, { feedbackId: created.id, rating: created.rating, text: created.text ?? null, editorUserId: editor.userId, editorRole: editor.role })
    return created
  })
}

// Applies an edit and records it as a version, unless nothing changed.
async function applyFeedbackEdit(
  feedback: FeedbackRow,
  payload: { rating?: number, text?: string | null },
  editor: { userId: string, role: FeedbackEditorRole }
) {
  const next = {
    rating: payload.rating ?? feedback.rating,
    text: payload.text !== undefined ? (payload.text ?? null) : (feedback.text ?? null)
  }
  if (!feedbackChanged({ rating: feedback.rating, text: feedback.text ?? null }, next)) {
    return feedback
  }
  return db.transaction(async (tx) => {
    const [updated] = await tx.update(lessonFeedback)
      .set(next)
      .where(eq(lessonFeedback.id, feedback.id))
      .returning()
    await recordFeedbackVersion(tx, { feedbackId: updated.id, rating: updated.rating, text: updated.text ?? null, editorUserId: editor.userId, editorRole: editor.role })
    return updated
  })
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

  if (currentUser.role === 'student' && booking.studentPresence !== true) {
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

  if (await findActiveFeedback(booking.id, authorUserId, authorRole)) {
    return c.json(buildErrorResponse(HttpStatusPhrases.CONFLICT), HttpStatusCodes.CONFLICT)
  }

  const created = await insertFeedback({
    lessonId: lesson.id,
    bookingId: booking.id,
    authorUserId,
    targetUserId,
    authorRole,
    rating: payload.rating,
    text: payload.text ?? null
  }, { userId: currentUser.id, role: authorRole })

  notifyLowFeedback({ lessonId: lesson.id, studentId: booking.studentId, authorRole, rating: created.rating })

  return c.json(toFeedbackResponse(created, undefined, feedbackEditableUntil(lesson.startAt)), HttpStatusCodes.OK)
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

  if (currentUser.role !== 'student' && currentUser.role !== 'tutor' && currentUser.role !== 'admin') {
    forbid()
  }

  const feedback = await db.query.lessonFeedback.findFirst({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.id, feedbackId),
        operators.eq(fields.lessonId, lessonId),
        operators.isNull(fields.deletedAt)
      )
    }
  })

  if (!feedback) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  // Students and tutors only touch what they wrote themselves.
  if (currentUser.role === 'admin') {
    ensureAdmin(c)
  }
  else if (feedback.authorUserId !== currentUser.id || feedback.authorRole !== currentUser.role) {
    forbid()
  }

  const lesson = await fetchLesson(lessonId)
  if (!lesson) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  if (!ensureLessonStarted(lesson.startAt)) {
    return c.json(buildErrorResponse(HttpStatusPhrases.CONFLICT), HttpStatusCodes.CONFLICT)
  }

  if (currentUser.role !== 'admin' && !isFeedbackEditable(lesson.startAt)) {
    return c.json(buildErrorResponse(EDIT_WINDOW_CLOSED), HttpStatusCodes.CONFLICT)
  }

  if (payload.rating === undefined && payload.text === undefined) {
    return c.json(buildErrorResponse(HttpStatusPhrases.UNPROCESSABLE_ENTITY), HttpStatusCodes.UNPROCESSABLE_ENTITY)
  }

  if (!ensureTutorTextRequired(feedback.authorRole, payload.text !== undefined ? payload.text : feedback.text)) {
    return c.json(buildErrorResponse(HttpStatusPhrases.UNPROCESSABLE_ENTITY), HttpStatusCodes.UNPROCESSABLE_ENTITY)
  }

  const updated = await applyFeedbackEdit(feedback, payload, { userId: currentUser.id, role: currentUser.role })

  // Only a rating that drops into the low range: editing the text of a low one is no news.
  if (updated.rating !== feedback.rating && feedback.rating > LOW_FEEDBACK_RATING) {
    const authorRole = updated.authorRole === 'tutor' ? 'tutor' : 'student'
    const studentId = authorRole === 'student' ? updated.authorUserId : updated.targetUserId
    notifyLowFeedback({ lessonId: updated.lessonId, studentId, authorRole, rating: updated.rating })
  }

  const [response] = await withSummaries([updated], () => currentUser.role === 'admin' ? null : feedbackEditableUntil(lesson.startAt))
  return c.json(response, HttpStatusCodes.OK)
}

export const listMyFeedback: AppRouteHandler<ListMyFeedbackRoute> = async (c) => {
  const currentUser = c.get('currentUser')
  const query = c.req.valid('query')

  if (!currentUser || (currentUser.role !== 'student' && currentUser.role !== 'tutor')) {
    forbid()
  }

  // Only what the user wrote: feedback about them is never shown to them.
  const conditions = [eq(lessonFeedback.authorUserId, currentUser.id), isNull(lessonFeedback.deletedAt)]

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
    .select({ feedback: lessonFeedback, lessonStartAt: lessons.startAt })
    .from(lessonFeedback)
    .innerJoin(lessons, eq(lessons.id, lessonFeedback.lessonId))
    .where(and(...conditions))
    .orderBy(query.sortDir === 'desc' ? desc(lessonFeedback.createdAt) : asc(lessonFeedback.createdAt))
    .limit(query.limit)
    .offset(query.offset)

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(lessonFeedback)
    .where(and(...conditions))

  const starts = new Map(rows.map(row => [row.feedback.id, row.lessonStartAt]))
  const data = await withSummaries(rows.map(row => row.feedback), row => feedbackEditableUntil(starts.get(row.id)!))

  return c.json(buildPagedResponse(data, Number(total), query.limit, query.offset), HttpStatusCodes.OK)
}

export const adminListFeedback: AppRouteHandler<AdminListFeedbackRoute> = async (c) => {
  ensureAdmin(c)
  const query = c.req.valid('query')

  const conditions = query.includeDeleted ? [] : [isNull(lessonFeedback.deletedAt)]

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

  const baseQuery = db
    .select({ feedback: lessonFeedback })
    .from(lessonFeedback)
    .innerJoin(lessons, eq(lessonFeedback.lessonId, lessons.id))

  const rows = await (whereClause ? baseQuery.where(whereClause) : baseQuery)
    .orderBy(query.sortDir === 'desc' ? desc(orderField) : asc(orderField))
    .limit(query.limit)
    .offset(query.offset)

  const baseTotalQuery = db
    .select({ total: sql<number>`count(*)` })
    .from(lessonFeedback)
  const totalQuery = (query.lessonFrom || query.lessonTo)
    ? baseTotalQuery.innerJoin(lessons, eq(lessonFeedback.lessonId, lessons.id))
    : baseTotalQuery
  const [{ total }] = await (whereClause ? totalQuery.where(whereClause) : totalQuery)

  const data = await withSummaries(rows.map(row => row.feedback))

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

  const [response] = await withSummaries([feedback])
  return c.json(response, HttpStatusCodes.OK)
}

export const adminCreateFeedback: AppRouteHandler<AdminCreateFeedbackRoute> = async (c) => {
  const admin = ensureAdmin(c)
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

  if (await findActiveFeedback(booking.id, payload.authorUserId, payload.authorRole)) {
    return c.json(buildErrorResponse(HttpStatusPhrases.CONFLICT), HttpStatusCodes.CONFLICT)
  }

  // Written by an admin on the author's behalf: the history says so.
  const created = await insertFeedback({
    lessonId: payload.lessonId,
    bookingId: payload.bookingId,
    authorUserId: payload.authorUserId,
    targetUserId: payload.targetUserId,
    authorRole: payload.authorRole,
    rating: payload.rating,
    text: payload.text ?? null
  }, { userId: admin.id, role: 'admin' })

  return c.json(toFeedbackResponse(created, { versionCount: 1, lastEditorRole: 'admin' }), HttpStatusCodes.OK)
}

export const adminUpdateFeedback: AppRouteHandler<AdminUpdateFeedbackRoute> = async (c) => {
  const admin = ensureAdmin(c)
  const { feedbackId } = c.req.valid('param')
  const payload = c.req.valid('json')

  const feedback = await db.query.lessonFeedback.findFirst({
    where(fields, operators) {
      return operators.and(operators.eq(fields.id, feedbackId), operators.isNull(fields.deletedAt))
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

  if (payload.rating === undefined && payload.text === undefined) {
    return c.json(buildErrorResponse(HttpStatusPhrases.UNPROCESSABLE_ENTITY), HttpStatusCodes.UNPROCESSABLE_ENTITY)
  }

  if (!ensureTutorTextRequired(feedback.authorRole, payload.text !== undefined ? payload.text : feedback.text)) {
    return c.json(buildErrorResponse(HttpStatusPhrases.UNPROCESSABLE_ENTITY), HttpStatusCodes.UNPROCESSABLE_ENTITY)
  }

  const updated = await applyFeedbackEdit(feedback, payload, { userId: admin.id, role: 'admin' })
  const [response] = await withSummaries([updated])
  return c.json(response, HttpStatusCodes.OK)
}

// Hidden, not erased: the feedback leaves every list and count, its history stays for the admins.
export const adminDeleteFeedback: AppRouteHandler<AdminDeleteFeedbackRoute> = async (c) => {
  const admin = ensureAdmin(c)
  const { feedbackId } = c.req.valid('param')

  const [deleted] = await db.update(lessonFeedback)
    .set({ deletedAt: new Date(), deletedByUserId: admin.id })
    .where(and(eq(lessonFeedback.id, feedbackId), isNull(lessonFeedback.deletedAt)))
    .returning({ id: lessonFeedback.id })

  if (!deleted) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  return c.json({ message: 'Feedback deleted.' }, HttpStatusCodes.OK)
}

// The author reads the history of their own feedback ("Tu" / "Amministratore"); the admins read
// every history with names, deleted feedback included. Anyone else, the recipient too, gets 404.
export const getFeedbackHistory: AppRouteHandler<GetFeedbackHistoryRoute> = async (c) => {
  const currentUser = c.get('currentUser')
  const { feedbackId } = c.req.valid('param')
  if (!currentUser) {
    forbid()
  }
  const isAdmin = currentUser.role === 'admin'
  if (isAdmin) {
    ensureAdmin(c)
  }

  const feedback = await db.query.lessonFeedback.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, feedbackId)
    }
  })

  const visible = feedback && (isAdmin || (
    feedback.authorUserId === currentUser.id
    && feedback.authorRole === currentUser.role
    && !feedback.deletedAt
  ))
  if (!feedback || !visible) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  let deletedByName: string | null = null
  if (isAdmin && feedback.deletedByUserId) {
    const deleter = await db.select({ firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(eq(users.id, feedback.deletedByUserId))
    deletedByName = fullName(deleter[0]?.firstName, deleter[0]?.lastName)
  }

  return c.json({
    feedbackId: feedback.id,
    deletedAt: feedback.deletedAt ? feedback.deletedAt.toISOString() : null,
    deletedByName,
    versions: await listFeedbackVersions(feedback.id, feedback.authorUserId, isAdmin)
  }, HttpStatusCodes.OK)
}
