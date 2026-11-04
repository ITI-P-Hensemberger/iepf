// Purpose: OpenAPI response helper builders.
import type { ZodType } from 'zod'

interface JsonMediaTypeObject<T extends ZodType> {
  schema: T
}

interface JsonContent<T extends ZodType> {
  content: {
    'application/json': JsonMediaTypeObject<T>
  }
}

type JsonResponse<T extends ZodType> = JsonContent<T> & {
  description: string
}

type JsonRequestBody<T extends ZodType> = JsonContent<T> & {
  description: string
  required: true
}

export function jsonContent<T extends ZodType>(schema: T, description: string): JsonResponse<T> {
  return {
    content: {
      'application/json': {
        schema
      }
    },
    description
  }
}

export function jsonContentRequired<T extends ZodType>(schema: T, description: string): JsonRequestBody<T> {
  return {
    description,
    required: true,
    content: {
      'application/json': {
        schema
      }
    }
  }
}
