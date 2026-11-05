const PLACEHOLDER_ORIGIN = 'https://internal.invalid'

// Browsers treat "//host" and "/\host" as another site, and drop tabs and newlines before
// deciding, so the value is resolved the way a browser would instead of checking its prefix.
export function safeInternalPath(value: string | null | undefined) {
  if (!value || !value.startsWith('/') || value.includes('\\')) {
    return null
  }

  let url: URL
  try {
    url = new URL(value, PLACEHOLDER_ORIGIN)
  } catch {
    return null
  }

  if (url.origin !== PLACEHOLDER_ORIGIN || url.pathname.startsWith('//')) {
    return null
  }

  return `${url.pathname}${url.search}${url.hash}`
}
