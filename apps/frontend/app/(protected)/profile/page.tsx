'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm, useWatch } from 'react-hook-form'
import * as z from 'zod'

import { Button } from '@/components/ui/button'
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
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useSession } from '@/lib/use-session'

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
    } catch (err) {
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
    } catch (err) {
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
  } catch (err) {
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

export default function ProfilePage() {
  const { profile, isLoading, error, refresh } = useSession()
  const router = useRouter()
  const isAdmin = profile?.role === 'admin'
  const isLimited = !isAdmin
  const [sectionName, setSectionName] = React.useState<string | null>(null)
  const [sections, setSections] = React.useState<Section[]>([])
  const [sectionsError, setSectionsError] = React.useState<string | null>(null)
  const [isLoadingSections, setIsLoadingSections] = React.useState(true)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [submitError, setSubmitError] = React.useState<string | null>(null)
  const [isSuccess, setIsSuccess] = React.useState(false)
  const [resetStatus, setResetStatus] = React.useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [resetMessage, setResetMessage] = React.useState<string | null>(null)
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
      setSectionsError(null)
      setIsLoadingSections(false)
      return
    }

    let isMounted = true

    async function loadSections() {
      setIsLoadingSections(true)
      setSectionsError(null)

      try {
        const response = await fetch('/api/class-sections', {
          cache: 'no-store'
        })
        if (!response.ok) {
          throw new Error('Impossibile recuperare le sezioni.')
        }
        const data = (await response.json()) as Section[]
        if (isMounted) {
          setSections(data)
        }
      } catch (err) {
        if (isMounted) {
          setSectionsError(
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
        throw new Error(extractMessageFromResponse(raw, 'Impossibile aggiornare il profilo.'))
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
              extractMessageFromResponse(raw, 'Impossibile aggiornare il profilo.')
            )
          }
        } catch (err) {
          // ignore non-JSON bodies
        }
      }

      setIsSuccess(true)
      await refresh()
      window.location.reload()
    } catch (err) {
      setSubmitError(parseErrorMessage(err, 'Impossibile aggiornare il profilo.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function onSubmit(values: ProfileFormValues) {
    setSubmitError(null)
    setIsSuccess(false)

    if (!canSave) {
      setSubmitError('Nessuna modifica da salvare.')
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
      setResetMessage('Email non disponibile.')
      return
    }

    setResetStatus('loading')
    setResetMessage(null)

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
                payload.message ?? payload.error?.issues?.[0]?.message ?? message
            } catch (err) {
              message = raw
            }
          }
        } catch (err) {
          message = 'Impossibile inviare la mail di reset.'
        }
        throw new Error(message)
      }

      setResetStatus('success')
      setResetMessage('Mail di reset inviata. Controlla la tua casella.')
    } catch (err) {
      setResetStatus('error')
      setResetMessage(parseErrorMessage(err, 'Impossibile inviare la mail di reset.'))
    }
  }

  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10'>
        <div className='mx-auto max-w-2xl'>
          <h1 className='text-2xl'>Profilo</h1>
          <p className='mt-2 text-muted-foreground'>
            Aggiorna i tuoi dati personali.
          </p>
          {isLimited && (
            <p className='mt-2 text-sm text-muted-foreground'>
              Se la classe o la mail sono errate, contattaci a{' '}
              <a href='mailto:iepf@hensemberger.it' className='underline'>
                iepf@hensemberger.it
              </a>
              .
            </p>
          )}
          <Card className='mt-6'>
            <CardContent className='pt-6'>
              {isLoading ? (
                <p className='text-sm text-muted-foreground'>
                  Caricamento profilo...
                </p>
              ) : error ? (
                <p className='text-sm text-destructive'>{error}</p>
              ) : profile ? (
                <form
                  id='profile-form'
                  onSubmit={form.handleSubmit(onSubmit)}
                  className='space-y-6'
                >
                  <FieldGroup>
                    <Controller
                      name='firstName'
                      control={form.control}
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor='profile-first-name'>
                            Nome
                          </FieldLabel>
                          <Input
                            {...field}
                            id='profile-first-name'
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
                          <FieldLabel htmlFor='profile-last-name'>
                            Cognome
                          </FieldLabel>
                          <Input
                            {...field}
                            id='profile-last-name'
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
                          <FieldLabel htmlFor='profile-email'>Email</FieldLabel>
                          <Input
                            {...field}
                            id='profile-email'
                            aria-invalid={fieldState.invalid}
                            autoComplete='email'
                            disabled={isLimited}
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
                    {isLimited && (
                      <Field>
                        <FieldLabel>Classe</FieldLabel>
                        <div className='text-sm text-muted-foreground'>
                          {isLoadingSections
                            ? 'Caricamento...'
                            : `${profile?.year ? String(profile.year) : 'N/D'}${sectionName ?? profile?.sectionId ?? 'N/D'}`}
                        </div>
                        {sectionsError && (
                          <p className='text-sm text-destructive'>
                            {sectionsError}
                          </p>
                        )}
                      </Field>
                    )}
                  </FieldGroup>
                  {submitError && (
                    <p className='text-sm text-destructive'>{submitError}</p>
                  )}
                  {isSuccess && (
                    <p className='text-sm text-emerald-600'>
                      Profilo aggiornato con successo.
                    </p>
                  )}
                </form>
              ) : (
                <p className='text-sm text-muted-foreground'>
                  Nessun profilo disponibile.
                </p>
              )}
            </CardContent>
            <CardFooter className='flex flex-col gap-3 items-start'>
              {profile && (
                <Button
                  type='submit'
                  form='profile-form'
                  disabled={isSubmitting || !canSave}
                >
                  {isSubmitting ? 'Salvataggio...' : 'Salva modifiche'}
                </Button>
              )}
              <Button
                type='button'
                variant='outline'
                onClick={handlePasswordReset}
                disabled={resetStatus == 'loading' || !profile?.email}
              >
                {resetStatus == 'loading'
                  ? 'Invio in corso...'
                  : 'Richiedi reset password'}
              </Button>
              {resetMessage && (
                <p
                  className={
                    resetStatus == 'success'
                      ? 'text-sm text-emerald-600'
                      : 'text-sm text-destructive'
                  }
                >
                  {resetMessage}
                </p>
              )}
            </CardFooter>
          </Card>
        </div>
      </div>

      <AlertDialog open={showEmailAlert} onOpenChange={setShowEmailAlert}>
        <AlertDialogContent className='z-60'>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma modifica email</AlertDialogTitle>
            <AlertDialogDescription>
              Se l'email inserita è errata, potresti perdere l'accesso al tuo
              account.
              <br />
              In caso di problemi, contatta l'amministratore di sistema.
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
