'use client'

import { STICKY_CARD_FOOTER } from '@/components/sticky-footer'
import { cn } from '@/lib/utils'
import { BlockSkeleton } from '@/components/loading'
import * as React from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { TriangleAlert, UserRound } from 'lucide-react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import * as z from 'zod'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { ActivationAction } from '@/components/activation-action'
import { DangerAction, DangerZone } from '@/components/danger-zone'
import { SectionLayout } from '@/components/section-layout'
import { useBackHref, useSetParam } from '@/lib/back-link'
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
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
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
  email: z.string().email('Indirizzo email non valido')
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

const SECTIONS = [
  { value: 'account', label: 'Dati', icon: UserRound },
  { value: 'danger', label: 'Danger zone', icon: TriangleAlert, separatorBefore: true }
] as const

export default function AdminAdminDetailPage() {
  const params = useParams()
  const backHref = useBackHref('/admin/admins')
  const setParam = useSetParam()
  const active = useSearchParams().get('tab') === 'danger' ? 'danger' : 'account'
  const router = useRouter()
  const adminId = String(params?.id ?? '')

  const [admin, setAdmin] = React.useState<Admin | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
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
      email: ''
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
            email: data.email ?? ''
          })
        }
      } catch (err) {
        if (isMounted) {
          toast.error(
            err instanceof Error
              ? err.message
              : "Impossibile recuperare l'admin."
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
          email: normalizedEmail
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

      toast.success('Admin aggiornato.')
      setAdmin((prev) =>
        prev
          ? {
              ...prev,
              firstName: normalizedFirstName,
              lastName: normalizedLastName,
              email: normalizedEmail
            }
          : prev
      )
      form.reset(values)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Impossibile aggiornare l'admin."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function onSubmit(values: AdminFormValues) {
    if (!form.formState.isDirty) {
      toast.error('Nessuna modifica da salvare.')
      return
    }

    if (emailChanged) {
      setPendingValues(values)
      setShowEmailAlert(true)
      return
    }

    await submitAdmin(values)
  }

  // Returns the error to show in the dialog (a wrong password), or null.
  async function handleDelete(password: string): Promise<string | null> {
    if (!adminId) {
      return null
    }
    setIsDeleting(true)
    try {
      const response = await fetch(`/api/users/${adminId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      })
      if (response.status === 403) {
        return 'Password non corretta.'
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { message?: string } | null
        throw new Error(payload?.message ?? "Impossibile eliminare l'admin.")
      }
      setShowDeleteAlert(false)
      router.push('/admin/admins')
      return null
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossibile eliminare l'admin.")
      setShowDeleteAlert(false)
      return null
    } finally {
      setIsDeleting(false)
    }
  }

  const changeSection = (value: string) => setParam('tab', value === 'account' ? null : value)

  return (
    <SectionLayout
      title={admin ? `${admin.firstName} ${admin.lastName}` : 'Dettagli admin'}
      description={admin?.email ?? 'Gestisci i dati dell’admin.'}
      backHref={backHref}
      sections={SECTIONS}
      value={active}
      onValueChange={changeSection}
    >
          {active === 'account' && (
          <Card>
            <CardContent className='pt-6'>
              {isLoading ? (
                <BlockSkeleton />
              ) : !admin ? (
                <p className='text-sm text-muted-foreground'>
                  Admin non trovato.
                </p>
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
            <CardFooter className={cn('flex justify-end', STICKY_CARD_FOOTER)}>
              <Button
                type='submit'
                form='admin-admin-form'
                disabled={isSubmitting || !form.formState.isDirty}
              >
                {isSubmitting ? 'Salvataggio...' : 'Salva modifiche'}
              </Button>
            </CardFooter>
          </Card>
          )}
          {active === 'danger' && (
            <DangerZone>
              {admin && (
                <ActivationAction
                  userId={adminId}
                  isActive={admin.isActive === true}
                  who='L’admin'
                  onChange={isActive => setAdmin(prev => (prev ? { ...prev, isActive } : prev))}
                />
              )}
              <DangerAction
                title='Elimina account'
                description='L’admin perde l’accesso e l’account viene eliminato. Non si può annullare.'
                action={
                  <Button variant='destructive' onClick={() => setShowDeleteAlert(true)} disabled={isDeleting}>
                    {isDeleting ? 'Eliminazione...' : 'Elimina account'}
                  </Button>
                }
              />
            </DangerZone>
          )}

      <AlertDialog open={showEmailAlert} onOpenChange={setShowEmailAlert}>
        <AlertDialogContent className='z-60'>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma modifica email</AlertDialogTitle>
            <AlertDialogDescription>
              Se l&apos;email inserita è errata, l&apos;admin potrebbe perdere l&apos;accesso
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

      <ConfirmDeleteDialog
        open={showDeleteAlert}
        onOpenChange={setShowDeleteAlert}
        title='Eliminare l’admin?'
        description='L’admin perde l’accesso e l’account viene eliminato. Non si può annullare.'
        onConfirm={handleDelete}
      />
    </SectionLayout>
  )
}
