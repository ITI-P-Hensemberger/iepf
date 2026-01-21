// Purpose: Shared constants and Zod error metadata.
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { createErrorMessageSchema } from '@/lib/openapi/schemas'

export const ZOD_ERROR_MESSAGES = {
  REQUIRED: 'Obbligatorio',
  EXPECTED_NUMBER: 'Input non valido: numero atteso, ricevuto NaN',
  NO_UPDATES: 'Nessun aggiornamento fornito',
  EXPECTED_STRING: 'Input non valido: stringa attesa, ricevuto undefined',
  EMAIL_ALREADY_EXISTS: 'Impossibile registrarsi con questa email',
  CANONICAL_NAME_EXISTS: 'Esiste già una materia con questo nome canonico',
  TUTOR_SUBJECT_EXISTS: 'Il tutor è già assegnato a questa materia',
  CLASS_SECTION_EXISTS: 'Esiste già una sezione con questo nome'
}

export const ZOD_ERROR_CODES = {
  INVALID_UPDATES: 'invalid_updates',
  DUPLICATE_KEY: 'duplicate_key'
}

export const DEFAULT_TUTOR_SETTINGS = {
  defaultStartTime: '15:00',
  defaultDurationMinutes: 60,
  dailyCapacity: 2
}

export const notFoundSchema = createErrorMessageSchema(HttpStatusPhrases.NOT_FOUND)
