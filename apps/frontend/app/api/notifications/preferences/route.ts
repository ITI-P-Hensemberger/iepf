import { forwardToBackend } from '@/lib/backend-proxy'

export async function GET() {
  return forwardToBackend('/notifications/preferences')
}

export async function PUT(request: Request) {
  return forwardToBackend('/notifications/preferences', { method: 'PUT', body: await request.text() })
}
