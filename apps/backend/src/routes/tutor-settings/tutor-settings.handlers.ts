// Purpose: Tutor settings handlers.
import type { Context } from 'hono'

import { eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'

import type { AppBindings, AppRouteHandler } from '@/lib/types'

import db from '@/db'
import { tutorSettings } from '@/db/schemas/tutor-settings.schema'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { buildErrorResponse } from '@/lib/error-response'

import type { GetSettingsRoute, UpdateSettingsRoute } from './tutor-settings.routes'

type HandlerContext = Context<AppBindings>

function forbid(): never {
  throw new HTTPException(HttpStatusCodes.FORBIDDEN, {
    message: HttpStatusPhrases.FORBIDDEN
  })
}

function ensureAdminOrSelfTutor(c: HandlerContext, tutorId: string, requireAdmin = false) {
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

  if (!requireAdmin && currentUser.role === 'tutor' && currentUser.id === tutorId) {
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

export const getSettings: AppRouteHandler<GetSettingsRoute> = async (c) => {
  const { tutorId } = c.req.valid('param')
  ensureAdminOrSelfTutor(c, tutorId, false)

  const tutor = await ensureTutorExists(tutorId)
  if (!tutor) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  const existing = await db.query.tutorSettings.findFirst({
    where(fields, operators) {
      return operators.eq(fields.tutorId, tutorId)
    },
    columns: {
      tutorId: true,
      defaultStartTime: true,
      defaultDurationMinutes: true,
      defaultSeats: true
    }
  })

  const settings = existing ?? {
    tutorId,
    defaultStartTime: '15:00',
    defaultDurationMinutes: 60,
    defaultSeats: 2
  }

  return c.json(settings, HttpStatusCodes.OK)
}

export const updateSettings: AppRouteHandler<UpdateSettingsRoute> = async (c) => {
  const { tutorId } = c.req.valid('param')
  const payload = c.req.valid('json')
  ensureAdminOrSelfTutor(c, tutorId, true)

  const tutor = await ensureTutorExists(tutorId)
  if (!tutor) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  const existing = await db.query.tutorSettings.findFirst({
    where(fields, operators) {
      return operators.eq(fields.tutorId, tutorId)
    },
    columns: { id: true }
  })

  if (existing) {
    await db.update(tutorSettings)
      .set(payload)
      .where(eq(tutorSettings.tutorId, tutorId))
  }
  else {
    await db.insert(tutorSettings).values({
      tutorId,
      ...payload
    })
  }

  return c.json(
    {
      tutorId,
      defaultStartTime: payload.defaultStartTime,
      defaultDurationMinutes: payload.defaultDurationMinutes,
      defaultSeats: payload.defaultSeats
    },
    HttpStatusCodes.OK
  )
}
