'use client'

import * as React from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import * as z from 'zod'
import { toast } from 'sonner'

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

export default function AdminStudentDetailPage() {
  const params = useParams()
  const router = useRouter()
  const studentId = String(params?.id ?? '')

  const [student, setStudent] = React.useState<Student | null>(null)
  const [sections, setSections] = React.useState<Section[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [showEmailAlert, setShowEmailAlert] = React.useState(false)
  const [pendingValues, setPendingValues] =
    React.useState<StudentFormValues | null>(null)
  const [showDeleteAlert, setShowDeleteAlert] = React.useState(false)
  const [isDeleting, setIsDeleting] = React.useState(false)

  const form = useForm<StudentFormValues>({
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

  const watchedEmail = form.watch('email')
  const emailChanged = React.useMemo(() => {
    if (!student) {
      return false
    }
    return (
      normalizeEmail(watchedEmail ?? '') !== normalizeEmail(student.email ?? '')
    )
  }, [student, watchedEmail])

  React.useEffect(() => {
    let isMounted = true

    async function loadStudent() {
      setIsLoading(true)

      try {
        const response = await fetch(`/api/users/${studentId}`)
        if (!response.ok) {
          throw new Error('Impossibile recuperare lo studente.')
        }
        const data = (await response.json()) as Student
        if (isMounted) {
          setStudent(data)
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
              : 'Impossibile recuperare lo studente.'
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

    if (studentId) {
      void loadStudent()
      void loadSections()
    }

    return () => {
      isMounted = false
    }
  }, [form, studentId])

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

  async function submitStudent(values: StudentFormValues) {
    setIsSubmitting(true)

    try {
      const normalizedFirstName = normalizeName(values.firstName)
      const normalizedLastName = normalizeName(values.lastName)
      const normalizedEmail = normalizeEmail(values.email)

      const response = await fetch(`/api/users/${studentId}`, {
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
        let message = 'Impossibile aggiornare lo studente.'
        try {
          const payload = (await response.json()) as { message?: string }
          message = payload.message ?? message
        } catch {
          message = 'Impossibile aggiornare lo studente.'
        }
        throw new Error(message)
      }

      toast.success('Studente aggiornato con successo.')
      setStudent((prev) =>
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
        err instanceof Error
          ? err.message
          : 'Impossibile aggiornare lo studente.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

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

  async function handleDelete() {
    if (!studentId) {
      return
    }
    setIsDeleting(true)
    try {
      const response = await fetch(`/api/users/${studentId}`, {
        method: 'DELETE'
      })
      if (!response.ok) {
        let message = 'Impossibile eliminare lo studente.'
        try {
          const payload = (await response.json()) as { message?: string }
          message = payload.message ?? message
        } catch {
          message = 'Impossibile eliminare lo studente.'
        }
        throw new Error(message)
      }
      router.push('/admin/students')
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Impossibile eliminare lo studente.'
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
              <h1 className='text-2xl'>Dettagli studente</h1>
              <p className='mt-1 text-sm text-muted-foreground'>
                Gestisci i dati dello studente.
              </p>
            </div>
            <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
              <Button asChild variant='outline'>
                <Link
                  href={`/admin/feedback?feedbackAuthor=${studentId}&feedbackRole=student`}
                >
                  Feedback
                </Link>
              </Button>
              <Button
                variant='outline'
                onClick={() => router.push('/admin/students')}
              >
                Torna agli studenti
              </Button>
            </div>
          </div>
          <Card className='mt-6'>
            <CardContent className='pt-6'>
              {isLoading ? (
                <p className='text-sm text-muted-foreground'>Caricamento...</p>
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
                                <SelectItem value='1'>1° anno</SelectItem>
                                <SelectItem value='2'>2° anno</SelectItem>
                                <SelectItem value='3'>3° anno</SelectItem>
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
                    <Controller
                      name='isActive'
                      control={form.control}
                      render={({ field }) => (
                        <Field orientation='horizontal'>
                          <div className='flex items-center gap-2'>
                            <Checkbox
                              id='student-active'
                              checked={field.value}
                              onCheckedChange={(value) =>
                                field.onChange(Boolean(value))
                              }
                            />
                            <Label htmlFor='student-active'>Attivo</Label>
                          </div>
                        </Field>
                      )}
                    />
                    <Field>
                      <FieldLabel>Crediti lezione</FieldLabel>
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
                              Crediti lezione:
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
            <CardFooter className='flex flex-col gap-3 items-start sm:flex-row sm:items-center sm:justify-between'>
              <Button
                type='submit'
                form='admin-student-form'
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

      <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
        <AlertDialogContent className='z-60'>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare lo studente?</AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione è irreversibile. Lo studente perderà l&apos;accesso
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
