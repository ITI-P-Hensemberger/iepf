'use client'

import * as React from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import * as z from 'zod'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from '@/components/ui/input-group'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'

import { extractPayloadArray } from '@/lib/backend-response'
const formSchema = z
  .object({
    first_name: z
      .string()
      .trim()
      .min(2, 'Il nome è obbligatorio')
      .regex(/^[\p{L}]+$/u, 'Il nome può contenere solo lettere'),
    last_name: z
      .string()
      .trim()
      .min(2, 'Il cognome è obbligatorio')
      .regex(/^[\p{L}]+$/u, 'Il cognome può contenere solo lettere'),
    year: z.string().min(1, "L'anno è obbligatorio"),
    sectionId: z.uuid('La sezione è obbligatoria'),
    email: z.email('Indirizzo email non valido'),
    password: z
      .string()
      .min(8, 'La password deve contenere almeno 8 caratteri'),
    confirm_password: z
      .string()
      .min(8, 'La conferma della password è obbligatoria'),
    privacyAccepted: z.boolean().refine((value) => value, {
      message:
        "Devi accettare l'Informativa sulla Privacy e Termini e Condizioni"
    })
  })
  .superRefine(({ email }, ctx) => {
    if (!email.toLowerCase().endsWith('@hensemberger.it')) {
      ctx.addIssue({
        code: 'custom',
        path: ['email'],
        message: 'Utilizza la tua mail @hensemberger.it'
      })
    }
  })
  .superRefine(({ password, confirm_password }, ctx) => {
    if (password !== confirm_password) {
      ctx.addIssue({
        code: 'custom',
        path: ['confirm_password'],
        message: 'Le password non corrispondono'
      })
    }
  })

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

type RegistrationFormProps = {
  onSuccess?: () => void
}

export function RegistrationForm({ onSuccess }: RegistrationFormProps) {
  const [showPassword, setShowPassword] = React.useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [isSuccess, setIsSuccess] = React.useState(false)
  const [sections, setSections] = React.useState<
    Array<{ id: string; name: string }>
  >([])
  const [isLoadingSections, setIsLoadingSections] = React.useState(true)
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      year: '',
      sectionId: '',
      email: '',
      password: '',
      confirm_password: '',
      privacyAccepted: false
    }
  })

  const groupedSections = React.useMemo(() => {
    const scient: Array<{ id: string; name: string }> = []
    const mech: Array<{ id: string; name: string }> = []
    const elec: Array<{ id: string; name: string }> = []
    const chem: Array<{ id: string; name: string }> = []
    const info: Array<{ id: string; name: string }> = []

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

    const byName = (a: { name: string }, b: { name: string }) =>
      a.name.localeCompare(b.name, 'it', { sensitivity: 'base' })

    scient.sort(byName)
    mech.sort(byName)
    elec.sort(byName)
    chem.sort(byName)
    info.sort(byName)

    return { scient, mech, elec, chem, info }
  }, [sections])

  React.useEffect(() => {
    let isMounted = true

    async function loadSections() {
      setIsLoadingSections(true)

      try {
        const response = await fetch('/api/class-sections')
        if (!response.ok) {
          throw new Error('Impossibile caricare le sezioni.')
        }
        const payload = await response.json()
        const data = extractPayloadArray<{
          id: string
          name: string
        }>(payload)
        if (isMounted) {
          setSections(data)
        }
      } catch (err) {
        if (isMounted) {
          toast.error(
            err instanceof Error
              ? err.message
              : 'Impossibile caricare le sezioni.'
          )
        }
      } finally {
        if (isMounted) {
          setIsLoadingSections(false)
        }
      }
    }

    loadSections()

    return () => {
      isMounted = false
    }
  }, [])

  async function onSubmit(data: z.infer<typeof formSchema>) {
    setIsSubmitting(true)

    try {
      const normalizedFirstName = normalizeName(data.first_name)
      const normalizedLastName = normalizeName(data.last_name)
      const normalizedEmail = normalizeEmail(data.email)

      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: normalizedEmail,
          firstName: normalizedFirstName,
          lastName: normalizedLastName,
          password: data.password,
          year: Number(data.year),
          sectionId: data.sectionId
        })
      })

      if (!response.ok) {
        let message = 'Si è verificato un errore, riprova.'

        try {
          const payload = (await response.json()) as {
            message?: string
            error?: { issues?: Array<{ message?: string }> }
          }
          message =
            payload.message ?? payload.error?.issues?.[0]?.message ?? message
        } catch {
          message = 'Si è verificato un errore, riprova.'
        }

        throw new Error(message)
      }

      form.reset()
      setShowPassword(false)
      setShowConfirmPassword(false)
      setIsSuccess(true)
      onSuccess?.()
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Si è verificato un errore, riprova.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isSuccess) {
    return (
      <Card className='w-full sm:max-w-md'>
        <CardContent className='pt-6'>
          <div className='flex flex-col gap-3 text-center'>
            <h2 className='text-lg font-semibold'>Controlla la tua email</h2>
            <p className='text-muted-foreground text-sm'>
              Ti abbiamo inviato un link di verifica. Apri la mail per
              completare la registrazione.
            </p>
          </div>
        </CardContent>
        <CardFooter className='justify-center'>
          <Button asChild>
            <Link href='/auth/login'>Vai al login</Link>
          </Button>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card className='w-full sm:max-w-md'>
      <CardContent>
        <form id='registration-form' onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup>
            <Controller
              name='first_name'
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor='registration-form-first_name'>
                    Nome
                  </FieldLabel>
                  <Input
                    {...field}
                    id='registration-form-first_name'
                    aria-invalid={fieldState.invalid}
                    placeholder='Mario'
                    autoComplete='off'
                    onBlur={(event) => {
                      field.onBlur()
                      const normalized = normalizeName(event.target.value)
                      form.setValue('first_name', normalized, {
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
              name='last_name'
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor='registration-form-last_name'>
                    Cognome
                  </FieldLabel>
                  <Input
                    {...field}
                    id='registration-form-last_name'
                    aria-invalid={fieldState.invalid}
                    placeholder='Rossi'
                    autoComplete='off'
                    onBlur={(event) => {
                      field.onBlur()
                      const normalized = normalizeName(event.target.value)
                      form.setValue('last_name', normalized, {
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
                  <FieldLabel htmlFor='registration-form-year'>Anno</FieldLabel>
                  <Select onValueChange={(value) => field.onChange(value)}>
                    <SelectTrigger
                      id='registration-form-year'
                      aria-invalid={fieldState.invalid}
                    >
                      <SelectValue placeholder='Seleziona il tuo anno' />
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
                  <FieldLabel htmlFor='registration-form-sectionId'>
                    Sezione
                  </FieldLabel>
                  <Select
                    onValueChange={(value) => field.onChange(value)}
                    value={String(field.value)}
                  >
                    <SelectTrigger
                      id='registration-form-sectionId'
                      aria-invalid={fieldState.invalid}
                      value={String(field.value)}
                    >
                      <SelectValue placeholder='Seleziona la tua sezione' />
                    </SelectTrigger>
                    <SelectContent>
                      {isLoadingSections && (
                        <SelectGroup>
                          <SelectLabel>Sezioni disponibili</SelectLabel>
                          <SelectItem value='__loading__' disabled>
                            Caricamento...
                          </SelectItem>
                        </SelectGroup>
                      )}
                      {!isLoadingSections && sections.length === 0 && (
                        <SelectGroup>
                          <SelectLabel>Sezioni disponibili</SelectLabel>
                          <SelectItem value='__empty__' disabled>
                            Nessuna sezione disponibile
                          </SelectItem>
                        </SelectGroup>
                      )}
                      {!isLoadingSections &&
                        groupedSections.scient.length > 0 && (
                          <SelectGroup>
                            <SelectLabel>
                              Scientifico Scienze Applicate
                            </SelectLabel>
                            {groupedSections.scient.map((section) => (
                              <SelectItem key={section.id} value={section.id}>
                                {section.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        )}
                      {!isLoadingSections &&
                        groupedSections.mech.length > 0 && (
                          <SelectGroup>
                            <SelectLabel>
                              Meccanica Meccatronica Energia
                            </SelectLabel>
                            {groupedSections.mech.map((section) => (
                              <SelectItem key={section.id} value={section.id}>
                                {section.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        )}
                      {!isLoadingSections &&
                        groupedSections.elec.length > 0 && (
                          <SelectGroup>
                            <SelectLabel>
                              Elettronica ed Elettrotecnica
                            </SelectLabel>
                            {groupedSections.elec.map((section) => (
                              <SelectItem key={section.id} value={section.id}>
                                {section.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        )}
                      {!isLoadingSections &&
                        groupedSections.chem.length > 0 && (
                          <SelectGroup>
                            <SelectLabel>
                              Chimica Biotecnologie Sanitarie
                            </SelectLabel>
                            {groupedSections.chem.map((section) => (
                              <SelectItem key={section.id} value={section.id}>
                                {section.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        )}
                      {!isLoadingSections &&
                        groupedSections.info.length > 0 && (
                          <SelectGroup>
                            <SelectLabel>
                              Informatica e Telecomunicazioni
                            </SelectLabel>
                            {groupedSections.info.map((section) => (
                              <SelectItem key={section.id} value={section.id}>
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
          </FieldGroup>
          <FieldSeparator className='my-4' />
          <FieldGroup>
            <Controller
              name='email'
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor='registration-form-email'>
                    Email @hensemberger.it
                  </FieldLabel>
                  <Input
                    {...field}
                    id='registration-form-email'
                    aria-invalid={fieldState.invalid}
                    placeholder='rossi.mario@hensemberger.it'
                    autoComplete='off'
                    onBlur={(event) => {
                      field.onBlur()
                      const normalized = normalizeEmail(event.target.value)
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
              name='password'
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor='registration-form-password'>
                    Password
                  </FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      {...field}
                      id='registration-form-password'
                      aria-invalid={fieldState.invalid}
                      placeholder='********'
                      type={showPassword ? 'text' : 'password'}
                      autoComplete='off'
                    />
                    <InputGroupAddon align='inline-end'>
                      <InputGroupButton
                        type='button'
                        aria-label={
                          showPassword ? 'Nascondi password' : 'Mostra password'
                        }
                        aria-pressed={showPassword}
                        onClick={() => setShowPassword((prev) => !prev)}
                      >
                        {showPassword ? (
                          <EyeOff className='size-4' />
                        ) : (
                          <Eye className='size-4' />
                        )}
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name='confirm_password'
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor='registration-form-confirm_password'>
                    Conferma Password
                  </FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      {...field}
                      id='registration-form-confirm_password'
                      aria-invalid={fieldState.invalid}
                      placeholder='********'
                      type={showConfirmPassword ? 'text' : 'password'}
                      autoComplete='off'
                    />
                    <InputGroupAddon align='inline-end'>
                      <InputGroupButton
                        type='button'
                        aria-label={
                          showConfirmPassword
                            ? 'Nascondi password'
                            : 'Mostra password'
                        }
                        aria-pressed={showConfirmPassword}
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                      >
                        {showConfirmPassword ? (
                          <EyeOff className='size-4' />
                        ) : (
                          <Eye className='size-4' />
                        )}
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </FieldGroup>
          <FieldGroup>
            <Controller
              name='privacyAccepted'
              control={form.control}
              render={({ field, fieldState }) => (
                <Field
                  data-invalid={fieldState.invalid}
                  orientation='horizontal'
                  className='items-start gap-2 mt-6'
                >
                  <Checkbox
                    id='registration-form-privacy'
                    checked={field.value}
                    onCheckedChange={(value) => field.onChange(value === true)}
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldContent className='text-left'>
                    <FieldLabel
                      htmlFor='registration-form-privacy'
                      className='text-sm font-normal leading-relaxed'
                    >
                      <span className='inline-flex flex-wrap items-center gap-x-1 gap-y-1'>
                        <span>Accetto l&apos;</span>
                        <Link
                          href='/privacy-policy'
                          target='_blank'
                          className='underline underline-offset-4'
                        >
                          Informativa Privacy
                        </Link>
                        <span>e i</span>
                        <Link
                          href='/terms'
                          target='_blank'
                          className='underline underline-offset-4'
                        >
                          Termini e Condizioni
                        </Link>
                      </span>
                    </FieldLabel>
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </FieldContent>
                </Field>
              )}
            />
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter className='justify-end mt-2'>
        <div className='flex w-full items-center justify-between gap-3 flex-col'>
          <Button
            type='submit'
            form='registration-form'
            disabled={isSubmitting}
            className='sm:w-auto w-full'
          >
            {isSubmitting ? 'Invio...' : 'Registrati'}
          </Button>
          <span />
          <Button asChild variant='ghost'>
            <Link href='/auth/login'>Hai già un account? Accedi</Link>
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
}
