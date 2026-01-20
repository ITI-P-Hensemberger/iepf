'use client'

import * as React from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import * as z from 'zod'
import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'

const formSchema = z
  .object({
    password: z
      .string()
      .min(8, 'La password deve contenere almeno 8 caratteri'),
    confirm_password: z
      .string()
      .min(8, 'La conferma della password è obbligatoria')
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

type ResetFormValues = z.infer<typeof formSchema>

export default function ResetPasswordPage() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const hasToken = Boolean(token)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [submitError, setSubmitError] = React.useState<string | null>(null)
  const [isSuccess, setIsSuccess] = React.useState(false)

  const form = useForm<ResetFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      password: '',
      confirm_password: ''
    }
  })

  React.useEffect(() => {
    if (!hasToken) {
      setSubmitError('Token mancante o non valido.')
    }
  }, [hasToken])

  async function onSubmit(values: ResetFormValues) {
    if (!token) {
      setSubmitError('Token mancante o non valido.')
      return
    }

    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const response = await fetch('/api/auth/password/reset/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ token, password: values.password })
      })

      if (!response.ok) {
        let message = 'Reset della password non riuscito.'
        try {
          const payload = (await response.json()) as { message?: string }
          message = payload.message ?? message
        } catch (error) {
          message = 'Reset della password non riuscito.'
        }
        throw new Error(message)
      }

      setIsSuccess(true)
      form.reset()
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : 'Reset della password non riuscito.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10 flex flex-col items-center'>
        <Image
          src='/logo.png'
          alt='IEPF Logo'
          width={125}
          height={125}
          style={{ width: 'auto', height: 'auto' }}
          draggable={false}
          priority
        />
        <h1 className='mt-6 text-2xl'>Reset password</h1>
        <div className='w-full max-w-md mt-6'>
          <Card>
            <CardContent className='pt-6'>
              {isSuccess ? (
                <div className='text-center space-y-2'>
                  <p className='text-sm font-medium'>
                    Password aggiornata con successo.
                  </p>
                  <p className='text-sm text-muted-foreground'>
                    Ora puoi accedere con la nuova password.
                  </p>
                </div>
              ) : !hasToken ? (
                <div className='text-center space-y-2'>
                  <p className='text-sm font-medium text-destructive'>
                    Token non valido.
                  </p>
                  <p className='text-sm text-muted-foreground'>
                    Richiedi un nuovo link di reset dalla pagina di login.
                  </p>
                </div>
              ) : (
                <form
                  id='reset-password-form'
                  onSubmit={form.handleSubmit(onSubmit)}
                  className='space-y-6'
                >
                  <FieldGroup>
                    <Field data-invalid={!!form.formState.errors.password}>
                      <FieldLabel htmlFor='reset-password'>
                        Nuova password
                      </FieldLabel>
                      <Input
                        id='reset-password'
                        type='password'
                        autoComplete='new-password'
                        placeholder='********'
                        {...form.register('password')}
                      />
                      {form.formState.errors.password && (
                        <FieldError errors={[form.formState.errors.password]} />
                      )}
                    </Field>
                    <Field
                      data-invalid={!!form.formState.errors.confirm_password}
                    >
                      <FieldLabel htmlFor='reset-password-confirm'>
                        Conferma password
                      </FieldLabel>
                      <Input
                        id='reset-password-confirm'
                        type='password'
                        autoComplete='new-password'
                        placeholder='********'
                        {...form.register('confirm_password')}
                      />
                      {form.formState.errors.confirm_password && (
                        <FieldError
                          errors={[form.formState.errors.confirm_password]}
                        />
                      )}
                    </Field>
                  </FieldGroup>
                  {submitError && (
                    <p className='text-sm text-destructive'>{submitError}</p>
                  )}
                </form>
              )}
            </CardContent>
            <CardFooter className='flex flex-col gap-3'>
              {!isSuccess && hasToken ? (
                <Button
                  type='submit'
                  form='reset-password-form'
                  className='w-full'
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Aggiornamento...' : 'Aggiorna password'}
                </Button>
              ) : (
                <Button asChild>
                  <Link href='/auth/login'>Vai al login</Link>
                </Button>
              )}
            </CardFooter>
          </Card>
        </div>
      </div>
    </main>
  )
}
