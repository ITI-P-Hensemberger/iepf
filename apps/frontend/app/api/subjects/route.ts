import { forwardToBackend } from '@/lib/backend-proxy'

export async function GET() {

  return forwardToBackend(`/subjects`)
}

export async function POST(request: Request) {

  const bodyText = await request.text()

  return forwardToBackend(`/subjects`, { method: 'POST', body: bodyText })
}
