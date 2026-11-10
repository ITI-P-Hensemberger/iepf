// Purpose: Lesson chat handlers. The booking's student and the lesson's tutor write from the booking
// until the lesson ends; afterwards, and once the lesson or booking is canceled, the chat is read-only.
// Admins (the organizers) read every chat and never write. Every request lands in the audit log.
import type { Context } from 'hono'

import { and, asc, count, eq, isNull, ne, or, sql } from 'drizzle-orm'

import type { AppBindings, AppRouteHandler } from '@/lib/types'

import db from '@/db'
import { lessonBookings } from '@/db/schemas/lesson-bookings.schema'
import { lessonMessages } from '@/db/schemas/lesson-messages.schema'
import { lessons } from '@/db/schemas/lessons.schema'
import { subjects } from '@/db/schemas/subjects.schema'
import { buildErrorResponse } from '@/lib/error-response'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { lessonState } from '@/lib/lesson-state'
import { containsProfanity } from '@/lib/profanity'
import { notifyUsers } from '@/lib/push'
import { chatMessagePush } from '@/lib/push-messages'

import type { GetChatRoute, ListUnreadRoute, MarkChatReadRoute, SendMessageRoute } from './lesson-messages.routes'

type ChatRole = 'student' | 'tutor' | 'admin'

interface ChatAccess {
  role: ChatRole
  userId: string
  booking: { id: string, studentId: string, status: string, subjectId: string }
  lesson: { id: string, tutorId: string, status: string, startAt: Date, durationMinutes: number }
}

// The chat's booking and who is looking at it, or the error to answer with.
async function chatAccess(c: Context<AppBindings>, lessonId: string, bookingId: string): Promise<ChatAccess | { error: 403 | 404 }> {
  const user = c.get('currentUser')
  // Students carry no flag here: a deactivated one cannot sign in at all.
  if (!user || (user.role !== 'student' && user.isActive !== true)) {
    return { error: HttpStatusCodes.FORBIDDEN }
  }
  const [row] = await db.select({
    booking: {
      id: lessonBookings.id,
      studentId: lessonBookings.studentId,
      status: lessonBookings.status,
      subjectId: lessonBookings.subjectId
    },
    lesson: {
      id: lessons.id,
      tutorId: lessons.tutorId,
      status: lessons.status,
      startAt: lessons.startAt,
      durationMinutes: lessons.durationMinutes
    }
  })
    .from(lessonBookings)
    .innerJoin(lessons, eq(lessons.id, lessonBookings.lessonId))
    .where(and(eq(lessonBookings.id, bookingId), eq(lessonBookings.lessonId, lessonId)))
  if (!row) {
    return { error: HttpStatusCodes.NOT_FOUND }
  }
  if (user.role === 'admin') {
    return { ...row, role: 'admin', userId: user.id }
  }
  if (user.role === 'student' && row.booking.studentId === user.id) {
    return { ...row, role: 'student', userId: user.id }
  }
  if (user.role === 'tutor' && row.lesson.tutorId === user.id) {
    return { ...row, role: 'tutor', userId: user.id }
  }
  return { error: HttpStatusCodes.FORBIDDEN }
}

function refuse(c: Context<AppBindings>, error: 403 | 404) {
  return error === HttpStatusCodes.NOT_FOUND
    ? c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
    : c.json(buildErrorResponse(HttpStatusPhrases.FORBIDDEN), HttpStatusCodes.FORBIDDEN)
}

export function isChatOpen(access: Pick<ChatAccess, 'booking' | 'lesson'>, now = new Date()) {
  // 'upcoming': confirmed and not ended yet. A canceled lesson or booking closes the chat at once.
  return access.booking.status === 'confirmed' && lessonState(access.lesson, now) === 'upcoming'
}

function toPayload(row: typeof lessonMessages.$inferSelect, access: ChatAccess) {
  return {
    id: row.id,
    senderRole: row.senderId === access.booking.studentId ? 'student' as const : 'tutor' as const,
    mine: row.senderId === access.userId,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null
  }
}

export const getChat: AppRouteHandler<GetChatRoute> = async (c) => {
  const { lessonId, bookingId } = c.req.valid('param')
  const access = await chatAccess(c, lessonId, bookingId)
  if ('error' in access) {
    return refuse(c, access.error)
  }
  const rows = await db.select()
    .from(lessonMessages)
    .where(eq(lessonMessages.bookingId, bookingId))
    .orderBy(asc(lessonMessages.createdAt), asc(lessonMessages.id))
  return c.json({
    // Admins only read; for them the field still says whether the two can write.
    open: isChatOpen(access),
    messages: rows.map(row => toPayload(row, access))
  }, HttpStatusCodes.OK)
}

export const sendMessage: AppRouteHandler<SendMessageRoute> = async (c) => {
  const { lessonId, bookingId } = c.req.valid('param')
  const access = await chatAccess(c, lessonId, bookingId)
  if ('error' in access) {
    return refuse(c, access.error)
  }
  // Organizers read the chats; an impersonated session must not speak for the user either.
  if (access.role === 'admin' || c.get('impersonation')) {
    return refuse(c, HttpStatusCodes.FORBIDDEN)
  }
  if (!isChatOpen(access)) {
    return c.json(buildErrorResponse('La chat è chiusa.'), HttpStatusCodes.CONFLICT)
  }
  const { body } = c.req.valid('json')
  if (containsProfanity(body)) {
    return c.json(buildErrorResponse('Il messaggio contiene parole non consentite.'), HttpStatusCodes.BAD_REQUEST)
  }

  const recipientId = access.role === 'student' ? access.lesson.tutorId : access.booking.studentId
  // Only the first unread message notifies: a conversation must not fill the bell.
  const [waiting] = await db.select({ n: count() })
    .from(lessonMessages)
    .where(and(eq(lessonMessages.bookingId, bookingId), eq(lessonMessages.senderId, access.userId), isNull(lessonMessages.readAt)))
  const [created] = await db.insert(lessonMessages)
    .values({ bookingId, senderId: access.userId, body })
    .returning()

  if ((waiting?.n ?? 0) === 0) {
    const subject = await db.query.subjects.findFirst({
      where: eq(subjects.id, access.booking.subjectId),
      columns: { name: true }
    })
    const recipientRole = access.role === 'student' ? 'tutor' : 'student'
    // shortcut: chat news rides the 'bookings' switch; give it its own category if the organizers keep the chat.
    notifyUsers([recipientId], 'bookings', chatMessagePush(recipientRole, {
      lessonId,
      bookingId,
      subjectName: subject?.name ?? 'Lezione',
      startAt: access.lesson.startAt
    }))
  }

  return c.json(toPayload(created!, access), HttpStatusCodes.CREATED)
}

export const markChatRead: AppRouteHandler<MarkChatReadRoute> = async (c) => {
  const { lessonId, bookingId } = c.req.valid('param')
  const access = await chatAccess(c, lessonId, bookingId)
  if ('error' in access) {
    return refuse(c, access.error)
  }
  // An admin reading, or acting as the user, leaves the messages unread for the real person.
  if (access.role !== 'admin' && !c.get('impersonation')) {
    await db.update(lessonMessages)
      .set({ readAt: sql`now()` })
      .where(and(eq(lessonMessages.bookingId, bookingId), ne(lessonMessages.senderId, access.userId), isNull(lessonMessages.readAt)))
  }
  return c.body(null, HttpStatusCodes.NO_CONTENT)
}

export const listUnread: AppRouteHandler<ListUnreadRoute> = async (c) => {
  const user = c.get('currentUser')
  if (!user || (user.role !== 'student' && user.role !== 'tutor')) {
    return c.json([], HttpStatusCodes.OK)
  }
  const rows = await db.select({ bookingId: lessonMessages.bookingId, count: count() })
    .from(lessonMessages)
    .innerJoin(lessonBookings, eq(lessonBookings.id, lessonMessages.bookingId))
    .innerJoin(lessons, eq(lessons.id, lessonBookings.lessonId))
    .where(and(
      isNull(lessonMessages.readAt),
      ne(lessonMessages.senderId, user.id),
      or(eq(lessonBookings.studentId, user.id), eq(lessons.tutorId, user.id))
    ))
    .groupBy(lessonMessages.bookingId)
  return c.json(rows, HttpStatusCodes.OK)
}
