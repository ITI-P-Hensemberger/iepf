// Purpose: Reusable OpenAPI schemas.
import { z } from '@hono/zod-openapi'

export const IdUUIDParamsSchema = z.object({
  id: z.uuid().openapi({
    param: {
      name: 'id',
      in: 'path',
      required: true
    },
    required: ['id'],
    example: '4651e634-a530-4484-9b09-9616a28f35e3'
  })
})

export function createMessageObjectSchema(exampleMessage = 'Hello World') {
  return z.object({
    message: z.string()
  }).openapi({
    example: {
      message: exampleMessage
    }
  })
}

export function createErrorMessageSchema(exampleMessage = 'Errore') {
  return z.object({
    success: z.boolean().openapi({
      example: false
    }),
    error: z.object({
      message: z.string(),
      name: z.string().optional()
    }).openapi({
      example: {
        message: exampleMessage
      }
    })
  })
}

export function createPagedListSchema(itemSchema: z.ZodType) {
  return z.object({
    data: z.array(itemSchema),
    total: z.number().int(),
    limit: z.number().int(),
    offset: z.number().int()
  })
}

export function createErrorSchema(schema: z.ZodType) {
  const invalidSample = schema instanceof z.ZodArray
    ? [{}]
    : {}
  let exampleError: z.ZodError | undefined

  try {
    schema.parse(invalidSample)
  }
  catch (err) {
    if (err instanceof z.ZodError) {
      exampleError = err
    }
  }

  const example = exampleError
    ? {
        message: 'Dati non validi',
        name: exampleError.name,
        issues: exampleError.issues.map(issue => ({
          code: issue.code,
          path: issue.path,
          message: issue.message
        }))
      }
    : {
        message: 'Dati non validi',
        name: 'ZodError',
        issues: [
          {
            code: 'invalid_type',
            path: ['fieldName'],
            message: 'Expected string, received undefined'
          }
        ]
      }

  return z.object({
    success: z.boolean().openapi({
      example: false
    }),
    error: z.object({
      message: z.string(),
      issues: z.array(
        z.object({
          code: z.string(),
          path: z.array(z.union([
            z.string(),
            z.number()
          ])),
          message: z.string().optional()
        })
      ),
      name: z.string()
    }).openapi({
      example
    })
  })
}
