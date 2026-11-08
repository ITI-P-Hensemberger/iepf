import { forwardToBackend } from '@/lib/backend-proxy'
import { NextResponse } from 'next/server'

type CountsBody = {
  countsForTutor: boolean
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ lessonId: string }> }
) {
  const { lessonId } = await context.params

  let body: Partial<CountsBody> | null = null

  try {
    body = (await request.json()) as Partial<CountsBody>
  } catch {
    return NextResponse.json({ message: 'Corpo richiesta non valido.' }, { status: 400 })
  }

  if (typeof body.countsForTutor !== 'boolean') {
    return NextResponse.json(
      { message: 'Valore non valido.' },
      { status: 400 }
    )
  }

  const requestBody = { countsForTutor: body.countsForTutor }
  return forwardToBackend(`/lessons/${lessonId}/counts`, { method: 'PATCH', body: JSON.stringify(requestBody) })
}
