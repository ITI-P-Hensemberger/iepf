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

export function createErrorSchema(schema: z.ZodTypeAny) {
  const invalidSample = schema instanceof z.ZodArray ? [{}] : {}
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
        name: exampleError.name,
        issues: exampleError.issues.map(issue => ({
          code: issue.code,
          path: issue.path,
          message: issue.message
        }))
      }
    : {
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
      issues: z.array(
        z.object({
          code: z.string(),
          path: z.array(z.union([z.string(), z.number()])),
          message: z.string().optional()
        })
      ),
      name: z.string()
    }).openapi({
      example
    })
  })
}
