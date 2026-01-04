// Purpose: App composition and route registration.
import configureOpenAPI from '@/lib/configure-open-api'
import createApp from '@/lib/create-app'
import auth from '@/routes/auth/auth.index'
import health from '@/routes/health.route'
import subjects from '@/routes/subjects/subjects.index'
import tutorSubjects from '@/routes/tutor-subjects/tutor-subjects.index'
import users from '@/routes/users/users.index'

const app = createApp()

configureOpenAPI(app)

// Route modules to register on the app.
const routes = [
  auth,
  health,
  subjects,
  tutorSubjects,
  users
] as const

routes.forEach((route) => {
  app.route('/', route)
})

export type AppType = typeof routes[number]

export default app
