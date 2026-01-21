'use client'

import * as React from 'react'
import { useParams, useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import * as z from 'zod'

import { Button } from '@/components/ui/button'
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
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  isActive: z.boolean()
})

type AdminFormValues = z.infer<typeof formSchema>

type Admin = {
  id: string
  email: string
  firstName: string
  lastName: string
  role?: string | null
  emailVerifiedAt?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  isActive?: boolean | null
}

export default function AdminAdminDetailPage() {
  const params = useParams()
  const router = useRouter()
  const adminId = String(params?.id ?? '')

  const [admin, setAdmin] = React.useState<Admin | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [submitError, setSubmitError] = React.useState<string | null>(null)
  const [isSuccess, setIsSuccess] = React.useState(false)
  const [showEmailAlert, setShowEmailAlert] = React.useState(false)
  const [pendingValues, setPendingValues] =
    React.useState<AdminFormValues | null>(null)
  const [showDeleteAlert, setShowDeleteAlert] = React.useState(false)
  const [isDeleting, setIsDeleting] = React.useState(false)

  const form = useForm<AdminFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      isActive: false
    }
  })

  const watchedEmail = form.watch('email')
  const emailChanged = React.useMemo(() => {
    if (!admin) {
      return false
    }
    return normalizeEmail(watchedEmail ?? '') !== normalizeEmail(admin.email)
  }, [admin, watchedEmail])

  React.useEffect(() => {
    let isMounted = true

    async function loadAdmin() {
      setIsLoading(true)
      setSubmitError(null)
      setIsSuccess(false)

      try {
        const response = await fetch(`/api/users/${adminId}`)
        if (!response.ok) {
          throw new Error("Impossibile recuperare l'admin.")
        }
        const data = (await response.json()) as Admin
        if (isMounted) {
          setAdmin(data)
          form.reset({
            firstName: data.firstName ?? '',
            lastName: data.lastName ?? '',
            email: data.email ?? '',
            isActive: data.isActive === true
          })
        }
      } catch (err) {
        if (isMounted) {
          setSubmitError(
            err instanceof Error ? err.message : "Impossibile recuperare l'admin."
          )
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    if (adminId) {
      void loadAdmin()
    }

    return () => {
      isMounted = false
    }
  }, [form, adminId])

  async function submitAdmin(values: AdminFormValues) {
    setIsSubmitting(true)

    try {
      const normalizedFirstName = normalizeName(values.firstName)
      const normalizedLastName = normalizeName(values.lastName)
      const normalizedEmail = normalizeEmail(values.email)

      const response = await fetch(`/api/users/${adminId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          firstName: normalizedFirstName,
          lastName: normalizedLastName,
          email: normalizedEmail,
          isActive: values.isActive
        })
      })

      if (!response.ok) {
        let message = "Impossibile aggiornare l'admin."
        try {
          const payload = (await response.json()) as { message?: string }
          message = payload.message ?? message
        } catch {
          message = "Impossibile aggiornare l'admin."
        }
        throw new Error(message)
      }

      setIsSuccess(true)
      setAdmin((prev) =>
        prev
          ? {
              ...prev,
              firstName: normalizedFirstName,
              lastName: normalizedLastName,
              email: normalizedEmail,
              isActive: values.isActive
            }
          : prev
      )
      form.reset(values)
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Impossibile aggiornare l'admin."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function onSubmit(values: AdminFormValues) {
    setSubmitError(null)
    setIsSuccess(false)

    if (!form.formState.isDirty) {
      setSubmitError('Nessuna modifica da salvare.')
      return
    }

    if (emailChanged) {
      setPendingValues(values)
      setShowEmailAlert(true)
      return
    }

    await submitAdmin(values)
  }

  async function handleDelete() {
    if (!adminId) {
      return
    }
    setIsDeleting(true)
    setSubmitError(null)
    try {
      const response = await fetch(`/api/users/${adminId}`, {
        method: 'DELETE'
      })
      if (!response.ok) {
        let message = "Impossibile eliminare l'admin."
        try {
          const payload = (await response.json()) as { message?: string }
          message = payload.message ?? message
        } catch {
          message = "Impossibile eliminare l'admin."
        }
        throw new Error(message)
      }
      router.push('/admin/admins')
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Impossibile eliminare l'admin."
      )
    } finally {
      setIsDeleting(false)
      setShowDeleteAlert(false)
    }
  }

  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10'>
        <div className='mx-auto max-w-3xl'>
          <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
            <div>
              <h1 className='text-2xl'>Dettagli admin</h1>
              <p className='mt-1 text-sm text-muted-foreground'>
                Gestisci i dati dell&apos;admin.
              </p>
            </div>
            <Button variant='outline' onClick={() => router.push('/admin/admins')}>
              Torna ai admin
            </Button>
          </div>
          <Card className='mt-6'>
            <CardContent className='pt-6'>
              {isLoading ? (
                <p className='text-sm text-muted-foreground'>Caricamento...</p>
              ) : !admin ? (
                <p className='text-sm text-muted-foreground'>Admin non trovato.</p>
              ) : (
                <form
                  id='admin-admin-form'
                  onSubmit={form.handleSubmit(onSubmit)}
                  className='space-y-6'
                >
                  <FieldGroup>
                    <Controller
                      name='firstName'
                      control={form.control}
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor='admin-first-name'>
                            Nome
                          </FieldLabel>
                          <Input
                            {...field}
                            id='admin-first-name'
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
                          <FieldLabel htmlFor='admin-last-name'>
                            Cognome
                          </FieldLabel>
                          <Input
                            {...field}
                            id='admin-last-name'
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
                          <FieldLabel htmlFor='admin-email'>Email</FieldLabel>
                          <Input
                            {...field}
                            id='admin-email'
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
                      name='isActive'
                      control={form.control}
                      render={({ field }) => (
                        <Field orientation='horizontal'>
                          <div className='flex items-center gap-2'>
                            <Checkbox
                              id='admin-active'
                              checked={field.value}
                              onCheckedChange={(value) =>
                                field.onChange(Boolean(value))
                              }
                            />
                            <Label htmlFor='admin-active'>Attivo</Label>
                          </div>
                        </Field>
                      )}
                    />
                  </FieldGroup>
                  {submitError && (
                    <p className='text-sm text-destructive'>{submitError}</p>
                  )}
                  {isSuccess && (
                    <p className='text-sm text-emerald-600'>
                      Admin aggiornato con successo.
                    </p>
                  )}
                  <Accordion type='single' collapsible className='w-full'>
                    <AccordionItem value='tech-details'>
                      <AccordionTrigger>Dettagli tecnici</AccordionTrigger>
                      <AccordionContent>
                        <div className='text-sm text-muted-foreground space-y-2'>
                          <div>
                            <span className='font-medium text-foreground'>
                              ID:
                            </span>{' '}
                            {admin?.id ?? '-'}
                          </div>
                          <div>
                            <span className='font-medium text-foreground'>
                              Ruolo:
                            </span>{' '}
                            {admin?.role ?? '-'}
                          </div>
                          <div>
                            <span className='font-medium text-foreground'>
                              Email verificata:
                            </span>{' '}
                            {formatItalianDate(admin?.emailVerifiedAt)}
                          </div>
                          <div>
                            <span className='font-medium text-foreground'>
                              Creato il:
                            </span>{' '}
                            {formatItalianDate(admin?.createdAt)}
                          </div>
                          <div>
                            <span className='font-medium text-foreground'>
                              Aggiornato il:
                            </span>{' '}
                            {formatItalianDate(admin?.updatedAt)}
                          </div>
                          <div>
                            <span className='font-medium text-foreground'>
                              Attivo:
                            </span>{' '}
                            {admin?.isActive ? 'Si' : 'No'}
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
                form='admin-admin-form'
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
        </div>
      </div>

      <AlertDialog open={showEmailAlert} onOpenChange={setShowEmailAlert}>
        <AlertDialogContent className='z-60'>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma modifica email</AlertDialogTitle>
            <AlertDialogDescription>
              Se l&apos;email inserita e errata, il admin potrebbe perdere l&apos;accesso
              all&apos;account. In caso di problemi, contatta l&apos;amministratore di
              sistema.
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
                await submitAdmin(pendingValues)
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
            <AlertDialogTitle>Eliminare il admin?</AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione e irreversibile. Il admin perdera l&apos;accesso
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
