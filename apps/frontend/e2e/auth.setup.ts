import { test as setup } from '@playwright/test'

import { ACCOUNTS, signIn, stateFile } from './sign-in'

for (const [role, { email, home }] of Object.entries(ACCOUNTS)) {
  setup(`sign in as ${role}`, async ({ page }) => {
    await signIn(page, email, home)
    await page.context().storageState({ path: stateFile(role as keyof typeof ACCOUNTS) })
  })
}
