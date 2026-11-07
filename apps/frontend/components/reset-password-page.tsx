'use client'

import * as React from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import * as z from 'zod'
import { CircleCheck, CircleX } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { AuthLayout } from '@/components/auth-layout'
import { ResultPanel } from '@/components/result-panel'
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
  const [isSuccess, setIsSuccess] = React.useState(false)
  const [message, setMessage] = React.useState<string | null>(null)
  const [messageTone, setMessageTone] = React.useState<'success' | 'error' | null>(
    null
  )

  const form = useForm<ResetFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      password: '',
      confirm_password: ''
    }
  })

  React.useEffect(() => {
    if (!hasToken) {
      setMessage('Token mancante o non valido.')
      setMessageTone('error')
    }
  }, [hasToken])

  async function onSubmit(values: ResetFormValues) {
    if (!token) {
      setMessage('Token mancante o non valido.')
      setMessageTone('error')
      return
    }

    setIsSubmitting(true)
    setMessage(null)
    setMessageTone(null)

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
        } catch {
          message = 'Reset della password non riuscito.'
        }
        throw new Error(message)
      }

      setIsSuccess(true)
      setMessage('Password aggiornata.')
      setMessageTone('success')
      form.reset()
    } catch (err) {
      setMessage(
        err instanceof Error
          ? err.message
          : 'Reset della password non riuscito.'
      )
      setMessageTone('error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const login = <Button asChild><Link href='/auth/login'>Vai al login</Link></Button>

  return (
    <AuthLayout
      title='Nuova password'
      description={!isSuccess && hasToken ? 'Scegli la nuova password del tuo account.' : undefined}
      backHref='/auth/login'
    >
      {isSuccess ? (
        <ResultPanel icon={CircleCheck} tone='success' title='Password aggiornata' action={login}>
          Ora puoi accedere con la nuova password.
        </ResultPanel>
      ) : !hasToken ? (
        <ResultPanel icon={CircleX} tone='error' title='Link non valido' action={login}>
          Il link è incompleto o scaduto. Chiedine uno nuovo dalla pagina di accesso.
        </ResultPanel>
      ) : (
        <Card>
          <CardContent className='pt-6'>
            {message && messageTone === 'error' && (
              <div className='mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive'>
                {message}
              </div>
            )}
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
          </form>
          </CardContent>
          <CardFooter>
            <Button type='submit' form='reset-password-form' className='w-full' disabled={isSubmitting}>
              {isSubmitting ? 'Aggiornamento...' : 'Aggiorna password'}
            </Button>
          </CardFooter>
        </Card>
      )}
    </AuthLayout>
  )
}
