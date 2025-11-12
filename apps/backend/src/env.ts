/* eslint-disable node/no-process-env */
import { config } from 'dotenv'
import { expand } from 'dotenv-expand'
import path from 'node:path'
import { z } from 'zod'

expand(config({
  path: path.resolve(
    process.cwd(),
    process.env.NODE_ENV === 'test' ? '.env.test' : '.env'
  )
}))

const EnvSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(9999),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']),
  DATABASE_URL: z.url(),
  DATABASE_AUTH_TOKEN: z.string().optional(),
  PASSWORD_SALT: z.string(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL: z.coerce.number().int().positive().default(3600),
  REFRESH_TOKEN_TTL: z.coerce.number().int().positive().default(60 * 60 * 24 * 7),
  ADMIN_EMAIL: z.email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
  ADMIN_FIRST_NAME: z.string().min(1).default('Admin'),
  ADMIN_LAST_NAME: z.string().min(1).default('User')
}).superRefine((input, ctx) => {
  if (input.NODE_ENV === 'production' && !input.DATABASE_AUTH_TOKEN) {
    ctx.addIssue({
      code: 'invalid_type',
      expected: 'string',
      received: 'undefined',
      path: ['DATABASE_AUTH_TOKEN'],
      message: 'Must be set when NODE_ENV is \'production\''
    })
  }
})

export type env = z.infer<typeof EnvSchema>

// eslint-disable-next-line ts/no-redeclare
const { data: env, error } = EnvSchema.safeParse(process.env)

if (error) {
  console.error('❌ Invalid env:')
  console.error(JSON.stringify(z.treeifyError(error), null, 2))
  process.exit(1)
}

export default env!
