// Purpose: Global settings handlers for admins and role-specific consumers.
import type { Context } from 'hono'

import { eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'

import type { AppBindings, AppRouteHandler } from '@/lib/types'

import db from '@/db'
import { globalSettings } from '@/db/schemas/global-settings.schema'
import { tutorInviteTokens } from '@/db/schemas/tutor-invite-tokens.schema'
import { users } from '@/db/schemas/users.schema'
import { buildErrorResponse } from '@/lib/error-response'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { verifyPassword } from '@/lib/password'
import { clearReportExport, hasRecentReportExport, REPORT_VALID_MINUTES } from '@/lib/year-report-export'

import type {
  GetAdminSettingsRoute,
  GetMySettingsRoute,
  ResetSchoolYearRoute,
  UpdateAdminSettingsRoute
} from './settings.routes'

import { closureDatesSchema, maintenanceSchema, serviceMessagesSchema } from './settings.routes'

type HandlerContext = Context<AppBindings>
type Role = 'student' | 'tutor' | 'admin' | 'activator'

const defaultMaintenance = maintenanceSchema.parse({
  enabled: false,
  message: null,
  roles: ['student', 'tutor']
})

const defaultServiceMessages = serviceMessagesSchema.parse({})
const defaultClosureDates = closureDatesSchema.parse([])

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

async function readSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.query.globalSettings.findFirst({
    where(fields, operators) {
      return operators.eq(fields.key, key)
    },
    columns: { value: true }
  })
  if (!row) {
    return fallback
  }
  return row.value as T
}

async function writeSetting(key: string, value: unknown, updatedBy: string) {
  await db.insert(globalSettings)
    .values({
      key,
      value,
      updatedBy
    })
    .onConflictDoUpdate({
      target: globalSettings.key,
      set: {
        value,
        updatedBy,
        updatedAt: new Date()
      }
    })
}

export const getAdminSettings: AppRouteHandler<GetAdminSettingsRoute> = async (c) => {
  ensureAdmin(c)

  const [maintenance, serviceMessages, closureDates] = await Promise.all([
    readSetting('maintenance', defaultMaintenance),
    readSetting('serviceMessages', defaultServiceMessages),
    readSetting('closureDates', defaultClosureDates)
  ])

  return c.json(
    {
      maintenance,
      serviceMessages,
      closureDates
    },
    HttpStatusCodes.OK
  )
}

export const updateAdminSettings: AppRouteHandler<UpdateAdminSettingsRoute> = async (c) => {
  const admin = ensureAdmin(c)
  const payload = c.req.valid('json')

  const updates: Array<Promise<void>> = []
  if (payload.maintenance) {
    updates.push(writeSetting('maintenance', payload.maintenance, admin.id))
  }
  if (payload.serviceMessages) {
    updates.push(writeSetting('serviceMessages', payload.serviceMessages, admin.id))
  }
  if (payload.closureDates) {
    updates.push(writeSetting('closureDates', payload.closureDates, admin.id))
  }
  await Promise.all(updates)

  const [maintenance, serviceMessages, closureDates] = await Promise.all([
    readSetting('maintenance', defaultMaintenance),
    readSetting('serviceMessages', defaultServiceMessages),
    readSetting('closureDates', defaultClosureDates)
  ])

  return c.json(
    {
      maintenance,
      serviceMessages,
      closureDates
    },
    HttpStatusCodes.OK
  )
}

export const resetSchoolYear: AppRouteHandler<ResetSchoolYearRoute> = async (c) => {
  const admin = ensureAdmin(c)
  const { password } = c.req.valid('json')

  // The deletion cascades to all school-year data: require the real admin, re-authenticated.
  if (c.get('impersonation')) {
    return c.json(buildErrorResponse('Reset non consentito durante una sessione impersonata'), HttpStatusCodes.FORBIDDEN)
  }

  const account = await db.query.users.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, admin.id)
    },
    columns: { passwordHash: true }
  })

  if (!account || !await verifyPassword(account.passwordHash, password)) {
    return c.json(buildErrorResponse('Password non corretta'), HttpStatusCodes.FORBIDDEN)
  }

  // Nothing of the year survives the reset except the report: it must have just been saved.
  if (!await hasRecentReportExport(admin.id)) {
    return c.json(
      buildErrorResponse(`Scarica il report dell'anno prima del reset (vale ${REPORT_VALID_MINUTES} minuti)`),
      HttpStatusCodes.CONFLICT
    )
  }

  const result = await db.transaction(async (tx) => {
    await tx.delete(tutorInviteTokens)
    const students = await tx.delete(users).where(eq(users.role, 'student')).returning({ id: users.id })
    const tutors = await tx.delete(users).where(eq(users.role, 'tutor')).returning({ id: users.id })
    await clearReportExport(tx)
    return { deletedStudents: students.length, deletedTutors: tutors.length }
  })

  return c.json(result, HttpStatusCodes.OK)
}

export const getMySettings: AppRouteHandler<GetMySettingsRoute> = async (c) => {
  const currentUser = c.get('currentUser')
  if (!currentUser) {
    throw new HTTPException(HttpStatusCodes.UNAUTHORIZED, {
      message: HttpStatusPhrases.UNAUTHORIZED
    })
  }

  const role = currentUser.role as Role
  const [maintenance, serviceMessages] = await Promise.all([
    readSetting('maintenance', defaultMaintenance),
    readSetting('serviceMessages', defaultServiceMessages)
  ])

  const maintenanceAllowed = role === 'student' || role === 'tutor'
    ? maintenance.roles.includes(role)
    : false
  const roleMessage = serviceMessages?.[role] ?? null

  return c.json(
    {
      maintenance: {
        enabled: maintenance.enabled && maintenanceAllowed,
        message: maintenanceAllowed ? maintenance.message : null
      },
      serviceMessage: roleMessage ?? null
    },
    HttpStatusCodes.OK
  )
}
