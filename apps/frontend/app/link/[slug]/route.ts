import { NextResponse } from 'next/server'

import { backendFetch } from '@/lib/backend-fetch'
import { parseBackendPayload } from '@/lib/backend-response'

type Context = { params: Promise<{ slug: string }> }

// A short link set by the admins, public. 307, not 301: browsers keep a 301 for good, so a
// changed or disabled link would not take effect for whoever opened it before.
export async function GET(request: Request, context: Context) {
  const { slug } = await context.params
  const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:9999'
  const response = await backendFetch(`${apiBaseUrl}/links/open/${encodeURIComponent(slug)}`, { method: 'POST', cache: 'no-store' })
  const url = response.ok ? (parseBackendPayload(await response.text()).data as { url?: string } | null)?.url : null
  // The backend accepts only https; checked again so nothing else is ever sent on.
  if (!url?.startsWith('https://')) {
    return NextResponse.redirect(new URL('/link', request.url), { status: 307, headers: { 'Cache-Control': 'no-store' } })
  }
  return NextResponse.redirect(url, { status: 307, headers: { 'Cache-Control': 'no-store' } })
}
