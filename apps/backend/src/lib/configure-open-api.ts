// Purpose: OpenAPI docs and reference UI setup.
import { Scalar } from '@scalar/hono-api-reference'

import type { AppOpenAPI } from './types'

import packageJSON from '../../package.json' with { type: 'json' }

// Shared by /doc and by the script that generates the frontend types.
export const openApiConfig = {
  openapi: '3.0.0',
  info: {
    version: packageJSON.version,
    title: 'IEPF API'
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
} as any

export default function configureOpenAPI(app: AppOpenAPI) {
  app.doc('/doc', openApiConfig)

  app.get(
    '/reference',
    Scalar({
      url: '/doc',
      theme: 'alternate',
      layout: 'classic'
    })
  )
}
