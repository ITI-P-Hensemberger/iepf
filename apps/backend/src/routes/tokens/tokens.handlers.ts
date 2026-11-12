// Purpose: Token adjustment handlers for admins.
import type { Context } from 'hono'

import { and, desc, eq, notInArray } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'

import type { AppBindings, AppRouteHandler } from '@/lib/types'

import db from '@/db'
import { tokenLedger } from '@/db/schemas/token-ledger.schema'
import { users } from '@/db/schemas/users.schema'
import { buildLessonHoursChangedMessage } from '@/lib/email-templates'
import { buildErrorResponse } from '@/lib/error-response'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { AUTOMATIC_TOKEN_REASONS, getStudentTokenBalance, lockUsers } from '@/lib/lesson-tokens'
import { sendMail } from '@/lib/mailer'
import { notifyUsers } from '@/lib/push'
import { lessonHoursChangedPush } from '@/lib/push-messages'

import type { AdjustTokensRoute, TokenHistoryRoute } from './tokens.routes'

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

export const adjustTokens: AppRouteHandler<AdjustTokensRoute> = async (c) => {
  const { studentId } = c.req.valid('param')
  const payload = c.req.valid('json')
  const admin = ensureAdmin(c)

  const student = await db.query.users.findFirst({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.id, studentId),
        operators.eq(fields.role, 'student')
      )
    },
    columns: { id: true, email: true }
  })

  if (!student) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  const { balance: nextTokens, appliedDelta } = await db.transaction(async (tx) => {
    await lockUsers(tx, [studentId])
    const currentTokens = await getStudentTokenBalance(studentId, tx)
    const balance = Math.max(currentTokens + payload.delta, 0)
    const appliedDelta = balance - currentTokens

    if (appliedDelta !== 0) {
      await tx.insert(tokenLedger).values({
        studentId,
        delta: appliedDelta,
        reason: payload.reason,
        createdById: admin.id
      })
    }

    return { balance, appliedDelta }
  })

  if (appliedDelta !== 0) {
    const change = { delta: appliedDelta, balance: nextTokens }
    sendMail({
      to: student.email,
      ...buildLessonHoursChangedMessage(change)
    })
      .catch(error => console.error('Failed to send lesson hours email:', error))
    notifyUsers([studentId], 'account', lessonHoursChangedPush(change))
  }

  return c.json({ studentId, lessonTokens: nextTokens }, HttpStatusCodes.OK)
}

// The hours an admin added or removed by hand, newest first, with who did it and why.
export const tokenHistory: AppRouteHandler<TokenHistoryRoute> = async (c) => {
  const { studentId } = c.req.valid('param')
  ensureAdmin(c)

  const rows = await db
    .select({
      id: tokenLedger.id,
      delta: tokenLedger.delta,
      reason: tokenLedger.reason,
      createdAt: tokenLedger.createdAt,
      adminFirstName: users.firstName,
      adminLastName: users.lastName
    })
    .from(tokenLedger)
    .leftJoin(users, eq(tokenLedger.createdById, users.id))
    .where(and(
      eq(tokenLedger.studentId, studentId),
      notInArray(tokenLedger.reason, [...AUTOMATIC_TOKEN_REASONS])
    ))
    .orderBy(desc(tokenLedger.createdAt))
    .limit(200)

  return c.json({
    studentId,
    lessonTokens: await getStudentTokenBalance(studentId),
    items: rows.map(row => ({
      id: row.id,
      delta: row.delta,
      reason: row.reason,
      createdAt: row.createdAt.toISOString(),
      adminName: row.adminFirstName
        ? `${row.adminFirstName} ${row.adminLastName ?? ''}`.trim()
        : null
    }))
  }, HttpStatusCodes.OK)
}
