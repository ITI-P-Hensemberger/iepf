// Purpose: Global settings handlers for admins and role-specific consumers.
import type { Context } from 'hono'

import { HTTPException } from 'hono/http-exception'

import type { AppBindings, AppRouteHandler } from '@/lib/types'

import db from '@/db'
import { globalSettings } from '@/db/schemas/global-settings.schema'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'

import type {
  GetAdminSettingsRoute,
  GetMySettingsRoute,
  UpdateAdminSettingsRoute
} from './settings.routes'

import { maintenanceSchema, serviceMessagesSchema } from './settings.routes'

type HandlerContext = Context<AppBindings>
type Role = 'student' | 'tutor' | 'admin' | 'activator'

const defaultMaintenance = maintenanceSchema.parse({
  enabled: false,
  message: null,
  roles: ['student', 'tutor']
})

const defaultServiceMessages = serviceMessagesSchema.parse({})

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

  const [maintenance, serviceMessages] = await Promise.all([
    readSetting('maintenance', defaultMaintenance),
    readSetting('serviceMessages', defaultServiceMessages)
  ])

  return c.json(
    {
      maintenance,
      serviceMessages
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
  await Promise.all(updates)

  const [maintenance, serviceMessages] = await Promise.all([
    readSetting('maintenance', defaultMaintenance),
    readSetting('serviceMessages', defaultServiceMessages)
  ])

  return c.json(
    {
      maintenance,
      serviceMessages
    },
    HttpStatusCodes.OK
  )
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
