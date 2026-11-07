'use client'

import * as React from 'react'
import { Suspense } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import * as z from 'zod'
import { toast } from 'sonner'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { startLoginSession } from '@/lib/announcement-dismissals'
import { notifyAuthChanged } from '@/lib/auth-events'
import { safeInternalPath } from '@/lib/safe-redirect'
import { AuthLayout } from '@/components/auth-layout'
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
  const [showPassword, setShowPassword] = React.useState(false)
  const [needsVerification, setNeedsVerification] = React.useState(false)
  const [resendStatus, setResendStatus] = React.useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [resetStatus, setResetStatus] = React.useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')

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
    setNeedsVerification(false)
    setResendStatus('idle')
    setResetStatus('idle')

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
          toast.error(
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

      startLoginSession(window.localStorage)
      notifyAuthChanged()

      const nextPath = safeInternalPath(nextParam)

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
      toast.error(err instanceof Error ? err.message : 'Accesso non riuscito.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleResendVerification() {
    const email = form.getValues('email')
    if (!email) {
      setResendStatus('error')
      toast.error('Inserisci la tua email per ricevere la verifica.')
      return
    }

    setResendStatus('loading')

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
          message =
            payload.message ?? payload.error?.issues?.[0]?.message ?? message
        } catch {
          message = 'Impossibile inviare la verifica.'
        }
        throw new Error(message)
      }

      setResendStatus('success')
      toast.success(
        'Se l’account esiste, abbiamo inviato una nuova email di verifica.'
      )
    } catch (err) {
      setResendStatus('error')
      toast.error(
        err instanceof Error ? err.message : 'Impossibile inviare la verifica.'
      )
    }
  }

  async function handlePasswordReset() {
    const email = form.getValues('email')
    if (!email) {
      setResetStatus('error')
      toast.error('Inserisci la tua email per recuperare la password.')
      return
    }

    setResetStatus('loading')

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
          message =
            payload.message ?? payload.error?.issues?.[0]?.message ?? message
        } catch {
          message = 'Impossibile inviare il reset della password.'
        }
        throw new Error(message)
      }

      setResetStatus('success')
      toast.success(
        'Se l’account esiste, abbiamo inviato un link per il reset.'
      )
    } catch (err) {
      setResetStatus('error')
      toast.error(
        err instanceof Error
          ? err.message
          : 'Impossibile inviare il reset della password.'
      )
    }
  }

  return (
    <AuthLayout
      title='Accedi'
      description='Inserisci le tue credenziali per entrare nel tuo account.'
      footer={(
        <p>
          Non hai un account?{' '}
          <Link href='/auth/sign-up' className='font-medium text-foreground underline underline-offset-4'>Registrati</Link>
        </p>
      )}
    >
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
                      placeholder='cognome.nome@hensemberger.it'
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
                {needsVerification && (
                  <div className='space-y-2'>
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
            </CardFooter>
          </Card>
    </AuthLayout>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className='flex-1' />}>
      <LoginContent />
    </Suspense>
  )
}
