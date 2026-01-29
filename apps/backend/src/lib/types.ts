// Purpose: Shared app types and bindings.
import type { OpenAPIHono, RouteConfig, RouteHandler } from '@hono/zod-openapi'
import type { Schema } from 'hono'
import type { PinoLogger } from 'hono-pino'

export interface AuthenticatedUser {
  id: string
  email: string
  role: string
  emailVerifiedAt?: Date | null
  isActive?: boolean | null
}

export interface AppBindings {
  Variables: {
    logger: PinoLogger
    currentUser?: AuthenticatedUser
    impersonation?: {
      adminId: string
      adminEmail: string
      adminRole: string
      userId: string
      userEmail: string
      userRole: string
    }
  }
};

// eslint-disable-next-line ts/no-empty-object-type
export type AppOpenAPI<S extends Schema = {}> = OpenAPIHono<AppBindings, S>

export type AppRouteHandler<R extends RouteConfig> = RouteHandler<R, AppBindings>
