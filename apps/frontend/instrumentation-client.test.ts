import { expect, it } from 'vitest'
import * as z from 'zod'

import './instrumentation-client'

it('stops zod from probing for eval, which the CSP forbids', () => {
  expect(z.config().jitless).toBe(true)
  expect(z.object({ email: z.email() }).safeParse({ email: 'a@example.test' }).success).toBe(true)
})
