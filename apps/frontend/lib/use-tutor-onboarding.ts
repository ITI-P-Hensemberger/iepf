'use client'

import { useQuery } from '@tanstack/react-query'

import { extractPayloadArray } from '@/lib/backend-response'

// The onboarding saves under this key's prefix: invalidating it lets the guard see the subjects.
export const tutorSubjectsKey = (tutorId: string) => ['tutor-subjects', tutorId] as const

// A tutor without subjects has not finished the onboarding. If the check fails, the tutor goes
// through the onboarding again rather than reach pages that need subjects.
export function useTutorOnboarding(tutorId: string | undefined) {
  const query = useQuery({
    queryKey: tutorSubjectsKey(tutorId ?? ''),
    queryFn: async () => {
      const response = await fetch(`/api/tutors/${tutorId}/subjects`, { cache: 'no-store' })
      if (!response.ok) {
        throw new Error('Impossibile verificare le materie del tutor.')
      }
      return extractPayloadArray<{ id: string }>(await response.json()).length
    },
    enabled: Boolean(tutorId)
  })
  return {
    isFirstTime: Boolean(tutorId) && !query.isPending && (query.isError || query.data === 0),
    isLoading: Boolean(tutorId) && query.isPending
  }
}
