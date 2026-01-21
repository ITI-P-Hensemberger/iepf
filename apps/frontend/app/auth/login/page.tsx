'use client'

import * as React from 'react'
import { Suspense } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import * as z from 'zod'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from '@/components/ui/input-group'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Eye, EyeOff } from 'lucide-react'

const formSchema = z.object({
  email: z.email('Indirizzo email non valido'),
  password: z.string().min(1, 'La password è obbligatoria'),
  remember: z.boolean().optional()
})

type LoginFormValues = z.infer<typeof formSchema>

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextParam = searchParams.get('next')
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [submitError, setSubmitError] = React.useState<string | null>(null)
  const [showPassword, setShowPassword] = React.useState(false)
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
        } catch {
          message = 'Accesso non riuscito.'
        }

        throw new Error(message)
      }

      const payload = (await response.json()) as {
        role?: string | null
        isActive?: boolean
      }

      const nextPath =
        nextParam && nextParam.startsWith('/') ? nextParam : null

      if (nextPath) {
        router.push(nextPath)
        return
      }

      if (payload.role === 'admin') {
        if (nextPath && nextPath.startsWith('/admin')) {
          router.push(nextPath)
          return
        }
        router.push('/admin')
        return
      }

      if (payload.role === 'tutor') {
        if (nextPath && nextPath.startsWith('/tutor')) {
          router.push(nextPath)
          return
        }
        router.push(payload.isActive === true ? '/tutor' : '/tutor/pending')
        return
      }

      if (payload.role === 'activator') {
        router.push('/activator')
        return
      }

      if (nextPath && !nextPath.startsWith('/admin')) {
        router.push(nextPath)
        return
      }

      router.push(payload.isActive === true ? '/student' : '/student/pending')
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Accesso non riuscito.'
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
      const response = await fetch('/api/auth/verify-email/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email })
      })

      if (!response.ok) {
        let message = 'Impossibile inviare la verifica.'
        try {
          const payload = (await response.json()) as {
            message?: string
            error?: { issues?: Array<{ message?: string }> }
          }
          message = payload.message ?? payload.error?.issues?.[0]?.message ?? message
        } catch {
          message = 'Impossibile inviare la verifica.'
        }
        throw new Error(message)
      }

      setResendStatus('success')
      setResendMessage(
        'Se l’account esiste, abbiamo inviato una nuova email di verifica.'
      )
    } catch (err) {
      setResendStatus('error')
      setResendMessage(
        err instanceof Error
          ? err.message
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
      const response = await fetch('/api/auth/password/reset/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email })
      })

      if (!response.ok) {
        let message = 'Impossibile inviare il reset della password.'
        try {
          const payload = (await response.json()) as {
            message?: string
            error?: { issues?: Array<{ message?: string }> }
          }
          message = payload.message ?? payload.error?.issues?.[0]?.message ?? message
        } catch {
          message = 'Impossibile inviare il reset della password.'
        }
        throw new Error(message)
      }

      setResetStatus('success')
      setResetMessage(
        'Se l’account esiste, abbiamo inviato un link per il reset.'
      )
    } catch (err) {
      setResetStatus('error')
      setResetMessage(
        err instanceof Error
          ? err.message
          : 'Impossibile inviare il reset della password.'
      )
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
        <div className='mt-6 flex space-x-4'>
          <Button asChild variant='outline'>
            <Link href='/'>Torna alla Home</Link>
          </Button>
        </div>
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
                    <InputGroup>
                      <InputGroupInput
                        id='login-password'
                        type={showPassword ? 'text' : 'password'}
                        autoComplete='current-password'
                        placeholder='********'
                        {...form.register('password')}
                      />
                      <InputGroupAddon align='inline-end'>
                        <InputGroupButton
                          type='button'
                          aria-label={
                            showPassword
                              ? 'Nascondi password'
                              : 'Mostra password'
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
                    {form.formState.errors.password && (
                      <FieldError errors={[form.formState.errors.password]} />
                    )}
                  </Field>
                  <Field orientation='horizontal'>
                    <Controller
                      control={form.control}
                      name='remember'
                      render={({ field }) => (
                        <div className='flex items-center gap-2'>
                          <Checkbox
                            id='login-remember'
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                          <Label
                            htmlFor='login-remember'
                            className='text-sm font-medium'
                          >
                            Ricordami
                          </Label>
                        </div>
                      )}
                    />
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

export default function LoginPage() {
  return (
    <Suspense fallback={<main className='flex-1' />}>
      <LoginContent />
    </Suspense>
  )
}
