import { forwardToBackend } from '@/lib/backend-proxy'

export async function PUT(request: Request) {
  return forwardToBackend('/faqs/order', { method: 'PUT', body: await request.text() })
}
