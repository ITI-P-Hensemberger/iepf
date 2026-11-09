import { expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

export const PASSWORD = 'LocalDemo123!'

// The seeded accounts the tests reuse. The backend allows 5 logins a minute per account, so
// auth.setup.ts signs each one in once and the tests start from its saved cookies.
export const ACCOUNTS = {
  student: { email: 'student@example.test', home: '/student' },
  tutor: { email: 'tutor@example.test', home: '/tutor' },
  admin: { email: 'admin@example.test', home: '/admin' },
  activator: { email: 'activator@example.test', home: '/activator' }
} as const
type Role = keyof typeof ACCOUNTS

export const stateFile = (role: Role) => path.join(__dirname, '.auth', `${role}.json`)

const now = () => new Date(process.env.FAKE_NOW!)

// A real login through the form, for the setup and for accounts made during a test.
export async function signIn(page: Page, email: string, home: string, password = PASSWORD) {
  await page.clock.install({ time: now() })
  await page.goto('/auth/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Accedi' }).click()
  await expect(page).toHaveURL(new RegExp(`${home}$`))
}

// Opens the role's home with the session auth.setup.ts saved.
export async function as(page: Page, role: Role) {
  await page.context().addCookies(JSON.parse(readFileSync(stateFile(role), 'utf8')).cookies)
  await page.clock.install({ time: now() })
  await page.goto(ACCOUNTS[role].home)
  await expect(page).toHaveURL(new RegExp(`${ACCOUNTS[role].home}$`))
}
