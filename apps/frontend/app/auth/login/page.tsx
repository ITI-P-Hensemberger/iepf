'use client'

import * as React from 'react'
import { Suspense } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import * as z from 'zod'
import { toast } from 'sonner'
import Link from 'next/link'
import { useMutation } from '@tanstack/react-query'
import { useRouter, useSearchParams } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { startLoginSession } from '@/lib/announcement-dismissals'
import { notifyAuthChanged } from '@/lib/auth-events'
import { safeInternalPath } from '@/lib/safe-redirect'
import { apiFetch, jsonBody } from '@/lib/api-fetch'
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

// Where a login lands: the page asked for, when the role may open it, or the role's home.
function destinationAfterLogin(result: { role?: string | null, isActive?: boolean }, nextPath: string | null) {
  if (result.role === 'admin') {
    return nextPath && nextPath.startsWith('/admin') ? nextPath : '/admin'
  }
  if (result.role === 'tutor') {
    if (nextPath && nextPath.startsWith('/tutor')) return nextPath
    return result.isActive === true ? '/tutor' : '/tutor/pending'
  }
  if (result.role === 'activator') return '/activator'
  if (nextPath && !nextPath.startsWith('/admin')) return nextPath
  return result.isActive === true ? '/student' : '/student/pending'
}

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextParam = searchParams.get('next')
  const [showPassword, setShowPassword] = React.useState(false)

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      password: '',
      remember: false
    }
  })

  // An unverified email is an answer, not an error: it shows the button to send the email again.
  const login = useMutation({
    mutationFn: async (values: LoginFormValues) => {
      const response = await fetch('/api/auth/login', jsonBody('POST', {
        email: values.email,
        password: values.password,
        remember: values.remember
      })).catch(() => {
        throw new Error('Accesso non riuscito.')
      })
      if (response.status === 403) return { unverified: true as const }
      const payload = (await response.json().catch(() => null)) as { message?: string, role?: string | null, isActive?: boolean } | null
      if (!response.ok) throw new Error(payload?.message || 'Accesso non riuscito.')
      return { unverified: false as const, role: payload?.role, isActive: payload?.isActive }
    },
    onSuccess: (result) => {
      if (result.unverified) {
        toast.error(
          "Email non verificata. Controlla la tua casella email o invia un'altra email di verifica."
        )
        return
      }
      startLoginSession(window.localStorage)
      notifyAuthChanged()
      router.push(destinationAfterLogin(result, safeInternalPath(nextParam)))
    }
  })
  // Stays on while the next page opens, so the button cannot be pressed twice.
  const isSubmitting = login.isPending || (login.isSuccess && !login.data.unverified)
  const needsVerification = login.data?.unverified === true

  const resend = useMutation({
    mutationFn: (email: string) => apiFetch('/api/auth/verify-email/request', 'Impossibile inviare la verifica.', jsonBody('POST', { email })),
    onSuccess: () => toast.success('Se l’account esiste, abbiamo inviato una nuova email di verifica.')
  })
  const resetRequest = useMutation({
    mutationFn: (email: string) => apiFetch('/api/auth/password/reset/request', 'Impossibile inviare il reset della password.', jsonBody('POST', { email })),
    onSuccess: () => toast.success('Se l’account esiste, abbiamo inviato un link per il reset.')
  })

  function onSubmit(values: LoginFormValues) {
    resend.reset()
    resetRequest.reset()
    login.mutate(values)
  }

  function handleResendVerification() {
    const email = form.getValues('email')
    if (!email) {
      toast.error('Inserisci la tua email per ricevere la verifica.')
      return
    }
    resend.mutate(email)
  }

  function handlePasswordReset() {
    const email = form.getValues('email')
    if (!email) {
      toast.error('Inserisci la tua email per recuperare la password.')
      return
    }
    resetRequest.mutate(email)
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
                      disabled={resend.isPending}
                      onClick={handleResendVerification}
                    >
                      {resend.isPending
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
                disabled={resetRequest.isPending}
                onClick={handlePasswordReset}
              >
                {resetRequest.isPending
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
