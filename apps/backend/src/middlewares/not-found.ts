import type { Context } from 'hono'

import { NOT_FOUND } from '@/lib/http-status-codes'
import { NOT_FOUND as NOT_FOUND_MESSAGE } from '@/lib/http-status-phrases'

export function notFound(c: Context) {
  return c.json(
    {
      message: `${NOT_FOUND_MESSAGE} - ${c.req.path}`
    },
    NOT_FOUND
  )
}

export default notFound
