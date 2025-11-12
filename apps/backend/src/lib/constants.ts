import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { createMessageObjectSchema } from '@/lib/openapi/schemas'

export const ZOD_ERROR_MESSAGES = {
  REQUIRED: 'Required',
  EXPECTED_NUMBER: 'Invalid input: expected number, received NaN',
  NO_UPDATES: 'No updates provided',
  EXPECTED_STRING: 'Invalid input: expected string, received undefined',
  EMAIL_ALREADY_EXISTS: 'A user with this email already exists'
}

export const ZOD_ERROR_CODES = {
  INVALID_UPDATES: 'invalid_updates',
  DUPLICATE_KEY: 'duplicate_key'
}

export const notFoundSchema = createMessageObjectSchema(HttpStatusPhrases.NOT_FOUND)
