import { expect, test } from '@playwright/test'

import { linkSentTo } from './mail'
import { as, PASSWORD, signIn } from './sign-in'

// A new student and a new tutor, from the sign-up to the first page they can use.
test.describe.serial('registration', () => {
  const student = 'e2e.nuovo@hensemberger.it'
  const tutor = 'e2e.tutor@hensemberger.it'

  test('a student signs up and verifies the email', async ({ page }) => {
    const since = Date.now()
    await page.goto('/auth/sign-up')
    await page.getByLabel('Nome', { exact: true }).fill('Nuovo')
    await page.getByLabel('Cognome', { exact: true }).fill('Studente')
    await page.getByRole('combobox', { name: 'Anno' }).click()
    await page.getByRole('option', { name: '1° anno' }).click()
    await page.getByRole('combobox', { name: /Sezione/ }).click()
    await page.getByRole('option').first().click()
    await page.getByLabel('Email @hensemberger.it').fill(student)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByLabel('Conferma Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Registrati' }).click()
    await expect(page.getByText('Controlla la tua email')).toBeVisible()

    await page.goto(await linkSentTo(student, '/auth/verify-email', since))
    await expect(page.getByText('Email verificata', { exact: true })).toBeVisible()

    await signIn(page, student, '/student/pending')
  })

  test('the activator activates the new student', async ({ page }) => {
    await as(page, 'activator')
    const row = page.getByRole('row').filter({ hasText: 'Studente' })
    await row.getByRole('button', { name: 'Attiva' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Attiva' }).click()
    await expect(page.getByText('Nessuno studente in attesa.')).toBeVisible()
  })

  test('the activated student reaches the student home', async ({ page }) => {
    await signIn(page, student, '/student')
  })

  test('an admin invites a tutor, who signs up and sets up subjects and availability', async ({ page, browser }) => {
    await as(page, 'admin')
    await page.goto('/admin/tutors')
    const since = Date.now()
    await page.getByRole('button', { name: 'Invita tutor' }).click()
    const dialog = page.getByRole('alertdialog')
    await dialog.getByRole('textbox').fill(tutor)
    await dialog.getByRole('button', { name: 'Invia inviti' }).click()

    const invite = await linkSentTo(tutor, '/auth/sign-up-tutor', since)
    const tutorPage = await (await browser.newContext({ locale: 'it-IT', timezoneId: 'Europe/Rome' })).newPage()
    await tutorPage.clock.install({ time: new Date(process.env.FAKE_NOW!) })
    await tutorPage.goto(invite)
    await tutorPage.getByLabel('Nome', { exact: true }).fill('Nuovo')
    await tutorPage.getByLabel('Cognome', { exact: true }).fill('Tutor')
    await tutorPage.getByRole('combobox', { name: 'Anno' }).click()
    await tutorPage.getByRole('option', { name: /5/ }).click()
    await tutorPage.getByRole('combobox', { name: /Sezione/ }).click()
    await tutorPage.getByRole('option').first().click()
    await tutorPage.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await tutorPage.getByLabel(/Conferma/).fill(PASSWORD)
    await tutorPage.getByRole('checkbox').check()
    await tutorPage.getByRole('button', { name: 'Completa registrazione' }).click()
    await expect(tutorPage.getByText('Registrazione completata')).toBeVisible()

    await signIn(tutorPage, tutor, '/tutor/onboarding')
    await tutorPage.getByRole('checkbox', { name: 'Fisica' }).check()
    await tutorPage.getByRole('button', { name: 'Avanti' }).click()
    // Step 2 must open on its own: the same click used to save the form and skip it.
    await expect(tutorPage.getByText('Passo 2 di 2')).toBeVisible()
    await tutorPage.getByRole('switch', { name: 'Lunedì: disponibile' }).click()
    await tutorPage.getByRole('button', { name: 'Salva e continua' }).click()
    // Invited tutors still wait for an admin to activate them.
    await expect(tutorPage).toHaveURL(/\/tutor(\/pending)?$/)
  })
})
