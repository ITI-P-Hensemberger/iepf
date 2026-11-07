// Purpose: FAQ router wiring: reading is public, changes need an admin.
import { createRouter } from '@/lib/create-app'
import { authenticate } from '@/middlewares/auth'

import * as handlers from './faqs.handlers'
import * as routes from './faqs.routes'

const router = createRouter()

router.on(['POST', 'PUT', 'DELETE'], ['/faqs', '/faqs/*'], authenticate())

router.openapi(routes.list, handlers.list)
router.openapi(routes.create, handlers.create)
// Before /faqs/{id}, so "order" is not read as an id.
router.openapi(routes.reorder, handlers.reorder)
router.openapi(routes.update, handlers.update)
router.openapi(routes.remove, handlers.remove)

export default router
