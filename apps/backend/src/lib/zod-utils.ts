import type { z as z4 } from 'zod/v4'

// Purpose: Zod helper utilities.
import { z } from '@hono/zod-openapi'

export function toZodV4SchemaTyped<T extends z4.ZodType>(
  schema: T
) {
  return schema as unknown as z.ZodType<z4.infer<T>>
}

const truthyValues = new Set(['true', '1', 'yes', 'on'])
const falsyValues = new Set(['false', '0', 'no', 'off'])

export function queryBoolean() {
  return z.preprocess((value) => {
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase()
      if (truthyValues.has(normalized)) {
        return true
      }
      if (falsyValues.has(normalized)) {
        return false
      }
    }
    if (typeof value === 'number') {
      return value !== 0
    }
    if (typeof value === 'boolean') {
      return value
    }
    return value
  }, z.boolean())
}
