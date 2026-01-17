'use client'

import * as React from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import * as z from 'zod'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'

const formSchema = z.object({
  email: z.email('Indirizzo email non valido'),
  password: z.string().min(1, 'La password è obbligatoria'),
  remember: z.boolean().optional()
})

type LoginFormValues = z.infer<typeof formSchema>

export default function LoginPage() {
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:9999'
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [submitError, setSubmitError] = React.useState<string | null>(null)
  const [needsVerification, setNeedsVerification] = React.useState(false)
  const [resendStatus, setResendStatus] = React.useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [resendMessage, setResendMessage] = React.useState<string | null>(null)
  const [resetStatus, setResetStatus] = React.useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [resetMessage, setResetMessage] = React.useState<string | null>(null)

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      password: '',
      remember: false
    }
  })

  async function onSubmit(values: LoginFormValues) {
    setIsSubmitting(true)
    setSubmitError(null)
    setNeedsVerification(false)
    setResendStatus('idle')
    setResendMessage(null)
    setResetStatus('idle')
    setResetMessage(null)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: values.email,
          password: values.password,
          remember: values.remember
        })
      })

      if (!response.ok) {
        if (response.status === 403) {
          setNeedsVerification(true)
          setSubmitError(
            "Email non verificata. Controlla la tua casella email o invia un'altra email di verifica."
          )
          return
        }
        let message = 'Accesso non riuscito.'

        try {
          const payload = (await response.json()) as { message?: string }
          message = payload.message ?? message
        } catch (error) {
          message = 'Accesso non riuscito.'
        }

        throw new Error(message)
      }

      const payload = (await response.json()) as {
        role?: string | null
        isActive?: boolean
      }

      if (payload.role === 'admin') {
        router.push('/admin')
        return
      }

      router.push(payload.isActive === true ? '/dashboard' : '/pending')
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Accesso non riuscito.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleResendVerification() {
    const email = form.getValues('email')
    if (!email) {
      setResendStatus('error')
      setResendMessage('Inserisci la tua email per ricevere la verifica.')
      return
    }

    setResendStatus('loading')
    setResendMessage(null)

    try {
      const response = await fetch(`${apiBaseUrl}/auth/verify-email/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email })
      })

      if (!response.ok) {
        let message = 'Impossibile inviare la verifica.'
        try {
          const payload = (await response.json()) as { message?: string }
          message = payload.message ?? message
        } catch (error) {
          message = 'Impossibile inviare la verifica.'
        }
        throw new Error(message)
      }

      setResendStatus('success')
      setResendMessage(
        'Se l’account esiste, abbiamo inviato una nuova email di verifica.'
      )
    } catch (error) {
      setResendStatus('error')
      setResendMessage(
        error instanceof Error
          ? error.message
          : 'Impossibile inviare la verifica.'
      )
    }
  }

  async function handlePasswordReset() {
    const email = form.getValues('email')
    if (!email) {
      setResetStatus('error')
      setResetMessage('Inserisci la tua email per recuperare la password.')
      return
    }

    setResetStatus('loading')
    setResetMessage(null)

    try {
      const response = await fetch(
        `${apiBaseUrl}/auth/password/reset/request`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ email })
        }
      )

      if (!response.ok) {
        let message = 'Impossibile inviare il reset della password.'
        try {
          const payload = (await response.json()) as { message?: string }
          message = payload.message ?? message
        } catch (error) {
          message = 'Impossibile inviare il reset della password.'
        }
        throw new Error(message)
      }

      setResetStatus('success')
      setResetMessage(
        'Se l’account esiste, abbiamo inviato un link per il reset.'
      )
    } catch (error) {
      setResetStatus('error')
      setResetMessage(
        error instanceof Error
          ? error.message
          : 'Impossibile inviare il reset della password.'
      )
    }
  }

  return (
    <main className='min-h-screen flex items-center'>
      <div className='container mx-auto px-4 py-8 flex flex-col items-center'>
        <Image
          src='/logo.png'
          alt='IEPF Logo'
          width={180}
          height={37}
          style={{ width: 'auto', height: 'auto' }}
          draggable={false}
          priority
        />
        <h1 className='mt-6 text-2xl'>Accesso</h1>
        <p className='mt-2 text-center max-w-md'>
          Inserisci le tue credenziali per accedere al tuo account.
        </p>
        <div className='w-full max-w-md mt-6'>
          <Card>
            <CardContent className='pt-6'>
              <form
                id='login-form'
                onSubmit={form.handleSubmit(onSubmit)}
                className='space-y-6'
              >
                <FieldGroup>
                  <Field data-invalid={!!form.formState.errors.email}>
                    <FieldLabel htmlFor='login-email'>Email</FieldLabel>
                    <Input
                      id='login-email'
                      type='email'
                      autoComplete='email'
                      placeholder='nome.cognome@itismonza.it'
                      {...form.register('email')}
                    />
                    {form.formState.errors.email && (
                      <FieldError errors={[form.formState.errors.email]} />
                    )}
                  </Field>
                  <Field data-invalid={!!form.formState.errors.password}>
                    <FieldLabel htmlFor='login-password'>Password</FieldLabel>
                    <Input
                      id='login-password'
                      type='password'
                      autoComplete='current-password'
                      placeholder='********'
                      {...form.register('password')}
                    />
                    {form.formState.errors.password && (
                      <FieldError errors={[form.formState.errors.password]} />
                    )}
                  </Field>
                  <Field orientation='horizontal'>
                    <div className='flex items-center gap-2'>
                      <input
                        id='login-remember'
                        type='checkbox'
                        className='border-input text-primary focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] h-4 w-4 rounded-sm border bg-transparent'
                        {...form.register('remember')}
                      />
                      <label
                        htmlFor='login-remember'
                        className='text-sm font-medium'
                      >
                        Ricordami
                      </label>
                    </div>
                  </Field>
                </FieldGroup>
                {submitError && (
                  <p className='text-sm text-destructive'>{submitError}</p>
                )}
                {resetMessage && (
                  <p
                    className={
                      resetStatus === 'success'
                        ? 'text-sm text-emerald-600'
                        : 'text-sm text-destructive'
                    }
                  >
                    {resetMessage}
                  </p>
                )}
                {needsVerification && (
                  <div className='space-y-2'>
                    {resendMessage && (
                      <p
                        className={
                          resendStatus === 'success'
                            ? 'text-sm text-emerald-600'
                            : 'text-sm text-destructive'
                        }
                      >
                        {resendMessage}
                      </p>
                    )}
                    <Button
                      type='button'
                      variant='outline'
                      className='w-full'
                      disabled={resendStatus === 'loading'}
                      onClick={handleResendVerification}
                    >
                      {resendStatus === 'loading'
                        ? 'Invio in corso...'
                        : 'Invia email di verifica'}
                    </Button>
                  </div>
                )}
              </form>
            </CardContent>
            <CardFooter className='flex flex-col gap-3'>
              <Button
                type='submit'
                form='login-form'
                className='w-full'
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Accesso in corso...' : 'Accedi'}
              </Button>
              <Button
                type='button'
                variant='link'
                className='p-0 h-auto'
                disabled={resetStatus === 'loading'}
                onClick={handlePasswordReset}
              >
                {resetStatus === 'loading'
                  ? 'Invio in corso...'
                  : 'Hai dimenticato la password?'}
              </Button>
              <Button asChild variant='ghost'>
                <Link href='/auth/sign-up'>Non hai un account? Registrati</Link>
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </main>
  )
}
