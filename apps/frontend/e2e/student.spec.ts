import { expect, test } from '@playwright/test'

import { as } from './sign-in'

// Lesson scenarios on a Wednesday: the demo tutor's Friday 15:00 is the only open "Matematica demo"
// slot this week, and the demo student has nothing booked before next week.
test.describe.serial('student', () => {
  test('books an open lesson', async ({ page }) => {
    await as(page, 'student')
    await page.goto('/student/book')
    await page.getByRole('button', { name: /Matematica demo/ }).click()
    await expect(page).toHaveURL(/day=/)
    await page.getByRole('button', { name: 'Prenota', exact: true }).first().click()

    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toContainText('Conferma la prenotazione')
    await dialog.getByLabel('Di cosa hai bisogno?').fill('Disequazioni')
    await dialog.getByRole('button', { name: 'Prenota', exact: true }).click()

    await expect(page.getByRole('heading', { name: 'Prenotata' })).toBeVisible()
  })

  test('cancels the booking', async ({ page }) => {
    await as(page, 'student')
    await page.goto('/student/lessons')
    const card = page.locator('div').filter({ hasText: /Matematica demo/ }).filter({ has: page.getByRole('button', { name: 'Annulla', exact: true }) }).last()
    await card.getByRole('button', { name: 'Annulla', exact: true }).click()

    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toContainText('Annullare la prenotazione?')
    await dialog.getByRole('button', { name: 'Annulla prenotazione' }).click()
    await expect(page.getByText('Prenotazione annullata.')).toBeVisible()
  })
})

