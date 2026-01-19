// Purpose: Tutor availability handlers.
import type { Context } from 'hono'

import { and, eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'

import type { AppBindings, AppRouteHandler } from '@/lib/types'

import db from '@/db'
import { tutorAvailability } from '@/db/schemas/tutor-availability.schema'
import { tutorSettings } from '@/db/schemas/tutor-settings.schema'
import { DEFAULT_TUTOR_SETTINGS } from '@/lib/constants'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'

import type {
  CreateAvailabilityRoute,
  DeleteAvailabilityRoute,
  ListAvailabilityRoute,
  ListAvailableSlotsRoute
} from './tutor-availability.routes'

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

function ensureAuthenticated(c: HandlerContext) {
  const currentUser = c.get('currentUser')
  if (!currentUser) {
    forbid()
  }
  return currentUser
}

async function ensureActiveStudent(currentUser: { id: string, role: string }) {
  if (currentUser.role !== 'student') {
    return
  }
  const profile = await db.query.studentProfiles.findFirst({
    where(fields, operators) {
      return operators.eq(fields.userId, currentUser.id)
    },
    columns: { isActive: true }
  })
  if (!profile?.isActive) {
    forbid()
  }
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

async function ensureTutorSettings(tutorId: string) {
  const existing = await db.query.tutorSettings.findFirst({
    where(fields, operators) {
      return operators.eq(fields.tutorId, tutorId)
    },
    columns: {
      defaultStartTime: true,
      defaultDurationMinutes: true,
      defaultSeats: true
    }
  })

  if (existing) {
    return existing
  }

  const [created] = await db.insert(tutorSettings).values({
    tutorId,
    ...DEFAULT_TUTOR_SETTINGS
  }).returning({
    defaultStartTime: tutorSettings.defaultStartTime,
    defaultDurationMinutes: tutorSettings.defaultDurationMinutes,
    defaultSeats: tutorSettings.defaultSeats
  })

  return created
}

function nextWeekRangeUTC(now: Date) {
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const day = base.getUTCDay()
  let daysUntilNextMonday = (8 - day) % 7
  if (daysUntilNextMonday === 0) {
    daysUntilNextMonday = 7
  }

  const start = new Date(base)
  start.setUTCDate(base.getUTCDate() + daysUntilNextMonday)
  const end = new Date(start)
  end.setUTCDate(start.getUTCDate() + 6)

  return { start, end }
}

function buildSlotStartAt(date: string, startTime: string) {
  return new Date(`${date}T${startTime}:00.000Z`)
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
      startAt: true,
      durationMinutes: true,
      seats: true
    }
  })

  return c.json(rows.map(row => ({
    ...row,
    startAt: new Date(row.startAt).toISOString()
  })), HttpStatusCodes.OK)
}

export const listAvailableSlots: AppRouteHandler<ListAvailableSlotsRoute> = async (c) => {
  const { tutorId } = c.req.valid('param')
  const currentUser = ensureAuthenticated(c)
  // Only activated students may browse available lesson slots.
  await ensureActiveStudent(currentUser)

  const tutor = await ensureTutorExists(tutorId)
  if (!tutor) {
    return c.json({ message: HttpStatusPhrases.NOT_FOUND }, HttpStatusCodes.NOT_FOUND)
  }

  const now = new Date()
  const rows = await db.query.tutorAvailability.findMany({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.tutorId, tutorId),
        operators.gte(fields.startAt, now)
      )
    },
    columns: {
      id: true,
      tutorId: true,
      startAt: true,
      durationMinutes: true,
      seats: true
    }
  })

  if (rows.length === 0) {
    return c.json([], HttpStatusCodes.OK)
  }

  const availabilityIds = rows.map(row => row.id)
  const bookedLessons = await db.query.lessons.findMany({
    where(fields, operators) {
      return operators.inArray(fields.availabilityId, availabilityIds)
    },
    columns: { availabilityId: true }
  })

  const bookedIds = new Set(bookedLessons.map(lesson => lesson.availabilityId).filter(Boolean))
  const available = rows.filter(row => !bookedIds.has(row.id))

  return c.json(available.map(row => ({
    ...row,
    startAt: new Date(row.startAt).toISOString()
  })), HttpStatusCodes.OK)
}

export const createAvailability: AppRouteHandler<CreateAvailabilityRoute> = async (c) => {
  const { tutorId } = c.req.valid('param')
  const payload = c.req.valid('json')
  ensureAdminOrSelfTutor(c, tutorId)

  const tutor = await ensureTutorExists(tutorId)
  if (!tutor) {
    return c.json({ message: HttpStatusPhrases.NOT_FOUND }, HttpStatusCodes.NOT_FOUND)
  }

  const settings = await ensureTutorSettings(tutorId)

  const availabilityDate = new Date(`${payload.date}T00:00:00.000Z`)
  const { start, end } = nextWeekRangeUTC(new Date())
  if (availabilityDate < start || availabilityDate > end) {
    return c.json({ message: HttpStatusPhrases.BAD_REQUEST }, HttpStatusCodes.BAD_REQUEST)
  }

  const startAt = buildSlotStartAt(payload.date, settings.defaultStartTime)
  const existing = await db.query.tutorAvailability.findFirst({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.tutorId, tutorId),
        operators.eq(fields.startAt, startAt)
      )
    },
    columns: { id: true }
  })

  if (existing) {
    return c.json({ message: HttpStatusPhrases.CONFLICT }, HttpStatusCodes.CONFLICT)
  }

  const [inserted] = await db.insert(tutorAvailability).values({
    tutorId,
    startAt,
    durationMinutes: settings.defaultDurationMinutes,
    seats: settings.defaultSeats
  }).returning({
    id: tutorAvailability.id,
    tutorId: tutorAvailability.tutorId,
    startAt: tutorAvailability.startAt,
    durationMinutes: tutorAvailability.durationMinutes,
    seats: tutorAvailability.seats
  })

  return c.json(
    {
      ...inserted,
      startAt: new Date(inserted.startAt).toISOString()
    },
    HttpStatusCodes.CREATED
  )
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

  const bookedLesson = await db.query.lessons.findFirst({
    where(fields, operators) {
      return operators.eq(fields.availabilityId, availabilityId)
    },
    columns: { id: true }
  })

  if (bookedLesson) {
    return c.json({ message: HttpStatusPhrases.CONFLICT }, HttpStatusCodes.CONFLICT)
  }

  await db.delete(tutorAvailability)
    .where(and(eq(tutorAvailability.id, availabilityId), eq(tutorAvailability.tutorId, tutorId)))

  return c.body(null, HttpStatusCodes.NO_CONTENT)
}
