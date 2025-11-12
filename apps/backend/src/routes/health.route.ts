import { createRoute } from '@hono/zod-openapi'

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
        )
      }
    }),
    (c) => {
      return c.json({
        message: 'ok'
      }, HttpStatusCodes.OK)
    }
  )

export default router
