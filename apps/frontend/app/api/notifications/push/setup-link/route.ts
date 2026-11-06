import { forwardToBackend } from '@/lib/backend-proxy'

export async function POST() {
  return forwardToBackend('/notifications/push/setup-link', { method: 'POST' })
}
