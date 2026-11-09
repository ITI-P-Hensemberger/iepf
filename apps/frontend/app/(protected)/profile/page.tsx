'use client'

import { STICKY_SECTION_FOOTER } from '@/components/sticky-footer'
import { cn } from '@/lib/utils'
import * as React from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm, useWatch } from 'react-hook-form'
import * as z from 'zod'
import { Bell, BookOpen, CalendarClock, KeyRound, UserRound } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { useMutation, useQuery } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { LessonHoursBadge } from '@/components/lesson-hours-badge'
import { EmptyState } from '@/components/empty-state'
import { SETUP_PARAM } from '@/components/push-prompt'
import { SectionLayout } from '@/components/section-layout'
import { TutorAvailabilitySettings } from '@/components/tutor-availability-settings'
import { TutorSubjectsSettings } from '@/components/tutor-subjects-settings'
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
import { Skeleton } from '@/components/ui/skeleton'
import {
  Field,
  FieldError,
  FieldLabel
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useSession } from '@/lib/use-session'

import { extractPayloadArray } from '@/lib/backend-response'
import { apiFetch, jsonBody } from '@/lib/api-fetch'
import { NotificationSettings } from '@/components/notification-settings'
import { avatarGradient } from '@/lib/avatar'
import { classLabel } from '@/lib/class-label'
import { normalizeName, PERSON_NAME_PATTERN } from '@/lib/person-name'
function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

const formSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(2, 'Il nome e obbligatorio')
    .regex(PERSON_NAME_PATTERN, 'Il nome può contenere solo lettere e apostrofi'),
  lastName: z
    .string()
    .trim()
    .min(2, 'Il cognome e obbligatorio')
    .regex(PERSON_NAME_PATTERN, 'Il cognome può contenere solo lettere e apostrofi'),
  email: z.string().email('Indirizzo email non valido'),
  year: z.union([z.string().min(1, "L'anno e obbligatorio"), z.literal('')]),
  sectionId: z.union([
    z.string().uuid('La sezione e obbligatoria'),
    z.literal('')
  ])
})

type ProfileFormValues = z.infer<typeof formSchema>

type Section = {
  id: string
  name: string
}

const ROLE_LABELS: Record<string, string> = {
  student: 'Studente',
  tutor: 'Tutor',
  admin: 'Admin',
  activator: 'Attivatore'
}

const SECTIONS = [
  { value: 'account', label: 'Dati personali', icon: UserRound },
  // Tutors only: what they teach and when.
  { value: 'availability', label: 'Disponibilità', icon: CalendarClock },
  { value: 'subjects', label: 'Materie', icon: BookOpen },
  { value: 'notifications', label: 'Notifiche', icon: Bell },
  { value: 'security', label: 'Password', icon: KeyRound }
] as const

const TUTOR_SECTIONS = ['availability', 'subjects']

export default function ProfilePage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tab = searchParams.get('tab')
  // The push setup link (?attiva-notifiche=1) lands on the notifications.
  const active = tab === 'security' || tab === 'notifications' || (tab && TUTOR_SECTIONS.includes(tab))
    ? tab
    : searchParams.has(SETUP_PARAM) ? 'notifications' : 'account'

  const { profile, isLoading, error, refresh } = useSession()
  const isAdmin = profile?.role === 'admin'
  const isLimited = !isAdmin
  // Only students and tutors show a class.
  const sectionsQuery = useQuery({
    queryKey: ['class-sections'],
    queryFn: async () => extractPayloadArray<Section>(await apiFetch('/api/class-sections', 'Impossibile recuperare le sezioni.')),
    enabled: Boolean(profile) && !isAdmin
  })
  const isLoadingSections = !isAdmin && sectionsQuery.isPending
  const sectionName = (profile?.sectionId && sectionsQuery.data?.find((section) => section.id === profile.sectionId)?.name) || null
  const [showEmailAlert, setShowEmailAlert] = React.useState(false)
  const [pendingValues, setPendingValues] =
    React.useState<ProfileFormValues | null>(null)

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      year: '',
      sectionId: ''
    },
    values: profile
      ? {
          firstName: profile.firstName ?? '',
          lastName: profile.lastName ?? '',
          email: profile.email ?? '',
          year: profile.year ? String(profile.year) : '',
          sectionId: profile.sectionId ?? ''
        }
      : undefined
  })

  const watchedFirstName = useWatch({
    control: form.control,
    name: 'firstName'
  })
  const watchedLastName = useWatch({
    control: form.control,
    name: 'lastName'
  })
  const watchedEmail = useWatch({
    control: form.control,
    name: 'email'
  })
  const emailChanged = React.useMemo(() => {
    if (!profile) {
      return false
    }
    return (
      normalizeEmail(watchedEmail ?? '') !== normalizeEmail(profile.email ?? '')
    )
  }, [profile, watchedEmail])

  React.useEffect(() => {
    if (error) {
      toast.error(error)
    }
  }, [error])

  const canSave = React.useMemo(() => {
    if (!profile) {
      return false
    }
    const firstNameChanged =
      normalizeName(watchedFirstName ?? '') !==
      normalizeName(profile.firstName ?? '')
    const lastNameChanged =
      normalizeName(watchedLastName ?? '') !==
      normalizeName(profile.lastName ?? '')
    if (isAdmin) {
      const emailChanged =
        normalizeEmail(watchedEmail ?? '') !==
        normalizeEmail(profile.email ?? '')
      return firstNameChanged || lastNameChanged || emailChanged
    }
    return firstNameChanged || lastNameChanged
  }, [isAdmin, profile, watchedFirstName, watchedLastName, watchedEmail])

  const saveProfile = useMutation({
    mutationFn: (values: ProfileFormValues) => {
      const names = {
        firstName: normalizeName(values.firstName),
        lastName: normalizeName(values.lastName)
      }
      return apiFetch(
        '/api/users/me',
        'Impossibile aggiornare il profilo.',
        jsonBody('PATCH', isAdmin ? { ...names, email: normalizeEmail(values.email) } : names)
      )
    },
    onSuccess: async () => {
      toast.success('Profilo aggiornato.')
      await refresh()
      window.location.reload()
    }
  })
  const isSubmitting = saveProfile.isPending
  const submitProfile = (values: ProfileFormValues) => saveProfile.mutateAsync(values).catch(() => undefined)

  async function onSubmit(values: ProfileFormValues) {
    if (!canSave) {
      toast.error('Nessuna modifica da salvare.')
      return
    }

    if (isAdmin && emailChanged) {
      setPendingValues(values)
      setShowEmailAlert(true)
      return
    }

    await submitProfile(values)
  }

  const resetRequest = useMutation({
    mutationFn: (email: string) => apiFetch('/api/auth/password/reset/request', 'Impossibile inviare la mail di reset.', jsonBody('POST', { email })),
    onSuccess: () => toast.success('Ti abbiamo mandato il link per cambiare password.')
  })

  function handlePasswordReset() {
    if (!profile?.email) {
      toast.error('Email non disponibile.')
      return
    }
    resetRequest.mutate(profile.email)
  }

  const roleLabel = ROLE_LABELS[profile?.role ?? ''] ?? ''
  const initials = `${profile?.firstName?.charAt(0) ?? ''}${profile?.lastName?.charAt(0) ?? ''}`.toUpperCase()
  const schoolClass = isLimited && !isLoadingSections ? classLabel(profile?.year, sectionName) : null

  const changeSection = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete(SETUP_PARAM)
    if (value === 'account') params.delete('tab')
    else params.set('tab', value)
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  const hasNotifications = Boolean(profile?.id) && (profile?.role === 'student' || profile?.role === 'tutor' || profile?.role === 'admin')
  const isTutor = profile?.role === 'tutor'
  const menu = SECTIONS.filter(section =>
    (section.value !== 'notifications' || hasNotifications) && (!TUTOR_SECTIONS.includes(section.value) || isTutor))
  const shown = profile && !menu.some(section => section.value === active) ? 'account' : active

  return (
    <SectionLayout title='Profilo' backHref='/' sections={menu} value={shown} onValueChange={changeSection}>
      <div className='space-y-6'>
          {isLoading ? (
            <Skeleton className='h-28' />
          ) : !profile ? (
            <EmptyState>Nessun profilo disponibile.</EmptyState>
          ) : shown === 'account' ? (
            <>
              <div className='flex items-center gap-4 rounded-lg border bg-card p-4 sm:p-6'>
                <div
                  className='flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-medium text-white'
                  style={{ backgroundImage: avatarGradient(profile.email) }}
                >
                  {initials || '?'}
                </div>
                <div className='min-w-0 flex-1'>
                  <p className='text-xl font-medium break-words'>{profile.firstName} {profile.lastName}</p>
                  <p className='truncate text-sm text-muted-foreground'>
                    {[roleLabel, schoolClass, profile.email].filter(Boolean).join(' · ')}
                  </p>
                  {profile.role === 'student' && <LessonHoursBadge tokens={profile.lessonTokens} className='mt-2 text-sm' />}
                </div>
              </div>

              <section className='space-y-4 rounded-lg border bg-card p-4 sm:p-6'>
                <div className='space-y-1'>
                  <h2 className='text-lg font-semibold'>Dati personali</h2>
                  {isLimited && (
                    <p className='text-sm text-muted-foreground'>
                      Per la tua sicurezza, alcuni dati non sono modificabili in autonomia. Se noti qualche errore,
                      contattaci a{' '}
                      <a href='mailto:iepf@hensemberger.it' className='underline underline-offset-4'>iepf@hensemberger.it</a>.
                    </p>
                  )}
                </div>
                <form id='profile-form' onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
                  <div className='grid gap-4 sm:grid-cols-2'>
                    <Controller
                      name='firstName'
                      control={form.control}
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor='profile-first-name'>Nome</FieldLabel>
                          <Input
                            {...field}
                            id='profile-first-name'
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
                          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                        </Field>
                      )}
                    />
                    <Controller
                      name='lastName'
                      control={form.control}
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor='profile-last-name'>Cognome</FieldLabel>
                          <Input
                            {...field}
                            id='profile-last-name'
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
                          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                        </Field>
                      )}
                    />
                  </div>
                  <div className='grid gap-4 sm:grid-cols-2'>
                    <Controller
                      name='email'
                      control={form.control}
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor='profile-email'>Email</FieldLabel>
                          <Input
                            {...field}
                            id='profile-email'
                            aria-invalid={fieldState.invalid}
                            autoComplete='email'
                            disabled={isLimited}
                            onBlur={(event) => {
                              field.onBlur()
                              const normalized = normalizeEmail(event.target.value)
                              form.setValue('email', normalized, {
                                shouldDirty: normalized !== field.value
                              })
                            }}
                          />
                          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                        </Field>
                      )}
                    />
                    {isLimited && (
                      <Field>
                        <FieldLabel>Classe</FieldLabel>
                        <Input value={isLoadingSections ? 'Caricamento...' : (schoolClass ?? 'N/D')} disabled readOnly />
                      </Field>
                    )}
                  </div>
                  <div className={cn('flex justify-end', STICKY_SECTION_FOOTER)}>
                    <Button type='submit' className='w-full sm:w-auto' disabled={isSubmitting || !canSave}>
                      {isSubmitting ? 'Salvataggio...' : 'Salva modifiche'}
                    </Button>
                  </div>
                </form>
              </section>
            </>
          ) : shown === 'availability' ? (
            <TutorAvailabilitySettings />
          ) : shown === 'subjects' ? (
            <TutorSubjectsSettings />
          ) : shown === 'security' ? (
              <section className='flex flex-col gap-4 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6'>
                <div className='space-y-1'>
                  <h2 className='text-lg font-semibold'>Password</h2>
                  <p className='text-sm text-muted-foreground'>
                    Ti mandiamo per email un link per sceglierne una nuova. Resti connesso su questo dispositivo.
                  </p>
                </div>
                <Button
                  type='button'
                  variant='outline'
                  className='w-full shrink-0 sm:w-auto'
                  onClick={handlePasswordReset}
                  disabled={resetRequest.isPending || !profile.email}
                >
                  <KeyRound className='h-4 w-4' />
                  {resetRequest.isPending ? 'Invio in corso...' : 'Cambia password'}
                </Button>
              </section>
          ) : profile.id && (profile.role === 'student' || profile.role === 'tutor' || profile.role === 'admin') && (
            <NotificationSettings role={profile.role} userId={profile.id} />
          )}
      </div>

      <AlertDialog open={showEmailAlert} onOpenChange={setShowEmailAlert}>
        <AlertDialogContent className='z-60'>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma modifica email</AlertDialogTitle>
            <AlertDialogDescription>
              Se l&apos;email inserita è errata, potresti perdere l&apos;accesso
              al tuo account.
              <br />
              In caso di problemi, contatta l&apos;amministratore di sistema.
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
                await submitProfile(pendingValues)
                setPendingValues(null)
              }}
            >
              Aggiorna
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionLayout>
  )
}
