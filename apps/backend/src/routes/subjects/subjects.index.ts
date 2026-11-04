// Purpose: Subjects router wiring.
import { createRouter } from '@/lib/create-app'
import { authenticate } from '@/middlewares/auth'

import * as handlers from './subjects.handlers'
import * as routes from './subjects.routes'

const router = createRouter()

// Require authentication for all subject routes.
router.use('/subjects', authenticate())
router.use('/subjects/*', authenticate())

router.openapi(routes.list, handlers.list)
router.openapi(routes.create, handlers.create)
router.openapi(routes.getOne, handlers.getOne)
router.openapi(routes.patch, handlers.patch)
router.openapi(routes.remove, handlers.remove)

export default router
