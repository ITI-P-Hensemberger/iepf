import { forwardToBackend } from '@/lib/backend-proxy'

export async function GET() {
  return forwardToBackend('/admin/announcements')
}

export async function POST(request: Request) {
  return forwardToBackend('/admin/announcements', { method: 'POST', body: await request.text() })
}
