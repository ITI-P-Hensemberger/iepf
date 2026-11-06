// Purpose: Global settings handlers for admins and role-specific consumers.
import type { Context } from 'hono'

import { eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'

import type { AppBindings, AppRouteHandler } from '@/lib/types'

import db from '@/db'
import { analyticsDaily } from '@/db/schemas/analytics-daily.schema'
import { globalSettings } from '@/db/schemas/global-settings.schema'
import { tutorInviteTokens } from '@/db/schemas/tutor-invite-tokens.schema'
import { users } from '@/db/schemas/users.schema'
import { buildErrorResponse } from '@/lib/error-response'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { verifyPassword } from '@/lib/password'
import { clearReportExport, hasRecentReportExport, REPORT_VALID_MINUTES } from '@/lib/year-report-export'

import type {
  CheckSchoolYearResetRoute,
  GetAdminSettingsRoute,
  GetMySettingsRoute,
  GetPublicMaintenanceRoute,
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

// Why the reset cannot go ahead, or null. The deletion cascades to all school-year data:
// it needs the real admin, re-authenticated, who has just saved the year report.
async function resetRefusal(c: HandlerContext, adminId: string, password: string) {
  if (c.get('impersonation')) {
    return { status: HttpStatusCodes.FORBIDDEN, message: 'Reset non consentito durante una sessione impersonata' } as const
  }
  const account = await db.query.users.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, adminId)
    },
    columns: { passwordHash: true }
  })
  if (!account || !await verifyPassword(account.passwordHash, password)) {
    return { status: HttpStatusCodes.FORBIDDEN, message: 'Password non corretta' } as const
  }
  if (!await hasRecentReportExport(adminId)) {
    return { status: HttpStatusCodes.CONFLICT, message: `Scarica il report dell'anno prima del reset (vale ${REPORT_VALID_MINUTES} minuti)` } as const
  }
  return null
}

// The first confirmation of the reset page: the same checks as the reset, deleting nothing.
export const checkSchoolYearReset: AppRouteHandler<CheckSchoolYearResetRoute> = async (c) => {
  const admin = ensureAdmin(c)
  const refusal = await resetRefusal(c, admin.id, c.req.valid('json').password)
  if (refusal) {
    return c.json(buildErrorResponse(refusal.message), refusal.status)
  }
  return c.body(null, HttpStatusCodes.NO_CONTENT)
}

export const resetSchoolYear: AppRouteHandler<ResetSchoolYearRoute> = async (c) => {
  const admin = ensureAdmin(c)
  const refusal = await resetRefusal(c, admin.id, c.req.valid('json').password)
  if (refusal) {
    return c.json(buildErrorResponse(refusal.message), refusal.status)
  }

  const result = await db.transaction(async (tx) => {
    await tx.delete(tutorInviteTokens)
    const students = await tx.delete(users).where(eq(users.role, 'student')).returning({ id: users.id })
    const tutors = await tx.delete(users).where(eq(users.role, 'tutor')).returning({ id: users.id })
    // The usage counts leave with the year; the report keeps their monthly summaries.
    await tx.delete(analyticsDaily)
    await clearReportExport(tx)
    return { deletedStudents: students.length, deletedTutors: tutors.length }
  })

  return c.json(result, HttpStatusCodes.OK)
}

export const getPublicMaintenance: AppRouteHandler<GetPublicMaintenanceRoute> = async (c) => {
  const maintenance = await readSetting('maintenance', defaultMaintenance)
  const parsed = maintenanceSchema.safeParse(maintenance)
  const value = parsed.success ? parsed.data : defaultMaintenance
  return c.json({ enabled: value.enabled, message: value.message, roles: value.roles }, HttpStatusCodes.OK)
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
