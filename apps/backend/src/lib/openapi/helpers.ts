import type { ZodTypeAny } from 'zod'

interface JsonMediaTypeObject<T extends ZodTypeAny> {
  schema: T
}

interface JsonContent<T extends ZodTypeAny> {
  content: {
    'application/json': JsonMediaTypeObject<T>
  }
}

type JsonResponse<T extends ZodTypeAny> = JsonContent<T> & {
  description: string
}

type JsonRequestBody<T extends ZodTypeAny> = JsonContent<T> & {
  description: string
  required: true
}

export function jsonContent<T extends ZodTypeAny>(schema: T, description: string): JsonResponse<T> {
  return {
    content: {
      'application/json': {
        schema
      }
    },
    description
  }
}

export function jsonContentRequired<T extends ZodTypeAny>(schema: T, description: string): JsonRequestBody<T> {
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
