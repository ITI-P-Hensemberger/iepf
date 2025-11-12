import type { Hook } from '@hono/zod-openapi'

import type { AppBindings } from '@/lib/types'

import { UNPROCESSABLE_ENTITY } from '@/lib/http-status-codes'

type DefaultHookResult = Hook<any, AppBindings, string, Response | void>

export const defaultHook: DefaultHookResult = (result, c) => {
  if (!result.success) {
    return c.json(
      {
        success: result.success,
        error: {
          name: result.error.name,
          issues: result.error.issues
        }
      },
      UNPROCESSABLE_ENTITY
    )
  }
}

export default defaultHook
