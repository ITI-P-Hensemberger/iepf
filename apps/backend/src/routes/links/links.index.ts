// Purpose: Short link router wiring: opening a link is public, everything else needs an admin.
import { createRouter } from '@/lib/create-app'
import { authenticate } from '@/middlewares/auth'

import * as handlers from './links.handlers'
import * as routes from './links.routes'

const router = createRouter()

router.on('GET', '/links', authenticate())
router.on(['POST', 'PUT', 'DELETE'], '/links', authenticate())
router.on(['PUT', 'DELETE'], '/links/*', authenticate())

router.openapi(routes.list, handlers.list)
router.openapi(routes.create, handlers.create)
router.openapi(routes.update, handlers.update)
router.openapi(routes.remove, handlers.remove)
router.openapi(routes.open, handlers.open)

export default router
