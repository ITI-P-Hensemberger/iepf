// Purpose: Health check route.
import { createRoute } from '@hono/zod-openapi'
import { sql } from 'drizzle-orm'

import db from '@/db'
import { createRouter } from '@/lib/create-app'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import { jsonContent } from '@/lib/openapi/helpers'
import { createMessageObjectSchema } from '@/lib/openapi/schemas'

const router = createRouter()
  .openapi(
    createRoute({
      tags: ['Health'],
      method: 'get',
      path: '/health',
      responses: {
        [HttpStatusCodes.OK]: jsonContent(
          createMessageObjectSchema('ok'),
          'ok'
        ),
        [HttpStatusCodes.SERVICE_UNAVAILABLE]: jsonContent(
          createMessageObjectSchema('database unavailable'),
          'Database unavailable'
        )
      }
    }),
    async (c) => {
      try {
        await db.execute(sql`select 1`)
      }
      catch {
        return c.json({ message: 'database unavailable' }, HttpStatusCodes.SERVICE_UNAVAILABLE)
      }

      return c.json({
        message: 'ok'
      }, HttpStatusCodes.OK)
    }
  )

export default router
