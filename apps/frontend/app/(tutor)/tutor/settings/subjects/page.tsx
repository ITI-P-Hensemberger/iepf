'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import * as z from 'zod'
import { ChevronLeft } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
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

export default function TutorSubjectsSettingsPage() {
  const router = useRouter()
  const { profile } = useSession()
  const tutorId = profile?.id

  const [originalSubjects, setOriginalSubjects] = React.useState<string[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [submitErrors, setSubmitErrors] = React.useState<string[]>([])
  const [isSuccess, setIsSuccess] = React.useState(false)

  const form = useForm<SubjectsFormValues>({
    resolver: zodResolver(subjectsSchema),
    defaultValues: { subjectIds: [] },
    mode: 'onBlur'
  })

  // Custom isDirty logic - compare current vs original sets
  const isDirty = React.useMemo(() => {
    const current = new Set(form.watch('subjectIds'))
    const original = new Set(originalSubjects)
    if (current.size !== original.size) return true
    return [...current].some((id) => !original.has(id))
  }, [form.watch('subjectIds'), originalSubjects])

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
        console.error('Error fetching subjects:', err)
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
    setSubmitErrors([])
    setIsSuccess(false)

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
      deleteResults.forEach((result, i) => {
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
      addResults.forEach((result, i) => {
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
        setSubmitErrors(errors)
      } else {
        setIsSuccess(true)
      }
    } catch (err) {
      setSubmitErrors(['Impossibile aggiornare le materie. Riprova.'])
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!tutorId) {
    return null
  }

  return (
    <div className='container max-w-4xl mx-auto px-4 py-8'>
      <div className='mb-6'>
        <Button
          variant='ghost'
          size='sm'
          onClick={() => router.push('/tutor')}
          className='gap-2'
        >
          <ChevronLeft className='h-4 w-4' />
          Torna alla home
        </Button>
      </div>

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
                  disabled={isLoading || isSubmitting}
                />
              )}
            />

            {form.formState.errors.subjectIds && (
              <p className='mt-2 text-sm text-destructive'>
                {form.formState.errors.subjectIds.message}
              </p>
            )}

            {submitErrors.length > 0 && (
              <div className='mt-4 rounded-md border border-destructive/50 bg-destructive/10 p-3'>
                <p className='text-sm font-medium text-destructive'>
                  Alcune operazioni non sono riuscite:
                </p>
                <ul className='mt-2 list-disc list-inside space-y-1'>
                  {submitErrors.map((error, i) => (
                    <li key={i} className='text-sm text-destructive'>
                      {error}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {isSuccess && (
              <div className='mt-4 rounded-md border border-emerald-500/50 bg-emerald-50 dark:bg-emerald-950 p-3'>
                <p className='text-sm text-emerald-600 dark:text-emerald-400'>
                  Materie aggiornate con successo.
                </p>
              </div>
            )}
          </form>
        </CardContent>
        <CardFooter className='flex flex-col gap-3 items-end sm:flex-row sm:items-center sm:justify-between'>
          <Button
            type='submit'
            form='subjects-form'
            disabled={!isDirty || isSubmitting}
          >
            {isSubmitting ? 'Salvataggio...' : 'Salva modifiche'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
