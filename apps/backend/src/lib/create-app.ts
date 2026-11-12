// Purpose: App factory and core middleware wiring.
import type { Schema } from 'hono'

import { OpenAPIHono } from '@hono/zod-openapi'
import { cors } from 'hono/cors'
import { requestId } from 'hono/request-id'

import env from '@/env'
import { defaultHook } from '@/lib/openapi/default-hook'
import { auditLogger } from '@/middlewares/audit-logger'
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
  const corsOrigin = env.NODE_ENV === 'production'
    ? env.SITE_URL!
    : '*'
  app.use(requestId())
    .use(serveEmojiFavicon('📝'))
    // CORS policy is environment-specific to keep production locked down.
    .use(cors({ origin: corsOrigin }))
    .use(pinoLogger())
    .use(auditLogger())

  app.notFound(notFound)
  app.onError(onError)
  return app
}

export function createTestApp<S extends Schema>(router: AppOpenAPI<S>) {
  return createApp().route('/', router)
}
