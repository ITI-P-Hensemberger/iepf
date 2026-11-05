// Purpose: Server entrypoint that starts the Hono app.
import { serve } from '@hono/node-server'

import app from './app'
import { closeDb } from './db'
import env from './env'
import { createShutdown } from './lib/graceful-shutdown'
import { closeMailer, waitForPendingMail } from './lib/mailer'

const port = env.PORT
// eslint-disable-next-line no-console
console.log(`Server is running at http://localhost:${port}`)

const server = serve({
  fetch: app.fetch,
  port
})

// Must stay below stop_grace_period in infra/deploy/compose.yaml.
const SHUTDOWN_TIMEOUT_MS = 10_000

const shutdown = createShutdown({
  timeoutMs: SHUTDOWN_TIMEOUT_MS,

  exit: code => process.exit(code),
  steps: [
    () => new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve())
    }),
    waitForPendingMail,
    closeMailer,
    closeDb
  ]
})

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
