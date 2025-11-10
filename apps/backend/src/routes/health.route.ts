import { createRoute } from '@hono/zod-openapi'
import * as HttpStatusCodes from 'stoker/http-status-codes'
import { jsonContent } from 'stoker/openapi/helpers'
import { createMessageObjectSchema } from 'stoker/openapi/schemas'

import { createRouter } from '@/lib/create-app'

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
