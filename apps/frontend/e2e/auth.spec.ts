import { expect, test } from '@playwright/test'

import { linkSentTo } from './mail'
import { signIn } from './sign-in'

test('a signed-out visit to a private page goes to the login', async ({ page }) => {
  await page.goto('/student/lessons')
  await expect(page).toHaveURL(/\?next=%2Fstudent%2Flessons/)
})

test('a user resets the password from the emailed link', async ({ page }) => {
  // Its own account: no other test signs in as this student.
  const email = 'scenario.student-elena@example.test'
  const since = Date.now()
  await page.goto('/auth/login')
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Hai dimenticato la password?' }).click()
  await expect(page.getByText('Se l’account esiste, abbiamo inviato un link per il reset.')).toBeVisible()

  await page.goto(await linkSentTo(email, '/auth/reset-password', since))
  await page.getByLabel('Nuova password').fill('NuovaPassword123!')
  await page.getByLabel('Conferma password').fill('NuovaPassword123!')
  await page.getByRole('button', { name: 'Aggiorna password' }).click()
  await expect(page.getByText('Password aggiornata', { exact: true })).toBeVisible()

  await signIn(page, email, '/student', 'NuovaPassword123!')
})

