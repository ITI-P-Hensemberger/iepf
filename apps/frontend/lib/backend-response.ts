type NormalizedError = {
  success?: boolean
  error?: {
    message?: string
    issues?: unknown
    name?: string
  }
  message?: string
}

type NormalizedSuccess = {
  success?: boolean
  data?: unknown
  message?: string
}

export function parseBackendPayload(payloadText: string) {
  if (!payloadText) {
    return { data: undefined }
  }

  try {
    const parsed = JSON.parse(payloadText) as NormalizedError & NormalizedSuccess
    if (typeof parsed === 'object' && parsed && 'success' in parsed) {
      if (parsed.success === true) {
        return { data: 'data' in parsed ? parsed.data : parsed }
      }
      if (parsed.success === false) {
        const error = parsed.error ?? parsed
        const message = parsed.error?.message ?? parsed.message
        return { errorMessage: message, errorPayload: error }
      }
    }
    return { data: parsed }
  } catch {
    return { data: payloadText }
  }
}

export function unwrapBackendData<T>(payload: unknown): T {
  if (!payload || typeof payload !== 'object' || !('success' in payload)) {
    return payload as T
  }
  const normalized = payload as NormalizedError & NormalizedSuccess
  if (normalized.success === true) {
    return ('data' in normalized ? normalized.data : normalized) as T
  }
  if (normalized.success === false) {
    const message = normalized.error?.message ?? normalized.message ?? 'Request failed.'
    throw new Error(message)
  }
  return payload as T
}

export function extractPayloadArray<T>(payload: unknown): T[] {
  if (!payload) {
    return []
  }
  if (Array.isArray(payload)) {
    return payload as T[]
  }
  if (typeof payload === 'object' && payload !== null) {
    const candidate = payload as Record<string, unknown>
    if (Array.isArray(candidate.data)) {
      return candidate.data as T[]
    }
    if (Array.isArray(candidate.items)) {
      return candidate.items as T[]
    }
    if (Array.isArray(candidate.results)) {
      return candidate.results as T[]
    }
  }
  return []
}
