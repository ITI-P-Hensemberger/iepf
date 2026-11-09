'use client'

import { STICKY_CARD_FOOTER } from '@/components/sticky-footer'
import { cn } from '@/lib/utils'
import * as React from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import * as z from 'zod'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  normalizeWeekdays,
  WeekdayAvailability,
  WeekdayAvailabilitySelector
} from '@/components/weekday-availability-selector'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, jsonBody } from '@/lib/api-fetch'
import { useSession } from '@/lib/use-session'
import { PushInviteCard } from '@/components/push-prompt'

const availabilityItemSchema = z
  .object({
    weekday: z.number().min(1).max(5),
    isAvailable: z.boolean(),
    startTime: z.enum(['14:00', '15:00', '14:00-16:00']).nullable()
  })
  .superRefine((value, ctx) => {
    if (value.isAvailable && !value.startTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Se selezionato, scegli l'orario di inizio."
      })
    }
    if (!value.isAvailable && value.startTime !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Rimuovi orario quando non disponibile.'
      })
    }
  })

const availabilitySchema = z.object({
  weekdays: z.array(availabilityItemSchema)
})

type AvailabilityFormValues = z.infer<typeof availabilitySchema>

export function TutorAvailabilitySettings() {
  const { profile } = useSession()
  const tutorId = profile?.id

  // Shares its key with the admin's tutor page, so a change there shows here too.
  const availability = useQuery({
    queryKey: ['users', tutorId, 'availability'],
    queryFn: async () => normalizeWeekdays(await apiFetch<{ weekdays?: WeekdayAvailability[] }>(
      `/api/tutors/${tutorId}/weekday-availability`,
      'Impossibile caricare la disponibilità.'
    )),
    enabled: Boolean(tutorId)
  })
  // If it does not load, the form starts from every day off.
  const initialWeekdays = availability.data ?? (availability.isError ? normalizeWeekdays({}) : null)

  // Only render form after we have initial data
  if (!tutorId || initialWeekdays === null) {
    return (
      <div className='container max-w-4xl mx-auto px-4 py-8'>
        <div className='mb-6'>
          <Skeleton className='h-9 w-36' />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className='h-7 w-48' />
            <Skeleton className='h-5 w-full max-w-md mt-2' />
          </CardHeader>
          <CardContent>
            <div className='space-y-4'>
              <Skeleton className='h-6 w-32' />
              <Skeleton className='h-5 w-64' />
              <div className='space-y-2'>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className='h-14 w-full' />
                ))}
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Skeleton className='h-10 w-32' />
          </CardFooter>
        </Card>
      </div>
    )
  }

  return <AvailabilityForm tutorId={tutorId} initialWeekdays={initialWeekdays} />
}

type AvailabilityFormProps = {
  tutorId: string
  initialWeekdays: WeekdayAvailability[]
}

function AvailabilityForm({ tutorId, initialWeekdays }: AvailabilityFormProps) {
  const queryClient = useQueryClient()
  const form = useForm<AvailabilityFormValues>({
    resolver: zodResolver(availabilitySchema),
    defaultValues: { weekdays: initialWeekdays },
    values: { weekdays: initialWeekdays },
    resetOptions: { keepDirtyValues: true },
    mode: 'onBlur'
  })

  const save = useMutation({
    mutationFn: (values: AvailabilityFormValues) => apiFetch(
      `/api/tutors/${tutorId}/weekday-availability`,
      'Impossibile aggiornare la disponibilità.',
      jsonBody('PUT', {
        weekdays: values.weekdays.map((day) => ({
          weekday: day.weekday,
          isAvailable: day.isAvailable,
          startTime: day.isAvailable ? day.startTime : null
        }))
      })
    ),
    onSuccess: async (_, values) => {
      form.reset(values)
      toast.success('Disponibilità aggiornata.')
      // The server's version replaces what was sent.
      await queryClient.invalidateQueries({ queryKey: ['users', tutorId, 'availability'] })
    }
  })
  const isSubmitting = save.isPending
  const justSaved = save.isSuccess

  function onSubmit(values: AvailabilityFormValues) {
    save.mutate(values)
  }

  return (
    <div>
          {justSaved && (
            <div className='mb-6'>
              <PushInviteCard
                userId={tutorId}
                role='tutor'
                title='Vuoi sapere subito se qualcuno prenota?'
                description='Ti avvisiamo appena uno studente prenota negli orari che hai appena scelto.'
              />
            </div>
          )}
          <Card>
            <CardContent>
              <form
                id='availability-form'
                onSubmit={form.handleSubmit(onSubmit)}
              >
                <Controller
                  name='weekdays'
                  control={form.control}
                  render={({ field }) => (
                    <WeekdayAvailabilitySelector
                      value={field.value}
                      onChange={field.onChange}
                      disabled={isSubmitting}
                    />
                  )}
                />

                {form.formState.errors.weekdays && (
                  <p className='mt-2 text-sm text-destructive'>
                    {form.formState.errors.weekdays.message}
                  </p>
                )}
              </form>
            </CardContent>
            <CardFooter className={cn('flex justify-end', STICKY_CARD_FOOTER)}>
              <Button
                type='submit'
                form='availability-form'
                className='w-full sm:w-auto'
                disabled={isSubmitting || !form.formState.isDirty}
              >
                {isSubmitting ? 'Salvataggio...' : 'Salva modifiche'}
              </Button>
            </CardFooter>
          </Card>
    </div>
  )
}
