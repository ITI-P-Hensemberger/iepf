'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import * as z from 'zod'
import { ChevronLeft } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { WeekdayAvailabilitySelector } from '@/components/weekday-availability-selector'
import { useSession } from '@/lib/use-session'

const availabilitySchema = z.object({
  weekdays: z.array(z.number().min(1).max(5))
})

type AvailabilityFormValues = z.infer<typeof availabilitySchema>

type WeekdayAvailability = {
  weekday: number
  isAvailable: boolean
}

const WEEKDAYS = [
  { value: 1, label: 'Lunedì' },
  { value: 2, label: 'Martedì' },
  { value: 3, label: 'Mercoledì' },
  { value: 4, label: 'Giovedì' },
  { value: 5, label: 'Venerdì' }
] as const

export default function TutorAvailabilitySettingsPage() {
  const router = useRouter()
  const { profile } = useSession()
  const tutorId = profile?.id

  const [initialWeekdays, setInitialWeekdays] = React.useState<number[] | null>(
    null
  )
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

        // Extract only the weekday numbers where isAvailable is true
        const availableWeekdays = (payload.weekdays ?? [])
          .filter((item) => item.isAvailable)
          .map((item) => item.weekday)

        if (isMounted) {
          setInitialWeekdays(availableWeekdays)
        }
    } catch (err) {
      console.error('Error fetching availability:', err)
      if (isMounted) {
        setInitialWeekdays([])
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
      key={initialWeekdays.join(',')}
      tutorId={tutorId}
      initialWeekdays={initialWeekdays}
      isSubmitting={isSubmitting}
      setIsSubmitting={setIsSubmitting}
      setInitialWeekdays={setInitialWeekdays}
      router={router}
    />
  )
}

type AvailabilityFormProps = {
  tutorId: string
  initialWeekdays: number[]
  isSubmitting: boolean
  setIsSubmitting: React.Dispatch<React.SetStateAction<boolean>>
  setInitialWeekdays: React.Dispatch<React.SetStateAction<number[] | null>>
  router: ReturnType<typeof useRouter>
}

function AvailabilityForm({
  tutorId,
  initialWeekdays,
  isSubmitting,
  setIsSubmitting,
  setInitialWeekdays,
  router
}: AvailabilityFormProps) {
  const form = useForm<AvailabilityFormValues>({
    resolver: zodResolver(availabilitySchema),
    defaultValues: { weekdays: initialWeekdays },
    mode: 'onBlur'
  })

  async function onSubmit(values: AvailabilityFormValues) {
    setIsSubmitting(true)

    try {
      // Transform to API format: all weekdays with isAvailable flag
      const weekdaysPayload = WEEKDAYS.map((day) => ({
        weekday: day.value,
        isAvailable: values.weekdays.includes(day.value)
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

      const availableWeekdays = (refetchPayload.weekdays ?? [])
        .filter((item) => item.isAvailable)
        .map((item) => item.weekday)

      setInitialWeekdays(availableWeekdays)
      form.reset({ weekdays: availableWeekdays })
      toast.success('Disponibilità aggiornata con successo.')
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
    <div className='container mx-auto px-4 py-10'>
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
          <form id='availability-form' onSubmit={form.handleSubmit(onSubmit)}>
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
  )
}
