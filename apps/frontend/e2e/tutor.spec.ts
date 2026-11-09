import { expect, test } from '@playwright/test'

import { as } from './sign-in'

// Lesson scenarios on a Wednesday at 10:00: the demo tutor has a lesson under way since 09:30,
// with Paolo and Irene booked.
test('tutor marks presence in the lesson under way, from the home', async ({ page }) => {
  await as(page, 'tutor')
  await expect(page.getByRole('heading', { name: /^Oggi/ })).toBeVisible()
  // The student's own list item, inside the lesson's.
  const row = (name: string) => page.getByRole('listitem').filter({ hasText: name }).filter({ has: page.getByRole('group', { name: 'Presenza' }) }).last()
  await row('Paolo Conti').getByRole('button', { name: 'Presente' }).click()
  await page.getByRole('alertdialog', { name: 'Segnare Paolo Conti presente?' }).getByRole('button', { name: 'Conferma' }).click()
  await expect(row('Paolo Conti').getByRole('button', { name: 'Presente' })).toHaveAttribute('aria-pressed', 'true')
  await row('Irene Sala').getByRole('button', { name: 'Assente' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Conferma' }).click()
  await expect(row('Irene Sala').getByRole('button', { name: 'Assente' })).toHaveAttribute('aria-pressed', 'true')
})

