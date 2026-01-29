// Purpose: Admin impersonation router wiring.
import { createRouter } from '@/lib/create-app'
import { authenticate } from '@/middlewares/auth'

import * as handlers from './admin-impersonation.handlers'
import * as routes from './admin-impersonation.routes'

const router = createRouter()

router.use('/admin/impersonate', authenticate())
router.use('/admin/impersonate/*', authenticate())

router.openapi(routes.impersonate, handlers.impersonate)
router.openapi(routes.endImpersonation, handlers.endImpersonation)

export default router
