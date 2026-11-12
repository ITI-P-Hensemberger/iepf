// Purpose: Subject request router wiring.
import { createRouter } from '@/lib/create-app'
import { authenticate } from '@/middlewares/auth'

import * as handlers from './subject-requests.handlers'
import * as routes from './subject-requests.routes'

const router = createRouter()

router.use('/subject-requests', authenticate())
router.use('/subject-requests/*', authenticate())

router.openapi(routes.week, handlers.week)
router.openapi(routes.list, handlers.list)
router.openapi(routes.create, handlers.create)

export default router
