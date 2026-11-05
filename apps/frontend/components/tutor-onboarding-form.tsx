'use client'

import * as React from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import * as z from 'zod'
import { toast } from 'sonner'
import { GraduationCap } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { FieldSeparator } from '@/components/ui/field'
import { SubjectSelector } from '@/components/subject-selector'
import { WeekdayAvailabilitySelector } from '@/components/weekday-availability-selector'

const WEEKDAYS = [
  { value: 1, label: 'Lunedì' },
  { value: 2, label: 'Martedì' },
  { value: 3, label: 'Mercoledì' },
  { value: 4, label: 'Giovedì' },
  { value: 5, label: 'Venerdì' }
] as const

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

const onboardingSchema = z.object({
  subjectIds: z.array(z.string()).min(1, 'Seleziona almeno una materia'),
  weekdays: z.array(availabilityItemSchema)
})

type OnboardingFormValues = z.infer<typeof onboardingSchema>

type TutorOnboardingFormProps = {
  tutorId: string
}

export function TutorOnboardingForm({ tutorId }: TutorOnboardingFormProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const form = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      subjectIds: [],
      weekdays: WEEKDAYS.map((day) => ({
        weekday: day.value,
        isAvailable: false,
        startTime: null
      }))
    },
    mode: 'onBlur'
  })

  async function onSubmit(data: OnboardingFormValues) {
    setIsSubmitting(true)

    try {
      // Assign each selected subject
      for (const subjectId of data.subjectIds) {
        const response = await fetch(`/api/tutors/${tutorId}/subjects`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ subjectId })
        })

        if (!response.ok) {
          const payload = (await response.json()) as { message?: string }
          throw new Error(
            payload.message || "Errore durante l'assegnazione delle materie."
          )
        }
      }

      // Update weekday availability
      const weekdaysPayload = data.weekdays.map((day) => ({
        weekday: day.weekday,
        isAvailable: day.isAvailable,
        startTime: day.isAvailable ? day.startTime : null
      }))

      const availabilityResponse = await fetch(
        `/api/tutors/${tutorId}/weekday-availability`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ weekdays: weekdaysPayload })
        }
      )

      if (!availabilityResponse.ok) {
        const payload = (await availabilityResponse.json()) as {
          message?: string
        }
        throw new Error(
          payload.message ||
            "Errore durante l'aggiornamento della disponibilità."
        )
      }

      // Redirect to tutor home with full page reload to refresh data.
      // Temporary: docs/TODO.md item 25 replaces this with invalidating the onboarding data.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = '/tutor'
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Si è verificato un errore. Riprova.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card className='w-full'>
      <CardHeader className='space-y-2'>
        <div className='flex items-center gap-2'>
          <GraduationCap className='h-6 w-6 text-primary' />
          <h1 className='text-xl font-semibold'>
            Configura il tuo profilo tutor
          </h1>
        </div>
        <p className='text-sm text-muted-foreground'>
          Completa il tuo profilo selezionando le materie e la disponibilità
        </p>
      </CardHeader>
      <CardContent>
        <form
          id='tutor-onboarding-form'
          onSubmit={form.handleSubmit(onSubmit)}
          className='space-y-8'
        >
          <Controller
            name='subjectIds'
            control={form.control}
            render={({ field, fieldState }) => (
              <div className='space-y-2'>
                <SubjectSelector
                  value={field.value}
                  onChange={field.onChange}
                  disabled={isSubmitting}
                />
                {fieldState.error && (
                  <p className='text-sm font-medium text-destructive'>
                    {fieldState.error.message}
                  </p>
                )}
              </div>
            )}
          />

          <FieldSeparator />

          <Controller
            name='weekdays'
            control={form.control}
            render={({ field, fieldState }) => (
              <div className='space-y-2 mt-6'>
                <WeekdayAvailabilitySelector
                  value={field.value}
                  onChange={field.onChange}
                  disabled={isSubmitting}
                />
                {fieldState.error && (
                  <p className='text-sm font-medium text-destructive'>
                    {fieldState.error.message}
                  </p>
                )}
              </div>
            )}
          />
        </form>
      </CardContent>
      <CardFooter className='flex flex-col gap-3'>
        <div className='flex justify-end w-full'>
          <Button
            type='submit'
            form='tutor-onboarding-form'
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Salvataggio...' : 'Salva e continua'}
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
}
