'use client'

import { STICKY_CARD_FOOTER } from '@/components/sticky-footer'
import { cn } from '@/lib/utils'
import * as React from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm, useWatch } from 'react-hook-form'
import * as z from 'zod'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { SubjectSelector } from '@/components/subject-selector'
import { extractPayloadArray } from '@/lib/backend-response'
import { useSession } from '@/lib/use-session'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, jsonBody } from '@/lib/api-fetch'
import { tutorSubjectsKey } from '@/lib/use-tutor-onboarding'

const subjectsSchema = z.object({
  subjectIds: z.array(z.string()).min(1, 'Seleziona almeno una materia')
})

type SubjectsFormValues = z.infer<typeof subjectsSchema>

type TutorSubject = {
  id: string
  name: string
}

const noSubjectIds: string[] = []

export function TutorSubjectsSettings() {
  const { profile } = useSession()
  const tutorId = profile?.id

  const queryClient = useQueryClient()
  const subjectsResult = useQuery({
    queryKey: ['users', tutorId, 'subjects'],
    queryFn: async () => extractPayloadArray<TutorSubject>(await apiFetch(`/api/tutors/${tutorId}/subjects`, 'Impossibile caricare le materie.'))
      .map((subject) => subject.id),
    enabled: Boolean(tutorId)
  })
  const originalSubjects = subjectsResult.data ?? noSubjectIds
  const isLoading = subjectsResult.isPending

  // Follows the saved subjects; what the tutor is ticking stays when they reload.
  const form = useForm<SubjectsFormValues>({
    resolver: zodResolver(subjectsSchema),
    defaultValues: { subjectIds: [] },
    values: subjectsResult.data ? { subjectIds: subjectsResult.data } : undefined,
    resetOptions: { keepDirtyValues: true },
    mode: 'onBlur'
  })

  // Custom isDirty logic - compare current vs original sets
  const currentSubjectIds = useWatch({ control: form.control, name: 'subjectIds' })
  const isDirty = React.useMemo(() => {
    const current = new Set(currentSubjectIds)
    const original = new Set(originalSubjects)
    if (current.size !== original.size) return true
    return [...current].some((id) => !original.has(id))
  }, [currentSubjectIds, originalSubjects])

  // Each subject added or removed on its own: the ones that fail are listed, the others stay.
  const save = useMutation({
    mutationFn: async (values: SubjectsFormValues) => {
      const toAdd = values.subjectIds.filter((id) => !originalSubjects.includes(id))
      const toRemove = originalSubjects.filter((id) => !values.subjectIds.includes(id))
      const results = await Promise.allSettled([
        ...toRemove.map((id) => apiFetch(`/api/tutors/${tutorId}/subjects/${id}`, 'Impossibile rimuovere una materia', jsonBody('DELETE'))),
        ...toAdd.map((id) => apiFetch(`/api/tutors/${tutorId}/subjects`, 'Impossibile aggiungere una materia', jsonBody('POST', { subjectId: id })))
      ])
      return results.flatMap((result) => (result.status === 'rejected' ? [(result.reason as Error).message] : []))
    },
    onSuccess: async (errors, values) => {
      form.reset(values)
      // The list here and the onboarding check read the subjects again.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['users', tutorId, 'subjects'] }),
        queryClient.invalidateQueries({ queryKey: tutorSubjectsKey(tutorId ?? '') })
      ])
      if (errors.length > 0) {
        toast.error(`Alcune operazioni non sono riuscite:\n${errors.join('\n')}`)
      } else {
        toast.success('Materie aggiornate.')
      }
    }
  })
  const isSubmitting = save.isPending
  function onSubmit(values: SubjectsFormValues) {
    if (tutorId) save.mutate(values)
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
