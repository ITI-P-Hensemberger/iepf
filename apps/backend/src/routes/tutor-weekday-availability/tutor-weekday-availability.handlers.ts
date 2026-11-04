// Purpose: Tutor weekday availability handlers.
import type { Context } from 'hono'

import { and, eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'

import type { AppBindings, AppRouteHandler } from '@/lib/types'

import db from '@/db'
import { tutorWeekdayAvailability } from '@/db/schemas/tutor-weekday-availability.schema'
import { buildErrorResponse } from '@/lib/error-response'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'

import type { GetWeekdayAvailabilityRoute, UpdateWeekdayAvailabilityRoute } from './tutor-weekday-availability.routes'

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
    if (currentUser.isActive === true) {
      return currentUser
    }
    forbid()
  }

  if (currentUser.role === 'tutor' && currentUser.id === tutorId) {
    if (currentUser.isActive === true) {
      return currentUser
    }
    forbid()
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

async function initializeWeekdaysIfNeeded(tutorId: string) {
  const existing = await db.query.tutorWeekdayAvailability.findMany({
    where(fields, operators) {
      return operators.eq(fields.tutorId, tutorId)
    },
    columns: { weekday: true, isAvailable: true, startTime: true }
  })

  if (existing.length === 5) {
    return existing.sort((a, b) => a.weekday - b.weekday)
  }

  const existingWeekdays = new Set(existing.map(e => e.weekday))
  const missing = [1, 2, 3, 4, 5].filter(w => !existingWeekdays.has(w))

  if (missing.length > 0) {
    await db.insert(tutorWeekdayAvailability).values(
      missing.map(weekday => ({
        tutorId,
        weekday,
        isAvailable: false,
        startTime: null
      }))
    )
  }

  const all = await db.query.tutorWeekdayAvailability.findMany({
    where(fields, operators) {
      return operators.eq(fields.tutorId, tutorId)
    },
    columns: { weekday: true, isAvailable: true, startTime: true }
  })

  return all.sort((a, b) => a.weekday - b.weekday)
}

export const getWeekdayAvailability: AppRouteHandler<GetWeekdayAvailabilityRoute> = async (c) => {
  const { tutorId } = c.req.valid('param')
  ensureAdminOrSelfTutor(c, tutorId)

  const tutor = await ensureTutorExists(tutorId)
  if (!tutor) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  const weekdays = await initializeWeekdaysIfNeeded(tutorId)

  return c.json({
    tutorId,
    weekdays: weekdays.map(w => ({
      weekday: w.weekday,
      isAvailable: w.isAvailable,
      startTime: w.startTime ?? null
    }))
  }, HttpStatusCodes.OK)
}

export const updateWeekdayAvailability: AppRouteHandler<UpdateWeekdayAvailabilityRoute> = async (c) => {
  const { tutorId } = c.req.valid('param')
  const payload = c.req.valid('json')
  ensureAdminOrSelfTutor(c, tutorId)

  const tutor = await ensureTutorExists(tutorId)
  if (!tutor) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  await initializeWeekdaysIfNeeded(tutorId)

  for (const item of payload.weekdays) {
    await db.update(tutorWeekdayAvailability)
      .set({
        isAvailable: item.isAvailable,
        startTime: item.isAvailable ? item.startTime : null
      })
      .where(
        and(
          eq(tutorWeekdayAvailability.tutorId, tutorId),
          eq(tutorWeekdayAvailability.weekday, item.weekday)
        )
      )
  }

  const weekdays = await db.query.tutorWeekdayAvailability.findMany({
    where(fields, operators) {
      return operators.eq(fields.tutorId, tutorId)
    },
    columns: { weekday: true, isAvailable: true, startTime: true }
  })

  return c.json({
    tutorId,
    weekdays: weekdays
      .sort((a, b) => a.weekday - b.weekday)
      .map(w => ({
        weekday: w.weekday,
        isAvailable: w.isAvailable,
        startTime: w.startTime ?? null
      }))
  }, HttpStatusCodes.OK)
}
