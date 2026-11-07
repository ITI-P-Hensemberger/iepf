'use client'

import { STICKY_CARD_FOOTER } from '@/components/sticky-footer'
import { cn } from '@/lib/utils'
import { BlockSkeleton } from '@/components/loading'
import * as React from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { BookOpen, CalendarClock, History, TriangleAlert, UserRound } from 'lucide-react'

import { AdminUserLessons } from '@/components/admin-user-lessons'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { DangerAction, DangerZone } from '@/components/danger-zone'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import * as z from 'zod'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { SectionLayout } from '@/components/section-layout'
import { useBackHref, useHere, useSetParam, withFrom } from '@/lib/back-link'
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
import {
  WeekdayAvailability,
  WeekdayAvailabilitySelector
} from '@/components/weekday-availability-selector'
import { extractPayloadArray } from '@/lib/backend-response'
import { formatItalianDate } from '@/lib/format-date'
import { TUTOR_YEARS } from '@/lib/school-years'

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
  isActive: z.boolean(),
  dailyCapacity: z.enum(['1', '2', '3', '4'])
})

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

const SECTIONS = [
  { value: 'account', label: 'Dati', icon: UserRound },
  { value: 'availability', label: 'Disponibilità', icon: CalendarClock },
  { value: 'subjects', label: 'Materie', icon: BookOpen },
  { value: 'lessons', label: 'Storico lezioni', icon: History },
  { value: 'danger', label: 'Danger zone', icon: TriangleAlert, separatorBefore: true }
] as const

export default function AdminTutorDetailPage() {
  const params = useParams()
  const router = useRouter()
  const tutorId = String(params?.id ?? '')
  const tab = useSearchParams().get('tab')
  const here = useHere()
  const backHref = useBackHref('/admin/tutors')
  const setParam = useSetParam()
  const active =
    tab === 'availability' || tab === 'subjects' || tab === 'lessons' || tab === 'danger'
      ? tab
      : 'account'

  const [tutor, setTutor] = React.useState<Tutor | null>(null)
  const [sections, setSections] = React.useState<Section[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [settingsLoading, setSettingsLoading] = React.useState(true)
  const [originalDailyCapacity, setOriginalDailyCapacity] = React.useState<
    number | null
  >(null)
  const [showEmailAlert, setShowEmailAlert] = React.useState(false)
  const [pendingValues, setPendingValues] =
    React.useState<TutorFormValues | null>(null)
  const [showDeleteAlert, setShowDeleteAlert] = React.useState(false)
  const [isDeleting, setIsDeleting] = React.useState(false)
  const [availabilityWeekdays, setAvailabilityWeekdays] = React.useState<
    WeekdayAvailability[] | null
  >(null)
  const [availabilityLoading, setAvailabilityLoading] = React.useState(true)
  const [availabilitySubmitting, setAvailabilitySubmitting] =
    React.useState(false)
  const [originalSubjects, setOriginalSubjects] = React.useState<string[]>([])
  const [subjectsLoading, setSubjectsLoading] = React.useState(true)
  const [subjectsSubmitting, setSubjectsSubmitting] = React.useState(false)
  const [dailyCapacityValue, setDailyCapacityValue] =
    React.useState<TutorFormValues['dailyCapacity']>('1')
  const [isImpersonating, setIsImpersonating] = React.useState(false)

  const form = useForm<TutorFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      year: '',
      sectionId: '',
      isActive: false,
      dailyCapacity: '1'
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
            isActive: data.isActive === true,
            dailyCapacity: dailyCapacityValue
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
  }, [dailyCapacityValue, form, tutorId])

  React.useEffect(() => {
    if (!tutorId) return
    let isMounted = true

    async function fetchSettings() {
      setSettingsLoading(true)
      try {
        const response = await fetch(`/api/tutors/${tutorId}/settings`)
        if (!response.ok) {
          throw new Error('Impossibile caricare le impostazioni del tutor.')
        }
        const payload = (await response.json()) as { dailyCapacity?: number }
        const dailyCapacity =
          Number(payload.dailyCapacity) >= 1 &&
          Number(payload.dailyCapacity) <= 4
            ? Number(payload.dailyCapacity)
            : 1
        if (isMounted) {
          setOriginalDailyCapacity(dailyCapacity)
          setDailyCapacityValue(
            String(dailyCapacity) as TutorFormValues['dailyCapacity']
          )
          form.setValue(
            'dailyCapacity',
            String(dailyCapacity) as TutorFormValues['dailyCapacity'],
            {
              shouldDirty: false
            }
          )
        }
      } catch (err) {
        if (isMounted) {
          toast.error(
            err instanceof Error
              ? err.message
              : 'Impossibile caricare le impostazioni del tutor.'
          )
        }
      } finally {
        if (isMounted) {
          setSettingsLoading(false)
        }
      }
    }

    void fetchSettings()

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
        const normalizedWeekdays = WEEKDAYS.map((day) => {
          const match = payload.weekdays?.find(
            (item) => item.weekday === day.value
          )
          return {
            weekday: day.value,
            isAvailable: match?.isAvailable ?? false,
            startTime: match?.isAvailable ? (match?.startTime ?? null) : null
          }
        })
        if (isMounted) {
          setAvailabilityWeekdays(normalizedWeekdays)
        }
      } catch (err) {
        if (isMounted) {
          setAvailabilityWeekdays(
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

  async function submitTutor(
    values: TutorFormValues,
    options?: { suppressToast?: boolean }
  ) {
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

      if (!options?.suppressToast) {
        toast.success('Tutor aggiornato.')
      }
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
      setDailyCapacityValue(values.dailyCapacity)
      return true
    } catch (err) {
      if (!options?.suppressToast) {
        toast.error(
          err instanceof Error
            ? err.message
            : 'Impossibile aggiornare il tutor.'
        )
      }
      return false
    } finally {
      setIsSubmitting(false)
    }
  }

  async function submitTutorSettings(
    dailyCapacity: number,
    options?: { suppressToast?: boolean }
  ) {
    try {
      const response = await fetch(`/api/tutors/${tutorId}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailyCapacity })
      })
      if (!response.ok) {
        let message = 'Impossibile aggiornare le impostazioni del tutor.'
        try {
          const payload = (await response.json()) as { message?: string }
          message = payload.message ?? message
        } catch {
          message = 'Impossibile aggiornare le impostazioni del tutor.'
        }
        throw new Error(message)
      }
      setOriginalDailyCapacity(dailyCapacity)
      if (!options?.suppressToast) {
        toast.success('Impostazioni tutor aggiornate.')
      }
      return true
    } catch (err) {
      if (!options?.suppressToast) {
        toast.error(
          err instanceof Error
            ? err.message
            : 'Impossibile aggiornare le impostazioni del tutor.'
        )
      }
      return false
    }
  }

  async function handleConfirmedSubmit(values: TutorFormValues) {
    const dirtyFields = form.formState.dirtyFields
    const hasUserChanges = Object.keys(dirtyFields).some(
      (key) => key !== 'dailyCapacity'
    )
    const dailyCapacityValue = Number(values.dailyCapacity)
    const shouldUpdateSettings =
      Number.isFinite(dailyCapacityValue) &&
      dailyCapacityValue >= 1 &&
      dailyCapacityValue <= 4 &&
      dailyCapacityValue !== originalDailyCapacity
    const showCombinedToast = hasUserChanges && shouldUpdateSettings

    let userUpdated = true
    if (hasUserChanges) {
      userUpdated = await submitTutor(values, {
        suppressToast: showCombinedToast
      })
    }

    let settingsUpdated = true
    if (shouldUpdateSettings) {
      settingsUpdated = await submitTutorSettings(dailyCapacityValue, {
        suppressToast: showCombinedToast
      })
    }

    if (!hasUserChanges && settingsUpdated) {
      form.reset(values)
    }
    setDailyCapacityValue(values.dailyCapacity)

    if (!userUpdated || !settingsUpdated) {
      return
    }

    if (showCombinedToast) {
      toast.success('Tutor aggiornato.')
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

    await handleConfirmedSubmit(values)
  }

  // Returns the error to show in the dialog (a wrong password), or null.
  async function handleDelete(password: string): Promise<string | null> {
    if (!tutorId) {
      return null
    }
    setIsDeleting(true)
    try {
      const response = await fetch(`/api/users/${tutorId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      })
      if (response.status === 403) {
        return 'Password non corretta.'
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { message?: string } | null
        throw new Error(payload?.message ?? 'Impossibile eliminare il tutor.')
      }
      setShowDeleteAlert(false)
      router.push('/admin/tutors')
      return null
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Impossibile eliminare il tutor.')
      setShowDeleteAlert(false)
      return null
    } finally {
      setIsDeleting(false)
    }
  }

  async function handleImpersonate() {
    if (!tutorId) return
    setIsImpersonating(true)
    try {
      const response = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: tutorId })
      })
      if (!response.ok) {
        let message = "Impossibile avviare l'impersonazione."
        try {
          const payload = (await response.json()) as { message?: string }
          message = payload.message ?? message
        } catch {
          message = "Impossibile avviare l'impersonazione."
        }
        throw new Error(message)
      }
      const payload = (await response.json()) as {
        impersonatedUser?: { role?: string }
      }
      const role = payload.impersonatedUser?.role ?? 'tutor'
      const redirect = role === 'student' ? '/student' : '/tutor'
      window.location.href = redirect
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Impossibile avviare l'impersonazione."
      )
    } finally {
      setIsImpersonating(false)
    }
  }

  async function submitAvailability(values: AvailabilityFormValues) {
    if (!tutorId) return
    setAvailabilitySubmitting(true)

    try {
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
          startTime: match?.isAvailable ? (match?.startTime ?? null) : null
        }
      })

      setAvailabilityWeekdays(normalizedWeekdays)
      availabilityForm.reset({ weekdays: normalizedWeekdays })
      toast.success('Disponibilità aggiornata.')
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
        toast.success('Materie aggiornate.')
      }
    } catch {
      toast.error('Impossibile aggiornare le materie. Riprova.')
    } finally {
      setSubjectsSubmitting(false)
    }
  }

  const changeSection = (value: string) =>
    setParam('tab', value === 'account' ? null : value)

  return (
    <SectionLayout
      title={tutor ? `${tutor.firstName} ${tutor.lastName}` : 'Dettagli tutor'}
      description={tutor?.email ?? 'Gestisci i dati del tutor.'}
      backHref={backHref}
      sections={SECTIONS}
      value={active}
      onValueChange={changeSection}
      actions={
        <>
          <Button
            variant='outline'
            onClick={handleImpersonate}
            disabled={isImpersonating}
          >
            {isImpersonating ? 'Accesso...' : 'Impersona tutor'}
          </Button>
          <Button asChild variant='outline'>
            <Link
              href={withFrom(
                `/admin/feedback?feedbackAuthor=${tutorId}&feedbackRole=tutor`,
                here
              )}
            >
              Feedback
            </Link>
          </Button>
        </>
      }
    >
      {active === 'account' && (
        <Card>
          <CardContent className='pt-6'>
            {isLoading ? (
              <BlockSkeleton />
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
                        <FieldLabel htmlFor='tutor-first-name'>Nome</FieldLabel>
                        <Input
                          {...field}
                          id='tutor-first-name'
                          aria-invalid={fieldState.invalid}
                          autoComplete='given-name'
                          onBlur={(event) => {
                            field.onBlur()
                            const normalized = normalizeName(event.target.value)
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
                            const normalized = normalizeName(event.target.value)
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
                              {TUTOR_YEARS.map((year) => (
                                <SelectItem key={year} value={String(year)}>
                                  {year}° anno
                                </SelectItem>
                              ))}
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
                        <FieldLabel htmlFor='tutor-section'>Sezione</FieldLabel>
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
                    name='dailyCapacity'
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor='tutor-daily-capacity'>
                          Capacità giornaliera
                        </FieldLabel>
                        <Select
                          onValueChange={(value) => field.onChange(value)}
                          value={field.value}
                          disabled={settingsLoading}
                        >
                          <SelectTrigger
                            id='tutor-daily-capacity'
                            aria-invalid={fieldState.invalid}
                          >
                            <SelectValue placeholder='Seleziona' />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectLabel>Capacità</SelectLabel>
                              {['1', '2', '3', '4'].map((value) => (
                                <SelectItem key={value} value={value}>
                                  {value}
                                </SelectItem>
                              ))}
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
          <CardFooter className={cn('flex justify-end', STICKY_CARD_FOOTER)}>
            <Button
              type='submit'
              form='admin-tutor-form'
              disabled={isSubmitting || !form.formState.isDirty}
            >
              {isSubmitting ? 'Salvataggio...' : 'Salva modifiche'}
            </Button>
          </CardFooter>
        </Card>
      )}

      {tutor && active === 'availability' && (
        <Card>
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
              <BlockSkeleton />
            ) : (
              <form
                id='admin-tutor-availability-form'
                onSubmit={availabilityForm.handleSubmit(submitAvailability)}
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
          <CardFooter className={cn('flex justify-end', STICKY_CARD_FOOTER)}>
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
              {availabilitySubmitting ? 'Salvataggio...' : 'Salva modifiche'}
            </Button>
          </CardFooter>
        </Card>
      )}

      {tutor && active === 'subjects' && (
        <Card>
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
              <BlockSkeleton />
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
          <CardFooter className={cn('flex justify-end', STICKY_CARD_FOOTER)}>
            <Button
              type='submit'
              form='admin-tutor-subjects-form'
              className='w-full sm:w-auto'
              disabled={subjectsLoading || subjectsSubmitting || !subjectsDirty}
            >
              {subjectsSubmitting ? 'Salvataggio...' : 'Salva modifiche'}
            </Button>
          </CardFooter>
        </Card>
      )}

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
                await handleConfirmedSubmit(pendingValues)
                setPendingValues(null)
              }}
            >
              Aggiorna
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ConfirmDeleteDialog
        open={showDeleteAlert}
        onOpenChange={setShowDeleteAlert}
        title='Eliminare il tutor?'
        description='Il tutor perde l’accesso e l’account viene eliminato. Non si può annullare.'
        onConfirm={handleDelete}
      />
      {active === 'lessons' && tutorId && (
        <AdminUserLessons role='tutor' userId={tutorId} />
      )}
      {active === 'danger' && (
        <DangerZone>
          <DangerAction
            title='Elimina account'
            description='Il tutor perde l’accesso e l’account viene eliminato. Non si può annullare.'
            action={
              <Button variant='destructive' onClick={() => setShowDeleteAlert(true)} disabled={isDeleting}>
                {isDeleting ? 'Eliminazione...' : 'Elimina account'}
              </Button>
            }
          />
        </DangerZone>
      )}
    </SectionLayout>
  )
}
