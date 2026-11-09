'use client'

import { STICKY_CARD_FOOTER } from '@/components/sticky-footer'
import { cn } from '@/lib/utils'
import { BlockSkeleton } from '@/components/loading'
import * as React from 'react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { History, Hourglass, TriangleAlert, UserRound } from 'lucide-react'

import { AdminStudentHours } from '@/components/admin-student-hours'
import { AdminUserLessons } from '@/components/admin-user-lessons'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { ActivationAction } from '@/components/activation-action'
import { DangerAction, DangerZone } from '@/components/danger-zone'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import * as z from 'zod'
import { toast } from 'sonner'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch, jsonBody } from '@/lib/api-fetch'
import { useDeleteUser } from '@/lib/use-delete-user'

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
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { extractPayloadArray } from '@/lib/backend-response'
import { formatItalianDate } from '@/lib/format-date'
import { STUDENT_YEARS } from '@/lib/school-years'

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
  sectionId: z.uuid('La sezione e obbligatoria')
})

type StudentFormValues = z.infer<typeof formSchema>

type Section = {
  id: string
  name: string
}

type Student = {
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
  lessonTokens?: number | null
}

const SECTIONS = [
  { value: 'account', label: 'Dati', icon: UserRound },
  { value: 'hours', label: 'Ore di lezione', icon: Hourglass },
  { value: 'lessons', label: 'Storico lezioni', icon: History },
  { value: 'danger', label: 'Danger zone', icon: TriangleAlert, separatorBefore: true }
] as const

// Stable while the sections load, so the grouped lists are not rebuilt on every render.
const noSections: Section[] = []

export default function AdminStudentDetailPage() {
  const params = useParams()
  const studentId = String(params?.id ?? '')
  const tab = useSearchParams().get('tab')
  const here = useHere()
  const backHref = useBackHref('/admin/students')
  const setParam = useSetParam()
  const active = tab === 'hours' || tab === 'lessons' || tab === 'danger' ? tab : 'account'

  const queryClient = useQueryClient()
  const [showEmailAlert, setShowEmailAlert] = React.useState(false)
  const [pendingValues, setPendingValues] =
    React.useState<StudentFormValues | null>(null)
  const [showDeleteAlert, setShowDeleteAlert] = React.useState(false)

  const { data: student = null, isPending: isLoading } = useQuery({
    queryKey: ['users', studentId],
    queryFn: () => apiFetch<Student>(`/api/users/${studentId}`, 'Impossibile recuperare lo studente.'),
    enabled: Boolean(studentId)
  })
  const { data: sections = noSections } = useQuery({
    queryKey: ['class-sections'],
    queryFn: async () => extractPayloadArray<Section>(await apiFetch('/api/class-sections', 'Impossibile recuperare le sezioni.'))
  })

  const form = useForm<StudentFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      year: '',
      sectionId: ''
    },
    // Follows the loaded student; what the admin is typing stays when it reloads.
    values: student
      ? {
          firstName: student.firstName ?? '',
          lastName: student.lastName ?? '',
          email: student.email ?? '',
          year: student.year ? String(student.year) : '',
          sectionId: student.sectionId ?? ''
        }
      : undefined,
    resetOptions: { keepDirtyValues: true }
  })

  const watchedEmail = form.watch('email')
  const emailChanged = React.useMemo(() => {
    if (!student) {
      return false
    }
    return (
      normalizeEmail(watchedEmail ?? '') !== normalizeEmail(student.email ?? '')
    )
  }, [student, watchedEmail])

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

  const updateStudent = useMutation({
    mutationFn: (values: StudentFormValues) => apiFetch(
      `/api/users/${studentId}`,
      'Impossibile aggiornare lo studente.',
      jsonBody('PATCH', {
        firstName: normalizeName(values.firstName),
        lastName: normalizeName(values.lastName),
        email: normalizeEmail(values.email),
        year: Number(values.year),
        sectionId: values.sectionId
      })
    ),
    onSuccess: (_, values) => {
      toast.success('Studente aggiornato.')
      form.reset(values)
      return queryClient.invalidateQueries({ queryKey: ['users'] })
    }
  })
  const isSubmitting = updateStudent.isPending
  const submitStudent = (values: StudentFormValues) => updateStudent.mutateAsync(values).catch(() => {})

  async function onSubmit(values: StudentFormValues) {
    if (!form.formState.isDirty) {
      toast.error('Nessuna modifica da salvare.')
      return
    }

    if (emailChanged) {
      setPendingValues(values)
      setShowEmailAlert(true)
      return
    }

    await submitStudent(values)
  }

  const { remove, isDeleting } = useDeleteUser(studentId, 'Impossibile eliminare lo studente.', '/admin/students')
  // Returns the error to show in the dialog (a wrong password), or null.
  async function handleDelete(password: string): Promise<string | null> {
    const wrongPassword = await remove(password)
    if (!wrongPassword) setShowDeleteAlert(false)
    return wrongPassword
  }

  // A full reload: nothing of the admin's session may stay in memory.
  const impersonate = useMutation({
    mutationFn: () => apiFetch<{ impersonatedUser?: { role?: string } }>(
      '/api/admin/impersonate',
      "Impossibile avviare l'impersonazione.",
      jsonBody('POST', { userId: studentId })
    ),
    onSuccess: (payload) => {
      window.location.href = payload.impersonatedUser?.role === 'tutor' ? '/tutor' : '/student'
    }
  })
  const isImpersonating = impersonate.isPending
  const handleImpersonate = () => {
    if (studentId) impersonate.mutate()
  }

  const changeSection = (value: string) => setParam('tab', value === 'account' ? null : value)

  return (
    <SectionLayout
      title={
        student
          ? `${student.firstName} ${student.lastName}`
          : 'Dettagli studente'
      }
      description={student?.email ?? 'Gestisci i dati dello studente.'}
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
            {isImpersonating ? 'Accesso...' : 'Impersona studente'}
          </Button>
          <Button asChild variant='outline'>
            <Link
              href={withFrom(`/admin/feedback?feedbackAuthor=${studentId}&feedbackRole=student`, here)}
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
            ) : !student ? (
              <p className='text-sm text-muted-foreground'>
                Studente non trovato.
              </p>
            ) : (
              <form
                id='admin-student-form'
                onSubmit={form.handleSubmit(onSubmit)}
                className='space-y-6'
              >
                <FieldGroup>
                  <Controller
                    name='firstName'
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor='student-first-name'>
                          Nome
                        </FieldLabel>
                        <Input
                          {...field}
                          id='student-first-name'
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
                        <FieldLabel htmlFor='student-last-name'>
                          Cognome
                        </FieldLabel>
                        <Input
                          {...field}
                          id='student-last-name'
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
                        <FieldLabel htmlFor='student-email'>Email</FieldLabel>
                        <Input
                          {...field}
                          id='student-email'
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
                        <FieldLabel htmlFor='student-year'>Anno</FieldLabel>
                        <Select
                          onValueChange={(value) => field.onChange(value)}
                          value={String(field.value)}
                        >
                          <SelectTrigger
                            id='student-year'
                            aria-invalid={fieldState.invalid}
                          >
                            <SelectValue placeholder="Seleziona l'anno" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectLabel>Anno</SelectLabel>
                              {STUDENT_YEARS.map((year) => (
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
                        <FieldLabel htmlFor='student-section'>
                          Sezione
                        </FieldLabel>
                        <Select
                          onValueChange={(value) => field.onChange(value)}
                          value={String(field.value)}
                        >
                          <SelectTrigger
                            id='student-section'
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
                  <Field>
                    <FieldLabel>Ore di lezione rimanenti</FieldLabel>
                    <div className='text-sm text-muted-foreground'>
                      {student.lessonTokens ?? '-'}
                    </div>
                  </Field>
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
                          {student?.id ?? '-'}
                        </div>
                        <div>
                          <span className='font-medium text-foreground'>
                            Ruolo:
                          </span>{' '}
                          {student?.role ?? '-'}
                        </div>
                        <div>
                          <span className='font-medium text-foreground'>
                            Email verificata:
                          </span>{' '}
                          {formatItalianDate(student?.emailVerifiedAt)}
                        </div>
                        <div>
                          <span className='font-medium text-foreground'>
                            Creato il:
                          </span>{' '}
                          {formatItalianDate(student?.createdAt)}
                        </div>
                        <div>
                          <span className='font-medium text-foreground'>
                            Aggiornato il:
                          </span>{' '}
                          {formatItalianDate(student?.updatedAt)}
                        </div>
                        <div>
                          <span className='font-medium text-foreground'>
                            Section ID:
                          </span>{' '}
                          {student?.sectionId ?? '-'}
                        </div>
                        <div>
                          <span className='font-medium text-foreground'>
                            Anno:
                          </span>{' '}
                          {student?.year ?? '-'}
                        </div>
                        <div>
                          <span className='font-medium text-foreground'>
                            Attivo:
                          </span>{' '}
                          {student?.isActive ? 'Si' : 'No'}
                        </div>
                        <div>
                          <span className='font-medium text-foreground'>
                            Ore di lezione rimanenti:
                          </span>{' '}
                          {student?.lessonTokens ?? '-'}
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
              form='admin-student-form'
              disabled={isSubmitting || !form.formState.isDirty}
            >
              {isSubmitting ? 'Salvataggio...' : 'Salva modifiche'}
            </Button>
          </CardFooter>
        </Card>
      )}
      {active === 'hours' && studentId && (
        <AdminStudentHours studentId={studentId} />
      )}

      <AlertDialog open={showEmailAlert} onOpenChange={setShowEmailAlert}>
        <AlertDialogContent className='z-60'>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma modifica email</AlertDialogTitle>
            <AlertDialogDescription>
              Se l&apos;email inserita è errata, lo studente potrebbe perdere
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
                await submitStudent(pendingValues)
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
        title='Eliminare lo studente?'
        description='Lo studente perde l’accesso e l’account viene eliminato. Non si può annullare.'
        onConfirm={handleDelete}
      />
      {active === 'lessons' && studentId && (
        <AdminUserLessons role='student' userId={studentId} />
      )}
      {active === 'danger' && (
        <DangerZone>
          {student && (
            <ActivationAction
              userId={studentId}
              isActive={student.isActive === true}
              who='Lo studente'
            />
          )}
          <DangerAction
            title='Elimina account'
            description='Lo studente perde l’accesso e l’account viene eliminato. Non si può annullare.'
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
