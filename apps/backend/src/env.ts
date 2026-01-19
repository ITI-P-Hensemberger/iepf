// Purpose: Environment loading and validation.
/* eslint-disable node/no-process-env */
import { config } from 'dotenv'
import { expand } from 'dotenv-expand'
import path from 'node:path'
import { z } from 'zod'

expand(config({
  path: path.resolve(
    process.cwd(),
    process.env.NODE_ENV === 'test' ? '.env.test' : '.env'
  ),
  override: true
}))

const EnvSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(9999),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']),
  DATABASE_URL: z.url(),
  PASSWORD_SALT: z.string(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL: z.coerce.number().int().positive().default(3600),
  REFRESH_TOKEN_TTL: z.coerce.number().int().positive().default(60 * 60 * 24 * 7),
  EMAIL_VERIFICATION_TTL: z.coerce.number().int().positive().default(60 * 60 * 24),
  PASSWORD_RESET_TTL: z.coerce.number().int().positive().default(60 * 15),
  TUTOR_INVITE_TTL: z.coerce.number().int().positive().default(60 * 60 * 24 * 7),
  ADMIN_INVITE_TTL: z.coerce.number().int().positive().default(60 * 60 * 24 * 7),
  // Auto-stall lessons if confirmations are missing after this window (minutes).
  LESSON_CONFIRMATION_STALL_MINUTES: z.coerce.number().int().positive().default(60 * 24),
  SITE_URL: z.url().optional(),
  SMTP_HOST: z.preprocess(
    value => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().min(1).optional()
  ),
  SMTP_PORT: z.preprocess(
    value => (value === '' ? undefined : value),
    z.coerce.number().int().positive().optional()
  ),
  SMTP_USER: z.preprocess(
    value => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().min(1).optional()
  ),
  SMTP_PASS: z.preprocess(
    value => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().min(1).optional()
  ),
  SMTP_FROM: z.preprocess(
    value => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().min(1).optional()
  ),
  SMTP_DEBUG: z.preprocess((value) => {
    if (value === '' || value === undefined) {
      return undefined
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase()
      if (['true', '1', 'yes', 'y'].includes(normalized)) {
        return true
      }
      if (['false', '0', 'no', 'n'].includes(normalized)) {
        return false
      }
    }
    return value
  }, z.boolean().optional()),
  ADMIN_EMAIL: z.email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
  ADMIN_FIRST_NAME: z.string().min(1).default('Admin'),
  ADMIN_LAST_NAME: z.string().min(1).default('User')
}).superRefine((input, ctx) => {
  if (input.NODE_ENV === 'production' && !input.SITE_URL) {
    ctx.addIssue({
      code: 'invalid_type',
      expected: 'string',
      received: 'undefined',
      path: ['SITE_URL'],
      message: 'Must be set when NODE_ENV is \'production\''
    })
  }
  if (input.NODE_ENV === 'production') {
    const required = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'] as const
    for (const key of required) {
      if (!input[key]) {
        ctx.addIssue({
          code: 'invalid_type',
          expected: 'string',
          received: 'undefined',
          path: [key],
          message: `Must be set when NODE_ENV is 'production'`
        })
      }
    }
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
