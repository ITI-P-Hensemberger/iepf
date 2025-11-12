import { createRouter } from '@/lib/create-app'
import { authenticate } from '@/middlewares/auth'

import * as handlers from './users.handlers'
import * as routes from './users.routes'

const router = createRouter()

router.use('/users', authenticate())
router.use('/users/*', authenticate())

router.openapi(routes.list, handlers.list)
router.openapi(routes.create, handlers.create)
router.openapi(routes.getOne, handlers.getOne)
router.openapi(routes.patch, handlers.patch)
router.openapi(routes.remove, handlers.remove)

export default router
