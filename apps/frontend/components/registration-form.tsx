'use client'

import * as React from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import * as z from 'zod'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import {
  Field,
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
      .min(8, 'La conferma della password è obbligatoria')
  })
  .superRefine(({ email }, ctx) => {
    if (!email.toLowerCase().endsWith('@itismonza.it')) {
      ctx.addIssue({
        code: 'custom',
        path: ['email'],
        message: 'Utilizza la tua mail @itismonza.it'
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

type RegistrationFormProps = {
  onSuccess?: () => void
}

export function RegistrationForm({ onSuccess }: RegistrationFormProps) {
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:9999'
  const [showPassword, setShowPassword] = React.useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [isSuccess, setIsSuccess] = React.useState(false)
  const [submitError, setSubmitError] = React.useState<string | null>(null)
  const [sections, setSections] = React.useState<
    Array<{ id: string; name: string }>
  >([])
  const [sectionsError, setSectionsError] = React.useState<string | null>(null)
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
      confirm_password: ''
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
      setSectionsError(null)

      try {
        const response = await fetch(`${apiBaseUrl}/class-sections`)
        if (!response.ok) {
          throw new Error('Impossibile caricare le sezioni.')
        }
        const data = (await response.json()) as Array<{
          id: string
          name: string
        }>
        if (isMounted) {
          setSections(data)
        }
      } catch (error) {
        if (isMounted) {
          setSectionsError(
            error instanceof Error
              ? error.message
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
  }, [apiBaseUrl])

  async function onSubmit(data: z.infer<typeof formSchema>) {
    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const response = await fetch(`${apiBaseUrl}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: data.email,
          firstName: data.first_name,
          lastName: data.last_name,
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
        } catch (error) {
          message = 'Si è verificato un errore, riprova.'
        }

        throw new Error(message)
      }

      form.reset()
      setShowPassword(false)
      setShowConfirmPassword(false)
      setIsSuccess(true)
      onSuccess?.()
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
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
                  {sectionsError && (
                    <p className='text-destructive text-xs mt-1'>
                      {sectionsError}
                    </p>
                  )}
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
                    Email @itismonza.it
                  </FieldLabel>
                  <Input
                    {...field}
                    id='registration-form-email'
                    aria-invalid={fieldState.invalid}
                    placeholder='mario.rossi@itismonza.it'
                    autoComplete='off'
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
        </form>
      </CardContent>
      <CardFooter className='justify-end mt-2'>
        <div className='flex w-full items-center justify-between gap-3 flex-col'>
          <Button
            type='submit'
            form='registration-form'
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Invio...' : 'Registrati'}
          </Button>
          {submitError ? (
            <p className='text-destructive text-sm'>{submitError}</p>
          ) : (
            <span />
          )}
          <Button asChild variant='ghost'>
            <Link href='/auth/login'>Hai già un account? Accedi</Link>
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
}
