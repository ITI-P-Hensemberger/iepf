'use client'

import * as React from 'react'

import { extractPayloadArray } from '@/lib/backend-response'

type UseTutorOnboardingResult = {
  isFirstTime: boolean
  isLoading: boolean
  subjectsCount: number
  error: string | null
}

export function useTutorOnboarding(
  tutorId: string | undefined
): UseTutorOnboardingResult {
  const [state, setState] = React.useState<{
    subjectsCount: number | null
    isLoading: boolean
    fetchedForId: string | undefined
    error: string | null
  }>({
    subjectsCount: null,
    isLoading: true,
    fetchedForId: undefined,
    error: null
  })

  React.useEffect(() => {
    if (!tutorId) {
      setState({
        subjectsCount: null,
        isLoading: false,
        fetchedForId: undefined,
        error: null
      })
      return
    }

    let isMounted = true

    // Reset state when tutorId changes
    setState({
      subjectsCount: null,
      isLoading: true,
      fetchedForId: undefined,
      error: null
    })

    async function fetchTutorSubjects() {

      try {
        const response = await fetch(`/api/tutors/${tutorId}/subjects`, {
          cache: 'no-store'
        })

        if (!response.ok) {
          throw new Error('Impossibile verificare le materie del tutor.')
        }

        const payload = await response.json()
        const subjects = extractPayloadArray<{ id: string }>(payload)

        if (isMounted) {
          setState({
            subjectsCount: subjects.length,
            isLoading: false,
            fetchedForId: tutorId,
            error: null
          })
        }
      } catch (err) {
        if (isMounted) {
          setState({
            subjectsCount: 0,
            isLoading: false,
            fetchedForId: tutorId,
            error:
              err instanceof Error
                ? err.message
                : 'Impossibile verificare le materie del tutor.'
          })
        }
      }
    }

    void fetchTutorSubjects()

    return () => {
      isMounted = false
    }
  }, [tutorId])

  // Only consider data valid if we fetched for the current tutorId
  const hasFetchedForCurrentId = state.fetchedForId === tutorId

  return {
    isFirstTime: hasFetchedForCurrentId ? state.subjectsCount === 0 : false,
    isLoading: !hasFetchedForCurrentId,
    subjectsCount: state.subjectsCount ?? 0,
    error: state.error
  }
}
