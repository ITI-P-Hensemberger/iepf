import type { Schema } from 'hono'

import { OpenAPIHono } from '@hono/zod-openapi'
import { requestId } from 'hono/request-id'

import { defaultHook } from '@/lib/openapi/default-hook'
import notFound from '@/middlewares/not-found'
import onError from '@/middlewares/on-error'
import { pinoLogger } from '@/middlewares/pino-logger'
import { serveEmojiFavicon } from '@/middlewares/serve-emoji-favicon'

import type { AppBindings, AppOpenAPI } from './types'

export function createRouter() {
  return new OpenAPIHono<AppBindings>({
    strict: false,
    defaultHook
  })
}

export default function createApp() {
  const app = createRouter()
  app.use(requestId())
    .use(serveEmojiFavicon('📝'))
    .use(pinoLogger())

  app.notFound(notFound)
  app.onError(onError)
  return app
}

export function createTestApp<S extends Schema>(router: AppOpenAPI<S>) {
  return createApp().route('/', router)
}
