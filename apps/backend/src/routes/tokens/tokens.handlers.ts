// Purpose: Token adjustment handlers for admins.
import type { Context } from 'hono'

import { HTTPException } from 'hono/http-exception'

import type { AppBindings, AppRouteHandler } from '@/lib/types'

import db from '@/db'
import { tokenLedger } from '@/db/schemas/token-ledger.schema'
import { buildErrorResponse } from '@/lib/error-response'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { getStudentTokenBalance, lockUsers } from '@/lib/lesson-tokens'

import type { AdjustTokensRoute } from './tokens.routes'

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
  ensureAdmin(c)

  const student = await db.query.users.findFirst({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.id, studentId),
        operators.eq(fields.role, 'student')
      )
    },
    columns: { id: true }
  })

  if (!student) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  const nextTokens = await db.transaction(async (tx) => {
    await lockUsers(tx, [studentId])
    const currentTokens = await getStudentTokenBalance(studentId, tx)
    const balance = Math.max(currentTokens + payload.delta, 0)
    const appliedDelta = balance - currentTokens

    if (appliedDelta !== 0) {
      await tx.insert(tokenLedger).values({
        studentId,
        delta: appliedDelta,
        reason: payload.reason
      })
    }

    return balance
  })

  return c.json({ studentId, lessonTokens: nextTokens }, HttpStatusCodes.OK)
}
