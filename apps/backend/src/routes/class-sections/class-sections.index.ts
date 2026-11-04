// Purpose: Class sections route wiring.
import { createRouter } from '@/lib/create-app'
import { authenticate } from '@/middlewares/auth'

import * as handlers from './class-sections.handlers'
import * as routes from './class-sections.routes'

const router = createRouter()

router.use('*', (c, next) => {
  if (!c.req.path.startsWith('/class-sections')) {
    return next()
  }
  if (c.req.method === 'GET' && c.req.path === '/class-sections') {
    return next()
  }
  return authenticate()(c, next)
})

router.openapi(routes.list, handlers.list)
router.openapi(routes.create, handlers.create)
router.openapi(routes.getOne, handlers.getOne)
router.openapi(routes.patch, handlers.patch)
router.openapi(routes.remove, handlers.remove)

export default router
