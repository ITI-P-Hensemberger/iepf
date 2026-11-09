import { expect, test } from '@playwright/test'

import { as } from './sign-in'

test('admin adds an hour to a student', async ({ page }) => {
  await as(page, 'admin')
  await page.goto('/admin/students')
  await page.getByRole('row').filter({ has: page.getByRole('cell', { name: 'Villa', exact: true }) }).click()
  await expect(page.getByRole('heading', { name: 'Anna Villa' })).toBeVisible()
  await page.getByRole('navigation', { name: 'Sezioni' }).getByRole('button', { name: 'Ore di lezione' }).click()
  await page.getByLabel('Motivazione').fill('Recupero lezione')
  await page.getByRole('button', { name: 'Aggiungi 1 ora' }).click()
  await expect(page.getByText('1 ora aggiunte.')).toBeVisible()
})

