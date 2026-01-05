// Purpose: Audit log route wiring.
import { createRouter } from '@/lib/create-app'
import { authenticate } from '@/middlewares/auth'

import * as handlers from './audit.handlers'
import * as routes from './audit.routes'

const router = createRouter()

router.use('/audit', authenticate())
router.use('/audit/*', authenticate())

router.openapi(routes.listAuditLogs, handlers.listAuditLogs)
router.openapi(routes.getAuditLog, handlers.getAuditLog)

export default router
