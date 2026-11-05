import { forwardToBackend } from '@/lib/backend-proxy'

export async function POST(request: Request) {
  return forwardToBackend('/notifications/push/subscriptions', { method: 'POST', body: await request.text() })
}

export async function DELETE(request: Request) {
  return forwardToBackend('/notifications/push/subscriptions', { method: 'DELETE', body: await request.text() })
}
