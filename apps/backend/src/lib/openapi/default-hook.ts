// Purpose: Default OpenAPI error hook.
import type { Hook } from '@hono/zod-openapi'

import type { AppBindings } from '@/lib/types'

import { buildErrorResponse } from '@/lib/error-response'
import { UNPROCESSABLE_ENTITY } from '@/lib/http-status-codes'
import { UNPROCESSABLE_ENTITY as UNPROCESSABLE_MESSAGE } from '@/lib/http-status-phrases'

type DefaultHookResult = Hook<any, AppBindings, string, Response | void>

function normalizeIssuePath(path: readonly (string | number | symbol)[]) {
  return path.filter((key): key is string | number => typeof key === 'string' || typeof key === 'number')
}

interface ZodIssueWithParams {
  code: string
  path: readonly (string | number | symbol)[]
  message?: string
  params?: Record<string, unknown>
}

type ZodIssueLike = ZodIssueWithParams & {
  params?: Record<string, unknown>
}

function convertIssues(issues: readonly ZodIssueLike[]) {
  return issues.map((issue) => {
    const issueWithParams = issue as ZodIssueWithParams
    return {
      code: issue.code,
      path: normalizeIssuePath(issue.path),
      message: issue.message,
      ...(issueWithParams.params
        ? { params: issueWithParams.params }
        : {})
    }
  })
}

export const defaultHook: DefaultHookResult = (result, c) => {
  if (!result.success) {
    return c.json(
      buildErrorResponse(UNPROCESSABLE_MESSAGE, {
        name: result.error.name,
        issues: convertIssues(result.error.issues)
      }),
      UNPROCESSABLE_ENTITY
    )
  }
}

export default defaultHook
