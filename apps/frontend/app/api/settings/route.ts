import { forwardToBackend } from '@/lib/backend-proxy'

export async function GET() {

  return forwardToBackend(`/settings`)
}

export async function PATCH(request: Request) {

  const bodyText = await request.text()

  return forwardToBackend(`/settings`, { method: 'PATCH', body: bodyText })
}
