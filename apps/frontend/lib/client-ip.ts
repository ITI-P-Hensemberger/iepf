// The backend is reachable only through this app, so it sees the app as the client
// unless the address set by the reverse proxy is passed on for per-client rate limits.
export function clientIpHeaders(requestHeaders: Headers): Record<string, string> {
  const ip =
    requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    requestHeaders.get('x-real-ip')?.trim()
  return ip ? { 'x-forwarded-for': ip } : {}
}
