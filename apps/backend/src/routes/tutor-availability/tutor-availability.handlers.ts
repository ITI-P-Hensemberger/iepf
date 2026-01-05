// Purpose: Tutor availability handlers.
import type { Context } from 'hono'

import { and, eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'

import type { AppBindings, AppRouteHandler } from '@/lib/types'

import db from '@/db'
import { tutorAvailability } from '@/db/schemas/tutor-availability.schema'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'

import type { CreateAvailabilityRoute, DeleteAvailabilityRoute, ListAvailabilityRoute } from './tutor-availability.routes'

type HandlerContext = Context<AppBindings>

function forbid(): never {
  throw new HTTPException(HttpStatusCodes.FORBIDDEN, {
    message: HttpStatusPhrases.FORBIDDEN
  })
}

function ensureAdminOrSelfTutor(c: HandlerContext, tutorId: string) {
  const currentUser = c.get('currentUser')
  if (!currentUser) {
    forbid()
  }

  if (currentUser.role === 'admin') {
    return currentUser
  }

  if (currentUser.role === 'tutor' && currentUser.id === tutorId) {
    return currentUser
  }

  forbid()
}

async function ensureTutorExists(tutorId: string) {
  return db.query.users.findFirst({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.id, tutorId),
        operators.eq(fields.role, 'tutor')
      )
    },
    columns: { id: true }
  })
}

export const listAvailability: AppRouteHandler<ListAvailabilityRoute> = async (c) => {
  const { tutorId } = c.req.valid('param')
  ensureAdminOrSelfTutor(c, tutorId)

  const tutor = await ensureTutorExists(tutorId)
  if (!tutor) {
    return c.json({ message: HttpStatusPhrases.NOT_FOUND }, HttpStatusCodes.NOT_FOUND)
  }

  const rows = await db.query.tutorAvailability.findMany({
    where(fields, operators) {
      return operators.eq(fields.tutorId, tutorId)
    },
    columns: {
      id: true,
      tutorId: true,
      weekday: true,
      startTime: true,
      endTime: true
    }
  })

  return c.json(rows, HttpStatusCodes.OK)
}

export const createAvailability: AppRouteHandler<CreateAvailabilityRoute> = async (c) => {
  const { tutorId } = c.req.valid('param')
  const payload = c.req.valid('json')
  ensureAdminOrSelfTutor(c, tutorId)

  const tutor = await ensureTutorExists(tutorId)
  if (!tutor) {
    return c.json({ message: HttpStatusPhrases.NOT_FOUND }, HttpStatusCodes.NOT_FOUND)
  }

  const [inserted] = await db.insert(tutorAvailability).values({
    tutorId,
    weekday: payload.weekday,
    startTime: payload.startTime,
    endTime: payload.endTime
  }).returning({
    id: tutorAvailability.id,
    tutorId: tutorAvailability.tutorId,
    weekday: tutorAvailability.weekday,
    startTime: tutorAvailability.startTime,
    endTime: tutorAvailability.endTime
  })

  return c.json(inserted, HttpStatusCodes.CREATED)
}

export const deleteAvailability: AppRouteHandler<DeleteAvailabilityRoute> = async (c) => {
  const { tutorId, availabilityId } = c.req.valid('param')
  ensureAdminOrSelfTutor(c, tutorId)

  const existing = await db.query.tutorAvailability.findFirst({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.id, availabilityId),
        operators.eq(fields.tutorId, tutorId)
      )
    },
    columns: { id: true }
  })

  if (!existing) {
    return c.json({ message: HttpStatusPhrases.NOT_FOUND }, HttpStatusCodes.NOT_FOUND)
  }

  await db.delete(tutorAvailability)
    .where(and(eq(tutorAvailability.id, availabilityId), eq(tutorAvailability.tutorId, tutorId)))

  return c.body(null, HttpStatusCodes.NO_CONTENT)
}
