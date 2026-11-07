// Purpose: Auth router wiring.
import { createRouter } from '@/lib/create-app'
import { authenticate } from '@/middlewares/auth'
import { loginEmailDiscriminator, rateLimit } from '@/middlewares/rate-limit'

import * as handlers from './auth.handlers'
import * as routes from './auth.routes'

const router = createRouter()

// A whole class can share one school IP: guess limits apply per account, with a wider IP ceiling.
router.use('/auth/login', rateLimit({
  windowMs: 60_000,
  max: 120,
  keyPrefix: 'auth:login-ip'
}))
router.use('/auth/login', rateLimit({
  windowMs: 60_000,
  max: 5,
  keyPrefix: 'auth:login',
  discriminator: loginEmailDiscriminator
}))
router.use('/auth/register', rateLimit({
  windowMs: 60_000,
  max: 30,
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
router.use('/auth/password/reset/check', rateLimit({
  windowMs: 60_000,
  max: 30,
  keyPrefix: 'auth:password-reset-check'
}))
router.use('/auth/verify-email/request', rateLimit({
  windowMs: 60_000,
  max: 3,
  keyPrefix: 'auth:verify-email-request'
}))
router.use('/auth/verify-email/confirm', rateLimit({
  windowMs: 60_000,
  max: 30,
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
router.use('/auth/tutor-invite', authenticate())
router.use('/auth/tutor-invite/*', async (c, next) => {
  if (c.req.path.endsWith('/confirm')) {
    return next()
  }
  return authenticate()(c, next)
})
router.use('/auth/tutor-invite', rateLimit({
  windowMs: 60_000,
  max: 5,
  keyPrefix: 'auth:tutor-invite'
}))
router.use('/auth/tutor-invite/*', rateLimit({
  windowMs: 60_000,
  max: 5,
  keyPrefix: 'auth:tutor-invite'
}))
router.use('/auth/tutor-invite/confirm', rateLimit({
  windowMs: 60_000,
  max: 5,
  keyPrefix: 'auth:tutor-invite-confirm'
}))

router.use('/auth/admin-invite', authenticate())
router.use('/auth/admin-invite/*', async (c, next) => {
  if (c.req.path.endsWith('/confirm')) {
    return next()
  }
  return authenticate()(c, next)
})
router.use('/auth/admin-invite', rateLimit({
  windowMs: 60_000,
  max: 5,
  keyPrefix: 'auth:admin-invite'
}))
router.use('/auth/admin-invite/*', rateLimit({
  windowMs: 60_000,
  max: 5,
  keyPrefix: 'auth:admin-invite'
}))
router.use('/auth/admin-invite/confirm', rateLimit({
  windowMs: 60_000,
  max: 5,
  keyPrefix: 'auth:admin-invite-confirm'
}))

router
  .openapi(routes.login, handlers.login)
  .openapi(routes.refresh, handlers.refreshTokensHandler)
  .openapi(routes.logout, handlers.logout)
  .openapi(routes.register, handlers.register)
  .openapi(routes.requestPasswordReset, handlers.requestPasswordReset)
  .openapi(routes.checkPasswordReset, handlers.checkPasswordReset)
  .openapi(routes.confirmPasswordReset, handlers.confirmPasswordReset)
  .openapi(routes.requestEmailVerification, handlers.requestEmailVerification)
  .openapi(routes.confirmEmailVerification, handlers.confirmEmailVerification)
  .openapi(routes.listTutorInvites, handlers.listTutorInvites)
  .openapi(routes.deleteTutorInvite, handlers.deleteTutorInvite)
  .openapi(routes.inviteTutor, handlers.inviteTutor)
  .openapi(routes.confirmTutorInvite, handlers.confirmTutorInvite)
  .openapi(routes.listAdminInvites, handlers.listAdminInvites)
  .openapi(routes.deleteAdminInvite, handlers.deleteAdminInvite)
  .openapi(routes.inviteAdmin, handlers.inviteAdmin)
  .openapi(routes.confirmAdminInvite, handlers.confirmAdminInvite)

export default router
