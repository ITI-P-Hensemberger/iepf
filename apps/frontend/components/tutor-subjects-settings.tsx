'use client'

import { STICKY_CARD_FOOTER } from '@/components/sticky-footer'
import { cn } from '@/lib/utils'
import * as React from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import * as z from 'zod'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { SubjectSelector } from '@/components/subject-selector'
import { extractPayloadArray } from '@/lib/backend-response'
import { useSession } from '@/lib/use-session'

const subjectsSchema = z.object({
  subjectIds: z.array(z.string()).min(1, 'Seleziona almeno una materia')
})

type SubjectsFormValues = z.infer<typeof subjectsSchema>

type TutorSubject = {
  id: string
  name: string
}

export function TutorSubjectsSettings() {
  const { profile } = useSession()
  const tutorId = profile?.id

  const [originalSubjects, setOriginalSubjects] = React.useState<string[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const form = useForm<SubjectsFormValues>({
    resolver: zodResolver(subjectsSchema),
    defaultValues: { subjectIds: [] },
    mode: 'onBlur'
  })

  // Custom isDirty logic - compare current vs original sets
  const currentSubjectIds = form.watch('subjectIds')
  const isDirty = React.useMemo(() => {
    const current = new Set(currentSubjectIds)
    const original = new Set(originalSubjects)
    if (current.size !== original.size) return true
    return [...current].some((id) => !original.has(id))
  }, [currentSubjectIds, originalSubjects])

  // Fetch current subjects on mount
  React.useEffect(() => {
    if (!tutorId) return

    let isMounted = true

    async function fetchSubjects() {
      setIsLoading(true)
      try {
        const response = await fetch(`/api/tutors/${tutorId}/subjects`)
        if (!response.ok) {
          throw new Error('Impossibile caricare le materie.')
        }
        const payload = await response.json()
        const subjects = extractPayloadArray<TutorSubject>(payload)
        const subjectIds = subjects.map((s) => s.id)

        if (isMounted) {
          setOriginalSubjects(subjectIds)
          form.reset({ subjectIds })
        }
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : 'Impossibile caricare le materie.'
        )
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void fetchSubjects()

    return () => {
      isMounted = false
    }
  }, [tutorId, form])

  async function onSubmit(values: SubjectsFormValues) {
    if (!tutorId) return

    setIsSubmitting(true)

    const toAdd = values.subjectIds.filter(
      (id) => !originalSubjects.includes(id)
    )
    const toRemove = originalSubjects.filter(
      (id) => !values.subjectIds.includes(id)
    )
    const errors: string[] = []

    // Parallel deletions
    if (toRemove.length > 0) {
      const deleteResults = await Promise.allSettled(
        toRemove.map((id) =>
          fetch(`/api/tutors/${tutorId}/subjects/${id}`, {
            method: 'DELETE'
          })
        )
      )
      deleteResults.forEach((result) => {
        if (result.status === 'rejected' || !result.value.ok) {
          errors.push('Impossibile rimuovere una materia')
        }
      })
    }

    // Parallel additions
    if (toAdd.length > 0) {
      const addResults = await Promise.allSettled(
        toAdd.map((id) =>
          fetch(`/api/tutors/${tutorId}/subjects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subjectId: id })
          })
        )
      )
      addResults.forEach((result) => {
        if (result.status === 'rejected' || !result.value.ok) {
          errors.push('Impossibile aggiungere una materia')
        }
      })
    }

    // Refetch server state to get the truth
    try {
      const response = await fetch(`/api/tutors/${tutorId}/subjects`)
      const payload = await response.json()
      const subjects = extractPayloadArray<TutorSubject>(payload)
      const subjectIds = subjects.map((s) => s.id)

      setOriginalSubjects(subjectIds)
      form.reset({ subjectIds })

      if (errors.length > 0) {
        toast.error(
          `Alcune operazioni non sono riuscite:\n${errors.join('\n')}`
        )
      } else {
        toast.success('Materie aggiornate.')
      }
    } catch {
      toast.error('Impossibile aggiornare le materie. Riprova.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!tutorId) {
    return null
  }

  return (
          <Card>
            <CardContent>
              <form id='subjects-form' onSubmit={form.handleSubmit(onSubmit)}>
                <Controller
                  name='subjectIds'
                  control={form.control}
                  render={({ field }) => (
                    <SubjectSelector
                      value={field.value}
                      onChange={field.onChange}
                      saved={(form.formState.defaultValues?.subjectIds ?? []).filter((id): id is string => Boolean(id))}
                      disabled={isLoading || isSubmitting}
                    />
                  )}
                />

                {form.formState.errors.subjectIds && (
                  <p className='mt-2 text-sm text-destructive'>
                    {form.formState.errors.subjectIds.message}
                  </p>
                )}
              </form>
            </CardContent>
            <CardFooter className={cn('flex justify-end', STICKY_CARD_FOOTER)}>
              <Button
                type='submit'
                form='subjects-form'
                className='w-full sm:w-auto'
                disabled={!isDirty || isSubmitting}
              >
                {isSubmitting ? 'Salvataggio...' : 'Salva modifiche'}
              </Button>
            </CardFooter>
          </Card>
  )
}
