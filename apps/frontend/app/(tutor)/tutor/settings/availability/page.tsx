'use client'

import * as React from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import * as z from 'zod'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { BackButton } from '@/components/back-button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  WeekdayAvailability,
  WeekdayAvailabilitySelector
} from '@/components/weekday-availability-selector'
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

const WEEKDAYS = [
  { value: 1, label: 'Lunedì' },
  { value: 2, label: 'Martedì' },
  { value: 3, label: 'Mercoledì' },
  { value: 4, label: 'Giovedì' },
  { value: 5, label: 'Venerdì' }
] as const

export default function TutorAvailabilitySettingsPage() {
  const { profile } = useSession()
  const tutorId = profile?.id

  const [initialWeekdays, setInitialWeekdays] = React.useState<
    WeekdayAvailability[] | null
  >(null)
  const [, setIsLoading] = React.useState(true)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  // Fetch current availability on mount
  React.useEffect(() => {
    if (!tutorId) return

    let isMounted = true

    async function fetchAvailability() {
      setIsLoading(true)
      try {
        const response = await fetch(
          `/api/tutors/${tutorId}/weekday-availability`
        )
        if (!response.ok) {
          throw new Error('Impossibile caricare la disponibilità.')
        }
        const payload = (await response.json()) as {
          weekdays?: WeekdayAvailability[]
        }

        const normalizedWeekdays = WEEKDAYS.map((day) => {
          const match = payload.weekdays?.find(
            (item) => item.weekday === day.value
          )
          return {
            weekday: day.value,
            isAvailable: match?.isAvailable ?? false,
            startTime: match?.isAvailable ? match?.startTime ?? null : null
          }
        })

        if (isMounted) {
          setInitialWeekdays(normalizedWeekdays)
        }
      } catch (err) {
        if (isMounted) {
          setInitialWeekdays(
            WEEKDAYS.map((day) => ({
              weekday: day.value,
              isAvailable: false,
              startTime: null
            }))
          )
        }
        toast.error(
          err instanceof Error
            ? err.message
            : 'Impossibile caricare la disponibilità.'
        )
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void fetchAvailability()

    return () => {
      isMounted = false
    }
  }, [tutorId])

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

  return (
    <AvailabilityForm
      key={initialWeekdays.map((day) => day.weekday).join(',')}
      tutorId={tutorId}
      initialWeekdays={initialWeekdays}
      isSubmitting={isSubmitting}
      setIsSubmitting={setIsSubmitting}
      setInitialWeekdays={setInitialWeekdays}
    />
  )
}

type AvailabilityFormProps = {
  tutorId: string
  initialWeekdays: WeekdayAvailability[]
  isSubmitting: boolean
  setIsSubmitting: React.Dispatch<React.SetStateAction<boolean>>
  setInitialWeekdays: React.Dispatch<
    React.SetStateAction<WeekdayAvailability[] | null>
  >
}

function AvailabilityForm({
  tutorId,
  initialWeekdays,
  isSubmitting,
  setIsSubmitting,
  setInitialWeekdays
}: AvailabilityFormProps) {
  const [justSaved, setJustSaved] = React.useState(false)
  const form = useForm<AvailabilityFormValues>({
    resolver: zodResolver(availabilitySchema),
    defaultValues: { weekdays: initialWeekdays },
    mode: 'onBlur'
  })

  async function onSubmit(values: AvailabilityFormValues) {
    setIsSubmitting(true)

    try {
      // Transform to API format: all weekdays with isAvailable flag
      const weekdaysPayload = values.weekdays.map((day) => ({
        weekday: day.weekday,
        isAvailable: day.isAvailable,
        startTime: day.isAvailable ? day.startTime : null
      }))

      const response = await fetch(
        `/api/tutors/${tutorId}/weekday-availability`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ weekdays: weekdaysPayload })
        }
      )

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string }
        throw new Error(
          payload.message || 'Impossibile aggiornare la disponibilità.'
        )
      }

      // Refetch server state to get the truth
      const refetchResponse = await fetch(
        `/api/tutors/${tutorId}/weekday-availability`
      )
      const refetchPayload = (await refetchResponse.json()) as {
        weekdays?: WeekdayAvailability[]
      }

      const normalizedWeekdays = WEEKDAYS.map((day) => {
        const match = refetchPayload.weekdays?.find(
          (item) => item.weekday === day.value
        )
        return {
          weekday: day.value,
          isAvailable: match?.isAvailable ?? false,
          startTime: match?.isAvailable ? match?.startTime ?? null : null
        }
      })

      setInitialWeekdays(normalizedWeekdays)
      form.reset({ weekdays: normalizedWeekdays })
      toast.success('Disponibilità aggiornata con successo.')
      setJustSaved(true)
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Impossibile aggiornare la disponibilità. Riprova.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10'>
        <div className='max-w-6xl mx-auto'>
          {' '}
          <div className='mb-6'>
            <BackButton />
          </div>
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
            <CardFooter className='flex justify-end'>
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
      </div>
    </main>
  )
}
