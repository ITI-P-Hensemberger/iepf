'use client'

import * as React from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import * as z from 'zod'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { BackButton } from '@/components/back-button'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { SubjectSelector } from '@/components/subject-selector'
import { WeekdayAvailabilitySelector } from '@/components/weekday-availability-selector'
import { extractPayloadArray } from '@/lib/backend-response'
import { formatItalianDate } from '@/lib/format-date'

function normalizeName(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase()
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

const formSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(2, 'Il nome e obbligatorio')
    .regex(/^[\p{L}]+$/u, 'Il nome puo contenere solo lettere'),
  lastName: z
    .string()
    .trim()
    .min(2, 'Il cognome e obbligatorio')
    .regex(/^[\p{L}]+$/u, 'Il cognome puo contenere solo lettere'),
  email: z.string().email('Indirizzo email non valido'),
  year: z.string().min(1, "L'anno e obbligatorio"),
  sectionId: z.uuid('La sezione e obbligatoria'),
  isActive: z.boolean()
})

const availabilitySchema = z.object({
  weekdays: z.array(z.number().min(1).max(5))
})

const subjectsSchema = z.object({
  subjectIds: z.array(z.string()).min(1, 'Seleziona almeno una materia')
})

type TutorFormValues = z.infer<typeof formSchema>
type AvailabilityFormValues = z.infer<typeof availabilitySchema>
type SubjectsFormValues = z.infer<typeof subjectsSchema>

type Section = {
  id: string
  name: string
}

type Tutor = {
  id: string
  email: string
  firstName: string
  lastName: string
  role?: string | null
  emailVerifiedAt?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  sectionId?: string | null
  year?: number | null
  isActive?: boolean | null
}

type WeekdayAvailability = {
  weekday: number
  isAvailable: boolean
}

type TutorSubject = {
  id: string
  name: string
}

const WEEKDAYS = [
  { value: 1, label: 'Lunedì' },
  { value: 2, label: 'Martedì' },
  { value: 3, label: 'Mercoledì' },
  { value: 4, label: 'Giovedì' },
  { value: 5, label: 'Venerdì' }
] as const

export default function AdminTutorDetailPage() {
  const params = useParams()
  const router = useRouter()
  const tutorId = String(params?.id ?? '')

  const [tutor, setTutor] = React.useState<Tutor | null>(null)
  const [sections, setSections] = React.useState<Section[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [showEmailAlert, setShowEmailAlert] = React.useState(false)
  const [pendingValues, setPendingValues] =
    React.useState<TutorFormValues | null>(null)
  const [showDeleteAlert, setShowDeleteAlert] = React.useState(false)
  const [isDeleting, setIsDeleting] = React.useState(false)
  const [availabilityWeekdays, setAvailabilityWeekdays] = React.useState<
    number[] | null
  >(null)
  const [availabilityLoading, setAvailabilityLoading] = React.useState(true)
  const [availabilitySubmitting, setAvailabilitySubmitting] =
    React.useState(false)
  const [originalSubjects, setOriginalSubjects] = React.useState<string[]>([])
  const [subjectsLoading, setSubjectsLoading] = React.useState(true)
  const [subjectsSubmitting, setSubjectsSubmitting] = React.useState(false)

  const form = useForm<TutorFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      year: '',
      sectionId: '',
      isActive: false
    }
  })

  const availabilityForm = useForm<AvailabilityFormValues>({
    resolver: zodResolver(availabilitySchema),
    defaultValues: { weekdays: [] },
    mode: 'onBlur'
  })

  const subjectsForm = useForm<SubjectsFormValues>({
    resolver: zodResolver(subjectsSchema),
    defaultValues: { subjectIds: [] },
    mode: 'onBlur'
  })

  const watchedEmail = form.watch('email')
  const emailChanged = React.useMemo(() => {
    if (!tutor) {
      return false
    }
    return (
      normalizeEmail(watchedEmail ?? '') !== normalizeEmail(tutor.email ?? '')
    )
  }, [tutor, watchedEmail])

  const currentSubjectIds = subjectsForm.watch('subjectIds')
  const subjectsDirty = React.useMemo(() => {
    const current = new Set(currentSubjectIds)
    const original = new Set(originalSubjects)
    if (current.size !== original.size) return true
    return [...current].some((id) => !original.has(id))
  }, [currentSubjectIds, originalSubjects])

  React.useEffect(() => {
    let isMounted = true

    async function loadTutor() {
      setIsLoading(true)

      try {
        const response = await fetch(`/api/users/${tutorId}`)
        if (!response.ok) {
          throw new Error('Impossibile recuperare il tutor.')
        }
        const data = (await response.json()) as Tutor
        if (isMounted) {
          setTutor(data)
          form.reset({
            firstName: data.firstName ?? '',
            lastName: data.lastName ?? '',
            email: data.email ?? '',
            year: data.year ? String(data.year) : '',
            sectionId: data.sectionId ?? '',
            isActive: data.isActive === true
          })
        }
      } catch (err) {
        if (isMounted) {
          toast.error(
            err instanceof Error
              ? err.message
              : 'Impossibile recuperare il tutor.'
          )
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    async function loadSections() {
      try {
        const response = await fetch('/api/class-sections')
        if (!response.ok) {
          throw new Error('Impossibile recuperare le sezioni.')
        }
        const payload = await response.json()
        const data = extractPayloadArray<Section>(payload)
        if (isMounted) {
          setSections(data)
        }
      } catch (err) {
        if (isMounted) {
          toast.error(
            err instanceof Error
              ? err.message
              : 'Impossibile recuperare le sezioni.'
          )
        }
      }
    }

    if (tutorId) {
      void loadTutor()
      void loadSections()
    }

    return () => {
      isMounted = false
    }
  }, [form, tutorId])

  React.useEffect(() => {
    if (!tutorId) return

    let isMounted = true

    async function fetchAvailability() {
      setAvailabilityLoading(true)
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
        const availableWeekdays = (payload.weekdays ?? [])
          .filter((item) => item.isAvailable)
          .map((item) => item.weekday)
        if (isMounted) {
          setAvailabilityWeekdays(availableWeekdays)
        }
      } catch (err) {
        if (isMounted) {
          setAvailabilityWeekdays([])
        }
        toast.error(
          err instanceof Error
            ? err.message
            : 'Impossibile caricare la disponibilità.'
        )
      } finally {
        if (isMounted) {
          setAvailabilityLoading(false)
        }
      }
    }

    void fetchAvailability()

    return () => {
      isMounted = false
    }
  }, [tutorId])

  React.useEffect(() => {
    if (!tutorId) return

    let isMounted = true

    async function fetchSubjects() {
      setSubjectsLoading(true)
      try {
        const response = await fetch(`/api/tutors/${tutorId}/subjects`)
        if (!response.ok) {
          throw new Error('Impossibile caricare le materie.')
        }
        const payload = await response.json()
        const subjects = extractPayloadArray<TutorSubject>(payload)
        const subjectIds = subjects.map((subject) => subject.id)
        if (isMounted) {
          setOriginalSubjects(subjectIds)
          subjectsForm.reset({ subjectIds })
        }
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : 'Impossibile caricare le materie.'
        )
      } finally {
        if (isMounted) {
          setSubjectsLoading(false)
        }
      }
    }

    void fetchSubjects()

    return () => {
      isMounted = false
    }
  }, [subjectsForm, tutorId])

  React.useEffect(() => {
    if (availabilityWeekdays === null) return
    availabilityForm.reset({ weekdays: availabilityWeekdays })
  }, [availabilityForm, availabilityWeekdays])

  const groupedSections = React.useMemo(() => {
    const scient: Section[] = []
    const mech: Section[] = []
    const elec: Section[] = []
    const chem: Section[] = []
    const info: Section[] = []

    sections.forEach((section) => {
      const label = section.name.toUpperCase()
      if (label.includes('L')) {
        scient.push(section)
        return
      }
      if (label.startsWith('A')) {
        mech.push(section)
        return
      }
      if (label.startsWith('B')) {
        elec.push(section)
        return
      }
      if (label.startsWith('C')) {
        chem.push(section)
        return
      }
      if (label.startsWith('D')) {
        info.push(section)
      }
    })

    const sortByName = (list: Section[]) =>
      [...list].sort((a, b) =>
        a.name.localeCompare(b.name, 'it', { sensitivity: 'base' })
      )

    return {
      scient: sortByName(scient),
      mech: sortByName(mech),
      elec: sortByName(elec),
      chem: sortByName(chem),
      info: sortByName(info)
    }
  }, [sections])

  async function submitTutor(values: TutorFormValues) {
    setIsSubmitting(true)

    try {
      const normalizedFirstName = normalizeName(values.firstName)
      const normalizedLastName = normalizeName(values.lastName)
      const normalizedEmail = normalizeEmail(values.email)

      const response = await fetch(`/api/users/${tutorId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          firstName: normalizedFirstName,
          lastName: normalizedLastName,
          email: normalizedEmail,
          year: Number(values.year),
          sectionId: values.sectionId,
          isActive: values.isActive
        })
      })

      if (!response.ok) {
        let message = 'Impossibile aggiornare il tutor.'
        try {
          const payload = (await response.json()) as { message?: string }
          message = payload.message ?? message
        } catch {
          message = 'Impossibile aggiornare il tutor.'
        }
        throw new Error(message)
      }

      toast.success('Tutor aggiornato con successo.')
      setTutor((prev) =>
        prev
          ? {
              ...prev,
              firstName: normalizedFirstName,
              lastName: normalizedLastName,
              email: normalizedEmail,
              year: Number(values.year),
              sectionId: values.sectionId,
              isActive: values.isActive
            }
          : prev
      )
      form.reset(values)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Impossibile aggiornare il tutor.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function onSubmit(values: TutorFormValues) {
    if (!form.formState.isDirty) {
      toast.error('Nessuna modifica da salvare.')
      return
    }

    if (emailChanged) {
      setPendingValues(values)
      setShowEmailAlert(true)
      return
    }

    await submitTutor(values)
  }

  async function handleDelete() {
    if (!tutorId) {
      return
    }
    setIsDeleting(true)
    try {
      const response = await fetch(`/api/users/${tutorId}`, {
        method: 'DELETE'
      })
      if (!response.ok) {
        let message = 'Impossibile eliminare il tutor.'
        try {
          const payload = (await response.json()) as { message?: string }
          message = payload.message ?? message
        } catch {
          message = 'Impossibile eliminare il tutor.'
        }
        throw new Error(message)
      }
      router.push('/admin/tutors')
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Impossibile eliminare il tutor.'
      )
    } finally {
      setIsDeleting(false)
      setShowDeleteAlert(false)
    }
  }

  async function submitAvailability(values: AvailabilityFormValues) {
    if (!tutorId) return
    setAvailabilitySubmitting(true)

    try {
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

      const refetchResponse = await fetch(
        `/api/tutors/${tutorId}/weekday-availability`
      )
      const refetchPayload = (await refetchResponse.json()) as {
        weekdays?: WeekdayAvailability[]
      }
      const availableWeekdays = (refetchPayload.weekdays ?? [])
        .filter((item) => item.isAvailable)
        .map((item) => item.weekday)

      setAvailabilityWeekdays(availableWeekdays)
      availabilityForm.reset({ weekdays: availableWeekdays })
      toast.success('Disponibilità aggiornata con successo.')
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Impossibile aggiornare la disponibilità. Riprova.'
      )
    } finally {
      setAvailabilitySubmitting(false)
    }
  }

  async function submitSubjects(values: SubjectsFormValues) {
    if (!tutorId) return

    setSubjectsSubmitting(true)

    const toAdd = values.subjectIds.filter(
      (id) => !originalSubjects.includes(id)
    )
    const toRemove = originalSubjects.filter(
      (id) => !values.subjectIds.includes(id)
    )
    const errors: string[] = []

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

    try {
      const response = await fetch(`/api/tutors/${tutorId}/subjects`)
      const payload = await response.json()
      const subjects = extractPayloadArray<TutorSubject>(payload)
      const subjectIds = subjects.map((subject) => subject.id)

      setOriginalSubjects(subjectIds)
      subjectsForm.reset({ subjectIds })

      if (errors.length > 0) {
        toast.error(
          `Alcune operazioni non sono riuscite:\n${errors.join('\n')}`
        )
      } else {
        toast.success('Materie aggiornate con successo.')
      }
    } catch {
      toast.error('Impossibile aggiornare le materie. Riprova.')
    } finally {
      setSubjectsSubmitting(false)
    }
  }

  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10 flex flex-col items-center'>
        <div className='w-full max-w-6xl'>
          <div className='mb-6'>
            <BackButton />
          </div>
          <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
            <div>
              <h1 className='text-2xl'>Dettagli tutor</h1>
              <p className='mt-1 text-sm text-muted-foreground'>
                Gestisci i dati del tutor.
              </p>
            </div>
            <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
              <Button asChild variant='outline'>
                <Link
                  href={`/admin/feedback?feedbackAuthor=${tutorId}&feedbackRole=tutor`}
                >
                  Feedback
                </Link>
              </Button>
            </div>
          </div>
          <Card className='mt-6'>
            <CardContent className='pt-6'>
              {isLoading ? (
                <p className='text-sm text-muted-foreground'>Caricamento...</p>
              ) : !tutor ? (
                <p className='text-sm text-muted-foreground'>
                  Tutor non trovato.
                </p>
              ) : (
                <form
                  id='admin-tutor-form'
                  onSubmit={form.handleSubmit(onSubmit)}
                  className='space-y-6'
                >
                  <FieldGroup>
                    <Controller
                      name='firstName'
                      control={form.control}
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor='tutor-first-name'>
                            Nome
                          </FieldLabel>
                          <Input
                            {...field}
                            id='tutor-first-name'
                            aria-invalid={fieldState.invalid}
                            autoComplete='given-name'
                            onBlur={(event) => {
                              field.onBlur()
                              const normalized = normalizeName(
                                event.target.value
                              )
                              form.setValue('firstName', normalized, {
                                shouldDirty: normalized !== field.value
                              })
                            }}
                          />
                          {fieldState.invalid && (
                            <FieldError errors={[fieldState.error]} />
                          )}
                        </Field>
                      )}
                    />
                    <Controller
                      name='lastName'
                      control={form.control}
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor='tutor-last-name'>
                            Cognome
                          </FieldLabel>
                          <Input
                            {...field}
                            id='tutor-last-name'
                            aria-invalid={fieldState.invalid}
                            autoComplete='family-name'
                            onBlur={(event) => {
                              field.onBlur()
                              const normalized = normalizeName(
                                event.target.value
                              )
                              form.setValue('lastName', normalized, {
                                shouldDirty: normalized !== field.value
                              })
                            }}
                          />
                          {fieldState.invalid && (
                            <FieldError errors={[fieldState.error]} />
                          )}
                        </Field>
                      )}
                    />
                    <Controller
                      name='email'
                      control={form.control}
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor='tutor-email'>Email</FieldLabel>
                          <Input
                            {...field}
                            id='tutor-email'
                            aria-invalid={fieldState.invalid}
                            autoComplete='email'
                            onBlur={(event) => {
                              field.onBlur()
                              const normalized = normalizeEmail(
                                event.target.value
                              )
                              form.setValue('email', normalized, {
                                shouldDirty: normalized !== field.value
                              })
                            }}
                          />
                          {fieldState.invalid && (
                            <FieldError errors={[fieldState.error]} />
                          )}
                        </Field>
                      )}
                    />
                    <Controller
                      name='year'
                      control={form.control}
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor='tutor-year'>Anno</FieldLabel>
                          <Select
                            onValueChange={(value) => field.onChange(value)}
                            value={String(field.value)}
                          >
                            <SelectTrigger
                              id='tutor-year'
                              aria-invalid={fieldState.invalid}
                            >
                              <SelectValue placeholder="Seleziona l'anno" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                <SelectLabel>Anno</SelectLabel>
                                <SelectItem value='4'>4° anno</SelectItem>
                                <SelectItem value='5'>5° anno</SelectItem>
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                          {fieldState.invalid && (
                            <FieldError errors={[fieldState.error]} />
                          )}
                        </Field>
                      )}
                    />
                    <Controller
                      name='sectionId'
                      control={form.control}
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor='tutor-section'>
                            Sezione
                          </FieldLabel>
                          <Select
                            onValueChange={(value) => field.onChange(value)}
                            value={String(field.value)}
                          >
                            <SelectTrigger
                              id='tutor-section'
                              aria-invalid={fieldState.invalid}
                            >
                              <SelectValue placeholder='Seleziona la sezione' />
                            </SelectTrigger>
                            <SelectContent>
                              {groupedSections.scient.length > 0 && (
                                <SelectGroup>
                                  <SelectLabel>
                                    Scientifico Scienze Applicate
                                  </SelectLabel>
                                  {groupedSections.scient.map((section) => (
                                    <SelectItem
                                      key={section.id}
                                      value={section.id}
                                    >
                                      {section.name}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              )}
                              {groupedSections.mech.length > 0 && (
                                <SelectGroup>
                                  <SelectLabel>
                                    Meccanica Meccatronica Energia
                                  </SelectLabel>
                                  {groupedSections.mech.map((section) => (
                                    <SelectItem
                                      key={section.id}
                                      value={section.id}
                                    >
                                      {section.name}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              )}
                              {groupedSections.elec.length > 0 && (
                                <SelectGroup>
                                  <SelectLabel>
                                    Elettronica ed Elettrotecnica
                                  </SelectLabel>
                                  {groupedSections.elec.map((section) => (
                                    <SelectItem
                                      key={section.id}
                                      value={section.id}
                                    >
                                      {section.name}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              )}
                              {groupedSections.chem.length > 0 && (
                                <SelectGroup>
                                  <SelectLabel>
                                    Chimica Biotecnologie Sanitarie
                                  </SelectLabel>
                                  {groupedSections.chem.map((section) => (
                                    <SelectItem
                                      key={section.id}
                                      value={section.id}
                                    >
                                      {section.name}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              )}
                              {groupedSections.info.length > 0 && (
                                <SelectGroup>
                                  <SelectLabel>
                                    Informatica e Telecomunicazioni
                                  </SelectLabel>
                                  {groupedSections.info.map((section) => (
                                    <SelectItem
                                      key={section.id}
                                      value={section.id}
                                    >
                                      {section.name}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              )}
                            </SelectContent>
                          </Select>
                          {fieldState.invalid && (
                            <FieldError errors={[fieldState.error]} />
                          )}
                        </Field>
                      )}
                    />
                    <Controller
                      name='isActive'
                      control={form.control}
                      render={({ field }) => (
                        <Field orientation='horizontal'>
                          <div className='flex items-center gap-2'>
                            <Checkbox
                              id='tutor-active'
                              checked={field.value}
                              onCheckedChange={(value) =>
                                field.onChange(Boolean(value))
                              }
                            />
                            <Label htmlFor='tutor-active'>Attivo</Label>
                          </div>
                        </Field>
                      )}
                    />
                  </FieldGroup>
                  <Accordion type='single' collapsible className='w-full'>
                    <AccordionItem value='tech-details'>
                      <AccordionTrigger>Dettagli tecnici</AccordionTrigger>
                      <AccordionContent>
                        <div className='text-sm text-muted-foreground space-y-2'>
                          <div>
                            <span className='font-medium text-foreground'>
                              ID:
                            </span>{' '}
                            {tutor?.id ?? '-'}
                          </div>
                          <div>
                            <span className='font-medium text-foreground'>
                              Ruolo:
                            </span>{' '}
                            {tutor?.role ?? '-'}
                          </div>
                          <div>
                            <span className='font-medium text-foreground'>
                              Email verificata:
                            </span>{' '}
                            {formatItalianDate(tutor?.emailVerifiedAt)}
                          </div>
                          <div>
                            <span className='font-medium text-foreground'>
                              Creato il:
                            </span>{' '}
                            {formatItalianDate(tutor?.createdAt)}
                          </div>
                          <div>
                            <span className='font-medium text-foreground'>
                              Aggiornato il:
                            </span>{' '}
                            {formatItalianDate(tutor?.updatedAt)}
                          </div>
                          <div>
                            <span className='font-medium text-foreground'>
                              Section ID:
                            </span>{' '}
                            {tutor?.sectionId ?? '-'}
                          </div>
                          <div>
                            <span className='font-medium text-foreground'>
                              Anno:
                            </span>{' '}
                            {tutor?.year ?? '-'}
                          </div>
                          <div>
                            <span className='font-medium text-foreground'>
                              Attivo:
                            </span>{' '}
                            {tutor?.isActive ? 'Si' : 'No'}
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </form>
              )}
            </CardContent>
            <CardFooter className='flex flex-col gap-3 items-start sm:flex-row sm:items-center sm:justify-between'>
              <Button
                type='submit'
                form='admin-tutor-form'
                disabled={isSubmitting || !form.formState.isDirty}
              >
                {isSubmitting ? 'Salvataggio...' : 'Salva modifiche'}
              </Button>
              <Button
                type='button'
                variant='destructive'
                onClick={() => setShowDeleteAlert(true)}
                disabled={isDeleting}
              >
                {isDeleting ? 'Eliminazione...' : 'Elimina account'}
              </Button>
            </CardFooter>
          </Card>

          {tutor && (
            <>
              <Card className='mt-6'>
                <CardHeader>
                  <div className='space-y-1'>
                    <h2 className='text-lg font-semibold'>Disponibilità</h2>
                    <p className='text-sm text-muted-foreground'>
                      Modifica i giorni in cui il tutor è disponibile.
                    </p>
                  </div>
                </CardHeader>
                <CardContent>
                  {availabilityLoading ? (
                    <p className='text-sm text-muted-foreground'>
                      Caricamento...
                    </p>
                  ) : (
                    <form
                      id='admin-tutor-availability-form'
                      onSubmit={availabilityForm.handleSubmit(
                        submitAvailability
                      )}
                    >
                      <Controller
                        name='weekdays'
                        control={availabilityForm.control}
                        render={({ field }) => (
                          <WeekdayAvailabilitySelector
                            value={field.value}
                            onChange={field.onChange}
                            disabled={availabilitySubmitting}
                          />
                        )}
                      />
                      {availabilityForm.formState.errors.weekdays && (
                        <p className='mt-2 text-sm text-destructive'>
                          {availabilityForm.formState.errors.weekdays.message}
                        </p>
                      )}
                    </form>
                  )}
                </CardContent>
                <CardFooter className='flex justify-end'>
                  <Button
                    type='submit'
                    form='admin-tutor-availability-form'
                    className='w-full sm:w-auto'
                    disabled={
                      availabilityLoading ||
                      availabilitySubmitting ||
                      !availabilityForm.formState.isDirty
                    }
                  >
                    {availabilitySubmitting
                      ? 'Salvataggio...'
                      : 'Salva modifiche'}
                  </Button>
                </CardFooter>
              </Card>

              <Card className='mt-6'>
                <CardHeader>
                  <div className='space-y-1'>
                    <h2 className='text-lg font-semibold'>Materie</h2>
                    <p className='text-sm text-muted-foreground'>
                      Aggiorna le materie insegnate dal tutor.
                    </p>
                  </div>
                </CardHeader>
                <CardContent>
                  {subjectsLoading ? (
                    <p className='text-sm text-muted-foreground'>
                      Caricamento...
                    </p>
                  ) : (
                    <form
                      id='admin-tutor-subjects-form'
                      onSubmit={subjectsForm.handleSubmit(submitSubjects)}
                    >
                      <Controller
                        name='subjectIds'
                        control={subjectsForm.control}
                        render={({ field }) => (
                          <SubjectSelector
                            value={field.value}
                            onChange={field.onChange}
                            disabled={subjectsLoading || subjectsSubmitting}
                          />
                        )}
                      />

                      {subjectsForm.formState.errors.subjectIds && (
                        <p className='mt-2 text-sm text-destructive'>
                          {subjectsForm.formState.errors.subjectIds.message}
                        </p>
                      )}
                    </form>
                  )}
                </CardContent>
                <CardFooter className='flex justify-end'>
                  <Button
                    type='submit'
                    form='admin-tutor-subjects-form'
                    className='w-full sm:w-auto'
                    disabled={
                      subjectsLoading || subjectsSubmitting || !subjectsDirty
                    }
                  >
                    {subjectsSubmitting
                      ? 'Salvataggio...'
                      : 'Salva modifiche'}
                  </Button>
                </CardFooter>
              </Card>
            </>
          )}
        </div>
      </div>

      <AlertDialog open={showEmailAlert} onOpenChange={setShowEmailAlert}>
        <AlertDialogContent className='z-60'>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma modifica email</AlertDialogTitle>
            <AlertDialogDescription>
              Se l&apos;email inserita è errata, il tutor potrebbe perdere
              l&apos;accesso all&apos;account. In caso di problemi, contatta
              l&apos;amministratore di sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingValues(null)}>
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!pendingValues) {
                  return
                }
                setShowEmailAlert(false)
                await submitTutor(pendingValues)
                setPendingValues(null)
              }}
            >
              Aggiorna
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
        <AlertDialogContent className='z-60'>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il tutor?</AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione è irreversibile. Il tutor perderà l&apos;accesso
              all&apos;account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void handleDelete()
              }}
              disabled={isDeleting}
            >
              {isDeleting ? 'Eliminazione...' : 'Elimina'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}
