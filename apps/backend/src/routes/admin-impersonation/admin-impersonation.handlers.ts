// Purpose: Admin impersonation handlers.

import { eq } from 'drizzle-orm'

import type { AppRouteHandler, AuthenticatedUser } from '@/lib/types'

import db from '@/db'
import { adminProfiles } from '@/db/schemas/admin-profiles.schema'
import { users } from '@/db/schemas/users.schema'
import { createAccessToken, createImpersonationToken } from '@/lib/auth'
import { buildErrorResponse } from '@/lib/error-response'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { ensureAdmin, forbid } from '@/lib/require-admin'

import type { EndImpersonationRoute, ImpersonateRoute } from './admin-impersonation.routes'

async function loadUser(userId: string) {
  return db.query.users.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, userId)
    },
    columns: {
      id: true,
      email: true,
      role: true
    }
  })
}

async function loadActiveAdmin(userId: string) {
  return db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      isActive: adminProfiles.isActive
    })
    .from(users)
    .innerJoin(adminProfiles, eq(adminProfiles.userId, users.id))
    .where(eq(users.id, userId))
    .then(rows => rows[0])
}

export const impersonate: AppRouteHandler<ImpersonateRoute> = async (c) => {
  const admin = ensureAdmin(c)
  const payload = c.req.valid('json')

  const target = await loadUser(payload.userId)
  if (!target) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }
  // Only the people admins look after: never another admin or an activator. This also rules out
  // impersonating from inside an impersonation, which would end in that admin's own session.
  if (target.role !== 'student' && target.role !== 'tutor') {
    forbid()
  }

  const token = await createImpersonationToken(admin, target as AuthenticatedUser)

  return c.json({
    token: token.token,
    expiresIn: token.expiresIn,
    impersonatedUser: target
  }, HttpStatusCodes.OK)
}

export const endImpersonation: AppRouteHandler<EndImpersonationRoute> = async (c) => {
  const impersonation = c.get('impersonation')
  if (!impersonation) {
    forbid()
  }

  const admin = await loadActiveAdmin(impersonation.adminId)
  if (!admin || admin.role !== 'admin' || admin.isActive !== true) {
    forbid()
  }

  const token = await createAccessToken({
    id: admin.id,
    email: admin.email,
    role: admin.role
  })

  return c.json({
    token: token.token,
    expiresIn: token.expiresIn
  }, HttpStatusCodes.OK)
}
