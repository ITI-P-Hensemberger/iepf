import { forwardToBackend } from '@/lib/backend-proxy'

export async function POST() {
  return forwardToBackend('/notifications/inbox/read-all', { method: 'POST' })
}
