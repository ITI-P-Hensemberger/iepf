// Purpose: Popup router wiring.
import { createRouter } from '@/lib/create-app'
import { authenticate } from '@/middlewares/auth'

import * as handlers from './announcements.handlers'
import * as routes from './announcements.routes'

const router = createRouter()

router.use('/announcements/*', authenticate())
router.use('/admin/announcements', authenticate())
router.use('/admin/announcements/*', authenticate())

router.openapi(routes.listActive, handlers.listActive)
router.openapi(routes.dismiss, handlers.dismiss)
router.openapi(routes.adminList, handlers.adminList)
router.openapi(routes.adminCreate, handlers.adminCreate)
router.openapi(routes.adminUpdate, handlers.adminUpdate)
router.openapi(routes.adminDelete, handlers.adminDelete)

export default router
