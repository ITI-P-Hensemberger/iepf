import { Scalar } from '@scalar/hono-api-reference'

import type { AppOpenAPI } from './types'

import packageJSON from '../../package.json' with { type: 'json' }

export default function configureOpenAPI(app: AppOpenAPI) {
  app.doc('/doc', {
    openapi: '3.0.0',
    info: {
      version: packageJSON.version,
      title: 'Tasks API'
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    }
  } as any)

  app.get(
    '/reference',
    Scalar({
      url: '/doc',
      theme: 'alternate',
      layout: 'classic'
    })
  )
}
