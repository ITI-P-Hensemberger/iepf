// Purpose: Auth router wiring.
import { createRouter } from '@/lib/create-app'
import { rateLimit } from '@/middlewares/rate-limit'

import * as handlers from './auth.handlers'
import * as routes from './auth.routes'

const router = createRouter()

router.use('/auth/login', rateLimit({
  windowMs: 60_000,
  max: 5,
  keyPrefix: 'auth:login'
}))
router.use('/auth/register', rateLimit({
  windowMs: 60_000,
  max: 5,
  keyPrefix: 'auth:register'
}))
router.use('/auth/password/reset/request', rateLimit({
  windowMs: 60_000,
  max: 3,
  keyPrefix: 'auth:password-reset-request'
}))
router.use('/auth/password/reset/confirm', rateLimit({
  windowMs: 60_000,
  max: 5,
  keyPrefix: 'auth:password-reset-confirm'
}))
router.use('/auth/verify-email/request', rateLimit({
  windowMs: 60_000,
  max: 3,
  keyPrefix: 'auth:verify-email-request'
}))
router.use('/auth/verify-email/confirm', rateLimit({
  windowMs: 60_000,
  max: 5,
  keyPrefix: 'auth:verify-email-confirm'
}))
router.use('/auth/refresh', rateLimit({
  windowMs: 60_000,
  max: 30,
  keyPrefix: 'auth:refresh'
}))
router.use('/auth/logout', rateLimit({
  windowMs: 60_000,
  max: 30,
  keyPrefix: 'auth:logout'
}))

router
  .openapi(routes.login, handlers.login)
  .openapi(routes.refresh, handlers.refreshTokensHandler)
  .openapi(routes.logout, handlers.logout)
  .openapi(routes.register, handlers.register)
  .openapi(routes.requestPasswordReset, handlers.requestPasswordReset)
  .openapi(routes.confirmPasswordReset, handlers.confirmPasswordReset)
  .openapi(routes.requestEmailVerification, handlers.requestEmailVerification)
  .openapi(routes.confirmEmailVerification, handlers.confirmEmailVerification)

export default router
