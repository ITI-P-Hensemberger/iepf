// Purpose: Shared guard for routes only an active admin may call.
import type { Context } from 'hono'

import { HTTPException } from 'hono/http-exception'

import type { AppBindings } from '@/lib/types'

import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'

export function forbid(): never {
  throw new HTTPException(HttpStatusCodes.FORBIDDEN, {
    message: HttpStatusPhrases.FORBIDDEN
  })
}

export function ensureAdmin(c: Context<AppBindings>) {
  const currentUser = c.get('currentUser')
  if (!currentUser || currentUser.role !== 'admin' || currentUser.isActive !== true) {
    forbid()
  }
  return currentUser
}
