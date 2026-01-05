// Purpose: Shared constants and Zod error metadata.
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { createMessageObjectSchema } from '@/lib/openapi/schemas'

export const ZOD_ERROR_MESSAGES = {
  REQUIRED: 'Required',
  EXPECTED_NUMBER: 'Invalid input: expected number, received NaN',
  NO_UPDATES: 'No updates provided',
  EXPECTED_STRING: 'Invalid input: expected string, received undefined',
  EMAIL_ALREADY_EXISTS: 'A user with this email already exists',
  CANONICAL_NAME_EXISTS: 'A subject with this canonical name already exists',
  TUTOR_SUBJECT_EXISTS: 'Tutor already assigned to this subject'
}

export const ZOD_ERROR_CODES = {
  INVALID_UPDATES: 'invalid_updates',
  DUPLICATE_KEY: 'duplicate_key'
}

export const DEFAULT_TUTOR_SETTINGS = {
  defaultStartTime: '15:00',
  defaultDurationMinutes: 60,
  defaultSeats: 2
}

export const notFoundSchema = createMessageObjectSchema(HttpStatusPhrases.NOT_FOUND)
