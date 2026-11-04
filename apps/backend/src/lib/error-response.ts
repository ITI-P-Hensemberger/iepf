// Purpose: Standard API error response helpers.

export interface ErrorIssue {
  code: string
  path: Array<string | number>
  message?: string
  params?: Record<string, unknown>
}

export interface ApiErrorResponse {
  success: false
  error: {
    message: string
    name: string
    issues: ErrorIssue[]
  }
}

export function buildErrorResponse(
  message: string,
  options?: {
    name?: string
    issues?: ErrorIssue[]
  }
): ApiErrorResponse {
  return {
    success: false,
    error: {
      message,
      name: options?.name ?? 'Error',
      issues: options?.issues ?? []
    }
  }
}
