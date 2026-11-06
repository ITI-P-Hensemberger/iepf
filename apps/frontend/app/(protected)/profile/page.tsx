'use client'

import * as React from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm, useWatch } from 'react-hook-form'
import * as z from 'zod'
import { KeyRound } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { LessonHoursBadge } from '@/components/lesson-hours-badge'
import { BackButton } from '@/components/back-button'
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
import { logout } from '@/lib/auth-client'

import { extractPayloadArray } from '@/lib/backend-response'
import { NotificationSettings } from '@/components/notification-settings'
import { avatarGradient } from '@/lib/avatar'
import { classLabel } from '@/lib/class-label'
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

function parseErrorMessage(raw: unknown, fallback: string) {
  if (raw instanceof Error) {
    try {
      const parsed = JSON.parse(raw.message) as {
        message?: string
        error?: { issues?: Array<{ message?: string }> }
      }
      return parsed.message ?? parsed.error?.issues?.[0]?.message ?? fallback
    } catch {
      return raw.message || fallback
    }
  }

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as {
        message?: string
        error?: { issues?: Array<{ message?: string }> }
      }
      return parsed.message ?? parsed.error?.issues?.[0]?.message ?? fallback
    } catch {
      return raw || fallback
    }
  }

  return fallback
}

function extractMessageFromResponse(raw: string | null, fallback: string) {
  if (!raw) {
    return fallback
  }
  try {
    const payload = JSON.parse(raw) as {
      message?: string
      error?: { issues?: Array<{ message?: string }> }
      success?: boolean
    }
    return payload.message ?? payload.error?.issues?.[0]?.message ?? fallback
  } catch {
    return raw || fallback
  }
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

export default function ProfilePage() {
  const { profile, isLoading, error, refresh } = useSession()
  const isAdmin = profile?.role === 'admin'
  const isLimited = !isAdmin
  const [sectionName, setSectionName] = React.useState<string | null>(null)
  const [sections, setSections] = React.useState<Section[]>([])
  const [isLoadingSections, setIsLoadingSections] = React.useState(true)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [resetStatus, setResetStatus] = React.useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
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
    }
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

  React.useEffect(() => {
    if (!profile) {
      return
    }

    form.reset({
      firstName: profile.firstName ?? '',
      lastName: profile.lastName ?? '',
      email: profile.email ?? '',
      year: profile.year ? String(profile.year) : '',
      sectionId: profile.sectionId ?? ''
    })
  }, [form, profile])

  React.useEffect(() => {
    if (isAdmin) {
      setSections([])
      setIsLoadingSections(false)
      return
    }

    let isMounted = true

    async function loadSections() {
      setIsLoadingSections(true)

      try {
        const response = await fetch('/api/class-sections', {
          cache: 'no-store'
        })
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
      } finally {
        if (isMounted) {
          setIsLoadingSections(false)
        }
      }
    }

    void loadSections()

    return () => {
      isMounted = false
    }
  }, [isAdmin])

  React.useEffect(() => {
    if (!profile?.sectionId) {
      setSectionName(null)
      return
    }

    const match = sections.find((section) => section.id === profile.sectionId)
    setSectionName(match?.name ?? null)
  }, [profile?.sectionId, sections])

  React.useMemo(() => {
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

  async function submitProfile(values: ProfileFormValues) {
    setIsSubmitting(true)

    try {
      const normalizedFirstName = normalizeName(values.firstName)
      const normalizedLastName = normalizeName(values.lastName)
      const normalizedEmail = normalizeEmail(values.email)

      const payload = isAdmin
        ? {
            firstName: normalizedFirstName,
            lastName: normalizedLastName,
            email: normalizedEmail
          }
        : {
            firstName: normalizedFirstName,
            lastName: normalizedLastName
          }

      const response = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      const raw = await response.text()

      if (!response.ok) {
        throw new Error(
          extractMessageFromResponse(raw, 'Impossibile aggiornare il profilo.')
        )
      }

      if (raw) {
        try {
          const parsed = JSON.parse(raw) as {
            success?: boolean
            message?: string
            error?: { issues?: Array<{ message?: string }> }
          }
          if (parsed?.success === false) {
            throw new Error(
              extractMessageFromResponse(
                raw,
                'Impossibile aggiornare il profilo.'
              )
            )
          }
        } catch {
          // ignore non-JSON bodies
        }
      }

      toast.success('Profilo aggiornato con successo.')
      await refresh()
      window.location.reload()
    } catch (err) {
      toast.error(parseErrorMessage(err, 'Impossibile aggiornare il profilo.'))
    } finally {
      setIsSubmitting(false)
    }
  }

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

  async function handlePasswordReset() {
    if (!profile?.email) {
      setResetStatus('error')
      toast.error('Email non disponibile.')
      return
    }

    setResetStatus('loading')

    try {
      const response = await fetch('/api/auth/password/reset/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: profile.email })
      })

      if (!response.ok) {
        let message = 'Impossibile inviare la mail di reset.'
        try {
          const raw = await response.text()
          if (raw) {
            try {
              const payload = JSON.parse(raw) as {
                message?: string
                error?: { issues?: Array<{ message?: string }> }
              }
              message =
                payload.message ??
                payload.error?.issues?.[0]?.message ??
                message
            } catch {
              message = raw
            }
          }
        } catch {
          message = 'Impossibile inviare la mail di reset.'
        }
        throw new Error(message)
      }

      setResetStatus('success')
      toast.success('Mail di reset inviata. Controlla la tua casella.')
      await logout()
    } catch (err) {
      setResetStatus('error')
      toast.error(
        parseErrorMessage(err, 'Impossibile inviare la mail di reset.')
      )
    }
  }

  const roleLabel = ROLE_LABELS[profile?.role ?? ''] ?? ''
  const initials = `${profile?.firstName?.charAt(0) ?? ''}${profile?.lastName?.charAt(0) ?? ''}`.toUpperCase()
  const schoolClass = isLimited && !isLoadingSections ? classLabel(profile?.year, sectionName) : null

  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10'>
        <div className='mx-auto max-w-3xl space-y-6'>
          <div>
            <BackButton href='/' />
          </div>

          {isLoading ? (
            <Skeleton className='h-28' />
          ) : !profile ? (
            <p className='rounded-lg border bg-card px-4 py-6 text-sm text-muted-foreground'>Nessun profilo disponibile.</p>
          ) : (
            <>
              <div className='flex flex-wrap items-center gap-4 rounded-lg border bg-card p-4 sm:p-6'>
                <div
                  className='flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-medium text-white'
                  style={{ backgroundImage: avatarGradient(profile.email) }}
                >
                  {initials || '?'}
                </div>
                <div className='min-w-0 flex-1'>
                  <h1 className='text-2xl'>{profile.firstName} {profile.lastName}</h1>
                  <p className='truncate text-sm text-muted-foreground'>
                    {[roleLabel, schoolClass, profile.email].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {profile.role === 'student' && <LessonHoursBadge tokens={profile.lessonTokens} className='text-sm' />}
              </div>

              <section className='space-y-4 rounded-lg border bg-card p-4 sm:p-6'>
                <div className='space-y-1'>
                  <h2 className='text-lg font-semibold'>Dati personali</h2>
                  {isLimited && (
                    <p className='text-sm text-muted-foreground'>
                      Se la classe o l&apos;email sono sbagliate scrivici a{' '}
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
                  <div className='flex justify-end'>
                    <Button type='submit' className='w-full sm:w-auto' disabled={isSubmitting || !canSave}>
                      {isSubmitting ? 'Salvataggio...' : 'Salva modifiche'}
                    </Button>
                  </div>
                </form>
              </section>

              <section className='flex flex-col gap-4 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6'>
                <div className='space-y-1'>
                  <h2 className='text-lg font-semibold'>Password</h2>
                  <p className='text-sm text-muted-foreground'>
                    Ti mandiamo per email un link per sceglierne una nuova; intanto esci dall&apos;account.
                  </p>
                </div>
                <Button
                  type='button'
                  variant='outline'
                  className='w-full shrink-0 sm:w-auto'
                  onClick={handlePasswordReset}
                  disabled={resetStatus === 'loading' || !profile.email}
                >
                  <KeyRound className='h-4 w-4' />
                  {resetStatus === 'loading' ? 'Invio in corso...' : 'Cambia password'}
                </Button>
              </section>

              {profile.id && (profile.role === 'student' || profile.role === 'tutor' || profile.role === 'admin') && (
                <NotificationSettings role={profile.role} userId={profile.id} />
              )}
            </>
          )}
        </div>
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
    </main>
  )
}
