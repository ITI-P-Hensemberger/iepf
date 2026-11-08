import { forwardToBackend } from '@/lib/backend-proxy'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {

  return forwardToBackend(`/auth/admin-invite${new URL(request.url).search}`)
}
