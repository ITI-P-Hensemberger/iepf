import { forwardToBackend } from '@/lib/backend-proxy'

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params

  const url = new URL(request.url)
  const search = url.search ? url.search : ''
  const targetPath = path.join('/')

  return forwardToBackend(`/admin/stats/${targetPath}${search}`)
}
