'use client'

import { CircleCheck } from 'lucide-react'
import { ResultPanel } from '@/components/result-panel'
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
import { Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'

function normalizeName(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase()
}

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
  .superRefine(({ password, confirm_password }, ctx) => {
    if (password !== confirm_password) {
      ctx.addIssue({
        code: 'custom',
        path: ['confirm_password'],
        message: 'Le password non corrispondono'
      })
    }
  })

type AdminRegistrationFormProps = {
  token: string
  onSuccess?: () => void
}

export function AdminRegistrationForm({
  token,
  onSuccess
}: AdminRegistrationFormProps) {
  const [showPassword, setShowPassword] = React.useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [isSuccess, setIsSuccess] = React.useState(false)

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      password: '',
      confirm_password: '',
      privacyAccepted: false
    }
  })


  async function onSubmit(data: z.infer<typeof formSchema>) {
    setIsSubmitting(true)

    try {
      const normalizedFirstName = normalizeName(data.first_name)
      const normalizedLastName = normalizeName(data.last_name)

      const response = await fetch('/api/auth/admin-invite/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          token,
          firstName: normalizedFirstName,
          lastName: normalizedLastName,
          password: data.password
        })
      })

      if (!response.ok) {
        if (response.status == 401) {
          throw new Error('Token scaduto o già utilizzato.')
        }
        const payload = (await response.json()) as { message?: string }
        throw new Error(payload.message || 'Registrazione fallita.')
      }

      form.reset()
      setIsSuccess(true)
      onSuccess?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Registrazione fallita.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isSuccess) {
    return (
      <ResultPanel
        icon={CircleCheck}
        tone='success'
        title='Registrazione completata'
        action={<Button asChild><Link href='/auth/login'>Vai al login</Link></Button>}
      >
        Il tuo account admin è stato creato. Ora puoi accedere.
      </ResultPanel>
    )
  }

  return (
    <Card className='w-full sm:max-w-md'>
      <CardContent>
        <form id='admin-registration-form' onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup>
            <Controller
              name='first_name'
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor='admin-registration-form-first_name'>
                    Nome
                  </FieldLabel>
                  <Input
                    {...field}
                    id='admin-registration-form-first_name'
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
                    disabled={isSubmitting}
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
                  <FieldLabel htmlFor='admin-registration-form-last_name'>
                    Cognome
                  </FieldLabel>
                  <Input
                    {...field}
                    id='admin-registration-form-last_name'
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
                    disabled={isSubmitting}
                  />
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
              name='password'
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor='admin-registration-form-password'>
                    Password
                  </FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      {...field}
                      id='admin-registration-form-password'
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
                  <FieldLabel htmlFor='admin-registration-form-confirm_password'>
                    Conferma Password
                  </FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      {...field}
                      id='admin-registration-form-confirm_password'
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
                    id='admin-registration-form-privacy'
                    checked={field.value}
                    onCheckedChange={(value) => field.onChange(value === true)}
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldContent className='text-left'>
                    <FieldLabel
                      htmlFor='admin-registration-form-privacy'
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
            form='admin-registration-form'
            disabled={isSubmitting}
            className='sm:w-auto w-full'
          >
            {isSubmitting ? 'Invio...' : 'Completa registrazione'}
          </Button>
          <span />
        </div>
      </CardFooter>
    </Card>
  )
}
