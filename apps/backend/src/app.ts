import configureOpenAPI from '@/lib/configure-open-api'
import createApp from '@/lib/create-app'
import health from '@/routes/health.route'
import users from '@/routes/users/users.index'

const app = createApp()

configureOpenAPI(app)

const routes = [
  health,
  users
] as const

routes.forEach((route) => {
  app.route('/', route)
})

export type AppType = typeof routes[number]

export default app
