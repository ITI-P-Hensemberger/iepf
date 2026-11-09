import { defineConfig, devices } from '@playwright/test'

// The backend reads its database, secrets and SMTP from the environment (make e2e or CI):
// these tests expect a fresh database, which global-setup fills with the lesson scenarios.
const backendPort = process.env.BACKEND_PORT ?? '9999'
const frontendPort = process.env.FRONTEND_PORT ?? '3000'
const siteUrl = `http://localhost:${frontendPort}`

// Booking rules depend on the weekday and the 20:00 cutoff: server, seed and browser all live on
// next week's Wednesday at 10:00, with Monday's lessons past, one under way and Thursday and Friday
// bookable. Ahead of the real clock, so tokens still look valid to the Next server.
process.env.TZ = 'Europe/Rome'
if (!process.env.FAKE_NOW) {
  const wednesday = new Date()
  wednesday.setDate(wednesday.getDate() + ((8 - wednesday.getDay()) % 7 || 7) + 2)
  wednesday.setHours(10, 0, 0, 0)
  process.env.FAKE_NOW = wednesday.toISOString()
}

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  // The tests share one seeded database and change it: one at a time, in file order.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: siteUrl,
    locale: 'it-IT',
    timezoneId: 'Europe/Rome',
    trace: 'retain-on-failure'
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'] }
  ],
  webServer: [
    {
      // Local binaries only: no global pnpm needed.
      command: 'npx tsx src/index.ts',
      cwd: '../backend',
      url: `http://127.0.0.1:${backendPort}/health`,
      // FAKE_NOW works only in development mode.
      env: { NODE_ENV: 'development', PORT: backendPort },
      // A server already on the port would run against another database: fail instead.
      reuseExistingServer: false,
      timeout: 60_000
    },
    {
      // The production build: the same pages, headers and CSP that users get.
      command: 'npx next build && npx next start',
      url: siteUrl,
      env: {
        NODE_ENV: 'production',
        PORT: frontendPort,
        API_BASE_URL: `http://127.0.0.1:${backendPort}`,
        NEXT_PUBLIC_SITE_URL: siteUrl,
        NEXT_PUBLIC_TIMEZONE: 'Europe/Rome'
      },
      reuseExistingServer: false,
      timeout: 300_000
    }
  ]
})
