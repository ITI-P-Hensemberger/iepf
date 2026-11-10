import { forwardToBackend } from '@/lib/backend-proxy'

export async function GET() {
  return forwardToBackend('/links')
}

export async function POST(request: Request) {
  return forwardToBackend('/links', { method: 'POST', body: await request.text() })
}
